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
      `${p.nombre}: activo + sin trabajo + firma + bloqueo = tiempo con trabajo pendiente`,
      `${tres(suma)} vs ${tres(p.disponibleMin)}`);
    ok(p.sinTrabajoMin >= 0, `${p.nombre}: «sin trabajo» no sale negativo`, tres(p.sinTrabajoMin));
    ok(Math.abs(p.ocupacion - p.activoMin / p.disponibleMin) < 1e-9,
      `${p.nombre}: la ocupación es activo / disponible`, tres(p.ocupacion));
    // La SEGUNDA lectura: la jornada abierta. Es la que responde a «cuanto del turno
    // se dedico a esto», y la unica que tiene sentido comparar entre escenarios.
    const sumaJornada = p.jornadaSinCargaMin + p.activoMin + p.esperandoFirmaMin + p.bloqueadoPorHabilidadMin;
    ok(Math.abs(sumaJornada - p.ventanaMin) < 0.02,
      `${p.nombre}: jornada sin carga + activo + firma + bloqueo = ventana simulada`,
      `${tres(sumaJornada)} vs ${tres(p.ventanaMin)}`);
  });

  // 4 tareas de 1 h repartidas entre 2 personas = 2 h cada una.
  const ana = filas.find((p) => p.nombre === 'Ana');
  const luis = filas.find((p) => p.nombre === 'Luis');
  ok(tres(ana.activoMin) === 120 && tres(luis.activoMin) === 120,
    'el trabajo se reparte: 2 h cada una', `${tres(ana.activoMin)} / ${tres(luis.activoMin)}`);

  // AQUI ESTABA EL BUG. Con trabajo de sobra, la piscina tuvo demanda todo el tiempo:
  // las dos personas trabajan la mitad cada una porque son DOS, no porque estuvieran
  // ociosas. La ocupacion honesta -activo / tiempo con trabajo pendiente- es 1: no
  // sobro ni un minuto con cola sin atender.
  ok(tres(ana.ocupacion) === 1,
    'con trabajo de sobra la piscina NUNCA estuvo ociosa: ocupacion 1, no 0,5',
    tres(ana.ocupacion));
  // Y la lectura de planta, que es la que antes se confundia con la anterior: del turno
  // abierto, la mitad. Ese 0,5 es real, pero significa «el proceso no da para dos
  // personas a jornada completa», no «Ana estuvo ociosa».
  ok(tres(ana.ocupacionDeJornada) === 0.5,
    'y de la jornada abierta se dedica la mitad (que es otra pregunta)',
    tres(ana.ocupacionDeJornada));

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

console.log('\n== 12. Ociosidad: el denominador es el tiempo CON TRABAJO PENDIENTE ==');
{
  // EL CASO QUE REPORTÓ EL USUARIO: tareas cortas y llegadas espaciadas. Salia «95 % sin
  // trabajo» con la persona habiendo hecho TODO lo que habia que hacer. El trabajo activo
  // estaba bien -30 min exactos-, lo que estaba mal era contra que se comparaba: la ventana
  // simulada entera en vez del rato en que hubo cola.
  const r = correr({
    runValue: 3,
    tareas: [ { id: 'T1', minutos: 10, pool: 'Operarios' } ],
    pools: [ { name: 'Operarios', quantity: 1, members: [ { nombre: 'noel' } ] } ]
  });

  const p = r.operatividad.porMiembro[0];
  ok(tres(p.activoMin) === 30, 'las 3 piezas de 10 min son 30 min de trabajo', tres(p.activoMin));

  // La comprobacion que caza el bug: con UNA sola persona y sin cola, no puede haber
  // ociosidad imputable. El trabajo y el tiempo con trabajo pendiente coinciden.
  ok(tres(p.sinTrabajoMin) === 0,
    'con una persona y sin cola, «sin trabajo» es CERO (no un 77 %)',
    tres(p.sinTrabajoMin));
  ok(tres(p.ocupacion) === 1,
    'y la ocupación es 1: hizo todo lo que había que hacer', tres(p.ocupacion));

  // La otra lectura sigue existiendo y sigue siendo grande, que es lo legitimo: de la
  // jornada simulada, 30 de 130 min. Eso NO es ociosidad de noel, es que el proceso no
  // llena el turno.
  ok(p.jornadaSinCargaMin > 90,
    'y «jornada sin carga» sí es alta: el proceso no llena el turno',
    tres(p.jornadaSinCargaMin));
  ok(tres(p.ocupacionDeJornada) < 0.3,
    'ocupación de jornada por debajo del 30 %', tres(p.ocupacionDeJornada));
  ok(tres(p.jornadaSinCargaMin + p.activoMin) === tres(p.ventanaMin),
    'y las dos lecturas cuadran con la ventana',
    `${tres(p.jornadaSinCargaMin)} + ${tres(p.activoMin)} vs ${tres(p.ventanaMin)}`);
}

