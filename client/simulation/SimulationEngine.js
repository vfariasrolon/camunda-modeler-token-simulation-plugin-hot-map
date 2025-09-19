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
    this.rootConfig = rootConfig;
    this.calendar = new BusinessCalendar(rootConfig.calendar);

    let simStart = new Date();
    if (rootConfig.startDate && /^\d{4}-\d{2}-\d{2}$/.test(rootConfig.startDate)) {
      simStart = new Date(rootConfig.startDate + 'T00:00:00');
    }

    const { start } = this.calendar.config.workingHours;
    simStart.setHours(start.hour, start.minute, 0, 0);

    // Advance to the first available working day
    while (!this.calendar.isWorkingTime(simStart)) {
      simStart.setDate(simStart.getDate() + 1);
    }

    this.simulationStartTime = simStart.getTime();
    this.clock = this.simulationStartTime;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.weeklyStats = new Map();
    this.dailyCompletions = new Map();

    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        totalOvertime: 0, totalReworkTime: 0, totalReworkCost: 0, totalWaitTimeCost: 0, totalOvertimeCost: 0,
        totalDoubleOvertime: 0, totalTripleOvertime: 0,
        totalDoubleOvertimeCost: 0, totalTripleOvertimeCost: 0,
        totalNormalTimeCost: 0,
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

      // console.log(`Instance ${instanceId} completed. Total completed: ${this.completedInstances}`);
      const standardCalendar = new BusinessCalendar(this.rootConfig.calendar);
      elementResults.totalCycleTime += standardCalendar.calculateBusinessDurationInMinutes(new Date(startTime), new Date(this.clock));
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

    console.log(`[DEBUG] scheduleTask for ${element.id} at time ${new Date(time).toISOString()}`);

    let processingTime = 0;
    const pt = data.processingTime;
    if (pt) {
      if (pt.distribution === 'triangular') {
        const randomValue = triangular(pt.min, pt.mode, pt.max);
        processingTime = timeToMilliseconds(randomValue, pt.unit);
      } else {
        processingTime = timeToMilliseconds(pt.value, pt.unit);
      }
    }

    let reworkTime = 0;
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
    }

    const totalTaskDurationInMinutes = (processingTime + reworkTime) / 60000;
    console.log(`[DEBUG] totalTaskDurationInMinutes: ${totalTaskDurationInMinutes}`);

    if (!this.calendar || typeof this.calendar.calculateBusinessTime !== 'function') {
      console.error('[DEBUG] FATAL: this.calendar.calculateBusinessTime is not a function!');
      return;
    }

    const timeCalcResult = this.calendar.calculateBusinessTime(new Date(time), totalTaskDurationInMinutes);
    console.log('[DEBUG] Result from calculateBusinessTime:', timeCalcResult);

    if (!timeCalcResult) {
      console.error('[DEBUG] FATAL: calculateBusinessTime returned undefined!');
      return;
    }

    const { businessTime, overtime, endTime } = timeCalcResult;

    console.log(`[DEBUG] Destructured values: businessTime=${businessTime}, overtime=${overtime}, endTime=${endTime}`);

    if (!endTime) {
      console.error('[DEBUG] FATAL: endTime is undefined after destructuring!');
      // Let it crash here so we see the error
    }

    // Cost of time spent during normal business hours
    const normalTimeCost = (businessTime / 3600000) * baseRatePerHour;

    // Cost of rework is calculated based on its full duration, assuming it's always done at base rate
    const reworkCost = (reworkTime / 3600000) * baseRatePerHour;

    // Overtime cost is the PREMIUM ONLY. The base rate for overtime hours is already in normalTimeCost.
    const weekNumber = this.calendar.getWeekNumber(new Date(endTime));
    const currentWeeklyOvertime = this.weeklyStats.get(weekNumber) || 0;
    const overtimeRules = this.rootConfig.overtime;
    const limitInMillis = (overtimeRules.limitHours * 3600000) || 0;

    const taskOvertimeDuration = overtime;
    const normalOvertime = Math.min(taskOvertimeDuration, Math.max(0, limitInMillis - currentWeeklyOvertime));
    const excessOvertime = Math.max(0, taskOvertimeDuration - normalOvertime);

    const doubleOvertimePremium = (normalOvertime / 3600000) * baseRatePerHour * (overtimeRules.payMultiplier - 1);
    const tripleOvertimePremium = (excessOvertime / 3600000) * baseRatePerHour * (overtimeRules.excessPayMultiplier - 1);
    const totalOvertimePremium = doubleOvertimePremium + tripleOvertimePremium;

    this.weeklyStats.set(weekNumber, currentWeeklyOvertime + taskOvertimeDuration);

    const results = this.results.get(element.id);
    if (results) {
      results.totalDoubleOvertime += normalOvertime;
      results.totalTripleOvertime += excessOvertime;
      results.totalDoubleOvertimeCost += doubleOvertimePremium; // Storing premium only
      results.totalTripleOvertimeCost += tripleOvertimePremium; // Storing premium only
    }

    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;

    const newTaskEvent = {
      type: 'TASK_COMPLETE',
      element,
      time: endTime.getTime(),
      instanceId,
      startTime,
      processingTime,
      reworkTime,
      overtime: taskOvertimeDuration,
      normalTimeCost,
      reworkCost,
      overtimeCost: totalOvertimePremium, // This is the PREMIUM
      quantityRequired,
      totalDuration: businessTime + overtime
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
      const config = getSimulationData(rootEvents[0]);
      config.element = rootEvents[0]; // Attach element for easy access
      return config;
    }

    if (rootEvents.length > 1) {
      console.warn('Multiple root start events found. A single root event is required.');
    } else {
      console.warn('No root start event found. A root event is required.');
    }

    return null;
  }

  run(options = { useOvertime: false }) {
    const rootConfig = this._findRootConfig();
    if (!rootConfig) {
      throw new Error("Cannot run simulation without a root configuration.");
    }
    this.initialize(rootConfig);

    const originalCalendar = this.calendar;
    if (options.useOvertime && this.rootConfig.overtime) {
      const overtimeCalendarConfig = JSON.parse(JSON.stringify(rootConfig.calendar));
      const weeklyOvertimeLimit = this.rootConfig.overtime.limitHours || 0;
      const workdaysInWeek = overtimeCalendarConfig.workingDays.length;
      if (workdaysInWeek > 0) {
        const dailyOvertimeHours = weeklyOvertimeLimit / workdaysInWeek;
        overtimeCalendarConfig.workingHours.end.hour += Math.floor(dailyOvertimeHours);
        overtimeCalendarConfig.workingHours.end.minute += Math.round((dailyOvertimeHours % 1) * 60);

        overtimeCalendarConfig.workingHours.end.hour += Math.floor(overtimeCalendarConfig.workingHours.end.minute / 60);
        overtimeCalendarConfig.workingHours.end.minute %= 60;

        if (overtimeCalendarConfig.workingHours.end.hour >= 24) {
            overtimeCalendarConfig.workingHours.end.hour = 23;
            overtimeCalendarConfig.workingHours.end.minute = 59;
        }
      }
      this.calendar = new BusinessCalendar(overtimeCalendarConfig);
    }

    console.log(`--- Simulation Starting (useOvertime: ${options.useOvertime}) ---`);

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
    let arrivalInterval = 60000;
    if (arrivalRate.value > 0) {
      let intervalInSeconds;
      if (arrivalRate.unit === 'second') {
        intervalInSeconds = 1 / arrivalRate.value;
      } else if (arrivalRate.unit === 'hour') {
        intervalInSeconds = 3600 / arrivalRate.value;
      } else {
        intervalInSeconds = 60 / arrivalRate.value;
      }
      arrivalInterval = intervalInSeconds * 1000;
    }

    startEvents.forEach((startEvent, index) => {
      const instanceId = index + 1;
      const startTime = this.simulationStartTime;
      this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: startTime, instanceId, startTime: startTime });
      this.instanceStates.set(instanceId, { gateways: {} });
    });

    let instanceCounter = startEvents.length;
    let iterationCounter = 0;

    while (!this.eventQueue.isEmpty()) {
      iterationCounter++;
      if (iterationCounter > (runValue * 1000)) {
        throw new Error(`Simulation safety break triggered. Exceeded ${runValue * 1000} iterations. Likely an infinite loop.`);
      }

      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);

        results.totalProcessingTime += event.processingTime;
        results.totalReworkTime += event.reworkTime;
        results.totalOvertime += event.overtime;
        results.totalNormalTimeCost += event.normalTimeCost;
        results.totalOvertimeCost += event.overtimeCost; // This is the premium
        results.totalReworkCost += event.reworkCost;

        const waitTimeCost = results.totalWaitTimeCost;
        // The total cost is the sum of its parts.
        results.totalCost = (results.totalCost - waitTimeCost) + event.normalTimeCost + event.reworkCost + event.overtimeCost + waitTimeCost;

        if (event.waitStart) {
          const standardCalendar = new BusinessCalendar(this.rootConfig.calendar);
          const waitTime = standardCalendar.calculateBusinessDurationInMinutes(new Date(event.waitStart), new Date(this.clock));
          results.totalWaitTime += waitTime;
          const waitCostPerHour = this.rootConfig.cost.waitCostPerHour || 0;
          const currentWaitCost = (waitTime / 60) * waitCostPerHour;
          results.totalWaitTimeCost += currentWaitCost;
          results.totalCost += currentWaitCost;
        }

        const data = getSimulationData(event.element);
        if (data && data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
          const pool = this.resourcePools.get(data.resources.pool);
          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            const nextTaskResults = this.results.get(nextTask.element.id);
            const standardCalendar = new BusinessCalendar(this.rootConfig.calendar);
            const waitTime = standardCalendar.calculateBusinessDurationInMinutes(new Date(nextTask.waitStart), new Date(this.clock));
            nextTaskResults.totalWaitTime += waitTime;
            const waitCostPerHour = this.rootConfig.cost.waitCostPerHour || 0;
            const currentWaitCost = (waitTime / 60) * waitCostPerHour;
            nextTaskResults.totalWaitTimeCost += currentWaitCost;
            nextTaskResults.totalCost += currentWaitCost;

            nextTask.time = this.calendar.addWorkingTime(new Date(this.clock), nextTask.totalDuration / 60000).getTime();
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
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvents[0], time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
      if (this.completedInstances >= runValue) {
        console.log(`Target of ${runValue} completed instances reached. Ending simulation.`);
        break;
      }
    }

    console.log("--- Simulation Finished ---");

    this.calendar = originalCalendar;

    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
