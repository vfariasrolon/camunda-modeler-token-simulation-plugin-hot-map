// Verificacion de A1: tramos de trabajo (BusinessCalendar) y curva de arranque
// (WarmupCurve). Se importan los ficheros REALES copiados a .mjs.
import BusinessCalendar from './BusinessCalendar.mjs';
import {
  efficiencyAt, effectiveDuration, accumulatedLoss, curvePoints,
  describeWarmup, normalizeWarmup
} from './WarmupCurve.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle ? '  ->  ' + detalle : ''}`);
  if (!cond) fallos++;
};
const casi = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const ISO = (d) => `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  + (d.getSeconds() || d.getMilliseconds() ? `:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}` : '');

// Lunes 2026-01-05
const lunes = (h, m = 0) => new Date(2026, 0, 5, h, m, 0, 0);

const base = {
  workingDays: [ 1, 2, 3, 4, 5 ],
  workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }
};
const comida = { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 } };

const conComida = new BusinessCalendar({ ...base, breaks: [ comida ] });
const sinComida = new BusinessCalendar(base);
const dosDescansos = new BusinessCalendar({ ...base, breaks: [ comida, { start: { hour: 10, minute: 30 }, end: { hour: 10, minute: 45 } } ] });

console.log('\n== 1. Tramos del dia ==');
{
  const t = conComida.tramosDelDia(lunes(9));
  ok(t.length === 2, 'la jornada con comida da 2 tramos', JSON.stringify(t));
  ok(t[0].inicio === 540 && t[0].fin === 780, 'tramo 1 = 09:00-13:00', `${t[0].inicio}-${t[0].fin}`);
  ok(t[1].inicio === 840 && t[1].fin === 1020, 'tramo 2 = 14:00-17:00', `${t[1].inicio}-${t[1].fin}`);

  ok(conComida.minutosDeTrabajoDelDia(lunes(9)) === 420, 'minutos de trabajo = 420 (480 - 60)',
    String(conComida.minutosDeTrabajoDelDia(lunes(9))));
  ok(sinComida.minutosDeTrabajoDelDia(lunes(9)) === 480, 'sin descansos = 480', String(sinComida.minutosDeTrabajoDelDia(lunes(9))));

  ok(dosDescansos.tramosDelDia(lunes(9)).length === 3, 'dos descansos -> 3 tramos');
  ok(dosDescansos.minutosDeTrabajoDelDia(lunes(9)) === 405, 'dos descansos -> 405 min',
    String(dosDescansos.minutosDeTrabajoDelDia(lunes(9))));

  ok(new Date(2026, 0, 10, 12).getDay() === 6 && conComida.tramosDelDia(new Date(2026, 0, 10)).length === 0,
    'sabado no laborable -> sin tramos');
}

console.log('\n== 2. isWorkingTime con descanso ==');
{
  const casos = [ [ 12, 59, true ], [ 13, 0, false ], [ 13, 59, false ], [ 14, 0, true ], [ 18, 0, false ] ];
  casos.forEach(([ h, m, esperado ]) => {
    const real = conComida.isWorkingTime(lunes(h, m));
    ok(real === esperado, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} -> ${esperado}`, String(real));
  });

  // Compatibilidad: sin descansos el comportamiento es el de antes.
  ok(sinComida.isWorkingTime(lunes(13, 30)) === true, 'sin descansos, las 13:30 SI son laborables');
}

