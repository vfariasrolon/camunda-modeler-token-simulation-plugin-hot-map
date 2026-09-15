// A3: lotes en serie por traccion, paron de cambio, semilla y tareas por lote
// con barrera. Motor REAL.
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle ? '  ->  ' + detalle : ''}`);
  if (!cond) fallos++;
};

const MANANA = { hour: 9, minute: 0 };
const TARDE = { hour: 17, minute: 0 };

function correr({ runValue, lots, tareas, seed, breaks = [], motor: motorReusado }) {
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    // tareas: [{ id, minutos, frequency, barrier }] encadenadas en serie.
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: {
        isRoot: true,
        arrivalRate: { value: 1, unit: 'hour' },
        simulationConfig: { runValue },
        startDate: '2026-01-05',
        calendar: {
          workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: MANANA, end: TARDE },
          breaks
        },
        cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
        overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        seed,
        lots
      }
    };

    const nodos = tareas.map((t) => ({
      id: t.id, $type: 'bpmn:Task', businessObject: { name: t.id }, outgoing: [],
      _datos: {
        processingTime: { distribution: 'fixed', value: t.minutos, unit: 'minutes' },
        failureRate: 0,
        reworkTime: { value: 0, unit: 'minutes' },
        ...(t.frequency ? { frequency: t.frequency } : {}),
        ...(t.barrier ? { barrier: t.barrier } : {})
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

    const elementos = [ ...cadena, ...flujos ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    const motor = motorReusado || new SimulationEngine(registro);
    const resultados = motor.run({ useOvertime: false });

    return {
      motor,
      resultados,
      lotes: motor.lots,
      stats: motor.lotStats,
      seed: motor.seed,
      completadas: motor.completedInstances,
      fin: new Date(motor.clock),
      min: (id) => ((resultados.get(id) || {}).totalProcessingTime || 0) / 60000,
      veces: (id) => (resultados.get(id) || {}).executionCount || 0
    };
  } finally {
    Object.assign(console, guardar);
  }
}

const ISO = (d) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const DOS_TAREAS = [ { id: 'T1', minutos: 60 }, { id: 'T2', minutos: 60 } ];

console.log('\n== 1. Lotes en serie por traccion ==');
{
  const r = correr({ runValue: 8, lots: { enabled: true, sizeMode: 'fixed', size: 4 }, tareas: DOS_TAREAS });
  console.log(`  lotes: ${r.lotes.length} | tamanos [${r.lotes.map((l) => l.size).join(', ')}] | completadas ${r.completadas}`);
  r.lotes.forEach((l) => console.log(`    lote ${l.number}: ${l.size} piezas, ${ISO(new Date(l.startTime))} -> ${ISO(new Date(l.endTime))}`));

  ok(r.completadas === 8, 'se completan las 8 instancias', String(r.completadas));
  ok(r.lotes.length === 2, '4 piezas por lote -> 2 lotes', String(r.lotes.length));
  ok(r.lotes.every((l) => l.size === 4), 'cada lote tiene 4 piezas');
  ok(r.stats.lots === 2, 'el resumen cuenta 2 lotes', String(r.stats.lots));

  const enSerie = r.lotes.every((l, i) => i === 0 || l.startTime >= r.lotes[i - 1].endTime);
  ok(enSerie, 'NO hay dos lotes a la vez: cada uno arranca al cerrar el anterior');

  const sinCola = r.lotes[1].startTime === r.lotes[0].endTime;
  ok(sinCola, 'sin paron declarado, el siguiente arranca en el mismo instante', ISO(new Date(r.lotes[1].startTime)));
}

console.log('\n== 2. El paron de cambio se mide ==');
{
  const r = correr({
    runValue: 8,
    lots: { enabled: true, sizeMode: 'fixed', size: 4, stopMinutes: 30 },
    tareas: DOS_TAREAS
  });
  console.log(`  parones: ${r.stats.stops} | minutos de paron: ${r.stats.stopMinutes}`);
  ok(r.stats.stops === 1, 'con 2 lotes hay 1 paron (entre ellos)', String(r.stats.stops));
  ok(r.stats.stopMinutes === 30, 'el paron dura los 30 min declarados', String(r.stats.stopMinutes));
  ok(r.lotes[1].startTime > r.lotes[0].endTime, 'el segundo lote arranca DESPUES del paron',
    `${ISO(new Date(r.lotes[1].startTime))} > ${ISO(new Date(r.lotes[0].endTime))}`);
  ok(r.lotes[1].startTime - r.lotes[0].endTime === 30 * 60000, 'la diferencia son exactamente 30 min',
    String((r.lotes[1].startTime - r.lotes[0].endTime) / 60000));
}

console.log('\n== 3. El ultimo lote se recorta al objetivo ==');
{
  const r = correr({ runValue: 10, lots: { enabled: true, sizeMode: 'fixed', size: 4 }, tareas: DOS_TAREAS });
  console.log(`  tamanos: [${r.lotes.map((l) => l.size).join(', ')}]`);
  ok(r.lotes.length === 3, '10 piezas con lotes de 4 -> 3 lotes', String(r.lotes.length));
  ok(r.lotes.map((l) => l.size).join(',') === '4,4,2', 'el ultimo lote es parcial (4,4,2)');
  ok(r.completadas === 10, 'se completan las 10', String(r.completadas));
}

console.log('\n== 4. Tamano de lote variable y semilla ==');
{
  const lotsTri = { enabled: true, sizeMode: 'triangular', min: 5, mode: 10, max: 20, size: 10 };

  const a = correr({ runValue: 60, lots: lotsTri, tareas: DOS_TAREAS, seed: 12345 });
  const b = correr({ runValue: 60, lots: lotsTri, tareas: DOS_TAREAS, seed: 12345 });
  const c = correr({ runValue: 60, lots: lotsTri, tareas: DOS_TAREAS, seed: 999 });

  const tam = (r) => r.lotes.map((l) => l.size).join(',');
  console.log(`  semilla 12345: [${tam(a)}]`);
  console.log(`  semilla   999: [${tam(c)}]`);

  ok(a.seed === 12345, 'la semilla declarada se respeta', String(a.seed));
  ok(tam(a) === tam(b), 'MISMA semilla -> mismos tamanos de lote (reproducible)');
  ok(a.fin.getTime() === b.fin.getTime(), 'y termina en el mismo instante', ISO(a.fin));
  ok(tam(a) !== tam(c), 'semilla distinta -> secuencia distinta', `${tam(a)} vs ${tam(c)}`);

  const enRango = a.lotes.every((l) => l.size >= 5 && l.size <= 20);
  ok(enRango, 'todos los tamanos caen en [5, 20]', tam(a));

  // Sin semilla declarada, el motor guarda la que uso.
  const libre = correr({ runValue: 20, lots: lotsTri, tareas: DOS_TAREAS });
  ok(Number.isFinite(libre.seed) && libre.seed > 0, 'sin semilla declarada se usa una del reloj, que queda guardada',
    String(libre.seed));
}

console.log('\n== 5. Tamano empirico (tabla de frecuencias) ==');
{
  const r = correr({
    runValue: 200,
    lots: { enabled: true, sizeMode: 'empirical', table: [ { size: 5, weight: 1 }, { size: 40, weight: 1 } ] },
    tareas: DOS_TAREAS,
    seed: 4242
  });
  const tamanos = r.lotes.map((l) => l.size);
  const completos = tamanos.slice(0, -1); const soloValidos = completos.every((t) => t === 5 || t === 40);
  const hayDeLosDos = tamanos.includes(5) && tamanos.includes(40);
  console.log(`  ${tamanos.length} lotes, tamanos usados: ${[ ...new Set(tamanos) ].join(', ')}`);
  ok(soloValidos, 'solo salen los tamanos de la tabla');
  ok(hayDeLosDos, 'con 200 piezas salen los dos tamanos', tamanos.slice(0, 12).join(','));
}

console.log('\n== 6. Tarea POR LOTE: una vez por lote, no por pieza ==');
{
  const tareas = [ { id: 'T1', minutos: 30, frequency: 'lot' }, { id: 'T2', minutos: 60 } ];
  const r = correr({ runValue: 5, lots: { enabled: true, sizeMode: 'fixed', size: 5 }, tareas });
  console.log(`  T1 (por lote): ${r.veces('T1')} ejecucion(es), ${r.min('T1')} min | T2 (por token): ${r.veces('T2')} ejecuciones, ${r.min('T2')} min`);
  ok(r.veces('T1') === 1, 'la tarea por lote se ejecuta UNA vez en un lote de 5', String(r.veces('T1')));
  ok(r.min('T1') === 30, 'y su tiempo es 30 min, no 5 x 30 = 150', `${r.min('T1')} min`);
  ok(r.veces('T2') === 5, 'la tarea normal si se ejecuta las 5 veces', String(r.veces('T2')));
  ok(r.min('T2') === 300, 'y suma 5 x 60 = 300 min', `${r.min('T2')} min`);
  ok(r.stats.perLotTaskExecutions === 1, 'el resumen cuenta 1 ejecucion por lote', String(r.stats.perLotTaskExecutions));

  // Con dos lotes, dos ejecuciones.
  const r2 = correr({ runValue: 10, lots: { enabled: true, sizeMode: 'fixed', size: 5 }, tareas });
  console.log(`  con 2 lotes: T1 ${r2.veces('T1')} ejecuciones, ${r2.min('T1')} min`);
  ok(r2.veces('T1') === 2 && r2.min('T1') === 60, 'con 2 lotes: 2 ejecuciones y 60 min',
    `${r2.veces('T1')} / ${r2.min('T1')} min`);
}

console.log('\n== 7. La barrera: el lote entero espera la firma ==');
{
  const conBarrera = { availableProbability: 0, waitMin: 20, waitMode: 30, waitMax: 40, toleranceMinutes: 25 };
  const tareas = [ { id: 'T1', minutos: 30, frequency: 'lot', barrier: conBarrera }, { id: 'T2', minutos: 60 } ];

  const r = correr({ runValue: 10, lots: { enabled: true, sizeMode: 'fixed', size: 5 }, tareas, seed: 7 });
  console.log(`  esperas: ${r.stats.waits} | minutos ${r.stats.waitMinutes} | sobre tolerancia: ${r.stats.waitsOverTolerance}`);

  ok(r.stats.waits === 2, 'con 2 lotes y p=0 hay 2 esperas de firma', String(r.stats.waits));
  ok(r.stats.waitMinutes >= 40 && r.stats.waitMinutes <= 80, 'cada espera cae en [20, 40] min',
    `${r.stats.waitMinutes.toFixed(1)} min para 2 lotes`);
  ok(r.stats.waitsOverTolerance <= r.stats.waits, 'las esperas sobre tolerancia nunca superan el total');

  // Sin barrera, no hay esperas.
  const sinBarrera = correr({ runValue: 10, lots: { enabled: true, sizeMode: 'fixed', size: 5 }, tareas: [ { id: 'T1', minutos: 30, frequency: 'lot' }, { id: 'T2', minutos: 60 } ], seed: 7 });
  ok(sinBarrera.stats.waits === 0, 'sin barrera declarada no hay esperas', String(sinBarrera.stats.waits));

  // p = 1 -> atienden a la primera, sin espera.
  const siempreDisponible = correr({
    runValue: 10, lots: { enabled: true, sizeMode: 'fixed', size: 5 }, seed: 7,
    tareas: [ { id: 'T1', minutos: 30, frequency: 'lot', barrier: { ...conBarrera, availableProbability: 1 } }, { id: 'T2', minutos: 60 } ]
  });
  ok(siempreDisponible.stats.waits === 0, 'con disponibilidad del 100 % no hay espera', String(siempreDisponible.stats.waits));

  // La espera alarga el lote.
  ok(r.fin.getTime() > sinBarrera.fin.getTime(), 'la espera de firma RETRASA el cierre',
    `${ISO(r.fin)} > ${ISO(sinBarrera.fin)}`);
  ok(r.completadas === 10 && sinBarrera.completadas === 10, 'y no se pierde ninguna pieza');
}

console.log('\n== 8. Compatibilidad: sin lotes, todo igual ==');
{
  const r = correr({ runValue: 8, lots: { enabled: false }, tareas: DOS_TAREAS });
  ok(r.lotes.length === 0, 'sin lotes no se registra ningun lote', String(r.lotes.length));
  ok(r.completadas === 8, 'y se completan las 8 por llegadas individuales', String(r.completadas));
  ok(r.veces('T1') === 8, 'cada tarea se ejecuta una vez por instancia', String(r.veces('T1')));

  // Y una tarea marcada "por lote" sin lotes se comporta como normal.
  const r2 = correr({ runValue: 8, lots: { enabled: false }, tareas: [ { id: 'T1', minutos: 30, frequency: 'lot' }, { id: 'T2', minutos: 60 } ] });
  ok(r2.veces('T1') === 8, 'sin lotes, una tarea "por lote" se ejecuta por instancia', String(r2.veces('T1')));
}

console.log('\n== 9. UNA corrida, UNA semilla ==');
{
  // El controlador corre DOS pasadas (normal y con horas extra) sobre el MISMO
  // motor. Con la semilla vacia, las dos tienen que compartir el mismo azar: si
  // cada pasada sacara una semilla del reloj, la comparacion entre planes
  // mezclaria el efecto del plan con el de la suerte (y el informe imprimiria
  // dos semillas distintas para una sola corrida).
  const tareas = [ { id: 'T1', minutos: 30, frequency: 'lot' }, { id: 'T2', minutos: 45 } ];
  const lots = { enabled: true, sizeMode: 'fixed', size: 4 };

  const primera = correr({ runValue: 4, lots, tareas });
  const segunda = correr({ runValue: 4, lots, tareas, motor: primera.motor });
  ok(segunda.motor.seed === primera.motor.seed,
    'las dos pasadas de una corrida comparten semilla',
    `${primera.motor.seed} vs ${segunda.motor.seed}`);

  segunda.motor.nuevaCorrida();
  ok(segunda.motor._semillaDeLaCorrida === null,
    'nuevaCorrida() olvida la semilla, asi que la siguiente pulsacion saca otra');

  // Con semilla declarada, ni la corrida siguiente la cambia.
  const d1 = correr({ runValue: 4, lots, tareas, seed: 4242 });
  const d2 = correr({ runValue: 4, lots, tareas, seed: 4242, motor: d1.motor });
  d1.motor.nuevaCorrida();
  const d3 = correr({ runValue: 4, lots, tareas, seed: 4242, motor: d1.motor });
  ok(d1.motor.seed === 4242 && d2.motor.seed === 4242 && d3.motor.seed === 4242,
    'con semilla declarada, todas las pasadas y corridas la respetan',
    `${d1.motor.seed} / ${d2.motor.seed} / ${d3.motor.seed}`);
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
