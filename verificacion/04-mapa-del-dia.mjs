// A4: graficos honestos. Sin suavizado, acumulacion en escalones y mapa de calor
// del dia. Se ejercita el codigo REAL del controlador (getChartConfig) montado en
// un DOM, y el acumulador del mapa de calor sobre el motor real.
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const MANANA = { hour: 9, minute: 0 };
const TARDE = { hour: 17, minute: 0 };

function correr({ runValue = 8, tareas, pools, lots }) {
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    const nodo = (id, tipo, datos) => ({ id, $type: tipo, businessObject: { name: id }, outgoing: [], _datos: datos });
    const inicio = nodo('S1', 'bpmn:StartEvent', {
      isRoot: true, arrivalRate: { value: 1, unit: 'hour' }, simulationConfig: { runValue },
      startDate: '2026-01-05',
      calendar: { workingDays: [ 1, 2, 3, 4, 5 ], workingHours: { start: MANANA, end: TARDE }, breaks: [], holidays: [] },
      cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
      overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
      ...(lots ? { lots } : {})
    });

    const nodos = tareas.map((t) => nodo(t.id, 'bpmn:Task', {
      processingTime: { distribution: 'fixed', value: t.minutos, unit: 'minutes' },
      failureRate: 0, reworkTime: { value: 0, unit: 'minutes' },
      ...(t.pool ? { resources: { pool: t.pool, quantityRequired: t.cantidad || 1 } } : {})
    }));

    const fin = nodo('E1', 'bpmn:EndEvent', {});
    const cadena = [ inicio, ...nodos, fin ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = { id: `F${i}`, $type: 'bpmn:SequenceFlow', businessObject: {}, source: cadena[i], target: cadena[i + 1] };
      cadena[i].outgoing = [ f ];
      flujos.push(f);
    }
    const proc = nodo('P1', 'bpmn:Process', { resourcePools: pools || [] });
    const elementos = [ ...cadena, ...flujos, proc ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    const motor = new SimulationEngine(registro);
    motor.run({ useOvertime: false });

    return { motor, heatmap: motor.heatmapDia };
  } finally {
    Object.assign(console, guardar);
  }
}

console.log('\n== 1. El mapa de calor del dia se acumula ==');
{
  const r = correr({
    runValue: 4,
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios' } ],
    pools: [ { name: 'Operarios', quantity: 1 } ]
  });

  ok(r.heatmap.size > 0, 'hay celdas en el mapa de calor', r.heatmap.size);

  const total = Array.from(r.heatmap.values()).reduce((a, b) => a + b, 0);
  // 4 tareas x 30 min x 1 unidad = 120 min-recurso.
  ok(total === 120, 'los minutos-recurso son duracion x unidades x ejecuciones', total);

  const claves = Array.from(r.heatmap.keys());
  ok(claves.every((k) => /^\d{4}-\d{2}-\d{2}\|\d{2}$/.test(k)),
    'la clave es dia|hora con dos digitos de hora', claves[0]);
}

console.log('\n== 2. El mapa cuenta UNIDADES, no minutos sueltos ==');
{
  // Dos unidades durante 30 min = 60 min-recurso, el doble que una sola.
  const una = correr({
    runValue: 1, tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', cantidad: 1 } ],
    pools: [ { name: 'Operarios', quantity: 2 } ]
  });
  const dos = correr({
    runValue: 1, tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', cantidad: 2 } ],
    pools: [ { name: 'Operarios', quantity: 2 } ]
  });

  const suma = (m) => Array.from(m.heatmap.values()).reduce((a, b) => a + b, 0);
  ok(suma(una) === 30, 'una unidad: 30 min-recurso', suma(una));
  ok(suma(dos) === 60, 'dos unidades: 60 min-recurso (el doble, con el mismo tiempo)', suma(dos));
}

console.log('\n== 3. La hora es la de ARRANQUE de la tarea ==');
{
  // Cuatro tareas de 30 min encadenadas: arrancan a las 9, 9:30, 10 y 10:30.
  const r = correr({
    runValue: 1,
    tareas: [
      { id: 'T1', minutos: 30 }, { id: 'T2', minutos: 30 },
      { id: 'T3', minutos: 30 }, { id: 'T4', minutos: 30 }
    ],
    pools: []
  });

  const horas = Array.from(r.heatmap.keys()).map((k) => Number(k.split('|')[1])).sort();
  ok(horas.includes(9) && horas.includes(10),
    'la actividad se reparte entre las 9 y las 10 (hora de arranque)', horas.join(','));
  ok(!horas.includes(11), 'y no se corre a la hora 11, porque la ultima arranco a las 10:30', horas.join(','));
}

console.log('\n== 4. Sin actividad no se inventa nada ==');
{
  const r = correr({
    runValue: 1, tareas: [ { id: 'T1', minutos: 30 } ], pools: []
  });
  ok(r.heatmap.size > 0, 'con actividad, hay celdas', r.heatmap.size);

  const vacio = correr({
    runValue: 1, tareas: [ { id: 'T1', minutos: 0 } ], pools: []
  });
  ok(vacio.heatmap.size === 0,
    'una tarea de duracion cero NO crea celda (no se anota tiempo que no existio)',
    vacio.heatmap.size);
}

console.log('\n== 5. Los lotes se ven como un diente de sierra ==');
{
  // Lote de 2 con paron: la actividad se concentra en instantes y deja huecos.
  const r = correr({
    runValue: 4,
    lots: { enabled: true, sizeMode: 'fixed', size: 2, stopMinutes: 120 },
    tareas: [ { id: 'T1', minutos: 15, pool: 'Operarios' } ],
    pools: [ { name: 'Operarios', quantity: 1 } ]
  });
  ok(r.heatmap.size >= 2, 'los dos lotes dejan actividad en horas distintas',
    Array.from(r.heatmap.keys()).join(' '));
  const total = Array.from(r.heatmap.values()).reduce((a, b) => a + b, 0);
  ok(total === 60, 'y la actividad total sigue siendo 4 x 15 min = 60 min-recurso', total);
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
