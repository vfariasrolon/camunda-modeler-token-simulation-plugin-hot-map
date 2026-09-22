// DATOS DE PRUEBA: el boton «generar datos de prueba».
//
// Codigo REAL del plugin, empaquetado por webpack. Se prueba aqui porque las dos trampas de este
// modulo NO DAN ERROR: dan un escenario plausible pero equivocado, que es la peor clase de fallo.
//
//   1. El reparto de una compuerta tiene que sumar 100 % EXACTO. El motor acumula las
//      probabilidades, asi que una suma de 110 % manda el sobrante a la ultima rama: una salida
//      configurada al 30 % acaba recibiendo el 70 %, y el usuario ve un resultado que no cuadra con
//      lo que relleno el boton.
//   2. La distribucion se fuerza a «fixed». Si quedara «triangular», el motor ignoraria el tiempo
//      generado y tomaria min/moda/max, con lo que el valor que el usuario ve en la casilla no seria
//      el que se usa.
//
// Necesita DOM de verdad: escribe en casillas y lee `[data-field="..."]`.
import { generarDatosDePrueba, azar } from '@plugin/simulation/DatosDePrueba.js';

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

// --- DOM de prueba ---------------------------------------------------------

const tabla = (filas) => {
  const t = document.createElement('table');
  const cuerpo = document.createElement('tbody');
  filas.forEach((f) => cuerpo.appendChild(f));
  t.appendChild(cuerpo);
  return t;
};

/** Una fila de tareas con sus casillas. */
const filaTarea = (elId, campos = {}) => {
  const tr = document.createElement('tr');
  tr.dataset.elId = elId;
  const camposPorDefecto = [
    'processingTime.distribution', 'processingTime.value', 'processingTime.unit',
    'failureRate', 'reworkTime.value', 'reworkTime.unit',
    'carga.masaCargadaKg', 'carga.masaArrastradaKg', 'carga.distanciaM',
    'resources.pool', 'resources.quantityRequired'
  ];
  Object.keys({ ...Object.fromEntries(camposPorDefecto.map((c) => [ c, '' ])), ...campos })
    .forEach((campo) => {
      const i = document.createElement('input');
      i.setAttribute('data-field', campo);
      i.value = String(campos[campo] === undefined ? '' : campos[campo]);
      tr.appendChild(i);
    });
  return tr;
};

/** Una salida de compuerta, con su casilla de reparto. */
const filaFlujo = (elId, pct, disabled) => {
  const tr = document.createElement('tr');
  tr.dataset.elId = elId;
  const i = document.createElement('input');
  i.setAttribute('data-field', 'branchingProbability');
  i.value = String(pct);
  if (disabled) i.disabled = true;
  tr.appendChild(i);
  return tr;
};

const CONTEXTO = (tab, elementos, pools) => ({
  tab,
  pools: () => pools || [],
  getElement: (id) => (elementos || {})[id],
  refrescarSumas: () => {}
});

console.log('\n== 1. azar() es entero y respeta los dos extremos ==');
{
  // Los rangos son CERRADOS por los dos lados: es lo que dice el docstring y lo que asume el resto
  // del modulo. Un `max` exclusivo daria un escenario ligeramente distinto al documentado.
  const vistos = new Set();
  for (let i = 0; i < 400; i++) vistos.add(azar(1, 3));
  ok(vistos.has(1) && vistos.has(3), 'salen los dos extremos', [ ...vistos ].sort().join(','));
  ok([ ...vistos ].every((n) => Number.isInteger(n) && n >= 1 && n <= 3),
    'y ningun valor fuera del rango ni fraccionario', [ ...vistos ].sort().join(','));
  ok(azar(7, 7) === 7, 'con min === max devuelve ese valor', String(azar(7, 7)));
}

