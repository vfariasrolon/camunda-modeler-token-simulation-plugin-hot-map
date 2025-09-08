import { is } from 'bpmn-js/lib/util/ModelUtil';

// --- Helper Functions ---

const getExtensionProperty = (element, name) => {
  if (!element || !element.businessObject) return null;
  const businessObject = element.businessObject;
  if (!businessObject.extensionElements || !businessObject.extensionElements.values) {
    return null;
  }
  const properties = businessObject.extensionElements.values.find(v => is(v, 'camunda:Properties'));
  if (!properties || !properties.values) {
    return null;
  }
  const property = properties.values.find(p => p.name === name);
  return property ? property.value : null;
};

const getSimulationData = (element) => {
  const dataString = getExtensionProperty(element, 'simulationData');
  if (!dataString) return null;
  try {
    return JSON.parse(dataString);
  } catch (e) {
    console.error(`Error parsing simulationData for element ${element.id}`, e);
    return null;
  }
};

const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  if (rand < F) {
    return min + Math.sqrt(rand * (mode - min) * (max - min));
  } else {
    return max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
  }
};

const minutesToMilliseconds = (minutes) => minutes * 60 * 1000;


// --- Core Classes ---

class EventQueue {
  constructor() { this.items = []; }
  add(event) { this.items.push(event); this.items.sort((a, b) => a.time - b.time); }
  next() { return this.items.shift(); }
  isEmpty() { return this.items.length === 0; }
}

class ResourcePool {
  constructor(config) {
    this.name = config.name;
    this.available = config.quantity;
    this.queue = [];
  }

  request(task) {
    if (this.available > 0) {
      this.available--;
      return true; // Resource granted
    } else {
      this.queue.push(task);
      return false; // Resource denied, task is queued
    }
  }

  release() {
    this.available++;
    if (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      this.available--; // Immediately grant to the next waiting task
      return nextTask; // Return the task that should be started now
    }
    return null; // No tasks waiting
  }
}


// --- Main Simulation Engine ---

export default class SimulationEngine {
  constructor(elementRegistry, bpmnjs) {
    this._elementRegistry = elementRegistry;
    this._bpmnjs = bpmnjs;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.clock = 0;
    this.completedInstances = 0;
  }

