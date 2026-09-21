// DESIGNACION DE MIEMBRO: la validacion, los desplegables y el respeto del motor.
//
// Codigo REAL del plugin, copiado por build.mjs. Lo que se prueba son los TRES fallos silenciosos
// de una designacion -miembro que no esta, sin habilidad, sin piscina-, porque los tres se ven
// igual desde fuera: «la simulacion se queda corta». Si no se detectan antes de correr, el usuario
// no tiene forma de saber por que.
import {
  avisosDeDesignacion, miembrosDePiscina, habilidadesDisponibles
} from './MemberAssignment.mjs';
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

// El caso del usuario: una piscina con dos personas, dos tareas y el trabajo repartido.
const PISCINAS = [
  {
    name: 'armado',
    members: [
      { nombre: 'lizz', habilidades: [ 'soldadura' ], tarifaHora: 40 },
      { nombre: 'tecnico a', habilidades: [ 'soldadura', 'pintura' ], tarifaHora: 80 }
    ]
  },
  {
    name: 'sistemas',
    members: [ { nombre: 'ana', habilidades: [ 'escaneo' ], tarifaHora: 60 } ]
  },
  { name: 'vacia', members: [] }
];

console.log('\n== 1. Una designacion correcta no dice nada ==');
{
  // Un aviso permanente se aprende a ignorar: lo que no tiene problema no puede generar ruido.
  const r = avisosDeDesignacion([
    { id: 'T1', nombre: 'soldar bastidor', pool: 'armado', miembro: 'lizz', habilidades: [ 'soldadura' ] }
  ], PISCINAS);
  ok(r.errores.length === 0 && r.avisos.length === 0,
    'una tarea bien designada no genera ningun aviso',
    `errores ${r.errores.length}, avisos ${r.avisos.length}`);

  // Y una tarea SIN designacion tampoco: es el caso normal, el motor elige de la piscina.
  const sinDesignar = avisosDeDesignacion([
    { id: 'T2', nombre: 'pintar', pool: 'armado', miembro: null, habilidades: [] }
  ], PISCINAS);
  ok(sinDesignar.errores.length === 0 && sinDesignar.avisos.length === 0,
    'y sin designar tampoco: el motor elige de la piscina, que es lo de antes');
}

console.log('\n== 2. El miembro no esta en la piscina: la tarea se bloquea ==');
{
  const r = avisosDeDesignacion([
    { id: 'T1', nombre: 'soldar', pool: 'armado', miembro: 'pepe', habilidades: [] }
  ], PISCINAS);
  ok(r.errores.length === 1, 'se detecta el error', String(r.errores.length));
  ok(r.errores[0].motivo === 'miembro-ausente', 'con su motivo', r.errores[0].motivo);
  ok(/pepe/.test(r.errores[0].texto) && /armado/.test(r.errores[0].texto),
    'nombrando al miembro y a la piscina', r.errores[0].texto.slice(0, 90));
  // SE NOMBRAN LAS ALTERNATIVAS. Es la diferencia entre «hay un error» y «escribe uno de estos»:
  // sin ellas, el usuario tiene que ir a la otra pestana a mirar como se llaman.
  ok(/lizz/.test(r.errores[0].texto) && /tecnico a/.test(r.errores[0].texto),
    'y diciendo quienes SI estan, para no tener que ir a mirarlo',
    r.errores[0].texto.slice(60, 160));

  // Una piscina SIN miembros: el mensaje tiene que ser distinto de «escribe otro nombre».
  const vacia = avisosDeDesignacion([
    { id: 'T2', nombre: 'x', pool: 'vacia', miembro: 'lizz', habilidades: [] }
  ], PISCINAS);
  ok(/no tiene ningún miembro/.test(vacia.errores[0].texto),
    'y con una piscina sin miembros lo dice, en vez de listar una lista vacia',
    vacia.errores[0].texto.slice(60, 140));
}

