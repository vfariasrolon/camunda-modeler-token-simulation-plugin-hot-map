import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';
import { timeToMilliseconds } from './util';

const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  return rand < F ? min + Math.sqrt(rand * (mode - min) * (max - min)) : max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
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
    this.clock = 0;
  }

  initialize() {
    this.clock = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0,
        name: element.businessObject.name || element.id
      });
    });
  }

  findNextElement(element) {
    if (!element.outgoing || element.outgoing.length === 0) {
      return null;
    }

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
      return element.outgoing[element.outgoing.length - 1].target;
    }

    return element.outgoing[0].target;
  }

  processEvent(event) {
    const { element } = event;
    const result = this.results.get(element.id);
    result.executionCount++;
    this.clock = event.time;

    const nextElement = this.findNextElement(element);
    if (!nextElement) {
      return; // End of a path
    }

    if (is(nextElement, 'bpmn:Task')) {
      this.scheduleTask(nextElement, this.clock);
    } else {
      this.eventQueue.add({ element: nextElement, time: this.clock });
    }
  }

  scheduleTask(element, time) {
    const data = getSimulationData(element);
    let processingTime = 0;
    if (data && data.processingTime) {
      if (data.processingTime.distribution === 'fixed') {
        processingTime = timeToMilliseconds(data.processingTime.value, data.processingTime.unit);
      } else if (data.processingTime.distribution === 'triangular') {
        const randomValue = triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max);
        processingTime = timeToMilliseconds(randomValue, data.processingTime.unit);
      }
    }
    if (data && data.failureRate && Math.random() < data.failureRate) {
      const reworkTime = data.reworkTime ? timeToMilliseconds(data.reworkTime.value, data.reworkTime.unit) : 0;
      processingTime += reworkTime;
      this.results.get(element.id).failureCount++;
    }

    const cost = data && data.cost ? (data.cost.value / 3600000) * processingTime : 0;
    const quantityRequired = (data && data.resources && data.resources.quantityRequired) || 1;
    const newTaskEvent = { element, time: time + processingTime, processingTime, cost, quantityRequired };

    if (data && data.resources && this.resourcePools.has(data.resources.pool)) {
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

    for (let i = 0; i < runValue; i++) {
        this.eventQueue.add({ element: startEvent, time: 0 });
    }

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.waitStart) { // This is a task that was waiting for a resource
        this.results.get(event.element.id).totalWaitTime += (this.clock - event.waitStart);
      }
      this.results.get(event.element.id).totalProcessingTime += event.processingTime || 0;
      this.results.get(event.element.id).totalCost += event.cost || 0;

      const poolName = getSimulationData(event.element)?.resources?.pool;
      if (poolName && this.resourcePools.has(poolName)) {
          const pool = this.resourcePools.get(poolName);
          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            this.eventQueue.add({ ...nextTask, waitStart: nextTask.waitStart, time: this.clock + nextTask.processingTime });
          });
      }

      this.processEvent(event);
    }

    console.log("--- Simplified Simulation Finished ---");
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