console.log('\n== 3. addWorkingTime a traves del descanso ==');
{
  // 60 min desde las 12:30: 30 hasta la comida, pausa, y 30 desde las 14:00.
  const a = conComida.addWorkingTime(lunes(12, 30), 60);
  ok(a.getHours() === 14 && a.getMinutes() === 30, '12:30 + 60 min laborables = 14:30 (pausa la comida)', ISO(a));

  // Una jornada completa de trabajo (420) acaba a las 17:00.
  const b = conComida.addWorkingTime(lunes(9), 420);
  ok(b.getHours() === 17 && b.getMinutes() === 0 && b.getDay() === 1, '09:00 + 420 min = lunes 17:00', ISO(b));

  // Y una jornada completa SIN descanso (480) ya salta al dia siguiente.
  const c = conComida.addWorkingTime(lunes(9), 480);
  ok(c.getDay() === 2 && c.getHours() === 10 && c.getMinutes() === 0,
    '09:00 + 480 min laborables = martes 10:00 (la comida se descuenta)', ISO(c));

  // Compatibilidad: sin descansos, 480 min acaban el mismo dia a las 17:00.
  const d = sinComida.addWorkingTime(lunes(9), 480);
  ok(d.getDay() === 1 && d.getHours() === 17, 'sin descansos, 09:00 + 480 min = lunes 17:00', ISO(d));

  // Fin de semana + descanso.
  const viernes = new Date(2026, 0, 9, 16, 30);
  const e = conComida.addWorkingTime(viernes, 60);
  ok(e.getDay() === 1 && e.getHours() === 9 && e.getMinutes() === 30,
    'viernes 16:30 + 60 min = lunes 09:30 (salta el fin de semana)', ISO(e));

  // Los decimales ya no se truncan.
  const f = conComida.addWorkingTime(lunes(9), 10.5);
  ok(f.getHours() === 9 && f.getMinutes() === 10 && f.getSeconds() === 30,
    '09:00 + 10,5 min = 09:10:30 (antes se truncaba a 09:10)', ISO(f));

  // REGRESION ENCONTRADA AL REESCRIBIR ESTE METODO: el algoritmo anterior
  // calculaba los dias completos DESPUES de haber avanzado ya al dia siguiente,
  // asi que contaba una jornada de mas. Para martes + 16 h devolvia el JUEVES;
  // lo correcto es el miercoles 17:00 (dos jornadas de 8 h).
  const g = sinComida.addWorkingTime(lunes(9), 16 * 60);
  ok(g.getDay() === 2 && g.getHours() === 17, 'lunes 09:00 + 16 h = martes 17:00 (dos jornadas exactas)', ISO(g));

  const g2 = sinComida.addWorkingTime(new Date(2026, 0, 6, 9), 16 * 60);
  ok(g2.getDay() === 3 && g2.getHours() === 17, 'martes 09:00 + 16 h = miercoles 17:00 (antes daba jueves)', ISO(g2));

  const g3 = sinComida.addWorkingTime(lunes(9), 24 * 60);
  ok(g3.getDay() === 3 && g3.getHours() === 17, 'lunes 09:00 + 24 h = miercoles 17:00 (tres jornadas)', ISO(g3));
}

console.log('\n== 4. Duracion laborable y horas extra ==');
{
  const min = conComida.calculateBusinessDurationInMinutes(lunes(12), lunes(15));
  ok(min === 120, '12:00 a 15:00 = 120 min laborables (la comida no cuenta)', String(min));

  const r = conComida.calculateBusinessTime(lunes(12, 30), 60, conComida);
  ok(r.overtime === 0, 'una tarea partida por la comida NO genera horas extra', String(r.overtime));

  // Plan extendido: la jornada acaba a las 18:00 y la comida sigue.
  const extendido = new BusinessCalendar({ ...base, workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 18, minute: 0 } }, breaks: [ comida ] });
  const r2 = extendido.calculateBusinessTime(lunes(16), 120, conComida);
  ok(r2.overtime / 60000 === 60, '16:00 + 120 min con jornada estandar hasta 17:00 -> 60 min extra',
    `${r2.overtime / 60000} min`);

  // Sin descanso en el tramo extra: se trabaja la comida y esa hora pasa a ser extra.
  const extendidoSinDescanso = new BusinessCalendar({ ...base, workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 18, minute: 0 } }, breaks: [] });
  const r3 = extendidoSinDescanso.calculateBusinessTime(lunes(12, 30), 90, conComida);
  ok(r3.overtime / 60000 === 60, 'trabajar a traves de la comida cuenta como tiempo fuera del estandar',
    `${r3.overtime / 60000} min extra`);
}

