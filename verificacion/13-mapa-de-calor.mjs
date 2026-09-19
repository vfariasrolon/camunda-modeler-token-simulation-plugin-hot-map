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
  bandasDeCuota, bandasDeValores, gradienteBandas, topCaminos, BANDAS_CUOTA, BANDAS_RANKING,
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

console.log('\n== 15. BANDAS DE CUOTA: umbrales fijos, no puestos ==');
{
  // EL CASO REAL QUE MOTIVO EL CAMBIO. Estas son las CUOTAS del diagrama del usuario: cinco
  // conexiones secuenciales al 100 % y una compuerta 80/20.
  //
  // Con las bandas por PUESTO que habia antes, los cinco 100 % se llevaban las bandas de arriba y
  // las DOS ramas caian en azul: el mapa decia que da igual irse por el 80 % que por el 20 %, que
  // es lo contrario de lo que la vista tiene que ensenar. Se vio al ejecutar la vista, no al
  // leer el codigo.
  const cuotas = [ 1, 1, 0.8, 0.2, 1, 1, 1 ];
  const b = bandasDeCuota(cuotas);

  ok(b.n === 7, 'las 7 conexiones entran en el reparto', String(b.n));
  ok(b.bandaDe(1) === b.bandaDe(1), 'la banda de una cuota es estable');

  // LA PROPIEDAD QUE ARREGLA EL DEFECTO: el 80 % y el 20 % NO pueden salir del mismo color.
  ok(b.bandaDe(0.8).color !== b.bandaDe(0.2).color,
    'el 80 % y el 20 % salen de colores DISTINTOS (el defecto que se corrigio)',
    `${b.bandaDe(0.8).color} vs ${b.bandaDe(0.2).color}`);
  ok(b.bandaDe(0.8).color === 'orange', 'el 80 % es «la mayoria», en naranja',
    b.bandaDe(0.8).color);
  ok(b.bandaDe(0.2).color === 'blue', 'y el 20 % es «minoria», en azul', b.bandaDe(0.2).color);
  ok(b.bandaDe(1).color === 'red', 'el 100 % es «casi todo», en rojo', b.bandaDe(1).color);

  // LOS CORTES, uno a uno. Son la definicion de la escala y tienen que ser COMPARABLES entre
  // diagramas: el 85 % significa «la mayoria» en cualquiera.
  ok(b.bandaDe(0.9).color === 'red' && b.bandaDe(0.89).color === 'orange',
    'el corte del 90 % esta donde dice (casi todo)',
    `0.90 -> ${b.bandaDe(0.9).color}, 0.89 -> ${b.bandaDe(0.89).color}`);
  ok(b.bandaDe(0.7).color === 'orange' && b.bandaDe(0.69).color === 'yellow',
    'y el del 70 % tambien (la mayoria)');
  ok(b.bandaDe(0.4).color === 'yellow' && b.bandaDe(0.39).color === 'blue',
    'y el del 40 % (repartido)');

  // UN EMPATE sale del mismo color, y es correcto: un 50/50 no se puede pintar como una
  // diferencia sin inventarla.
  const empate = bandasDeCuota([ 0.5, 0.5 ]);
  ok(empate.bandaDe(0.5).color === empate.bandaDe(0.5).color
    && empate.bandaDe(0.5).color === 'yellow',
    'un 50/50 sale entero de «repartido»', empate.bandaDe(0.5).color);

  // LA LEYENDA solo lista las bandas CON elementos: una banda vacia describe un color que no esta
  // en el diagrama, y ensena al lector a buscar algo que no existe.
  ok(b.bandas.length === 3,
    'solo se listan las bandas que TIENEN conexiones (100 %, 80 %, 20 % -> rojo, naranja, azul)',
    b.bandas.map((x) => `${x.color}(${x.cuantos})`).join(' '));
  ok(b.bandas.every((x) => x.cuantos > 0), 'y ninguna de ellas esta vacia');
  ok(b.bandas.every((x) => typeof x.rangoTexto === 'string' && x.rangoTexto.length),
    'cada una con su rango escrito para la leyenda',
    b.bandas.map((x) => x.rangoTexto).join(' | '));
  // El rango de la ultima es ABIERTO por abajo: «< 40 %», no «0 % – 40 %», porque el 0 no es un
  // valor de esta escala (las conexiones sin trafico van en gris aparte).
  const ultima = b.bandas[b.bandas.length - 1];
  ok(ultima.rangoTexto.startsWith('<'),
    'y el rango de la banda mas fria se escribe abierto por abajo', ultima.rangoTexto);

  // Sin cuotas no hay bandas; y la banda de un valor invalido es null, no una banda cualquiera.
  ok(bandasDeCuota([]).bandas.length === 0, 'sin cuotas no hay bandas');
  ok(bandasDeCuota(null).bandas.length === 0, 'y con null tampoco');
  // Cero se EXCLUYE del reparto: una conexion sin trafico va en gris, no en la banda mas fria.
  ok(bandasDeCuota([ 0, 0 ]).bandas.length === 0,
    'las cuotas de cero no forman banda (esas conexiones van en gris)');
  ok(bandasDeCuota([ 0.5 ]).bandaDe(NaN) === null, 'y una cuota NaN no cae en ninguna banda');

  // Los colores de la paleta son los cuatro de la escala, y sin repetir: dos bandas con el mismo
  // color serian indistinguibles en el diagrama.
  const colores = BANDAS_CUOTA.map((x) => x.color);
  ok(new Set(colores).size === 4, 'los cuatro colores son distintos', colores.join(' / '));
  ok(colores.includes('orange'), 'y hay un color intermedio entre el amarillo y el rojo');
}