console.log('\n== 3. El miembro no tiene la habilidad: tambien se bloquea ==');
{
  const r = avisosDeDesignacion([
    { id: 'T1', nombre: 'pintar bastidor', pool: 'armado', miembro: 'lizz', habilidades: [ 'pintura' ] }
  ], PISCINAS);
  // Es AVISO y no ERROR a proposito: la designacion es valida -lizz existe y esta en la piscina-,
  // lo que no puede es hacer ESTA tarea. El usuario puede querer dejarlo asi para ver el efecto del
  // bloqueo, que es un escenario legitimo.
  ok(r.avisos.length === 1 && r.errores.length === 0,
    'se avisa sin bloquear la simulacion: ver el efecto del bloqueo es un escenario valido',
    `errores ${r.errores.length}, avisos ${r.avisos.length}`);
  ok(r.avisos[0].motivo === 'sin-habilidad', 'con su motivo', r.avisos[0].motivo);
  ok(/pintura/.test(r.avisos[0].texto), 'nombrando la habilidad que falta',
    r.avisos[0].texto.slice(0, 110));
  ok(/se quedará bloqueada/.test(r.avisos[0].texto),
    'y diciendo la consecuencia: la tarea se bloquea en CADA caso');
  // Y la alternativa util: quien SI puede hacerla. Sin esto el aviso es un callejon sin salida.
  ok(/tecnico a/.test(r.avisos[0].texto),
    'y diciendo quien SI puede hacerla, que es el arreglo mas rapido',
    r.avisos[0].texto.slice(100, 200));

  // Sin alternativa posible se calla esa parte, en vez de decir «Sí puede(n): » con la lista vacia.
  const sinAlternativa = avisosDeDesignacion([
    { id: 'T1', nombre: 'x', pool: 'sistemas', miembro: 'ana', habilidades: [ 'soldadura' ] }
  ], PISCINAS);
  ok(sinAlternativa.avisos.length === 1, 'con un solo miembro en la piscina tambien se avisa');
  ok(!/Sí puede/.test(sinAlternativa.avisos[0].texto),
    'y no ofrece alternativas que no existen',
    sinAlternativa.avisos[0].texto.slice(100, 180));

  // Varias habilidades: se nombran TODAS las que faltan, no la primera.
  const dos = avisosDeDesignacion([
    { id: 'T1', nombre: 'x', pool: 'sistemas', miembro: 'ana', habilidades: [ 'soldadura', 'pintura' ] }
  ], PISCINAS);
  ok(/soldadura/.test(dos.avisos[0].texto) && /pintura/.test(dos.avisos[0].texto),
    'con dos habilidades que faltan se nombran las dos',
    dos.avisos[0].texto.slice(0, 120));
}

console.log('\n== 4. Designar sin piscina: la designacion no se aplica ==');
{
  // El caso mas facil de cometer: se escribe el nombre y no se elige piscina. Sin piscina no hay a
  // quien pedirle el recurso, asi que la designacion es papel mojado y hay que decirlo.
  const r = avisosDeDesignacion([
    { id: 'T1', nombre: 'soldar', pool: null, miembro: 'lizz', habilidades: [] }
  ], PISCINAS);
  ok(r.errores.length === 1 && r.errores[0].motivo === 'sin-piscina',
    'se detecta', JSON.stringify(r.errores[0].motivo));
  ok(/no tiene piscina/.test(r.errores[0].texto),
    'y se explica que sin piscina no hay recurso que pedir', r.errores[0].texto.slice(0, 110));

  // Y una piscina que no existe es otro error distinto, con otro arreglo.
  const desconocida = avisosDeDesignacion([
    { id: 'T1', nombre: 'soldar', pool: 'inventada', miembro: 'lizz', habilidades: [] }
  ], PISCINAS);
  ok(desconocida.errores[0].motivo === 'piscina-desconocida',
    'una piscina inexistente es su propio motivo', desconocida.errores[0].motivo);
}

console.log('\n== 5. Varias tareas: se avisa de cada una ==');
{
  // Un diagrama grande puede tener cinco designaciones rotas, y arreglar una para descubrir la
  // siguiente es exactamente lo que hay que evitar.
  const r = avisosDeDesignacion([
    { id: 'T1', nombre: 'soldar', pool: 'armado', miembro: 'pepe', habilidades: [] },
    { id: 'T2', nombre: 'pintar', pool: 'armado', miembro: 'lizz', habilidades: [ 'pintura' ] },
    { id: 'T3', nombre: 'ok', pool: 'armado', miembro: 'tecnico a', habilidades: [ 'soldadura' ] }
  ], PISCINAS);
  ok(r.errores.length === 1, 'se detecta el error de una', String(r.errores.length));
  ok(r.avisos.length === 1, 'y el aviso de la otra', String(r.avisos.length));
  ok(r.errores[0].tarea === 'T1' && r.avisos[0].tarea === 'T2',
    'cada uno con SU tarea, para poder ir a arreglarla',
    `${r.errores[0].tarea} / ${r.avisos[0].tarea}`);
  // La tercera, que esta bien, no aparece.
  ok(!r.errores.some((e) => e.tarea === 'T3') && !r.avisos.some((a) => a.tarea === 'T3'),
    'y la que esta bien no genera ruido');

  // Sin tareas o sin piscinas no revienta.
  ok(avisosDeDesignacion([], PISCINAS).errores.length === 0, 'sin tareas no hay errores');
  ok(avisosDeDesignacion(null, null).errores.length === 0, 'y con null tampoco');
}