console.log('\n== 5. Disparadores de la curva: inicio de tramo ==');
{
  const a = conComida.inicioDeTramo(lunes(10));
  ok(a.getHours() === 9 && a.getMinutes() === 0, 'a las 10:00 el arranque viene de las 09:00', ISO(a));

  const b = conComida.inicioDeTramo(lunes(14, 30));
  ok(b.getHours() === 14 && b.getMinutes() === 0, 'a las 14:30 el arranque viene de las 14:00 (volver de comer)', ISO(b));

  const c = conComida.inicioDeTramo(lunes(13, 20));
  ok(c.getHours() === 14, 'dentro del descanso, el arranque es el del tramo siguiente', ISO(c));

  ok(conComida.esPrimerTramo(lunes(10)) === true, 'las 10:00 son el primer tramo (jornada)');
  ok(conComida.esPrimerTramo(lunes(14, 30)) === false, 'las 14:30 no son el primer tramo (descanso)');

  const d = conComida.getWorkdayEnd(lunes(9));
  ok(d.getHours() === 17, 'fin de jornada = 17:00', ISO(d));
  ok(conComida.getWorkdayEnd(new Date(2026, 0, 10)) === null, 'sabado -> fin de jornada null');
}

console.log('\n== 6. Festivos con clave de dia LOCAL ==');
{
  // La regla vigente (A2): un festivo cierra el dia SOLO si ese dia de la semana
  // no esta declarado laborable. Si lo esta, la planta abre y ese dia se trabaja
  // —con la prima del art. 74—, porque el calendario no puede decir a la vez
  // «abierto» (workingDays) y «cerrado» (holidays).
  //
  // 2026-01-10 es sabado, y `base` no lo tiene como laborable: ese si cierra.
  const sabadoFestivo = new BusinessCalendar({ ...base, holidays: [ '2026-01-10' ] });
  ok(sabadoFestivo.tramosDelDia(new Date(2026, 0, 10, 12)).length === 0,
    'un festivo en sabado (no laborable) no tiene tramos');

  // Y el caso que cambio A2: festivo en lunes LABORABLE -> la planta sigue abierta.
  const lunesFestivo = new BusinessCalendar({ ...base, holidays: [ '2026-01-05' ] });
  ok(lunesFestivo.tramosDelDia(lunes(9)).length > 0,
    'un festivo en lunes LABORABLE no cierra la planta (A2)',
    `${lunesFestivo.tramosDelDia(lunes(9)).length} tramos`);
  ok(lunesFestivo.isWorkingTime(lunes(10)) === true,
    'y ese dia se trabaja: la prima de festivo la calcula el motor, no el calendario');
  ok(lunesFestivo.esDiaFestivo(lunes(9)) === true,
    'pero el calendario SI lo reconoce como festivo, que es lo que dispara la prima');

  // La clave de dia es LOCAL: el festivo se detecta tambien de madrugada, que es
  // donde una clave en UTC se desplazaria al dia anterior.
  ok(sabadoFestivo.esDiaFestivo(new Date(2026, 0, 10, 3)) === true,
    'la clave de dia es LOCAL: el festivo se detecta a las 03:00 tambien');
  ok(sabadoFestivo.calculateWorkingDays(lunes(9), new Date(2026, 0, 9, 23)) === 5,
    'la semana del lunes festivo-laborable sigue teniendo 5 dias laborables',
    String(sabadoFestivo.calculateWorkingDays(lunes(9), new Date(2026, 0, 9, 23))));
}

console.log('\n== 7. Curva de arranque: forma ==');
{
  const lineal = { shape: 'linear', initialEfficiency: 0.7, recoveryMinutes: 30 };
  const expo = { shape: 'exponential', initialEfficiency: 0.7, recoveryMinutes: 30 };

  ok(casi(efficiencyAt(0, lineal), 0.7), 'lineal: e(0) = 0,70', String(efficiencyAt(0, lineal)));
  ok(casi(efficiencyAt(30, lineal), 1), 'lineal: e(30) = 1 exacto', String(efficiencyAt(30, lineal)));
  ok(casi(efficiencyAt(15, lineal), 0.85), 'lineal: e(15) = 0,85 (punto medio)', String(efficiencyAt(15, lineal)));
  ok(efficiencyAt(9999, lineal) === 1, 'lineal: se queda en 1');

  ok(casi(efficiencyAt(0, expo), 0.7), 'exponencial: e(0) = 0,70');
  ok(Math.abs(efficiencyAt(30, expo) - 0.985) < 0.002, 'exponencial: e(30) ~ 0,985 (95 % recuperado)',
    efficiencyAt(30, expo).toFixed(4));
  ok(efficiencyAt(9999, expo) > 0.999, 'exponencial: tiende a 1', efficiencyAt(9999, expo).toFixed(6));
  ok(casi(efficiencyAt(5, { shape: 'none' }), 1), 'forma ninguna: siempre 1');

  ok(casi(accumulatedLoss(0, lineal), 0), 'perdida(0) = 0');
  ok(casi(accumulatedLoss(30, lineal), 4.5), 'lineal: perdida total = 4,5 min', String(accumulatedLoss(30, lineal)));
}

