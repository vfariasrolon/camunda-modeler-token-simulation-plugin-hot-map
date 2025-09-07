import StatisticalGenerator from './StatisticalGenerator';
import {
  is
} from 'bpmn-js/lib/util/ModelUtil';
import {
  find
} from 'min-dash';

/**
 * Motor de simulación de eventos discretos para procesos BPMN.
 */
export default class SimulationEngine {
  constructor(config, elementRegistry) {
    this._config = config;
    this._elementRegistry = elementRegistry;
    this._stats = new StatisticalGenerator();

    this._clock = 0;
    this._eventQueue = [];
    this._results = new Map();
    this._instances = new Map(); // Rastrear estado de cada instancia
    this._instanceCounter = 0;

    this._initResourcePools();
  }

  _initResourcePools() {
    this._resourcePools = new Map();
    const pools = this._config.global.resourcePools || [];
    for (const pool of pools) {
      this._resourcePools.set(pool.name, {
        quantity: pool.quantity,
        available: pool.quantity,
        queue: [] // Cola de espera para este recurso
      });
    }
  }

  _initResults() {
    for (const element of this._elementRegistry.getAll()) {
      this._results.set(element.id, {
        executionCount: 0,
        totalWaitTime: 0,
        totalProcessingTime: 0,
        totalCost: 0,
        // Para compuertas
        pathCounts: is(element, 'bpmn:Gateway') ? {} : undefined
      });
    }
  }

  _addEvent(event) {
    this._eventQueue.push(event);
    this._eventQueue.sort((a, b) => a.time - b.time); // Mantener la cola ordenada por tiempo
  }

  /**
   * Ejecuta la simulación completa.
   */
  run() {
    this._initResults(); // Inicializar aquí para asegurar que el elementRegistry esté poblado.
    console.log("Iniciando motor de simulación con configuración:", this._config);
    this._scheduleInitialEvents();

    while (this._eventQueue.length > 0) {
      const event = this._eventQueue.shift(); // Obtener el siguiente evento

      if (this._isSimulationEnd(event)) {
        console.log(`Condición de fin de simulación alcanzada en t=${this._clock}.`);
        break;
      }

      this._clock = event.time; // Avanzar el reloj

      // Procesar el evento
      switch (event.type) {
        case 'INSTANCE_ARRIVAL':
          this._handleInstanceArrival(event);
          break;
        case 'ELEMENT_ACTIVATE':
          this._handleElementActivate(event);
          break;
        case 'ELEMENT_COMPLETE':
          this._handleElementComplete(event);
          break;
        default:
          console.warn(`Tipo de evento desconocido: ${event.type}`);
      }
    }

    return this._calculateFinalResults();
  }

  _scheduleInitialEvents() {
    const startEventConfig = this._config.elements.get(this._findStartEvent().id);
    if (!startEventConfig || !startEventConfig.arrivalRate) {
        console.error("No se encontró configuración de llegada (arrivalRate) para el evento de inicio.");
        // Asumir una sola instancia al inicio si no hay configuración
        this._addEvent({ time: 0, type: 'INSTANCE_ARRIVAL' });
        return;
    }

    const maxInstances = this._config.global.simulationConfig.runValue || 1;
    let arrivalTime = 0;
    for (let i = 0; i < maxInstances; i++) {
        this._addEvent({ time: arrivalTime, type: 'INSTANCE_ARRIVAL' });
        const interArrivalTime = this._stats.generate(startEventConfig.arrivalRate);
        arrivalTime += interArrivalTime;
    }
  }

  _isSimulationEnd(event) {
    const config = this._config.global.simulationConfig;
    if (!config) return false;

    if (config.runUntil === 'time' && this._clock >= config.runValue) {
      return true;
    }
    // La condición de 'instances' se maneja al programar los eventos iniciales.
    // Si no hay más eventos, la simulación termina.
    return false;
  }

  _findStartEvent() {
      return this._elementRegistry.find(el => is(el, 'bpmn:StartEvent'));
  }

  _findNextElements(element, instanceId) {
    if (is(element, 'bpmn:EndEvent')) {
      return [];
    }

    // Lógica para compuertas exclusivas
    if (is(element, 'bpmn:ExclusiveGateway')) {
      const outgoing = element.outgoing || [];
      const choices = outgoing.map(flow => {
        const config = this._config.elements.get(flow.id) || {};
        return {
          element: flow.target,
          probability: config.branchingProbability || 0
        };
      });

      // Normalizar por si acaso, aunque el generador ya lo hace
      const totalProb = choices.reduce((sum, choice) => sum + choice.probability, 0);
      if (totalProb === 0) { // Si no hay probabilidades, elegir una al azar
          if(choices.length > 0) return [choices[this._getRandomInt(0, choices.length - 1)].element];
          return [];
      }

      const rand = Math.random() * totalProb;
      let cumulativeProb = 0;
      for (const choice of choices) {
        cumulativeProb += choice.probability;
        if (rand <= cumulativeProb) {
          // Registrar la ruta tomada para las estadísticas
          const gatewayResult = this._results.get(element.id);
          const flowId = choice.element.incoming[0].id;
          gatewayResult.pathCounts[flowId] = (gatewayResult.pathCounts[flowId] || 0) + 1;
          return [choice.element];
        }
      }
      return []; // No debería llegar aquí
    }

    // Flujo normal
    if (element.outgoing && element.outgoing.length > 0) {
      return element.outgoing.map(flow => flow.target);
    }

    return [];
  }

