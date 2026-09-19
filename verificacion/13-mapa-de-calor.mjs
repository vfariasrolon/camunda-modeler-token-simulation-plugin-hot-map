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
  opacidadDe, rangoDeValores, fraccionDe, textoDeEscala, escalaDeMetrica,
  gradienteCss, colorFrio, colorCalido,
  bandasDeValores, gradienteBandas, topCaminos, BANDAS_RANKING,
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

console.log('\n== 14. La escala REPARTE entre el minimo y el maximo (el caso del bucle) ==');
{
  // EL REPORTE: «casi todo en azul y un punto rojo en la tarea». Con `valor / max`, el
  // minimo de una corrida real cae por debajo de 0,4 -donde la escala deja de ser plana-,
  // asi que casi todo aterriza en la banda azul y solo el maximo llega al rojo. En un
  // bucle, la compuerta se ejecuta 9 veces mas que una tarea: 100/900 = 0,11.
  const rango = rangoDeValores([ 100, 100, 100, 100, 100, 100, 100, 900 ]);
  ok(rango.uniforme === false, 'un rango con contraste no es uniforme');

  // Con la regla vieja, el minimo queda en la banda azul: es el fallo.
  const viejo = 100 / rango.max;
  ok(viejo < 0.4, 'la regla vieja (valor/max) deja el minimo en la banda PLANa azul',
    `${viejo.toFixed(3)} < 0,4`);

  // Con la nueva, el minimo recibe el extremo frio y el maximo el calido: se usa TODO el
  // rango de color, que es lo que hace legible un mapa comparativo.
  ok(fraccionDe(rango.min, rango.min, rango.max) === 0,
    'y la nueva da el extremo FRIO al minimo de la corrida');
  ok(fraccionDe(rango.max, rango.min, rango.max) === 1,
    'y el extremo CALIDO al maximo');

  // El punto medio cae en medio, que es lo que se espera de un reparto.
  const medio = fraccionDe(500, 100, 900);
  ok(Math.abs(medio - 0.5) < 1e-9, 'y reparte linealmente en medio', medio.toFixed(3));

  // Sin contraste devuelve null: quien llama decide el extremo frio. Sin esto, dividir
  // por cero daria NaN y la mancha desapareceria.
  ok(fraccionDe(5, 5, 5) === null, 'sin contraste no hay fraccion (null, no NaN)');
  ok(fraccionDe(5, 10, 10) === null, 'y con el rango degenerado tampoco');

  // Los valores fuera del rango se acotan: un dato raro no puede salirse de la escala.
  ok(fraccionDe(0, 100, 900) === 0 && fraccionDe(9999, 100, 900) === 1,
    'un valor fuera del rango se acota a los extremos');
}