console.log('\n== 15b. BANDAS POR POSICION: para la masa de las zonas ==');
{
  // LA MASA DE LAS ZONAS NO TIENE ESCALA NATURAL: 900 minutos es mucho en un diagrama y poco en
  // otro. Ahi lo correcto es repartir por PUESTOS -el 10 % de celdas mas cargadas es rojo,
  // siempre-, que es lo que arregla el reporte «trafico todo se ve azul»: antes se pintaba con
  // `valor / max` y la escala es azul plano hasta 0,4, asi que casi todo caia en el mismo azul.
  const valores = [ 500, 480, 200, 180, 40, 20, 5, 3, 2, 1 ];
  const b = bandasDeValores(valores);

  ok(b.n === 10, 'las 10 celdas entran en el reparto', String(b.n));
  ok(b.max === 500 && b.min === 1, 'con su maximo y su minimo', `${b.min}..${b.max}`);
  ok(b.bandaDe(500).color === 'red', 'la celda mas cargada sale ROJA', b.bandaDe(500).color);
  ok(b.bandaDe(1).color === 'blue', 'y la mas floja sale azul', b.bandaDe(1).color);

  // LA PROPIEDAD QUE ARREGLA EL «TODO AZUL»: el color se reparte por TODA la escala, no se apila
  // en el extremo frio. Es lo que la regla vieja no hacia.
  const colores = new Set(valores.map((v) => b.bandaDe(v).color));
  ok(colores.size === 4, 'el mapa usa las CUATRO bandas', [ ...colores ].join(', '));

  // LA EQUIVALENCIA QUE PERMITE QUE ESTO SEA RAPIDO: `bandaDe` se resuelve por umbrales -la
  // primera banda cuyo minimo no pase del valor- en vez de contar posiciones, porque con 12000
  // celdas contar seria cuadratico y la app se colgaria. Tiene que dar EXACTAMENTE lo mismo que
  // contar, que es lo que se comprueba aqui valor a valor.
  const porPosicion = (v) => {
    const ordenados = valores.slice().sort((a, c) => c - a);
    const mayores = ordenados.filter((otro) => otro > v).length;
    const posicion = mayores + 1;
    let desde = 0;
    for (const banda of b.bandas) {
      if (posicion <= desde + banda.cuantos) return banda;
      desde += banda.cuantos;
    }
    return null;
  };
  ok(valores.every((v) => b.bandaDe(v).color === porPosicion(v).color),
    'y la version rapida da el MISMO resultado que contar posiciones, valor a valor',
    valores.map((v) => `${v}:${b.bandaDe(v).color}`).join(' '));

  // LOS EMPATES COMPARTEN BANDA, y con umbrales esto es inmediato: dos valores iguales caen en la
  // misma banda por definicion. Se comprueba porque la version por posiciones podia partirlos.
  const empatados = bandasDeValores([ 9, 9, 9, 5, 4, 4, 3, 3, 2, 1 ]);
  ok(empatados.bandaDe(9).color === 'red',
    'un empate en la cabeza sigue en la banda de arriba, sin colarse ni caerse',
    empatados.bandaDe(9).color);
  ok([ 9, 9, 9 ].every((v) => empatados.bandaDe(v).color === empatados.bandaDe(9).color),
    'y los empatados comparten color: un empate no se pinta como una diferencia');

  // Sin contraste, UNA banda: si todos los valores son iguales, el mapa sale de un color y no de
  // cuatro, que es el mismo criterio que el resto de la escala.
  const plano = bandasDeValores([ 7, 7, 7 ]);
  ok(plano.bandas.length === 1, 'con todos los valores iguales hay UNA sola banda',
    String(plano.bandas.length));
  ok(plano.bandaDe(7).color === 'red', 'y el valor unico queda en el extremo');

  // Sin masa no hay bandas.
  ok(bandasDeValores([]).bandas.length === 0, 'sin valores no hay bandas');
  ok(bandasDeValores(null).bandas.length === 0, 'y con null no revienta');
  ok(bandasDeValores([]).bandaDe(5) === null, 'y la banda de cualquier valor es null');
  ok(bandasDeValores([ 5 ]).bandaDe(NaN) === null, 'una valor NaN no cae en ninguna banda');
  ok(BANDAS_RANKING.some((x) => x.color === 'orange'),
    'la paleta por puesto incluye un color intermedio entre el amarillo y el rojo');
}

console.log('\n== 16. La barra de la leyenda es un ESCALON, no una rampa ==');
{
  // Cuatro cuotas, una por banda: asi la barra tiene los cuatro escalones y se puede contar
  // que cada color aparece DOS veces (una al abrir su franja y otra al cerrarla).
  const b = bandasDeCuota([ 1, 0.85, 0.5, 0.2 ]);
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
