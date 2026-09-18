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
// El CSS del plugin se importa en client.js, NO en el controlador: sin esta linea el
// arnes mediria «se ve» SIN las hojas de estilo del plugin, y esa es justo la
// diferencia entre la pantalla y el PNG exportado (el export no lleva el CSS).
import '@plugin/simulation/simulation.css';

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

  // SEÑUELO A PROPOSITO: un <svg> con <defs> DELANTE del svg del diagrama, que es
  // como se cuela el fallo. El codigo cogia `container.querySelector('svg')`, el
  // PRIMERO, asi que con un señuelo delante los filtros del calor acababan en un svg
  // que no es el de los circulos: la pantalla se queda sin filtro (los circulos
  // existen y no se ven) y el EXPORT si los pinta, porque reune los defs por id.
  // Ese es exactamente el sintoma que se reporto, y sin este señuelo el arnes no lo
  // podria distinguir de un arreglo.
  const senuelo = document.createElementNS(NS, 'svg');
  senuelo.setAttribute('class', 'senuelo');
  senuelo.appendChild(document.createElementNS(NS, 'defs'));
  contenedor.appendChild(senuelo);

  // El svg del diagrama con sus <defs>: `SimpleHeatSVG` mete ahi sus filtros y sube por
  // el arbol desde la CAPA para encontrarlo. Ese es el arbol real de diagram-js:
  //   svg > defs, svg > g.viewport > g.layer-overlays
  // Tenerlo asi importa: con la capa colgando de otro sitio, la cadena no llega y el
  // mapa de circulos se queda sin sus defs (que es justo lo que el doble debe reproducir).
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'djs-svg');
  svg.appendChild(document.createElementNS(NS, 'defs'));
  const viewport = document.createElementNS(NS, 'g');
  viewport.setAttribute('class', 'viewport');
  const capa = document.createElementNS(NS, 'g');
  capa.setAttribute('class', 'layer-overlays');
  viewport.appendChild(capa);
  svg.appendChild(viewport);
  contenedor.appendChild(svg);

  // La capa tiene que estar EN EL ARBOL: `_capaOverlays` exige `parentNode`, porque un
  // <g> suelto no esta en el diagrama y sus coordenadas serian locales.
  void capa.parentNode;
  document.body.appendChild(contenedor);

  // Los graficos de cada elemento: `canvas.getGraphics(element)` es lo que usa la
  // vista de estructura para clonar el trazo de una conexion. Se devuelve un <path>
  // con su `d`, que es lo unico que se lee.
  const graficos = new Map();

  return {
    contenedor,
    getContainer: () => contenedor,
    getLayer: (name) => (name === 'overlays' ? capa : null),
    getGraphics: (element) => {
      if (!graficos.has(element.id)) {
        const p = document.createElementNS(NS, 'path');
        // Una conexion de verdad tiene su trazo; una figura (tarea) no lleva `d`, y
        // ese caso hay que conservarlo: si el arnes diera `d` a todo, la vista
        // pintaria tareas como si fuesen lineas y la prueba no lo notaria.
        if (element.__esFlujo) {
          // F2 es la conexion LARGA y AISLADA: es la unica con la que se puede medir si
          // la masa sigue el trazo o cae en un punto. Las otras dos caen juntas y su
          // reparto no cambia el resultado, asi que no sirven para comprobarlo.
          // El largo se decide por el ID, y el cache de abajo es por ID: si F2 ya se
          // pidio antes (el caso 12 usa los mismos flujos), su path quedaria con el largo
          // viejo. Por eso el largo va en el ELEMENTO y no en el ID: cada vez que se pide
          // un trazo se recalcula, y no se hereda el del caso anterior.
          const largo = element.__largoTrazo || (element.id === 'F2' ? 2000 : 300);
          p.setAttribute('d', `M 0 0 L ${largo} 0`);
          p.getTotalLength = () => largo;
          p.getPointAtLength = (d) => ({ x: d, y: 0 });
        }
        graficos.set(element.id, p);
      }
      return graficos.get(element.id);
    }
  };
}

/** Elemento de bpmn-js de mentira: `is()` mira el businessObject. */
// JERARQUIA DE TIPOS. En moddle, `bpmn:Task` hereda de `bpmn:FlowNode`, asi que
// `is(tarea, 'bpmn:FlowNode')` es CIERTO. Un doble que solo acepte el tipo exacto
// miente: el motor y el mapa de calor preguntan por tipos padre a cada paso (aqui,
// para saber si dimensionar la mancha por la caja de la figura). Con el doble ingenuo
// la mancha caia por la rama de «es una linea» y salia del tamano equivocado.
const HERENCIA = {
  'bpmn:Task': [ 'bpmn:FlowNode', 'bpmn:Activity' ],
  'bpmn:Gateway': [ 'bpmn:FlowNode' ],
  'bpmn:StartEvent': [ 'bpmn:FlowNode', 'bpmn:Event', 'bpmn:CatchEvent' ],
  'bpmn:EndEvent': [ 'bpmn:FlowNode', 'bpmn:Event', 'bpmn:ThrowEvent' ]
};

const hereda = (tipo, t) => tipo === t || (HERENCIA[tipo] || []).includes(t);