console.log('\n== 15. BANDAS POR RANKING: el color dice el PUESTO, no el valor ==');
{
  // EL CASO REAL QUE MOTIVO LAS BANDAS. Son los 49 valores de una corrida de verdad, con
  // el problema que tenia la escala continua: el tramo muerto (todo por debajo de 0,4
  // recibe el MISMO azul) llegaba al valor 64,6, asi que 47 de 49 conexiones salian del
  // mismo color. Aqui se comprueba que el reparto nuevo NO deja el diagrama plano.
  const valores = [
    38, 13, 25, 30, 18, 12, 13, 8, 5, 20, 20, 20, 111, 20, 91, 40, 20, 20, 18, 20,
    20, 40, 40, 37, 18, 60, 60, 60, 46, 14, 13, 46, 46, 43, 42, 15, 27, 13, 26, 13,
    22, 3, 38, 31, 9, 9, 6, 6, 6
  ];
  const b = bandasDeValores(valores);

  ok(b.n === 49, 'las 49 conexiones entran en el reparto', String(b.n));
  ok(b.bandas.length === 4,
    'y salen las cuatro bandas (el reparto no se colapsa en una)', String(b.bandas.length));

  // LA PROPIEDAD QUE ARREGLA EL PROBLEMA: cada banda tiene elementos. Con la escala
  // continua, 47 de 49 compartian un unico color; aqui ninguna banda queda vacia.
  ok(b.bandas.every((x) => x.cuantos > 0),
    'y ninguna queda vacia, que es lo que dejaba el diagrama de un solo color',
    b.bandas.map((x) => x.cuantos).join(', '));

  // EL MAXIMO ES ROJO, siempre: es la pregunta de la vista -«cual es el camino mas
  // usado»- y por tanto no puede depender de cuanto valga.
  ok(b.bandaDe(111).color === 'red', 'el camino mas usado sale ROJO', b.bandaDe(111).color);
  ok(b.bandaDe(3).color === 'blue', 'y el menos usado sale azul', b.bandaDe(3).color);

  // LAS BANDAS SON ORDENADAS Y SE TOCAN: los rangos reales van de mayor a menor y cubren
  // el rango entero. Un hueco significaria valores que no caen en ninguna banda.
  ok(b.bandas[0].max === 111 && b.bandas[b.bandas.length - 1].min === 3,
    'los rangos de las bandas cubren de punta a punta el rango real',
    `${b.bandas[0].min}-${b.bandas[0].max} ... ${b.bandas[3].min}-${b.bandas[3].max}`);
  ok(b.bandas.every((x) => x.min <= x.max), 'y cada banda tiene su rango bien formado');

  // EL CASO DE LOS EMPATES, con el conjunto que DISCRIMINA.
  //
  // Aqui me equivoque al escribir la prueba la primera vez: use los 49 valores reales, y
  // con ellos el fallo NO se manifiesta -el bloque de ocho 20 cae en la banda amarilla de
  // las dos formas, porque las bandas son anchas (15 elementos) y la diferencia de
  // posicion no cruza ninguna frontera-. La prueba pasaba con el bug inyectado, o sea que
  // no probaba nada.
  //
  // El conjunto que SI lo separa es uno PEQUENO, donde el bloque de empatados es mas grande
  // que la banda que le toca: con 10 valores la banda roja se lleva 1 elemento, y un empate
  // de 3 en cabeza se sale de ella si se cuenta el bloque entero al final de su posicion.
  // Con la primera posicion, los tres comparten el rojo, que es su puesto.
  {
    const discrimina = [ 9, 9, 9, 5, 4, 4, 3, 3, 2, 1 ];
    const d = bandasDeValores(discrimina);
    ok(d.bandas.map((x) => x.color).join(',') === 'red,orange,yellow,blue',
      'con 10 valores salen las cuatro bandas en orden',
      d.bandas.map((x) => `${x.color}(${x.cuantos})`).join(' '));
    ok(d.bandaDe(9).color === 'red',
      'y el valor MAXIMO empatado SIGUE en la banda roja (aqui se sale si se cuenta mal)',
      `9 (x3) -> ${d.bandaDe(9).color}`);
    ok(discrimina.filter((v) => v === 9).every((v) => d.bandaDe(v).color === 'red'),
      'los tres empatados en la cabeza comparten el rojo, que es su puesto');
    ok(d.bandaDe(1).color === 'blue', 'y el minimo sigue en el extremo frio', d.bandaDe(1).color);
  }

  // Y con los 49 valores reales: aqui lo que se comprueba es que el empate no PARTE el
  // bloque en dos bandas.
  const veintes = valores.filter((v) => v === 20);
  ok(veintes.length === 8, 'ocho conexiones empatan a 20 pasos', String(veintes.length));
  ok(veintes.every((v) => b.bandaDe(v).color === b.bandaDe(20).color),
    'y todas caen en la MISMA banda: un empate no se reparte');
  ok(b.bandaDe(20).color !== 'red',
    'y no se cuelan en el rojo, que es de los caminos realmente mas usados',
    b.bandaDe(20).color);

  // Un valor del borde: 46 esta dentro del rango de la banda naranja (38-46), asi que le
  // toca naranja y no rojo. Comprueba que la posicion se calcula desde la PRIMERA
  // posicion del bloque de empatados y no desde la ultima.
  ok(b.bandaDe(46).color === 'orange', 'un valor del borde de una banda cae en ELLA', b.bandaDe(46).color);

  // El naranja existe en la paleta: sin el, la banda intermedia saldria sin color.
  ok(BANDAS_RANKING.some((x) => x.color === 'orange'),
    'la paleta incluye un color intermedio entre el amarillo y el rojo');

  // Sin masa no hay bandas: una corrida sin trafico no puede inventar colores.
  const vacio = bandasDeValores([]);
  ok(vacio.bandas.length === 0 && vacio.n === 0, 'sin valores no hay bandas');
  ok(vacio.bandaDe(5) === null, 'y la banda de cualquier valor es null');
  ok(bandasDeValores(null).bandas.length === 0, 'y con null no revienta');

  // Un unico valor: una sola banda, y el mapa no puede salir multicolor.
  const solo = bandasDeValores([ 7, 7, 7 ]);
  ok(solo.bandas.length === 1, 'con todos los valores iguales hay UNA sola banda',
    String(solo.bandas.length));
  ok(solo.bandaDe(7).color === 'red',
    'y el mapa sale de un color, con el valor unico en el extremo', solo.bandaDe(7).color);
}

