// Integracion de A1: el MOTOR REAL con descansos y curva de arranque.
// Lo que se comprueba son INVARIANTES, no numeros magicos: el trabajo no cambia,
// la pausa no se cuenta como trabajo, la rampa si cuesta dinero, y los dos
// interruptores del arranque funcionan por separado.
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle ? '  ->  ' + detalle : ''}`);
  if (!cond) fallos++;
};

const COMIDA = { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 }, cuentaComoJornada: false, existeEnExtra: true };

const RUN = 8;
const MIN_TAREA = 240; // 4 h

function correr({ breaks = [], warmup, useOvertime = false } = {}) {
  // El motor escribe mucho en consola (informe de validacion); se silencia para
  // que el arnes se pueda leer.
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    const tarea = {
      id: 'T1', $type: 'bpmn:Task', businessObject: { name: 'Tarea' }, outgoing: [],
      _datos: {
        processingTime: { distribution: 'fixed', value: MIN_TAREA, unit: 'minutes' },
        failureRate: 0,
        reworkTime: { value: 0, unit: 'minutes' }
      }
    };
    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: {
        isRoot: true,
        arrivalRate: { value: 1, unit: 'hour' },
        simulationConfig: { runValue: RUN },
        startDate: '2026-01-05',
        calendar: {
          workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } },
          breaks
        },
        cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
        overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        warmup
      }
    };

    const f1 = { id: 'F1', $type: 'bpmn:SequenceFlow', businessObject: {}, source: inicio, target: tarea };
    const f2 = { id: 'F2', $type: 'bpmn:SequenceFlow', businessObject: {}, source: tarea, target: fin };
    inicio.outgoing = [ f1 ];
    tarea.outgoing = [ f2 ];

    const elementos = [ inicio, tarea, fin, f1, f2 ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    const motor = new SimulationEngine(registro);
    const resultados = motor.run({ useOvertime });
    const r = resultados.get('T1');
    const sumaCiclos = (motor.instanceCycleTimes || []).reduce((a, b) => a + b, 0);

    return {
      trabajoMin: (r.totalProcessingTime || 0) / 60000,
      costo: r.totalCost || 0,
      operacion: r.totalOperationCost || 0,
      cicloMedio: motor.instanceCycleTimes && motor.instanceCycleTimes.length ? sumaCiclos / motor.instanceCycleTimes.length : 0,
      completadas: motor.completedInstances,
      fin: new Date(motor.clock)
    };
  } finally {
    Object.assign(console, guardar);
  }
}

const ISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

console.log('\n== 1. Sin descansos ni arranque: linea base ==');
const base = correr({});
console.log(`  trabajo ${base.trabajoMin} min | costo $${base.costo.toFixed(2)} | ciclo medio ${base.cicloMedio} min | fin ${ISO(base.fin)}`);
ok(base.completadas === RUN, 'se completan las instancias pedidas', String(base.completadas));
ok(base.trabajoMin === RUN * MIN_TAREA, `el trabajo total es ${RUN} x ${MIN_TAREA} min`, String(base.trabajoMin));
ok(base.cicloMedio === MIN_TAREA, 'el ciclo de cada caso es la duracion de la tarea', String(base.cicloMedio));
ok(Math.abs(base.costo - (RUN * MIN_TAREA / 60) * 100) < 0.01, 'el costo es trabajo x tarifa',
  `$${base.costo.toFixed(2)} vs $${(RUN * MIN_TAREA / 60 * 100).toFixed(2)}`);

console.log('\n== 2. Con descanso: el trabajo NO cambia, el reloj si ==');
const conComida = correr({ breaks: [ COMIDA ] });
console.log(`  trabajo ${conComida.trabajoMin} min | costo $${conComida.costo.toFixed(2)} | ciclo medio ${conComida.cicloMedio} min | fin ${ISO(conComida.fin)}`);
ok(conComida.completadas === RUN, 'se siguen completando las mismas instancias');
ok(conComida.trabajoMin === base.trabajoMin, 'el trabajo contabilizado es IDENTICO (la pausa no es trabajo)',
  `${conComida.trabajoMin} vs ${base.trabajoMin}`);
ok(conComida.cicloMedio === base.cicloMedio, 'el ciclo en minutos LABORABLES tambien es identico',
  `${conComida.cicloMedio} vs ${base.cicloMedio}`);
ok(Math.abs(conComida.costo - base.costo) < 0.01, 'y el costo base no cambia (la pausa no se paga)',
  `$${conComida.costo.toFixed(2)}`);
ok(conComida.fin.getTime() > base.fin.getTime(), 'pero el RELOJ termina mas tarde: la capacidad es menor',
  `${ISO(conComida.fin)} > ${ISO(base.fin)}`);

console.log('\n== 3. Descanso que cuenta como jornada: mas horas extra, mismo trabajo ==');
const comidaLaboral = correr({ breaks: [ { ...COMIDA, cuentaComoJornada: true } ] });
ok(comidaLaboral.trabajoMin === base.trabajoMin, 'el trabajo no cambia (el descanso no se produce)');
ok(comidaLaboral.fin.getTime() >= conComida.fin.getTime(),
  'el fin no se adelanta al marcar el descanso como jornada');

console.log('\n== 4. Curva de arranque: el trabajo no cambia, el costo SI ==');
const arranque = { shape: 'exponential', initialEfficiency: 0.5, recoveryMinutes: 60, onShiftStart: true, onBreakReturn: true };
const conArranque = correr({ breaks: [ COMIDA ], warmup: arranque });
console.log(`  trabajo ${conArranque.trabajoMin} min | costo $${conArranque.costo.toFixed(2)} | ciclo medio ${conArranque.cicloMedio} min | fin ${ISO(conArranque.fin)}`);
ok(conArranque.completadas === RUN, 'se completan las mismas instancias');
ok(conArranque.trabajoMin === base.trabajoMin, 'el trabajo pedido es el mismo (la rampa no cambia el trabajo)',
  `${conArranque.trabajoMin} vs ${base.trabajoMin}`);
ok(conArranque.costo > conComida.costo + 0.01, 'la rampa AUMENTA el costo: ir lento se paga',
  `$${conArranque.costo.toFixed(2)} > $${conComida.costo.toFixed(2)}`);
ok(conArranque.cicloMedio > conComida.cicloMedio, 'y alarga el tiempo de ciclo',
  `${conArranque.cicloMedio.toFixed(2)} vs ${conComida.cicloMedio}`);
ok(conArranque.fin.getTime() > conComida.fin.getTime(), 'y termina mas tarde',
  `${ISO(conArranque.fin)} > ${ISO(conComida.fin)}`);

console.log('\n== 5. Los dos interruptores del arranque, por separado ==');
const apagado = correr({ breaks: [ COMIDA ], warmup: { ...arranque, onShiftStart: false, onBreakReturn: false } });
const soloJornada = correr({ breaks: [ COMIDA ], warmup: { ...arranque, onShiftStart: true, onBreakReturn: false } });
const soloDescanso = correr({ breaks: [ COMIDA ], warmup: { ...arranque, onShiftStart: false, onBreakReturn: true } });

console.log(`  apagado $${apagado.costo.toFixed(2)} | solo jornada $${soloJornada.costo.toFixed(2)} | solo descanso $${soloDescanso.costo.toFixed(2)} | ambos $${conArranque.costo.toFixed(2)}`);
ok(Math.abs(apagado.costo - conComida.costo) < 0.01,
  'con los DOS interruptores apagados el resultado es identico a no tener arranque',
  `$${apagado.costo.toFixed(2)} vs $${conComida.costo.toFixed(2)}`);
ok(soloJornada.costo > apagado.costo + 0.01, 'el interruptor de inicio de jornada funciona solo',
  `$${soloJornada.costo.toFixed(2)} > $${apagado.costo.toFixed(2)}`);
ok(soloDescanso.costo > apagado.costo + 0.01, 'el interruptor del regreso del descanso funciona solo',
  `$${soloDescanso.costo.toFixed(2)} > $${apagado.costo.toFixed(2)}`);
ok(conArranque.costo >= soloJornada.costo - 0.01 && conArranque.costo >= soloDescanso.costo - 0.01,
  'con los dos encendidos no puede costar menos que con uno',
  `$${conArranque.costo.toFixed(2)}`);

console.log('\n== 6. Descanso en el tramo de horas extra (interruptor por descanso) ==');
{
  const conExtra = correr({ breaks: [ { ...COMIDA, existeEnExtra: true } ], useOvertime: true });
  const sinExtra = correr({ breaks: [ { ...COMIDA, existeEnExtra: false } ], useOvertime: true });
  console.log(`  con descanso en extra: fin ${ISO(conExtra.fin)} | sin descanso en extra: fin ${ISO(sinExtra.fin)}`);
  ok(sinExtra.fin.getTime() <= conExtra.fin.getTime(),
    'sin descanso en el tramo extra se trabaja mas, asi que se termina antes o igual',
    `${ISO(sinExtra.fin)} <= ${ISO(conExtra.fin)}`);
  ok(sinExtra.trabajoMin === conExtra.trabajoMin, 'el trabajo contabilizado no cambia');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
