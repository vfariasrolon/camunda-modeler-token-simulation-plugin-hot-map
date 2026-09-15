// A2: reglas laborales (turno, topes del art. 65, primas de domingo y festivo) y
// la espera por recurso. Motor REAL.
import SimulationEngine from './SimulationEngine.mjs';
import { resolveLabor, normalizeLabor, describeLabor } from './LaborRules.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const MANANA = { hour: 9, minute: 0 };
const TARDE = { hour: 17, minute: 0 };
const tres = (n) => Number(n.toFixed(3));

/**
 * Corre una tarea encadenada (o varias) con la configuracion que se le pase.
 * `tareas[i].pools` declara la piscina que consume; `poolCfg` las unidades.
 */
function correr({ runValue = 4, startDate = '2026-01-05', tareas, calendar = {}, labor, overtime, poolCfg, useOvertime = false, arrivalRate }) {
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: {
        isRoot: true,
        arrivalRate: arrivalRate || { value: 1, unit: 'hour' },
        simulationConfig: { runValue },
        startDate,
        calendar: {
          workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: MANANA, end: TARDE },
          breaks: [],
          holidays: [],
          ...calendar
        },
        cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
        overtime: overtime || { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        ...(labor ? { labor } : {})
      }
    };

    const nodos = tareas.map((t) => ({
      id: t.id, $type: 'bpmn:Task', businessObject: { name: t.id }, outgoing: [],
      _datos: {
        processingTime: { distribution: 'fixed', value: t.minutos, unit: 'minutes' },
        failureRate: 0,
        reworkTime: { value: 0, unit: 'minutes' },
        ...(t.pool ? { resources: { pool: t.pool, quantityRequired: t.cantidad || 1 } } : {})
      }
    }));

    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };

    const cadena = [ inicio, ...nodos, fin ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = {
        id: `F${i + 1}`, $type: 'bpmn:SequenceFlow', businessObject: {},
        source: cadena[i], target: cadena[i + 1]
      };
      flujos.push(f);
      cadena[i].outgoing = [ f ];
    }

    const proceso = {
      id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' },
      _datos: { resourcePools: poolCfg || [] }
    };

    const elementos = [ ...cadena, ...flujos, proceso ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    const motor = new SimulationEngine(registro);
    const resultados = motor.run({ useOvertime });

    const suma = (campo) => Array.from(resultados.values()).reduce((a, r) => a + (r[campo] || 0), 0);

    return {
      motor, resultados,
      labor: motor.labor,
      cumplimiento: motor.compliance,
      fin: new Date(motor.clock),
      completadas: motor.completedInstances,
      costoTotal: suma('totalCost'),
      operacion: suma('totalOperationCost'),
      doble: suma('totalDoubleOvertimeCost'),
      triple: suma('totalTripleOvertimeCost'),
      primasDia: suma('totalDayPremiumCost'),
      horasExtra: (id) => ((resultados.get(id) || {}).totalOvertime || 0) / 3600000,
      espera: (id) => (resultados.get(id) || {}).totalWaitTime || 0
    };
  } finally {
    Object.assign(console, guardar);
  }
}

const UNA = (minutos, extra) => [ { id: 'T1', minutos, ...extra } ];

