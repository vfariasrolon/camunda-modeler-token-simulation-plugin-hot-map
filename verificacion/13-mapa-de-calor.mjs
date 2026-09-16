/**
 * El color del mapa de calor no puede mentir.
 *
 * Por qué existe: la escala es RELATIVA al máximo de la corrida, y el máximo cae
 * siempre en la última parada (rojo). Cuando todas las tareas tienen el mismo
 * valor —el caso de «cantidad de recursos»: todas con 1— cada mancha recibía
 * `valor / max = 1` y el mapa salía ENTERO ROJO, como si todo fuese crítico,
 * cuando en realidad solo significa «no hay diferencias». Es la segunda vez que
 * un detalle del mapa de calor (antes el zoom) llegó a producción sin red.
 *
 * Comprueba el comportamiento REAL: importa `HeatmapScale`, que es exactamente
 * el módulo que el plugin usa para decidir la opacidad y el texto de la leyenda
 * (no reimplementa la regla aquí). Además revisa el CABLEADO, porque una función
 * correcta que nadie llama no arregla nada: es el fallo que dejó pasar la
 * regresión del zoom.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  opacidadDe, rangoDeValores, textoDeEscala, escalaDeMetrica,
  gradienteCss, colorFrio, colorCalido,
  OPACIDAD_UNIFORME, OPACIDAD_MINIMA, GRADIENTE_ESCALA, ESCALA_POR_METRICA
} from './HeatmapScale.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

// La banda FRÍA de la escala: por debajo de esta opacidad el filtro pinta azul
// (la primera parada del degradado es 0.4 = blue). Por encima, el color sube
// hacia cian/lima/amarillo y, en el tope, rojo.
const TOPE_BANDA_FRIA = 0.4;

console.log('\n== 1. Sin diferencias el mapa NO sale entero rojo (el caso reportado) ==');
{
  // Tres tareas, todas con la misma cantidad de recursos.
  const rango = rangoDeValores([1, 1, 1]);
  ok(rango.uniforme === true, 'se detecta el caso uniforme', JSON.stringify(rango));
  ok(rango.min === 1 && rango.max === 1, 'min y max coinciden', `${rango.min}/${rango.max}`);

  // La regla ANTIGUA daba valor/max = 1 => extremo caliente (rojo). Se deja
  // comprobado para que se vea que el arnés distingue los dos caminos.
  ok(opacidadDe(1, 1, false) === 1, 'la regla antigua daba 1 (extremo rojo)');

  const op = opacidadDe(1, 1, true);
  ok(op === OPACIDAD_UNIFORME, 'la regla nueva usa la opacidad uniforme', String(op));
  ok(op < TOPE_BANDA_FRIA, 'y cae en la banda FRÍA (azul), no en la caliente', `${op} < ${TOPE_BANDA_FRIA}`);
  ok(op > OPACIDAD_MINIMA, 'pero por encima del mínimo: se ve, no desaparece', `${op} > ${OPACIDAD_MINIMA}`);

  // Con 2 y con 3 también, no solo con 1.
  [1, 2, 3, 7].forEach((c) => {
    const o = opacidadDe(c, c, rangoDeValores([c, c, c]).uniforme);
    ok(o < TOPE_BANDA_FRIA, `uniforme con cantidad ${c} sigue en frío`, String(o));
  });
}

console.log('\n== 2. Con diferencias la escala sigue siendo la de siempre ==');
{
  const rango = rangoDeValores([1, 1, 1, 5]);
  ok(rango.uniforme === false, 'no es uniforme');
  ok(rango.min === 1 && rango.max === 5, 'min/max correctos', `${rango.min}/${rango.max}`);
  ok(opacidadDe(5, 5, false) === 1, 'el máximo sigue yendo al tope (rojo)');
  ok(opacidadDe(1, 5, false) === 0.2, 'y el mínimo a su valor relativo', String(opacidadDe(1, 5, false)));

  // El mismo dato cambia de color según el resto del diagrama: por eso hace
  // falta la leyenda, que es la otra mitad del arreglo.
  ok(opacidadDe(1, 1, true) !== opacidadDe(1, 5, false),
    'un valor de 1 NO se pinta igual con max=1 que con max=5');
}

console.log('\n== 3. Casos degenerados (no puede dividir por cero ni desaparecer) ==');
{
  ok(rangoDeValores([]).uniforme === true && rangoDeValores([]).n === 0,
    'sin valores: uniforme y n=0 (la leyenda no se pinta)');
  ok(rangoDeValores([0, 0, 0]).uniforme === true, 'todos cero es uniforme');
  ok(opacidadDe(0, 0, false) === OPACIDAD_MINIMA, 'valor 0 con max 0 no divide por cero');
  ok(Number.isFinite(opacidadDe(0, 0, true)) && opacidadDe(0, 0, true) === OPACIDAD_UNIFORME,
    'y en uniforme sigue siendo la fría');
}

console.log('\n== 4. La leyenda dice el rango REAL ==');
{
  const u = textoDeEscala('resourceQuantity', { min: 1, max: 1, uniforme: true });
  ok(u.uniforme === true, 'el caso uniforme se marca como tal');
  ok(/uniforme/i.test(u.detalle) && u.detalle.includes('1'),
    'y lo dice con el valor único, no con un «1 → 1»', u.detalle);
  ok(/frío|frio/i.test(u.nota), 'y avisa de que se pinta en frío', u.nota);

  const r = textoDeEscala('resourceQuantity', { min: 1, max: 3, uniforme: false });
  ok(r.uniforme === false, 'el caso con rango no se marca uniforme');
  ok(r.detalle.includes('1') && r.detalle.includes('3'),
    'el detalle lleva el mínimo y el máximo reales', r.detalle);

  // La etiqueta de cada métrica sale de ESCALA_POR_METRICA, no de un texto suelto.
  ok(textoDeEscala('cost', { min: 0, max: 10, uniforme: false }).titulo === ESCALA_POR_METRICA.cost.etiqueta,
    'el título de la leyenda es la etiqueta de la métrica');
}

console.log('\n== 5. Toda métrica de la paleta tiene escala (leyenda nunca sin unidad) ==');
{
  const paleta = leer('client/simulation/SimulationPalette.js');
  const metricas = [ ...paleta.matchAll(/metric:\s*'([a-zA-Z]+)'/g) ].map((m) => m[1]);

  ok(metricas.length >= 11, 'se leyeron las métricas de la paleta', String(metricas.length));

  metricas.forEach((m) => {
    const tiene = Object.prototype.hasOwnProperty.call(ESCALA_POR_METRICA, m);
    const e = escalaDeMetrica(m);
    ok(tiene && typeof e.formatea === 'function' && e.formatea(2).length > 0,
      `la métrica «${m}» tiene etiqueta y formato propios`);
  });
}

console.log('\n== 6. La barra de la leyenda coincide con el degradado del filtro ==');
{
  const css = gradienteCss();
  ok(colorFrio() === 'blue' && colorCalido() === 'red',
    'frío = azul y cálido = rojo (la escala no cambia de sentido)', `${colorFrio()}/${colorCalido()}`);
  ok(css.startsWith('linear-gradient'), 'la barra es un degradado', css.slice(0, 26) + '…');
  ok(css.includes(`${colorFrio()} 0%`), 'arranca en el extremo frío', colorFrio());
  ok(css.trim().endsWith(`${colorCalido()} 100%)`), 'y termina en el cálido', colorCalido());

  // El degradado del filtro SVG vive en HeatmapScale, pero `simpleheat-svg.js`
  // conserva una copia como valor por defecto de la librería suelta. No pueden
  // divergir: si alguien cambia una, esta comprobación lo caza.
  const fuente = leer('client/simpleheat-svg.js');
  const inicio = fuente.indexOf('const defaultGradient');
  const bloque = fuente.slice(inicio, fuente.indexOf('};', inicio));
  const pares = [ ...bloque.matchAll(/([\d.]+):\s*'([a-z]+)'/g) ].map((m) => [ Number(m[1]), m[2] ]);

  ok(pares.length === Object.keys(GRADIENTE_ESCALA).length,
    'el degradado por defecto tiene las mismas paradas', `${pares.length} vs ${Object.keys(GRADIENTE_ESCALA).length}`);
  Object.entries(GRADIENTE_ESCALA).forEach(([t, color]) => {
    const encontrado = pares.find(([tt]) => tt === Number(t));
    ok(encontrado && encontrado[1] === color, `la parada ${t} coincide (${color})`);
  });
}

console.log('\n== 7. El cableado: las piezas correctas están conectadas de verdad ==');
{
  const controlador = leer('client/simulation/SimulationController.js');

  ok(/rangoDeValores\(/.test(controlador), 'el controlador calcula el rango con rangoDeValores');
  ok(/opacidadDe\(/.test(controlador), 'y la opacidad por mancha con opacidadDe');
  ok(/textoDeEscala\(/.test(controlador), 'y el texto de la leyenda con textoDeEscala');
  ok(/\.gradient\(GRADIENTE_ESCALA\)/.test(controlador),
    'y fija el degradado del filtro desde HeatmapScale (no desde una copia)');
  ok(/_renderLegend\(/.test(controlador), 'la leyenda se renderiza');
  ok(/querySelector\('\.heatmap-legend'\)/.test(controlador),
    'y se crea/reutiliza por su clase');
  ok(/leyenda\.remove\(\)|\.heatmap-legend'\);\s*\n\s*if \(leyenda\) leyenda\.remove\(\)/.test(controlador),
    'y se quita al limpiar (no se queda pegada al diagrama)');

  // La limpieza tiene que quitar la leyenda ADEMAS de los overlays.
  const def = controlador.indexOf('clearOverlaysAndHeatmap() {');
  const limpieza = controlador.slice(def, controlador.indexOf('\n  }', def));
  ok(/heatmap-legend/.test(limpieza), 'clearOverlaysAndHeatmap quita la leyenda');

  const heat = leer('client/simpleheat-svg.js');
  ok(/p\.length > 4 && p\[4\] != null/.test(heat),
    'simpleheat respeta la opacidad del punto si viene');
  ok(/p\[2\] \/ this\._max/.test(heat),
    'y si no viene, cae a valor/max (comportamiento de la librería suelta)');

  const css = leer('client/simulation/simulation.css');
  const bloqueCss = css.slice(css.indexOf('.heatmap-legend {'));
  ok(/\.heatmap-legend\s*\{/.test(css), 'la leyenda tiene estilos');
  ok(/pointer-events:\s*none/.test(bloqueCss.slice(0, 600)),
    'y no intercepta el ratón (pointer-events: none)');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
