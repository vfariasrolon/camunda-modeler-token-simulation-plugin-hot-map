/**
 * Reglas laborales: turno, límites y primas, VERSIONADAS POR FECHA.
 *
 * Por qué una tabla y no una casilla: la ley cambia, y una casilla reescribe el
 * pasado. Si el límite semanal de horas extra se guarda como un número suelto y
 * mañana el legislador lo baja de 9 a 8, todos los informes ya emitidos pasan a
 * estar mal (se recalcularían con la ley nueva) y dejan de ser auditables. Con
 * una fila por vigencia, cada corrida guarda QUÉ versión usó y un informe de hoy
 * sigue cuadrando dentro de tres años.
 *
 * Alcance, explícito: esto es una tabla de TASAS Y UMBRALES para costear el
 * proceso, no una nómina. No se calculan IMSS, ISR, aguinaldo, prima vacacional
 * ni finiquitos.
 */

// LFT art. 61: la jornada diurna es de 8 h, la nocturna de 7 y la mixta de 7,5.
// Es la LÍNEA BASE de la extra: lo que pase de aquí en el día ya es tiempo extra,
// aunque el horario declarado sea más largo.
export const TURNOS = [ 'diurna', 'nocturna', 'mixta' ];

export const HORAS_BASE_POR_TURNO = { diurna: 8, nocturna: 7, mixta: 7.5 };

// LFT art. 65: la jornada puede prolongarse hasta 3 h al día y como máximo 3
// veces por semana. Es un TOPE DE LEGALIDAD: no cambia lo que se paga (eso lo
// fijan los arts. 66 y 68), cambia lo que se puede decir de la corrida.
export const LIMITE_DIARIO_HORAS = 3;
export const MAX_DIAS_CON_EXTRA_POR_SEMANA = 3;

// LFT art. 73: prima dominical del 25 % sobre el salario de los días ordinarios.
export const PRIMA_DOMINICAL_PCT = 25;

// LFT art. 74: los días de descanso obligatorio se pagan con prima. Cuánto
// depende del contrato y de si el festivo cae en domingo, así que el default es
// 0 y quien lo sepa lo declara: inventar un número sería peor que no tenerlo.
export const PRIMA_FESTIVO_PCT = 0;

export const LABOR_DEFAULTS = () => ({
  shiftType: 'diurna',
  dailyOvertimeLimitHours: LIMITE_DIARIO_HORAS,
  maxOvertimeDaysPerWeek: MAX_DIAS_CON_EXTRA_POR_SEMANA,
  sundayPremiumPercent: PRIMA_DOMINICAL_PCT,
  holidayPremiumPercent: PRIMA_FESTIVO_PCT,
  // Una fila por vigencia: [{ desde: '2026-01-01', ...lo que cambie }]
  rules: []
});

const num = (v, alt) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : alt;
};

/** Una fecha de vigencia válida es `YYYY-MM-DD`; cualquier otra cosa se ignora. */
export const esFechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v == null ? '' : v).trim());

/**
 * Normaliza la configuración laboral. Todo es tolerante: lo que no venga se
 * queda en el valor por defecto, que ya es la ley.
 */
