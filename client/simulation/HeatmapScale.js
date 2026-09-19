/**
 * La escala de color del mapa de calor, en un solo sitio.
 *
 * Por qué existe: la regla de color estaba partida entre `simpleheat-svg.js`
 * (que normaliza `valor / max`) y el controlador (que calcula ese `max`). Así no
 * se puede comprobar sin un navegador, porque `draw()` necesita el DOM y un
 * canvas. Al extraer la decisión —qué opacidad recibe cada mancha y qué texto
 * lleva la leyenda— a funciones puras, el arnés `13-mapa-de-calor.mjs` ejecuta
 * las MISMAS que usa el plugin, no una copia.
 *
 * El problema que resuelve: la escala es RELATIVA al máximo de la corrida, y el
 * máximo cae siempre en la última parada (rojo). Cuando todas las tareas tienen
 * el mismo valor —el caso de «cantidad de recursos»: todas con 1— cada mancha
 * recibe `valor / max = 1` y el mapa sale ENTERO ROJO, como si todo fuese
 * crítico, cuando en realidad solo significa «no hay diferencias».
 *
 * Ojo: esto NO cambia el color de cada valor. Un mismo dato sigue pintándose
 * distinto según el resto del diagrama (1 recurso es azul si otra tarea pide 5,
 * y rojo si el máximo es 1). Eso es inherente a una escala relativa; por eso el
 * mapa lleva leyenda con el rango real.
 */
import { formatCurrency, formatMinutes, formatMilliseconds } from './util';

// Opacidad mínima de una mancha: por debajo de esto un valor 0 se vuelve
// invisible y el diagrama parece «sin analizar».
export const OPACIDAD_MINIMA = 0.10;

// Opacidad cuando NO hay contraste (min === max), es decir cuando el mapa debe
// ser uniforme.
//
// NO se usa el extremo caliente: con un valor único, `valor / max = 1` en todas
// y el mapa saldría entero rojo. Se usa el extremo FRÍO (azul), que es lo que de
// verdad significa «sin diferencias». `OPACIDAD_MINIMA` (0.10) se ve demasiado
// poco; 0.35 cae holgadamente dentro de la banda azul (la escala es azul hasta
// 0.4) y se lee sin llegar a teñir el diagrama.
export const OPACIDAD_UNIFORME = 0.35;

// Paradas del degradado. Vive aquí, y no en `simpleheat-svg.js`, para que la
// leyenda (CSS) y el filtro SVG no puedan divergir: `simpleheat-svg.js` las
// conserva solo como valor por defecto de la librería suelta y el controlador le
// pasa estas con `.gradient()`.
export const GRADIENTE_ESCALA = {
  0.4: 'blue',
  0.6: 'cyan',
  0.7: 'lime',
  0.8: 'yellow',
  1.0: 'red'
};

/**
 * Opacidad (0..1) de una mancha.
 *
 * `uniforme` fuerza el extremo frío (ver OPACIDAD_UNIFORME). En el caso normal
 * es `valor / max` acotado, exactamente el comportamiento de siempre.
 */
export function opacidadDe(valor, max, uniforme = false, minOpacidad = OPACIDAD_MINIMA) {
  if (uniforme) return Math.min(Math.max(OPACIDAD_UNIFORME, minOpacidad), 1);
  return Math.min(Math.max(valor / (max || 1), minOpacidad), 1);
}

/**
 * Fraccion (0..1) que le toca a un valor DENTRO de la escala, repartiendo entre el MINIMO
 * y el MAXIMO de la corrida. Devuelve null cuando no hay contraste que repartir.
 *
 * POR QUE EXISTE, y es el arreglo del reporte «casi todo en azul y un punto rojo»: con
 * `valor / max` el minimo de una corrida real cae muy por debajo de 0,4, que es donde la
 * escala deja de ser plana, asi que CASI TODO aterriza en la banda azul y solo el valor mas
 * alto llega al rojo. Se ve con un caso de verdad: en un bucle, la compuerta se ejecuta 9
 * veces mas que una tarea y deja al minimo en `100/900 = 0,11`.
 *
 * Repartiendo entre `min` y `max`, el valor mas bajo recibe el extremo FRIO y el mas alto el
 * CALIDO. Es lo correcto para un mapa RELATIVO: su pregunta no es «cuanto vale» sino «donde
 * hay mas que en el resto», y para eso tiene que usar TODO su rango de color.
 */
