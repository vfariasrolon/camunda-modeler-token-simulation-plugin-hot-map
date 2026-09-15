// A5: carga fisica (masa cargada / arrastrada), miembros con nombre, habilidades
// que bloquean, reparto en ronda y tarifa por persona. Motor REAL.
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const MANANA = { hour: 9, minute: 0 };
const TARDE = { hour: 17, minute: 0 };
const tres = (n) => Number(n.toFixed(3));

function correr({ runValue = 4, tareas, pools, lots, labor, cost, overtime }) {
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: {
        isRoot: true,
        arrivalRate: { value: 1, unit: 'hour' },
        simulationConfig: { runValue },
        startDate: '2026-01-05',
        calendar: { workingDays: [ 1, 2, 3, 4, 5 ], workingHours: { start: MANANA, end: TARDE }, breaks: [], holidays: [] },
        cost: { baseRatePerHour: 100, waitCostPerHour: 0, ...(cost || {}) },
        overtime: overtime || { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        ...(labor ? { labor } : {}),
        ...(lots ? { lots } : {})
      }
    };

    const nodos = tareas.map((t) => ({
      id: t.id, $type: 'bpmn:Task', businessObject: { name: t.id }, outgoing: [],
      _datos: {
        processingTime: { distribution: 'fixed', value: t.minutos, unit: 'minutes' },
        failureRate: 0,
        reworkTime: { value: 0, unit: 'minutes' },
        ...(t.pool ? { resources: { pool: t.pool, quantityRequired: t.cantidad || 1 } } : {}),
        ...(t.carga ? { carga: t.carga } : {}),
        ...(t.habilidad ? { habilidad: t.habilidad } : {}),
        ...(t.habilidades ? { habilidades: t.habilidades } : {}),
        ...(t.frequency ? { frequency: t.frequency } : {}),
        ...(t.barrier ? { barrier: t.barrier } : {})
      }
    }));

    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    const cadena = [ inicio, ...nodos, fin ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = { id: `F${i + 1}`, $type: 'bpmn:SequenceFlow', businessObject: {}, source: cadena[i], target: cadena[i + 1] };
      flujos.push(f);
      cadena[i].outgoing = [ f ];
    }

    const proceso = {
      id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' },
      _datos: { resourcePools: pools || [] }
    };

    const elementos = [ ...cadena, ...flujos, proceso ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    const motor = new SimulationEngine(registro);
    const resultados = motor.run({ useOvertime: false });
    const suma = (campo) => Array.from(resultados.values()).reduce((a, r) => a + (r[campo] || 0), 0);

    return {
      motor, resultados,
      carga: motor.carga,
      operatividad: motor.operatividad,
      completadas: motor.completedInstances,
      fin: new Date(motor.clock),
      costoTotal: suma('totalCost'),
      operacion: suma('totalOperationCost'),
      veces: (id) => (resultados.get(id) || {}).executionCount || 0
    };
  } finally {
    Object.assign(console, guardar);
  }
}

const POOL_SIMPLE = [ { name: 'Operarios', quantity: 2 } ];
const TAREA = (extra) => [ { id: 'T1', minutos: 60, pool: 'Operarios', ...extra } ];

console.log('\n== 1. Sin miembros, todo como antes (compatibilidad) ==');
{
  const r = correr({ runValue: 4, tareas: TAREA({ carga: { masaCargadaKg: 10, distanciaM: 5 } }), pools: POOL_SIMPLE });
  ok(r.completadas === 4, 'sin miembros se siguen completando las instancias', String(r.completadas));
  ok(r.carga.area.cargadaKg === 40, 'y la carga se acumula en el AREA (4 x 10 kg)', r.carga.area.cargadaKg);
  ok(r.carga.porPersona.get('Operarios').cargadaKg === 40,
    'y tambien por PISCINA, porque no hay nombres a quien atribuirla',
    r.carga.porPersona.get('Operarios').cargadaKg);
  ok(r.carga.porMiembro.size === 0, 'sin nombres no hay nada por persona');
  ok(tres(r.carga.area.cargadaKgM) === 200, 'y los kg·m salen de masa x distancia (40 x 5)', tres(r.carga.area.cargadaKgM));
}

