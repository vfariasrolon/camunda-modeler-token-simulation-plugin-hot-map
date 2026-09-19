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

console.log('\n== 7. COSTO POR CASO: la base de los escenarios del informe ==');
{
  // El informe daba UN numero de costo, y una suma no tiene rango: no se puede
  // presupuestar ni discutir. Con el costo de cada caso salen percentiles, y ahi si se
  // puede decir «en 8 de cada 10 corridas el gasto cae entre esto y esto».
  //
  // La prueba se hace con el motor REAL y sobre la PROPIEDAD que hace auditable el dato: la
  // suma de los costos por caso tiene que cuadrar con la descomposicion del costo total. Si
  // no cuadra, el percentil del informe es de otra cosa que el total que ensena el informe.
  const guardar = { log: console.log, table: console.table, warn: console.warn, groupEnd: console.groupEnd };
  console.log = () => {}; console.table = () => {}; console.warn = () => {}; console.groupEnd = () => {};
  let motor;
  let resultados;
  try {
    // Mismo montaje que los casos de arriba, reconstruido aqui para poder mirar el motor
    // DESPUES de `run()` (los otros casos solo devuelven un resumen).
    const tarea = {
      id: 'T1', $type: 'bpmn:Task', businessObject: { name: 'Tarea' }, incoming: [], outgoing: [],
      // 90 MINUTOS CON LLEGADAS CADA MEDIA HORA, para que la cola sea inevitable. Con 30 min
      // y una sola unidad la tarea termina justo cuando llega la siguiente, no hay espera y el
      // costo de espera vale 0: la prueba de cuadre de abajo pasaria sin ejercer el camino que
      // dice comprobar. Es el fallo que tuvo esta prueba en su primera version.
      _datos: { processingTime: { distribution: 'fixed', value: 90, unit: 'minutes' },
        resources: { pool: 'P', quantityRequired: 1 } }
    };
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: { isRoot: true, arrivalRate: { value: 2, unit: 'hour' },
        simulationConfig: { runValue: RUN }, startDate: '2026-01-05',
        calendar: { workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [] },
        // `waitCostPerHour` a proposito DISTINTO de cero: el costo de espera tambien lo paga
        // el caso, y si no se acumulara el total por caso no cuadraria con el del informe.
        cost: { baseRatePerHour: 100, waitCostPerHour: 40 },
        warmup: { enabled: false } }
    };
    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    // LA PISCINA VA EN EL PROCESO, no en el StartEvent. Es como la lee el motor
    // (`resourcePools` de un `bpmn:Process`), y sin ella la tarea no tiene recurso que la
    // limite: se ejecuta sin cola y el costo de espera vale 0. Con la piscina mal declarada
    // esta prueba pasaba sin ejercer el camino que dice comprobar.
    const proceso = {
      id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' },
      _datos: { resourcePools: [ { name: 'P', quantity: 1 } ] }
    };
    const f1 = { id: 'F1', $type: 'bpmn:SequenceFlow', businessObject: {}, source: inicio, target: tarea };
    const f2 = { id: 'F2', $type: 'bpmn:SequenceFlow', businessObject: {}, source: tarea, target: fin };
    inicio.outgoing = [ f1 ];
    tarea.incoming = [ f1 ];
    tarea.outgoing = [ f2 ];

    const elementos = [ inicio, tarea, fin, f1, f2, proceso ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    motor = new SimulationEngine(registro);
    resultados = motor.run({ useOvertime: false });
  } finally {
    Object.assign(console, guardar);
  }

  const costos = motor.instanceCosts || [];
  const r = resultados.get('T1');

  ok(costos.length > 0, 'el motor guarda el costo de cada caso', `${costos.length} muestras`);

  // PRIMERO SE COMPRUEBA QUE HAYA ESPERA, y no es un adorno: sin cola el costo de espera
  // vale 0, y entonces la prueba de cuadre de abajo pasaria SIN ejercer el camino que dice
  // comprobar. Fue el fallo real de esta prueba en su primera version: tardaba en detectar
  // que la espera no se acumulaba al caso porque nunca habia espera que acumular.
  ok((r.totalWaitTimeCost || 0) > 0,
    'el montaje PRODUCE costo de espera (si no, la prueba de cuadre no probaria nada)',
    `espera ${(r.totalWaitTime || 0).toFixed(0)} min, coste ${(r.totalWaitTimeCost || 0).toFixed(2)}`);
  ok(new Set(costos.map((c) => Math.round(c * 100))).size > 1,
    'y los casos cuestan DISTINTO entre si (hay horquilla que reportar)',
    `${new Set(costos.map((c) => Math.round(c))).size} valores distintos`);

  ok(costos.length === motor.completedInstances,
    'y hay una muestra por caso completado (ni mas ni menos)',
    `${costos.length} vs ${motor.completedInstances} completadas`);

  // LA PROPIEDAD QUE LO HACE AUDITABLE: la suma de los costos por caso es el costo total.
  // Si no cuadrara, el percentil del informe seria de una magnitud distinta a la que el
  // propio informe ensena como «costo».
  const sumaPorCaso = costos.reduce((a, b) => a + b, 0);
  const costoTotal = (r.totalCost || 0);
  ok(Math.abs(sumaPorCaso - costoTotal) < Math.max(0.5, costoTotal * 0.001),
    'la suma de los costos por caso CUADRA con el costo total de la tarea',
    `por caso ${sumaPorCaso.toFixed(2)} vs total ${costoTotal.toFixed(2)}`);

  // Todos positivos: un caso no puede costar menos de cero. Un negativo significaria que el
  // acumulador esta restando algo -por ejemplo el costo de espera, que se acumula aparte.
  ok(costos.every((c) => c >= 0), 'y ningun caso tiene costo negativo');
  ok(costos.every((c) => Number.isFinite(c)), 'ni NaN: todos los importes son medibles');

  // El acumulador VIVO se vacia al cerrar el caso: si no, un `instanceId` reutilizado
  // heredaria el importe del anterior y el percentil saldria inflado.
  ok(motor._costoPorCaso.size === 0,
    'y el acumulador en curso queda VACIO al terminar (nada de importes heredados)',
    String(motor._costoPorCaso.size));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
