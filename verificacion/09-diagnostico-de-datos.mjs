// Diagnostico de datos (DataAudit): inventario, evaluacion por capacidad y el
// agrupado por dato. Codigo REAL, sin copias a mano.
import {
  inventarioDe, evaluarCapacidad, diagnosticar, pendientesPorDato,
  disponibles, CAPACIDADES, ESTADOS
} from './DataAudit.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const tarea = (datos) => ({ id: 'T1', nombre: 'T', datos });
const pool = (members, quantity = 1) => ({ name: 'P', quantity, members });
const raiz = (extra) => ({ isRoot: true, calendar: { workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } } }, cost: { baseRatePerHour: 50 }, ...extra });

const VACIO = { tareas: [], flujos: [], pools: [], root: null };

console.log('\n== 1. Modelo vacio: nada se puede medir ==');
{
  const diag = diagnosticar(inventarioDe(VACIO));
  ok(diag.recuento.listo === 0, 'sin datos, NINGUNA capacidad esta lista',
    JSON.stringify(diag.recuento));
  ok(diag.recuento.listo + diag.recuento.falta + diag.recuento.parcial === diag.recuento.total,
    'y el recuento cuadra con el total', JSON.stringify(diag.recuento));
  // «calidad» es PARCIAL y no FALTA a proposito: la tasa de fallo es OPCIONAL, y
  // un modelo sin fallos es un modelo valido. Decir que «falta» seria pedir un
  // dato que no todo el mundo necesita.
  ok(diag.recuento.parcial === 1, 'solo la calidad sale parcial (su dato es opcional)',
    diag.recuento.parcial);
  const coste = diag.capacidades.find((c) => c.id === 'coste');
  ok(coste.estado === 'falta', 'el coste falta sin tarifa ni tiempos', coste.estado);
  ok(coste.pendientes.length === 2, 'y se dice que falta la tarifa Y el tiempo', coste.pendientes.length);
  coste.pendientes.forEach((p) => {
    ok(Boolean(p.consecuencia) && p.consecuencia.length > 5,
      `el pendiente "${p.dato}" explica su consecuencia`, p.consecuencia);
  });
}

