/**
 * Curva de arranque: cuanto tarda un tramo en volver al 100 % de rendimiento.
 *
 * El arranque lento no se puede medir en planta (es dificil), pero SI se puede
 * declarar. Y declararlo con una CURVA es mas realista que con un porcentaje
 * fijo, porque un porcentaje plano reparte la perdida por toda la jornada
 * —incluida la tarde, donde no ocurre— mientras que la curva la concentra donde
 * esta: al principio.
 *
 * Dos formas, y las dos se resuelven con formulas cerradas (nada de integracion
 * numerica dentro de un bucle):
 *
 *   exponential  e(t) = 1 - (1 - e0)·e^(-t/tau)   Por defecto
 *   linear       e(t) = e0 + (1 - e0)·(t / R)     y despues 1
 *
 * Donde `initialEfficiency` es la eficiencia al arrancar (p. ej. 0,70) y
 * `recoveryMinutes` los minutos de recuperacion. En la exponencial se toma
 * tau = R/3, de modo que a los R minutos se ha recuperado ~95 % de lo que
 * faltaba: asi «recoveryMinutes» significa lo mismo en las dos formas y el
 * configurador se puede explicar con una sola frase.
 *
 * La forma logaritmica se descarto: nunca llega al 100 %, asi que exige ponerle
 * un tope, y el tope es un segundo numero inventado.
 */

/** Formas disponibles. `none` desactiva el arranque. */
export const WARMUP_SHAPES = [ 'exponential', 'linear', 'none' ];