console.log('\n== 13. Ociosidad: las propiedades que se cumplen SIEMPRE ==');
{
  // Escenarios distintos, para comprobar las invariantes en varios regimenes de carga en vez
  // de en uno solo -que es como se coló el bug del denominador: el arnes viejo usaba un unico
  // escenario saturado, y en ese caso la ventana entera y la demanda coincidian por
  // casualidad, asi que el resultado parecia correcto-.
  const casos = [
    { nombre: 'carga baja (3 x 10 min)', runValue: 3, minutos: 10 },
    { nombre: 'carga media (5 x 30 min)', runValue: 5, minutos: 30 },
    { nombre: 'carga alta (8 x 30 min)', runValue: 8, minutos: 30 },
    { nombre: 'carga extrema (20 x 45 min)', runValue: 20, minutos: 45 }
  ];

  casos.forEach((c) => {
    const r = correr({
      runValue: c.runValue,
      tareas: [ { id: 'T1', minutos: c.minutos, pool: 'Operarios' } ],
      pools: [ { name: 'Operarios', quantity: 1, members: [ { nombre: 'noel' } ] } ]
    });
    const p = r.operatividad.porMiembro[0];

    // INVARIANTE 1: la demanda incluye todo el trabajo hecho. Es lo que impide que la
    // ociosidad salga negativa y se recorte a cero escondiendo el problema.
    ok(p.disponibleMin >= p.activoMin - 0.02,
      `${c.nombre}: la demanda nunca es menor que el trabajo`,
      `${tres(p.disponibleMin)} vs ${tres(p.activoMin)}`);

    // INVARIANTE 2: la demanda nunca excede la ventana. La piscina no puede tener trabajo
    // pendiente mas tiempo del que la simulacion dura.
    ok(p.disponibleMin <= p.ventanaMin + 0.02,
      `${c.nombre}: la demanda no excede la ventana simulada`,
      `${tres(p.disponibleMin)} vs ${tres(p.ventanaMin)}`);

    // INVARIANTE 3: las dos lecturas cuadran con su denominador.
    ok(Math.abs(p.sinTrabajoMin + p.activoMin - p.disponibleMin) < 0.02,
      `${c.nombre}: activo + sin trabajo = demanda`,
      `${tres(p.activoMin)} + ${tres(p.sinTrabajoMin)} vs ${tres(p.disponibleMin)}`);
    ok(Math.abs(p.jornadaSinCargaMin + p.activoMin - p.ventanaMin) < 0.02,
      `${c.nombre}: activo + jornada sin carga = ventana`,
      `${tres(p.activoMin)} + ${tres(p.jornadaSinCargaMin)} vs ${tres(p.ventanaMin)}`);

    // INVARIANTE 4: la ociosidad de jornada NUNCA es menor que la imputable. Si no hubo
    // trabajo pendiente, la jornada sin carga es todo lo no trabajado; la imputable es cero.
    ok(p.jornadaSinCargaMin >= p.sinTrabajoMin - 0.02,
      `${c.nombre}: la jornada sin carga es mayor o igual que la ociosidad imputable`,
      `${tres(p.jornadaSinCargaMin)} vs ${tres(p.sinTrabajoMin)}`);
  });
}

console.log('\n== 14. La traza por token: la espera se mide y no se cobra dos veces ==');
{
  // DOS fallos que se tapaban uno a otro, y conviene dejar los dos fijados:
  //
  //   1. `waitStart` vivia solo en el marcador de la cola, y `TASK_COMPLETE` no lo llevaba. La
  //      traza por token no podia medir la espera y la dejaba SIEMPRE en cero. Medido con una
  //      piscina saturada antes de arreglarlo: espera 0 y 159 min de «transito», que era la espera
  //      mal atribuida al transporte.
  //   2. Al propagarlo, la guarda del coste por caso -que evitaba cobrar dos veces la espera
  //      cuando `release()` ya la cobro- se activo y el caso dejo de acumularla. Medido: 2320 por
  //      caso frente a 3920 de total.
  //
  // Se corre con llegadas cada 30 min y tareas de 90: la piscina satura y hay cola de verdad.
  const r = correr({
    runValue: 12,
    tareas: [ { id: 'Cortar', minutos: 90, pool: 'Corte' } ],
    pools: [ { name: 'Corte', quantity: 1, members: [ { nombre: 'ana' } ] } ],
    cost: { waitCostPerHour: 60 }
  });

  const filas = r.motor.tiemposPorProceso;
  ok(filas.length === 1, 'hay una fila por proceso', String(filas.length));

  const corte = filas[0];
  ok(corte.tokens > 0, 'y se cuentan los tokens que pasaron', String(corte.tokens));
  // EL FALLO 1: con cola, la espera NO puede ser cero.
  ok(corte.esperaMax > 0,
    'con la piscina saturada la ESPERA se mide (antes daba 0 y todo se iba a «transito»)',
    `max=${tres(corte.esperaMax)} total=${tres(corte.esperaTotalMin)}`);
  ok(corte.esperaTotalMin > 0, 'y la espera acumulada tambien', tres(corte.esperaTotalMin));
  // El primer paso del token no tiene de donde venir.
  ok(corte.transitoMin === null, 'y el primer paso no tiene transito', String(corte.transitoMin));

  // EL FALLO 2: el coste por caso tiene que cuadrar con el total de las tareas.
  // `instanceCosts` es un ARRAY de muestras ya cerradas, no un Map: con `.values()` no existia
  // y la suma daba NaN, que comparado contra el total pasaba por bueno. Y `_costoPorCaso` es el
  // acumulador VIVO, que se borra al cerrar cada caso: leer ese daba siempre 0.
  const porCaso = r.motor.instanceCosts.reduce((a, b) => a + b, 0);
  const totalTareas = Array.from(r.resultados.values())
    .reduce((a, res) => a + (res.totalCost || 0), 0);
  ok(Math.abs(porCaso - totalTareas) < 0.02,
    'y la suma de los costos por caso CUADRA con el total (no se cobra dos veces la espera)',
    `${tres(porCaso)} vs ${tres(totalTareas)}`);
  ok(porCaso > 0, 'con coste de espera declarado, el caso acumula algo', tres(porCaso));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