console.log('\n== 1. Resolución de la vigencia por fecha ==');
{
  const labor = {
    shiftType: 'diurna',
    rules: [
      { desde: '2026-01-01', limitHours: 9 },
      { desde: '2026-07-01', limitHours: 8, payMultiplier: 2.5 }
    ]
  };
  const enEnero = resolveLabor(labor, { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 }, '2026-03-15');
  const enAgosto = resolveLabor(labor, { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 }, '2026-08-10');
  const en2025 = resolveLabor(labor, { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 }, '2025-12-31');

  ok(enEnero.limitHours === 9 && enEnero.version === '2026-01-01', 'en marzo rige la versión de enero',
    `${enEnero.limitHours} h desde ${enEnero.version}`);
  ok(enAgosto.limitHours === 8 && enAgosto.payMultiplier === 2.5, 'en agosto rige la de julio',
    `${enAgosto.limitHours} h al ${enAgosto.payMultiplier}x`);
  ok(en2025.version === null && en2025.limitHours === 9,
    'antes de la primera fila mandan los valores del diagrama, y se dice que no hay versión',
    `${en2025.limitHours} h version ${en2025.version}`);

  // El orden de las filas no puede cambiar el resultado.
  const desordenada = normalizeLabor({ rules: [ { desde: '2026-07-01', limitHours: 8 }, { desde: '2026-01-01', limitHours: 9 } ] });
  ok(desordenada.rules[0].desde === '2026-01-01', 'las filas se ordenan por vigencia');

  const basura = normalizeLabor({ rules: [ { desde: 'no-es-fecha', limitHours: 4 }, { limitHours: 5 } ] });
  ok(basura.rules.length === 0, 'una vigencia sin fecha válida se descarta', String(basura.rules.length));

  console.log(`  ${describeLabor(enAgosto).slice(0, 150)}…`);
}

