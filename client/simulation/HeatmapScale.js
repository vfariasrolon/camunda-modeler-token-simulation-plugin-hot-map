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
