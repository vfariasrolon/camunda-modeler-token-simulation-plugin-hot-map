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
    this.capacity = config.capacity;
    this.carts = Array.from({ length: config.quantity }, (_, i) => ({
      id: `${config.name}_${i}`,
      state: 'IDLE', location: null, payload: []
    }));
    this.loadingQueues = {};
  }
  getIdleCartAt(location) {
    return this.carts.find(c => c.state === 'IDLE' && c.location === location);
  }
  getLoadingCartAt(location) {
    return this.carts.find(c => c.state === 'LOADING' && c.location === location);
  }
}

export default class SimulationEngine {
  constructor(elementRegistry) {
    this._elementRegistry = elementRegistry;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.transportPools = new Map();
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
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        name: element.businessObject.name || element.id
      });
    });
  }

  findNextElements(element) {
    if (!element.outgoing || element.outgoing.length === 0) return [];
    if (is(element, 'bpmn:ParallelGateway')) {
      return element.outgoing.map(flow => {
        const flowResults = this.results.get(flow.id);
        if (flowResults) flowResults.executionCount++;
        return flow.target;
      });
    }
    if (is(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
      const rand = Math.random();
      let cumulativeProbability = 0;
      for (const flow of element.outgoing) {
        const data = getSimulationData(flow);
        const probability = data ? data.branchingProbability : (1 / element.outgoing.length);
        cumulativeProbability += probability;
        if (rand <= cumulativeProbability) {
          const flowResults = this.results.get(flow.id);
          if (flowResults) flowResults.executionCount++;
          return [flow.target];
        }
      }
      const lastFlow = element.outgoing[element.outgoing.length - 1];
      const flowResults = this.results.get(lastFlow.id);
      if (flowResults) flowResults.executionCount++;
      return [lastFlow.target];
    }
    const singleFlow = element.outgoing[0];
    const flowResults = this.results.get(singleFlow.id);
    if (flowResults) flowResults.executionCount++;
    return [singleFlow.target];
  }

  handleLoadingTask(event) {
    const { element: loadingTask, instanceId } = event;
    const data = getSimulationData(loadingTask);
    const pool = this.transportPools.get(data.loads.pool);
    if (!pool.loadingQueues[loadingTask.id]) pool.loadingQueues[loadingTask.id] = [];
    pool.loadingQueues[loadingTask.id].push(instanceId);
    let cart = pool.getLoadingCartAt(loadingTask.id) || pool.getIdleCartAt(null);
    if (cart && pool.loadingQueues[loadingTask.id].length >= pool.capacity) {
      cart.state = 'LOADING';
      cart.location = loadingTask.id;
      cart.payload = pool.loadingQueues[loadingTask.id].splice(0, pool.capacity);
      this.eventQueue.add({ type: 'CART_DEPARTURE', cart, element: loadingTask, time: this.clock });
    }
  }

  processEvent(event) {
    const { type, element, instanceId, startTime } = event;
    if (type === 'CART_DEPARTURE') {
      const { cart, element: fromTask } = event;
      const nextFlow = fromTask.outgoing[0];
      const transportTime = getSimulationData(nextFlow)?.transportTime?.value || 0;
      cart.state = 'IN_TRANSIT';
      this.eventQueue.add({ type: 'CART_ARRIVAL', cart, element: nextFlow.target, time: this.clock + minutesToMilliseconds(transportTime) });
      return;
    }
    if (type === 'CART_ARRIVAL') {
      const { cart, element: toTask } = event;
      cart.state = 'WAITING_TO_UNLOAD';
      cart.location = toTask.id;
      cart.payload.forEach(instId => {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: toTask, time: this.clock, instanceId: instId, startTime });
      });
      cart.payload = [];
      return;
    }
    const elementResults = this.results.get(element.id);
    elementResults.executionCount++;
    this.clock = event.time;
    if (type === 'INSTANCE_COMPLETE') { this.completedInstances++; elementResults.totalCycleTime += (this.clock - startTime); return; }
    const elementData = getSimulationData(element);
    if (is(element, 'bpmn:Task') && elementData && elementData.loads) { this.handleLoadingTask(event); return; }
    const nextElements = this.findNextElements(element);
    if (!nextElements.length) { this.eventQueue.add({ type: 'INSTANCE_COMPLETE', element, time: this.clock, instanceId, startTime }); return; }
    nextElements.forEach(nextElement => {
      const data = getSimulationData(nextElement);
      if (is(nextElement, 'bpmn:Task') && data) {
        if (data.requires) {
          const pool = this.transportPools.get(data.requires.pool);
          const cart = pool.carts.find(c => c.location === nextElement.id && c.state === 'WAITING_TO_UNLOAD');
          if (!cart) {
            this.results.get(nextElement.id).totalWaitTime += 1000;
            return;
          }
          cart.state = 'IDLE'; cart.location = null;
        }
        let processingTime = 0;
        if (data.processingTime.distribution === 'fixed') processingTime = minutesToMilliseconds(data.processingTime.value);
        else if (data.processingTime.distribution === 'triangular') processingTime = minutesToMilliseconds(triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max));
        if (data.failureRate && Math.random() < data.failureRate) {
          processingTime += data.reworkTime ? minutesToMilliseconds(data.reworkTime.value) : 0;
          this.results.get(nextElement.id).failureCount++;
        }
        const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;
        const taskEvent = { type: 'TASK_COMPLETE', element: nextElement, time: this.clock + processingTime, instanceId, startTime, processingTime, cost };
        if (data.resources && this.resourcePools.has(data.resources.pool)) {
          const resourcePool = this.resourcePools.get(data.resources.pool);
          if (!resourcePool.request(taskEvent)) taskEvent.waitStart = this.clock;
          else this.eventQueue.add(taskEvent);
        } else {
          this.eventQueue.add(taskEvent);
        }
      } else {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
      }
    });
  }

  run() {
    this.initialize();
    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const configData = getSimulationData(processRoot);
    const { runValue } = configData ? configData.simulationConfig : { runValue: 100 };
    if (configData && configData.resourcePools) configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    if (configData && configData.transportPools) configData.transportPools.forEach(p => this.transportPools.set(p.name, new TransportPool(p)));
    const startEvent = this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
    if (!startEvent) return this.results;
    const arrivalData = getSimulationData(startEvent);
    const arrivalInterval = arrivalData ? minutesToMilliseconds(arrivalData.arrivalRate.value) : 600000;
    console.log("--- Simulation Starting ---", { configData, arrivalData });
    this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId: 1, startTime: 0 });
    let instanceCounter = 1;
    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
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
      }
      this.processEvent(event);
      if (this.completedInstances >= runValue) break;
      if (is(event.element, 'bpmn:StartEvent') && instanceCounter < runValue) {
        instanceCounter++;
        const nextArrivalTime = event.time + arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
      }
    }
    console.log("--- Simulation Finished ---");
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];