console.log('\n== 2. Dos series que NUNCA se suman ==');
{
  const r = correr({
    runValue: 2,
    tareas: TAREA({ carga: { masaCargadaKg: 10, masaArrastradaKg: 100, distanciaM: 4 } }),
    pools: POOL_SIMPLE
  });
  ok(r.carga.area.cargadaKg === 20 && r.carga.area.arrastradaKg === 200,
    'cargada y arrastrada se acumulan por separado', `${r.carga.area.cargadaKg} / ${r.carga.area.arrastradaKg}`);
  ok(r.carga.area.cargadaKgM === 80 && r.carga.area.arrastradaKgM === 800,
    'y sus kg·m tambien', `${r.carga.area.cargadaKgM} / ${r.carga.area.arrastradaKgM}`);
  ok(!('totalKg' in r.carga.area), 'NO existe ningun total que las sume');
}

console.log('\n== 3. El peso va por FRECUENCIA, no por token ==');
{
  // Lote de 5, tarea "por lote": mueve su masa UNA vez por lote. Con 20 piezas
  // son 4 lotes -> 4 veces el peso, no 20.
  const porLote = correr({
    runValue: 20,
    lots: { enabled: true, sizeMode: 'fixed', size: 5 },
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', frecuencia: 'lot', carga: { masaCargadaKg: 10, distanciaM: 2 } } ],
    pools: POOL_SIMPLE
  });
  void 0;
  const lotes = correr({
    runValue: 20,
    lots: { enabled: true, sizeMode: 'fixed', size: 5 },
    tareas: [ { id: 'T1', minutos: 30, frequency: 'lot', carga: { masaCargadaKg: 10, distanciaM: 2 } } ],
    pools: POOL_SIMPLE
  });
  ok(lotes.carga.area.cargadaKg === 40,
    'tarea por lote: 4 lotes x 10 kg = 40 kg (NO 20 x 10 = 200)',
    lotes.carga.area.cargadaKg);
  void porLote;

  // La misma tarea "por token" en modo lotes sigue moviendo por pieza.
  const porToken = correr({
    runValue: 20,
    lots: { enabled: true, sizeMode: 'fixed', size: 5 },
    tareas: [ { id: 'T1', minutos: 30, carga: { masaCargadaKg: 10, distanciaM: 2 } } ],
    pools: POOL_SIMPLE
  });
  ok(porToken.carga.area.cargadaKg === 200,
    'y por token mueve 20 x 10 = 200 kg', porToken.carga.area.cargadaKg);
}

console.log('\n== 4. Miembros con nombre: reparto en RONDA ==');
{
  const r = correr({
    runValue: 4,
    tareas: TAREA({ carga: { masaCargadaKg: 10, distanciaM: 3 } }),
    pools: [ { name: 'Operarios', quantity: 2, members: [ { nombre: 'Ana' }, { nombre: 'Luis' } ] } ]
  });
  ok(r.carga.porMiembro.size === 2, 'la carga se atribuye a las dos personas', r.carga.porMiembro.size);
  ok(r.carga.porMiembro.get('Ana').cargadaKg === 20 && r.carga.porMiembro.get('Luis').cargadaKg === 20,
    'y se REPARTE por igual (4 tareas -> 2 y 2), no las carga una sola persona',
    `Ana ${r.carga.porMiembro.get('Ana').cargadaKg} / Luis ${r.carga.porMiembro.get('Luis').cargadaKg}`);
  ok(r.carga.porMiembro.get('Ana').cargadaKgM === 60, 'con sus kg·m', r.carga.porMiembro.get('Ana').cargadaKgM);
}

console.log('\n== 5. Tarifa por persona, con la de planta de respaldo ==');
{
  const base = correr({ runValue: 2, tareas: TAREA({}), pools: POOL_SIMPLE });
  ok(base.operacion === 200, 'sin tarifa por persona: 2 h x $100 = $200', base.operacion);

  const conTarifa = correr({
    runValue: 2, tareas: TAREA({}),
    pools: [ { name: 'Operarios', quantity: 2, members: [ { nombre: 'Ana', tarifaHora: 50 }, { nombre: 'Luis', tarifaHora: 200 } ] } ]
  });
  // 2 tareas: una a Ana ($50) y otra a Luis ($200), 1 h cada una.
  ok(conTarifa.operacion === 250,
    'con tarifas por persona: $50 + $200 = $250 (una tarea a cada una)',
    conTarifa.operacion);

  const mezcla = correr({
    runValue: 2, tareas: TAREA({}),
    pools: [ { name: 'Operarios', quantity: 2, members: [ { nombre: 'Ana', tarifaHora: 50 }, { nombre: 'Luis' } ] } ]
  });
  ok(mezcla.operacion === 150,
    'y quien no tiene tarifa usa la de la planta: $50 + $100 = $150',
    mezcla.operacion);
}