console.log('\n== 16. La barra de la leyenda es un ESCALON, no una rampa ==');
{
  const b = bandasDeValores([ 100, 80, 60, 40, 20, 10, 5, 3, 2, 1 ]);
  const css = gradienteBandas(b.bandas);

  ok(css.startsWith('linear-gradient'), 'la leyenda lleva un degradado de CSS', css.slice(0, 40));
  // CADA COLOR APARECE DOS VECES: una al abrir su franja y otra al cerrarla. Eso es lo
  // que hace el ESCALON. Con una sola aparicion el CSS interpolaria y volveriamos a tener
  // la rampa que el usuario no podia leer.
  const rojos = (css.match(/red/g) || []).length;
  ok(rojos >= 2, 'y cada color se repite para cortar en escalon (nada de rampa)', String(rojos));
  ok(css.indexOf('red') < css.indexOf('orange'),
    'los colores van de calido a frio, en el orden de las bandas');

  // La barra NO puede estar vacia aunque haya una sola banda.
  const una = gradienteBandas([ { color: 'red', min: 5, max: 5, cuantos: 3, etiqueta: 'x' } ]);
  ok(una === 'red', 'con una sola banda la barra es ese color, no un degradado roto', una);
  ok(gradienteBandas([]) === 'blue', 'y sin bandas cae al extremo frio');
  ok(gradienteBandas(null) === 'blue', 'y con null tambien');
}

console.log('\n== 17. El TOP de caminos responde «por donde pasan mas tokens» ==');
{
  // Es la parte que contesta la pregunta del usuario sin depender de interpretar un color.
  const pares = [
    { etiqueta: 'a → b', valor: 111, color: 'red' },
    { etiqueta: 'c → d', valor: 91, color: 'red' },
    { etiqueta: 'e → f', valor: 60, color: 'red' },
    { etiqueta: 'g → h', valor: 5, color: 'blue' },
    { etiqueta: 'i → j', valor: 3, color: 'blue' }
  ];
  const top = topCaminos(pares, 3);
  ok(top.length === 3, 'devuelve como mucho los que se le piden', String(top.length));
  ok(top[0].valor === 111 && top[1].valor === 91 && top[2].valor === 60,
    'y van de MAYOR a menor, que es lo que hace util la lista',
    top.map((c) => c.valor).join(' > '));

  // Los caminos SIN trafico no entran: una lista de «los mas usados» con un cero dentro no
  // informa de nada, y el cero ya tiene su propio aviso en la leyenda.
  const conCeros = topCaminos([ { etiqueta: 'x', valor: 0 }, { etiqueta: 'y', valor: 4 } ], 5);
  ok(conCeros.length === 1 && conCeros[0].valor === 4,
    'los caminos sin trafico quedan fuera de la lista', JSON.stringify(conCeros));

  // El orden es ESTABLE con valores repetidos: dos caminos iguales no deben intercambiarse
  // entre repintados, o el numero de la leyenda bailaria sin que cambie nada.
  const repetidos = [
    { etiqueta: 'primero', valor: 10 }, { etiqueta: 'segundo', valor: 10 }, { etiqueta: 'tercero', valor: 10 }
  ];
  const t1 = topCaminos(repetidos, 3).map((c) => c.etiqueta).join(',');
  const t2 = topCaminos(repetidos, 3).map((c) => c.etiqueta).join(',');
  ok(t1 === t2, 'con valores iguales el orden no baila entre repintados', t1);

  ok(topCaminos(null).length === 0, 'y sin pares no revienta');
  ok(topCaminos([], 5).length === 0, 'ni con una lista vacia');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
