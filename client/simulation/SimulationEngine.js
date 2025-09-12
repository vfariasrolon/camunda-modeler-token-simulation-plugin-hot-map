import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';

const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  return rand < F ? min + Math.sqrt(rand * (mode - min) * (max - min)) : max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
};

const timeToMilliseconds = (value, unit) => {
  if (unit === 'seconds') return value * 1000;
  if (unit === 'minutes') return value * 60 * 1000;
  if (unit === 'hours') return value * 60 * 60 * 1000;
  return value;
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
        return false;
      }
      return true;
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
  }

  initialize() {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
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
        this.results.get(flow.id).executionCount++;
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
      this.results.get(chosenFlow.id).executionCount++;
      return [{ element: chosenFlow.target, connection: chosenFlow }];
    }
    return [];
  }

  processEvent(event) {
    const { type, element, instanceId, startTime } = event;
    this.results.get(element.id).executionCount++;
    this.clock = event.time;

    if (type === 'INSTANCE_COMPLETE') {
      this.completedInstances++;
      this.results.get(element.id).totalCycleTime += (this.clock - startTime);
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
    if (data.processingTime) {
      if (data.processingTime.distribution === 'fixed') {
        processingTime = timeToMilliseconds(data.processingTime.value, data.processingTime.unit);
      } else if (data.processingTime.distribution === 'triangular') {
        const randomValue = triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max);
        processingTime = timeToMilliseconds(randomValue, data.processingTime.unit);
      }
    }
    if (data.failureRate && Math.random() < data.failureRate) {
      const reworkTime = data.reworkTime ? timeToMilliseconds(data.reworkTime.value, data.reworkTime.unit) : 0;
      processingTime += reworkTime;
      this.results.get(element.id).failureCount++;
    }
    const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;
    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;
    const newTaskEvent = { type: 'TASK_COMPLETE', element, time: time + processingTime, instanceId, startTime, processingTime, cost, quantityRequired };

    if (data.resources && this.resourcePools.has(data.resources.pool)) {
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
    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const configData = getSimulationData(processRoot);
    const runValue = (configData && configData.simulationConfig && configData.simulationConfig.runValue) || 100;
    if (configData && configData.resourcePools) {
      configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }
    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) return this.results;

    const startEventData = getSimulationData(startEvent);
    let arrivalInterval = 1000;
    if (startEventData && startEventData.arrivalRate) {
      const rate = startEventData.arrivalRate.value;
      const unit = startEventData.arrivalRate.unit;
      if (rate > 0) {
        const intervalInSeconds = unit === 'minute' ? 60 / rate : (unit === 'hour' ? 3600 / rate : 1 / rate);
        arrivalInterval = intervalInSeconds * 1000;
      }
    }

    for (let i = 0; i < runValue; i++) {
        const arrivalTime = i * arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: arrivalTime, instanceId: i + 1, startTime: arrivalTime });
        this.instanceStates.set(i + 1, { gateways: {} });
    }

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        this.results.get(event.element.id).totalProcessingTime += event.processingTime;
        this.results.get(event.element.id).totalCost += event.cost;
        if (event.waitStart) {
          this.results.get(event.element.id).totalWaitTime += (this.clock - event.waitStart);
        }

        const data = getSimulationData(event.element);
        if (data && data.resources) {
          const pool = this.resourcePools.get(data.resources.pool);
          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            this.results.get(nextTask.element.id).totalWaitTime += (this.clock - nextTask.waitStart);
            nextTask.time = this.clock + nextTask.processingTime;
            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          });
        }
        this.processEvent(event);
      } else {
        this.processEvent(event);
      }
    }

    console.log("--- Full Simulation Finished ---");
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