console.log('\n== 8. Curva de arranque: duracion efectiva ==');
{
  const lineal = { shape: 'linear', initialEfficiency: 0.7, recoveryMinutes: 30 };
  const expo = { shape: 'exponential', initialEfficiency: 0.7, recoveryMinutes: 30 };

  // Tarea corta al arrancar: 10 min de trabajo cuestan mas de 10 de reloj.
  const d10 = effectiveDuration(10, 0, lineal);
  ok(Math.abs(d10 - 13.07) < 0.05, 'lineal: 10 min de trabajo al arrancar = ~13,07 min de reloj', d10.toFixed(2));

  // Tarea larga: la perdida es la de la rampa, no proporcional.
  const d600 = effectiveDuration(600, 0, lineal);
  ok(casi(d600, 604.5, 0.01), 'lineal: 600 min = 604,5 (la rampa se paga una vez)', d600.toFixed(2));

  // Pasada la rampa, no hay penalizacion.
  ok(casi(effectiveDuration(600, 60, lineal), 600, 1e-6), 'empezando a los 60 min ya no hay arranque',
    effectiveDuration(600, 60, lineal).toFixed(3));
  ok(casi(effectiveDuration(600, 60, expo), 600, 0.5), 'exponencial: casi sin arranque a los 60 min',
    effectiveDuration(600, 60, expo).toFixed(3));

  // Cuanto mas tarde empieza, menos le afecta.
  const serie = [ 0, 5, 10, 20, 29, 31 ].map((t) => effectiveDuration(30, t, expo));
  const decreciente = serie.every((v, i) => i === 0 || v <= serie[i - 1] + 1e-9);
  ok(decreciente, 'la penalizacion decrece segun avanza el tramo', serie.map((v) => v.toFixed(2)).join(' > '));

  // Nunca puede ser mas rapido que a pleno rendimiento.
  const cotas = [ 0, 5, 30, 300 ].map((t) => effectiveDuration(100, t, expo));
  ok(cotas.every((v) => v >= 100 - 1e-9), 'nunca menos que el trabajo pedido', cotas.map((v) => v.toFixed(2)).join(', '));

  ok(casi(effectiveDuration(100, 0, { shape: 'none' }), 100), 'sin arranque, la duracion no cambia');

  // Valores absurdos no deben romper la matematica.
  const roto = normalizeWarmup({ shape: 'exponential', initialEfficiency: 0, recoveryMinutes: 0 });
  ok(roto.initialEfficiency > 0 && roto.recoveryMinutes >= 1, 'los valores absurdos se sanean',
    JSON.stringify(roto));
  ok(Number.isFinite(effectiveDuration(10, 0, roto)), 'y la duracion sigue siendo finita');
}

console.log('\n== 9. Curva: materiales para el configurador ==');
{
  const expo = { shape: 'exponential', initialEfficiency: 0.7, recoveryMinutes: 30 };
  const puntos = curvePoints(expo, 60, 8);
  ok(puntos.length === 9, 'la curva se dibuja con los puntos pedidos', String(puntos.length));
  ok(casi(puntos[0].t, 0) && casi(puntos[0].efficiency, 0.7), 'el primer punto es (0, e0)');
  ok(casi(puntos[puntos.length - 1].t, 60), 'el ultimo punto llega al final');
  ok(puntos.every((p, i) => i === 0 || p.efficiency >= puntos[i - 1].efficiency), 'la eficiencia no baja');

  const texto = describeWarmup(expo);
  ok(texto.includes('43 %'), 'el resumen dice la penalizacion (~43 %)', texto);
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
