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
  resourceQuantity: { etiqueta: 'Cantidad de recursos', formatea: (v) => String(Math.round(v)) }
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
