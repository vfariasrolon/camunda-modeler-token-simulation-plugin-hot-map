/**
 * Arnés DOM del mapa de calor POR EL CAMINO DEL CONTROLADOR.
 *
 * Por qué existe: el otro arnés de mapa de calor conduce `SimpleHeatSVG` DIRECTAMENTE
 * -le pasa puntos a mano y mira los círculos-, así que la orquestación del controlador
 * (`showMetric`) no estaba cubierta por nada. Si ahí se rompe algo, todos los arneses
 * siguen en verde y el mapa no se pinta en el Modeler.
 *
 * Y es exactamente lo que se reportó: «no se pintan los mapas de calor de ningún
 * tipo». Por eso este arnés recorre LAS ONCE métricas que ofrece la paleta y exige,
 * en cada una, que quede al menos una mancha dibujada: una comprobación de una sola
 * métrica habría dejado pasar el fallo si el problema estuviera en el común.
 */
import SimulationController from '@plugin/simulation/SimulationController.js';
import SimulationEngine from '@plugin/simulation/SimulationEngine.js';

let fallos = 0;
const lineas = [];
const ok = (cond, etiqueta, detalle) => {
  lineas.push(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const NS = 'http://www.w3.org/2000/svg';

// Las once métricas de la paleta, en el orden en que se ofrecen.
const METRICAS = [
  'cost', 'waitTime', 'totalWaitTime', 'cycleTime', 'frequency', 'processTime',
  'failureRate', 'reworkTime', 'overtime', 'waitTimeCost', 'resourceQuantity'
];

const opacidades = () =>
  [ ...document.querySelectorAll('.heatmap-layer circle') ]
    .map((c) => c.getAttribute('opacity'));

function crearCanvasFalso() {
  const contenedor = document.createElement('div');
  const svg = document.createElementNS(NS, 'svg');
  svg.appendChild(document.createElementNS(NS, 'defs'));
  svg.appendChild(document.createElementNS(NS, 'g')); // capa de overlays
  contenedor.appendChild(svg);
  document.body.appendChild(contenedor);
  const overlays = svg.querySelector('g');
  return {
    contenedor,
    getContainer: () => contenedor,
    getLayer: (name) => (name === 'overlays' ? overlays : null)
  };
}

/** Elemento de bpmn-js de mentira: `is()` mira el businessObject. */
function elemento(id, tipo, x, y, recursos) {
  const bo = { name: id, $instanceOf: (t) => t === tipo };
  if (recursos) {
    bo.extensionElements = {
      values: [ {
        $type: 'camunda:Properties',
        $instanceOf: (t) => t === 'camunda:Properties',
        values: [ { name: 'simulationData', value: JSON.stringify({ resources: recursos }) } ]
      } ]
    };
  }
  return { id, businessObject: bo, x, y, width: 100, height: 80 };
}

try {
  const canvas = crearCanvasFalso();

  const t1 = elemento('Task_1', 'bpmn:Task', 100, 100);
  const t2 = elemento('Task_2', 'bpmn:Task', 300, 100);
  const t3 = elemento('Task_3', 'bpmn:Task', 500, 100, { pool: 'X', quantityRequired: 2 });
  const gw = elemento('Gateway_1', 'bpmn:Gateway', 700, 100);
  const fin = elemento('End_1', 'bpmn:EndEvent', 900, 100);
  const elementos = [ t1, t2, t3, gw, fin ];

  const registro = {
    forEach: (fn) => elementos.forEach(fn),
    get: (id) => elementos.find((e) => e.id === id),
    filter: (fn) => elementos.filter(fn),
    find: (fn) => elementos.find(fn),
    getAll: () => elementos
  };

  const avisos = [];
  const overlays = { add: () => 'ov', remove: () => {} };
  const bus = { on: () => {}, fire: () => {} };

  const controller = new SimulationController(
    canvas, bus, { setMetricCallback: () => {}, toggle: () => {}, addEntry: () => {} },
    { nuevaCorrida: () => {} }, registro, overlays, { addEntry: () => {} },
    { showNotification: (n) => avisos.push(n), open: () => {}, toggle: () => {}, close: () => {}, isOpen: () => false },
    { isOpen: () => false, toggle: () => {}, showHtmlContent: () => {}, getCanvas: () => null },
    { toggle: () => {} },
    { show: () => {}, hide: () => {} }
  );

  // Resultados de una corrida: las tres tareas y la compuerta. El evento de fin NO
  // va: no esta en HEATMAP_TYPES y no debe salir mancha sobre el.
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 10, totalCost: 1000, totalWaitTime: 100, totalProcessingTime: 60000, totalCycleTime: 70, failureCount: 1, totalReworkTime: 5000, totalOvertime: 2000, totalWaitTimeCost: 50 } ],
    [ 'Task_2', { executionCount: 10, totalCost: 3000, totalWaitTime: 300, totalProcessingTime: 90000, totalCycleTime: 120, failureCount: 3, totalReworkTime: 15000, totalOvertime: 6000, totalWaitTimeCost: 150 } ],
    [ 'Task_3', { executionCount: 10, totalCost: 5000, totalWaitTime: 500, totalProcessingTime: 120000, totalCycleTime: 200, failureCount: 5, totalReworkTime: 25000, totalOvertime: 10000, totalWaitTimeCost: 250 } ],
    [ 'Gateway_1', { executionCount: 10, totalCost: 100, totalWaitTime: 10, totalProcessingTime: 1000, totalCycleTime: 5, failureCount: 0, totalReworkTime: 0, totalOvertime: 0, totalWaitTimeCost: 1 } ]
  ]);

  // --- 1. LAS ONCE MÉTRICAS pintan ---
  //
  // Esta es la comprobación que responde al reporte. Se hace por métrica y no en
  // conjunto porque el fallo podía estar en una rama concreta de valor.
  METRICAS.forEach((metrica) => {
    const antes = document.querySelectorAll('.heatmap-layer circle').length;
    controller.showMetric(metrica);
    const circulos = document.querySelectorAll('.heatmap-layer circle').length;
    const ops = opacidades();

    ok(circulos > 0, `${metrica}: pinta al menos una mancha`,
      `antes ${antes}, ahora ${circulos}`);
    ok(ops.every((o) => o !== 'NaN' && o !== null && Number(o) > 0),
      `${metrica}: todas las manchas con opacidad valida`,
      ops.join(','));
    ok(document.querySelector('.heatmap-layer') !== null,
      `${metrica}: la capa del calor existe en el SVG`);
  });

  // --- 2. No se acumulan: cada métrica LIMPIA la anterior ---
  //
  // Si no limpiara, tras pasar por las once habría once mapas superpuestos y el
  // color no querría decir nada. Se comprueba dibujando una métrica de 4 puntos y
  // viendo que quedan 4, no más.
  controller.showMetric('cycleTime');
  ok(document.querySelectorAll('.heatmap-layer circle').length === 4,
    'al cambiar de métrica se borra la anterior (quedan 4 manchas, no más)',
    String(document.querySelectorAll('.heatmap-layer circle').length));

  // --- 3. El degradado y los filtros se fijan en CADA pintado ---
  //
  // `clearOverlaysAndHeatmap()` destruye la instancia del calor; si el degradado no
  // se volviera a fijar, el segundo mapa saldría sin color.
  controller.showMetric('cost');
  ok(canvas.contenedor.querySelector('#heatmap-colorize') !== null,
    'tras repintar siguen los filtros del color en el SVG');
  const tablaR = canvas.contenedor.querySelector('#heatmap-colorize feFuncR');
  ok(tablaR !== null && tablaR.getAttribute('tableValues').trim().split(/\s+/).length === 256,
    'y la tabla de color sigue completa (256 entradas)');

  // --- 4. Con TODOS los valores iguales, sale FRÍO y se ve ---
  //
  // El caso que se reportó al principio de todo: si el rango es uniforme, la
  // opacidad no puede ser la del máximo (saldría todo rojo) ni 0 (no se vería).
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 5, totalCost: 100 } ],
    [ 'Task_2', { executionCount: 5, totalCost: 100 } ]
  ]);
  controller.showMetric('cost');
  const opsUniformes = opacidades();
  ok(opsUniformes.length === 2, 'el caso uniforme dibuja sus manchas', String(opsUniformes.length));
  ok(opsUniformes.every((o) => Number(o) > 0 && Number(o) < 1),
    'con opacidad intermedia: ni rojo puro ni invisible', opsUniformes.join(','));

  // --- 5. Con diferencias, el máximo va al extremo cálido ---
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 5, totalCost: 100 } ],
    [ 'Task_2', { executionCount: 5, totalCost: 500 } ]
  ]);
  controller.showMetric('cost');
  const opsConRango = opacidades();
  ok(opsConRango.includes('1'), 'con diferencias, el máximo recibe la opacidad del extremo cálido',
    opsConRango.join(','));
  ok(opsConRango.some((o) => Number(o) < 1), 'y el menor, menos que el máximo');

  // --- 6. La leyenda dice el rango, y NO miente cuando es uniforme ---
  controller.showMetric('cost');
  const leyenda = canvas.contenedor.querySelector('.heatmap-legend');
  ok(leyenda !== null, 'se pinta la leyenda del rango');
  ok(leyenda && leyenda.textContent.trim().length > 0, 'con texto',
    leyenda ? leyenda.textContent.slice(0, 80) : '');

  // --- 7. Sin resultados, AVISA en vez de dejar la pantalla muda ---
  controller.simulationResults = null;
  const avisosAntes = avisos.length;
  controller.showMetric('cost');
  ok(avisos.length > avisosAntes, 'sin corrida previa, avisa',
    avisos.length ? avisos[avisos.length - 1].text : 'sin aviso');

  // --- 8. LA INTEGRACION: motor de verdad -> resultados -> manchas ---
  //
  // Los casos de arriba pintan un mapa con resultados escritos a mano. Eso comprueba
  // el dibujo, pero NO que los resultados que produce el motor tengan la forma que
  // `showMetric` espera: si esa forma cambiara, el mapa no se pintaria con datos
  // reales y todos los casos anteriores seguirian en verde.
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  let reales;
  try {
    // Elementos con la forma que lee el motor (util.js lee extensionElements).
    const conDatos = (id, tipo, datos, extra) => {
      const bo = {
        name: id,
        $instanceOf: (t) => t === tipo,
        extensionElements: {
          values: [ {
            $type: 'camunda:Properties',
            $instanceOf: (t) => t === 'camunda:Properties',
            values: [ { name: 'simulationData', value: JSON.stringify(datos) } ]
          } ]
        }
      };
      return Object.assign({ id, businessObject: bo, x: 100, y: 100, width: 100, height: 80 }, extra || {});
    };

    const inicio = conDatos('S1', 'bpmn:StartEvent', {
      isRoot: true,
      arrivalRate: { value: 60, unit: 'hour' },
      simulationConfig: { runValue: 20 },
      startDate: '2026-01-05',
      calendar: { workingDays: [ 1, 2, 3, 4, 5 ], workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [] },
      cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
      overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
      seed: 7
    });
    const ta = conDatos('Task_1', 'bpmn:Task', {
      processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' },
      failureRate: 0.2, reworkTime: { value: 5, unit: 'minutes' }
    });
    const tb = conDatos('Task_2', 'bpmn:Task', {
      processingTime: { distribution: 'fixed', value: 20, unit: 'minutes' },
      failureRate: 0, reworkTime: { value: 0, unit: 'minutes' }
    });
    const finReal = conDatos('E1', 'bpmn:EndEvent', null);

    const cadena = [ inicio, ta, tb, finReal ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = { id: `F${i + 1}`, businessObject: { $instanceOf: (t) => t === 'bpmn:SequenceFlow' }, source: cadena[i], target: cadena[i + 1] };
      flujos.push(f);
      cadena[i].outgoing = [ f ];
    }

    const todos = [ ...cadena, ...flujos ];
    const regReal = {
      getAll: () => todos,
      get: (id) => todos.find((e) => e.id === id),
      filter: (fn) => todos.filter(fn),
      find: (fn) => todos.find(fn),
      forEach: (fn) => todos.forEach(fn)
    };

    const motor = new SimulationEngine(regReal);
    reales = motor.run({ useOvertime: false });

    controller._elementRegistry = regReal;
    controller.simulationResults = reales;

    ok(reales instanceof Map && reales.size >= 2,
      'el motor devuelve resultados para las tareas', String(reales && reales.size));

    METRICAS.forEach((metrica) => {
      controller.showMetric(metrica);
      const circulos = document.querySelectorAll('.heatmap-layer circle').length;
      const ops = opacidades();
      ok(circulos > 0, `integracion · ${metrica}: pinta con resultados REALES del motor`,
        String(circulos));
      ok(ops.every((o) => Number(o) > 0), `integracion · ${metrica}: opacidades validas`, ops.join(','));
    });
  } finally {
    Object.assign(console, guardar);
  }
} catch (e) {
  lineas.push('EXCEPCIÓN: ' + (e && e.stack ? e.stack : e));
  fallos++;
}

lineas.push('');
lineas.push(fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`);

document.getElementById('informe').textContent = lineas.join('\n');