export const normalizeLabor = (cfg) => {
  const d = LABOR_DEFAULTS();
  const c = cfg && typeof cfg === 'object' ? cfg : {};

  const turno = TURNOS.includes(c.shiftType) ? c.shiftType : d.shiftType;

  const reglas = (Array.isArray(c.rules) ? c.rules : [])
    .filter((r) => r && esFechaValida(r.desde))
    .map((r) => {
      const limpia = { desde: String(r.desde).trim() };
      if (TURNOS.includes(r.shiftType)) limpia.shiftType = r.shiftType;
      const campos = [
        'limitHours', 'payMultiplier', 'excessPayMultiplier',
        'dailyOvertimeLimitHours', 'maxOvertimeDaysPerWeek',
        'sundayPremiumPercent', 'holidayPremiumPercent'
      ];
      campos.forEach((k) => {
        const v = Number(r[k]);
        if (Number.isFinite(v)) limpia[k] = v;
      });
      return limpia;
    })
    // Orden ascendente por vigencia: la resolución aplica de mayor a menor, así
    // que el orden de las filas en el CSV no puede cambiar el resultado.
    .sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));

  return {
    shiftType: turno,
    dailyOvertimeLimitHours: num(c.dailyOvertimeLimitHours, d.dailyOvertimeLimitHours),
    maxOvertimeDaysPerWeek: num(c.maxOvertimeDaysPerWeek, d.maxOvertimeDaysPerWeek),
    sundayPremiumPercent: num(c.sundayPremiumPercent, d.sundayPremiumPercent),
    holidayPremiumPercent: num(c.holidayPremiumPercent, d.holidayPremiumPercent),
    rules: reglas
  };
};

/**
 * Reglas que rigen en una fecha concreta.
 *
 * Se parte de los valores de siempre (`overtime.limitHours`, `payMultiplier`,
 * `excessPayMultiplier`), que son los que ya usaban los diagramas existentes, y
 * encima se aplican las filas con `desde <= fecha` en orden ascendente: la
 * última que rija manda. Sin filas, el resultado es exactamente el de antes.
 *
 * @param {Object} laborCfg   configuración `labor` (o nada)
 * @param {Object} overtimeCfg configuración `overtime` del diagrama
 * @param {string} fechaISO   fecha de arranque de la corrida (`YYYY-MM-DD`)
 */
export const resolveLabor = (laborCfg, overtimeCfg, fechaISO) => {
  const labor = normalizeLabor(laborCfg);
  const ot = overtimeCfg && typeof overtimeCfg === 'object' ? overtimeCfg : {};

  const resuelto = {
    shiftType: labor.shiftType,
    limitHours: num(ot.limitHours, 0),
    payMultiplier: num(ot.payMultiplier, 1),
    excessPayMultiplier: num(ot.excessPayMultiplier, 1),
    dailyOvertimeLimitHours: labor.dailyOvertimeLimitHours,
    maxOvertimeDaysPerWeek: labor.maxOvertimeDaysPerWeek,
    sundayPremiumPercent: labor.sundayPremiumPercent,
    holidayPremiumPercent: labor.holidayPremiumPercent
  };

  // La versión es la vigencia que manda, para poder imprimirla y compararla. Si
  // la corrida arranca ANTES de la primera fila, manda el valor de siempre y se
  // dice así, en vez de fingir que hay una versión aplicada.
  let version = null;
  if (esFechaValida(fechaISO)) {
    labor.rules.forEach((r) => {
      if (r.desde > fechaISO) return;
      version = r.desde;
      Object.keys(r).forEach((k) => {
        if (k !== 'desde') resuelto[k] = r[k];
      });
    });
  }

  resuelto.version = version;
  resuelto.baseDailyHours = HORAS_BASE_POR_TURNO[resuelto.shiftType] || HORAS_BASE_POR_TURNO.diurna;
  resuelto.vigentes = labor.rules.filter((r) => version && r.desde <= version).length;
  return resuelto;
};

/** Redacción del juego de reglas resuelto, para el informe. */
export const describeLabor = (r) => {
  if (!r) return 'sin reglas laborales declaradas';
  const h = (v) => `${Number(v).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} h`;
  return `turno ${r.shiftType} (base ${h(r.baseDailyHours)}/día) · extra hasta ${h(r.limitHours)}/semana al `
    + `${r.payMultiplier}x y el resto al ${r.excessPayMultiplier}x · tope de ${h(r.dailyOvertimeLimitHours)}/día `
    + `y ${r.maxOvertimeDaysPerWeek} días/semana · dominical ${r.sundayPremiumPercent} %`
    + ` · festivo ${r.holidayPremiumPercent} %`
    + (r.version ? ` · vigencia desde ${r.version}` : ' · valores por defecto (sin vigencia declarada)');
};
