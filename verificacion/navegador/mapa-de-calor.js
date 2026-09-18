/**
 * Arnés DOM del mapa de calor (webpack + Chrome headless).
 *
 * Cubre lo que el arnés de Node NO puede: el filtro SVG real (feFuncR/G/B con su
 * tabla de color generada por el canvas) y los atributos `opacity` de los
 * círculos que `draw()` crea de verdad. Es justo donde una comprobación aislada
 * de la matemática se queda corta (el fallo que dejó pasar la regresión del zoom).
 *
 * Importa los módulos REALES del plugin.
 */
import SimpleHeatSVG from '@plugin/simpleheat-svg.js';
import {
  GRADIENTE_ESCALA, opacidadDe, OPACIDAD_UNIFORME, OPACIDAD_MINIMA
} from '@plugin/simulation/HeatmapScale.js';

let fallos = 0;
const lineas = [];
const ok = (cond, etiqueta, detalle) => {
  lineas.push(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const NS = 'http://www.w3.org/2000/svg';

// Canvas falso con la forma que espera SimpleHeatSVG: getContainer() -> algo con
// un <svg>, y getLayer('overlays') -> un <g>.
function crearCanvasFalso() {
  const contenedor = document.createElement('div');
  const svg = document.createElementNS(NS, 'svg');
  const defs = document.createElementNS(NS, 'defs');
  const overlays = document.createElementNS(NS, 'g');
  svg.appendChild(defs);
  svg.appendChild(overlays);
  contenedor.appendChild(svg);
  document.body.appendChild(contenedor);
  return {
    contenedor,
    getContainer: () => contenedor,
    getLayer: (name) => (name === 'overlays' ? overlays : null)
  };
}

function tablaDe(canvasFalso, canal) {
  const nodo = canvasFalso.contenedor.querySelector(`#heatmap-colorize feFunc${canal}`);
  return nodo.getAttribute('tableValues').trim().split(/\s+/).map(Number);
}

const opacidades = (canvasFalso) =>
  [ ...canvasFalso.contenedor.querySelectorAll('.heatmap-layer circle') ]
    .map((c) => Number(c.getAttribute('opacity')));

try {
  // --- 1. La tabla de color del filtro se genera de verdad (canvas) ---
  const canvas = crearCanvasFalso();
  const heat = new SimpleHeatSVG(canvas);
  heat.gradient(GRADIENTE_ESCALA);

  const R = tablaDe(canvas, 'R');
  const G = tablaDe(canvas, 'G');
  const B = tablaDe(canvas, 'B');

  ok(R.length === 256 && G.length === 256 && B.length === 256,
    'la tabla del filtro tiene 256 entradas', String(R.length));
  // Extremo frío = azul (R bajo, G bajo, B alto); extremo cálido = rojo.
  ok(R[0] < 0.2 && B[0] > 0.8, 'la entrada 0 es AZUL (frío)', `R=${R[0].toFixed(2)} B=${B[0].toFixed(2)}`);
  ok(R[255] > 0.8 && G[255] < 0.2 && B[255] < 0.2,
    'la entrada 255 es ROJA (cálido): el máximo cae SIEMPRE aquí',
    `R=${R[255].toFixed(2)} G=${G[255].toFixed(2)} B=${B[255].toFixed(2)}`);
  // El extremo frío es plano hasta 0.4: por eso la opacidad uniforme debe caer
  // por debajo de 0.4 y no por encima.
  ok(R[102] < 0.2 && B[102] > 0.8, 'hasta 0.4 la escala sigue siendo azul (banda fría)');

  // --- 2. Caso uniforme: las manchas salen FRÍAS, no rojas ---
  heat.data([ [ 100, 100, 1, 50, opacidadDe(1, 1, true) ] ])
    .max(1).radius(20, 10).draw();
  const opU = opacidades(canvas);
  ok(opU.length === 1, 'se dibujó una mancha', String(opU.length));
  ok(opU[0] === OPACIDAD_UNIFORME, 'con la opacidad uniforme', String(opU[0]));
  ok(opU[0] < 0.4, 'y cae en la banda FRÍA: el mapa NO sale rojo', `${opU[0]} < 0.4`);
  ok(opU[0] < 1, 'no llega al extremo caliente', String(opU[0]));

  // --- 3. Con diferencias: el máximo sigue yendo al tope (rojo) ---
  heat.data([
    [ 100, 100, 5, 50, opacidadDe(5, 5, false) ],
    [ 300, 100, 1, 50, opacidadDe(1, 5, false) ]
  ]).max(5).draw();
  const opD = opacidades(canvas);
  ok(opD[0] === 1, 'el máximo recibe opacidad 1 (extremo rojo)', String(opD[0]));
  ok(Math.abs(opD[1] - 0.2) < 1e-9, 'el 1 sobre un máximo de 5 recibe 0.2', String(opD[1]));

  // --- 4. Sin el 5º elemento, se cae a valor/max (librería suelta) ---
  heat.data([ [ 100, 100, 1, 50 ] ]).max(1).draw();
  ok(opacidades(canvas)[0] === 1, 'sin opacidad explícita sigue usando valor/max', String(opacidades(canvas)[0]));

  heat.data([ [ 100, 100, 0, 50 ] ]).max(1).draw();
  ok(opacidades(canvas)[0] === OPACIDAD_MINIMA,
    'y un valor 0 se queda en la opacidad mínima (se ve, no desaparece)', String(opacidades(canvas)[0]));

  // --- 5. La mancha lleva el radio pedido y el relleno del degradado ---
  heat.data([ [ 100, 100, 2, 77, opacidadDe(2, 2, true) ] ]).max(2).radius(20, 10).draw();
  const circulo = canvas.contenedor.querySelector('.heatmap-layer circle');
  ok(circulo.getAttribute('r') === '77', 'el radio del punto se respeta', circulo.getAttribute('r'));
  ok(circulo.getAttribute('fill') === 'url(#heatmap-blur-gradient)',
    'y el relleno es el degradado del desvanecido');
} catch (e) {
  lineas.push('EXCEPCIÓN: ' + (e && e.stack ? e.stack : e));
  fallos++;
}

lineas.push('');
lineas.push(fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`);

document.getElementById('informe').textContent = lineas.join('\n');
