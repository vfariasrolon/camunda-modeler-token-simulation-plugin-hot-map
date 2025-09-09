import { is } from 'bpmn-js/lib/util/ModelUtil';

// --- Helper Functions ---
const getExtensionProperty = (element, name) => {
  if (!element || !element.businessObject) return null;
  const bo = element.businessObject;
  if (!bo.extensionElements || !bo.extensionElements.values) return null;
  const props = bo.extensionElements.values.find(v => is(v, 'camunda:Properties'));
  if (!props || !props.values) return null;
  const prop = props.values.find(p => p.name === name);
  return prop ? prop.value : null;
};
const getSimulationData = (element) => {
  const dataString = getExtensionProperty(element, 'simulationData');
  if (!dataString) return null;
  try { return JSON.parse(dataString); } catch (e) { return null; }
};
const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  return rand < F ? min + Math.sqrt(rand * (mode - min) * (max - min)) : max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
};
const minutesToMilliseconds = (minutes) => minutes * 60 * 1000;

// --- Core Classes ---
class EventQueue { /* ... as before ... */ }
class ResourcePool { /* ... as before ... */ }

// New class to manage transport resources
class TransportPool {
  constructor(config) {
    this.name = config.name;
    this.capacity = config.capacity;
    this.carts = Array.from({ length: config.quantity }, (_, i) => ({
      id: `${config.name}_${i}`,
      state: 'IDLE', // IDLE, LOADING, IN_TRANSIT, WAITING_TO_UNLOAD
      location: null, // element ID
      payload: [] // array of instance IDs
    }));
    this.loadingQueues = {}; // key: elementId, value: array of instanceIds
  }

  getIdleCart() {
    return this.carts.find(c => c.state === 'IDLE');
  }
}

// --- Main Simulation Engine ---
export default class SimulationEngine {
  constructor(elementRegistry) {
    this._elementRegistry = elementRegistry;
    // ... initialization of properties ...
    this.transportPools = new Map();
  }

  initialize() {
    // ... reset properties ...
    this.transportPools = new Map();
    // ... initialize results map ...
  }

  findNextElement(element) { /* ... as before ... */ }

  // New method to handle batching logic
  handleLoadingTask(event) {
    const { element: loadingTask, instanceId } = event;
    const data = getSimulationData(loadingTask);
    const poolName = data.loads.pool;
    const transportPool = this.transportPools.get(poolName);

    if (!transportPool.loadingQueues[loadingTask.id]) {
      transportPool.loadingQueues[loadingTask.id] = [];
    }
    transportPool.loadingQueues[loadingTask.id].push(instanceId);

    if (transportPool.loadingQueues[loadingTask.id].length >= transportPool.capacity) {
      const cart = transportPool.getIdleCart();
      if (cart) {
        cart.state = 'LOADING';
        cart.location = loadingTask.id;
        cart.payload = transportPool.loadingQueues[loadingTask.id].splice(0, transportPool.capacity);

        const departureEvent = {
          type: 'CART_DEPARTURE',
          cart: cart,
          element: loadingTask,
          time: this.clock
        };
        this.eventQueue.add(departureEvent);
      }
    }
  }

  processEvent(event) {
    const { type, element, instanceId, startTime } = event;

    // Handle new transport events
    if (type === 'CART_DEPARTURE') {
        const { cart, element: fromTask } = event;
        const nextFlow = fromTask.outgoing[0];
        const transportData = getSimulationData(nextFlow);
        const transportTime = transportData ? minutesToMilliseconds(transportData.transportTime.value) : 0;

        cart.state = 'IN_TRANSIT';
        this.eventQueue.add({
            type: 'CART_ARRIVAL',
            cart: cart,
            element: nextFlow.target, // destination task
            time: this.clock + transportTime
        });
        return;
    }

    if (type === 'CART_ARRIVAL') {
        const { cart, element: toTask } = event;
        cart.state = 'WAITING_TO_UNLOAD';
        cart.location = toTask.id;

        // Unbatch the instances and schedule their processing
        cart.payload.forEach(instId => {
            this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: toTask, time: this.clock, instanceId: instId, startTime: this.clock });
        });
        cart.payload = []; // Empty the cart
        return;
    }

    // Existing event processing logic
    const elementResults = this.results.get(element.id);
    elementResults.executionCount++;
    this.clock = event.time;

    if (type === 'INSTANCE_COMPLETE') { /* ... as before ... */ return; }

    const data = getSimulationData(element);
    if (is(element, 'bpmn:Task') && data && data.loads) {
        this.handleLoadingTask(event);
        return; // Stop normal flow, instance is now held
    }

    const nextElement = this.findNextElement(element);
    if (!nextElement) { /* ... handle end event ... */ return; }

    const nextData = getSimulationData(nextElement);
    if (is(nextElement, 'bpmn:Task') && nextData) {
        // ... existing task processing logic ...
        // Add check for 'requires' property
        if (nextData.requires) {
            const pool = this.transportPools.get(nextData.requires.pool);
            const cart = pool.carts.find(c => c.location === nextElement.id && c.state === 'WAITING_TO_UNLOAD');
            if (!cart) {
                // This is a simplification. A full implementation would queue the task.
                // For now, we just add wait time conceptually.
                elementResults.totalWaitTime += 1000; // Add placeholder wait time
            } else {
                cart.state = 'IDLE'; // Free the cart
            }
        }
        // ... schedule TASK_COMPLETE event ...
    } else {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId: startTime });
    }
  }

  run() {
    this.initialize();
    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const configData = getSimulationData(processRoot);
    const { runValue, resourcePools, transportPools } = configData || { runValue: 100, resourcePools: [], transportPools: [] };

    if (resourcePools) { /* ... as before ... */ }
    if (transportPools) {
        transportPools.forEach(poolConfig => {
            this.transportPools.set(poolConfig.name, new TransportPool(poolConfig));
        });
    }

    // ... rest of the run method as before ...
  }
}

SimulationEngine.$inject = ['elementRegistry'];