console.log('\n== 6. Las habilidades BLOQUEAN de verdad ==');
{
  const r = correr({
    runValue: 3,
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', habilidad: 'soldadura' } ],
    pools: [ { name: 'Operarios', quantity: 2, members: [ { nombre: 'Ana', habilidades: [ 'pintura' ] } ] } ]
  });
  ok(r.completadas === 0, 'si nadie tiene la habilidad, no se completa ninguna instancia', String(r.completadas));
  ok(r.operatividad.tareasBloqueadas > 0, 'y se cuentan las tareas bloqueadas', r.operatividad.tareasBloqueadas);
  ok((r.resultados.get('T1') || {}).totalBlockedBySkill > 0, 'con constancia en el resultado de la tarea',
    (r.resultados.get('T1') || {}).totalBlockedBySkill);

  // Con alguien que SI la tiene, la tarea avanza.
  const conExperto = correr({
    runValue: 3,
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', habilidad: 'soldadura' } ],
    pools: [ { name: 'Operarios', quantity: 2, members: [
      { nombre: 'Ana', habilidades: [ 'soldadura' ] },
      { nombre: 'Luis', habilidades: [ 'pintura' ] }
    ] } ]
  });
  ok(conExperto.completadas === 3, 'con alguien que la tiene, se completa todo', String(conExperto.completadas));
  ok(conExperto.carga.porMiembro.get('Luis') == null || conExperto.carga.porMiembro.get('Luis').ejecuciones === 0,
    'y Luis (sin la habilidad) no trabajo en esa tarea');
}

console.log('\n== 7. Varias habilidades exigidas (lista) ==');
{
  const r = correr({
    runValue: 2,
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', habilidades: [ 'soldadura', 'pintura' ] } ],
    pools: [ { name: 'Operarios', quantity: 2, members: [
      { nombre: 'Ana', habilidades: [ 'soldadura' ] },
      { nombre: 'Luis', habilidades: [ 'soldadura', 'pintura' ] }
    ] } ]
  });
  ok(r.completadas === 2, 'con una persona que tiene las DOS, la tarea avanza', String(r.completadas));
  ok(r.carga.porMiembro.get('Ana') == null || r.carga.porMiembro.get('Ana').ejecuciones === 0,
    'y solo la hizo quien tiene las dos');

  const nadie = correr({
    runValue: 2,
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios', habilidades: [ 'soldadura', 'pintura' ] } ],
    pools: [ { name: 'Operarios', quantity: 2, members: [
      { nombre: 'Ana', habilidades: [ 'soldadura' ] },
      { nombre: 'Luis', habilidades: [ 'pintura' ] }
    ] } ]
  });
  ok(nadie.completadas === 0, 'si las tienen repartidas pero nadie las dos, se bloquea', String(nadie.completadas));
}

console.log('\n== 8. Sin exigencia de habilidad, nadie se bloquea ==');
{
  const r = correr({
    runValue: 3,
    tareas: [ { id: 'T1', minutos: 30, pool: 'Operarios' } ],
    pools: [ { name: 'Operarios', quantity: 2, members: [ { nombre: 'Ana' } ] } ]
  });
  ok(r.completadas === 3, 'una tarea sin habilidad exigida no se bloquea nunca', String(r.completadas));
  ok(r.operatividad.tareasBloqueadas === 0, 'y no se anota ningun bloqueo');
}

console.log('\n== 9. Compatibilidad: sin carga declarada, todo igual ==');
{
  const r = correr({ runValue: 4, tareas: TAREA({}), pools: POOL_SIMPLE });
  // Las ejecuciones SI se cuentan aunque no haya masa: es lo que permite decir
  // «hubo 4 ejecuciones y ninguna declara carga» en vez de «no hay tareas».
  ok(r.carga.area.ejecuciones === 4, 'sin carga, las ejecuciones se cuentan igual', r.carga.area.ejecuciones);
  ok(r.carga.area.cargadaKg === 0 && r.carga.area.arrastradaKg === 0, 'pero no hay masa');
  ok(r.carga.porTarea.size === 0, 'y no se crea entrada por tarea para tareas sin carga',
    r.carga.porTarea.size);
  ok(r.completadas === 4, 'y la simulacion es la de siempre', String(r.completadas));
}