console.log('\n== 2. Global y Recursos no se rellenan ==');
{
  // En Global se declara la jornada y la tarifa -inventarlas seria inventar el turno del cliente- y
  // en Recursos la capacidad real de la planta. Ninguno de los dos se puede sacar de una formula.
  const r1 = generarDatosDePrueba(tabla([]), CONTEXTO('global', {}, []));
  ok(r1.aplica === false, 'en Global no aplica', JSON.stringify(r1.aplica));
  ok(/Tareas y Flujos/.test(r1.motivo), 'y el motivo dice donde SI aplica', r1.motivo);

  const r2 = generarDatosDePrueba(tabla([]), CONTEXTO('resources', {}, []));
  ok(r2.aplica === false, 'en Recursos tampoco', JSON.stringify(r2.aplica));

  // Y con la pestaña correcta pero sin filas, se dice, en vez de fingir que hizo algo.
  const vacio = generarDatosDePrueba(tabla([]), CONTEXTO('tasks', {}, []));
  ok(vacio.aplica === false && /No hay filas/.test(vacio.motivo),
    'sin filas se avisa', vacio.motivo);
}

console.log('\n== 3. Tareas: la distribucion se FUERZA a «fixed» ==');
{
  // Es la trampa 2. Si la distribucion quedara en triangular, el motor ignoraria el tiempo generado
  // y tomaria min/moda/max: el usuario veria resultados que no cuadran con la casilla que relleno el
  // boton, y no habria ningun error que lo explique.
  const tr = filaTarea('T1', { 'processingTime.distribution': 'triangular' });
  const r = generarDatosDePrueba(tabla([ tr ]), CONTEXTO('tasks', {}, []));
  const leer = (campo) => tr.querySelector(`[data-field="${campo}"]`).value;

  ok(r.aplica === true, 'con filas si aplica', JSON.stringify(r.aplica));
  ok(leer('processingTime.distribution') === 'fixed',
    'la distribucion queda en fixed aunque viniera triangular', leer('processingTime.distribution'));

  // Los rangos documentados: tiempo 5-45, fallo 1-30, retrabajo 5-30.
  const tiempo = Number(leer('processingTime.value'));
  ok(tiempo >= 5 && tiempo <= 45, 'el tiempo cae en 5-45 min', String(tiempo));
  const fallo = Number(leer('failureRate'));
  ok(fallo >= 1 && fallo <= 30, 'la tasa de fallo cae en 1-30 %', String(fallo));
  const retrabajo = Number(leer('reworkTime.value'));
  ok(retrabajo >= 5 && retrabajo <= 30, 'el retrabajo cae en 5-30 min', String(retrabajo));
  ok(leer('processingTime.unit') === 'minutes' && leer('reworkTime.unit') === 'minutes',
    'y las unidades quedan en plural (minute se leeria como milisegundos)',
    `${leer('processingTime.unit')}/${leer('reworkTime.unit')}`);
}

console.log('\n== 4. Tareas: la carga es O una cosa O la otra, nunca las dos ==');
{
  // El informe separa masa cargada de masa arrastrada precisamente porque no se suman: una persona
  // cargando 12 kg en brazos y arrastrando 90 kg a la vez no es una tarea, son dos. El generador
  // tiene que respetar esa distincion o el informe enseñaria un dato fisicamente imposible.
  const tr = filaTarea('T1');
  generarDatosDePrueba(tabla([ tr ]), CONTEXTO('tasks', {}, []));
  const cargada = tr.querySelector('[data-field="carga.masaCargadaKg"]').value;
  const arrastrada = tr.querySelector('[data-field="carga.masaArrastradaKg"]').value;

  const soloUna = (cargada !== '' && arrastrada === '') || (cargada === '' && arrastrada !== '');
  ok(soloUna, 'se rellena una sola de las dos masas, no las dos',
    `cargada="${cargada}" arrastrada="${arrastrada}"`);
  ok(cargada === '' || (Number(cargada) >= 5 && Number(cargada) <= 25),
    'y la cargada cae en 5-25 kg', cargada);
  ok(arrastrada === '' || (Number(arrastrada) >= 40 && Number(arrastrada) <= 200),
    'y la arrastrada en 40-200 kg', arrastrada);
  ok(Number(tr.querySelector('[data-field="carga.distanciaM"]').value) >= 2,
    'y la distancia se rellena siempre (sin distancia no hay kg·m)',
    tr.querySelector('[data-field="carga.distanciaM"]').value);
}