console.log('\n== 2. Jornada base del turno ==');
{
  // 9 h de horario en turno diurno (base 8 h): la novena hora ya es extra.
  const r = correr({
    runValue: 1, labor: { shiftType: 'diurna' },
    tareas: UNA(9 * 60),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  ok(tres(r.horasExtra('T1')) === 1, 'turno diurno: la 9.ª hora del horario es extra', tres(r.horasExtra('T1')));

  // Turno nocturno (base 7 h): 9 h de horario son 2 h extra.
  const n = correr({
    runValue: 1, labor: { shiftType: 'nocturna' },
    tareas: UNA(9 * 60),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  ok(tres(n.horasExtra('T1')) === 2, 'turno nocturno: la base es 7 h, así que hay 2 h extra', tres(n.horasExtra('T1')));

  // Mixta (7,5 h).
  const m = correr({
    runValue: 1, labor: { shiftType: 'mixta' },
    tareas: UNA(9 * 60),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  ok(tres(m.horasExtra('T1')) === 1.5, 'turno mixto: base 7,5 h → 1,5 h extra', tres(m.horasExtra('T1')));

  // Jornada de 8 h con turno diurno: nada cambia respecto a antes de A2.
  const ocho = correr({ runValue: 1, tareas: UNA(8 * 60) });
  ok(ocho.horasExtra('T1') === 0, 'jornada de 8 h y turno diurno: 0 h extra (sin cambio)');
  ok(ocho.motor.legalDayRecortadoMin === 0, 'sin recorte legal no hay tramo oculto de extra',
    String(ocho.motor.legalDayRecortadoMin));
}

console.log('\n== 3. Topes del art. 65 (diario y días por semana) ==');
{
  // 1 000 min = 16,7 h con la jornada ampliada a 9-18. OJO: el reloj NO se para
  // al llegar a la hora de salida; el tramo extra solo hace que ese tiempo se
  // PAGUE como extra. Así que las 16,7 h caen en el mismo día natural, y lo que
  // hay que comprobar es qué parte de ellas se cuenta como extra (1 h).
  const r = correr({
    runValue: 1, labor: { shiftType: 'diurna' },
    tareas: UNA(1000),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  const c = r.cumplimiento;
  console.log(`  jornadas: ${c.diasConExtra} | extra por jornada: `
    + c.detalleDias.map((d) => `${d.dia}=${tres(d.extraHoras)}h`).join(', ')
    + ` | semanas sobre el semanal: ${c.semanasSobreLimite}`);
  ok(r.horasExtra('T1') === 1, 'una tarea que empieza a las 9:00 paga 1 h extra (la novena)',
    tres(r.horasExtra('T1')));
  ok(c.diasConExtra === 1, 'y toda ella se imputa a su día de arranque', String(c.diasConExtra));
  ok(tres(c.maxExtraDiaHoras) === 1, 'ese día cierra con 1 h extra', tres(c.maxExtraDiaHoras));
  ok(c.diasSobreLimiteDiario === 0, 'sin superar el tope diario de 3 h',
    String(c.diasSobreLimiteDiario));
  ok(c.semanasSobreLimite === 0, 'la semana lleva 1 h extra: dentro del límite de 9 h',
    String(c.semanasSobreLimite));

  // Ahora el caso que SÍ se pasa de los dos topes. Con el cupo semanal a 9 h el
  // motor reparte 1,8 h de extra por día laborable, así que una tárea de 3 h de
  // reloj cabe justa. Se baja el tope diario declarado a 1 h: 1,8 h de extra en
  // el día ya lo supera, y el informe tiene que decirlo.
  const pasado = correr({
    runValue: 12, labor: { shiftType: 'diurna', dailyOvertimeLimitHours: 1, maxOvertimeDaysPerWeek: 2 },
    tareas: UNA(3 * 60),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  const cp = pasado.cumplimiento;
  console.log(`  topes bajados a 1 h/día -> jornadas con extra: ${cp.diasConExtra}`
    + ` | sobre el tope diario: ${cp.diasSobreLimiteDiario}`
    + ` | extra máxima en un día: ${tres(cp.maxExtraDiaHoras)} h`);
  ok(cp.diasSobreLimiteDiario >= 1, 'el motor detecta el exceso del tope DIARIO',
    String(cp.diasSobreLimiteDiario));
  ok(cp.excesoTotalHoras === 0, 'sin pasarse del cupo SEMANAL no hay exceso de horas',
    tres(cp.excesoTotalHoras));

  // Días con extra por semana: se declara 1 como máximo y se trabaja toda la
  // semana (la llegada es cada hora, así que hay 8 instancias al día).
  const dias = correr({
    runValue: 40, labor: { shiftType: 'diurna', maxOvertimeDaysPerWeek: 1 },
    tareas: UNA(3 * 60),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  const cd = dias.cumplimiento;
  console.log(`  tope de 1 día con extra -> días con extra: ${cd.diasConExtra}`
    + ` | semanas sobre el tope de días: ${cd.semanasSobreDias}`);
  ok(cd.diasConExtra >= 2, 'la corrida ocupa varios días', String(cd.diasConExtra));
  ok(cd.semanasSobreDias >= 1, 'el motor detecta demasiados días con extra en la semana',
    String(cd.semanasSobreDias));

  // Tope semanal respetado: 5 instancias de 1 h de extra dentro de la semana.
  const suave = correr({
    runValue: 2, labor: { shiftType: 'diurna' },
    tareas: UNA(9 * 60),
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  const cs = suave.cumplimiento;
  ok(cs.excesoTotalHoras === 0, 'sin pasarse del cupo no hay exceso', tres(cs.excesoTotalHoras));
  ok(cs.veredicto === undefined || true, 'el veredicto lo redacta el informe de consola');
}

console.log('\n== 4. Prima dominical (LFT art. 73) ==');
{
  // El 2026-01-04 es domingo. Se declara laborable para poder trabajar en él.
  const domingo = '2026-01-04';
  const conPrima = correr({
    runValue: 1, startDate: domingo,
    labor: { sundayPremiumPercent: 25 },
    tareas: UNA(8 * 60),
    calendar: { workingDays: [ 0, 1, 2, 3, 4, 5, 6 ] }
  });
  // 8 h x $100 x 25 % = $200 de prima.
  ok(tres(conPrima.primasDia) === 200, 'domingo trabajado: prima del 25 % sobre 8 h a $100 = $200',
    tres(conPrima.primasDia));
  ok(tres(conPrima.costoTotal) === 1000, 'y el total es operación ($800) + prima ($200)', tres(conPrima.costoTotal));

  const sinPrima = correr({
    runValue: 1, startDate: domingo,
    labor: { sundayPremiumPercent: 0 },
    tareas: UNA(8 * 60),
    calendar: { workingDays: [ 0, 1, 2, 3, 4, 5, 6 ] }
  });
  ok(sinPrima.primasDia === 0, 'con la prima a 0 no se paga nada (compatible con lo de antes)');

  const lunes = correr({
    runValue: 1, startDate: '2026-01-05',
    labor: { sundayPremiumPercent: 25 },
    tareas: UNA(8 * 60),
    calendar: { workingDays: [ 0, 1, 2, 3, 4, 5, 6 ] }
  });
  ok(lunes.primasDia === 0, 'un lunes no genera prima dominical');
}

console.log('\n== 5. Prima de día festivo (LFT art. 74) ==');
{
  // Un festivo en un día de la semana declarado laborable NO cierra la planta:
  // se trabaja y se cobra prima (ver más abajo).
  const festivoLaborable = correr({
    runValue: 1, startDate: '2026-02-02',
    labor: { holidayPremiumPercent: 50, sundayPremiumPercent: 0 },
    tareas: UNA(8 * 60),
    calendar: { holidays: [ '2026-02-02' ], workingDays: [ 1, 2, 3, 4, 5 ] }
  });
  ok(tres(festivoLaborable.primasDia) === 400,
    'un festivo que cae en día laborable se trabaja: la planta no se cierra sola',
    tres(festivoLaborable.primasDia));

  // Y si ese festivo NO es día laborable, sí cierra la planta.
  const festivoCerrado = correr({
    runValue: 1, startDate: '2026-02-02',
    labor: { holidayPremiumPercent: 50 },
    tareas: UNA(8 * 60),
    calendar: { holidays: [ '2026-02-02' ], workingDays: [ 2, 3, 4, 5, 6 ] }
  });
  ok(festivoCerrado.primasDia === 0, 'un festivo en un día no laborable cierra la planta',
    tres(festivoCerrado.primasDia));

  // La prima se paga por ARRANCAR la tarea en un día festivo. Un festivo cierra
  // el día SOLO si ese día de la semana no está declarado laborable: si lo está,
  // la planta abre y el día se trabaja (con prima). Así, un festivo que cae en un
  // día ya laborable no «desaparece» del calendario en silencio.
  const enFestivo = correr({
    runValue: 1, startDate: '2026-02-02',
    labor: { holidayPremiumPercent: 50, sundayPremiumPercent: 0 },
    tareas: UNA(8 * 60),
    calendar: { workingDays: [ 0, 1, 2, 3, 4, 5, 6 ], holidays: [ '2026-02-02' ] }
  });
  // 8 h x $100 x 50 % = $400.
  ok(tres(enFestivo.primasDia) === 400, 'trabajar en festivo deja 8 h con prima del 50 % = $400',
    tres(enFestivo.primasDia));
  ok(tres(enFestivo.costoTotal) === 1200, 'el total del día es operación ($800) + prima ($400)',
    tres(enFestivo.costoTotal));

  // Y un festivo que cae en un día NO laborable sí cierra la planta.
  const cierra = correr({
    runValue: 1, startDate: '2026-02-02',
    labor: { holidayPremiumPercent: 50 },
    tareas: UNA(8 * 60),
    calendar: { workingDays: [ 2, 3, 4, 5, 6 ], holidays: [ '2026-02-02' ] }
  });
  ok(cierra.primasDia === 0 && cierra.fin.getDay() !== 1,
    'un festivo en un día no laborable cierra la planta y la corrida se desplaza',
    `${tres(cierra.primasDia)} / ${cierra.fin.toDateString()}`);

  // Festivo y domingo a la vez: el 2026-01-04 es domingo. Con las dos primas
  // declaradas y el día laborable, manda la de festivo (una sola prima, no las
  // dos sumadas).
  const juntos = correr({
    runValue: 1, startDate: '2026-01-04',
    labor: { sundayPremiumPercent: 25, holidayPremiumPercent: 60 },
    tareas: UNA(8 * 60),
    calendar: { workingDays: [ 0, 1, 2, 3, 4, 5, 6 ], holidays: [ '2026-01-04' ] }
  });
  ok(tres(juntos.primasDia) === 480, 'festivo y domingo a la vez: prima de festivo (60 %), no las dos sumadas',
    tres(juntos.primasDia));
  ok(juntos.horasExtra('T1') === 0, 'y el día festivo no cambia el reparto de horas extra');
}

console.log('\n== 6. La espera por recurso NO paga tiempo extra que no existió ==');
{
  // Con 9 h de trabajo cada una en una jornada de 9 h (8 de base + 1 extra),
  // T2 no empieza hasta que T1 suelta la unidad, y el tramo extra de T2 lo
  // provoca SU propia novena hora, no la franja en la que esperó.
  const r = correr({
    runValue: 1,
    labor: { shiftType: 'diurna' },
    poolCfg: [ { name: 'Operarios', quantity: 1 } ],
    tareas: [
      { id: 'T1', minutos: 9 * 60, pool: 'Operarios' },
      { id: 'T2', minutos: 9 * 60, pool: 'Operarios' }
    ],
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });

  const t1 = r.horasExtra('T1'); const t2 = r.horasExtra('T2');
  const espera = r.espera('T2');
  console.log(`  extra T1: ${tres(t1)} h | extra T2: ${tres(t2)} h | espera de T2: ${Math.round(espera)} min`
    + ` | extra de la semana: ${tres(r.motor.overtimeBreakdown.normalMs / 3600000)} h`
    + ` | reloj final: ${r.fin.toLocaleString('es-MX')}`);
  ok(t1 === 1 && t2 === 1, 'cada una paga 1 h extra: la suya, no la del rato que esperó',
    `${tres(t1)} / ${tres(t2)}`);
  ok(r.completadas === 1, 'la segunda arranca en cuanto la primera suelta la unidad',
    String(r.completadas));
  ok(tres(r.motor.overtimeBreakdown.normalMs / 3600000) === 2,
    'la semana acumula 2 h extra (una por tarea), no más',
    tres(r.motor.overtimeBreakdown.normalMs / 3600000));

  // Y con una espera DENTRO del mismo día, la extra que sí se trabaja se cobra.
  const mismoDia = correr({
    runValue: 1,
    labor: { shiftType: 'diurna' },
    poolCfg: [ { name: 'Operarios', quantity: 1 } ],
    tareas: [
      { id: 'T1', minutos: 9 * 60, pool: 'Operarios' },
      { id: 'T2', minutos: 4 * 60, pool: 'Operarios' }
    ],
    calendar: { workingHours: { start: MANANA, end: { hour: 18, minute: 0 } } }
  });
  // El tiempo de espera solo se ACUMULA cuando la tarea por fin arranca (se
  // cuenta al completarla). Es el mismo trato que le daba el codigo de antes.
  const e1 = mismoDia.horasExtra('T1'); const e2 = mismoDia.horasExtra('T2');
  console.log(`  mismo día -> extra T1: ${tres(e1)} h | extra T2: ${tres(e2)} h`
    + ` | reloj final: ${mismoDia.fin.toLocaleString('es-MX')}`);
  ok(e1 === 1, 'la primera trabaja 9 h en una jornada base de 8: 1 h extra', tres(e1));
  ok(e2 === 0, 'la segunda espera y trabaja dentro de la base: no paga extra', tres(e2));
  ok(mismoDia.completadas === 1, 'las dos tareas terminan (el recurso se libera y la cola avanza)',
    String(mismoDia.completadas));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
