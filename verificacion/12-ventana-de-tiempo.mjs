/**
 * Ventana de tiempo: días LABORABLES y días NATURALES.
 *
 * El resumen tiene que decir cuando empieza y cuando termina, y contar los dias
 * en los DOS relojes, porque «12 dias» significa cosas distintas segun cual sea:
 * lo que se trabaja (y se paga) o lo que tarda en llegar la fecha. Confundirlos
 * es el error mas facil de cometer, asi que se comprueban los dos por separado.
 *
 * Se ejercita el motor REAL y, sobre su resultado, la MISMA funcion que usa el
 * resumen para contar dias naturales.
 */
import SimulationEngine from './SimulationEngine.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

// `_diasNaturales` vive en SimulationController, que no se puede importar en Node
// (depende de bpmn-js y de Chart.js). Se EXTRAE el metodo del fichero real: si
// alguien lo cambia alli, este arnes lo usa cambiado.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const controlador = readFileSync(join(RAIZ, 'client', 'simulation', 'SimulationController.js'), 'utf8');
const cuerpo = controlador.match(/  _diasNaturales\([\s\S]*?\n  \}/)[0];
const diasNaturales = new Function(`return (${cuerpo.trim().replace(/^_diasNaturales/, 'function _diasNaturales')});`)();

const MANANA = { hour: 9, minute: 0 };
const TARDE = { hour: 17, minute: 0 };

function correr({ runValue, tareas, inicio, calendario }) {
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    const nodo = (id, tipo, datos) => ({ id, $type: tipo, businessObject: { name: id }, outgoing: [], _datos: datos });
    const arranque = nodo('S1', 'bpmn:StartEvent', {
      isRoot: true, arrivalRate: { value: 1, unit: 'hour' }, simulationConfig: { runValue },
      startDate: inicio || '2026-01-05',
      calendar: calendario || { workingDays: [ 1, 2, 3, 4, 5 ], workingHours: { start: MANANA, end: TARDE }, breaks: [], holidays: [] },
      cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
      overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 }
    });
    const t = tareas.map((x) => nodo(x.id, 'bpmn:Task', {
      processingTime: { distribution: 'fixed', value: x.minutos, unit: 'minutes' },
      failureRate: 0, reworkTime: { value: 0, unit: 'minutes' }
    }));
    const fin = nodo('E1', 'bpmn:EndEvent', {});
    const cadena = [ arranque, ...t, fin ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = { id: `F${i}`, $type: 'bpmn:SequenceFlow', businessObject: {}, source: cadena[i], target: cadena[i + 1] };
      cadena[i].outgoing = [ f ];
      flujos.push(f);
    }
    const elementos = [ ...cadena, ...flujos ];
    const reg = {
      getAll: () => elementos, get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn), find: (fn) => elementos.find(fn)
    };

    const motor = new SimulationEngine(reg);
    motor.run({ useOvertime: false });

    const desde = new Date(motor.simulationStartTime);
    const hasta = new Date(motor.clock);
    return {
      inicio: desde,
      fin: hasta,
      diasLaborables: motor.calendar.calculateWorkingDays(desde, hasta),
      diasNaturales: diasNaturales(desde, hasta)
    };
  } finally {
    Object.assign(console, guardar);
  }
}

console.log('\n== 1. La funcion de dias naturales, caso a caso ==');
{
  // Se cuenta el PRIMERO y el ULTIMO: es lo que se mira en un calendario.
  const d = (iso) => new Date(iso);
  ok(diasNaturales(d('2026-01-05T18:39:00'), d('2026-01-05T20:00:00')) === 1,
    'mismo dia -> 1 dia natural',
    diasNaturales(d('2026-01-05T18:39:00'), d('2026-01-05T20:00:00')));
  ok(diasNaturales(d('2026-01-05T18:39:00'), d('2026-01-06T10:00:00')) === 2,
    'lunes 18:39 -> martes 10:00 -> 2 dias naturales (aunque pasen 15 h)',
    diasNaturales(d('2026-01-05T18:39:00'), d('2026-01-06T10:00:00')));
  ok(diasNaturales(d('2026-01-05T09:00:00'), d('2026-01-09T17:00:00')) === 5,
    'de lunes a viernes -> 5 dias naturales (con el fin de semana dentro)',
    diasNaturales(d('2026-01-05T09:00:00'), d('2026-01-09T17:00:00')));

  // El cambio de horario de verano: un dia de 23 h no puede contar como 0,96 dias.
  ok(diasNaturales(d('2026-04-04T10:00:00'), d('2026-04-05T10:00:00')) === 2,
    'el cambio de horario de verano no descuadra el conteo (2 dias)',
    diasNaturales(d('2026-04-04T10:00:00'), d('2026-04-05T10:00:00')));

  // `new Date('no-es-fecha')` es un Date con getTime() = NaN, no un null. La
  // comprobacion es que la funcion no devuelva NaN, que se propagaria al resumen.
  const invalida = diasNaturales(new Date('no-es-fecha'), d('2026-01-05'));
  ok(invalida === null || Number.isNaN(invalida) === false,
    'una fecha invalida no devuelve NaN (que se propagaria al resumen)',
    String(invalida));
}