console.log('\n== 5. Tareas: la piscina se asigna para que se EJERCITE la espera ==');
{
  // Sin esto, nada escribe el campo `resources` y el codigo de cola, espera y costo de espera nunca
  // se ejecuta en una corrida de prueba: el usuario simula y cree que su proceso no tiene esperas.
  const tr = filaTarea('T1');
  const r = generarDatosDePrueba(tabla([ tr ]), CONTEXTO('tasks', {}, [ { name: 'armado' } ]));
  ok(tr.querySelector('[data-field="resources.pool"]').value === 'armado',
    'se asigna la primera piscina', tr.querySelector('[data-field="resources.pool"]').value);
  ok(tr.querySelector('[data-field="resources.quantityRequired"]').value === '1',
    'con cantidad 1', tr.querySelector('[data-field="resources.quantityRequired"]').value);
  // Y la casilla de cantidad queda HABILITADA: esta deshabilitada mientras no hay piscina.
  ok(tr.querySelector('[data-field="resources.quantityRequired"]').disabled === false,
    'y se habilita la casilla de cantidad, que estaba deshabilitada');
  ok(r.pool === 'armado', 'el resumen nombra la piscina usada', String(r.pool));

  // Sin piscinas dadas de alta no se inventa ninguna: el campo se deja como estaba.
  const sinPool = filaTarea('T2');
  const r2 = generarDatosDePrueba(tabla([ sinPool ]), CONTEXTO('tasks', {}, []));
  ok(sinPool.querySelector('[data-field="resources.pool"]').value === '',
    'sin piscinas no se asigna ninguna');
  ok(r2.pool === null, 'y el resumen no nombra piscina', JSON.stringify(r2.pool));
}

console.log('\n== 6. Flujos: el reparto suma 100 EXACTO, siempre ==');
{
  // Esta es la trampa 1, y la razon de que el test corra 200 veces: un generador que suma 100 «casi
  // siempre» falla una de cada cinco veces, y esa vez el motor manda el sobrante a la ultima rama sin
  // avisar. Con una sola corrida el fallo pasaria desapercibido la mayoria de las veces.
  const gateway = { id: 'GW' };
  const elementos = {
    A: { id: 'A', source: gateway }, B: { id: 'B', source: gateway },
    C: { id: 'C', source: gateway }, D: { id: 'D', source: gateway }
  };

  let todasCien = true;
  let rangosOk = true;
  let sinCeros = true;
  const ejemplos = [];
  for (let i = 0; i < 200; i++) {
    const filas = [
      filaFlujo('A', 0), filaFlujo('B', 0), filaFlujo('C', 0), filaFlujo('D', 0)
    ];
    generarDatosDePrueba(tabla(filas), CONTEXTO('flows', elementos));
    const pcts = filas.map((tr) => Number(tr.querySelector('[data-field="branchingProbability"]').value));
    const suma = pcts.reduce((a, b) => a + b, 0);
    if (suma !== 100) todasCien = false;
    if (!pcts.every((p) => Number.isInteger(p) && p >= 1 && p <= 100)) rangosOk = false;
    if (pcts.some((p) => p === 0)) sinCeros = false;
    if (i < 3) ejemplos.push(pcts.join('+'));
  }

  ok(todasCien, 'las 200 corridas suman 100 exacto', ejemplos.join(' , '));
  // Porcentajes ENTEROS: el motor no necesita decimales y la casilla se lee mejor.
  ok(rangosOk, 'y todos los valores son enteros entre 1 y 100');
  // Al 0 % una rama NUNCA se toma: el reparto no puede generar caminos muertos.
  ok(sinCeros, 'y ninguna salida queda al 0 % (seria una rama muerta)');
}

