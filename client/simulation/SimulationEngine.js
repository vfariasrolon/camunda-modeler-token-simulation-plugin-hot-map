import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, isLabel, resumenMuestras } from './util';
import BusinessCalendar from './BusinessCalendar.js';
import { normalizeWarmup, effectiveDuration, describeWarmup } from './WarmupCurve.js';

/**
 * Muestreo de una distribucion triangular por inversa de la CDF.
 *
 * Para triangular(a, m, b) con a <= m <= b:
 *   F(x) = (x-a)^2 / ((m-a)(b-a))   para a <= x <= m
 *   F(x) = 1 - (b-x)^2 / ((b-m)(b-a))  para m <= x <= b
 *
 * El punto de corte es F(m) = (m-a)/(b-a).
 *
 * ERROR CORREGIDO: estaba escrito como su reciproco, (b-a)/(m-a). Como ese
 * valor es >= 1 siempre (rand pertenece a [0,1)), la condicion `rand < F` era
 * SIEMPRE verdadera: la segunda rama era codigo muerto y el maximo configurado
 * nunca se alcanzaba. Con triangular(1, 2, 4) el soporte real terminaba en
 * 2,73 en lugar de 4, y un 27% de la distribucion era inalcanzable.
 */
const triangular = (min, mode, max, rand) => {
  // Guardas: sin ellas un mode fuera de rango da Math.sqrt de un negativo (NaN)
  // y un min == max da division por cero. El NaN se propagaba a las fechas y al
  // orden de la cola de eventos sin lanzar ningun error.
  if (!(max > min)) return min;
  if (mode < min) mode = min;
  if (mode > max) mode = max;

  // `rand` se recibe de fuera cuando hay semilla (azar reproducible); si no, se
  // toma del generador global.
  const u = rand == null ? Math.random() : rand;

  const F = (mode - min) / (max - min);
  return u < F
    ? min + Math.sqrt(u * (mode - min) * (max - min))
    : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
};

/**
 * Generador pseudoaleatorio DETERMINISTA (mulberry32).
 *
 * El motor usaba Math.random() en todo, asi que dos corridas del mismo modelo
 * daban numeros distintos y no habia forma de comparar escenarios con justicia.
 * Con semilla se consiguen tres cosas, y la tercera es la que mas vale:
 *
 *   1. Reproducibilidad: la misma corrida da el mismo resultado.
 *   2. Replicas de verdad: varias semillas -> intervalo de confianza.
 *   3. NUMEROS ALEATORIOS COMUNES: dos escenarios ven la MISMA secuencia, asi que
 *      la diferencia se debe al cambio y no a la suerte. Sin esto, comparar un
 *      lote de 20 con uno de 50 es comparar dos muestras pequenas: ruido contra
 *      ruido.
 */