/** Valores por defecto, todos ajustables desde la interfaz. */
export const WARMUP_DEFAULTS = {
  shape: 'exponential',
  initialEfficiency: 0.70,
  recoveryMinutes: 30,
  // Interruptores de los disparadores. Cada TRAMO empieza con un arranque: el
  // primero del dia es el de la jornada, los siguientes son el regreso de un
  // descanso.
  onShiftStart: true,
  onBreakReturn: true
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** Normaliza la configuracion para que ningun valor absurdo rompa la matematica. */
export const normalizeWarmup = (cfg) => {
  const c = cfg || {};
  return {
    shape: WARMUP_SHAPES.includes(c.shape) ? c.shape : 'none',
    // Una eficiencia de 0 dejaria el trabajo infinito; de 1, no habria arranque.
    initialEfficiency: clamp(
      Number(c.initialEfficiency) || WARMUP_DEFAULTS.initialEfficiency, 0.05, 1
    ),
    recoveryMinutes: Math.max(1, Number(c.recoveryMinutes) || WARMUP_DEFAULTS.recoveryMinutes),
    onShiftStart: c.onShiftStart !== false,
    onBreakReturn: c.onBreakReturn !== false
  };
};

/** Minutos de recuperacion -> constante de tiempo de la exponencial. */
const tauOf = (cfg) => cfg.recoveryMinutes / 3;

/** Eficiencia en el minuto `t` desde el disparador del tramo (1 = a pleno ritmo). */
export const efficiencyAt = (t, cfg) => {
  const c = normalizeWarmup(cfg);
  if (c.shape === 'none') return 1;
  if (!(t > 0)) return c.initialEfficiency;

  if (c.shape === 'linear') {
    return t >= c.recoveryMinutes
      ? 1
      : c.initialEfficiency + (1 - c.initialEfficiency) * (t / c.recoveryMinutes);
  }

  return 1 - (1 - c.initialEfficiency) * Math.exp(-t / tauOf(c));
};

/**
 * Trabajo «perdido» acumulado en `x` minutos de reloj desde el disparador:
 *
 *   loss(x) = x - accumulatedWork(x)
 *
 * Es lo que permite resolver la duracion efectiva con una sola incognita.
 */
export const accumulatedLoss = (x, cfg) => {
  const c = normalizeWarmup(cfg);
  if (c.shape === 'none' || !(x > 0)) return 0;

  if (c.shape === 'linear') {
    const R = c.recoveryMinutes;
    if (x <= R) return (1 - c.initialEfficiency) * x * (1 - x / (2 * R));
    return (1 - c.initialEfficiency) * (R / 2);
  }

  const tau = tauOf(c);
  return (1 - c.initialEfficiency) * tau * (1 - Math.exp(-x / tau));
};

/** Perdida maxima posible de la curva (cota superior de loss). */
const maxLoss = (cfg) => {
  const c = normalizeWarmup(cfg);
  if (c.shape === 'none') return 0;
  if (c.shape === 'linear') return (1 - c.initialEfficiency) * (c.recoveryMinutes / 2);
  return (1 - c.initialEfficiency) * tauOf(c);
};

/**
 * Minutos de RELOJ necesarios para completar `workMinutes` de trabajo empezando
 * en el minuto `elapsed` del tramo.
 *
 * Se resuelve  E(elapsed + D) - E(elapsed) = work  por biseccion sobre D, que es
 * monotona (su derivada es la eficiencia, siempre > 0). En cuanto `elapsed`
 * supera la recuperacion el resultado es exactamente `work`: **la formula se
 * degrada sola a «sin arranque»** y no hace falta un caso especial.
 */
export const effectiveDuration = (workMinutes, elapsed, cfg) => {
  const c = normalizeWarmup(cfg);
  if (c.shape === 'none' || !(workMinutes > 0)) return Math.max(0, workMinutes);

  const inicio = Math.max(0, elapsed);
  const perdidaPrevia = accumulatedLoss(inicio, c);
  const perdidaMax = maxLoss(c);

  // El tramo ya esta arrancado de sobra: no hay nada que resolver.
  if (perdidaPrevia >= perdidaMax) return workMinutes;

  let bajo = workMinutes;
  let alto = workMinutes + (perdidaMax - perdidaPrevia) + 1e-9;

  for (let i = 0; i < 60; i++) {
    const medio = (bajo + alto) / 2;
    const trabajoHecho = (inicio + medio)
      - accumulatedLoss(inicio + medio, c)
      - (inicio - perdidaPrevia);
    if (trabajoHecho < workMinutes) bajo = medio;
    else alto = medio;
  }

  return (bajo + alto) / 2;
};

/**
 * Puntos para DIBUJAR la curva en el configurador.
 *
 * Existe por un motivo concreto: un parametro abstracto (una eficiencia inicial,
 * unos minutos) no se puede discutir. Una curva si. Es la forma correcta de
 * ajustar algo que no se puede medir: no pedir el numero, sino ENSENAR el efecto
 * y dejar que lo reconozca quien conoce el proceso.
 */
export const curvePoints = (cfg, minutes, steps = 40) => {
  const c = normalizeWarmup(cfg);
  const total = Math.max(1, minutes || c.recoveryMinutes * 2);

  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (total * i) / steps;
    return { t, efficiency: efficiencyAt(t, c) };
  });
};

/**
 * Resumen legible de la curva, para imprimir junto al dato.
 *
 * La penalizacion es el dato para contrastar con la planta: si arranca en 0,70,
 * las primeras tareas tardan ~43 % mas. Si eso parece exagerado, la curva esta
 * mal ajustada — y se decide mirandola, no calculandola.
 */
export const describeWarmup = (cfg) => {
  const c = normalizeWarmup(cfg);
  if (c.shape === 'none') return 'sin arranque';

  const pct = Math.round(c.initialEfficiency * 100);
  const penalizacion = Math.round((1 / c.initialEfficiency - 1) * 100);
  const disparadores = [];
  if (c.onShiftStart) disparadores.push('inicio de jornada');
  if (c.onBreakReturn) disparadores.push('regreso de descanso');

  return `${c.shape === 'exponential' ? 'exponencial' : 'lineal'}: arranca al ${pct} % `
    + `(las primeras tareas tardan ~${penalizacion} % más), recupera en ${c.recoveryMinutes} min`
    + (disparadores.length ? ` — ${disparadores.join(' y ')}` : ' — (sin disparadores activos)');
};