console.log('\n== 6. Los desplegables: el miembro y las habilidades ==');
{
  // Los miembros de la piscina elegida, ordenados: un desplegable en orden de aparicion obliga a
  // buscarlo a ojo.
  const m = miembrosDePiscina(PISCINAS, 'armado');
  ok(m.join(',') === 'lizz,tecnico a', 'los miembros salen ordenados', m.join(', '));
  ok(miembrosDePiscina(PISCINAS, 'vacia').length === 0, 'una piscina sin miembros da lista vacia');
  ok(miembrosDePiscina(PISCINAS, 'no-existe').length === 0, 'y una piscina inexistente tambien');
  ok(miembrosDePiscina(PISCINAS, null).length === 0, 'y sin piscina elegida, tambien');

  // LAS HABILIDADES DE TODOS LOS RECURSOS, sin duplicados y ordenadas. Es lo que evita el peor
  // fallo posible -exigir una habilidad que nadie tiene, que bloquea la tarea en silencio-.
  const h = habilidadesDisponibles(PISCINAS);
  ok(h.join(',') === 'escaneo,pintura,soldadura', 'las habilidades salen sin duplicados y ordenadas',
    h.join(', '));
  // `soldadura` esta en dos personas: un duplicado en el desplegable es un error visible.
  ok(h.filter((x) => x === 'soldadura').length === 1,
    'y una habilidad que esta en dos personas aparece UNA vez');
  ok(habilidadesDisponibles([]).length === 0, 'sin recursos no hay habilidades');
  ok(habilidadesDisponibles(null).length === 0, 'y con null tampoco');
  ok(!habilidadesDisponibles([ { name: 'x', members: [] } ]).length,
    'una piscina sin miembros no aporta habilidades');

  // LA PROPIEDAD QUE UNE LAS DOS PIEZAS: si el desplegable de la tarea sale de las habilidades
  // dadas de alta, exigir una que nadie tiene deja de ser posible.
  const enRecursos = new Set();
  PISCINAS.forEach((p) => p.members.forEach((mm) => (mm.habilidades || []).forEach((x) => enRecursos.add(x))));
  ok(h.every((x) => enRecursos.has(x)) && h.length === enRecursos.size,
    'el desplegable ofrece exactamente las habilidades dadas de alta ni una mas',
    `${h.length} de ${enRecursos.size}`);
}

/**
 * Corre el motor con DOS personas en una piscina y una tarea que puede designar a una.
 *
 * El montaje es el caso del usuario: una piscina con dos miembros y una tarea, para poder repartir
 * el trabajo. Con `designado` en la tarea, el motor tiene que esperar a esa persona.
 */