console.log('\n== 2. Los dos contadores, sobre una corrida real ==');
{
  // 40 piezas de 30 min con jornada de 8 h: 20 h de trabajo -> 3 jornadas.
  const r = correr({ runValue: 40, tareas: [ { id: 'T1', minutos: 30 } ], inicio: '2026-01-05' });
  console.log(`  inicio ${r.inicio.toLocaleString('es-MX')} | fin ${r.fin.toLocaleString('es-MX')}`);
  console.log(`  laborables ${r.diasLaborables} | naturales ${r.diasNaturales}`);

  ok(r.diasLaborables >= 1, 'hay al menos un dia laborable', r.diasLaborables);
  ok(r.diasNaturales >= r.diasLaborables,
    'los naturales NUNCA son menos que los laborables (la ventana los contiene)',
    `${r.diasNaturales} >= ${r.diasLaborables}`);
  ok(r.fin.getTime() >= r.inicio.getTime(), 'el fin no es anterior al inicio');
}

console.log('\n== 3. Cruzando el fin de semana: los dos numeros se separan ==');
{
  // 3 jornadas de trabajo empezando el VIERNES: el trabajo cae en viernes, lunes
  // y martes. Son 3 dias laborables pero 5 naturales (viernes a martes).
  const r = correr({ runValue: 45, tareas: [ { id: 'T1', minutos: 30 } ], inicio: '2026-01-09' });
  console.log(`  inicio ${r.inicio.toLocaleDateString('es-MX', { weekday: 'long' })} | fin ${r.fin.toLocaleDateString('es-MX', { weekday: 'long' })}`);
  console.log(`  laborables ${r.diasLaborables} | naturales ${r.diasNaturales}`);

  ok(r.diasNaturales > r.diasLaborables,
    'empezando en viernes, los naturales SUPERAN a los laborables (el fin de semana esta dentro)',
    `${r.diasNaturales} > ${r.diasLaborables}`);
  const noLaborables = r.diasNaturales - r.diasLaborables;
  ok(noLaborables >= 2, 'y la diferencia son al menos los 2 dias del fin de semana',
    `${noLaborables} dias no laborables`);
}

console.log('\n== 4. Con festivos, la diferencia crece ==');
{
  // Ojo con la regla de A2: un festivo en un dia **laborable** NO cierra la
  // planta (se trabaja y se paga prima), asi que para alargar la ventana el
  // festivo tiene que caer en un dia NO laborable. El sabado 2026-01-10 lo es.
  const conFestivo = correr({
    runValue: 45,
    tareas: [ { id: 'T1', minutos: 30 } ],
    inicio: '2026-01-09',
    calendario: {
      workingDays: [ 1, 2, 3, 4, 5 ],
      workingHours: { start: MANANA, end: TARDE },
      breaks: [], holidays: [ '2026-01-10' ]
    }
  });
  console.log(`  con festivo en sabado -> laborables ${conFestivo.diasLaborables} | naturales ${conFestivo.diasNaturales}`);

  const sinFestivo = correr({ runValue: 45, tareas: [ { id: 'T1', minutos: 30 } ], inicio: '2026-01-09' });
  ok(conFestivo.diasNaturales === sinFestivo.diasNaturales,
    'un festivo en sabado no cambia los naturales: el sabado ya no era laborable',
    `${conFestivo.diasNaturales} vs ${sinFestivo.diasNaturales}`);

  // Y la regla de A2 comprobada aqui tambien: festivo en LUNES laborable -> la
  // ventana NO se alarga, porque ese dia se trabaja.
  const lunesFestivo = correr({
    runValue: 45,
    tareas: [ { id: 'T1', minutos: 30 } ],
    inicio: '2026-01-09',
    calendario: {
      workingDays: [ 1, 2, 3, 4, 5 ],
      workingHours: { start: MANANA, end: TARDE },
      breaks: [], holidays: [ '2026-01-12' ]
    }
  });
  console.log(`  con festivo en lunes (laborable) -> laborables ${lunesFestivo.diasLaborables} | naturales ${lunesFestivo.diasNaturales}`);
  ok(lunesFestivo.diasNaturales === sinFestivo.diasNaturales,
    'un festivo en LUNES laborable no alarga la ventana: la planta abre (A2)',
    `${lunesFestivo.diasNaturales} vs ${sinFestivo.diasNaturales}`);
  ok(lunesFestivo.diasLaborables === sinFestivo.diasLaborables,
    'y los laborables siguen igual: se trabaja el lunes',
    `${lunesFestivo.diasLaborables} vs ${sinFestivo.diasLaborables}`);
}

console.log('\n== 5. El aviso de coherencia: naturales >= laborables ==');
{
  // Sobre varios escenarios, la propiedad tiene que cumplirse SIEMPRE. Si algun
  // dia fallara, el resumen estaria mostrando dos numeros que se contradicen.
  const casos = [
    { runValue: 1, tareas: [ { id: 'T1', minutos: 30 } ], inicio: '2026-01-05' },
    { runValue: 200, tareas: [ { id: 'T1', minutos: 30 } ], inicio: '2026-01-05' },
    { runValue: 100, tareas: [ { id: 'T1', minutos: 45 }, { id: 'T2', minutos: 15 } ], inicio: '2026-01-31' },
    { runValue: 50, tareas: [ { id: 'T1', minutos: 120 } ], inicio: '2026-12-24' }
  ];

  casos.forEach((c, i) => {
    const r = correr(c);
    ok(r.diasNaturales >= r.diasLaborables,
      `caso ${i + 1} (inicio ${c.inicio}, ${c.runValue} piezas): naturales >= laborables`,
      `${r.diasNaturales} >= ${r.diasLaborables}`);
    ok(Number.isInteger(r.diasNaturales) && r.diasNaturales > 0,
      `caso ${i + 1}: los dias naturales son un entero positivo`, r.diasNaturales);
  });
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