console.log('\n== 10. Operatividad: activo + tres ociosidades = jornada ==');
{
  // Dos personas en una piscina, con trabajo de sobra: el resto de su jornada es
  // «sin trabajo». Es la comprobacion que hace util el grafico: no puede quedar
  // un resto sin explicar.
  const r = correr({
    runValue: 4,
    tareas: [ { id: 'T1', minutos: 60, pool: 'Operarios' } ],
    pools: [ { name: 'Operarios', quantity: 2, members: [ { nombre: 'Ana' }, { nombre: 'Luis' } ] } ]
  });

  const filas = r.operatividad.porMiembro;
  ok(filas.length === 2, 'hay una fila por persona', filas.length);
  ok(r.operatividad.ventanaMin > 0, 'y se sabe la jornada disponible', r.operatividad.ventanaMin);

  filas.forEach((p) => {
    const suma = p.activoMin + p.sinTrabajoMin + p.esperandoFirmaMin + p.bloqueadoPorHabilidadMin;
    ok(Math.abs(suma - p.disponibleMin) < 0.02,
      `${p.nombre}: activo + sin trabajo + firma + bloqueo = jornada`,
      `${tres(suma)} vs ${tres(p.disponibleMin)}`);
    ok(p.sinTrabajoMin >= 0, `${p.nombre}: «sin trabajo» no sale negativo`, tres(p.sinTrabajoMin));
    ok(Math.abs(p.ocupacion - p.activoMin / p.disponibleMin) < 1e-9,
      `${p.nombre}: la ocupación es activo / disponible`, tres(p.ocupacion));
  });

  // 4 tareas de 1 h repartidas entre 2 personas = 2 h cada una.
  const ana = filas.find((p) => p.nombre === 'Ana');
  const luis = filas.find((p) => p.nombre === 'Luis');
  ok(tres(ana.activoMin) === 120 && tres(luis.activoMin) === 120,
    'el trabajo se reparte: 2 h cada una', `${tres(ana.activoMin)} / ${tres(luis.activoMin)}`);
  ok(ana.ocupacion <= 0.5, 'y quedan ociosas la otra mitad de la jornada', tres(ana.ocupacion));

  ok(r.operatividad.noCalculado && r.operatividad.noCalculado.length,
    'se declara lo que NO se calcula, en vez de dejarlo a cero',
    (r.operatividad.noCalculado || []).join('; '));
}

console.log('\n== 11. Operatividad: el bloqueo por habilidad tiene minutos ==');
{
  // Antes el acumulador leia un campo que no existia, asi que siempre valia 0.
  const r = correr({
    runValue: 2,
    tareas: [ { id: 'T1', minutos: 45, pool: 'Operarios', habilidad: 'soldadura' } ],
    pools: [ { name: 'Operarios', quantity: 1, members: [ { nombre: 'Ana', habilidades: [ 'pintura' ] } ] } ]
  });
  ok(r.operatividad.tareasBloqueadas === 2, 'las dos instancias quedan bloqueadas',
    r.operatividad.tareasBloqueadas);
  ok(r.operatividad.bloqueadoPorHabilidadMin > 0,
    'y el bloqueo ACUMULA MINUTOS (antes siempre eran 0)',
    tres(r.operatividad.bloqueadoPorHabilidadMin));
  ok(tres(r.operatividad.bloqueadoPorHabilidadMin) === 90,
    'los minutos son la duracion que habria ocupado (2 x 45 min)',
    tres(r.operatividad.bloqueadoPorHabilidadMin));
  ok((r.resultados.get('T1') || {}).totalBlockedMinutes > 0,
    'y queda por tarea tambien',
    tres((r.resultados.get('T1') || {}).totalBlockedMinutes));

  const ana = r.operatividad.porMiembro[0];
  ok(ana.bloqueadoPorHabilidadMin > 0,
    'la persona que habria podido hacerla si supiera lo tiene en su jornada',
    tres(ana.bloqueadoPorHabilidadMin));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
