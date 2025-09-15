import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';
import BusinessCalendar from '../../../src/features/simulation/BusinessCalendar.js';

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
    this.calendar = null; // Will be initialized on run
  }

  initialize(options) {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.weeklyStats = new Map(); // For overtime tracking
    this.calendar = new BusinessCalendar(options.calendar);
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        totalOvertime: 0, totalReworkTime: 0, totalReworkCost: 0, totalWaitTimeCost: 0, totalOvertimeCost: 0,
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
      elementResults.totalCycleTime += this.calendar.calculateElapsedTime(new Date(startTime), new Date(this.clock));
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
    const processData = getSimulationData(this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant')));
    const baseRatePerHour = processData.cost.baseRatePerHour || 0;

    let processingTime = 0;
    if (data.processingTime.distribution === 'fixed') {
      processingTime = timeToMilliseconds(data.processingTime.value, data.processingTime.unit);
    } else if (data.processingTime.distribution === 'triangular') {
      const randomValue = triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max);
      processingTime = timeToMilliseconds(randomValue, data.processingTime.unit);
    }

    let reworkTime = 0;
    let reworkCost = 0;
    if (data.failureRate && Math.random() < data.failureRate) {
      reworkTime = data.reworkTime ? timeToMilliseconds(data.reworkTime.value, data.reworkTime.unit) : 0;
      processingTime += reworkTime;
      this.results.get(element.id).failureCount++;
      reworkCost = (reworkTime / 3600000) * baseRatePerHour;
    }

    const processingCost = (processingTime / 3600000) * baseRatePerHour;

    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;
    const endTime = this.calendar.addWorkingTime(new Date(time), processingTime).getTime();

    const taskOvertimeDuration = endTime > this.calendar.getWorkdayEnd(new Date(endTime)).getTime()
      ? (endTime - this.calendar.getWorkdayEnd(new Date(endTime)).getTime())
      : 0;

    const weekNumber = this.calendar.getWeekNumber(new Date(endTime));
    if (!this.weeklyStats.has(instanceId)) this.weeklyStats.set(instanceId, new Map());
    const instanceWeeklyStats = this.weeklyStats.get(instanceId);
    if (!instanceWeeklyStats.has(weekNumber)) instanceWeeklyStats.set(weekNumber, { overtime: 0 });
    const currentWeeklyOvertime = instanceWeeklyStats.get(weekNumber).overtime;

    const overtimeRules = processData.overtime;
    const limitInMillis = (overtimeRules.limitHours * 3600000) || 0;

    const normalOvertime = Math.min(taskOvertimeDuration, Math.max(0, limitInMillis - currentWeeklyOvertime));
    const excessOvertime = Math.max(0, taskOvertimeDuration - normalOvertime);

    const overtimeCost =
      ((normalOvertime / 3600000) * baseRatePerHour * overtimeRules.payMultiplier) +
      ((excessOvertime / 3600000) * baseRatePerHour * overtimeRules.excessPayMultiplier);

    instanceWeeklyStats.get(weekNumber).overtime += taskOvertimeDuration;

    const newTaskEvent = {
      type: 'TASK_COMPLETE', element, time: endTime, instanceId, startTime,
      processingTime, reworkTime, overtime: taskOvertimeDuration,
      processingCost, reworkCost, overtimeCost, quantityRequired
    };

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

  run(options = {}) {
    this.initialize(options);
    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const configData = getSimulationData(processRoot);
    const { runValue } = configData ? configData.simulationConfig : { runValue: 100 };
    if (configData && configData.resourcePools) {
      configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }
    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) return this.results;

    const startEventData = getSimulationData(startEvent);
    let arrivalInterval = 1000; // Default to 1 second if not specified
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
    let instanceCounter = 1;

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);
        results.totalProcessingTime += event.processingTime;
        results.totalReworkTime += event.reworkTime;
        results.totalOvertime += event.overtime;

        const waitTimeCost = results.totalWaitTimeCost; // Preserve this as it's calculated on release
        results.totalCost = (results.totalCost - waitTimeCost) + event.processingCost + event.reworkCost + event.overtimeCost + waitTimeCost;
        results.totalReworkCost += event.reworkCost;
        results.totalOvertimeCost += event.overtimeCost;

        if (event.waitStart) {
          const waitTime = this.calendar.calculateElapsedTime(new Date(event.waitStart), new Date(this.clock));
          results.totalWaitTime += waitTime;
          const waitCostPerHour = getSimulationData(processRoot)?.cost?.waitCostPerHour || 0;
          const currentWaitCost = (waitTime / 3600000) * waitCostPerHour;
          results.totalWaitTimeCost += currentWaitCost;
          results.totalCost += currentWaitCost;
        }

        const data = getSimulationData(event.element);
        if (data && data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
          const pool = this.resourcePools.get(data.resources.pool);
          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            const nextTaskResults = this.results.get(nextTask.element.id);
            const waitTime = this.calendar.calculateElapsedTime(new Date(nextTask.waitStart), new Date(this.clock));
            nextTaskResults.totalWaitTime += waitTime;
            const waitCostPerHour = getSimulationData(processRoot)?.cost?.waitCostPerHour || 0;
            const currentWaitCost = (waitTime / 3600000) * waitCostPerHour;
            nextTaskResults.totalWaitTimeCost += currentWaitCost;
            nextTaskResults.totalCost += currentWaitCost;

            nextTask.time = this.calendar.addWorkingTime(new Date(this.clock), nextTask.processingTime).getTime();
            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          });
        }
        this.processEvent(event);
      } else {
        this.processEvent(event);
      }

      if (this.completedInstances >= runValue) break;
      if (is(event.element, 'bpmn:StartEvent') && instanceCounter < runValue) {
        instanceCounter++;
        const nextArrivalTime = this.calendar.addWorkingTime(new Date(event.time), arrivalInterval).getTime();
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
    }

    console.log("--- Simulation Finished ---");
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