  _getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // --- MANEJADORES DE EVENTOS ---

  _handleInstanceArrival(event) {
    const instanceId = `instance_${this._instanceCounter++}`;
    this._instances.set(instanceId, {
      id: instanceId,
      state: 'ACTIVE',
      startTime: this._clock
    });

    const startEvent = this._findStartEvent();
    if (startEvent) {
      this._addEvent({
        time: this._clock,
        type: 'ELEMENT_ACTIVATE',
        elementId: startEvent.id,
        instanceId: instanceId,
        activatedAt: this._clock
      });
    }
  }

  _handleElementActivate(event) {
    const { elementId, instanceId, activatedAt } = event;
    const element = this._elementRegistry.get(elementId);
    const elementConfig = this._config.elements.get(elementId) || {};
    const results = this._results.get(elementId);

    results.executionCount++;

    const waitTime = this._clock - activatedAt;
    results.totalWaitTime += waitTime;

    if (is(element, 'bpmn:Task')) {
      const resourceInfo = elementConfig.resources;
      if (resourceInfo) {
        const pool = this._resourcePools.get(resourceInfo.pool);
        if (pool && pool.available >= resourceInfo.quantityRequired) {
          // Recurso disponible, iniciar tarea
          pool.available -= resourceInfo.quantityRequired;

          const processingTime = this._stats.generate(elementConfig.processingTime);
          results.totalProcessingTime += processingTime;

          if (elementConfig.cost) {
              const costPerMinute = elementConfig.cost.type === 'perHour' ? elementConfig.cost.value / 60 : 0;
              results.totalCost += costPerMinute * processingTime;
          }

          this._addEvent({
            time: this._clock + processingTime,
            type: 'ELEMENT_COMPLETE',
            elementId: elementId,
            instanceId: instanceId,
            activatedAt: this._clock,
            resourceInfo: resourceInfo // Pasar info del recurso para liberarlo
          });
        } else {
          // Recurso no disponible, poner en cola
          pool.queue.push(event);
        }
      } else {
        // Tarea sin recurso, procesar inmediatamente
         this._addEvent({ time: this._clock, type: 'ELEMENT_COMPLETE', elementId, instanceId });
      }
    } else if (is(element, 'bpmn:EndEvent')) {
      const instance = this._instances.get(instanceId);
      instance.state = 'COMPLETED';
      instance.endTime = this._clock;
    } else {
      // Para StartEvents, Gateways, etc. se completan instantáneamente
      this._addEvent({
        time: this._clock,
        type: 'ELEMENT_COMPLETE',
        elementId: elementId,
        instanceId: instanceId
      });
    }
  }

  _handleElementComplete(event) {
    const { elementId, instanceId, resourceInfo } = event;
    const element = this._elementRegistry.get(elementId);

    // Liberar recurso si fue utilizado
    if (resourceInfo) {
      const pool = this._resourcePools.get(resourceInfo.pool);
      pool.available += resourceInfo.quantityRequired;

      // Si hay alguien esperando por este recurso, activarlo
      if (pool.queue.length > 0) {
        const waitingEvent = pool.queue.shift();
        this._addEvent({
          ...waitingEvent,
          time: this._clock, // Activar ahora
          activatedAt: waitingEvent.activatedAt // Mantener el tiempo original de activación para calcular espera
        });
      }
    }

    // Encontrar y activar los siguientes elementos
    const nextElements = this._findNextElements(element, instanceId);
    for (const nextEl of nextElements) {
      this._addEvent({
        time: this._clock,
        type: 'ELEMENT_ACTIVATE',
        elementId: nextEl.id,
        instanceId: instanceId,
        activatedAt: this._clock
      });
    }
  }

  _calculateFinalResults() {
    const finalResults = new Map();

    for (const [elementId, result] of this._results.entries()) {
      const count = result.executionCount || 1;
      finalResults.set(elementId, {
        ...result,
        avgWaitTime: result.totalWaitTime / count,
        avgProcessingTime: result.totalProcessingTime / count,
        avgCycleTime: (result.totalWaitTime + result.totalProcessingTime) / count,
        totalCost: result.totalCost,
        // Añadir info de utilización de recursos y compuertas si es relevante
      });
    }
    console.log("Simulación finalizada. Resultados calculados:", finalResults);
    return finalResults;
  }
}