  initialize() {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0,
        failureCount: 0, // new metric
        totalWaitTime: 0,
        totalProcessingTime: 0,
        totalCost: 0,
        totalCycleTime: 0,
        name: element.businessObject.name || element.id
      });
    });
  }

  findNextElement(element) {
    if (!element.outgoing || element.outgoing.length === 0) {
      return null;
    }

    let chosenFlow = null;

    if (is(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
      const rand = Math.random();
      let cumulativeProbability = 0;
      for (const flow of element.outgoing) {
        const data = getSimulationData(flow);
        const probability = data ? data.branchingProbability : (1 / element.outgoing.length);
        cumulativeProbability += probability;
        if (rand <= cumulativeProbability) {
          chosenFlow = flow;
          break;
        }
      }
      if (!chosenFlow) {
        chosenFlow = element.outgoing[element.outgoing.length - 1]; // fallback
      }
    } else {
        chosenFlow = element.outgoing[0];
    }

    if (chosenFlow) {
        const flowResults = this.results.get(chosenFlow.id);
        if (flowResults) {
            flowResults.executionCount++;
        }
        return chosenFlow.target;
    }

    return null;
  }

  processEvent(event) {
    const { type, element, instanceId, startTime } = event;
    const elementResults = this.results.get(element.id);

    elementResults.executionCount++;
    this.clock = event.time;

    if (type === 'INSTANCE_COMPLETE') {
      this.completedInstances++;
      const instanceCycleTime = this.clock - startTime;
      elementResults.totalCycleTime += instanceCycleTime;
      return;
    }

    const nextElement = this.findNextElement(element);

    if (!nextElement) {
        this.eventQueue.add({ type: 'INSTANCE_COMPLETE', element, time: this.clock, instanceId, startTime });
        return;
    }

    const data = getSimulationData(nextElement);

    if (is(nextElement, 'bpmn:Task') && data) {
        let processingTime = 0;
        if (data.processingTime.distribution === 'fixed') {
            processingTime = minutesToMilliseconds(data.processingTime.value);
        } else if (data.processingTime.distribution === 'triangular') {
            processingTime = minutesToMilliseconds(triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max));
        }

        // Handle failures and rework
        if (data.failureRate && Math.random() < data.failureRate) {
            const reworkTime = data.reworkTime ? minutesToMilliseconds(data.reworkTime.value) : 0;
            processingTime += reworkTime;
            this.results.get(nextElement.id).failureCount++;
        }

        const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;

        const taskEvent = {
            type: 'TASK_COMPLETE',
            element: nextElement,
            time: this.clock + processingTime,
            instanceId,
            startTime,
            processingTime,
            cost
        };

        if (data.resources && this.resourcePools.has(data.resources.pool)) {
            const pool = this.resourcePools.get(data.resources.pool);
            if (!pool.request(taskEvent)) {
                taskEvent.waitStart = this.clock;
            } else {
                this.eventQueue.add(taskEvent);
            }
        } else {
            this.eventQueue.add(taskEvent);
        }

    } else if (is(nextElement, 'bpmn:Gateway') || is(nextElement, 'bpmn:IntermediateCatchEvent') || is(nextElement, 'bpmn:StartEvent') || is(nextElement, 'bpmn:EndEvent')) {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
    } else {
        if (nextElement && nextElement.id) {
            this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
        }
    }
  }

  run() {
    this.initialize();

    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process')) || this._elementRegistry.find(el => is(el, 'bpmn:Participant'));
    const configData = getSimulationData(processRoot);
    const { runValue, resourcePools } = configData || { runValue: 100, resourcePools: [] };

    if (resourcePools) {
        resourcePools.forEach(poolConfig => {
            this.resourcePools.set(poolConfig.name, new ResourcePool(poolConfig));
        });
    }

    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) {
      console.error("No start event found.");
      return this.results;
    }
    const arrivalData = getSimulationData(startEvent);
    const arrivalInterval = arrivalData ? minutesToMilliseconds(arrivalData.arrivalRate.value) : 600000;

    console.log("--- Simulation Starting ---");
    console.log("Configuration:", configData);
    console.log("Start Event Arrival:", arrivalData);

    this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId: 1, startTime: 0 });

    let instanceCounter = 1;

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();

      if (event.type === 'TASK_COMPLETE') {
          const elementResults = this.results.get(event.element.id);
          elementResults.totalProcessingTime += event.processingTime;
          elementResults.totalCost += event.cost;

          if (event.waitStart) {
              elementResults.totalWaitTime += (this.clock - event.waitStart);
          }

          if (getSimulationData(event.element)?.resources) {
              const pool = this.resourcePools.get(getSimulationData(event.element).resources.pool);
              const nextTaskToStart = pool.release();
              if (nextTaskToStart) {
                  const waitEnd = this.clock;
                  const waitStart = nextTaskToStart.waitStart || waitEnd;
                  const waitingTime = waitEnd - waitStart;
                  this.results.get(nextTaskToStart.element.id).totalWaitTime += waitingTime;

                  nextTaskToStart.time = this.clock + nextTaskToStart.processingTime;
                  delete nextTaskToStart.waitStart;
                  this.eventQueue.add(nextTaskToStart);
              }
          }
      }

      this.processEvent(event);

      if (this.completedInstances >= runValue) {
        break;
      }

      if (is(event.element, 'bpmn:StartEvent') && (instanceCounter < runValue)) {
        instanceCounter++;
        const nextArrivalTime = event.time + arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
      }
    }

    console.log("--- Simulation Finished ---");
    console.log("Final Results (raw data):");
    console.table(Object.fromEntries(this.results));

    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry', 'bpmnjs'];
