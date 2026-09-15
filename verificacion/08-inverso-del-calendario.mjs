// subtractWorkingTime: el inverso de addWorkingTime. Codigo REAL del calendario.
import BusinessCalendar from './BusinessCalendar.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const ISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} `
  + `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// Jornada 09:00-17:00, con descanso 13:00-14:00 (tramos 9-13 y 14-17).
const cal = new BusinessCalendar({
  workingDays: [ 1, 2, 3, 4, 5 ],
  workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } },
  breaks: [ { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 } } ]
});

console.log('\n== 1. La propiedad que lo define: ida y vuelta ==');
{
  // Para muchos instantes y duraciones: add(sub(t, d), d) tiene que devolver t.
  const casos = [
    [ '2026-01-05T10:00:00', 30 ],
    [ '2026-01-05T10:00:00', 120 ],
    [ '2026-01-05T15:00:00', 90 ],
    [ '2026-01-05T14:30:00', 60 ],
    [ '2026-01-06T09:30:00', 240 ],
    [ '2026-01-05T16:00:00', 60 ]
  ];

  casos.forEach(([ iso, min ]) => {
    const t = new Date(iso);
    const inicio = cal.subtractWorkingTime(t, min);
    const vuelta = cal.addWorkingTime(inicio, min);
    ok(vuelta.getTime() === t.getTime(),
      `add(sub(${iso}, ${min}), ${min}) vuelve al mismo instante`,
      `${ISO(inicio)} -> ${ISO(vuelta)} (esperado ${ISO(t)})`);
  });
}

console.log('\n== 2. Casos concretos, a mano ==');
{
  // Termina a las 10:00, duro 30 min -> empezo a las 9:30.
  ok(ISO(cal.subtractWorkingTime(new Date('2026-01-05T10:00:00'), 30)) === '2026-01-05 09:30',
    'termina 10:00 tras 30 min -> empezo 09:30',
    ISO(cal.subtractWorkingTime(new Date('2026-01-05T10:00:00'), 30)));

  // Termina a las 14:30, duro 60 min: hacia atras NO cuenta el descanso, asi que
  // los 30 min del tramo de tarde (14:00-14:30) mas 30 del de manana -> 12:30.
  const conDescanso = cal.subtractWorkingTime(new Date('2026-01-05T14:30:00'), 60);
  ok(ISO(conDescanso) === '2026-01-05 12:30',
    'termina 14:30 tras 60 min de TRABAJO -> empezo 12:30 (salta el descanso)',
    ISO(conDescanso));

  // Y la version ingenua (restar reloj) daria 13:30, que esta DENTRO del descanso.
  const ingenua = new Date(new Date('2026-01-05T14:30:00').getTime() - 60 * 60000);
  ok(ISO(ingenua) === '2026-01-05 13:30' && ISO(conDescanso).endsWith('12:30'),
    'restar milisegundos seria incorrecto: daria 13:30, dentro del descanso',
    `ingenua ${ISO(ingenua)} vs correcta ${ISO(conDescanso)}`);
}

console.log('\n== 3. Cruzando el descanso y el fin de jornada ==');
{
  // Termina el lunes 14:30 y el trabajo duro 5 h. Ese dia hubo 4 h de manana
  // (9-13) + 30 min de tarde (14-14:30) = 4,5 h. Faltan 30 min del VIERNES,
  // cuyo ultimo tramo acaba a las 17:00 -> 16:30 del viernes.
  const cincoHoras = cal.subtractWorkingTime(new Date('2026-01-05T14:30:00'), 300);
  ok(ISO(cincoHoras) === '2026-01-02 16:30',
    'termina lunes 14:30 tras 5 h: 4,5 h del lunes y 30 min del viernes -> viernes 16:30',
    ISO(cincoHoras));

  // Termina el martes 09:30 tras 90 min: 30 min del martes + 60 del lunes.
  const cruzandoDia = cal.subtractWorkingTime(new Date('2026-01-06T09:30:00'), 90);
  ok(ISO(cruzandoDia) === '2026-01-05 16:00',
    'cruza al dia anterior: 30 min del martes + 60 del lunes -> lunes 16:00',
    ISO(cruzandoDia));

  // Y cruzando el fin de semana: el lunes por manana retrocede al viernes.
  const finde = cal.subtractWorkingTime(new Date('2026-01-12T09:30:00'), 60);
  ok(ISO(finde) === '2026-01-09 16:30',
    'el lunes por manana retrocede al VIERNES, saltando el fin de semana',
    ISO(finde));
}

console.log('\n== 4. Casos limite ==');
{
  ok(cal.subtractWorkingTime(new Date('2026-01-05T10:00:00'), 0).getTime() === new Date('2026-01-05T10:00:00').getTime(),
    'duracion 0 devuelve el mismo instante');

  // Fin DENTRO del descanso: retrocede al ultimo instante trabajado y sigue.
  const enDescanso = cal.subtractWorkingTime(new Date('2026-01-05T13:30:00'), 30);
  ok(ISO(enDescanso) === '2026-01-05 12:30',
    'fin dentro del descanso: retrocede al ultimo tramo trabajado',
    ISO(enDescanso));

  // Fin fuera de la jornada (de noche).
  const deNoche = cal.subtractWorkingTime(new Date('2026-01-05T20:00:00'), 60);
  ok(ISO(deNoche) === '2026-01-05 16:00',
    'fin de noche: retrocede a la jornada y resta desde el final',
    ISO(deNoche));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