console.log('\n== 7. Flujos: se reparte por COMPUERTA, no por tabla ==');
{
  // Cada compuerta suma 100 por su cuenta. Si se repartiera sobre todas las filas juntas, un
  // diagrama con dos compuertas de dos salidas daria 50 % a cada rama de las dos, que es el reparto
  // de una compuerta de cuatro salidas.
  const g1 = { id: 'G1' };
  const g2 = { id: 'G2' };
  const elementos = {
    A: { id: 'A', source: g1 }, B: { id: 'B', source: g1 },
    C: { id: 'C', source: g2 }, D: { id: 'D', source: g2 }
  };
  const a = filaFlujo('A', 0); const b = filaFlujo('B', 0);
  const c = filaFlujo('C', 0); const d = filaFlujo('D', 0);
  const r = generarDatosDePrueba(tabla([ a, b, c, d ]), CONTEXTO('flows', elementos));

  const pct = (tr) => Number(tr.querySelector('[data-field="branchingProbability"]').value);
  ok(pct(a) + pct(b) === 100, 'la primera compuerta suma 100', `${pct(a)}+${pct(b)}`);
  ok(pct(c) + pct(d) === 100, 'y la segunda suma 100 por su cuenta', `${pct(c)}+${pct(d)}`);
  ok(r.compuertas === 2, 'y el resumen cuenta las dos compuertas', String(r.compuertas));
}

console.log('\n== 8. Flujos: una compuerta de una salida no participa ==');
{
  // Una compuerta con una sola salida esta fija al 100 % y su casilla va deshabilitada: el motor
  // siempre la toma y no lee el reparto. Tocarla seria reescribir un valor que nadie lee, y contarla
  // en el resumen inflaria el aviso.
  const g = { id: 'G1' };
  const elementos = { A: { id: 'A', source: g } };
  const a = filaFlujo('A', 100, true);
  const r = generarDatosDePrueba(tabla([ a ]), CONTEXTO('flows', elementos));

  ok(a.querySelector('[data-field="branchingProbability"]').value === '100',
    'la salida unica conserva su 100',
    a.querySelector('[data-field="branchingProbability"]').value);
  ok(r.compuertas === 0, 'y no se cuenta como compuerta repartida', String(r.compuertas));
}

console.log('\n== 9. Una fila sin elemento no rompe el reparto ==');
{
  // Puede pasar: el usuario borra una figura con la tabla abierta. La fila sigue en el DOM pero su
  // elemento ya no esta, y buscar `el.source` sobre undefined reventaria el boton entero.
  const g = { id: 'G1' };
  const elementos = { A: { id: 'A', source: g } };
  const huerfana = filaFlujo('BORRADO', 50);
  const a = filaFlujo('A', 0);

  const r = generarDatosDePrueba(tabla([ huerfana, a ]), CONTEXTO('flows', elementos));
  ok(r.aplica === true, 'no revienta', JSON.stringify(r.aplica));
  ok(a.querySelector('[data-field="branchingProbability"]').value === '100',
    'y la compuerta que si existe se reparte sola: al quedar una sola salida editable, se lleva el 100',
    a.querySelector('[data-field="branchingProbability"]').value);
  ok(huerfana.querySelector('[data-field="branchingProbability"]').value === '50',
    'sin tocar la fila huerfana',
    huerfana.querySelector('[data-field="branchingProbability"]').value);
}

console.log('\n== 10. Se llama a refrescarSumas UNA vez, al final ==');
{
  // El panel pinta el total de cada compuerta al lado de la tabla. Si no se refrescara, el usuario
  // veria «suma 100 %» de antes de generar y desconfiaria del boton; y si se llamara por fila, se
  // repintaria N veces para nada.
  let llamadas = 0;
  const g = { id: 'G1' };
  const elementos = { A: { id: 'A', source: g }, B: { id: 'B', source: g } };
  generarDatosDePrueba(tabla([ filaFlujo('A', 0), filaFlujo('B', 0) ]), {
    tab: 'flows',
    pools: () => [],
    getElement: (id) => elementos[id],
    refrescarSumas: () => { llamadas++; }
  });
  ok(llamadas === 1, 'se refresca exactamente una vez', String(llamadas));

  // En Tareas no hay sumas que refrescar: llamarlo seria trabajo de mas.
  let enTareas = 0;
  generarDatosDePrueba(tabla([ filaTarea('T1') ]), {
    tab: 'tasks',
    pools: () => [],
    getElement: () => ({}),
    refrescarSumas: () => { enTareas++; }
  });
  ok(enTareas === 0, 'y en Tareas no se llama en absoluto', String(enTareas));
}

volcar();
