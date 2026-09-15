// Arnes de verificacion del motor de calendario y del cupo semanal de horas
// extra. Importa el BusinessCalendar REAL (copia byte a byte del del proyecto,
// que no tiene dependencias) y reproduce, literalmente, la aritmetica de
// tramos que esta en SimulationEngine.scheduleTask.
import BusinessCalendar from './BusinessCalendar.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle ? '  ->  ' + detalle : ''}`);
  if (!cond) fallos++;
};

const ISO = (d) => d.toISOString().slice(0, 16).replace('T', ' ');
// OJO: `hDeMin` recibe MINUTOS. Las cifras de prima se acumulan en ms y se
// pasan a horas antes de imprimir; mezclar las dos cosas falseaba la salida.
const hDeMin = (min) => (min / 60).toFixed(2) + ' h';
const h = (horas) => horas.toFixed(2) + ' h';

const base = {
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }
};
const standard = new BusinessCalendar(base);
// Jornada extendida del plan con horas extra: 9 h/semana repartidas en 5 dias
// = 1.8 h/dia = 108 min -> salida a las 18:48.
const extendido = new BusinessCalendar({
  ...base,
  workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 18, minute: 48 } }
});

console.log('\n== 1. getWeekKey: la clave incluye el año ISO ==');
{
  // 2025-12-29 (lunes) y 2026-01-01 (jueves) son la MISMA semana ISO (2026-W01).
  const a = standard.getWeekKey(new Date(2025, 11, 29));
  const b = standard.getWeekKey(new Date(2026, 0, 1));
  const c = standard.getWeekKey(new Date(2027, 0, 4)); // 2027-W01
  const d = standard.getWeekKey(new Date(2026, 0, 8)); // 2026-W02

  ok(a === b, 'la misma semana ISO da la misma clave', `${a} == ${b}`);
  ok(a === '2026-W01', 'año ISO, no año natural', `2025-12-29 -> ${a}`);
  ok(c !== a, 'la semana 1 de 2027 NO colisiona con la de 2026', `${a} vs ${c}`);
  ok(d !== a, 'semanas distintas, claves distintas', `${a} vs ${d}`);

  // El bug que se corrigio: con getWeekNumber() a secas, a===b===c===1.
  ok(standard.getWeekNumber(new Date(2025, 11, 29)) === 1
    && standard.getWeekNumber(new Date(2027, 0, 4)) === 1,
    'getWeekNumber() si colisionaba (1 y 1): por eso hacia falta la clave',
    `${standard.getWeekNumber(new Date(2025, 11, 29))} y ${standard.getWeekNumber(new Date(2027, 0, 4))}`);
}

console.log('\n== 2. addWorkingTime: jornadas completas ==');
{
  const lunes = new Date(2026, 0, 5, 9, 0); // lunes 2026-01-05 09:00
  const fin16 = standard.addWorkingTime(lunes, 16 * 60); // 2 jornadas de 8 h
  ok(fin16.getDay() === 2 && fin16.getHours() === 17,
    'lunes 09:00 + 16 h laborables = martes 17:00 (el viejo daba miercoles)', ISO(fin16));

  const fin600 = extendido.addWorkingTime(lunes, 600);
  ok(fin600.getDay() === 2 && fin600.getHours() === 9 && fin600.getMinutes() === 12,
    '600 min con jornada de 588 min = martes 09:12 (12 min derramados)', ISO(fin600));

  // El fin de semana NO consume jornada. Se arranca a las 10:00 a proposito:
  // desde el INICIO de la jornada, +8 h termina a las 17:00 del mismo dia
  // (correcto, no es un salto). Solo si la jornada no alcanza hay salto.
  const viernes = new Date(2026, 0, 9, 10, 0); // viernes 2026-01-09 10:00
  const finV = standard.addWorkingTime(viernes, 8 * 60);
  ok(finV.getDay() === 1 && finV.getHours() === 10,
    'viernes 10:00 + 8 h = lunes 10:00 (salta el fin de semana)', ISO(finV));
}

console.log('\n== 3. Horas extra de una tarea de 600 min ==');
{
  const lunes = new Date(2026, 0, 5, 9, 0);
  const r = extendido.calculateBusinessTime(lunes, 600, standard);
  ok(r.overtime / 60000 === 108,
    'cualquier arranque consume la ventana completa de 108 min',
    `${r.overtime / 60000} min de ${ISO(r.endTime)}`);

  // Tambien si arranca a media tarde.
  const tarde = new Date(2026, 0, 5, 15, 40);
  const r2 = extendido.calculateBusinessTime(tarde, 600, standard);
  ok(r2.overtime / 60000 === 108, 'arrancando a las 15:40 tambien son 108 min',
    `${r2.overtime / 60000} min`);

  // Sin calendario extendido no hay horas extra: es el plan NORMAL.
  const rN = standard.calculateBusinessTime(lunes, 600, standard);
  ok(rN.overtime === 0, 'plan normal (sin jornada extendida): 0 min de extra',
    `${rN.overtime} min`);
}

