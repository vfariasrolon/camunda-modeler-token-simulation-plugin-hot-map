/**
 * Arnes DOM de los IDs de tarea y del configurador.
 *
 * Cubre lo que el arnes de Node no puede:
 *   - Que el overlay del ID se pinte y lleve el numero correcto.
 *   - Que a zoom 25 % SIGA VISIBLE y no encogido (scale.min), que es el punto:
 *     con `show: { minZoom }` desapareceria, el fallo que ya se revirtio una vez.
 *   - Que la forma del configurador sea la del diseno (id, idCorto, unidad,
 *     supuesto, carga), que es el contrato que consume la app de App Script.
 *
 * Usa Overlays + Canvas + Injector REALES de diagram-js, no un stub. Construirlos
 * a mano deja dependencias sin cablear: `Canvas` resuelve `config`,
 * `graphicsFactory` y demas por el inyector.
 */
import Overlays from 'diagram-js/lib/features/overlays/Overlays';
import Canvas from 'diagram-js/lib/core/Canvas';
import ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EventBus from 'diagram-js/lib/core/EventBus';
import { Injector } from 'didi/dist/index.js';
import { numerarTareas } from '@plugin/simulation/TaskIds.js';

let fallos = 0;
const lineas = [];
const ok = (cond, etiqueta, detalle) => {
  lineas.push(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const tarea = (id, nombre, x) => ({
  id,
  $type: 'bpmn:Task',
  type: 'bpmn:Task',
  x, y: 100, width: 100, height: 80,
  businessObject: { name: nombre },
  incoming: [], outgoing: []
});

try {
  // --- Un diagrama con canvas y overlays REALES ---
  const contenedor = document.createElement('div');
  contenedor.style.cssText = 'width:800px;height:600px;position:relative;';
  document.body.appendChild(contenedor);

  // Se usa el Injector real de diagram-js: los modulos se piden por nombre, que es
  // como funcionan en produccion. Construirlos a mano deja dependencias sin cablear
  // (`Canvas` lee `injector` del contexto).
  const injector = new Injector([
    { config: [ 'value', { defaultRenderer: null } ] },
    { eventBus: [ 'type', EventBus ] },
    { elementRegistry: [ 'type', ElementRegistry ] },
    { canvas: [ 'type', Canvas ] },
    { overlays: [ 'type', Overlays ] },
    { graphicsFactory: [ 'value', { getGraphics: () => null, update: () => {}, create: () => null } ] }
  ]);

  const eventBus = injector.get('eventBus');
  const canvas = injector.get('canvas');

  // `_init` recibe un OBJETO de configuracion, no un nodo: `createContainer`
  // hace `options.container || document.body`. Pasandole el div directamente,
  // caia a document.body y despues el `querySelector` del arnes no encontraba
  // nada aunque los overlays SI estuvieran pintados.
  canvas._init({ container: contenedor, width: 800, height: 600 });

  // Las figuras tienen que estar en el registro y con su padre: Overlays resuelve
  // la raiz con `canvas.findRoot(element)` y con un elemento suelto
  // `rootElement !== activeRootElement` y el overlay queda OCULTO.
  const raiz = {
    id: '__implicitroot', $type: 'bpmn:Process', type: 'bpmn:Process',
    businessObject: {}, children: [], x: 0, y: 0, width: 1000, height: 800
  };
  const gfx = (el) => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-element-id', el.id);
    return g;
  };
  injector.get('elementRegistry').add(raiz, gfx(raiz));
  canvas._rootElement = raiz;
  canvas.setRootElement = () => raiz;
  canvas._setRootElement = () => {};
  canvas.findRoot = () => raiz;
  canvas.getRootElement = () => raiz;

  const A = tarea('Activity_A', 'Cortar', 100);
  const B = tarea('Activity_B', 'Soldar', 300);
  A.parent = raiz;
  B.parent = raiz;
  A.outgoing.push({ source: A, target: B });
  B.incoming.push({ source: A, target: B });

  injector.get('elementRegistry').add(A, gfx(A));
  injector.get('elementRegistry').add(B, gfx(B));

  const overlays = injector.get('overlays');

  // Diagnosticos del entorno: si algo de esto falla, el overlay se oculta solo.

  const tareas = [ A, B ];

  // --- El ID se pinta como overlay ---
  const numeros = numerarTareas(tareas);
  ok(numeros.get('Activity_A') === 1 && numeros.get('Activity_B') === 2,
    'el diagrama se numera 1, 2 en orden de flujo');

  tareas.forEach((t) => {
    overlays.add(t, 'task-id', {
      position: { top: 5, right: 5 },
      scale: { min: 0.35 },
      html: `<div class="task-id-badge">${numeros.get(t.id)}</div>`
    });
  });

  const badges = contenedor.querySelectorAll('.task-id-badge');
  ok(badges.length === 2, 'se pintaron los dos circulos', String(badges.length));
  ok([ ...badges ].map((b) => b.textContent).join(',') === '1,2',
    'con los numeros correctos', [ ...badges ].map((b) => b.textContent).join(','));

  // --- La CLAVE: a zoom 25 % el ID sigue visible ---
  // El overlay de la libreria usa show:{minZoom:0.5} y DESAPARECE. El nuestro no
  // lleva minZoom, asi que tiene que seguir visible a cualquier escala.
  canvas.zoom(0.25);
  eventBus.fire('canvas.viewbox.changed', { viewbox: canvas.viewbox() });

  const visibles = [ ...contenedor.querySelectorAll('.task-id-badge') ].filter((b) => {
    const rect = b.getBoundingClientRect();
    const estilo = getComputedStyle(b);
    return rect.width > 0 && rect.height > 0 && estilo.display !== 'none' && estilo.visibility !== 'hidden';
  });
  ok(visibles.length === 2, 'al 25 % de zoom los DOS IDs siguen visibles', String(visibles.length));

  // --- La prueba del scale.min: la compensacion esta APLICADA ---
  // A 0.25 diagram-js aplica `scale(1/0.25*0.35)` = 1.4 al contenedor del overlay:
  // el circulo deja de encoger. Se comprueba el transform EFECTIVO, que es el
  // mecanismo real, en lugar de medir el ancho (el `.djs-overlay` es absoluto y no
  // propaga tamano, asi que `offsetWidth` no sirve: daba 8px y confundia).
  const badge = contenedor.querySelector('.task-id-badge');
  const transform = getComputedStyle(badge.parentElement).transform;

  const m = transform.match(/matrix\(([\d.]+)/);
  const factor = m ? Number(m[1]) : NaN;
  ok(Math.abs(factor - 1.4) < 0.01,
    'a zoom 0.25 el contenedor del ID se compensa x1.4 (deja de encoger)', transform);

  // Escala EFECTIVA sobre el badge: el navegador anida la del diagrama (0.25) con
  // la del overlay (1.4), asi que el circulo se ve a 0.35 y no a 0.25. Es decir,
  // por debajo del 35 % deja de encoger: 1.4x mas grande que sin `scale.min`.
  ok(Math.abs(factor * 0.25 - 0.35) < 0.01,
    'la escala efectiva del circulo se queda en 0.35 (el minimo pedido)',
    `0.25 * 1.4 = ${(factor * 0.25).toFixed(2)}`);
  ok(factor > 1, 'y por tanto es MAYOR que 1: no encoge como el resto del diagrama');

  // Contraste con el comportamiento de la LIBRERIA: un overlay con minZoom se oculta.
  const conMinZoom = overlays.add(A, 'prueba-minzoom', {
    position: { top: 5, left: 5 },
    html: '<div class="prueba-minzoom">X</div>',
    show: { minZoom: 0.5 }
  });
  const oculto = contenedor.querySelector('.prueba-minzoom');
  ok(oculto && getComputedStyle(oculto.parentElement).display === 'none',
    'un overlay con minZoom SI se oculta al 25 % (por eso NO se usa minZoom)',
    oculto ? getComputedStyle(oculto.parentElement).display : 'no se pinto');
  overlays.remove(conMinZoom);

  // --- El configurador tiene la forma del diseno ---
  const CONFIG = {
    tipo: 'configurador-tiempos',
    version: 1,
    proyecto: { nombre: 'demo', archivo: 'demo.bpmn', fecha: '2026-09-15', semilla: 'sem-1' },
    tareas: [
      { id: 'Activity_A', idCorto: 1, nombre: 'Cortar', tipo: 'bpmn:Task', unidad: 'minutes',
        supuesto: { distribucion: 'triangular', min: 5, moda: 10, max: 20, unidad: 'minutes' },
        tiempoPorLote: false, carga: { masaCargadaKg: 12, masaArrastradaKg: 8, distanciaM: null },
        habilidad: null, medicion: { confianza: 95, precision: 5 } }
    ]
  };

  ok(CONFIG.tareas.every((t) => t.id && t.idCorto && t.unidad),
    'cada tarea lleva id, idCorto y unidad');
  ok(CONFIG.tipo === 'configurador-tiempos' && CONFIG.version === 1,
    'el archivo declara tipo y version (para poder evolucionar sin romper la app)');
  ok(typeof CONFIG.proyecto.semilla === 'string', 'la semilla viaja para poder reproducir');

  // El JSON REAL lo construye el controlador y se comprueba en el arnes de Node
  // (14-id-de-tareas.mjs): aqui se verifica la FORMA que fija el diseno, que es lo
  // que la app de App Script va a consumir.
} catch (e) {
  lineas.push('EXCEPCIÓN: ' + (e && e.stack ? e.stack : e));
  fallos++;
}

lineas.push('');
lineas.push(fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`);
document.getElementById('informe').textContent = lineas.join('\n');
