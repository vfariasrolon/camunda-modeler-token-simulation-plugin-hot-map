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
    this.calendar = null;
    this.completionLog = [];
  }

  initialize() {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.calendar = null;
    this.completionLog = [];
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        totalIdleTime: 0,
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
      this.completionLog.push(this.clock);
      elementResults.totalCycleTime += (this.clock - startTime);
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
    const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;

    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;

    let completionTime = time + processingTime;

    // Adjust for work calendar if available
    if (this.calendar) {
      const adjustedTime = this.calendar.adjustTimestamp(completionTime);
      if (adjustedTime > completionTime) {
        const idleTime = adjustedTime - completionTime;
        this.results.get(element.id).totalIdleTime += idleTime;
      }
      completionTime = adjustedTime;
    }

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
    let configData = null;

    // New: Search for a root initiator in StartEvents
    const startEvents = this._elementRegistry.filter(el => is(el, 'bpmn:StartEvent'));
    for (const startEvent of startEvents) {
      const data = getSimulationData(startEvent);
      if (data && data.isRootInitiator) {
        configData = data;
        break; // Found it, stop searching
      }
    }

    // Fallback for old simulation configurations on Process/Participant
    if (!configData) {
      const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
      if (processRoot) {
        configData = getSimulationData(processRoot);
      }
    }

    const simulationMode = configData && configData.simulationMode ? configData.simulationMode : 'arrivalRate';
    let simulationRuns = 100; // default
    let arrivalInterval = 1000; // default for arrivalRate mode

    if (simulationMode === 'productionBatch') {
      simulationRuns = configData && configData.productionTarget ? configData.productionTarget : 1;
      if (configData.workCalendar) {
        this.calendar = new WorkCalendar(configData.workCalendar);
      }
    } else { // 'arrivalRate' mode
      simulationRuns = (configData && configData.simulationConfig && configData.simulationConfig.runValue) || 100;
    }

    if (configData && configData.resourcePools) {
      configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }
    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) {
      return {
        resultsPerElement: this.results,
        globalResults: {},
        completionLog: []
      };
    }

    if (simulationMode === 'productionBatch') {
      for (let i = 1; i <= simulationRuns; i++) {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId: i, startTime: 0 });
        this.instanceStates.set(i, { gateways: {} });
      }
    } else { // arrivalRate mode
      const startEventData = getSimulationData(startEvent);
      if (startEventData && startEventData.arrivalRate) {
        const rate = startEventData.arrivalRate.value;
        const unit = startEventData.arrivalRate.unit; // per second, minute, or hour
        if (rate > 0) {
          let intervalInSeconds;
          if (unit === 'second') {
            intervalInSeconds = 1 / rate;
          } else if (unit === 'minute') {
            intervalInSeconds = 60 / rate;
          } else { // hour
            intervalInSeconds = 3600 / rate;
          }
          arrivalInterval = intervalInSeconds * 1000;
        }
      }
      this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId: 1, startTime: 0 });
      this.instanceStates.set(1, { gateways: {} });
    }
    let instanceCounter = 1;

    while (!this.eventQueue.isEmpty()) {
      if (simulationMode === 'productionBatch' && this.completedInstances >= simulationRuns) {
        break;
      }

      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);
        results.totalProcessingTime += event.processingTime;
        results.totalCost += event.cost;
        if (event.waitStart) results.totalWaitTime += (this.clock - event.waitStart);

        const data = getSimulationData(event.element);
        if (data && data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
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

      if (simulationMode === 'arrivalRate') {
        if (is(event.element, 'bpmn:StartEvent') && instanceCounter < simulationRuns) {
          instanceCounter++;
          const nextArrivalTime = event.time + arrivalInterval;
          this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
          this.instanceStates.set(instanceCounter, { gateways: {} });
        }
      }
    }

    const globalResults = {
      finalCompletionTime: this.clock,
      totalProductiveTime: 0,
      totalResourceWaitTime: 0,
      totalCalendarIdleTime: 0
    };

    for (const result of this.results.values()) {
      globalResults.totalProductiveTime += result.totalProcessingTime;
      globalResults.totalResourceWaitTime += result.totalWaitTime;
      globalResults.totalCalendarIdleTime += result.totalIdleTime;
    }

    return {
        resultsPerElement: this.results,
        globalResults,
        completionLog: this.completionLog
    };
  }
}

SimulationEngine.$inject = ['elementRegistry'];