console.log('\n== 4. Reparto semanal doble/triple ==');
const LIMITE_MIN = 9 * 60;      // overtime.limitHours = 9
const TARIFA = 50;
const MUL_DOBLE = 2;
const MUL_TRIPLE = 3;

// Aritmetica IDENTICA a SimulationEngine.scheduleTask (lineas del cupo semanal).
function simular(intervaloMinutosTrabajo, instancias, etiqueta) {
  const semana = new Map();
  const desglose = { normalMs: 0, excessMs: 0 };
  let primaDoble = 0;
  let primaTriple = 0;
  let primera = new Date(2026, 0, 5, 9, 0); // lunes 09:00
  let inicio = new Date(primera.getTime());
  let totalExtraMin = 0;

  for (let i = 0; i < instancias; i++) {
    const r = extendido.calculateBusinessTime(new Date(inicio.getTime()), 600, standard);
    const extraMs = r.overtime;
    totalExtraMin += extraMs / 60000;

    const weekKey = extendido.getWeekKey(new Date(r.endTime));
    const acumulado = semana.get(weekKey) || 0;
    const limiteMs = LIMITE_MIN * 60000;
    const normal = Math.min(extraMs, Math.max(0, limiteMs - acumulado));
    const exceso = Math.max(0, extraMs - normal);

    primaDoble += (normal / 3600000) * TARIFA * (MUL_DOBLE - 1);
    primaTriple += (exceso / 3600000) * TARIFA * (MUL_TRIPLE - 1);
    desglose.normalMs += normal;
    desglose.excessMs += exceso;
    semana.set(weekKey, acumulado + extraMs);

    inicio = extendido.addWorkingTime(inicio, intervaloMinutosTrabajo);
  }

  const dobleH = desglose.normalMs / 3600000;
  const tripleH = desglose.excessMs / 3600000;
  console.log(`\n  [${etiqueta}] intervalos en ${semana.size} semana(s) ISO`);
  console.log(`    horas extra totales ....... ${hDeMin(totalExtraMin)}`);
  console.log(`    tramo doble ............... ${h(dobleH)}  -> prima $${primaDoble.toFixed(2)}`);
  console.log(`    tramo triple .............. ${h(tripleH)}  -> prima $${primaTriple.toFixed(2)}`);
  console.log(`    doble+triple .............. ${h(dobleH + tripleH)}`);
  return { semanas: semana.size, dobleH, tripleH, primaDoble, primaTriple, totalExtraMin };
}

// (a) Una llegada por SEGUNDO: es lo que ocurre con el valor por defecto
//     arrivalRate {value:60, unit:'minute'}. Todas las instancias caen en la
//     primera jornada -> UNA sola semana ISO.
const a = simular(1 / 60, 1000, 'una cada segundo (valor 60 por minuto)');
ok(a.semanas === 1, 'todas las instancias caen en 1 sola semana ISO', `${a.semanas} semana(s)`);
ok(Math.abs(a.dobleH - 9) < 1e-9, 'el tramo doble se agota en exactamente 9 h (el cupo)', h(a.dobleH));
ok(Math.abs(a.primaDoble - 450) < 1e-9, 'prima doble = $450', `$${a.primaDoble.toFixed(2)}`);
ok(Math.abs(a.primaTriple - 179100) < 1e-9, 'prima triple = $179,100', `$${a.primaTriple.toFixed(2)}`);
ok(Math.abs(a.totalExtraMin - 108000) < 1e-6, 'horas extra totales = 108,000 min', `${a.totalExtraMin}`);
console.log('    ^ esto reproduce EXACTAMENTE el informe del usuario: 450 / 179100 / 108000.');

// (b) Una llegada por HORA: reparte las instancias en varias semanas ISO.
const b = simular(60, 1000, 'una cada hora (valor 1 por hora)');
ok(b.semanas > 10, 'ahora hay muchas semanas con horas extra', `${b.semanas} semanas`);
ok(Math.abs(b.dobleH - b.semanas * 9) <= 9.001,
  'cada semana agota SU PROPIO cupo de 9 h en el tramo doble',
  `${h(b.dobleH)} ≈ ${b.semanas} x 9 h = ${h(b.semanas * 9)}`);
ok(Math.abs((b.dobleH + b.tripleH) - b.totalExtraMin / 60) < 1e-6,
  'doble + triple = total de horas extra',
  `${h(b.dobleH + b.tripleH)} vs ${hDeMin(b.totalExtraMin)}`);
ok(b.primaDoble > a.primaDoble, 'con llegadas repartidas se paga MAS prima doble',
  `$${b.primaDoble.toFixed(2)} > $${a.primaDoble.toFixed(2)}`);

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