const correr = (designado, habilidadesTarea) => {
  const RUN = 12;
  const guardar = { log: console.log, table: console.table, warn: console.warn, groupEnd: console.groupEnd };
  console.log = () => {}; console.table = () => {}; console.warn = () => {}; console.groupEnd = () => {};
  let motor;
  try {
    const tarea = {
      id: 'T1', $type: 'bpmn:Task', businessObject: { name: 'Cortar' }, outgoing: [],
      _datos: {
        processingTime: { distribution: 'fixed', value: 20, unit: 'minutes' },
        resources: { pool: 'P', quantityRequired: 1, ...(designado ? { miembro: designado } : {}) },
        ...(habilidadesTarea ? { habilidades: habilidadesTarea } : {})
      }
    };
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: { isRoot: true, arrivalRate: { value: 1, unit: 'hour' },
        simulationConfig: { runValue: RUN }, startDate: '2026-01-05',
        calendar: { workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [] },
        cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
        overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        warmup: { enabled: false } }
    };
    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    const proceso = {
      id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' },
      _datos: { resourcePools: [ {
        name: 'P', quantity: 2,
        members: [
          { nombre: 'lizz', habilidades: [ 'corte' ], tarifaHora: 40 },
          { nombre: 'tecnico a', habilidades: [ 'corte' ], tarifaHora: 80 }
        ]
      } ] }
    };
    const f1 = { id: 'F1', $type: 'bpmn:SequenceFlow', businessObject: {}, source: inicio, target: tarea };
    const f2 = { id: 'F2', $type: 'bpmn:SequenceFlow', businessObject: {}, source: tarea, target: fin };
    inicio.outgoing = [ f1 ]; tarea.outgoing = [ f2 ];
    const elementos = [ inicio, tarea, fin, f1, f2, proceso ];
    const registro = {
      getAll: () => elementos, get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn), find: (fn) => elementos.find(fn)
    };

    motor = new SimulationEngine(registro);
    motor.run({ useOvertime: false });
  } finally {
    Object.assign(console, guardar);
  }

  const r = motor.results.get('T1') || {};
  const porMiembro = (motor.operatividad && motor.operatividad.porMiembro)
    ? motor.operatividad.porMiembro.map((m) => ({ nombre: m.nombre, activoMin: m.activoMin }))
    : [];
  return {
    ejecuciones: r.executionCount || 0,
    bloqueadas: r.totalBlockedBySkill || 0,
    porMiembro
  };
};

console.log('\n== 7. El motor RESPETA la designacion (motor real) ==');
{
  // SIN designar: las dos personas reparten el trabajo por turnos.
  const sin = correr(null);
  ok(sin.ejecuciones > 0, 'sin designar, la tarea se ejecuta', String(sin.ejecuciones));
  ok(sin.bloqueadas === 0, 'y no se bloquea nada');
  const activos = sin.porMiembro.filter((m) => m.activoMin > 0);
  // LA RONDA: con dos aptos, los dos tienen que trabajar. Si solo trabajara uno, la designacion
  // estaria aplicandose sin que nadie la pidiera.
  ok(activos.length === 2,
    'y el trabajo se REPARTE entre los dos miembros de la piscina',
    sin.porMiembro.map((m) => `${m.nombre}:${Math.round(m.activoMin)}min`).join(' '));

  // CON designacion: solo trabaja esa persona, aunque la otra tenga la MISMA habilidad y este
  // libre. Es la propiedad que convierte la designacion en restriccion y no en preferencia.
  const con = correr('lizz');
  ok(con.ejecuciones > 0, 'con designacion, la tarea tambien se ejecuta', String(con.ejecuciones));
  const suyo = con.porMiembro.find((m) => m.nombre === 'lizz');
  const otro = con.porMiembro.find((m) => m.nombre === 'tecnico a');
  ok(suyo && suyo.activoMin > 0, 'y trabaja el miembro designado',
    suyo ? `${Math.round(suyo.activoMin)} min` : 'sin datos');
  ok(otro && otro.activoMin === 0,
    'y el OTRO no trabaja, aunque tenga la habilidad y este libre',
    otro ? `${Math.round(otro.activoMin)} min` : 'sin datos');
}

console.log('\n== 8. Designar a quien no puede: la tarea se bloquea ==');
{
  // El fallo silencioso que la validacion existe para atrapar. Aqui se comprueba que el MOTOR
  // tambien lo trata como bloqueo, y no como «se ejecuta sin recurso».
  const ausente = correr('pepe');
  ok(ausente.ejecuciones === 0,
    'designar a alguien que no esta en la piscina NO ejecuta la tarea', String(ausente.ejecuciones));
  ok(ausente.bloqueadas > 0, 'y lo cuenta como bloqueo', String(ausente.bloqueadas));

  const sinHabilidad = correr('lizz', [ 'soldadura' ]);
  ok(sinHabilidad.ejecuciones === 0,
    'designar a alguien sin la habilidad exigida tampoco ejecuta la tarea',
    String(sinHabilidad.ejecuciones));
  ok(sinHabilidad.bloqueadas > 0, 'y tambien se cuenta como bloqueo',
    String(sinHabilidad.bloqueadas));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