console.log('\n== 2. Los datos minimos ponen capacidades en verde ==');
{
  const inv = inventarioDe({
    tareas: [ tarea({ processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' } }) ],
    flujos: [],
    pools: [],
    root: raiz({})
  });
  const diag = diagnosticar(inv);
  const porId = (id) => diag.capacidades.find((c) => c.id === id);

  ok(porId('coste').estado === 'listo', 'con tarifa y tiempo, el coste esta LISTO', porId('coste').estado);
  ok(porId('ciclo').estado === 'listo', 'y el ciclo tambien', porId('ciclo').estado);
  // Sin piscinas: hay tiempos, asi que se cumple UNO de los dos obligatorios y la
  // capacidad va a PARCIAL. «Parcial» es justo la informacion util aqui: se sabe
  // algo, no todo.
  ok(porId('capacidad').estado === 'parcial', 'sin piscinas, la capacidad queda PARCIAL (hay tiempo, no ρ)',
    porId('capacidad').estado);
  ok(porId('personas').estado === 'falta', 'sin miembros, las personas FALTAN', porId('personas').estado);
  ok(porId('carga').estado === 'falta', 'sin masa, la carga FALTA', porId('carga').estado);
  ok(diag.recuento.listo >= 2, 'hay al menos dos listas', diag.recuento.listo);
}

console.log('\n== 3. Requisito OPCIONAL: listo pasa a PARCIAL, no a falta ==');
{
  // Con piscinas y miembros, «personas» esta listo; sin tarifa ni carga maxima
  // sigue midiendose, pero con menos detalle. Eso es PARCIAL, no FALTA.
  const inv = inventarioDe({
    tareas: [ tarea({ processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' }, resources: { pool: 'P' } }) ],
    pools: [ pool([ { nombre: 'Ana' } ]) ],
    root: raiz({})
  });
  const diag = diagnosticar(inv);
  const personas = diag.capacidades.find((c) => c.id === 'personas');
  const operatividad = diag.capacidades.find((c) => c.id === 'operatividad');
  ok(personas.estado === 'listo', 'con nombres, «personas» esta LISTO', personas.estado);
  ok(operatividad.estado === 'parcial', 'sin tarifa propia, la operatividad es PARCIAL (se mide con menos detalle)',
    operatividad.estado);
  ok(operatividad.pendientes.every((p) => p.opcional), 'y lo que falta esta marcado como OPCIONAL',
    JSON.stringify(operatividad.pendientes.map((p) => p.opcional)));
}

console.log('\n== 4. La carga se separa: masa y distancia son requisitos distintos ==');
{
  const soloMasa = diagnosticar(inventarioDe({
    tareas: [ tarea({ carga: { masaCargadaKg: 12, distanciaM: 0 } }) ],
    root: raiz({})
  })).capacidades.find((c) => c.id === 'carga');

  ok(soloMasa.estado === 'parcial', 'con masa pero sin distancia: PARCIAL', soloMasa.estado);
  const dist = soloMasa.detalle.find((d) => d.campo === 'tarea.distancia');
  ok(!dist.cumple && dist.opcional, 'la distancia falta y es opcional');
  const cons = soloMasa.pendientes.find((p) => p.dato.includes('Distancia'));
  ok(/kg·m/.test(cons.consecuencia), 'y se explica que sin distancia no hay kg·m', cons.consecuencia);

  const conDistancia = diagnosticar(inventarioDe({
    tareas: [ tarea({ carga: { masaCargadaKg: 12, distanciaM: 8 } }) ],
    root: raiz({})
  })).capacidades.find((c) => c.id === 'carga');
  ok(conDistancia.estado === 'listo', 'con masa y distancia: LISTO', conDistancia.estado);
  ok(conDistancia.pendientes.length === 0, 'y sin pendientes');
}

console.log('\n== 5. La masa ARRASTRADA sola tambien cuenta (son dos series) ==');
{
  const inv = inventarioDe({
    tareas: [ tarea({ carga: { masaArrastradaKg: 100, distanciaM: 3 } }) ],
    root: raiz({})
  });
  const carga = diagnosticar(inv).capacidades.find((c) => c.id === 'carga');
  ok(carga.estado === 'listo',
    'una tarea que solo ARRASTRA masa tambien da carga medible (el sistema no suma, pero tampoco exige cargar)',
    carga.estado);
  ok(inv.tarea.carga === 1 && inv.tarea.distancia === 1, 'y el inventario la cuenta',
    `${inv.tarea.carga}/${inv.tarea.distancia}`);
}

console.log('\n== 6. Habilidades: sin tarea que las exija no hay bloqueo que detectar ==');
{
  const inv = inventarioDe({
    tareas: [ tarea({ processingTime: { distribution: 'fixed', value: 5, unit: 'minutes' }, resources: { pool: 'P' } }) ],
    pools: [ pool([ { nombre: 'Ana', habilidades: [ 'soldadura' ] } ]) ],
    root: raiz({})
  });
  const hab = diagnosticar(inv).capacidades.find((c) => c.id === 'habilidades');
  ok(hab.estado === 'parcial', 'persona con habilidad pero ninguna tarea que la exija: PARCIAL', hab.estado);
  const sinExigir = hab.pendientes.find((p) => /exig/i.test(p.dato));
  ok(Boolean(sinExigir), 'y se dice que falta la exigencia en las tareas',
    JSON.stringify(hab.pendientes.map((p) => p.dato)));
}

console.log('\n== 7. Agrupado por dato: lo que mas desbloquea, arriba ==');
{
  const diag = diagnosticar(inventarioDe(VACIO));
  const porDato = pendientesPorDato(diag);
  ok(porDato.length > 0, 'hay datos pendientes', porDato.length);

  const ordenado = porDato.every((p, i) => i === 0 || porDato[i - 1].desbloquea.length >= p.desbloquea.length);
  ok(ordenado, 'viene ordenado por cuantas capacidades desbloquea cada dato',
    porDato.slice(0, 3).map((p) => `${p.dato}: ${p.desbloquea.length}`).join(' | '));

  // El dato que mas capacidades desbloquea es el tiempo de proceso: sin duracion
  // no hay coste, ni ciclo, ni capacidad. Es el orden que se muestra arriba.
  ok(porDato[0].dato === 'Tiempo de proceso por tarea',
    'el primer dato de la lista es el que mas desbloquea', porDato[0].dato);
  ok(porDato[0].desbloquea.length === 3, 'y desbloquea tres capacidades', porDato[0].desbloquea.length);

  const miembros = porDato.find((p) => /Miembros con nombre/.test(p.dato));
  ok(Boolean(miembros), '«Miembros con nombre» aparece (desbloquea personas, habilidades y operatividad)');
  ok(miembros.desbloquea.length >= 2,
    'y un solo dato desbloquea varias capacidades a la vez', miembros.desbloquea.length);
  ok(miembros.desbloquea.every((t) => typeof t === 'string' && t.length), 'con el titulo de cada una');
  ok(miembros.desbloquea.length === new Set(miembros.desbloquea).size, 'sin repetir capacidades');
}

console.log('\n== 8. Coherencia de la tabla de capacidades ==');
{
  const ids = CAPACIDADES.map((c) => c.id);
  ok(ids.length === new Set(ids).size, 'no hay ids repetidos', ids.length);
  ok(CAPACIDADES.every((c) => c.titulo && c.porque && c.requisitos.length),
    'todas tienen titulo, motivo y al menos un requisito');

  // TODA ruta tiene que existir en el inventario. Una ruta mal escrita devuelve 0
  // y deja la capacidad en «falta» para siempre, en silencio: es el fallo más
  // caro posible en este modulo, porque el panel mentiria sin dar ningún error.
  const rutasValidas = [];
  const recorrer = (obj, prefijo) => {
    Object.keys(obj).forEach((k) => {
      const ruta = prefijo ? `${prefijo}.${k}` : k;
      if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])) recorrer(obj[k], ruta);
      else rutasValidas.push(ruta);
    });
  };
  recorrer(inventarioDe(VACIO), '');
  const rutas = CAPACIDADES.flatMap((c) => c.requisitos.map((r) => r.campo));
  const malas = rutas.filter((r) => !rutasValidas.includes(r));
  ok(malas.length === 0, 'todas las rutas de los requisitos existen en el inventario',
    malas.length ? `rutas invalidas: ${malas.join(', ')}` : `${rutas.length} rutas revisadas`);

  // Todo requisito tiene que poder leerse del inventario: un campo mal escrito
  // daria siempre 0 y la capacidad saldria «falta» para siempre, en silencio.
  const inv = inventarioDe({
    tareas: [ tarea({
      processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' },
      failureRate: 0.1, resources: { pool: 'P' },
      carga: { masaCargadaKg: 5, distanciaM: 2 },
      habilidad: 'soldadura', frequency: 'lot', barrier: { availableProbability: 0.7 }
    }) ],
    flujos: [ { id: 'F1', datos: { branchingProbability: 0.5 } } ],
    pools: [ pool([ { nombre: 'Ana', tarifaHora: 50, habilidades: [ 'soldadura' ], cargaMaximaKg: 25 } ]) ],
    root: raiz({ lots: { enabled: true }, labor: { shiftType: 'diurna' }, seed: 7,
      warmup: { shape: 'exponential' }, calendar: { workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [ { start: { hour: 13, minute: 0 }, end: { hour: 14, minute: 0 } } ] } })
  });

  ok(inv.tarea.total === 1 && inv.tarea.processingTime === 1 && inv.tarea.fallo === 1
    && inv.tarea.recurso === 1 && inv.tarea.carga === 1 && inv.tarea.distancia === 1
    && inv.tarea.habilidad === 1 && inv.tarea.porLote === 1 && inv.tarea.barrier === 1,
    'el inventario completo lee todo lo declarado', JSON.stringify(inv.tarea));
  ok(inv.miembro.total === 1 && inv.miembro.tarifa === 1 && inv.miembro.habilidades === 1
    && inv.miembro.cargaMaxima === 1, 'y los miembros tambien', JSON.stringify(inv.miembro));
  ok(inv.global.calendario === 1 && inv.global.descansos === 1 && inv.global.arranque === 1
    && inv.global.lots === 1 && inv.global.labor === 1 && inv.global.tarifa === 1 && inv.global.semilla === 1,
    'y la global tambien', JSON.stringify(inv.global));

  const completo = diagnosticar(inv);
  ok(completo.recuento.listo === completo.recuento.total,
    'con TODO declarado, las capacidades estan todas LISTAS',
    `${completo.recuento.listo}/${completo.recuento.total}`);
  ok(disponibles(completo).length === completo.recuento.total, 'y «disponibles» las devuelve todas');
  ok(pendientesPorDato(completo).length === 0, 'sin nada pendiente');
}

console.log('\n== 9. Los estados son los tres declarados ==');
{
  const diag = diagnosticar(inventarioDe(VACIO));
  diag.capacidades.forEach((c) => {
    ok(ESTADOS.includes(c.estado), `la capacidad ${c.id} usa un estado valido`, c.estado);
  });
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