export function fraccionDe(valor, min, max) {
  const v = Number(valor) || 0;
  const lo = Number(min) || 0;
  const hi = Number(max) || 0;
  if (!(hi > lo)) return null;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

/**
 * Rango de los valores dibujados, con la marca de «todos iguales».
 *
 * Se calcula el rango en vez de ir tomando el máximo a medida que se dibuja
 * porque la decisión de uniformidad necesita el MÍNIMO: sin él no se puede
 * distinguir «todos 1» (uniforme) de «uno 1 y otro 5» (con contraste).
 */
export function rangoDeValores(valores) {
  if (!valores || !valores.length) return { min: 0, max: 0, uniforme: true, n: 0 };

  let min = Infinity;
  let max = -Infinity;
  for (const v of valores) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  return { min, max, uniforme: min === max, n: valores.length };
}

/** Paradas del degradado ordenadas de frío a cálido. */
function paradasOrdenadas(gradiente) {
  return Object.keys(gradiente).map(Number).sort((a, b) => a - b);
}

/** Color del extremo frío del degradado (el que usa el caso uniforme). */
export function colorFrio(gradiente = GRADIENTE_ESCALA) {
  return gradiente[paradasOrdenadas(gradiente)[0]];
}

/**
 * Color del extremo cálido del degradado: donde cae SIEMPRE el máximo de la
 * corrida. Es el que hace que un mapa sin diferencias salga entero rojo.
 */
export function colorCalido(gradiente = GRADIENTE_ESCALA) {
  const paradas = paradasOrdenadas(gradiente);
  return gradiente[paradas[paradas.length - 1]];
}

/**
 * CSS del degradado de la leyenda, derivado de GRADIENTE_ESCALA.
 *
 * La primera parada se repite en 0% porque la escala deja el extremo frío plano
 * hasta 0.4 (todo azul): la barra debe verse igual que el mapa, no estirada.
 */
export function gradienteCss(gradiente = GRADIENTE_ESCALA) {
  const partes = [ `${colorFrio(gradiente)} 0%` ];
  for (const t of paradasOrdenadas(gradiente)) partes.push(`${gradiente[t]} ${Math.round(t * 100)}%`);
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

/**
 * BANDAS DE COLOR POR RANKING, estilo Google Maps.
 *
 * EL PROBLEMA QUE RESUELVE, con datos reales: en una corrida de 49 conexiones con rango
 * 5-154, el tramo muerto de la escala (todo lo que cae por debajo de 0.4 recibe el MISMO
 * azul) alcanzaba hasta el valor 64,6. De las 49 conexiones, 47 quedaban por debajo: el
 * 96 % del diagrama salia del mismo color. El mapa no estaba roto, estaba mal calibrado:
 * el canal del color decia «azul» o «azul».
 *
 * POR QUE BANDAS Y NO UN DEGRADADO CONTINUO: un trazo de 4 px no puede comunicar un
 * matiz. «¿Este azul es 0,21 o 0,28?» no lo responde nadie mirando una linea fina. En
 * cambio «¿este tramo es rojo o naranja?» se responde de un vistazo, y para eso hacen
 * falta COLORES SEPARADOS, no una rampa. Es lo que hace Google Maps con el trafico.
 *
 * POR QUE POR POSICION Y NO POR VALOR: la pregunta de esta vista es «cuales son los
 * caminos mas usados», que es una pregunta de ORDEN, no de cantidad. Repartiendo por
 * posiciones, el 10 % mas usado SIEMPRE sale rojo, aunque la distribucion tenga una cola
 * larga donde el valor exacto aplastaria a todos hacia el frio. Se pierde distinguir 154
 * de 111 -para eso estan los numeros de la leyenda-, y se gana ver quien encabeza.
 *
 * LAS BANDAS SON POR TANTO RELATIVAS A LA CORRIDA, igual que la escala que sustituyen.
 * Un mismo camino puede salir rojo en un diagrama y azul en otro. No es un defecto: es
 * lo que significa «el mas usado DE ESTE diagrama», y por eso la leyenda lleva el rango
 * real y los numeros.
 */
export const BANDAS_RANKING = [
  { hasta: 0.10, color: 'red', etiqueta: 'El 10 % más usado' },
  { hasta: 0.30, color: 'orange', etiqueta: 'Siguiente 20 %' },
  { hasta: 0.60, color: 'yellow', etiqueta: 'Mitad alta' },
  { hasta: 1.00, color: 'blue', etiqueta: 'Resto' }
];

/**
 * Reparto de un conjunto de valores en bandas por POSICION.
 *
 * Devuelve una funcion que da la banda de un valor, mas la lista de bandas con su
 * RANGO REAL de valores y cuantos elementos cayeron en cada una. La leyenda necesita
 * esos rangos para poder decir «rojo: de 112 a 154 pasos», que es lo que convierte el
 * color en una medicion y no en un adorno.
 *
 * LOS EMPATES CAEN EN LA MISMA BANDA, y esto es una decision, no un descuido: si dos
 * caminos tienen exactamente los mismos pasos, pintarlos de distinto color afirmaria una
 * diferencia que no existe. Se usa el mismo criterio que `uniforme`: ante la duda, decir
 * «son iguales» en vez de inventar un orden.
 *
 * `valores` son los de la MAGNITUD que se este repartiendo. Para las lineas se le pasan
 * SOLO los de las lineas: comparar una linea contra una tarea seria comparar dos cosas
 * que no son la misma, y mientras las tareas tengan numeros mas altos las lineas no
 * llegarian nunca al rojo.
 */
export function bandasDeValores(valores) {
  const limpios = (valores || [])
    .map((v) => Number(v) || 0)
    .filter((v) => v > 0)
    .sort((a, b) => b - a);   // de mayor a menor: la posicion manda

  if (!limpios.length) return { bandaDe: () => null, bandas: [], max: 0, min: 0, n: 0 };

  const n = limpios.length;
  const max = limpios[0];
  const min = limpios[n - 1];

  // SIN CONTRASTE NO HAY BANDAS QUE REPARTIR: si todos los valores son iguales, el mapa
  // sale de UN color y no de cuatro. Sin este corte, tres conexiones iguales caian en tres
  // bandas distintas -una por franja de porcentaje- y el diagrama afirmaba diferencias que
  // no existen. Es el mismo criterio que el resto de la escala: ante la duda, decir «son
  // iguales».
  if (max === min) {
    const unica = {
      color: BANDAS_RANKING[0].color,
      etiqueta: BANDAS_RANKING[0].etiqueta,
      min: max,
      max,
      cuantos: n,
      uniforme: true
    };
    return {
      bandaDe: (valor) => (Number(valor) === max ? unica : null),
      bandas: [ unica ],
      max,
      min,
      n
    };
  }

  // Cuantos elementos entran en cada banda. Se calcula por POSICION en la lista
  // ordenada, con `Math.ceil` para que la primera banda nunca quede vacia cuando hay
  // pocos elementos (con 3 conexiones y suelo, un 10 % redondeado a la baja daria 0).
  const bandas = [];
  let desde = 0;
  BANDAS_RANKING.forEach((definicion, indice) => {
    let cuantos = Math.ceil(definicion.hasta * n) - desde;
    if (indice === BANDAS_RANKING.length - 1) cuantos = n - desde;   // el resto, exacto
    const hasta = Math.max(desde, Math.min(n, desde + cuantos));
    if (hasta > desde) {
      bandas.push({
        color: definicion.color,
        etiqueta: definicion.etiqueta,
        min: limpios[hasta - 1],   // el MENOR de la banda
        max: limpios[desde],       // el MAYOR de la banda
        cuantos: hasta - desde
      });
    }
    desde = hasta;
  });

  // LA BANDA DE UN VALOR SE BUSCA POR SU POSICION, y con los empates se usa la PRIMERA
  // posicion del bloque, no la ultima.
  //
  // Es la diferencia entre un reparto que se entiende y uno que no, y se vio con datos
  // reales: ocho conexiones empatadas a 20 pasos caian en la banda ROJA porque el bloque
  // entero se contaba al final, y 20 no es «el camino mas usado» de nada. Con la primera
  // posicion, el bloque recibe la banda de su mejor puesto: ocho caminos iguales comparten
  // el color que les corresponde por estar donde estan, sin colarse en el grupo de arriba.
  //
  // La alternativa -repartir el bloque entre dos bandas- mentiria: afirmaria una
  // diferencia entre dos caminos que tienen exactamente los mismos pasos.
  const bandaDe = (valor) => {
    const v = Number(valor) || 0;
    if (!(v > 0)) return null;
    const mayores = limpios.filter((otro) => otro > v).length;
    const posicion = mayores + 1;
    let desde = 0;
    for (const banda of bandas) {
      if (posicion <= desde + banda.cuantos) return banda;
      desde += banda.cuantos;
    }
    return bandas[bandas.length - 1] || null;
  };

  return { bandaDe, bandas, max, min, n };
}

/** CSS del degradado DISCRETO de la leyenda, a partir de las bandas reales. */
export function gradienteBandas(bandas) {
  if (!bandas || !bandas.length) return 'blue';
  if (bandas.length === 1) return bandas[0].color;

  // Cada banda ocupa una franja PROPORCIONAL a cuantos elementos tiene: asi la barra
  // dice de un vistazo donde se apelotona el diagrama, que es informacion util por si
  // sola (una barra casi entera azul significa «casi todo el trabajo va por pocos
  // caminos», y eso es una lectura sobre el proceso, no sobre el dibujo).
  const total = bandas.reduce((a, b) => a + b.cuantos, 0) || 1;
  const partes = [];
  let acumulado = 0;
  bandas.forEach((banda, indice) => {
    const desde = Math.round((acumulado / total) * 100);
    acumulado += banda.cuantos;
    const hasta = Math.round((acumulado / total) * 100);
    // Se repite el color en el borde para que la transicion sea un ESCALON y no un
    // degradado: el color tiene que leerse como una categoria, no como una rampa.
    if (indice === 0) partes.push(`${banda.color} ${desde}%`);
    partes.push(`${banda.color} ${hasta}%`);
  });
  return `linear-gradient(to right, ${partes.join(', ')})`;
}

/**
 * Los caminos mas usados, para la lista de la leyenda.
 *
 * POR QUE UN TOPE Y NO TODOS: en un diagrama de 49 conexiones, imprimir los 49 numeros
 * tapa el propio dibujo y no se lee. Cinco es lo que cabe sin scroll y lo que responde
 * la pregunta util: «cuales son los caminos principales».
 *
 * `etiquetaDe` existe para no meter bpmn-js en un modulo puro: quien llama sabe poner el
 * nombre del origen y el destino, y aqui solo se ordena y se corta.
 */
export function topCaminos(pares, cuantos = 5, etiquetaDe = null) {
  return (pares || [])
    .filter((p) => p && Number(p.valor) > 0)
    .sort((a, b) => (Number(b.valor) || 0) - (Number(a.valor) || 0))
    .slice(0, cuantos)
    .map((p) => ({
      valor: Number(p.valor) || 0,
      etiqueta: etiquetaDe ? etiquetaDe(p) : p.etiqueta,
      color: p.color || null
    }));
}


/**
 * Los nombres de color del degradado, en RGB, para poder INTERPOLAR.
 *
 * Hace falta porque el mapa de calor tiene dos formas de pintar y una sola escala:
 * las manchas (circulos) se colorean con el filtro SVG, que recorre la tabla del
 * degradado, pero las CONEXIONES son trazos y necesitan un color concreto. Se
 * interpola sobre las mismas paradas, asi que un trazo y una mancha con el mismo
 * valor reciben el mismo color.
 *
 * Si un color no esta en la tabla (alguien cambia la paleta por un hex), se
 * devuelve la parada TAL CUAL en vez de interpolar: un color raro es mejor que un
 * negro por accidente.
 */
const RGB = {
  blue: [ 0, 0, 255 ], cyan: [ 0, 255, 255 ], lime: [ 0, 255, 0 ],
  yellow: [ 255, 255, 0 ], red: [ 255, 0, 0 ], orange: [ 255, 165, 0 ],
  white: [ 255, 255, 255 ], black: [ 0, 0, 0 ]
};

const rgbDe = (color) => {
  const nombre = String(color).trim().toLowerCase();
  if (RGB[nombre]) return RGB[nombre];
  const hex = /^#([0-9a-f]{6})$/.exec(nombre);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [ (n >> 16) & 255, (n >> 8) & 255, n & 255 ];
  }
  return null;
};

/**
 * Color de un valor, en la MISMA escala que las manchas.
 *
 * `fraccion` es la posicion en la escala (0..1), no el valor: quien llama ya
 * conoce el rango de la corrida. Por debajo de la primera parada la escala es
 * plana (todo frio), que es lo que hace que un mapa sin diferencias no salga rojo.
 */
export function colorDeValor(fraccion, gradiente = GRADIENTE_ESCALA) {
  const paradas = paradasOrdenadas(gradiente);
  if (!paradas.length) return 'blue';

  const f = Math.min(1, Math.max(0, Number(fraccion) || 0));
  if (f <= paradas[0]) return gradiente[paradas[0]];

  for (let i = 0; i < paradas.length - 1; i++) {
    const a = paradas[i];
    const b = paradas[i + 1];
    if (f <= b) {
      const desde = gradiente[a];
      const hasta = gradiente[b];
      const t = (f - a) / (b - a);
      const ca = rgbDe(desde);
      const cb = rgbDe(hasta);
      if (!ca || !cb) return hasta;
      const mezcla = ca.map((v, j) => Math.round(v + (cb[j] - v) * t));
      return `rgb(${mezcla[0]}, ${mezcla[1]}, ${mezcla[2]})`;
    }
  }

  return gradiente[paradas[paradas.length - 1]];
}

// Etiqueta y formato de cada métrica del mapa de calor.
//
// Cubre TODAS las que ofrece la paleta. El arnés comprueba que no falte ninguna:
// una métrica sin escala dejaría la leyenda sin unidad, que es justo el fallo que
// se está corrigiendo.
export const ESCALA_POR_METRICA = {
  cost: { etiqueta: 'Costo acumulado', formatea: (v) => formatCurrency(v) },
  waitTime: { etiqueta: 'Espera promedio', formatea: (v) => formatMinutes(v) },
  totalWaitTime: { etiqueta: 'Espera total', formatea: (v) => formatMinutes(v) },
  cycleTime: { etiqueta: 'Tiempo de ciclo', formatea: (v) => formatMinutes(v) },
  processTime: { etiqueta: 'Tiempo de proceso', formatea: (v) => formatMinutes(v) },
  frequency: { etiqueta: 'Frecuencia', formatea: (v) => `${Math.round(v)} veces` },
  // El motor guarda un COCIENTE (fallos / ejecuciones), así que se muestra en %.
  failureRate: { etiqueta: 'Tasa de fallos', formatea: (v) => `${(v * 100).toFixed(1)}%` },
  reworkTime: { etiqueta: 'Tiempo de reparación', formatea: (v) => formatMilliseconds(v) },
  overtime: { etiqueta: 'Horas extras', formatea: (v) => formatMilliseconds(v) },
  waitTimeCost: { etiqueta: 'Costo de tiempos muertos', formatea: (v) => formatCurrency(v) },
  resourceQuantity: { etiqueta: 'Cantidad de recursos', formatea: (v) => String(Math.round(v)) },
  // TRAFICO: cuantas veces se recorrio cada conexion (y cada figura) en la corrida.
  // Existe porque el mapa por tareas no puede contestar «por donde pasa el trabajo»:
  // una linea no tiene tiempo ni costo, solo paso. El motor ya lo cuenta para cada
  // flujo al elegir la salida (`findNextElements`), asi que la vista de estructura no
  // necesita tocar el motor.
  trafico: { etiqueta: 'Tráfico (pasos por la conexión)', formatea: (v) => `${Math.round(v)} pasos` },
  // ZONAS: la unica metrica que no se mide POR ELEMENTO. Lo que se pinta es una rejilla
  // y el numero de cada celda son minutos de trabajo que pasaron por ese trozo, asi que
  // su formato es de tiempo. Va aqui y no en el modulo de zonas para que el guardian de
  // la escala siga cubriendo TODAS las metricas de la paleta: una sin formato dejaria la
  // leyenda sin unidad, que es justo lo que convierte el mapa en una medicion.
  zonas: { etiqueta: 'Trabajo por zona', formatea: (v) => formatMinutes(v / 60000) },
  // TRÁFICO POR ZONA: los mismos pasos que `trafico`, pero repartidos en la rejilla en
  // vez de sobre cada conexion. Se separa de `zonas` porque una mide TIEMPO y otra PASOS,
  // y confundirlas seria el error mas facil de cometer al leer el mapa.
  zonasTrafico: { etiqueta: 'Tráfico por zona', formatea: (v) => `${Math.round(v)} pasos` }
};

/** Escala de una métrica. Cae a una genérica si algún día se añade una nueva. */
export function escalaDeMetrica(metric) {
  return ESCALA_POR_METRICA[metric] || { etiqueta: metric || 'Métrica', formatea: (v) => String(v) };
}

/**
 * Texto de la leyenda para un rango.
 *
 * En el caso uniforme no hay rango que enseñar: se dice el valor único, que es
 * la información útil («todos 1»), en vez de un «1 → 1» que no explica nada.
 */
export function textoDeEscala(metric, rango) {
  const escala = escalaDeMetrica(metric);

  if (rango.uniforme) {
    return {
      titulo: escala.etiqueta,
      uniforme: true,
      detalle: `Uniforme: todos ${escala.formatea(rango.min)}`,
      nota: 'Sin diferencias entre tareas: se pinta en frío, no en rojo.'
    };
  }

  return {
    titulo: escala.etiqueta,
    uniforme: false,
    detalle: `${escala.formatea(rango.min)} → ${escala.formatea(rango.max)}`,
    nota: 'Azul = menor · Rojo = mayor'
  };
}
