import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';
import WorkCalendar from './WorkCalendar.js';

const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  return rand < F ? min + Math.sqrt(rand * (mode - min) * (max - min)) : max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
};

const timeToMilliseconds = (value, unit) => {
  if (unit === 'seconds') return value * 1000;
  if (unit === 'minutes') return value * 60 * 1000;
  if (unit === 'hours') return value * 60 * 60 * 1000;
  return value; // Default to milliseconds
};

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
  request(quantity, task) {
    if (this.available >= quantity) {
      this.available -= quantity;
      return true;
    }
    this.queue.push({ quantity, task });
    return false;
  }
  release(quantity) {
    this.available += quantity;
    const newTasks = [];
    this.queue = this.queue.filter(waiting => {
      if (this.available >= waiting.quantity) {
        this.available -= waiting.quantity;
        newTasks.push(waiting.task);
        return false; // remove from queue
      }
      return true; // keep in queue
    });
    return newTasks;
  }
}

export default class SimulationEngine {
  constructor(elementRegistry) {
    this._elementRegistry = elementRegistry;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.clock = 0;
    this.completedInstances = 0;
    this.workCalendar = null;
    this.progressSnapshots = [];
    this.rootElementId = null;
  }

  initialize() {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.workCalendar = null;
    this.progressSnapshots = [];
    this.rootElementId = null;
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        name: element.businessObject.name || element.id
      });
    });
  }

  findNextElements(element) {
    if (!element.outgoing || element.outgoing.length === 0) {
      return [];
    }
    if (is(element, 'bpmn:ParallelGateway')) {
      return element.outgoing.map(flow => {
        const flowResults = this.results.get(flow.id);
        if (flowResults) flowResults.executionCount++;
        return { element: flow.target, connection: flow };
      });
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
      if (!chosenFlow) chosenFlow = element.outgoing[element.outgoing.length - 1];
    } else {
      chosenFlow = element.outgoing[0];
    }

    if (chosenFlow) {
      const flowResults = this.results.get(chosenFlow.id);
      if (flowResults) flowResults.executionCount++;
      return [{ element: chosenFlow.target, connection: chosenFlow }];
    }
    return [];
  }

  processEvent(event) {
    const { type, element, instanceId, startTime } = event;
    const elementResults = this.results.get(element.id);
    elementResults.executionCount++;
    this.clock = event.time;

    if (type === 'INSTANCE_COMPLETE') {
      this.completedInstances++;
      this.progressSnapshots.push([new Date(this.clock.getTime ? this.clock.getTime() : this.clock), this.completedInstances]);
      const cycleTime = this.workCalendar
        ? (this.clock.getTime() - startTime.getTime())
        : (this.clock - startTime);
      elementResults.totalCycleTime += cycleTime;
      this.instanceStates.delete(instanceId);
      return;
    }

    const nextElements = this.findNextElements(element);

    if (nextElements.length === 0) {
      this.eventQueue.add({ type: 'INSTANCE_COMPLETE', element, time: this.clock, instanceId, startTime });
      return;
    }

    nextElements.forEach(({ element: nextElement, connection: nextConnection }) => {
      const data = getSimulationData(nextElement);

      if (is(nextElement, 'bpmn:ParallelGateway') && nextElement.incoming.length > 1) {
        const instanceState = this.instanceStates.get(instanceId);
        const gatewayState = instanceState.gateways[nextElement.id] || (instanceState.gateways[nextElement.id] = { arrived: new Set() });
        gatewayState.arrived.add(nextConnection.id);
        if (gatewayState.arrived.size === nextElement.incoming.length) {
          this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
        }
      } else if (is(nextElement, 'bpmn:Task') && data) {
        this.scheduleTask({ type: 'TASK_START', element: nextElement, time: this.clock, instanceId, startTime });
      } else {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
      }
    });
  }

  scheduleTask(taskEvent) {
    const { element, time, instanceId, startTime } = taskEvent;
    const data = getSimulationData(element);
    let processingTime = 0;
    if (data.processingTime.distribution === 'fixed') {
      processingTime = timeToMilliseconds(data.processingTime.value, data.processingTime.unit);
    } else if (data.processingTime.distribution === 'triangular') {
      const randomValue = triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max);
      processingTime = timeToMilliseconds(randomValue, data.processingTime.unit);
    }
    if (data.failureRate && Math.random() < data.failureRate) {
      const reworkTime = data.reworkTime ? timeToMilliseconds(data.reworkTime.value, data.reworkTime.unit) : 0;
      processingTime += reworkTime;
      this.results.get(element.id).failureCount++;
    }

    let completionTime, overtimeMs = 0;
    if (this.workCalendar) {
      const calc = this.workCalendar.addWorkTime(time, processingTime);
      completionTime = calc.finalDate;
      overtimeMs = calc.overtimeMs;
    } else {
      completionTime = time + processingTime;
    }

    if (overtimeMs > 0 && this.rootElementId) {
      this.results.get(this.rootElementId).totalOvertime += overtimeMs;
    }

    const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;
    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;
    const newTaskEvent = { type: 'TASK_COMPLETE', element, time: completionTime, instanceId, startTime, processingTime, cost, quantityRequired };

    if (data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
      const pool = this.resourcePools.get(data.resources.pool);
      if (!pool.request(quantityRequired, newTaskEvent)) {
        newTaskEvent.waitStart = time;
      } else {
        this.eventQueue.add(newTaskEvent);
      }
    } else {
      this.eventQueue.add(newTaskEvent);
    }
  }

  run() {
    this.initialize();

    let rootElement = this._elementRegistry.find(el => {
      const data = getSimulationData(el);
      return data && data.rootCheckpoint === true;
    });

    if (!rootElement) {
      rootElement = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant')) || this._elementRegistry.find(el => is(el, 'bpmn:Process'));
    }
    this.rootElementId = rootElement.id;
    this.results.get(this.rootElementId).totalOvertime = 0;

    const configData = getSimulationData(rootElement) || {};
    const productionMode = !!configData.rootCheckpoint;
    const productionTarget = configData.productionTarget || 1;
    const legacyRunValue = configData.simulationConfig ? configData.simulationConfig.runValue : 100;
    const finalTarget = productionMode ? productionTarget : legacyRunValue;

    if (productionMode && configData.workSchedule) {
      this.workCalendar = new WorkCalendar(configData.workSchedule);
      this.clock = new Date();
      this.workCalendar.adjustToStartOfWork(this.clock);
    } else {
      this.clock = 0;
    }

    if (configData.resourcePools) {
      configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }

    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) {
      console.error("Simulation Error: No Start Event found.");
      return this.results;
    }

    let instanceCounter = 0;
    const initialTime = this.clock;
    this.progressSnapshots.push([new Date(initialTime.getTime ? initialTime.getTime() : initialTime), 0]);

    if (productionMode) {
      for (let i = 0; i < productionTarget; i++) {
        instanceCounter++;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: initialTime, instanceId: instanceCounter, startTime: initialTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
    } else {
      instanceCounter++;
      this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: initialTime, instanceId: instanceCounter, startTime: initialTime });
      this.instanceStates.set(instanceCounter, { gateways: {} });
    }

    const startEventData = getSimulationData(startEvent);
    let arrivalInterval = 1000;
    if (!productionMode && startEventData && startEventData.arrivalRate) {
        const rate = startEventData.arrivalRate.value;
        const unit = startEventData.arrivalRate.unit;
        if (rate > 0) {
            let intervalInSeconds = (unit === 'second') ? 1 / rate : (unit === 'minute') ? 60 / rate : 3600 / rate;
            arrivalInterval = intervalInSeconds * 1000;
        }
    }

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);
        results.totalProcessingTime += event.processingTime;
        results.totalCost += event.cost;
        if (event.waitStart) {
          const waitTime = this.workCalendar
            ? this.clock.getTime() - event.waitStart.getTime()
            : this.clock - event.waitStart;
          results.totalWaitTime += waitTime;
        }

        const data = getSimulationData(event.element);
        if (data && data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
          const pool = this.resourcePools.get(data.resources.pool);
          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            const waitTime = this.workCalendar
              ? this.clock.getTime() - nextTask.waitStart.getTime()
              : this.clock - nextTask.waitStart;
            this.results.get(nextTask.element.id).totalWaitTime += waitTime;

            let completionTime, overtimeMs = 0;
            if (this.workCalendar) {
              const calc = this.workCalendar.addWorkTime(this.clock, nextTask.processingTime);
              completionTime = calc.finalDate;
              overtimeMs = calc.overtimeMs;
            } else {
              completionTime = this.clock + nextTask.processingTime;
            }
            if (overtimeMs > 0 && this.rootElementId) {
              this.results.get(this.rootElementId).totalOvertime += overtimeMs;
            }
            nextTask.time = completionTime;

            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          });
        }
        this.processEvent(event);
      } else {
        this.processEvent(event);
      }

      if (this.completedInstances >= finalTarget) {
        break;
      }

      if (!productionMode && is(event.element, 'bpmn:StartEvent') && instanceCounter < finalTarget) {
        instanceCounter++;
        const nextArrivalTime = event.time + arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
    }

    const finalResults = this.results.get(this.rootElementId);
    if (finalResults) {
      finalResults.estimatedCompletionDate = this.clock;
      finalResults.progressSnapshots = this.progressSnapshots;
    }

    console.log("--- Simulation Finished ---");
    console.log(`Completed ${this.completedInstances} instances.`);
    if (this.workCalendar) {
      console.log(`Estimated Completion Time: ${this.clock.toLocaleString()}`);
    }
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
