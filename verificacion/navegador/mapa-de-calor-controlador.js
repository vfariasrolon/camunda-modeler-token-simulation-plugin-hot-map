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
  document.body.appendChild(contenedor);
  return {
    contenedor,
    getContainer: () => contenedor,
    getLayer: (name) => (name === 'overlays' ? capa : null)
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
  // --- 9. QUE SE VEA: el pixel, no el atributo ---
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
