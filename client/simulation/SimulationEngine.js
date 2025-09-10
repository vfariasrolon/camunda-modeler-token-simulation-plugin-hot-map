import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';

const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  return rand < F ? min + Math.sqrt(rand * (mode - min) * (max - min)) : max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
};
const minutesToMilliseconds = (minutes) => minutes * 60 * 1000;

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
    if (this.available > 0) { this.available--; return true; }
    this.queue.push(task); return false;
  }
  release() {
    this.available++;
    if (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      this.available--;
      return nextTask;
    }
    return null;
  }
}

class TransportPool {
  constructor(config) {
    this.name = config.name;
    this.available = config.quantity;
    this.capacity = config.capacity;
    this.batches = new Map();
    this.waitingForTransport = new Map();
  }

  addInstanceToBatch(instanceEvent) {
    const loaderId = instanceEvent.element.id;
    if (!this.batches.has(loaderId)) {
      this.batches.set(loaderId, []);
    }
    this.batches.get(loaderId).push(instanceEvent);
  }

  getBatch(loaderId) {
    return this.batches.get(loaderId) || [];
  }

  // NOTE: This is the simplified logic. We could also check for capacity.
  isBatchReady(loaderId) {
    return this.getBatch(loaderId).length > 0;
  }

  dispatch(loaderId) {
    if (this.available > 0) {
      const batch = this.batches.get(loaderId) || [];
      if (batch.length > 0) {
        this.available--;
        this.batches.set(loaderId, []);
        return batch;
      }
    }
    return null;
  }

  release() {
    this.available++;
  }

  addWaitingTask(unloaderId, taskEvent) {
    if (!this.waitingForTransport.has(unloaderId)) {
      this.waitingForTransport.set(unloaderId, []);
    }
    this.waitingForTransport.get(unloaderId).push(taskEvent);
  }

  getWaitingTasks(unloaderId) {
    return this.waitingForTransport.get(unloaderId) || [];
  }
}

export default class SimulationEngine {
  constructor(elementRegistry) {
    this._elementRegistry = elementRegistry;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.transportPools = new Map();
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
    this.transportPools = new Map();
    this.instanceStates = new Map();
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0, totalTransportTime: 0,
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
    if (type !== 'TRANSPORT_ARRIVED') elementResults.executionCount++;
    this.clock = event.time;

    if (type === 'INSTANCE_COMPLETE') {
      this.completedInstances++;
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
        const taskEvent = { type: 'TASK_START', element: nextElement, time: this.clock, instanceId, startTime, nextConnection };
        if (data.requires && this.transportPools.has(data.requires.pool)) {
          const pool = this.transportPools.get(data.requires.pool);
          pool.addWaitingTask(nextElement.id, taskEvent);
        } else {
          this.scheduleTask(taskEvent);
        }
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
      processingTime = minutesToMilliseconds(data.processingTime.value);
    } else if (data.processingTime.distribution === 'triangular') {
      processingTime = minutesToMilliseconds(triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max));
    }
    if (data.failureRate && Math.random() < data.failureRate) {
      const reworkTime = data.reworkTime ? minutesToMilliseconds(data.reworkTime.value) : 0;
      processingTime += reworkTime;
      this.results.get(element.id).failureCount++;
    }
    const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;
    const newTaskEvent = { type: 'TASK_COMPLETE', element, time: time + processingTime, instanceId, startTime, processingTime, cost };
    if (data.resources && this.resourcePools.has(data.resources.pool)) {
      const pool = this.resourcePools.get(data.resources.pool);
      if (!pool.request(newTaskEvent)) {
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
    const { runValue } = configData ? configData.simulationConfig : { runValue: 100 };
    if (configData && configData.resourcePools) {
      configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }
    if (configData && configData.transportPools) {
      configData.transportPools.forEach(p => this.transportPools.set(p.name, new TransportPool(p)));
    }
    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) return this.results;
    const arrivalData = getSimulationData(startEvent);
    const arrivalInterval = arrivalData ? minutesToMilliseconds(arrivalData.arrivalRate.value) : 600000;

    this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId: 1, startTime: 0 });
    this.instanceStates.set(1, { gateways: {} });
    let instanceCounter = 1;

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);
        results.totalProcessingTime += event.processingTime;
        results.totalCost += event.cost;
        if (event.waitStart) results.totalWaitTime += (this.clock - event.waitStart);

        const data = getSimulationData(event.element);
        if (data && data.resources) {
          const pool = this.resourcePools.get(data.resources.pool);
          const nextTask = pool.release();
          if (nextTask) {
            this.results.get(nextTask.element.id).totalWaitTime += (this.clock - nextTask.waitStart);
            nextTask.time = this.clock + nextTask.processingTime;
            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          }
        }

        if (data && data.loads && this.transportPools.has(data.loads.pool)) {
            const pool = this.transportPools.get(data.loads.pool);
            pool.addInstanceToBatch(event);
            if (pool.isBatchReady(event.element.id)) {
                const batch = pool.dispatch(event.element.id);
                if (batch) {
                    const [ next ] = this.findNextElements(event.element);
                    if (next) {
                        const transportData = getSimulationData(next.connection);
                        const transportTime = transportData ? minutesToMilliseconds(transportData.transportTime.value) : 0;
                        this.eventQueue.add({ type: 'TRANSPORT_ARRIVED', element: next.connection.target, time: this.clock + transportTime, batch, transportTime });
                    }
                }
            }
        } else {
            this.processEvent(event);
        }

      } else if (event.type === 'TRANSPORT_ARRIVED') {
          const pool = this.transportPools.get(getSimulationData(event.element).requires.pool);
          pool.release();
          const waitingTasks = pool.getWaitingTasks(event.element.id);
          event.batch.forEach(instance => {
              const task = waitingTasks.find(t => t.instanceId === instance.instanceId);
              if (task) {
                  this.results.get(event.element.id).totalTransportTime += event.transportTime;
                  this.scheduleTask(task);
              }
          });

      } else {
        this.processEvent(event);
      }

      if (this.completedInstances >= runValue) break;
      if (is(event.element, 'bpmn:StartEvent') && instanceCounter < runValue) {
        instanceCounter++;
        const nextArrivalTime = event.time + arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
    }
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
