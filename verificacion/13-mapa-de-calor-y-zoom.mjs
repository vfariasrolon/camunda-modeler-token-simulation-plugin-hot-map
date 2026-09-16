/**
 * El mapa de calor se ve a cualquier zoom.
 *
 * Dos cosas que hay que comprobar juntas, y son opuestas:
 *   1. Que al ALEJAR, la mancha se agrande en el diagrama justo lo necesario para
 *      seguir midiendo lo mismo EN PANTALLA. Si no, desaparece al alejarse, que es
 *      justo el fallo que se esta arreglando.
 *   2. Que la compensacion TENGA TOPE. Compensar sin limite convertiria todas las
 *      manchas en una sola que tapa el diagrama, que es peor que el fallo.
 *
 * Se ejercita el codigo REAL del controlador: se extrae `_blobRadius` y `_zoomActual`
 * del fichero, sustituyendo solo lo que depende de bpmn-js.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RAIZ, 'client', 'simulation', 'SimulationController.js'), 'utf8');

// Las constantes reales, leidas del fichero (no copiadas a mano).
const MAX_BLOB_RADIUS = Number(src.match(/const MAX_BLOB_RADIUS = (\d+)/)[1]);
const MIN_ZOOM_COMPENSADO = Number(src.match(/const MIN_ZOOM_COMPENSADO = ([\d.]+)/)[1]);

// Los dos metodos reales.
const extraer = (nombre) => src.match(new RegExp(`  ${nombre}\\([\\s\\S]*?\\n  \\}`))[0];
const cuerpo = extraer('_blobRadius') + '\n' + extraer('_zoomActual');

// Se monta una clase con el mismo nombre y solo los dos metodos, mas lo que usan.
// El `is()` real de bpmn-js RESPETA LA JERARQUIA de tipos: una tarea ES un
// FlowNode. Un stub de igualdad exacta haria que la rama de la figura nunca se
// ejecutara y el arnes comprobaria un camino que no es el que corre en produccion.
const ES_FLOWNODE = new Set([ 'bpmn:Task', 'bpmn:Gateway', 'bpmn:Event', 'bpmn:Activity', 'bpmn:FlowNode' ]);
const stubIs = (el, tipo) => {
  if (!el) return false;
  if (tipo === 'bpmn:FlowNode') return ES_FLOWNODE.has(el.$type);
  return el.$type === tipo;
};

const Clase = new Function('MIN_ZOOM_COMPENSADO', 'MAX_BLOB_RADIUS', 'is', `
  return class Probe {
    constructor(zoom) { this._zoom = zoom; this._radius = 20; this._blur = 10; }
    ${cuerpo.replace(/\bis\(/g, 'is(')}
  };
`)(MIN_ZOOM_COMPENSADO, MAX_BLOB_RADIUS, stubIs);

const task = { id: 'T1', $type: 'bpmn:Task', width: 100, height: 80 };
const flujo = { id: 'F1', $type: 'bpmn:SequenceFlow', width: 200, height: 0 };

// El probe necesita `_canvas.zoom()`; se le inyecta.
const conZoom = (zoom) => {
  const p = new Clase(zoom);
  p._canvas = { zoom: () => zoom };
  return p;
};

console.log('\n== 1. Las constantes del fichero real ==');
{
  ok(MAX_BLOB_RADIUS === 240, 'MAX_BLOB_RADIUS sigue siendo 240', MAX_BLOB_RADIUS);
  ok(MIN_ZOOM_COMPENSADO === 0.25, 'MIN_ZOOM_COMPENSADO es 0.25', MIN_ZOOM_COMPENSADO);
  ok(/canvas\.viewbox\.changed/.test(src),
    'el controlador escucha el cambio de zoom (si no, no se redibuja)');
}

console.log('\n== 2. El tamano EN PANTALLA es constante al alejar ==');
{
  // Lo que se ve en pantalla es radio * zoom. Tiene que mantenerse igual.
  const enPantalla = (zoom) => conZoom(zoom)._blobRadius(task) * zoom;
  const base = enPantalla(1);

  [ 1, 0.75, 0.5, 0.4, 0.3, 0.25 ].forEach((z) => {
    const visto = enPantalla(z);
    ok(Math.abs(visto - base) < 0.01,
      `al ${(z * 100).toFixed(0)} % la mancha mide lo mismo en pantalla`,
      `${visto.toFixed(1)} px vs ${base.toFixed(1)} px`);
  });

  // Y el radio EN EL DIAGRAMA si crece: es el mecanismo.
  ok(conZoom(0.5)._blobRadius(task) > conZoom(1)._blobRadius(task),
    'y el radio en el diagrama crece al alejarse',
    `${conZoom(0.5)._blobRadius(task).toFixed(0)} > ${conZoom(1)._blobRadius(task).toFixed(0)}`);
}

console.log('\n== 3. Acercarse NO cambia el comportamiento ==');
{
  // Por encima del 100 % no se compensa: el mapa de calor se agranda con el
  // diagrama, como siempre.
  [ 1, 1.5, 2, 4 ].forEach((z) => {
    const r = conZoom(z)._blobRadius(task);
    ok(r === conZoom(1)._blobRadius(task),
      `al ${(z * 100).toFixed(0)} % el radio no se compensa (no hay que hacerlo)`,
      `${r.toFixed(1)} px`);
  });
}

console.log('\n== 4. La compensacion TIENE TOPE (si no, taparia el diagrama) ==');
{
  // Por debajo de MIN_ZOOM_COMPENSADO ya no crece mas. Sin tope, un zoom del 5 %
  // pediría manchas 20x mas grandes y todas se solaparian en una sola.
  const enElTope = conZoom(MIN_ZOOM_COMPENSADO)._blobRadius(task);
  [ 0.2, 0.1, 0.05, 0.01 ].forEach((z) => {
    const r = conZoom(z)._blobRadius(task);
    ok(r === enElTope,
      `al ${(z * 100).toFixed(0)} % la mancha ya no crece mas (tope en ${(MIN_ZOOM_COMPENSADO * 100).toFixed(0)} %)`,
      `${r.toFixed(1)} px`);
  });

  // Y el radio nunca supera el tope absoluto, que es lo que evita el desastre.
  ok(enElTope <= MAX_BLOB_RADIUS * (1 / MIN_ZOOM_COMPENSADO),
    'el radio maximo es el tope por el factor de compensacion maximo',
    `${enElTope.toFixed(1)} px`);
}

console.log('\n== 5. Un flujo de secuencia no se dimensiona por su caja ==');
{
  // Un flujo es una linea: dimensionarlo por su caja englobante daria manchas
  // enormes. Se queda con el radio base (compensado por el zoom).
  ok(conZoom(1)._blobRadius(flujo) === 30,
    'a zoom 1 un flujo usa el radio base (20 + 10)',
    conZoom(1)._blobRadius(flujo));
  ok(conZoom(0.5)._blobRadius(flujo) === 60,
    'y al 50 % se compensa igual que el resto',
    conZoom(0.5)._blobRadius(flujo));
  ok(conZoom(1)._blobRadius(flujo) < conZoom(1)._blobRadius(task),
    'un flujo siempre mide menos que una tarea a igual zoom',
    `${conZoom(1)._blobRadius(flujo)} < ${conZoom(1)._blobRadius(task)}`);
}

console.log('\n== 6. Un zoom invalido no rompe el mapa de calor ==');
{
  // `canvas.zoom()` podria no existir o devolver basura segun la version de
  // diagram-js. El mapa de calor no puede depender de eso.
  const sinZoom = new Clase(1);
  sinZoom._canvas = { zoom: () => { throw new Error('no soportado'); } };
  ok(sinZoom._zoomActual() === 1, 'si canvas.zoom() lanza, se asume 1');
  ok(Number.isFinite(sinZoom._blobRadius(task)), 'y el radio sigue siendo un numero',
    sinZoom._blobRadius(task));

  const basura = new Clase(1);
  basura._canvas = { zoom: () => NaN };
  ok(basura._zoomActual() === 1, 'un zoom NaN se trata como 1');
  basura._canvas = { zoom: () => 0 };
  ok(basura._zoomActual() === 1, 'un zoom 0 se trata como 1 (evita dividir por cero)');
  basura._canvas = { zoom: () => -2 };
  ok(basura._zoomActual() === 1, 'un zoom negativo se trata como 1');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
