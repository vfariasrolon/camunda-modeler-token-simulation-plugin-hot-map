import { is } from 'bpmn-js/lib/util/ModelUtil';

// --- Helper Functions ---

const getExtensionProperty = (element, name) => {
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

    // Handle exclusive gateways with branching probability
    if (is(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
      const rand = Math.random();
      let cumulativeProbability = 0;
      for (const flow of element.outgoing) {
        const data = getSimulationData(flow);
        const probability = data ? data.branchingProbability : (1 / element.outgoing.length);
        cumulativeProbability += probability;
        if (rand <= cumulativeProbability) {
          return flow.target;
        }
      }
      return element.outgoing[element.outgoing.length-1].target; // fallback
    }

    // Default: take the first outgoing path
    return element.outgoing[0].target;
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
      // We could add cycle time to the process root element as well
      return;
    }

    const nextElement = this.findNextElement(element);

    if (!nextElement) {
        // This is an end event or a dead end
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

        // Handle resources
        if (data.resources && this.resourcePools.has(data.resources.pool)) {
            const pool = this.resourcePools.get(data.resources.pool);
            if (!pool.request(taskEvent)) {
                // Resource not available, task is queued. Update wait time.
                const waitStart = this.clock;
                // a bit of a hack: store wait time start on the event
                taskEvent.waitStart = waitStart;
            } else {
                this.eventQueue.add(taskEvent);
            }
        } else {
            this.eventQueue.add(taskEvent);
        }

    } else if (is(nextElement, 'bpmn:Gateway') || is(nextElement, 'bpmn:IntermediateCatchEvent') || is(nextElement, 'bpmn:StartEvent') || is(nextElement, 'bpmn:EndEvent')) {
        // Gateways, events are considered to have zero processing time
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
    } else {
        // Unrecognized elements also have zero processing time
        if (nextElement.id) {
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

    // Schedule first arrival
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

          // Release resource and check if a waiting task can start
          if (getSimulationData(event.element)?.resources) {
              const pool = this.resourcePools.get(getSimulationData(event.element).resources.pool);
              const nextTaskToStart = pool.release();
              if (nextTaskToStart) {
                  // A waiting task can now start
                  const waitEnd = this.clock;
                  const waitStart = nextTaskToStart.waitStart || waitEnd; // fallback
                  const waitingTime = waitEnd - waitStart;
                  this.results.get(nextTaskToStart.element.id).totalWaitTime += waitingTime;

                  nextTaskToStart.time = this.clock + nextTaskToStart.processingTime;
                  delete nextTaskToStart.waitStart; // clean up
                  this.eventQueue.add(nextTaskToStart);
              }
          }
      }

      this.processEvent(event);

      if (this.completedInstances >= runValue) {
        break;
      }

      // Schedule next arrival if the current event is a start event
      if (is(event.element, 'bpmn:StartEvent') && (instanceCounter < runValue)) {
        instanceCounter++;
        const nextArrivalTime = event.time + arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
      }
    }

    console.log("Simulation finished.");
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry', 'bpmnjs'];