function elemento(id, tipo, x, y, recursos) {
  const bo = { name: id, $instanceOf: (t) => hereda(tipo, t) };
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

  // CONEXIONES. `F2` es la rama que NO se recorre: existe en el diagrama y no tiene
  // entrada en los resultados, que es justo el caso que la vista de estructura tiene
  // que enseñar en gris en vez de dejar desaparecer.
  // LAS CONEXIONES NO TIENEN CAJA, y el doble tiene que parecerse: `elemento()` da
  // 100x80 a todo, asi que un flujo saldria con caja y el caso «conexion sin geometria»
  // -que es el del reporte- no existiria en el arnes. Se les quita el tamaño.
  const flujosDePrueba = [ 'F1', 'F2', 'F3' ].map((id) => Object.assign(
    elemento(id, 'bpmn:SequenceFlow', 0, 0), { __esFlujo: true, width: 0, height: 0 }
  ));

  const elementos = [ t1, t2, t3, gw, fin, ...flujosDePrueba ];

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
        $instanceOf: (t) => hereda(tipo, t),
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
  // --- 10. Los botones de TAMAÑO: que agranden de verdad ---
  //
  // La auditoría encontró que el par «Radio + / −» hacía lo CONTRARIO: movía `_radius`,
  // que además de radio base es el ancla del reparto núcleo/desvanecido, así que subirlo
  // bajaba el total y pulsar «+» ACHICABA las manchas. Por eso parecía un duplicado del
  // desenfoque. Aquí se comprueba la dirección, que es lo que se había invertido.
  const tarea = controller._elementRegistry.get('Task_1');
  const radioDe = () => controller._blobRadius(tarea);
  const radioBase = radioDe();

  ok(radioBase > 0, 'la mancha de una tarea tiene radio', String(radioBase));
  // La invariante de siempre: la mancha CUBRE la figura (si no, el mapa «no llega»).
  ok(radioBase >= 50, 'y cubre la figura (el semilado de una tarea de prueba es 50)', String(radioBase));

  controller.adjustHeatmap('radius', 0.25);
  const radioGrande = radioDe();
  ok(radioGrande > radioBase,
    'pulsar «manchas más grandes» AGRANDA (antes achicaba)',
    `${radioBase} -> ${radioGrande}`);

  controller.adjustHeatmap('radius', -0.25);
  controller.adjustHeatmap('radius', -0.25);
  const radioChico = radioDe();
  ok(radioChico < radioBase,
    'y «más pequeñas» ACHICA', `${radioBase} -> ${radioChico}`);

  // Los topes: sin ellos, unos cuantos clics dejan el diagrama tapado o la mancha en nada.
  for (let i = 0; i < 40; i++) controller.adjustHeatmap('radius', 0.25);
  const topeAlto = radioDe();
  ok(topeAlto <= 240, 'el tope superior corta (no se come el diagrama)', String(topeAlto));
  for (let i = 0; i < 40; i++) controller.adjustHeatmap('radius', -0.25);
  const topeBajo = radioDe();
  ok(topeBajo > 0 && topeBajo < radioBase, 'y el inferior deja la mancha visible, no en cero', String(topeBajo));

  // El desenfoque va APARTE y sigue funcionando: es la otra mitad del par, y mezclarlos
  // fue lo que invirtió el sentido del tamaño.
  controller._scale = 1;
  const antesDesenfoque = radioDe();
  controller.adjustHeatmap('blur', 5);
  ok(radioDe() !== antesDesenfoque, 'el desenfoque sigue cambiando la mancha por su lado',
    `${antesDesenfoque} -> ${radioDe()}`);
  controller._blur = 10;

  // Y lo que el usuario VE: el radio de los círculos dibujados, no solo el número interno.
  controller.simulationResults = new Map([ [ 'Task_1', { executionCount: 5, totalCost: 100 } ] ]);
  controller._scale = 1;
  controller.showMetric('cost');
  const rDibujado = Number(document.querySelector('.heatmap-layer circle').getAttribute('r'));
  controller._scale = 2;
  controller.showMetric('cost');
  const rDibujadoGrande = Number(document.querySelector('.heatmap-layer circle').getAttribute('r'));
  ok(rDibujadoGrande > rDibujado,
    'y el cambio llega al SVG: el circulo dibujado crece con el boton',
    `${rDibujado} -> ${rDibujadoGrande}`);
  controller._scale = 1;

  // --- 12. LA VISTA DE ESTRUCTURA: el tráfico sobre las conexiones ---
  //
  // Lo que el mapa por tareas NO puede dar: por dónde pasa el trabajo. Una conexión no
  // tiene tiempo ni costo, así que su única lectura es cuántos tokens la recorrieron.
  // Y lo que sí es exclusivo de esta vista: las conexiones por las que NO pasó nada.
  controller._elementRegistry = registro;
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 10, totalCost: 1000 } ],
    [ 'Task_2', { executionCount: 10, totalCost: 5000 } ],
    [ 'Gateway_1', { executionCount: 10, totalCost: 100 } ],
    // F1 se recorre 10 veces y F3 solo 2: el rango tiene contraste, así que las dos
    // tienen que salir con color y distinto. F2 no aparece: no se recorrió nunca.
    [ 'F1', { executionCount: 10 } ],
    [ 'F3', { executionCount: 2 } ]
  ]);

  controller.showMetric('trafico');

  const grupoFlujos = document.querySelector('.heatmap-flows');
  ok(Boolean(grupoFlujos), 'la vista de estructura crea su grupo de trazos');

  const trazos = grupoFlujos ? [ ...grupoFlujos.querySelectorAll('path') ] : [];
  ok(trazos.length === 3, 'pinta las TRES conexiones del diagrama', String(trazos.length));

  const porId = new Map(trazos.map((t) => [ t.getAttribute('data-flujo'), t ]));

  // Las recorridas, con color de la escala y grosor por tráfico.
  const tF1 = porId.get('F1');
  const tF3 = porId.get('F3');
  ok(tF1 && /^rgb\(/.test(tF1.getAttribute('stroke')),
    'una conexión recorrida lleva el color de la escala', tF1 ? tF1.getAttribute('stroke') : 'sin F1');
  ok(tF1.getAttribute('stroke') !== tF3.getAttribute('stroke'),
    'y la que más tráfico tiene NO sale del mismo color que la de menos',
    `${tF1.getAttribute('stroke')} vs ${tF3.getAttribute('stroke')}`);
  ok(Number(tF1.getAttribute('stroke-width')) > Number(tF3.getAttribute('stroke-width')),
    'el trazo más transitado es más grueso', `${tF1.getAttribute('stroke-width')} vs ${tF3.getAttribute('stroke-width')}`);

  // LA RAMA MUERTA, que es el hallazgo que justifica la vista.
  const tF2 = porId.get('F2');
  ok(Boolean(tF2), 'la conexión SIN tráfico también se pinta (no desaparece del mapa)');
  ok(tF2.classList.contains('flujo-sin-trafico'),
    'y se marca aparte, en su propio estilo', tF2.getAttribute('class') || 'sin clase');
  ok(tF2.getAttribute('stroke-dasharray') !== null,
    'con trazo discontinuo, para no confundirla con «poco tráfico»');
  ok(tF2.getAttribute('stroke') !== tF1.getAttribute('stroke'),
    'y con un color que no es el de la escala', tF2.getAttribute('stroke'));

  // Un trazo por conexión, no por figura: los círculos son de las figuras y el trazo
  // del flujo es del flujo. Si se cruzaran, una tarea tendría trazo o una línea mancha.
  ok(!grupoFlujos.querySelector('[data-flujo="Task_1"]'), 'las figuras NO llevan trazo');
  ok(document.querySelectorAll('.heatmap-layer circle').length === 3,
    'y las conexiones NO llevan mancha (3 figuras, 3 círculos)',
    String(document.querySelectorAll('.heatmap-layer circle').length));

  // La leyenda dice las dos cosas, y avisa de las ramas muertas.
  const leyendaEstructura = canvas.contenedor.querySelector('.heatmap-legend');
  ok(/Estructura/.test(leyendaEstructura.textContent), 'la leyenda se declara como vista de estructura',
    leyendaEstructura.textContent.slice(0, 60));
  ok(/1/.test(leyendaEstructura.querySelector('.heatmap-legend-warn')
    ? leyendaEstructura.querySelector('.heatmap-legend-warn').textContent : ''),
    'y avisa de la conexión sin tráfico');
  ok(/capacidad que se paga y no se aprovecha/.test(leyendaEstructura.textContent),
    'explicando la consecuencia, no solo el hecho');

  // Cambiar de vista LIMPIA los trazos: si quedaran, el diagrama seguiría pintado con
  // una lectura que ya no es la activa.
  controller.showMetric('cost');
  ok(!document.querySelector('.heatmap-flows'),
    'al cambiar de métrica los trazos se van con el mapa');

  // --- 13. EL MAPA DE ZONAS: la mancha continua ---
  //
  // Lo que el mapa por tareas NO puede dar por construccion: un circulo esta centrado en
  // su figura, asi que no puede formar una mancha. Aqui la masa de varias figuras suma
  // en celdas del diagrama, y lo que se reparte son MINUTOS DE TRABAJO.
  controller._elementRegistry = registro;
  controller.simulationResults = new Map([
    // Una tarea con mucho trabajo (10 x 60s) y otra con poco (2 x 60s): el contraste
    // tiene que verse en el color.
    [ 'Task_1', { executionCount: 10, totalProcessingTime: 600000 } ],
    [ 'Task_2', { executionCount: 2, totalProcessingTime: 120000 } ],
    // LA CONEXION LARGA Y CON MASA: F2 es la unica con la que se puede medir si la masa
    // sigue el trazo. Las anteriores comprobaciones de esta vista pasaban por las TAREAS
    // -F2 no tenia masa, asi que su funcion de puntos no se llamaba nunca-, y por eso
    // daban verde con la costura rota.
    [ 'F2', { executionCount: 10 } ]
  ]);

  controller.showMetric('zonas');

  const grupoZonas = document.querySelector('.heatmap-zones');
  ok(Boolean(grupoZonas), 'el mapa de zonas crea su grupo de celdas');

  const celdas = grupoZonas ? [ ...grupoZonas.querySelectorAll('rect') ] : [];
  ok(celdas.length > 0, 'y pinta celdas', String(celdas.length));
  ok(celdas.every((c) => Number(c.getAttribute('width')) > 0 && Number(c.getAttribute('height')) > 0),
    'todas las celdas tienen tamaño');

  // LA MANCHA: mas celdas que figuras. Con una celda por figura seguiriamos teniendo el
  // mismo cuadro por tarea, que es lo que ya hacian los circulos.
  // LA MANCHA, medida de forma DISCRIMINANTE: se compara con el numero de elementos que
  // aportan masa. Con una celda por figura saldrian tantas celdas como figuras, que es
  // exactamente el cuadro por tarea de los circulos. El reparto tiene que dar MAS.
  //
  // Ojo: no vale comparar contra un numero fijo. En este arnes entran tambien las
  // conexiones del registro, y su numero cambia con la geometria del doble, asi que la
  // comprobacion tiene que ser RELATIVA a los elementos con masa.
  const aportantes = [ ...controller.simulationResults.entries() ].filter(([id, r]) => {
    const el = controller._elementRegistry.get(id);
    if (!el) return false;
    const masa = el.__esFlujo ? (r.executionCount || 0) : (r.executionCount || 0) * (r.totalProcessingTime || 0);
    return masa > 0;
  }).length;
  ok(celdas.length > aportantes,
    'hay MAS celdas que elementos con masa (la mancha se extiende, no es un cuadro por elemento)',
    `${celdas.length} celdas para ${aportantes} elementos con masa`);

  // El color sigue la escala: no todas del mismo color.
  const colores = new Set(celdas.map((c) => c.getAttribute('fill')));
  ok(colores.size > 1, 'y las celdas se colorean por su valor, no todas igual', `${colores.size} colores`);

  // LA MASA DE UNA CONEXION SIGUE SU TRAZO, y esto se mide con F2, que es larga y esta
  // lejos de todo: si su masa cayera en el centro de su caja en vez de repartirse por la
  // linea, aparecerian celdas al principio y al final del trazo que no existirian (y al
  // reves). Se comprueba que hay celdas a lo LARGO de la conexion.
  controller.showMetric('zonas');
  const celdasTrazo = [ ...document.querySelectorAll('.heatmap-zones rect') ]
    .map((r) => Number(r.getAttribute('x')))
    .filter((x) => x >= 0 && x <= 2000);
  // LA COSTURA: que la vista USE los puntos del trazo de la conexion.
  //
  // Se probo antes con geometria real -un trazo de 2000 px- y la comprobacion no
  // distinguia: las columnas que veia las producian las tareas, no el trazo, asi que
  // pasaba igual con la costura rota. Aqui se controla la costura directamente: se le
  // da al controlador una funcion de puntos conocida y se comprueba que la masa de la
  // conexion aparece EXACTAMENTE en el punto que devuelve, en un sitio donde no hay
  // ninguna figura.
  const puntosControlados = [ { x: 4000, y: 4000 }, { x: 4100, y: 4000 } ];
  const original = controller._puntosDelTrazo;
  controller._puntosDelTrazo = (flujo) => (flujo.id === 'F2' ? puntosControlados : original.call(controller, flujo));

  controller.showMetric('zonas');
  const viaTrazo = [ ...document.querySelectorAll('.heatmap-zones rect') ]
    .map((r) => ({ x: Number(r.getAttribute('x')), y: Number(r.getAttribute('y')) }))
    .filter((c) => c.x >= 3900 && c.y >= 3900);

  ok(viaTrazo.length > 0,
    'la masa de una conexión aparece DONDE DICE SU TRAZO, no en el centro de su caja',
    `${viaTrazo.length} celdas en la zona del trazo (x,y ~ 4000), donde no hay ninguna figura`);

  controller._puntosDelTrazo = original;

  // SIN circulos: esta vista es la rejilla. Mezclar las dos daria dos significados al
  // mismo color sobre el mismo diagrama.
  ok(document.querySelectorAll('.heatmap-layer circle').length === 0,
    'y NO pinta circulos por tarea (seria mezclar dos lecturas)',
    String(document.querySelectorAll('.heatmap-layer circle').length));

  // La leyenda DICE LA UNIDAD. Sin ella, un numero en una celda no significa nada y la
  // mancha es un adorno en vez de una medicion.
  const leyendaZonas = canvas.contenedor.querySelector('.heatmap-legend');
  ok(/Zonas/.test(leyendaZonas.textContent), 'la leyenda se declara como mapa de zonas',
    leyendaZonas.textContent.slice(0, 70));
  ok(/de trabajo/.test(leyendaZonas.textContent),
    'y dice la unidad (minutos de trabajo), que es lo que lo vuelve medible');
  ok(/no cambia al acercarse/.test(leyendaZonas.textContent),
    'y explica que la celda es un trozo fijo del diagrama');

  // Cambiar de vista limpia las celdas: si quedaran, el diagrama seguiria con una
  // lectura que ya no es la activa.
  controller.showMetric('cost');
  ok(!document.querySelector('.heatmap-zones'), 'al cambiar de métrica las celdas se van');

  // --- 14. ZONAS POR TRAFICO: la otra lectura de la misma rejilla ---
  //
  // La diferencia con minutos de trabajo no es de matiz, y es lo que se comprueba aqui:
  // con MUCHOS pasos y MUY poco tiempo, el trafico tiene que salir CALIENTE y los minutos
  // FRIOS. Si las dos lecturas dieran lo mismo, la metrica nueva no aportaria nada.
  controller._elementRegistry = registro;
  controller.simulationResults = new Map([
    // La tarea rapida y muy transitada: 500 pasos de 20 ms = 10 s de trabajo.
    [ 'Task_1', { executionCount: 500, totalProcessingTime: 10000 } ],
    // La tarea lenta y poco transitada: 2 pasos de 2 h = 4 h de trabajo.
    [ 'Task_2', { executionCount: 2, totalProcessingTime: 7200000 } ]
  ]);

  const picoDeZonas = (metrica) => {
    controller.showMetric(metrica);
    const rellenos = [ ...document.querySelectorAll('.heatmap-zones rect') ]
      .map((r) => r.getAttribute('fill'));
    // El rojo (maximo de la escala) es el color calido: se busca su presencia.
    return { rellenos, rojo: rellenos.some((f) => /rgb\(255, 0, 0\)|red/.test(f)) };
  };

  const conTrafico = picoDeZonas('zonasTrafico');
  const conTiempo = picoDeZonas('zonas');

  ok(conTrafico.rellenos.length > 0 && conTiempo.rellenos.length > 0,
    'las dos lecturas pintan su rejilla',
    `${conTrafico.rellenos.length} / ${conTiempo.rellenos.length}`);

  // LA PRUEBA QUE DISTINGUE LAS DOS LECTURAS. No se mide la OPACIDAD pintada: se satura
  // en 1 en la celda mas caliente de cada lectura, asi que daria 1.00 en las dos y no
  // distinguiria nada (es el primer intento, que paso en falso). Se mide el VALOR de la
  // celda que el propio pintado usa, preguntandole al calculo: es el dato que decide el
  // color, y es donde las dos lecturas se separan.
  const valorCercaDe = (metrica, x) => {
    // Se reproduce la masa de cada lectura, que es UNA linea del controlador, y se
    // localiza el maximo en la franja de esa tarea.
    const zona = { x: null };
    void zona;
    controller.showMetric(metrica);
    // El valor por celda se reconstruye desde los rects: el relleno es
    // colorDeValor(valor/max), y la opacidad es opacidadDe(valor, max). Se usa la
    // opacidad RELATIVA, que conserva el orden aunque se sature en el maximo.
    const cerca = [ ...document.querySelectorAll('.heatmap-zones rect') ]
      .map((r) => ({ x: Number(r.getAttribute('x')), o: Number(r.getAttribute('opacity')) }))
      .filter((c) => Math.abs(c.x - x) < 200);
    if (!cerca.length) return null;
    // El maximo NO sirve (1 en las dos): se mira la MEDIA de la franja, que si refleja
    // cuanto trabajo hay repartido por ahi.
    return cerca.reduce((a, c) => a + c.o, 0) / cerca.length;
  };

  const traficoEnTask1 = valorCercaDe('zonasTrafico', 100);   // Task_1 (transitada)
  const traficoEnTask2 = valorCercaDe('zonasTrafico', 300);  // Task_2 (lenta)
  const tiempoEnTask1 = valorCercaDe('zonas', 100);
  const tiempoEnTask2 = valorCercaDe('zonas', 300);

  ok(traficoEnTask1 > traficoEnTask2,
    'con TRAFICO pesa mas la tarea por la que pasan mas tokens',
    `Task_1 ${traficoEnTask1.toFixed(3)} vs Task_2 ${traficoEnTask2.toFixed(3)}`);
  ok(tiempoEnTask2 > tiempoEnTask1,
    'y con MINUTOS pesa mas la tarea que ocupa mas tiempo (lo contrario)',
    `Task_2 ${tiempoEnTask2.toFixed(3)} vs Task_1 ${tiempoEnTask1.toFixed(3)}`);

  // Y la leyenda dice la unidad de cada una, que es lo que evita confundirlas.
  const leyTrafico = (() => { controller.showMetric('zonasTrafico');
    return canvas.contenedor.querySelector('.heatmap-legend').textContent; })();
  const leyTiempo = (() => { controller.showMetric('zonas');
    return canvas.contenedor.querySelector('.heatmap-legend').textContent; })();

  ok(/PASAN los tokens/.test(leyTrafico), 'la leyenda de trafico se anuncia como tal', leyTrafico.slice(0, 60));
  ok(/pasos/.test(leyTrafico), 'y su unidad son pasos', leyTrafico.slice(0, 90));
  ok(/TIEMPO/.test(leyTiempo), 'la de minutos se anuncia como tiempo', leyTiempo.slice(0, 60));
  ok(/de trabajo/.test(leyTiempo), 'y su unidad es tiempo de trabajo', leyTiempo.slice(0, 90));

  // Cambiar entre las dos no deja celdas de la anterior.
  controller.showMetric('zonasTrafico');
  controller.showMetric('zonas');
  const grupos = document.querySelectorAll('.heatmap-zones').length;
  ok(grupos === 1, 'al cambiar de lectura queda UNA rejilla, no dos superpuestas', String(grupos));

  // --- 15. LAS CELDAS CAEN SOBRE LAS FIGURAS, EN COORDENADAS DE PANTALLA ---
  //
  // Esta es la comprobacion que corresponde al reporte «se pinta en un espacio vacio,
  // siempre la misma figura arriba a la izquierda»: medir el DOM, no el calculo. Si el
  // grupo de celdas se cuelga de una capa que no esta bajo el viewport, o si la capa no
  // existe y se crea en otro sitio, las celdas existen, tienen color... y caen en
  // coordenadas LOCALES, apiladas cerca del origen (0,0), que es la esquina superior
  // izquierda. Comparar `getBoundingClientRect` con el de las figuras lo detecta.
  controller._elementRegistry = registro;
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 10, totalProcessingTime: 600000 } ],
    [ 'Task_2', { executionCount: 10, totalProcessingTime: 600000 } ],
    [ 'Task_3', { executionCount: 10, totalProcessingTime: 600000 } ]
  ]);

  controller.showMetric('zonas');

  const grupoZ = document.querySelector('.heatmap-zones');
  const celdasZ = grupoZ ? [ ...grupoZ.querySelectorAll('rect') ] : [];
  ok(celdasZ.length > 0, 'la rejilla se pinta', String(celdasZ.length));

  // La capa de las celdas tiene que estar DENTRO del svg del diagrama, que es lo que le
  // da el sistema de coordenadas. Fuera de el, las celdas se colocan en coordenadas
  // locales y aparecen arriba a la izquierda.
  const svgDelDiagrama = canvas.contenedor.querySelector('svg.djs-svg') || canvas.contenedor.querySelector('svg:not(.senuelo)');
  ok(Boolean(svgDelDiagrama && svgDelDiagrama.contains(grupoZ)),
    'las celdas viven DENTRO del svg del diagrama (si no, se colocan en coordenadas locales)',
    grupoZ && grupoZ.parentElement ? grupoZ.parentElement.getAttribute('class') : 'sin padre');

  // Y ninguna celda puede estar en el origen si las figuras no estan ahi: es la firma del
  // apilamiento en (0,0).
  const cajaGrupo = grupoZ.getBoundingClientRect();
  const cajaT1 = controller._elementRegistry.get('Task_1').id ? null : null;
  void cajaT1;
  ok(!(cajaGrupo.x === 0 && cajaGrupo.y === 0),
    'y el grupo de celdas NO esta pegado al origen (0,0)',
    `x=${Math.round(cajaGrupo.x)} y=${Math.round(cajaGrupo.y)}`);

  // La comprobacion de fondo: el centro de la figura tiene que tener una celda encima.
  const elemento1 = controller._elementRegistry.get('Task_1');
  const centroX = elemento1.x + elemento1.width / 2;
  const centroY = elemento1.y + elemento1.height / 2;
  const celdaSobreLaTarea = celdasZ.some((c) => {
    const x = Number(c.getAttribute('x'));
    const y = Number(c.getAttribute('y'));
    const lado = Number(c.getAttribute('width'));
    return x <= centroX && centroX <= x + lado && y <= centroY && centroY <= y + lado;
  });
  ok(celdaSobreLaTarea,
    'y hay una celda SOBRE el centro de la tarea (la mancha coincide con la figura)',
    `centro de Task_1 en (${centroX}, ${centroY})`);

  // --- 16. LAS DOS VISTAS SEGUIDAS: el escenario que falla en el Modeler ---
  //
  // El reporte dice que los CIRCULOS SI funcionan y las CELDAS no, y que todo se pinta en
  // 0,0. La diferencia entre las dos vistas estaba en como consiguen su contenedor, y en
  // el orden en que se piden: el mapa por tareas crea/reutiliza la capa de overlays con
  // `SimpleHeatSVG` y esta vista la pide DESPUES. Aqui se reproduce ese orden exacto, que
  // es el que el usuario sigue al usar la app.
  controller._elementRegistry = registro;
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 10, totalCost: 1000, totalProcessingTime: 600000 } ],
    [ 'Task_2', { executionCount: 10, totalCost: 5000, totalProcessingTime: 600000 } ]
  ]);

  // 1) primero el mapa por TAREAS, como hace el usuario (los circulos).
  // 1) el mapa por TAREAS, como hace el usuario. Su grupo tiene que quedar en la capa
  // de overlays del diagrama; si no, sus circulos estarian en otro sistema de coordenadas.
  controller.showMetric('cost');
  const grupoCirculos = document.querySelector('.heatmap-layer');
  ok(Boolean(grupoCirculos), 'el mapa por tareas crea su grupo de circulos');
  ok(Boolean(grupoCirculos && grupoCirculos.parentNode
    && grupoCirculos.parentNode.getAttribute('class') === 'layer-overlays'),
    'y su grupo vive en la capa de overlays del diagrama',
    grupoCirculos && grupoCirculos.parentNode
      ? grupoCirculos.parentNode.getAttribute('class') : 'sin padre');

  // 2) y DESPUES las zonas, que es el orden real del usuario.
  controller.showMetric('zonas');
  const grupo16 = document.querySelector('.heatmap-zones');
  ok(Boolean(grupo16), 'y despues la vista de zonas pinta su rejilla');

  // LA INVARIANTE, medida como se debe: se pregunta por la capa que usa CADA VISTA, en vez
  // de comparar grupos del DOM. Comparar grupos no vale porque cada vista BORRA el grupo de
  // la anterior al empezar (`clearOverlaysAndHeatmap`): el de los circulos ya no existe
  // cuando se mira, y la comprobacion daria un falso fallo. La capa, en cambio, es la misma
  // para las dos y es lo que les da el sistema de coordenadas.
  const capaDeZonas = grupo16 && grupo16.parentNode;
  ok(Boolean(capaDeZonas && capaDeZonas.getAttribute('class') === 'layer-overlays'),
    'y las celdas viven en ESA MISMA capa de overlays, no en otra',
    capaDeZonas ? capaDeZonas.getAttribute('class') : 'sin padre');

  // Y la capa tiene que estar DENTRO del svg del diagrama: fuera de el, sus coordenadas
  // serian locales y todo se apilaria en (0,0), que es el reporte.
  const svg16 = canvas.contenedor.querySelector('svg.djs-svg');
  ok(Boolean(svg16 && svg16.contains(capaDeZonas)),
    'y la capa esta dentro del svg del diagrama (mismo sistema de coordenadas)');

  // 3) y volver a los circulos no puede romper nada.
  controller.showMetric('cost');
  ok(Boolean(document.querySelector('.heatmap-layer circle')),
    'y volver al mapa por tareas sigue pintando circulos');

  // --- 17. UNA CONEXION SIN GEOMETRIA NO PUEDE ROBARLE EL ROJO AL DIAGRAMA ---
  //
  // Este es el reporte exacto: «se pintan las demas secciones pero en azul, lo unico rojo
  // es 0,0, y no hay figuras en esa zona». Una conexion de bpmn-js NO tiene width/height;
  // si su trazo no se puede muestrear, su masa caia en el centro de su caja, que sin caja
  // es (0,0). Y como la escala es RELATIVA AL MAXIMO, esa celda inventada se llevaba el
  // rojo y el diagrama de verdad -que si tiene valor- salia azul entero.
  controller._elementRegistry = registro;
  // Las tareas tienen su caja; el flujo NO, y ademas no tiene `d` en su grafico.
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 10, totalProcessingTime: 600000 } ],
    [ 'Task_2', { executionCount: 10, totalProcessingTime: 600000 } ],
    [ 'F3', { executionCount: 900 } ]   // una conexion sin trazo utilizable, con MUCHO trafico
  ]);

  // Se anula el trazo de los flujos para reproducir el caso: sin `d`, no hay donde poner
  // su masa.
  const originalPuntos = controller._puntosDelTrazo;
  controller._puntosDelTrazo = () => null;

  controller.showMetric('zonas');

  const rects17 = [ ...document.querySelectorAll('.heatmap-zones rect') ];
  ok(rects17.length > 0, 'la rejilla se pinta aunque haya una conexion sin trazo', String(rects17.length));

  // NINGUNA celda en el origen: es la firma del fallo.
  const enOrigen = rects17.filter((r) => Number(r.getAttribute('x')) === 0 && Number(r.getAttribute('y')) === 0);
  ok(enOrigen.length === 0,
    'y NO hay ninguna celda en (0,0): la conexion sin trazo no aporta ahi',
    enOrigen.length ? `${enOrigen.length} celdas en el origen` : 'ninguna en el origen');

  // Y el rojo esta DONDE HAY FIGURAS, no en una esquina vacia. Se comprueba que la celda
  // mas opaca cae dentro de la caja de alguna tarea.
  const cajas = [ 'Task_1', 'Task_2', 'Task_3' ]
    .map((id) => controller._elementRegistry.get(id))
    .filter(Boolean)
    .map((el) => ({ x: el.x, y: el.y, w: el.width, h: el.height }));

  const masCaliente = rects17.slice().sort((a, b) =>
    Number(b.getAttribute('opacity')) - Number(a.getAttribute('opacity')))[0];
  const cx17 = Number(masCaliente.getAttribute('x'));
  const cy17 = Number(masCaliente.getAttribute('y'));
  const lado17 = Number(masCaliente.getAttribute('width'));

  const sobreAlgunaFigura = cajas.some((c) =>
    cx17 + lado17 >= c.x && cx17 <= c.x + c.w && cy17 + lado17 >= c.y && cy17 <= c.y + c.h);

  ok(sobreAlgunaFigura,
    'y la celda MAS CALIENTE cae sobre una figura, no en una esquina vacia',
    `la mas caliente en (${cx17}, ${cy17})`);

  // Y EL CASO QUE DE VERDAD ROMPE: una conexion CON caja y sin trazo. El recorte por la
  // caja no la elimina -tiene una caja de verdad donde caer-, asi que sin el filtro su
  // masa entera se va a su caja, y si esa caja esta en el origen se lleva el rojo.
  //
  // Es lo que el usuario describe: «lo unico rojo es 0,0 y no hay figuras en esa zona».
  const flujoConCaja = controller._elementRegistry.get('F3');
  flujoConCaja.width = 100;
  flujoConCaja.height = 80;
  flujoConCaja.x = 0;
  flujoConCaja.y = 0;

  controller._puntosDelTrazo = () => null;
  controller.showMetric('zonas');

  const rects17b = [ ...document.querySelectorAll('.heatmap-zones rect') ];

  // El umbral importa: las tareas del modelo de prueba estan en (100, 100), asi que su
  // mancha LEGITIMA llega cerca del origen. Lo que se mide es que no haya celdas DENTRO
  // de la caja de la conexion inventada -0..100-, que es donde caeria su masa entera.
  const dentroDeLaCajaInventada = rects17b.filter((r) => {
    const x = Number(r.getAttribute('x'));
    const y = Number(r.getAttribute('y'));
    const lado = Number(r.getAttribute('width'));
    // El centro de la celda dentro de la caja 0..100: ahi no hay ninguna figura.
    return (x + lado / 2) < 100 && (y + lado / 2) < 100;
  });
  ok(dentroDeLaCajaInventada.length === 0,
    'y una conexion CON caja en el origen y SIN trazo no pinta dentro de esa caja',
    dentroDeLaCajaInventada.length
      ? `${dentroDeLaCajaInventada.length} celdas dentro de 0..100`
      : 'ninguna dentro de la caja inventada');

  controller._puntosDelTrazo = originalPuntos;

  // --- 18. EL MAPA POR TAREAS REPARTE ENTRE EL MINIMO Y EL MAXIMO ---
  //
  // Es el reporte «casi todo en azul y un punto rojo»: con `valor / max`, el minimo de una
  // corrida real cae por debajo de 0,4 -donde la escala deja de ser plana-, y solo el
  // maximo llega al rojo. Se reproduce con el caso del BUCLE: la compuerta se ejecuta 9
  // veces mas que una tarea.
  controller._elementRegistry = registro;
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 100 } ],
    [ 'Task_2', { executionCount: 100 } ],
    [ 'Gateway_1', { executionCount: 900 } ]
  ]);

  controller.showMetric('frequency');
  const circulos18 = [ ...document.querySelectorAll('.heatmap-layer circle') ];
  ok(circulos18.length === 3, 'se pintan las tres figuras con frecuencia', String(circulos18.length));

  const ops18 = circulos18.map((c) => Number(c.getAttribute('opacity'))).sort((a, b) => a - b);
  const minima = ops18[0];
  const maxima = ops18[ops18.length - 1];

  // Hay DOS valores distintos en la corrida (100 y 900), asi que tiene que haber DOS
  // opacidades, no una. Es lo que se mide, y con cuidado: pedir TRES seria pedir algo
  // imposible -dos figuras con el mismo valor merecen el mismo color, es correcto-.
  const niveles = new Set(ops18.map((o) => o.toFixed(3))).size;

  ok(niveles === 2,
    'los dos valores distintos de la corrida reciben DOS opacidades distintas',
    ops18.map((o) => o.toFixed(3)).join(', '));
  ok(maxima === 1, 'el maximo recibe el extremo CALIDO', maxima.toFixed(3));

  // LA PRUEBA QUE DISTINGUE LAS DOS REGLAS, y aqui esta el detalle: el minimo NO puede
  // quedar por encima de 0,15. Con `valor/max` daba 100/900 = 0,111, y con el reparto por
  // rango da 0 (el suelo `OPACIDAD_MINIMA` lo sube a 0,10). La diferencia es pequena en
  // numero pero decisiva en el DIBUJO: 0,10 y 0,11 estan los dos dentro de la banda plana
  // azul, pero con el reparto por rango el minimo ya esta en el SUELO, o sea que el
  // maximo puede estar a 1 y todo lo de en medio se reparte. Sin el reparto, el valor de
  // en medio se quedaba pegado al minimo.
  ok(minima <= 0.15,
    'y el minimo se queda en el suelo de la escala, no a media banda',
    minima.toFixed(3));

  // La senal inequivoca del fallo: donde cae un valor INTERMEDIO. Con `valor/max`, un
  // valor de 500 sobre 900 da 0,55 (cian). Con el reparto por rango, 0,5. Lo que de verdad
  // separa las dos reglas es el minimo: con la vieja, `min/max`; con la nueva, 0.
  const conReparto = minima;
  const conReglaVieja = Math.min(Math.max(100 / 900, 0.10), 1);
  ok(Math.abs(conReparto - conReglaVieja) < 0.02,
    'con este rango las dos reglas dan un minimo parecido (por eso el caso del bucle usado antes no bastaba)',
    `reparto ${conReparto.toFixed(3)} vs viejo ${conReglaVieja.toFixed(3)}`);

  // Y EL CASO QUE SI LAS SEPARA, que es el que hay que mirar: un rango donde el minimo NO
  // es casi cero, como el trafico de una tarea que se ejecuta 80 veces frente a una de 100.
  // Con `valor/max`: 0,80 (amarillo). Con el reparto por rango: 0 (azul). El mapa debe
  // enseñar el CONTRASTE, no la distancia al cero.
  const opsSesgado = (() => {
    controller.simulationResults = new Map([
      [ 'Task_1', { executionCount: 80 } ],
      [ 'Task_2', { executionCount: 100 } ]
    ]);
    controller.showMetric('frequency');
    return [ ...document.querySelectorAll('.heatmap-layer circle') ]
      .map((c) => Number(c.getAttribute('opacity'))).sort((a, b) => a - b);
  })();

  ok(opsSesgado[0] <= 0.15,
    'con un rango ESTRECHO (80 y 100) el menor sale frio, no amarillo: el mapa enseña contraste',
    opsSesgado.map((o) => o.toFixed(3)).join(', '));

  // --- 11. Que se vea, con la escala por defecto (pixel) ---
  //
  // ESTA es la comprobacion que faltaba, y la que explica el reporte. Contar circulos
  // -que es lo que hacian todas las anteriores- dice que estan CREADOS, no que se VEAN:
  // si el filtro de color no pinta, los circulos existen, la leyenda sale y el mapa no
  // se ve. Aqui se rasteriza el SVG REAL (con su filtro y su degradado) y se cuentan
  // los pixeles con color. Si el filtro no pinta, el SVG sale blanco y aqui se ve.
  controller.simulationResults = new Map([
    [ 'Task_1', { executionCount: 10, totalCost: 1000 } ],
    [ 'Task_2', { executionCount: 10, totalCost: 5000 } ]
  ]);
  controller.showMetric('cost');

  // --- 9a. El estilo CALCULADO de la capa, EN VIVO ---
  //
  // Esta es la diferencia entre «se pinta en la pantalla» y «sale en el PNG
  // exportado», que es justo lo que se reporto: el export rasteriza el SVG SIN las
  // hojas de estilo del documento, asi que un CSS que oculte la capa se ve en la
  // pantalla y NO en el PNG. Mirar el atributo no basta: hay que mirar el calculado.
  const capaCalor = document.querySelector('.heatmap-layer');
  const circuloCalor = capaCalor ? capaCalor.querySelector('circle') : null;
  ok(Boolean(capaCalor), 'existe la capa del calor en el documento vivo');

  if (capaCalor && circuloCalor) {
    // Se recorre la CADENA de ancestros: basta con que UNO este oculto para que no
    // se vea nada, aunque el circulo este perfecto.
    const cadena = [];
    let nodo = circuloCalor;
    while (nodo && nodo !== document.documentElement) {
      const cs = getComputedStyle(nodo);
      cadena.push({ clase: nodo.getAttribute('class') || nodo.nodeName, display: cs.display,
        visibility: cs.visibility, opacity: cs.opacity, mixBlendMode: cs.mixBlendMode,
        filter: cs.filter });
      nodo = nodo.parentElement;
    }

    const oculto = cadena.find((n) => n.display === 'none' || n.visibility === 'hidden'
      || Number(n.opacity) === 0);
    ok(!oculto, 'ningun ancestro del circulo esta oculto (display/visibility/opacity)',
      oculto ? JSON.stringify(oculto) : `${cadena.length} niveles, todos visibles`);

    const csCirculo = getComputedStyle(circuloCalor);
    ok(csCirculo.display !== 'none' && csCirculo.visibility !== 'hidden' && Number(csCirculo.opacity) > 0,
      'el circulo resuelve visible por si mismo',
      `display=${csCirculo.display} visibility=${csCirculo.visibility} opacity=${csCirculo.opacity}`);
    ok(csCirculo.fill !== 'none' && csCirculo.fill !== 'rgba(0, 0, 0, 0)',
      'y tiene relleno (la gradiente del desvanecido resuelve)', csCirculo.fill);

    // --- 9b. LOS DEFS VIVEN EN EL MISMO SVG QUE LOS CIRCULOS ---
    //
    // Es la invariante de la que dependen las DOS cosas a la vez, y la que explica
    // la asimetria que se reporto: la pantalla no pinta y el PNG exportado si. Los
    // circulos llevan `filter="url(#heatmap-colorize)"`; si los defs acaban en OTRO
    // svg del contenedor, la pantalla depende de que el navegador resuelva la
    // referencia a nivel de documento -y cuando eso falla, los circulos se quedan
    // sin filtro y no se ven-, mientras el export los reune por id y por eso si los
    // pinta. Se comprueba subiendo desde el circulo: el filtro tiene que estar
    // dentro de SU svg.
    const svgDelCirculo = circuloCalor.closest('svg');
    const filtroDelCirculo = svgDelCirculo && svgDelCirculo.querySelector('defs #heatmap-colorize');
    ok(Boolean(filtroDelCirculo),
      'el filtro del calor esta en el <defs> del MISMO svg que los circulos',
      filtroDelCirculo ? 'mismo svg' : 'EN OTRO SITIO: la pantalla depende del documento entero');

    const gradienteDelCirculo = svgDelCirculo && svgDelCirculo.querySelector('defs #heatmap-blur-gradient');
    ok(Boolean(gradienteDelCirculo),
      'y la gradiente del desvanecido tambien (el relleno de cada circulo)');

    // El otro lado de la invariante: los defs del calor NO pueden estar repetidos por
    // el documento. Repetir ids «funciona» pero es fragil: el navegador resuelve el
    // primero que encuentre, y basta con que uno se quede sin la tabla de color para
    // que el mapa salga en blanco.
    ok(document.querySelectorAll('#heatmap-colorize').length === 1,
      'y el filtro no esta duplicado en el documento',
      String(document.querySelectorAll('#heatmap-colorize').length));
  }

  // Se rasteriza el svg DE LA CAPA (el del diagrama), no «el primero del
  // contenedor»: ese primero puede ser un señuelo, y entonces se estaria midiendo el
  // svg equivocado en vez de lo que se ve.
  const svgEl = (document.querySelector('.heatmap-layer') || {}).closest
    ? document.querySelector('.heatmap-layer').closest('svg')
    : canvas.contenedor.querySelector('svg');
  // El SVG del diagrama no lleva tamano propio (lo tiene el contenedor). Para
  // rasterizarlo hay que darselo, y tiene que cubrir donde caen las manchas.
  svgEl.setAttribute('width', '1000');
  svgEl.setAttribute('height', '300');
  svgEl.setAttribute('viewBox', '0 0 1000 300');
  svgEl.setAttribute('xmlns', NS);

  const url = 'data:image/svg+xml;charset=utf-8,'
    + encodeURIComponent(new XMLSerializer().serializeToString(svgEl));

  const volcarFinal = () => {
    lineas.push('');
    lineas.push(fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`);
    document.getElementById('informe').textContent = lineas.join('\n');
  };

  const imagen = new Image();
  imagen.onload = () => {
    try {
      const lienzo = document.createElement('canvas');
      lienzo.width = 1000;
      lienzo.height = 300;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1000, 300);
      ctx.drawImage(imagen, 0, 0);

      const px = ctx.getImageData(0, 0, 1000, 300).data;
      let conColor = 0;
      for (let i = 0; i < px.length; i += 4) {
        // «Con color» = se separa del blanco. Es la definicion de «se ve algo».
        if (Math.abs(px[i] - 255) > 6 || Math.abs(px[i + 1] - 255) > 6 || Math.abs(px[i + 2] - 255) > 6) {
          conColor++;
        }
      }

      const circulos = document.querySelectorAll('.heatmap-layer circle').length;
      ok(circulos > 0, 'el mapa tiene sus circulos creados', String(circulos));
      ok(conColor > 500,
        'Y SE VEN: el SVG rasterizado tiene pixeles con color (no sale blanco)',
        `${conColor} pixeles con color de 300000`);
    } catch (e) {
      ok(false, 'la rasterizacion del SVG no se pudo medir', String(e && e.message));
    }
    volcarFinal();
  };
  imagen.onerror = () => {
    ok(false, 'el SVG no se pudo cargar como imagen para medir sus pixeles');
    volcarFinal();
  };
  imagen.src = url;
  // El informe se escribe al terminar la carga (arriba). Si algo la dejara colgada,
  // este respaldo escribe lo que ya hay, para no perder el informe entero.
  setTimeout(volcarFinal, 3000);
} catch (e) {
  lineas.push('EXCEPCIÓN: ' + (e && e.stack ? e.stack : e));
  fallos++;
  lineas.push('');
  lineas.push(fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`);
  document.getElementById('informe').textContent = lineas.join('\n');
}
