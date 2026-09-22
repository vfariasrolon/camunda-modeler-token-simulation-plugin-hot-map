// LECTURA Y VALIDACION DE LA TABLA DE DATOS.
//
// Codigo REAL del plugin, empaquetado por webpack igual que el del plugin. Se prueba aqui y no solo
// a traves del panel porque esta es la parte que decide QUE SE RECHAZA: sus mensajes son los que el
// usuario lee al pulsar «Guardar todo», y un validador que no valida no se nota mirando la pantalla
// -el diagrama se guarda igual de bien, solo que con datos imposibles dentro-.
//
// POR QUE VA EN LA SUITE DE NAVEGADOR y no en la de Node: el modulo lee las casillas por atributo
// (`[data-field="..."]`), asi que necesita un DOM de verdad. Un doble de mentira probaria el doble y
// no el selector, que es justo donde estan los fallos.
import {
  numero, datosDeFilaDeTarea, datosDeRecursos, datosDeFlujos, datosGlobales, setByPath, getByPath
} from '@plugin/simulation/validacion.js';

const resultados = [];
let fallos = 0;

const volcar = () => {
  const pre = document.getElementById('informe');
  const veredicto = fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`;
  pre.textContent = resultados.join('\n') + `\n\n== RESULTADO: ${veredicto} ==\n`;
};

const ok = (cond, etiqueta, detalle) => {
  if (!cond) fallos++;
  resultados.push(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  volcar();
};

// --- utilidades de DOM -----------------------------------------------------

/** Construye un `<tr>` de tareas a partir de un mapa `campo -> valor`. */
const filaDeTarea = (elId, campos) => {
  const tr = document.createElement('tr');
  tr.dataset.elId = elId;
  Object.entries(campos).forEach(([ campo, valor ]) => {
    const input = document.createElement('input');
    input.setAttribute('data-field', campo);
    input.value = String(valor);
    tr.appendChild(input);
  });
  return tr;
};

const CONTEXTO_TAREA = {
  getElement: () => ({}),
  label: () => 'Cortar',
  taskData: () => ({
    processingTime: { distribution: 'fixed', value: 1, unit: 'minutes' },
    reworkTime: { distribution: 'fixed', value: 1, unit: 'minutes' },
    failureRate: 0
  }),
  getPools: () => [ { name: 'P', members: [ { nombre: 'lizz' }, { nombre: 'ana' } ] } ]
};

const CONTEXTO_VACIO = { getElement: () => null };

/** El error que lanza `fn`, o null si no lanza. */
const errorDe = (fn) => {
  try { fn(); return null; } catch (e) { return e.message; }
};

resultados.push(''); resultados.push('== 1. Un numero escrito por una persona =='); volcar();
{
  // La COMA decimal es el caso normal en español y en un CSV de Excel. Sin aceptarla, «12,5» se
  // leeria como 12 y el error seria invisible: el dato entra, solo que mal.
  ok(numero('12,5', 'x') === 12.5, 'la coma decimal se acepta', String(numero('12,5', 'x')));
  ok(numero('12.5', 'x') === 12.5, 'y el punto tambien', String(numero('12.5', 'x')));
  ok(numero(' 7 ', 'x') === 7, 'los espacios de sobra no molestan');

  // El mensaje lleva el texto ORIGINAL entre comillas: es lo unico que deja ver el espacio o la
  // letra que sobra.
  const vacio = errorDe(() => numero('', 'Cortar · tiempo'));
  ok(vacio !== null && /no numérico/.test(vacio) && /«»/.test(vacio),
    'vacio se rechaza con el texto original', vacio);
  const letra = errorDe(() => numero('7a', 'Cortar · tiempo'));
  ok(letra !== null && /«7a»/.test(letra), 'una letra suelta se rechaza nombrandola', letra);
  ok(/Cortar · tiempo/.test(letra), 'y el mensaje dice QUE campo falla');
}

resultados.push(''); resultados.push('== 2. La tasa de fallo va en % en la casilla y en fraccion al motor =='); volcar();
{
  // Dos unidades para el mismo dato es la clase de cosa que se desincroniza. Aqui se fija el trato:
  // la casilla es 0-100 y el motor recibe 0-1.
  const tr = filaDeTarea('T1', {
    'processingTime.distribution': 'fixed',
    'processingTime.value': '10',
    'processingTime.unit': 'minutes',
    'reworkTime.value': '5',
    'reworkTime.unit': 'minutes',
    failureRate: '12.5'
  });
  const r = datosDeFilaDeTarea(tr, CONTEXTO_TAREA);
  ok(r.data.failureRate === 0.125, '12,5 % se guarda como 0,125', String(r.data.failureRate));

  const fuera = filaDeTarea('T1', {
    'processingTime.distribution': 'fixed', 'processingTime.value': '10',
    'processingTime.unit': 'minutes', 'reworkTime.value': '5', 'reworkTime.unit': 'minutes',
    failureRate: '150'
  });
  const msg = errorDe(() => datosDeFilaDeTarea(fuera, CONTEXTO_TAREA));
  // El mensaje nombra el TOPE, no solo queja: «debe estar entre 0 y 100 %» dice que hacer.
  ok(msg !== null && /entre 0 y 100 %/.test(msg) && /150/.test(msg),
    '150 % se rechaza diciendo el tope', msg);
  ok(/^Cortar: /.test(msg), 'y con el nombre del elemento delante, para saber que fila es', msg);
}

resultados.push(''); resultados.push('== 3. Triangular: se lee min/moda/max y NO el campo Tiempo =='); volcar();
{
  // Con triangular, el campo «Tiempo» no se lee en absoluto. Leer los dos seria peor que no leer
  // ninguno: se guardaria un valor que el motor va a ignorar.
  const tr = filaDeTarea('T1', {
    'processingTime.distribution': 'triangular',
    'processingTime.min': '5',
    'processingTime.mode': '10',
    'processingTime.max': '20',
    'processingTime.value': '99999',
    'processingTime.unit': 'minutes',
    'reworkTime.value': '3',
    'reworkTime.unit': 'minutes',
    failureRate: '0'
  });
  const r = datosDeFilaDeTarea(tr, CONTEXTO_TAREA);
  ok(r.data.processingTime.distribution === 'triangular', 'se guarda como triangular');
  ok(r.data.processingTime.min === 5 && r.data.processingTime.mode === 10
    && r.data.processingTime.max === 20, 'con sus tres valores',
    JSON.stringify(r.data.processingTime));
  ok(!('value' in r.data.processingTime),
    'y SIN el campo Tiempo, que es lo que el motor ignora',
    JSON.stringify(r.data.processingTime));

  // El orden min ≤ moda ≤ max: invertirlo no da error en el motor, da una triangular imposible.
  const desorden = filaDeTarea('T1', {
    'processingTime.distribution': 'triangular', 'processingTime.min': '20',
    'processingTime.mode': '10', 'processingTime.max': '5',
    'processingTime.unit': 'minutes', 'reworkTime.value': '3', 'reworkTime.unit': 'minutes',
    failureRate: '0'
  });
  const msg = errorDe(() => datosDeFilaDeTarea(desorden, CONTEXTO_TAREA));
  ok(msg !== null && /mínimo ≤ moda ≤ máximo/.test(msg), 'el desorden se rechaza explicando la regla', msg);
  ok(/20, 10, 5/.test(msg), 'y diciendo los tres valores que se pusieron', msg);
}

resultados.push(''); resultados.push('== 4. Recurso: piscina, cantidad y miembro designado =='); volcar();
{
  const base = {
    'processingTime.distribution': 'fixed', 'processingTime.value': '10',
    'processingTime.unit': 'minutes', 'reworkTime.value': '5', 'reworkTime.unit': 'minutes',
    failureRate: '0'
  };
  // Sin piscina, la clave `resources` se BORRA (no se guarda vacia): el motor comprueba
  // `data.resources && data.resources.pool`, asi que un objeto con pool vacio pasaria el filtro.
  const sinPiscina = datosDeFilaDeTarea(filaDeTarea('T1', base), CONTEXTO_TAREA);
  ok(!('resources' in sinPiscina.data), 'sin piscina no se guarda la clave resources',
    JSON.stringify(sinPiscina.data.resources));

  // Una piscina que no existe: el motor leeria «sin restriccion» y la corrida saldria corta.
  const msgPiscina = errorDe(() => datosDeFilaDeTarea(
    filaDeTarea('T1', { ...base, 'resources.pool': 'NoExiste' }), CONTEXTO_TAREA));
  ok(msgPiscina !== null && /no está dada de alta/.test(msgPiscina),
    'una piscina inexistente se rechaza', msgPiscina);
  ok(/pestaña Recursos/.test(msgPiscina), 'y dice DONDE crearla, que es el arreglo');

  // Cantidad vacia = 1 (el caso normal), pero 0 no vale: una tarea que pide cero recursos es una
  // contradiccion.
  const cantidadVacia = datosDeFilaDeTarea(
    filaDeTarea('T1', { ...base, 'resources.pool': 'P' }), CONTEXTO_TAREA);
  ok(cantidadVacia.data.resources.quantityRequired === 1, 'cantidad vacia vale 1',
    String(cantidadVacia.data.resources.quantityRequired));

  const msgCero = errorDe(() => datosDeFilaDeTarea(
    filaDeTarea('T1', { ...base, 'resources.pool': 'P', 'resources.quantityRequired': '0' }), CONTEXTO_TAREA));
  ok(msgCero !== null && /mayor o igual que 1/.test(msgCero), 'cantidad 0 se rechaza', msgCero);

  // EL MIEMBRO DESIGNADO. Un nombre mal escrito atasca la tarea en cada caso y el sintoma -«la
  // corrida se queda corta»- no dice cual es el problema, asi que se valida aqui.
  const designado = datosDeFilaDeTarea(
    filaDeTarea('T1', { ...base, 'resources.pool': 'P', 'resources.miembro': 'lizz' }), CONTEXTO_TAREA);
  ok(designado.data.resources.miembro === 'lizz', 'el miembro designado se guarda',
    JSON.stringify(designado.data.resources));

  const msgMiembro = errorDe(() => datosDeFilaDeTarea(
    filaDeTarea('T1', { ...base, 'resources.pool': 'P', 'resources.miembro': 'pepe' }), CONTEXTO_TAREA));
  ok(msgMiembro !== null && /no está en la piscina/.test(msgMiembro), 'un miembro ajeno se rechaza', msgMiembro);
  // Y SE NOMBRAN LOS QUE SI ESTAN: sin eso, el usuario tiene que ir a la otra pestaña a mirarlo.
  ok(/lizz/.test(msgMiembro) && /ana/.test(msgMiembro),
    'y se listan los miembros que si existen', msgMiembro);
}

resultados.push(''); resultados.push('== 5. Frecuencia y barrera =='); volcar();
{
  const base = {
    'processingTime.distribution': 'fixed', 'processingTime.value': '10',
    'processingTime.unit': 'minutes', 'reworkTime.value': '5', 'reworkTime.unit': 'minutes',
    failureRate: '0'
  };
  // Por TOKEN: la barrera se borra. `taskData` devuelve los valores por defecto para poder pintarlos,
  // asi que si no se borraran, cada guardado arrastraria una barrera que nadie pidio.
  const porToken = datosDeFilaDeTarea(filaDeTarea('T1', { ...base, frequency: 'token' }), CONTEXTO_TAREA);
  ok(!('frequency' in porToken.data) && !('barrier' in porToken.data),
    'por token no se guardan ni frecuencia ni barrera', Object.keys(porToken.data).join(','));

  const porLote = datosDeFilaDeTarea(filaDeTarea('T1', {
    ...base, frequency: 'lot',
    'barrier.availableProbability': '0.6', 'barrier.waitMin': '5',
    'barrier.waitMode': '12', 'barrier.waitMax': '30', 'barrier.toleranceMinutes': '10'
  }), CONTEXTO_TAREA);
  ok(porLote.data.frequency === 'lot' && porLote.data.barrier.waitMode === 12,
    'por lote se guarda la barrera completa', JSON.stringify(porLote.data.barrier));

  // La disponibilidad es una PROBABILIDAD: 1,5 no es «casi siempre», es un dato imposible.
  const msgDisp = errorDe(() => datosDeFilaDeTarea(filaDeTarea('T1', {
    ...base, frequency: 'lot', 'barrier.availableProbability': '1.5', 'barrier.waitMin': '5',
    'barrier.waitMode': '12', 'barrier.waitMax': '30', 'barrier.toleranceMinutes': '10'
  }), CONTEXTO_TAREA));
  ok(msgDisp !== null && /entre 0 y 1/.test(msgDisp), 'una disponibilidad > 1 se rechaza', msgDisp);

  const msgEspera = errorDe(() => datosDeFilaDeTarea(filaDeTarea('T1', {
    ...base, frequency: 'lot', 'barrier.availableProbability': '0.5', 'barrier.waitMin': '30',
    'barrier.waitMode': '12', 'barrier.waitMax': '5', 'barrier.toleranceMinutes': '10'
  }), CONTEXTO_TAREA));
  ok(msgEspera !== null && /mínimo ≤ moda ≤ máximo/.test(msgEspera),
    'la espera desordenada se rechaza con la misma regla', msgEspera);
}

resultados.push(''); resultados.push('== 6. Carga fisica y habilidad: ausente NO es cero =='); volcar();
{
  const base = {
    'processingTime.distribution': 'fixed', 'processingTime.value': '10',
    'processingTime.unit': 'minutes', 'reworkTime.value': '5', 'reworkTime.unit': 'minutes',
    failureRate: '0'
  };
  // Un 0 dice «esta tarea no mueve peso» y el vacio dice «no lo sabemos». El diagnostico de datos
  // los distingue, asi que no pueden acabar los dos como 0.
  const vacio = datosDeFilaDeTarea(filaDeTarea('T1', { ...base, habilidad: '' }), CONTEXTO_TAREA);
  ok(!('carga' in vacio.data), 'sin carga no se guarda la clave', Object.keys(vacio.data).join(','));
  ok(!('habilidad' in vacio.data) && !('habilidades' in vacio.data),
    'y sin habilidad tampoco', Object.keys(vacio.data).join(','));

  const conCarga = datosDeFilaDeTarea(filaDeTarea('T1', {
    ...base, 'carga.masaCargadaKg': '12', 'carga.arrastre_kg': '', 'carga.distanciaM': '8'
  }), CONTEXTO_TAREA);
  ok(conCarga.data.carga.masaCargadaKg === 12 && conCarga.data.carga.distanciaM === 8,
    'la carga declarada se guarda', JSON.stringify(conCarga.data.carga));
  ok(!('masaArrastradaKg' in conCarga.data.carga),
    'y la que se dejo vacia se OMITE, no se guarda como 0', JSON.stringify(conCarga.data.carga));

  // Una sola habilidad va en SINGULAR (`habilidad`) porque es el caso comun y deja el XML legible;
  // varias van como lista. El motor lee las dos formas.
  const una = datosDeFilaDeTarea(filaDeTarea('T1', { ...base, habilidad: 'soldadura' }), CONTEXTO_TAREA);
  ok(una.data.habilidad === 'soldadura' && !una.data.habilidades,
    'una habilidad se guarda en singular', JSON.stringify(una.data.habilidad));

  const dos = datosDeFilaDeTarea(filaDeTarea('T1', { ...base, habilidad: 'soldadura, pintura' }), CONTEXTO_TAREA);
  ok(Array.isArray(dos.data.habilidades) && dos.data.habilidades.length === 2,
    'y dos se guardan como lista', JSON.stringify(dos.data.habilidades));
  ok(!('habilidad' in dos.data), 'sin dejar la clave singular huerfana', Object.keys(dos.data).join(','));

  const negativa = errorDe(() => datosDeFilaDeTarea(
    filaDeTarea('T1', { ...base, 'carga.masaCargadaKg': '-5' }), CONTEXTO_TAREA));
  ok(negativa !== null && /no puede ser negativo/.test(negativa),
    'una masa negativa se rechaza', negativa);
}

resultados.push(''); resultados.push('== 7. Una fila que no es de ningun elemento no es un escrito =='); volcar();
{
  // `getElement` devuelve null cuando la fila apunta a algo que ya no esta en el diagrama -el usuario
  // borro la figura mientras la tabla estaba abierta-. Devolver un escrito ahi intentaria guardar
  // sobre un elemento inexistente.
  const r = datosDeFilaDeTarea(filaDeTarea('BORRADO', {}), CONTEXTO_VACIO);
  ok(r === null, 'la fila sin elemento devuelve null y no un escrito', JSON.stringify(r));
}

resultados.push(''); resultados.push('== 8. Recursos: piscinas, miembros y proveedores =='); volcar();
{
  const proceso = { id: 'P1' };
  const ctx = {
    processRoot: () => proceso,
    procesoData: () => ({}),
    getElement: () => ({}),
    label: () => 'x'
  };

  // Se construye una fila de piscina con su sublistado de miembros, que es como la pinta el panel.
  const filaPool = (nombre, cantidad, miembros, extra = {}) => {
    const tr = document.createElement('tr');
    const campo = (f, v) => {
      const i = document.createElement('input');
      i.setAttribute('data-field', f);
      i.value = String(v);
      tr.appendChild(i);
    };
    campo('pool.name', nombre);
    campo('pool.quantity', cantidad);
    Object.entries(extra).forEach(([ k, v ]) => campo(k, v));

    const tablaMiembros = document.createElement('div');
    tablaMiembros.className = 'filas-miembro';
    miembros.forEach((m) => {
      const fm = document.createElement('tr');
      Object.entries(m).forEach(([ k, v ]) => {
        const i = document.createElement('input');
        i.setAttribute('data-miembro', k);
        i.value = String(v);
        fm.appendChild(i);
      });
      tablaMiembros.appendChild(fm);
    });
    tr.appendChild(tablaMiembros);
    return tr;
  };
  const contenedor = (filas) => {
    const div = document.createElement('div');
    div.className = 'filas-pool';
    filas.forEach((f) => div.appendChild(f));
    return div;
  };

  const simple = datosDeRecursos(contenedor([ filaPool('armado', '3', [ { nombre: 'lizz', tarifaHora: '40' } ]) ]), ctx);
  ok(simple.length === 1, 'devuelve UN escrito, no uno por piscina', String(simple.length));
  ok(simple[0].element === proceso, 'y ese escrito es el PROCESO (las piscinas no son elementos)');
  ok(simple[0].data.resourcePools[0].members[0].nombre === 'lizz',
    'con sus miembros dentro', JSON.stringify(simple[0].data.resourcePools[0]));

  // Una piscina PROPIA no escribe origen ni cobro: el XML de los diagramas que no usan proveedores no
  // puede engordar por una funcion que no usan.
  ok(!('origen' in simple[0].data.resourcePools[0]),
    'una piscina propia no arrastra la clave de proveedor',
    JSON.stringify(simple[0].data.resourcePools[0]));

  // El origen y el cobro de un PROVEEDOR, con su precio.
  const proveedor = datosDeRecursos(contenedor([
    filaPool('Taller', '1', [], { 'pool.origen': 'externa', 'pool.cobro': 'pieza', 'pool.precioPieza': '45' })
  ]), ctx);
  const p = proveedor[0].data.resourcePools[0];
  ok(p.origen === 'externa' && p.cobro === 'pieza' && p.precioPieza === 45,
    'el proveedor por pieza se guarda con su precio', JSON.stringify(p));

  // POR PIEZA SIN PRECIO: factura 0 y el informe enseñaria un coste mas barato que el real. Un cero
  // silencioso es peor que no dejar guardar.
  const sinPrecio = errorDe(() => datosDeRecursos(contenedor([
    filaPool('Taller', '1', [], { 'pool.origen': 'externa', 'pool.cobro': 'pieza' })
  ]), ctx));
  ok(sinPrecio !== null && /POR PIEZA/.test(sinPrecio) && /precio/.test(sinPrecio),
    'un proveedor por pieza sin precio se rechaza', sinPrecio);

  // Pero la tarifa por hora SI puede faltar: el motor cae en la de planta, que es un numero visible
  // y plausible.
  const porHora = datosDeRecursos(contenedor([
    filaPool('Taller', '1', [], { 'pool.origen': 'externa', 'pool.cobro': 'hora' })
  ]), ctx);
  ok(porHora[0].data.resourcePools[0].cobro === 'hora'
    && !('tarifaHora' in porHora[0].data.resourcePools[0]),
    'un proveedor por hora sin tarifa si entra (usa la de planta)',
    JSON.stringify(porHora[0].data.resourcePools[0]));

  // Nombre repetido: el motor indexa las piscinas por nombre, asi que dos iguales hacen que una gane
  // en silencio.
  const repetida = errorDe(() => datosDeRecursos(contenedor([
    filaPool('armado', '1', []), filaPool('armado', '2', [])
  ]), ctx));
  ok(repetida !== null && /repetido/.test(repetida), 'dos piscinas con el mismo nombre se rechazan', repetida);

  const miembroRepetido = errorDe(() => datosDeRecursos(contenedor([
    filaPool('armado', '2', [ { nombre: 'lizz' }, { nombre: 'lizz' } ])
  ]), ctx));
  ok(miembroRepetido !== null && /miembro «lizz» está repetido/.test(miembroRepetido),
    'y dos miembros iguales en la misma piscina, tambien', miembroRepetido);

  // Cantidad no entera: media persona no existe, y el motor redondearia sin decirlo.
  const media = errorDe(() => datosDeRecursos(contenedor([ filaPool('armado', '1.5', []) ]), ctx));
  ok(media !== null && /entero/.test(media), 'una cantidad fraccionaria se rechaza', media);

  // Una fila totalmente vacia se IGNORA: es la que se acaba de añadir y no se ha rellenado.
  const conVacia = datosDeRecursos(contenedor([ filaPool('armado', '1', []), filaPool('', '', []) ]), ctx);
  ok(conVacia[0].data.resourcePools.length === 1,
    'la fila vacia no bloquea el guardado', String(conVacia[0].data.resourcePools.length));

  // Sin proceso no hay donde guardar.
  const sinProceso = errorDe(() => datosDeRecursos(contenedor([]), { ...ctx, processRoot: () => null }));
  ok(sinProceso !== null && /ningún proceso/.test(sinProceso), 'sin proceso se avisa', sinProceso);
}

resultados.push(''); resultados.push('== 9. Flujos: el reparto se valida POR COMPUERTA =='); volcar();
{
  const compuerta = { id: 'GW', source: null };
  const flujo = (id, destino, pct) => {
    const el = { id, source: compuerta, target: { id: destino } };
    const tr = document.createElement('tr');
    tr.dataset.elId = id;
    const i = document.createElement('input');
    i.setAttribute('data-field', 'branchingProbability');
    i.value = String(pct);
    tr.appendChild(i);
    return { el, tr };
  };
  const a = flujo('F1', 'T1', 60);
  const b = flujo('F2', 'T2', 40);
  const c = flujo('F3', 'T3', 0);

  const elementos = new Map([ [ 'F1', a.el ], [ 'F2', b.el ], [ 'F3', c.el ] ]);
  // Las filas van dentro de un `<table><tbody>` de verdad: el modulo busca `tbody tr[data-el-id]`, y
  // un `<tr>` suelto dentro de un `<div>` el navegador no lo conserva como hijo de un tbody.
  const contenedor = (filas) => {
    const tabla = document.createElement('table');
    const cuerpo = document.createElement('tbody');
    filas.forEach((f) => cuerpo.appendChild(f.tr));
    tabla.appendChild(cuerpo);
    return tabla;
  };
  const ctx = {
    getElement: (id) => elementos.get(id),
    label: (el) => el.id,
    flowData: () => ({}),
    salidaUnica: () => false,
    valorPct: (tr) => tr.querySelector('[data-field="branchingProbability"]').value,
    toleranciaReparto: () => 0.01
  };

  const r = datosDeFlujos(contenedor([ a, b ]), ctx);
  ok(r.length === 2, 'devuelve un escrito por salida', String(r.length));
  // El reparto se guarda como FRACCION (0-1) y redondeado a 4 decimales: 60 % -> 0,6.
  ok(r[0].data.branchingProbability === 0.6, '60 % se guarda como 0,6',
    String(r[0].data.branchingProbability));

  // LA PROPIEDAD QUE JUSTIFICA LA AGRUPACION: validar solo el rango 0-100 permitia guardar un
  // reparto que sumaba 150 % y el motor, que acumula, mandaba lo sobrante a la ultima rama.
  const sumaMala = errorDe(() => datosDeFlujos(contenedor([
    flujo('F1', 'T1', 90), flujo('F2', 'T2', 60)
  ]), ctx));
  ok(sumaMala !== null && /suma 150 %/.test(sumaMala), 'un reparto que suma 150 % se rechaza', sumaMala);
  ok(/debe sumar 100 %/.test(sumaMala), 'diciendo lo que deberia sumar');

  const rango = errorDe(() => datosDeFlujos(contenedor([ flujo('F1', 'T1', 120), flujo('F2', 'T2', -20) ]), ctx));
  ok(rango !== null && /entre 0 y 100 %/.test(rango), 'y un valor fuera de rango, tambien', rango);

  // Una compuerta de UNA salida no se valida ni se escribe: el motor siempre la toma y no lee su
  // reparto.
  const unica = datosDeFlujos(contenedor([ a ]), { ...ctx, salidaUnica: () => true });
  ok(unica.length === 0, 'una compuerta de una sola salida no genera escrito', String(unica.length));
}

resultados.push(''); resultados.push('== 10. setByPath / getByPath: `path` es una LISTA =='); volcar();
{
  // Este es el fallo que se colo al extraer el CSV: `path.split('.')` cuando la ruta es una lista.
  // Se prueba aqui porque es la convencion que comparten las dos pestañas.
  const o = {};
  setByPath(o, [ 'calendar', 'workingHours', 'start' ], { hour: 9, minute: 0 });
  ok(o.calendar.workingHours.start.hour === 9, 'setByPath crea los niveles que falten',
    JSON.stringify(o));
  ok(getByPath(o, [ 'calendar', 'workingHours', 'start' ]).hour === 9,
    'y getByPath los lee por la misma ruta');
  ok(getByPath(o, [ 'no', 'existe' ]) === undefined, 'una ruta inexistente no revienta');
  // Un nivel que existe pero es escalar se SUSTITUYE: si no, escribir encima de un `calendar: 'x'`
  // reventaria con un TypeError en vez de arreglar el dato.
  setByPath(o, [ 'calendar', 'workingHours', 'end' ], { hour: 17, minute: 0 });
  ok(o.calendar.workingHours.end.hour === 17, 'y conviven las dos horas', JSON.stringify(o.calendar));
}

resultados.push(''); resultados.push('== 11. Global: la pestaña entera =='); volcar();
{
  const ctx = {
    globalData: () => ({
      element: { id: 'S1' },
      data: {
        startDate: '2026-01-05',
        simulationConfig: { runValue: 100 },
        arrivalRate: { value: 1, unit: 'hour' },
        calendar: { workingDays: [ 1, 2, 3, 4, 5 ], workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [] },
        lots: { enabled: false, sizeMode: 'fixed', size: 1, table: [] },
        labor: { shiftType: 'diurna', rules: [] },
        warmup: { enabled: false }
      }
    })
  };
  const campos = [
    { key: 'startDate', label: 'Fecha', kind: 'text', path: [ 'startDate' ] },
    { key: 'simulationConfig.runValue', label: 'Instancias', kind: 'number', path: [ 'simulationConfig', 'runValue' ], min: 1 },
    // El campo de DIAS tiene que estar en la lista: si no, sus casillas no se leen en absoluto y el
    // caso «sin ningun dia» pasaria por bueno sin llegar a comprobar nada.
    { key: 'calendar.workingDays', label: 'Días laborables', kind: 'days', path: [ 'calendar', 'workingDays' ] },
    { key: 'calendar.workingHours.start', label: 'Entrada', kind: 'time', path: [ 'calendar', 'workingHours', 'start' ] },
    { key: 'calendar.workingHours.end', label: 'Salida', kind: 'time', path: [ 'calendar', 'workingHours', 'end' ] }
  ];
  const ayudas = { globalFields: campos, laborRuleFields: [], setByPath, getByPath, pad: (n) => String(n).padStart(2, '0') };

  const contenedor = (valores, dias) => {
    const div = document.createElement('div');
    Object.entries(valores).forEach(([ k, v ]) => {
      const i = document.createElement('input');
      i.setAttribute('data-field', k);
      i.value = v;
      div.appendChild(i);
    });
    (dias || []).forEach((d) => {
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.setAttribute('data-days', 'calendar.workingDays');
      c.value = d;
      c.checked = true;
      div.appendChild(c);
    });
    return div;
  };

  // Sin ningun dia marcado la planta no abre nunca: la corrida no produce nada y no hay error.
  const sinDias = errorDe(() => datosGlobales(contenedor({
    'calendar.workingHours.start': '09:00', 'calendar.workingHours.end': '17:00'
  }), ctx, ayudas));
  ok(sinDias !== null && /marca al menos un día/.test(sinDias), 'sin dias laborables se avisa', sinDias);

  // Entrada posterior a la salida: el motor no calcula nada util y el usuario no recibe aviso.
  const invertido = errorDe(() => datosGlobales(contenedor({
    'calendar.workingHours.start': '17:00', 'calendar.workingHours.end': '09:00'
  }, [ '1', '2' ]), ctx, ayudas));
  ok(invertido !== null && /entrada debe ser anterior/.test(invertido),
    'una jornada invertida se rechaza', invertido);

  const bien = datosGlobales(contenedor({
    'calendar.workingHours.start': '08:00', 'calendar.workingHours.end': '17:00'
  }, [ '3', '1', '2' ]), ctx, ayudas);
  ok(bien[0].data.calendar.workingHours.start.hour === 8, 'con datos validos se guarda',
    JSON.stringify(bien[0].data.calendar.workingHours));
  // Los dias se ORDENAN: la casilla se puede marcar en cualquier orden -aqui se marcan 3, 1, 2- y el
  // JSON tiene que ser estable, o dos guardados seguidos darian archivos distintos.
  ok(bien[0].data.calendar.workingDays.join(',') === '1,2,3', 'y los dias salen ordenados',
    bien[0].data.calendar.workingDays.join(','));
  ok(bien[0].element.id === 'S1', 'el escrito va al evento raiz');
}

volcar();