const crearAleatorio = (semilla) => {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Semilla declarada, o null para sacarla del reloj (corrida no reproducible). */
const normalizarSemilla = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

// ---------------------------------------------------------------------------
// Lotes.
//
// En modo lote las instancias NO llegan una a una: llegan en grupos, y los
// grupos van ESTRICTAMENTE EN SERIE, uno detras de otro (por traccion: el
// siguiente arranca cuando cierra el anterior). Eso tiene tres consecuencias:
//
//   - No hay cola ENTRE lotes; la espera esta DENTRO del lote.
//   - El paron entre lotes se VE y se mide: es el precio de la politica.
//   - El tamano de muestra efectivo son los LOTES, no los tokens. 1.000 piezas
//     en 50 lotes no son 1.000 muestras del patron de llegada: son 50.
// ---------------------------------------------------------------------------
const LOT_SIZE_MODES = [ 'fixed', 'triangular', 'empirical' ];

const normalizeLots = (cfg) => {
  const c = cfg || {};
  const tabla = Array.isArray(c.table)
    ? c.table
      .map((f) => ({
        size: Math.max(1, Math.round(Number(f && f.size) || 1)),
        weight: Math.max(0, Number(f && f.weight) || 0)
      }))
      .filter((f) => f.weight > 0)
    : [];

  return {
    enabled: Boolean(c.enabled),
    sizeMode: LOT_SIZE_MODES.includes(c.sizeMode) ? c.sizeMode : 'fixed',
    size: Math.max(1, Math.round(Number(c.size) || 1)),
    min: Math.max(1, Math.round(Number(c.min) || 1)),
    mode: Math.max(1, Math.round(Number(c.mode) || 1)),
    max: Math.max(1, Math.round(Number(c.max) || 1)),
    table: tabla,
    // El paron de cambio de herramienta entre lotes, en minutos de trabajo. Es
    // el objetivo de un SMED y lo que se cotiza: «si bajo el cambio de 20 a 5
    // minutos, cuanto gano».
    stopMinutes: Math.max(0, Number(c.stopMinutes) || 0)
  };
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
    // `quantity` se guarda aparte de `available` porque `available` cambia con el
    // uso y la capacidad total hace falta para calcular la utilizacion.
    this.quantity = config.quantity;
    this.available = config.quantity;
    this.queue = [];
    // Minutos-recurso consumidos: lo que ocupan las tareas que usan esta piscina
    // (duracion x unidades tomadas). Es el numerador de la utilizacion.
    this.busyMinutes = 0;
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
    // Semilla resuelta de la corrida en curso (vacia mientras no se corra nada).
    // Se fija en `initialize()` para que las VARIAS pasadas de una misma corrida
    // (plan normal y plan con horas extra) compartan el mismo azar.
    this._semillaDeLaCorrida = null;
  }

  /**
   * Empieza una corrida nueva.
   *
   * Una «corrida» puede incluir varias pasadas (normal y con horas extra), y
   * todas deben usar el MISMO azar para que la comparacion sea limpia. Esto es
   * lo que separa una corrida de la siguiente: si el campo de semilla esta
   * vacio, cada corrida saca una nueva, y dentro de ella todos los planes la
   * comparten.
   */
  nuevaCorrida() {
    this._semillaDeLaCorrida = null;
  }

  initialize(rootConfig) {
    this.rootConfig = rootConfig;
    this.calendar = new BusinessCalendar(rootConfig.calendar);

    // Calendario ESTANDAR (sin horas extra), creado una sola vez y reutilizado.
    // Hace falta aunque se corra con horas extra, porque `this.calendar` se
    // sustituye por el extendido (linea ~343) y necesitamos una referencia fija
    // al horario normal para: medir las horas extra reales de cada tarea y
    // medir esperas y ciclos de forma comparable en los dos planes.
    this.standardCalendar = new BusinessCalendar(rootConfig.calendar);

    // Curva de arranque: se DECLARA (no se mide) y afecta a la duracion en RELOJ
    // de las tareas, no al trabajo contabilizado. Sin `warmup` en la
    // configuracion no hay arranque, que es el comportamiento de siempre.
    this.warmup = normalizeWarmup(rootConfig.warmup);

    // Semilla. Con ella la corrida es reproducible y, sobre todo, dos escenarios
    // se pueden comparar sobre el MISMO azar. Sin semilla declarada se saca del
    // reloj, pero la usada se guarda (y se imprime): asi una corrida interesante
    // se puede repetir exactamente.
    const semillaDeclarada = normalizarSemilla(rootConfig.seed);
    if (semillaDeclarada != null) {
      this.seed = semillaDeclarada;
    } else if (this._semillaDeLaCorrida == null) {
      // Sin semilla declarada se saca UNA por corrida, no una por pasada: los
      // planes normal y con horas extra comparten secuencia (numeros aleatorios
      // comunes). Sacandola en cada `initialize()` los dos planes usaban azar
      // distinto y el informe imprimia dos semillas distintas para lo que el
      // usuario cree que es una sola corrida. `nuevaCorrida()` borra esta.
      this.seed = Date.now() % 2147483647;
    } else {
      this.seed = this._semillaDeLaCorrida;
    }
    this._semillaDeLaCorrida = this.seed;
    this._random = crearAleatorio(this.seed);

    // Lotes. `enabled: false` (el defecto) mantiene el comportamiento de siempre:
    // llegadas una a una.
    this.lotConfig = normalizeLots(rootConfig.lots);
    this.lots = [];
    this.lotNumber = 0;
    this.lotStats = {
      lots: 0, stops: 0, stopMinutes: 0,
      waits: 0, waitMinutes: 0, waitsOverTolerance: 0,
      perLotTaskExecutions: 0
    };

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

    // Muestras por caso. Los totales por elemento dan medias, pero una media
    // esconde la cola: el p95 del tiempo de ciclo es lo que rompe un plazo.
    this.instanceCycleTimes = [];

    // Utilizacion por piscina. Se rellena al final de run(), cuando ya se conoce
    // la ventana simulada (que depende del calendario activo).
    this.utilization = new Map();
    this.overtimeCalendarConfig = null;

    // Desglose explicito del tiempo extra por tramo. Se acumula aqui (y no se
    // deduce de la prima) para poder COMPROBARLO en el informe: prima = horas x
    // tarifa x (multiplicador - 1), asi que sin las horas el reparto semanal
    // doble/triple no es auditable a mano.
    this.overtimeBreakdown = { normalMs: 0, excessMs: 0 };

    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        totalOvertime: 0, totalReworkTime: 0, totalWaitTimeCost: 0,
        totalOperationCost: 0,
        totalDoubleOvertimeCost: 0,
        totalTripleOvertimeCost: 0,
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
      const rand = this._random();
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
    this.clock = event.time;

    // INSTANCE_COMPLETE NO es una ejecucion del elemento: se emite llevando el
    // elemento terminal como transporte para cerrar el caso. Contarlo aqui
    // sumaba DOS ejecuciones al ultimo elemento del diagrama (una por su propio
    // evento y otra por el cierre), lo que duplicaba su "Frecuencia" y dividia
    // a la mitad su tiempo de ciclo promedio (que se acumula justo aqui abajo).
    if (type === 'INSTANCE_COMPLETE') {
      this.completedInstances++;

      const completionDate = new Date(this.clock);
      const dayKey = `${completionDate.getFullYear()}-${String(completionDate.getMonth() + 1).padStart(2, '0')}-${String(completionDate.getDate()).padStart(2, '0')}`;
      const currentCount = this.dailyCompletions.get(dayKey) || 0;
      this.dailyCompletions.set(dayKey, currentCount + 1);

      // console.log(`Instance ${instanceId} completed. Total completed: ${this.completedInstances}`);
      const standardCalendar = this.standardCalendar;
      const cicloMin = standardCalendar.calculateBusinessDurationInMinutes(new Date(startTime), new Date(this.clock));
      elementResults.totalCycleTime += cicloMin;
      // Muestra individual, para percentiles e histograma. Se mide en el
      // calendario ESTANDAR en los dos planes, para que los tiempos de ciclo del
      // plan normal y del de horas extra sean comparables entre si.
      this.instanceCycleTimes.push(cicloMin);

      // Cierre de lote: se consulta ANTES de borrar el estado, que es donde vive
      // el numero de lote de la instancia.
      const estadoInstancia = this.instanceStates.get(instanceId);
      if (this.lotConfig.enabled && estadoInstancia && estadoInstancia.lotNumber) {
        this._cerrarLoteSiProcede(estadoInstancia.lotNumber, this.clock);
      }

      this.instanceStates.delete(instanceId);
      return;
    }

    // Un token que solo CONTINUA tras una tarea por lote no cuenta como una
    // ejecucion suya: la tarea por lote se ejecuto una vez, no una por token.
    if (!event.continuacionDeLote) elementResults.executionCount++;

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
        // Tarea POR LOTE: la ejecuta una sola vez el primer token que llega, y
        // los demas esperan (barrera). Ver _atenderTareaPorLote.
        if (data.frequency === 'lot' && this.lotConfig.enabled) {
          this._atenderTareaPorLote(nextElement, data, instanceId, startTime, this.clock);
        } else {
          this.scheduleTask({ type: 'TASK_START', element: nextElement, time: this.clock, instanceId, startTime });
        }
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
        const randomValue = triangular(pt.min, pt.mode, pt.max, this._random());
        processingTime = timeToMilliseconds(randomValue, pt.unit);
      } else {
        processingTime = timeToMilliseconds(pt.value, pt.unit);
      }
    }

    let reworkTime = 0;
    if (data.failureRate && this._random() < data.failureRate) {
      const rt = data.reworkTime;
      if (rt) {
        if (rt.distribution === 'triangular') {
          const randomValue = triangular(rt.min, rt.mode, rt.max, this._random());
          reworkTime = timeToMilliseconds(randomValue, rt.unit);
        } else {
          reworkTime = timeToMilliseconds(rt.value, rt.unit);
        }
      }
      this.results.get(element.id).failureCount++;
    }

    const totalTaskDurationInMillis = processingTime + reworkTime;

    // Curva de arranque: el MISMO trabajo cuesta mas tiempo de reloj si arranca
    // dentro de la rampa de su tramo. Se aplica desde el inicio EFECTIVO de la
    // tarea, asi que una tarea que espera una hora no sufre el arranque (cuando
    // por fin empieza, el tramo ya lleva una hora en marcha).
    const duracionEfectivaMs = this._msConArranque(totalTaskDurationInMillis, new Date(time));

    const { overtime, endTime } = this.calendar.calculateBusinessTime(new Date(time), duracionEfectivaMs / 60000, this.standardCalendar);

    // "Costo de Operación" es el coste de las horas que se PAGAN a tarifa base.
    // Se usa la duracion efectiva: si alguien va lento al arrancar esta en el
    // puesto mas tiempo, y ese tiempo se paga. Ademas asi la rampa TIENE coste,
    // que es justo lo que se quiere medir. Sin arranque declarado, la duracion
    // efectiva es la real y el coste no cambia.
    const operationCost = (duracionEfectivaMs / 3600000) * baseRatePerHour;

    // Overtime cost is the PREMIUM ONLY.
    // Cupo semanal indexado por semana ISO COMPLETA (año + numero). Con solo el
    // numero, la semana 1 de un año y la del siguiente compartian contador.
    const weekKey = this.calendar.getWeekKey(new Date(endTime));
    const currentWeeklyOvertime = this.weeklyStats.get(weekKey) || 0;
    const overtimeRules = this.rootConfig.overtime;
    const limitInMillis = (overtimeRules.limitHours * 3600000) || 0;

    const taskOvertimeDuration = overtime;
    const normalOvertime = Math.min(taskOvertimeDuration, Math.max(0, limitInMillis - currentWeeklyOvertime));
    const excessOvertime = Math.max(0, taskOvertimeDuration - normalOvertime);

    const doubleOvertimePremium = (normalOvertime / 3600000) * baseRatePerHour * (overtimeRules.payMultiplier - 1);
    const tripleOvertimePremium = (excessOvertime / 3600000) * baseRatePerHour * (overtimeRules.excessPayMultiplier - 1);

    this.overtimeBreakdown.normalMs += normalOvertime;
    this.overtimeBreakdown.excessMs += excessOvertime;

    this.weeklyStats.set(weekKey, currentWeeklyOvertime + taskOvertimeDuration);

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
      operationCost,
      doubleOvertimePremium,
      tripleOvertimePremium,
      quantityRequired,
      totalDuration: totalTaskDurationInMillis,
      // Duracion de RELOJ con el arranque aplicado. Se guarda aparte de
      // `totalDuration` porque el camino de espera por recursos vuelve a calcular
      // el fin desde su propio inicio, y alli el arranque se reevalua.
      effectiveDuration: duracionEfectivaMs,
      // Tareas POR LOTE: al terminar hay que despertar a los tokens que esperaban
      // la barrera, y hay que saber de que lote era.
      esTareaDeLote: Boolean(taskEvent.esTareaDeLote),
      lotNumber: taskEvent.lotNumber || null
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
    const startEvents = this._elementRegistry.filter(el => !isLabel(el) && is(el, 'bpmn:StartEvent'));
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
      // Los descansos se mantienen en la jornada extendida salvo que su
      // interruptor diga lo contrario: «¿el descanso existe en el tramo de horas
      // extra?» es una casilla del configurador de horarios y extras, porque en
      // planta puede pasar cualquiera de las dos cosas.
      // Se filtra ANTES de construir el calendario: despues no serviria de nada.
      overtimeCalendarConfig.breaks = (overtimeCalendarConfig.breaks || [])
        .filter((b) => !(b && b.existeEnExtra === false));

      this.calendar = new BusinessCalendar(overtimeCalendarConfig);

      // Se guarda porque el calendario se restaura al terminar `run()`: sin esto,
      // la jornada extendida (dato que imprime el informe) se perderia.
      this.overtimeCalendarConfig = overtimeCalendarConfig;
    }

    console.log(`--- Simulation Starting (useOvertime: ${options.useOvertime}) ---`);

    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const processConfig = getSimulationData(processRoot);
    const { runValue } = this.rootConfig.simulationConfig || { runValue: 100 };
    if (processConfig && processConfig.resourcePools) {
      processConfig.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }

    const startEvents = this._elementRegistry.filter(el => !isLabel(el) && is(el, 'bpmn:StartEvent'));
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

    this.runValue = runValue;
    this.startEvent = startEvents[0];
    this.instanceCounter = 0;

    if (this.lotConfig.enabled) {
      // Lotes en SERIE por traccion: se libera el primero, y cada siguiente
      // arranca cuando CIERRA el anterior (ver _cerrarLoteSiProcede). No hay dos
      // lotes a la vez, asi que no hay cola entre lotes: la espera esta dentro.
      this._liberarLote(this.simulationStartTime);
    } else {
      startEvents.forEach((startEvent, index) => {
        const instanceId = index + 1;
        const startTime = this.simulationStartTime;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: startTime, instanceId, startTime: startTime });
        this.instanceStates.set(instanceId, { gateways: {} });
      });
      this.instanceCounter = startEvents.length;
    }

    let iterationCounter = 0;

    while (!this.eventQueue.isEmpty()) {
      iterationCounter++;
      if (iterationCounter > (runValue * 1000)) {
        throw new Error(`Simulation safety break triggered. Exceeded ${runValue * 1000} iterations. Likely an infinite loop.`);
      }

      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'LOT_TASK_START') {
        // Una tarea por lote que estaba esperando la barrera arranca ahora.
        this._iniciarTareaDeLote(event);
      } else if (event.type === 'LOT_CONTINUE') {
        // Un token que esperaba la barrera sigue: NO pasa por la contabilidad de
        // tareas, porque no es una finalizacion de tarea.
        this.processEvent(event);
      } else if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);

        results.totalProcessingTime += event.processingTime;
        results.totalReworkTime += event.reworkTime;
        results.totalOvertime += event.overtime;

        // Accumulate new cost components
        results.totalOperationCost += event.operationCost;
        results.totalDoubleOvertimeCost += event.doubleOvertimePremium;
        results.totalTripleOvertimeCost += event.tripleOvertimePremium;

        const waitTimeCost = results.totalWaitTimeCost;
        // The total cost is the sum of its parts.
        results.totalCost = (results.totalCost - waitTimeCost) + event.operationCost + event.doubleOvertimePremium + event.tripleOvertimePremium + waitTimeCost;

        if (event.waitStart) {
          const standardCalendar = this.standardCalendar;
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

          // Utilizacion: minutos-recurso consumidos. Se cuentan al COMPLETAR la
          // tarea (no al pedir el recurso) porque solo entonces consta que el
          // recurso trabajo de verdad esa duracion. Se usa la efectiva: si va
          // lento al arrancar, el puesto esta ocupado mas tiempo.
          pool.busyMinutes += ((event.effectiveDuration || event.totalDuration) / 60000) * event.quantityRequired;

          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            const nextTaskResults = this.results.get(nextTask.element.id);
            const standardCalendar = this.standardCalendar;
            const waitTime = standardCalendar.calculateBusinessDurationInMinutes(new Date(nextTask.waitStart), new Date(this.clock));
            nextTaskResults.totalWaitTime += waitTime;
            const waitCostPerHour = this.rootConfig.cost.waitCostPerHour || 0;
            const currentWaitCost = (waitTime / 60) * waitCostPerHour;
            nextTaskResults.totalWaitTimeCost += currentWaitCost;
            nextTaskResults.totalCost += currentWaitCost;

            // La tarea arranca AHORA: el arranque se reevalua desde este inicio,
            // no desde el que tenia cuando se encolo.
            const efectiva = this._msConArranque(nextTask.totalDuration, new Date(this.clock));
            nextTask.effectiveDuration = efectiva;
            nextTask.time = this.calendar.addWorkingTime(new Date(this.clock), efectiva / 60000).getTime();
            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          });
        }

        // Tarea por lote: al terminar hay que despertar a los que esperaban la
        // barrera. Va antes de processEvent para que los despiertos entren en la
        // cola en el mismo instante.
        if (event.esTareaDeLote) this._cerrarTareaDeLote(event);

        this.processEvent(event);
      } else {
        this.processEvent(event);
      }

      // Llegada de la siguiente instancia. En modo LOTES no se usa: alli las
      // instancias de un lote entran juntas y el siguiente lote lo dispara el
      // cierre del anterior.
      if (!this.lotConfig.enabled && is(event.element, 'bpmn:StartEvent') && this.instanceCounter < runValue) {
        this.instanceCounter++;
        const arrivalIntervalInMinutes = arrivalInterval / 60000;
        const nextArrivalTime = this.calendar.addWorkingTime(new Date(event.time), arrivalIntervalInMinutes).getTime();
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvents[0], time: nextArrivalTime, instanceId: this.instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(this.instanceCounter, { gateways: {} });
      }
      if (this.completedInstances >= runValue) {
        console.log(`Target of ${runValue} completed instances reached. Ending simulation.`);
        break;
      }
    }

    console.log("--- Simulation Finished ---");

    this._calcularUtilizacion();

    this._logReport(options.useOvertime, runValue);

    this.calendar = originalCalendar;

    return this.results;
  }

  /**
   * Calcula la utilizacion (rho) de cada piscina de recursos.
   *
   *   rho = minutos-recurso ocupados / minutos-recurso disponibles
   *
   * Los disponibles se miden en el calendario ACTIVO: con horas extra la jornada
   * es mas larga, asi que hay mas capacidad y rho baja. Esa es precisamente la
   * razon de abrir horas extra, y por eso se usa el calendario de cada plan y no
   * una constante.
   *
   * Se debe llamar ANTES de restaurar el calendario original.
   */
  _calcularUtilizacion() {
    const ventanaMin = this.calendar.calculateBusinessDurationInMinutes(
      new Date(this.simulationStartTime),
      new Date(this.clock)
    );

    this.utilization = new Map();

    this.resourcePools.forEach((pool, nombre) => {
      const cantidad = pool.quantity || 0;
      const disponible = ventanaMin * cantidad;

      this.utilization.set(nombre, {
        name: nombre,
        quantity: cantidad,
        windowMinutes: Math.round(ventanaMin),
        busyMinutes: Math.round(pool.busyMinutes),
        availableMinutes: Math.round(disponible),
        utilization: disponible > 0 ? pool.busyMinutes / disponible : 0
      });
    });
  }

  /**
   * Minutos de RELOJ (en ms) que cuesta un trabajo, con la curva de arranque ya
   * aplicada desde el inicio efectivo de la tarea.
   *
   * Se aplica desde el momento en que la tarea empieza DE VERDAD, no cuando se
   * encola: si espera una hora por un recurso, cuando por fin arranca el tramo ya
   * lleva una hora en marcha y no le toca arranque.
   *
   * Y cada TRAMO es un disparador: el primero del dia es el arranque de jornada y
   * los siguientes son el regreso de un descanso. Los dos interruptores del
   * configurador deciden cuales se aplican.
   */
  _msConArranque(realMs, desde) {
    const cfg = this.warmup;
    const minutos = realMs / 60000;
    if (!cfg || cfg.shape === 'none' || !(minutos > 0)) return realMs;

    const inicioTramo = this.calendar.inicioDeTramo(desde);
    if (!inicioTramo) return realMs;

    const esPrimero = this.calendar.esPrimerTramo(inicioTramo);
    if (esPrimero ? !cfg.onShiftStart : !cfg.onBreakReturn) return realMs;

    const transcurrido = Math.max(0, (desde.getTime() - inicioTramo.getTime()) / 60000);
    return effectiveDuration(minutos, transcurrido, cfg) * 60000;
  }

  /**
   * Tamano del siguiente lote, segun la secuencia declarada.
   *
   * Los tres modos cubren lo que se ve en planta: tamano fijo, tamano que varia
   * (triangular) y tamanos reales con sus frecuencias (tabla empirica, que es la
   * que mejor refleja como llegan los pedidos de verdad).
   */
  _tamanoDeLote() {
    const c = this.lotConfig;

    if (c.sizeMode === 'triangular') {
      const min = Math.min(c.min, c.max);
      const max = Math.max(c.min, c.max);
      const moda = Math.min(max, Math.max(min, c.mode));
      return Math.max(1, Math.round(triangular(min, moda, max, this._random())));
    }

    if (c.sizeMode === 'empirical' && c.table.length) {
      const total = c.table.reduce((a, f) => a + f.weight, 0);
      let r = this._random() * total;
      for (let i = 0; i < c.table.length; i++) {
        r -= c.table[i].weight;
        if (r <= 0) return c.table[i].size;
      }
      return c.table[c.table.length - 1].size;
    }

    return c.size;
  }

  /**
   * Libera un lote: sus instancias ENTRAN JUNTAS en ese instante.
   *
   * El tamano se recorta a lo que falta para el objetivo, asi que el total de
   * instancias creadas es exactamente `runValue` y el ultimo lote puede salir
   * incompleto — que es lo que pasa de verdad.
   */
  _liberarLote(tiempo) {
    if (!this.startEvent) return;

    const restantes = this.runValue - this.instanceCounter;
    if (restantes <= 0) return;

    const tamano = Math.min(this._tamanoDeLote(), restantes);
    this.lotNumber++;

    const lote = {
      number: this.lotNumber,
      size: tamano,
      startTime: tiempo,
      endTime: null,
      pending: tamano,
      stopMinutes: 0,
      // Estado de las tareas POR LOTE de este lote (se crea al vuelo).
      tareas: new Map()
    };
    this.lots.push(lote);
    this.lotStats.lots++;

    for (let i = 0; i < tamano; i++) {
      this.instanceCounter++;
      const instanceId = this.instanceCounter;
      this.instanceStates.set(instanceId, { gateways: {}, lotNumber: lote.number });
      this.eventQueue.add({
        type: 'GATEWAY_COMPLETE',
        element: this.startEvent,
        time: tiempo,
        instanceId,
        startTime: tiempo
      });
    }
  }

  /**
   * Cierra el lote cuando su ULTIMA instancia termina, aplica el paron de cambio
   * y dispara el siguiente lote (traccion: uno detras de otro).
   *
   * El paron se MIDE porque es el precio exacto de la politica de lotes, y es la
   * cifra que justifica (o descarta) un SMED.
   */
  _cerrarLoteSiProcede(lotNumber, tiempo) {
    const lote = this.lots[lotNumber - 1];
    if (!lote || lote.endTime != null) return;

    lote.pending--;
    if (lote.pending > 0) return;

    lote.endTime = tiempo;

    if (this.completedInstances < this.runValue) {
      const parada = this.lotConfig.stopMinutes;
      lote.stopMinutes = parada;

      // El paron SOLO ocurre si hay un lote despues: no se cambia herramienta
      // para cerrar la produccion. Contarlo en el ultimo lote inflaba el total
      // (con 2 lotes daba 2 parones en vez de 1, y el doble de minutos).
      if (parada > 0) {
        this.lotStats.stops++;
        this.lotStats.stopMinutes += parada;
      }

      const siguiente = parada > 0
        ? this.calendar.addWorkingTime(new Date(tiempo), parada).getTime()
        : tiempo;
      this._liberarLote(siguiente);
    }
  }

  /**
   * Tarea POR LOTE: se ejecuta UNA vez por lote, la primera vez que el flujo pasa
   * por ahi, y los demas tokens ESPERAN a que termine (barrera).
   *
   * Es la tarea administrativa: un documento de 30 minutos hecho por PIEZA en un
   * lote de 20 son 10 horas; hecho por LOTE, 30 minutos. Un factor 20x — y la
   * razon de fondo por la que producir por lotes abarata lo administrativo.
   *
   * En modo individual (sin lotes) se comporta como una tarea normal, para no
   * dejar el modelo a medias.
   */
  _atenderTareaPorLote(element, data, instanceId, startTime, tiempo) {
    const estadoInstancia = this.instanceStates.get(instanceId);
    const lote = estadoInstancia && estadoInstancia.lotNumber
      ? this.lots[estadoInstancia.lotNumber - 1]
      : null;

    if (!lote) {
      this.scheduleTask({ type: 'TASK_START', element, time: tiempo, instanceId, startTime });
      return;
    }

    const estado = lote.tareas.get(element.id) || { fase: 'pendiente', esperando: [] };

    // Ya satisfecha: este token sigue de largo, sin volver a ejecutarla.
    if (estado.fase === 'hecha') {
      this._continuarTrasTareaDeLote(element, instanceId, startTime, tiempo);
      return;
    }

    // En curso: el lote entero espera. Se apunta para despertarlo al terminar.
    if (estado.fase === 'en curso') {
      estado.esperando.push({ instanceId, startTime });
      lote.tareas.set(element.id, estado);
      return;
    }

    // Primera vez. La fase se reserva ANTES de programar nada: scheduleTask puede
    // encolar eventos que volverian a entrar aqui.
    estado.fase = 'en curso';
    estado.esperando = [];
    lote.tareas.set(element.id, estado);

    const espera = this._esperaDeBarrera(data);

    if (espera > 0) {
      // La tarea no empieza hasta que atiendan. Se programa un ARRANQUE para
      // entonces, y asi el recurso (si lo pide) no se toma antes de tiempo.
      const inicio = this.calendar.addWorkingTime(new Date(tiempo), espera).getTime();
      this.eventQueue.add({
        type: 'LOT_TASK_START', element, time: inicio, instanceId, startTime, lotNumber: lote.number
      });
    } else {
      this.scheduleTask({
        type: 'TASK_START', element, time: tiempo, instanceId, startTime,
        esTareaDeLote: true, lotNumber: lote.number
      });
    }
  }

  /**
   * Espera de la barrera: cuanto tarda en atender quien tiene que firmar.
   *
   * Se modela por su EFECTO y no como una persona, porque su agenda no se conoce
   * y modelarla seria falsa precision: con probabilidad p atienden a la primera y
   * si no, el lote espera lo que diga la distribucion. La TOLERANCIA define que
   * espera cuenta como paron reportable; sin umbral, cada espera de tres minutos
   * ensucia el informe y al final nadie lo lee.
   */
  _esperaDeBarrera(data) {
    const b = data && data.barrier;
    if (!b) return 0;

    const p = b.availableProbability == null
      ? 1
      : Math.max(0, Math.min(1, Number(b.availableProbability)));
    if (this._random() < p) return 0;

    let espera = triangular(
      Number(b.waitMin) || 0,
      Number(b.waitMode) || 0,
      Number(b.waitMax) || 0,
      this._random()
    );
    if (!(espera > 0)) espera = 0;

    if (espera > 0) {
      this.lotStats.waits++;
      this.lotStats.waitMinutes += espera;
      const tolerancia = Math.max(0, Number(b.toleranceMinutes) || 0);
      if (espera > tolerancia) this.lotStats.waitsOverTolerance++;
    }

    return espera;
  }

  /** Arranca de verdad una tarea por lote que esperaba la barrera. */
  _iniciarTareaDeLote(event) {
    this.scheduleTask({
      type: 'TASK_START',
      element: event.element,
      time: event.time,
      instanceId: event.instanceId,
      startTime: event.startTime,
      esTareaDeLote: true,
      lotNumber: event.lotNumber
    });
  }

  /**
   * Al terminar una tarea por lote: se marca como hecha y se despierta a TODOS
   * los tokens que esperaban la barrera.
   */
  _cerrarTareaDeLote(event) {
    const lote = this.lots[(event.lotNumber || 0) - 1];
    if (!lote) return;

    const estado = lote.tareas.get(event.element.id);
    if (!estado || estado.fase !== 'en curso') return;

    estado.fase = 'hecha';
    this.lotStats.perLotTaskExecutions++;

    const esperando = estado.esperando || [];
    estado.esperando = [];

    esperando.forEach(({ instanceId, startTime }) => {
      this._continuarTrasTareaDeLote(event.element, instanceId, startTime, this.clock);
    });
  }

  /**
   * Un token que esperaba la barrera sigue su camino.
   *
   * Va como LOT_CONTINUE, y NO como TASK_COMPLETE: la continuacion no es una
   * finalizacion de tarea y no tiene duraciones ni costos. Si se enviara como
   * TASK_COMPLETE, la contabilidad leeria `processingTime` (que aqui no existe) y
   * sumaria `undefined`, dejando las metricas del elemento en NaN.
   *
   * `continuacionDeLote` hace que processEvent enlace los sucesores pero NO
   * cuente una ejecucion: la tarea por lote se ejecuto una vez, no una por token.
   */
  _continuarTrasTareaDeLote(element, instanceId, startTime, tiempo) {
    this.eventQueue.add({
      type: 'LOT_CONTINUE',
      element,
      time: tiempo,
      instanceId,
      startTime,
      continuacionDeLote: true
    });
  }

  /**
   * Descripcion legible del intervalo entre llegadas.
   *
   * `arrivalRate` es una TASA (llegadas por unidad de tiempo), NO un intervalo:
   * `{ value: 60, unit: 'minute' }` significa 60 llegadas por minuto, es decir
   * una cada SEGUNDO, no una cada 60 minutos. Es la confusion mas facil de
   * cometer al leer la tabla, asi que el informe la imprime resuelta.
   */
  _intervaloLlegada() {
    const rate = this.rootConfig.arrivalRate || { value: 1, unit: 'minute' };
    if (!(rate.value > 0)) return 'sin llegadas (tasa 0: solo se ejecuta la instancia inicial)';

    const segundos = rate.unit === 'second' ? 1 / rate.value
      : rate.unit === 'hour' ? 3600 / rate.value
      : 60 / rate.value;

    if (segundos < 1) return `una cada ${(segundos * 1000).toFixed(0)} ms`;
    if (segundos < 90) return `una cada ${segundos.toFixed(1)} s`;
    return `una cada ${(segundos / 60).toFixed(1)} min`;
  }

  /**
   * Informe de validacion en consola: entradas y salidas de la simulacion.
   *
   * Existe para poder COMPROBAR los resultados, no para adornar. Con
   * distribucion "fixed" y sin fallos, cada numero de aqui se puede recalcular a
   * mano: por eso las entradas se imprimen completas y las salidas van por tarea
   * y en unidades legibles (minutos, no milisegundos).
   *
   * Se usa console.table, que DevTools renderiza como tabla ordenable.
   */
  _logReport(useOvertime, runValue) {
    const plan = useOvertime ? 'CON HORAS EXTRA' : 'NORMAL';
    const cfg = this.rootConfig;
    const cal = cfg.calendar || {};
    const horas = (h) => `${String(h.hour).padStart(2, '0')}:${String(h.minute).padStart(2, '0')}`;

    console.group(`[validación] Simulación ${plan}`);

    console.log('ENTRADAS · configuración global', {
      instanciasObjetivo: runValue,
      instanciasCompletadas: this.completedInstances,
      llegada: cfg.arrivalRate
        ? `tasa ${cfg.arrivalRate.value} por ${cfg.arrivalRate.unit || 'minute'} → ${this._intervaloLlegada()}`
        : '(sin configurar)',
      jornada: cal.workingHours
        ? `${horas(cal.workingHours.start)} - ${horas(cal.workingHours.end)}` +
          (useOvertime ? ` (extendida: ${horas(this.calendar.config.workingHours.end)})` : '')
        : '(sin calendario)',
      // Tramos de trabajo del calendario ACTIVO y descansos: con descansos la
      // jornada no es un bloque, y el informe tiene que enseñarlo tal cual se
      // simulo, no tal como se configuro.
      tramosDeTrabajo: this.calendar.tramosDelDia(new Date(this.simulationStartTime)).map(
        (t) => `${horas({ hour: Math.floor(t.inicio / 60), minute: t.inicio % 60 })}`
             + `-${horas({ hour: Math.floor(t.fin / 60), minute: t.fin % 60 })}`
      ),
      minutosDeTrabajoAlDia: this.calendar.minutosDeTrabajoDelDia(new Date(this.simulationStartTime)),
      descansos: (this.calendar.config.breaks || []).length,
      descansoCuentaComoJornada: (this.calendar.config.breaks || []).filter((b) => b.cuentaComoJornada).length,
      arranque: describeWarmup(this.warmup),
      semilla: this.seed,
      lotes: this.lotConfig.enabled
        ? `tamano ${this.lotConfig.sizeMode === 'fixed' ? this.lotConfig.size + ' (fijo)' : this.lotConfig.sizeMode}`
          + `, en serie por traccion, paron de cambio ${this.lotConfig.stopMinutes} min`
        : 'desactivados (llegadas una a una)',
      diasLaborables: cal.workingDays,
      festivos: (cal.holidays || []).length,
      tarifaBasePorHora: cfg.cost && cfg.cost.baseRatePerHour,
      costoEsperaPorHora: cfg.cost && cfg.cost.waitCostPerHour,
      horasExtra: cfg.overtime
    });

    const tareas = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task'));

    if (!tareas.length) {
      console.log('No hay tareas en el diagrama.');
      console.groupEnd();
      return;
    }

    console.log('ENTRADAS · por tarea');
    console.table(tareas.map((el) => {
      const d = getSimulationData(el) || {};
      const pt = d.processingTime || {};
      const rt = d.reworkTime || {};
      const triangular = pt.distribution === 'triangular';
      return {
        tarea: el.businessObject.name || el.id,
        distribucion: pt.distribution || '(sin datos)',
        tiempo_fijo: triangular ? '' : (pt.value == null ? '' : pt.value),
        min: triangular ? pt.min : '',
        moda: triangular ? pt.mode : '',
        max: triangular ? pt.max : '',
        unidad: pt.unit || '',
        tasa_fallo: d.failureRate == null ? '' : d.failureRate,
        retrabajo: rt.value == null ? '' : rt.value,
        recurso: d.resources ? `${d.resources.pool || '?'} x${d.resources.quantityRequired || 1}` : '(sin recurso)'
      };
    }));

    // Minutos, no milisegundos: totalWaitTime y totalCycleTime se acumulan con
    // calculateBusinessDurationInMinutes(), que cuenta minutos.
    console.log('SALIDAS · por tarea');
    console.table(tareas.map((el) => {
      const r = this.results.get(el.id) || {};
      const n = r.executionCount || 0;
      return {
        tarea: el.businessObject.name || el.id,
        ejecuciones: n,
        fallos: r.failureCount || 0,
        espera_total_min: Math.round(r.totalWaitTime || 0),
        espera_prom_min: n ? Math.round((r.totalWaitTime || 0) / n) : 0,
        proceso_total_min: Math.round((r.totalProcessingTime || 0) / 60000),
        horas_extra_min: Math.round((r.totalOvertime || 0) / 60000),
        costo_total: Number((r.totalCost || 0).toFixed(2))
      };
    }));

    // Totales sobre las tareas: el total del proceso no es la suma de todas las
    // tareas cuando hay ramas, pero si es la suma de lo ejecutado.
    const suma = (campo) => tareas.reduce((acc, el) => acc + ((this.results.get(el.id) || {})[campo] || 0), 0);
    const totalCosto = suma('totalCost');
    const totalOperacion = suma('totalOperationCost');
    const totalDoble = suma('totalDoubleOvertimeCost');
    const totalTriple = suma('totalTripleOvertimeCost');
    const totalEsperaCosto = suma('totalWaitTimeCost');

    console.log('SALIDAS · totales', {
      instanciasCompletadas: this.completedInstances,
      costo_total: Number(totalCosto.toFixed(2)),
      de_eso_operacion: Number(totalOperacion.toFixed(2)),
      de_eso_prima_doble: Number(totalDoble.toFixed(2)),
      de_eso_prima_triple: Number(totalTriple.toFixed(2)),
      de_eso_costo_espera: Number(totalEsperaCosto.toFixed(2)),
      cuadre_operacion_mas_primas: Number((totalOperacion + totalDoble + totalTriple + totalEsperaCosto).toFixed(2)),
      // El reparto doble/triple depende del CUPO SEMANAL. Estas tres cifras lo
      // hacen comprobable: si solo hay 1 semana con extra, el tramo doble no
      // puede pasar del limite; con N semanas, hasta N x limite.
      semanas_con_horas_extra: this.weeklyStats.size,
      horas_extra_en_tramo_doble_h: Number((this.overtimeBreakdown.normalMs / 3600000).toFixed(2)),
      horas_extra_en_tramo_triple_h: Number((this.overtimeBreakdown.excessMs / 3600000).toFixed(2)),
      limite_horas_extra_por_semana: (this.rootConfig.overtime || {}).limitHours,
      costo_promedio_por_instancia: this.completedInstances > 0
        ? Number((totalCosto / this.completedInstances).toFixed(2))
        : 0,
      espera_total_min: Math.round(suma('totalWaitTime')),
      fallos_totales: suma('failureCount')
    });

    // Lotes: el lote pasa a ser la unidad de analisis, no la pieza. Y ojo con el
    // tamano de muestra: 1.000 piezas en 50 lotes NO son 1.000 muestras del
    // patron de llegada, son 50.
    if (this.lotConfig.enabled && this.lots.length) {
      const ciclosDeLote = this.lots
        .filter((l) => l.endTime != null)
        .map((l) => this.standardCalendar.calculateBusinessDurationInMinutes(
          new Date(l.startTime), new Date(l.endTime)
        ));
      const resumenLotes = resumenMuestras(ciclosDeLote);

      console.log('SALIDAS · lotes', {
        lotes: this.lots.length,
        piezas_por_lote_media: Number((this.completedInstances / this.lots.length).toFixed(2)),
        ciclo_de_lote_min_medio: resumenLotes ? Math.round(resumenLotes.media) : '—',
        ciclo_de_lote_min_min: resumenLotes ? Math.round(resumenLotes.min) : '—',
        ciclo_de_lote_min_max: resumenLotes ? Math.round(resumenLotes.max) : '—',
        parones_de_cambio: this.lotStats.stops,
        paron_total_min: Math.round(this.lotStats.stopMinutes),
        esperas_de_firma: this.lotStats.waits,
        espera_de_firma_total_min: Math.round(this.lotStats.waitMinutes),
        esperas_sobre_tolerancia: this.lotStats.waitsOverTolerance,
        ejecuciones_de_tareas_por_lote: this.lotStats.perLotTaskExecutions
      });
    }

    // Utilizacion por piscina. Es LA metrica de capacidad y es contraintuitiva
    // (un 0,90 parece "queda un 10 %" cuando es saturacion), asi que se imprime
    // tambien la lectura en palabras.
    if (this.utilization.size) {
      console.log('SALIDAS · utilización de recursos');
      console.table(Array.from(this.utilization.values()).map((u) => ({
        piscina: u.name,
        unidades: u.quantity,
        minutos_ocupados: u.busyMinutes,
        minutos_disponibles: u.availableMinutes,
        utilizacion: Number(u.utilization.toFixed(4)),
        lectura: `${(u.utilization * 100).toFixed(1)} %`
      })));
    }

    // Percentiles del tiempo de ciclo: la media esconde la cola, y la cola es lo
    // que rompe un plazo.
    const resumenCiclo = resumenMuestras(this.instanceCycleTimes);
    if (resumenCiclo) {
      console.log('SALIDAS · tiempo de ciclo por caso (min)', {
        casos: resumenCiclo.n,
        minimo: Math.round(resumenCiclo.min),
        p50: Math.round(resumenCiclo.p50),
        p90: Math.round(resumenCiclo.p90),
        p95: Math.round(resumenCiclo.p95),
        p99: Math.round(resumenCiclo.p99),
        maximo: Math.round(resumenCiclo.max),
        media: Math.round(resumenCiclo.media),
        desviacion: Math.round(resumenCiclo.desviacion),
        coeficiente_variacion: Number(resumenCiclo.cv.toFixed(3))
      });
    }

    console.groupEnd();
  }
}

SimulationEngine.$inject = ['elementRegistry'];
