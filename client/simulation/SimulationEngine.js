import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';
import BusinessCalendar from './BusinessCalendar.js';

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
    this.rootConfig = {};
  }

  initialize(rootConfig) {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.weeklyStats = new Map(); // For overtime tracking
    this.dailyCompletions = new Map(); // For daily production tracking
    this.rootConfig = rootConfig;
    this.calendar = new BusinessCalendar(rootConfig.calendar);
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

      const completionDate = new Date(this.clock);
      const dayKey = `${completionDate.getFullYear()}-${String(completionDate.getMonth() + 1).padStart(2, '0')}-${String(completionDate.getDate()).padStart(2, '0')}`;
      const currentCount = this.dailyCompletions.get(dayKey) || 0;
      this.dailyCompletions.set(dayKey, currentCount + 1);

      console.log(`Instance ${instanceId} completed. Total completed: ${this.completedInstances}`);
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
    const baseRatePerHour = this.rootConfig.cost.baseRatePerHour || 0;

    let processingTime = 0;
    const pt = data.processingTime;
    if (pt) {
      if (pt.distribution === 'triangular') {
        const randomValue = triangular(pt.min, pt.mode, pt.max);
        processingTime = timeToMilliseconds(randomValue, pt.unit);
      } else { // Default to fixed distribution
        processingTime = timeToMilliseconds(pt.value, pt.unit);
      }
    }

    let reworkTime = 0;
    let reworkCost = 0;
    if (data.failureRate && Math.random() < data.failureRate) {
      const rt = data.reworkTime;
      if (rt) {
        if (rt.distribution === 'triangular') {
          const randomValue = triangular(rt.min, rt.mode, rt.max);
          reworkTime = timeToMilliseconds(randomValue, rt.unit);
        } else {
          reworkTime = timeToMilliseconds(rt.value, rt.unit);
        }
      }
      this.results.get(element.id).failureCount++;
      reworkCost = (reworkTime / 3600000) * baseRatePerHour;
    }

    const totalProcessingTimeForTask = processingTime + reworkTime;
    const processingCost = (totalProcessingTimeForTask / 3600000) * baseRatePerHour;

    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;
    const endTime = this.calendar.addWorkingTime(new Date(time), totalProcessingTimeForTask / 60000).getTime();

    const taskOvertimeDuration = endTime > this.calendar.getWorkdayEnd(new Date(endTime)).getTime()
      ? (endTime - this.calendar.getWorkdayEnd(new Date(endTime)).getTime())
      : 0;

    const weekNumber = this.calendar.getWeekNumber(new Date(endTime));
    if (!this.weeklyStats.has(instanceId)) this.weeklyStats.set(instanceId, new Map());
    const instanceWeeklyStats = this.weeklyStats.get(instanceId);
    if (!instanceWeeklyStats.has(weekNumber)) instanceWeeklyStats.set(weekNumber, { overtime: 0 });
    const currentWeeklyOvertime = instanceWeeklyStats.get(weekNumber).overtime;

    const overtimeRules = this.rootConfig.overtime;
    const limitInMillis = (overtimeRules.limitHours * 3600000) || 0;

    const normalOvertime = Math.min(taskOvertimeDuration, Math.max(0, limitInMillis - currentWeeklyOvertime));
    const excessOvertime = Math.max(0, taskOvertimeDuration - normalOvertime);

    const overtimeCost =
      ((normalOvertime / 3600000) * baseRatePerHour * (overtimeRules.payMultiplier - 1)) +
      ((excessOvertime / 3600000) * baseRatePerHour * (overtimeRules.excessPayMultiplier - 1));

    instanceWeeklyStats.get(weekNumber).overtime += taskOvertimeDuration;

    console.log(`[SCHEDULE] Task ${element.id} | Base Time: ${processingTime}ms | Rework Time: ${reworkTime}ms | Total Processing: ${totalProcessingTimeForTask}ms`);

    const newTaskEvent = {
      type: 'TASK_COMPLETE', element, time: endTime, instanceId, startTime,
      processingTime: totalProcessingTimeForTask, reworkTime, overtime: taskOvertimeDuration,
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

  _findRootConfig() {
    const startEvents = this._elementRegistry.filter(el => is(el, 'bpmn:StartEvent'));
    const rootEvents = startEvents.filter(el => getSimulationData(el)?.isRoot);

    if (rootEvents.length === 1) {
      return getSimulationData(rootEvents[0]);
    }

    if (rootEvents.length > 1) {
      console.warn('Multiple root start events found. Using default simulation configuration.');
    } else {
      console.warn('No root start event found. Using default simulation configuration.');
    }

    return {
      simulationConfig: { runValue: 1000 },
      isRoot: true,
      calendar: { workingDays: [1, 2, 3, 4, 5], workingHours: { start: {hour:9, minute:0}, end: {hour:17, minute:0} } },
      cost: { waitCostPerHour: 0, baseRatePerHour: 50, currency: 'MXN' },
      overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
      arrivalRate: { value: 60, unit: 'minute' }
    };
  }

  run() {
    const rootConfig = this._findRootConfig();
    this.initialize(rootConfig);

    console.log("--- Simulation Starting ---");
    console.log("Root Config Found:", rootConfig);

    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const processConfig = getSimulationData(processRoot);
    const { runValue } = this.rootConfig.simulationConfig || { runValue: 100 };
    if (processConfig && processConfig.resourcePools) {
      processConfig.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }

    const startEvents = this._elementRegistry.filter(el => is(el, 'bpmn:StartEvent'));
    if (!startEvents.length) {
      console.error("No start event found. Cannot run simulation.");
      return this.results;
    }

    const arrivalRate = this.rootConfig.arrivalRate || { value: 1, unit: 'minute' };
    let arrivalInterval = 60000; // Default to 1 per minute
    if (arrivalRate.value > 0) {
      let intervalInSeconds;
      if (arrivalRate.unit === 'second') {
        intervalInSeconds = 1 / arrivalRate.value;
      } else if (arrivalRate.unit === 'hour') {
        intervalInSeconds = 3600 / arrivalRate.value;
      } else { // minute
        intervalInSeconds = 60 / arrivalRate.value;
      }
      arrivalInterval = intervalInSeconds * 1000;
    }

    startEvents.forEach((startEvent, index) => {
      const instanceId = index + 1;
      this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId, startTime: 0 });
      this.instanceStates.set(instanceId, { gateways: {} });
    });

    let instanceCounter = startEvents.length;
    let iterationCounter = 0;

    console.log(`Starting simulation with ${runValue} instances to complete.`);

    while (!this.eventQueue.isEmpty()) {
      iterationCounter++;
      if (iterationCounter > (runValue * 1000)) { // Safety break, increased limit
        throw new Error(`Simulation safety break triggered. Exceeded ${runValue * 1000} iterations. Likely an infinite loop.`);
      }

      const event = this.eventQueue.next();
      this.clock = event.time;

      console.log(`[${iterationCounter}] Processing event: ${event.type} for element ${event.element.id} at time ${new Date(this.clock).toLocaleString()}`);
      console.log(`Queue size: ${this.eventQueue.items.length}, Completed instances: ${this.completedInstances}`);


      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);

        console.log(`[RESULTS] Task ${event.element.id} | Adding to totals: processTime=${event.processingTime}, reworkTime=${event.reworkTime}`);

        results.totalProcessingTime += event.processingTime;
        results.totalReworkTime += event.reworkTime;
        results.totalOvertime += event.overtime;

        const waitTimeCost = results.totalWaitTimeCost;
        results.totalCost = (results.totalCost - waitTimeCost) + event.processingCost + event.reworkCost + event.overtimeCost + waitTimeCost;
        results.totalReworkCost += event.reworkCost;
        results.totalOvertimeCost += event.overtimeCost;

        if (event.waitStart) {
          const waitTime = this.calendar.calculateElapsedTime(new Date(event.waitStart), new Date(this.clock));
          results.totalWaitTime += waitTime;
          const waitCostPerHour = this.rootConfig.cost.waitCostPerHour || 0;
          const currentWaitCost = (waitTime / 60) * waitCostPerHour; // waitTime is in minutes
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
            const waitCostPerHour = this.rootConfig.cost.waitCostPerHour || 0;
            const currentWaitCost = (waitTime / 60) * waitCostPerHour;
            nextTaskResults.totalWaitTimeCost += currentWaitCost;
            nextTaskResults.totalCost += currentWaitCost;

            nextTask.time = this.calendar.addWorkingTime(new Date(this.clock), nextTask.processingTime / 60000).getTime();
            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          });
        }
        this.processEvent(event);
      } else {
        this.processEvent(event);
      }

      if (is(event.element, 'bpmn:StartEvent') && instanceCounter < runValue) {
        instanceCounter++;
        const arrivalIntervalInMinutes = arrivalInterval / 60000;
        const nextArrivalTime = this.calendar.addWorkingTime(new Date(event.time), arrivalIntervalInMinutes).getTime();
        console.log(`Scheduling next instance (${instanceCounter}) to arrive at ${new Date(nextArrivalTime).toLocaleString()}`);
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvents[0], time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
      console.log(`Checking end condition: completed=${this.completedInstances}, target=${runValue}`);
      if (this.completedInstances >= runValue) {
        console.log(`Target of ${runValue} completed instances reached. Ending simulation.`);
        break;
      }
    }

    console.log("--- Simulation Finished ---");
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
