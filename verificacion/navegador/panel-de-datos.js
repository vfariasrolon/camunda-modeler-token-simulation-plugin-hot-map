/**
 * Arnés de UI para A3: ejercita el codigo REAL de DataTablePanel (Tareas y
 * Global) sobre un DOM de verdad, con un registro de elementos y un canvas
 * simulados. No reimplementa nada: importa el modulo tal cual lo empaqueta
 * webpack para el plugin.
 */
import DataTablePanel from '@plugin/simulation/DataTablePanel.js';
// El mismo lector que usa el motor, para comprobar el MODELO y no la pantalla: es la
// unica forma de saber si el autoguardado llego de verdad al diagrama.
import { getSimulationData } from '@plugin/simulation/util.js';

const resultados = [];
let fallos = 0;

const volcar = () => {
  const pre = document.getElementById('informe');
  const veredicto = fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : `${fallos} FALLO(S)`;
  pre.textContent = resultados.join('\n') + `\n\n== RESULTADO: ${veredicto} ==\n`;
};

const check = (nombre, cond, detalle) => {
  if (!cond) fallos++;
  resultados.push(`${cond ? '  OK   ' : '  FALLO'}  ${nombre}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  volcar();
};

const iguales = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Copia exacta del serializador del panel (csvEscape/toCsv no se exportan):
// sin ella el arnes probaria un CSV que el producto NUNCA escribe.
const csvEscape = (value) => {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const aCsv = (rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

// --- utilidades de simulacion de bpmn-js -----------------------------------

const PROPS = 'camunda:Properties';
const esProps = (t) => t === PROPS;

// Todo objeto de moddle expone `get(nombre)`, y el codigo navega con eso:
// businessObject.get('extensionElements').get('values'). Sin `get` en el doble,
// setSimulationData() revienta y el autoguardado no se puede probar de verdad.
const conGet = (obj) => Object.assign(obj, { get(prop) { return this[prop]; } });

function elemento(id, name, simData, tipo) {
  const t = tipo || 'bpmn:Task';
  const bo = conGet({
    name,
    $instanceOf: (x) => x === t || esProps(x)
  });
  if (simData !== undefined) {
    // Cada nivel del arbol es un objeto de moddle y setSimulationData() navega por los
    // tres con get(): extensionElements.get('values') y properties.get('values').
    bo.extensionElements = conGet({
      values: [ conGet({
        // `$type` ademas de `$instanceOf`: el codigo busca las Properties por `$type`,
        // y sin el crearia una SEGUNDA camunda:Properties en cada guardado.
        $type: PROPS,
        $instanceOf: esProps,
        values: [ conGet({ name: 'simulationData', value: JSON.stringify(simData) }) ]
      }) ]
    });
  }
  return { id, businessObject: bo };
}

function registro(elementos) {
  return {
    filter: (fn) => elementos.filter(fn),
    find: (fn) => elementos.find(fn),
    get: (id) => elementos.find((e) => e.id === id),
    getAll: () => elementos
  };
}

const notificaciones = [];

// Cada llamada a modeling.updateProperties. Sirve para comprobar QUE se escribio de
// verdad al autoguardar; el modelo final se mira con getSimulationData().
const escriturasModelo = [];
const olvidarEscrituras = () => { escriturasModelo.length = 0; };

// Bus de eventos de VERDAD, no un stub mudo.
//
// El atajo del diagnostico viaja por evento (`simulation.dataTable.ir`), asi que con
// un `on: () => {}, fire: () => {}` el viaje no se podria probar: el panel nunca se
// enteraria. Y esa es justo la clase de fallo que no se ve mirando la pantalla.
function busDeEventos() {
  const oyentes = {};
  return {
    on: (nombre, fn) => { (oyentes[nombre] = oyentes[nombre] || []).push(fn); },
    fire: (nombre, datos) => { (oyentes[nombre] || []).forEach((fn) => fn(datos)); }
  };
}

function crearPanel(elementos) {
  const canvas = { getContainer: () => document.getElementById('lienzo') };
  const eventBus = busDeEventos();
  const overlays = { add: () => 'ov-1', remove: () => {} };
  const selection = { get: () => [] };
  const modeling = {
    updateProperties: (el, props) => {
      escriturasModelo.push({ el, props });
      Object.assign(el.businessObject, props);
    }
  };
  const bpmnFactory = {
    create: (tipo, attrs) => Object.assign(
      { $type: tipo, $instanceOf: () => true, get(prop) { return this[prop]; } }, attrs
    )
  };

  const panel = new DataTablePanel(
    canvas, eventBus, registro(elementos), modeling, bpmnFactory,
    { showNotification: (n) => notificaciones.push(n) },
    // `trigger`, no `triggerAction`: es lo que llama _ofrecerDesactivarModo. Con el
    // nombre equivocado el boton «Desactivar modo y reintentar» lanzaba un TypeError
    // y el reintento no se ejecutaba nunca.
    { trigger: () => {} }, overlays, selection
  );
  panel._init();
  return panel;
}

// --- datos de prueba -------------------------------------------------------

const simTask1 = {
  processingTime: { distribution: 'fixed', value: 15, unit: 'minutes' },
  reworkTime: { distribution: 'fixed', value: 20, unit: 'minutes' },
  failureRate: 0.1,
  frequency: 'lot',
  barrier: { availableProbability: 0.6, waitMin: 5, waitMode: 12, waitMax: 30, toleranceMinutes: 10 }
};
// Sin frecuencia declarada: el CSV y la tabla deben tratarla como «por token».
const simTask2 = {
  processingTime: { distribution: 'fixed', value: 5, unit: 'minutes' },
  reworkTime: { distribution: 'fixed', value: 20, unit: 'minutes' },
  failureRate: 0
};
// «por token» PERO con una barrera vieja en el JSON: al guardar debe BORRARSE.
const simTask3 = {
  processingTime: { distribution: 'fixed', value: 3, unit: 'minutes' },
  reworkTime: { distribution: 'fixed', value: 20, unit: 'minutes' },
  failureRate: 0,
  frequency: 'token',
  barrier: { availableProbability: 0.9, waitMin: 1, waitMode: 2, waitMax: 3, toleranceMinutes: 0 }
};

const startEvent = elemento('StartEvent_1', 'Inicio', { isRoot: true }, 'bpmn:StartEvent');
const proceso = elemento('Process_1', 'Proceso', {
  resourcePools: [ { name: 'Soldadores', quantity: 2 } ]
}, 'bpmn:Process');

const task1 = elemento('Task_1', 'Cortar', simTask1);
const task2 = elemento('Task_2', 'Inspeccionar', simTask2);
const task3 = elemento('Task_3', 'Archivar', simTask3);

const panel = crearPanel([ startEvent, proceso, task1, task2, task3 ]);

const fila = (id) => document.querySelector(`tr[data-el-id="${id}"]`);
const celda = (id, campo) => fila(id).querySelector(`[data-field="${campo}"]`);
const escribir = (id, campo, valor) => {
  const el = celda(id, campo);
  el.value = String(valor);
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
// La pestaña Global no tiene filas por elemento: sus campos van sueltos.
const escribirGlobal = (campo, valor) => {
  const el = document.querySelector(`[data-field="${campo}"]`);
  if (!el) throw new Error(`No existe el campo global «${campo}»`);
  el.value = String(valor);
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const escribirCheck = (campo, valor) => {
  const el = document.querySelector(`[data-field="${campo}"]`);
  el.checked = Boolean(valor);
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const escribirSelect = (campo, valor) => {
  const el = document.querySelector(`[data-field="${campo}"]`);
  el.value = valor;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const recoger = (tab) => {
  panel._activeTab = tab;
  return panel._collect();
};

// Equivalente a lo que hace importCsv() con las escrituras que devuelve
// _applyCsv(): volcarlas al modelo. Sin esto el ida y vuelta no se probaria de
// verdad, porque _applyCsv NO toca el diagrama por si solo.
const guardar = (updates) => {
  updates.forEach(({ element, data }) => {
    const bo = element.businessObject;
    if (!bo.extensionElements) bo.extensionElements = { values: [] };
    let props = bo.extensionElements.values.find((v) => v.$instanceOf(PROPS));
    if (!props) {
      props = { $instanceOf: esProps, values: [] };
      bo.extensionElements.values.push(props);
    }
    const prop = props.values.find((p) => p.name === 'simulationData');
    const json = JSON.stringify(data);
    if (prop) prop.value = json;
    else props.values.push({ name: 'simulationData', value: json });
  });
};
const buscar = (writes, id) => (writes.find((w) => w.element.id === id) || {}).data || null;

function ejecutar() {

// --- 1. render de la pestaña Tareas ---------------------------------------

panel._activeTab = 'tasks';
panel._renderTasks();

const idsFilas = Array.from(document.querySelectorAll('tr[data-el-id]')).map((tr) => tr.dataset.elId);
check('Tareas: una fila por tarea', idsFilas.length === 3, idsFilas.join(','));
check('Tareas: columna de frecuencia presente', Boolean(celda('Task_1', 'frequency')));
check('Tareas: cinco casillas de barrera por fila',
  fila('Task_1').querySelectorAll('[data-field^="barrier."]').length === 5,
  fila('Task_1').querySelectorAll('[data-field^="barrier."]').length);
check('Tareas: el encabezado de barrera abarca las cinco columnas',
  document.querySelector('th.col-barrera') && document.querySelector('th.col-barrera').getAttribute('colspan') === '5');

check('Tareas: Task_1 sale como «por lote»', celda('Task_1', 'frequency').value === 'lot');
check('Tareas: Task_2 sale como «por token»', celda('Task_2', 'frequency').value === 'token');
check('Tareas: Task_3 (token con barrera vieja) sale como «por token»', celda('Task_3', 'frequency').value === 'token');

check('Tareas: la barrera de una tarea por lote es editable',
  !celda('Task_1', 'barrier.waitMode').disabled);
check('Tareas: la barrera de una tarea por token esta deshabilitada',
  celda('Task_2', 'barrier.waitMode').disabled);
check('Tareas: se explica por que esta deshabilitada',
  /por lote/.test(celda('Task_2', 'barrier.waitMode').title), celda('Task_2', 'barrier.waitMode').title);
check('Tareas: se pintan los valores de barrera guardados',
  celda('Task_1', 'barrier.availableProbability').value === '0.6'
  && celda('Task_1', 'barrier.waitMin').value === '5'
  && celda('Task_1', 'barrier.waitMax').value === '30'
  && celda('Task_1', 'barrier.toleranceMinutes').value === '10');

// --- 1b. La ayuda de COLUMNA de Tareas (el «?» de la cabecera) --------------
//
// El «?» va en la cabecera y NO en cada celda: con 23 columnas por tarea, un boton
// por celda serian cientos repitiendo el mismo texto. Se comprueba justo eso, porque
// es lo que puede degradarse al tocar la tabla: que siga habiendo 16 botones y no 16
// por fila.
const COLUMNAS_CON_AYUDA = [
  'tarea', 'distribucion', 'tiempo', 'unidad', 'tiempoMin', 'tiempoModa', 'tiempoMax',
  'tasaFallo', 'retrabajo', 'unidadRetrabajo', 'recurso', 'cant', 'frecuencia',
  'barrera', 'carga', 'habilidad'
];

const botonesCol = Array.from(document.querySelectorAll('.btn-ayuda-col'));
check('Tareas: cada columna con ayuda tiene su «?» en la cabecera',
  botonesCol.length === COLUMNAS_CON_AYUDA.length,
  `${botonesCol.length} botones / ${COLUMNAS_CON_AYUDA.length} columnas`);

check('Tareas: los «?» son SOLO de cabecera, no uno por celda',
  document.querySelectorAll('tbody .btn-ayuda-col, tbody .btn-ayuda-campo').length === 0);

const claveDeBoton = (b) => b.dataset.ayudaCol;
check('Tareas: cada «?» apunta a una columna conocida, sin repetirse',
  new Set(botonesCol.map(claveDeBoton)).size === COLUMNAS_CON_AYUDA.length
  && COLUMNAS_CON_AYUDA.every((c) => botonesCol.some((b) => claveDeBoton(b) === c)),
  botonesCol.map(claveDeBoton).join(', '));

// La ayuda vive en UNA fila compartida dentro del <thead>, no en la celda de la
// cabecera: expandir esa celda descuadraria el ancho de su columna y moveria la tabla.
const filaAyuda = document.querySelector('thead .fila-ayuda-col');
check('Tareas: la ayuda va en una fila compartida dentro de la cabecera',
  Boolean(filaAyuda) && filaAyuda.querySelector('td').getAttribute('colspan') === '22',
  filaAyuda ? filaAyuda.querySelector('td').getAttribute('colspan') : 'sin fila');

check('Tareas: la ayuda arranca OCULTA', filaAyuda.classList.contains('hidden'));

const celdaAyuda = filaAyuda.querySelector('td');
const botonRecurso = botonesCol.find((b) => claveDeBoton(b) === 'recurso');

botonRecurso.click();
check('Tareas: al pulsar «?» la ayuda se despliega con el texto de SU columna',
  !filaAyuda.classList.contains('hidden')
  && celdaAyuda.textContent.trim().length > 20
  && /piscina/i.test(celdaAyuda.textContent),
  celdaAyuda.textContent.slice(0, 60));

check('Tareas: el «?» pulsado queda marcado y los demás no',
  botonRecurso.classList.contains('activo')
  && botonesCol.filter((b) => b.classList.contains('activo')).length === 1);

// Volver a pulsar el MISMO replega (asi se cierra sin buscar otra columna).
botonRecurso.click();
check('Tareas: al volver a pulsarlo se repliega',
  filaAyuda.classList.contains('hidden') && !botonRecurso.classList.contains('activo'));

// Pulsar OTRO la cambia: es lo que se hace al ir comparando columnas.
const botonUnidad = botonesCol.find((b) => claveDeBoton(b) === 'unidad');
botonUnidad.click();
const textoUnidad = celdaAyuda.textContent;
check('Tareas: pulsar otra columna CAMBIA el texto en el mismo sitio',
  !filaAyuda.classList.contains('hidden')
  && textoUnidad !== ''
  && /plural/i.test(textoUnidad)
  && !botonRecurso.classList.contains('activo')
  && botonUnidad.classList.contains('activo'),
  textoUnidad.slice(0, 60));

// El texto de ayuda de la unidad tiene que ser DISTINTO al del retrabajo: son dos
// columnas «Unidad» con el mismo encabezado, y un texto clonado no ayudaria a saber
// cual se esta leyendo.
const botonUnidadRetrabajo = botonesCol.find((b) => claveDeBoton(b) === 'unidadRetrabajo');
botonUnidadRetrabajo.click();
check('Tareas: las dos columnas «Unidad» explican cosas distintas',
  celdaAyuda.textContent !== textoUnidad, celdaAyuda.textContent.slice(0, 60));

// Y se replega al volver a pulsar el mismo para dejar la tabla limpia.
botonUnidadRetrabajo.click();
check('Tareas: la ayuda se puede cerrar del todo',
  filaAyuda.classList.contains('hidden')
  && botonesCol.every((b) => !b.classList.contains('activo')));

// --- 2. guardar sin tocar nada --------------------------------------------

let writes = recoger('tasks');
check('Guardar: una escritura por tarea', writes.length === 3, writes.length);

const d1 = buscar(writes, 'Task_1');
check('Guardar: Task_1 conserva la frecuencia de lote', d1.frequency === 'lot', d1.frequency);
check('Guardar: Task_1 conserva su barrera',
  iguales(d1.barrier, { availableProbability: 0.6, waitMin: 5, waitMode: 12, waitMax: 30, toleranceMinutes: 10 }),
  JSON.stringify(d1.barrier));

const d2 = buscar(writes, 'Task_2');
check('Guardar: Task_2 NO arrastra la clave frequency', !('frequency' in d2), Object.keys(d2).join(','));
check('Guardar: Task_2 NO arrastra barrera', !('barrier' in d2), JSON.stringify(d2.barrier));

const d3 = buscar(writes, 'Task_3');
check('Guardar: una tarea por token PIERDE la barrera vieja', !('barrier' in d3), JSON.stringify(d3.barrier));
check('Guardar: los datos no se contaminan con la barrera por defecto',
  !('barrier' in d2) && !('frequency' in d2));

// --- 3. cambiar una tarea a «por lote» en caliente -------------------------

escribir('Task_2', 'frequency', 'lot');
check('Cambio en caliente: al pasar a «por lote» la barrera se habilita',
  !celda('Task_2', 'barrier.waitMode').disabled);

escribir('Task_2', 'barrier.availableProbability', 0.8);
escribir('Task_2', 'barrier.waitMin', 2);
escribir('Task_2', 'barrier.waitMode', 4);
escribir('Task_2', 'barrier.waitMax', 8);
escribir('Task_2', 'barrier.toleranceMinutes', 3);

writes = recoger('tasks');
const d2b = buscar(writes, 'Task_2');
check('Cambio en caliente: Task_2 queda «por lote»', d2b.frequency === 'lot');
check('Cambio en caliente: Task_2 guarda la barrera nueva',
  iguales(d2b.barrier, { availableProbability: 0.8, waitMin: 2, waitMode: 4, waitMax: 8, toleranceMinutes: 3 }),
  JSON.stringify(d2b.barrier));

// --- 4. validaciones de la barrera ----------------------------------------

escribir('Task_2', 'barrier.waitMode', 1); // moda < minimo
let error = null;
try { recoger('tasks'); } catch (e) { error = e.message; }
check('Validacion: moda menor que el minimo se rechaza', Boolean(error) && /mínimo ≤ moda ≤ máximo/.test(error), error);

escribir('Task_2', 'barrier.waitMode', 4);
escribir('Task_2', 'barrier.availableProbability', 1.5);
error = null;
try { recoger('tasks'); } catch (e) { error = e.message; }
check('Validacion: disponibilidad mayor que 1 se rechaza', Boolean(error) && /entre 0 y 1/.test(error), error);

escribir('Task_2', 'barrier.availableProbability', 0.8);

// --- 5. volver a «por token» borra la barrera ------------------------------

escribir('Task_2', 'frequency', 'token');
check('Vuelta a token: las casillas se deshabilitan otra vez',
  celda('Task_2', 'barrier.waitMode').disabled);

writes = recoger('tasks');
const d2c = buscar(writes, 'Task_2');
check('Vuelta a token: Task_2 pierde frecuencia y barrera',
  !('frequency' in d2c) && !('barrier' in d2c), Object.keys(d2c).join(','));

// --- 6. CSV de tareas: ida y vuelta ---------------------------------------

panel._activeTab = 'tasks';
const filasCsv = panel._csvForActiveTab();
const cabecera = filasCsv[0];
check('CSV tareas: lleva las columnas nuevas',
  [ 'frecuencia', 'barrera_disp', 'barrera_min', 'barrera_moda', 'barrera_max', 'barrera_tol' ]
    .every((c) => cabecera.includes(c)), cabecera.join(','));
check('CSV tareas: no se duplican columnas', new Set(cabecera).size === cabecera.length);

const csvTareas = aCsv(filasCsv);
const filaCsv1 = filasCsv.find((r) => r[0] === 'Task_1');
const filaCsv2 = filasCsv.find((r) => r[0] === 'Task_2');
check('CSV tareas: Task_1 exporta «lot» y su barrera',
  filaCsv1[13] === 'lot' && String(filaCsv1[14]) === '0.6' && String(filaCsv1[18]) === '10',
  filaCsv1.join(' | '));
check('CSV tareas: Task_2 exporta «token» sin barrera',
  filaCsv2[13] === 'token' && filaCsv2[14] === '' && filaCsv2[18] === '',
  filaCsv2.join(' | '));

const vuelta = panel._applyCsv(csvTareas);
const v1 = buscar(vuelta, 'Task_1');
const v2 = buscar(vuelta, 'Task_2');
check('CSV tareas: la ida y vuelta conserva la barrera de Task_1',
  v1.frequency === 'lot'
  && iguales(v1.barrier, { availableProbability: 0.6, waitMin: 5, waitMode: 12, waitMax: 30, toleranceMinutes: 10 }),
  JSON.stringify(v1.barrier));
check('CSV tareas: la ida y vuelta deja Task_2 sin barrera',
  !('frequency' in v2) && !('barrier' in v2));

// Un CSV antiguo (sin las columnas nuevas) debe seguir entrando.
const csvViejo = [
  [ 'id', 'nombre', 'unidad_proceso', 'tiempo_proceso', 'tasa_fallo', 'retrabajo', 'unidad_retrabajo' ],
  [ 'Task_1', 'Cortar', 'minutes', '15', '0.1', '20', 'minutes' ]
].map((r) => r.join(',')).join('\r\n');
const viejo = panel._applyCsv(csvViejo);
const vv = buscar(viejo, 'Task_1');
check('CSV antiguo: sigue importandose y limpia la barrera huerfana',
  !('frequency' in vv) && !('barrier' in vv), Object.keys(vv).join(','));

const csvBarreraSinColumna = [
  [ 'id', 'nombre', 'distribucion', 'tiempo_proceso', 'unidad_proceso', 'min', 'moda', 'max',
    'tasa_fallo', 'retrabajo', 'unidad_retrabajo', 'recurso', 'cant_recurso', 'frecuencia' ].join(','),
  [ 'Task_1', 'Cortar', 'fixed', '15', 'minutes', '', '', '', '0.1', '20', 'minutes', '', '', 'lot' ].join(',')
].join('\r\n');
error = null;
try { panel._applyCsv(csvBarreraSinColumna); } catch (e) { error = e.message; }
check('CSV tareas: «lot» sin columnas de barrera da un error claro',
  Boolean(error) && /barrera_disp/.test(error), error);

const csvFilaCortada = [
  cabecera.join(','),
  [ 'Task_1', 'Cortar', 'fixed', '15', 'minutes', '', '', '', '0.1', '20', 'minutes', '', '', 'lot' ].join(',')
].join('\r\n');
error = null;
try { panel._applyCsv(csvFilaCortada); } catch (e) { error = e.message; }
check('CSV tareas: una fila sin las columnas de barrera se explica, no da «no numérico»',
  Boolean(error) && /incompleta/.test(error), error);

const csvFrec = [
  cabecera.join(','),
  [ 'Task_3', 'Archivar', 'fixed', '3', 'minutes', '', '', '', '0', '20', 'minutes', '', '', 'raro' ].join(',')
].join('\r\n');
error = null;
try { panel._applyCsv(csvFrec); } catch (e) { error = e.message; }
check('CSV tareas: una frecuencia desconocida se rechaza',
  Boolean(error) && /frecuencia/.test(error), error);

// Ida y vuelta COMPLETA contra el modelo: exportar → importar (y guardar) →
// exportar tiene que dar exactamente lo mismo. Es la prueba que faltaba para
// saber que no se pierde ni se inventa nada al pasar por Excel.
panel._activeTab = 'tasks';
guardar(panel._applyCsv(csvTareas));
const csvTareas2 = panel._csvForActiveTab();
check('CSV tareas: exportar → importar → exportar es idempotente',
  iguales(csvTareas2, filasCsv),
  JSON.stringify(csvTareas2.filter((r, i) => !iguales(r, filasCsv[i]))));

// --- 6b. La tasa de fallo, en % de punta a punta ---------------------------
//
// La casilla y el CSV van en % (0-100) mientras el motor sigue guardando la
// fraccion (0-1). Es el mismo trato que el reparto de las compuertas, y por eso hay
// que comprobar las DOS direcciones: que un 10 en pantalla sea 0,1 en el modelo, y
// que un CSV viejo con 0,1 en la columna `tasa_fallo` siga siendo 0,1 (y no 0,1 %,
// que seria 0,001: cien veces menos y sin ningun aviso).
panel._activeTab = 'tasks';
panel._renderTasks();
guardar(recoger('tasks'));

check('Tasa de fallo: la casilla se pinta en % (0,1 guardado → «10»)',
  celda('Task_1', 'failureRate').value === '10', celda('Task_1', 'failureRate').value);
check('Tasa de fallo: el signo % se ve al lado de la casilla',
  Boolean(celda('Task_1', 'failureRate').closest('.pct'))
  && Boolean(celda('Task_1', 'failureRate').closest('.pct').querySelector('.pct-signo')));
check('Tasa de fallo: la casilla ya no admite fracciones (tope 100)',
  celda('Task_1', 'failureRate').getAttribute('max') === '100');

escribir('Task_1', 'failureRate', 12.5);
writes = recoger('tasks');
check('Tasa de fallo: 12,5 en la casilla se guarda como 0,125',
  buscar(writes, 'Task_1').failureRate === 0.125, buscar(writes, 'Task_1').failureRate);

escribir('Task_1', 'failureRate', 150);
error = null;
try { recoger('tasks'); } catch (e) { error = e.message; }
check('Tasa de fallo: 150 % se rechaza nombrando el tope',
  Boolean(error) && /100 %/.test(error), error);

escribir('Task_1', 'failureRate', -1);
error = null;
try { recoger('tasks'); } catch (e) { error = e.message; }
check('Tasa de fallo: un negativo se rechaza', Boolean(error) && /0 y 100/.test(error), error);

escribir('Task_1', 'failureRate', 12.5);
// El CSV sale del MODELO, no de las casillas: sin este guardado el export seguiria
// viendo el 0,1 de antes y la comprobacion no probaria la conversion.
guardar(recoger('tasks'));
panel._renderTasks();
const filaFR = panel._csvForActiveTab();
check('CSV tareas: la columna se llama «tasa_fallo_pct» y ya no «tasa_fallo»',
  filaFR[0].includes('tasa_fallo_pct') && !filaFR[0].some((c) => c === 'tasa_fallo'),
  filaFR[0].join(','));

const iFR = filaFR[0].indexOf('tasa_fallo_pct');
check('CSV tareas: la tasa de fallo sale en % (12,5, no 0,125)',
  String(filaFR.find((r) => r[0] === 'Task_1')[iFR]) === '12.5',
  String(filaFR.find((r) => r[0] === 'Task_1')[iFR]));

guardar(panel._applyCsv(aCsv(filaFR)));
panel._renderTasks();
check('Tasa de fallo: el 12,5 % sobrevive a exportar e importar',
  celda('Task_1', 'failureRate').value === '12.5'
  && buscar(recoger('tasks'), 'Task_1').failureRate === 0.125,
  celda('Task_1', 'failureRate').value);

// La columna HEREDADA. Se detecta por el nombre y no por la magnitud: un CSV que
// alguien haya reescrito a mano con `tasa_fallo` y un 5 dentro es ambiguo, y
// adivinar convertiria un 0,5 % legitimo en 50 %.
const csvFRviejo = [
  [ 'id', 'nombre', 'unidad_proceso', 'tiempo_proceso', 'tasa_fallo', 'retrabajo', 'unidad_retrabajo' ],
  [ 'Task_2', 'Cortar', 'minutes', '15', '0.1', '20', 'minutes' ]
].map((r) => r.join(',')).join('\r\n');
const impFR = panel._applyCsv(csvFRviejo);
check('CSV heredado: «tasa_fallo» 0,1 se lee como fracción (0,1 y no 0,001)',
  buscar(impFR, 'Task_2').failureRate === 0.1, buscar(impFR, 'Task_2').failureRate);

error = null;
try { panel._applyCsv(csvFRviejo.replace(',0.1,', ',1.5,')); } catch (e) { error = e.message; }
check('CSV heredado: un 1,5 en «tasa_fallo» se explica como fracción',
  Boolean(error) && /fracción/.test(error), error);

// --- 6c. Autoguardado al SALIR del campo ------------------------------------
//
// Lo que se prueba aqui es que NO hace falta pulsar «Guardar todo»: al dispararse
// `change` -que en una caja de texto significa «salgo del campo»- la tarea tiene que
// quedar escrita en el diagrama, con la casilla en verde como unico aviso. Y que una
// fila con el valor mal NO bloquea el guardado de otra fila que si esta bien.
panel._activeTab = 'tasks';
panel._renderTasks();
olvidarEscrituras();

escribir('Task_1', 'processingTime.value', 33);
const guardadoTask1 = getSimulationData(panel._elementRegistry.get('Task_1'));
check('Autoguardado: al salir del campo la tarea ya está en el diagrama',
  guardadoTask1.processingTime.value === 33,
  JSON.stringify(guardadoTask1.processingTime));
check('Autoguardado: no hizo falta pulsar «Guardar todo»',
  escriturasModelo.length === 1 && escriturasModelo[0].el.id === 'Task_1',
  `${escriturasModelo.length} escrituras`);

check('Autoguardado: la casilla editada se pinta en verde',
  celda('Task_1', 'processingTime.value').classList.contains('guardado')
  && !celda('Task_1', 'processingTime.value').classList.contains('invalido'),
  celda('Task_1', 'processingTime.value').className);

check('Autoguardado: las casillas que no se tocaron no se pintan',
  !celda('Task_1', 'reworkTime.value').classList.contains('guardado')
  && !celda('Task_2', 'processingTime.value').classList.contains('guardado'));

// Se guarda la FILA ENTERA, no solo el campo tocado: lo que se ve en las demas
// casillas de esa fila tiene que estar tambien en el diagrama, o el mapa de calor
// simularia con valores que ya no son los de pantalla.
escribir('Task_1', 'reworkTime.value', 7);
const escritoTask1 = JSON.parse(escriturasModelo[escriturasModelo.length - 1]
  .props.extensionElements.values[0].values[0].value);
check('Autoguardado: escribe la fila entera, no solo la casilla tocada',
  escritoTask1.processingTime.value === 33 && escritoTask1.reworkTime.value === 7,
  `${escritoTask1.processingTime.value} / ${escritoTask1.reworkTime.value}`);

// Un valor invalido: rojo, sin escribir y SIN re-renderizar (si el panel reaccionara
// reconstruyendo la tabla, la casilla se rellenaria sola con el valor viejo y el usuario
// perderia lo que estaba escribiendo).
// Se vacia la casilla porque es el estado real de «estoy reescribiendo esto»: un
// <input type=number> no admite texto, asi que el caso a medias es el vacio.
escribir('Task_1', 'processingTime.value', '');
check('Autoguardado: una casilla vacía deja el campo en rojo y sin guardar',
  celda('Task_1', 'processingTime.value').classList.contains('invalido')
  && !celda('Task_1', 'processingTime.value').classList.contains('guardando'),
  celda('Task_1', 'processingTime.value').className);
check('Autoguardado: la casilla no se rellena sola ni se pierde lo que había',
  celda('Task_1', 'processingTime.value').value === ''
  && getSimulationData(panel._elementRegistry.get('Task_1')).processingTime.value === 33,
  celda('Task_1', 'processingTime.value').value);

// LA CLAVE: la fila roja no bloquea a las demas.
escribir('Task_2', 'processingTime.value', 44);
check('Autoguardado: una fila en rojo no impide guardar otra fila',
  getSimulationData(panel._elementRegistry.get('Task_2')).processingTime.value === 44
  && celda('Task_2', 'processingTime.value').classList.contains('guardado'),
  JSON.stringify(getSimulationData(panel._elementRegistry.get('Task_2')).processingTime));

// Y una fila roja NO impide exportar el CSV, que sale del modelo: el CSV lleva el
// ultimo valor bueno guardado, no el texto invalido que hay en pantalla.
const csvConRojos = panel._csvForActiveTab();
check('Autoguardado: el CSV exporta lo GUARDADO, no lo que hay a medio escribir',
  String(csvConRojos.find((r) => r[0] === 'Task_1')[csvConRojos[0].indexOf('tiempo_proceso')]) === '33',
  String(csvConRojos.find((r) => r[0] === 'Task_1')[csvConRojos[0].indexOf('tiempo_proceso')]));

// Al corregir, la casilla deja el rojo y vuelve a quedar guardada.
escribir('Task_1', 'processingTime.value', 35);
check('Autoguardado: al corregir el valor, la casilla pasa a verde',
  celda('Task_1', 'processingTime.value').classList.contains('guardado')
  && !celda('Task_1', 'processingTime.value').classList.contains('invalido')
  && getSimulationData(panel._elementRegistry.get('Task_1')).processingTime.value === 35);

// Elegir piscina habilita la cantidad SIN re-renderizar (el autoguardado no
// re-renderiza, asi que si no se hiciera aqui quedaria muerta para siempre).
check('Autoguardado: sin piscina la cantidad está deshabilitada',
  celda('Task_1', 'resources.quantityRequired').disabled);
escribir('Task_1', 'resources.pool', 'Soldadores');
check('Autoguardado: elegir piscina habilita la cantidad sin re-renderizar',
  !celda('Task_1', 'resources.quantityRequired').disabled
  && getSimulationData(panel._elementRegistry.get('Task_1')).resources.pool === 'Soldadores');

// Modo solo lectura (Token Simulation): el panel no puede dar por guardado lo que no
// esta guardado. Se sustituye `modeling` por uno que lanza lo mismo que DisableModeling.
//
// OJO con lo que se comprueba: `setSimulationData` asigna el valor en el objeto moddle
// ANTES de llamar a updateProperties, asi que el valor queda en MEMORIA aunque la
// escritura no se confirme. Es el mismo comportamiento que ya tenia «Guardar todo», no
// algo que traiga el autoguardado; por eso aqui se comprueba lo que si importa: que el
// panel NO lo de por guardado, que ofrezca desactivar el modo, y que al desactivarlo la
// escritura se confirme sin haber perdido nada.
const escriturasAntesDeLeer = escriturasModelo.length;
const modelingBueno = panel._modeling;
panel._modeling = { updateProperties: () => { throw new Error('model is read-only'); } };
escribir('Task_3', 'processingTime.value', 9);

check('Autoguardado en solo lectura: NO se confirma ninguna escritura',
  escriturasModelo.length === escriturasAntesDeLeer,
  `${escriturasModelo.length - escriturasAntesDeLeer} confirmadas`);
check('Autoguardado en solo lectura: la casilla se queda en amarillo, sin verde falso',
  celda('Task_3', 'processingTime.value').classList.contains('guardando')
  && !celda('Task_3', 'processingTime.value').classList.contains('guardado')
  && !celda('Task_3', 'processingTime.value').classList.contains('invalido'),
  celda('Task_3', 'processingTime.value').className);
check('Autoguardado en solo lectura: se ofrece desactivar el modo',
  Boolean(document.querySelector('.btn-desactivar')));

// Y al desactivarlo se reintenta ESA fila: la escritura se confirma.
panel._modeling = modelingBueno;
document.querySelector('.btn-desactivar').click();
check('Autoguardado en solo lectura: al desactivar el modo se reintenta y confirma',
  escriturasModelo.length > escriturasAntesDeLeer
  && getSimulationData(panel._elementRegistry.get('Task_3')).processingTime.value === 9
  && celda('Task_3', 'processingTime.value').classList.contains('guardado'),
  JSON.stringify(getSimulationData(panel._elementRegistry.get('Task_3')).processingTime));
check('Autoguardado en solo lectura: la oferta desaparece después de reintentar',
  !document.querySelector('.btn-desactivar'));

// El botón de guardar todo sigue estando y sigue guardando lo que quede pendiente.
panel._renderTasks();
escribir('Task_2', 'reworkTime.value', 11);
panel.save();
check('«Guardar todo» sigue vivo y guarda de una vez',
  getSimulationData(panel._elementRegistry.get('Task_2')).reworkTime.value === 11);

// --- 7. pestaña Global: tabla de lotes ------------------------------------

panel._activeTab = 'global';
panel._renderGlobal();

// EL GUARDIAN DE LOS CAMPOS GLOBALES.
//
// Por que existe: la idempotencia del CSV (exportar → importar → exportar igual) NO
// detecta un campo que DESAPARECE, porque se comparan dos CSV a los que ya les falta
// el mismo campo. Sin esta comprobacion, reestructurar la pestaña en secciones puede
// perder un campo en silencio: se cae del formulario, se cae del CSV, y el arnes
// sigue en verde.
//
// Fija el CONTRATO completo: los 30 campos, en orden. Si alguien anade, quita o
// renombra uno, esta comprobacion falla y obliga a decirlo a proposito.
const CAMPOS_GLOBALES = [
  'startDate', 'simulationConfig.runValue',
  'arrivalRate.value', 'arrivalRate.unit',
  'cost.baseRatePerHour', 'cost.waitCostPerHour',
  'overtime.limitHours', 'overtime.payMultiplier', 'overtime.excessPayMultiplier',
  'calendar.workingDays', 'calendar.workingHours.start', 'calendar.workingHours.end',
  'warmup.shape', 'warmup.initialEfficiency', 'warmup.recoveryMinutes',
  'warmup.onShiftStart', 'warmup.onBreakReturn',
  'lots.enabled', 'lots.sizeMode', 'lots.size', 'lots.min', 'lots.mode', 'lots.max', 'lots.stopMinutes',
  'seed',
  'labor.shiftType', 'labor.dailyOvertimeLimitHours', 'labor.maxOvertimeDaysPerWeek',
  'labor.sundayPremiumPercent', 'labor.holidayPremiumPercent'
];

// En el DOM, los dias laborables se pintan con `data-days` (son casillas) y el resto
// con `data-field`. Se aceptan los dos: lo que importa es que el campo ESTE.
const campoEnDom = (clave) => Boolean(
  document.querySelector(`[data-field="${clave}"]`) ||
  document.querySelector(`[data-days="${clave}"]`));

const faltanEnDom = CAMPOS_GLOBALES.filter((c) => !campoEnDom(c));
check('Global: los 30 campos declarados se pintan en el formulario',
  faltanEnDom.length === 0,
  faltanEnDom.length ? `FALTAN: ${faltanEnDom.join(', ')}` : '30/30');

// Y que no haya campos de MAS ni DUPLICADOS. Se cuentan ocurrencias sobre un ARRAY,
// no sobre un Set: con un Set los duplicados ya vienen colapsados y la comprobacion
// seria una tautologia que siempre pasa.
//
// OJO con los dias laborables: se pintan como SIETE casillas que comparten
// `data-days`, y eso es UN campo. Se cuentan aparte para no confundir siete casillas
// con siete campos repetidos.
const declarados = new Set(CAMPOS_GLOBALES);
const camposDataField = Array.from(document.querySelectorAll('tbody [data-field]'))
  .map((e) => e.dataset.field);
const hayDias = Boolean(document.querySelector('tbody [data-days]'));

const cuenta = {};
camposDataField.forEach((c) => { cuenta[c] = (cuenta[c] || 0) + 1; });
if (hayDias) cuenta['calendar.workingDays'] = 1;

const sobrantes = Object.keys(cuenta).filter((c) => !declarados.has(c));
const repetidos = Object.keys(cuenta).filter((c) => cuenta[c] > 1);

check('Global: no hay ningún campo global duplicado o de más',
  sobrantes.length === 0 && repetidos.length === 0,
  sobrantes.length ? `SOBRAN: ${sobrantes.join(', ')}`
    : (repetidos.length ? `REPETIDOS: ${repetidos.join(', ')}` : `${Object.keys(cuenta).length} campos`));

// Y el CSV tiene que llevar los 30: si uno se cae del formulario, tambien se cae de
// la exportacion, y el ciclo de ida y vuelta no lo notaria.
const clavesCsv = (() => {
  const filas = panel._csvForActiveTab();
  return new Set(filas.map((f) => String(f[0])));
})();
const faltanEnCsv = CAMPOS_GLOBALES.filter((c) => !clavesCsv.has(c));
check('CSV global: exporta los 30 campos',
  faltanEnCsv.length === 0,
  faltanEnCsv.length ? `FALTAN: ${faltanEnCsv.join(', ')}` : 'todos');

// --- 7b. Las SECCIONES de Global y que cada lista este DENTRO de la suya ------
//
// El guardia de arriba solo comprueba que los campos EXISTAN, y pasaria igual con una
// tabla plana: no distingue la pestaña reestructurada de la de antes. Estas
// comprobaciones son las del objetivo real -Peras con peras-, y miran el ORDEN del
// documento: cada tabla tiene que ir DESPUES de su titulo y ANTES del siguiente.
const vaDespues = (nodo, referencia) =>
  Boolean(referencia.compareDocumentPosition(nodo) & Node.DOCUMENT_POSITION_FOLLOWING);

const titulosSeccion = () => Array.from(document.querySelectorAll('h4.subtitulo'))
  .filter((h) => h.closest('.data-table') === null)
  .map((h) => h);

const SECCIONES_ESPERADAS = [
  'Simulación',
  'Jornada y descansos',
  'Arranque de la jornada',
  'Lotes',
  'Tiempo extra y reglas laborales (LFT)',
  'Costo'
];

const encabezados = titulosSeccion();
check('Global: la pestaña está partida en secciones',
  encabezados.length === SECCIONES_ESPERADAS.length,
  `${encabezados.length} secciones`);

const titulosActuales = encabezados.map((h) => h.textContent.trim());
check('Global: los títulos de sección son los esperados y en orden',
  iguales(titulosActuales, SECCIONES_ESPERADAS),
  JSON.stringify(titulosActuales));

// Una lista esta DENTRO de su seccion si va despues de su titulo y antes del
// siguiente titulo (o al final, si es la ultima).
const dentroDe = (selectorLista, iSeccion) => {
  const lista = document.querySelector(selectorLista);
  if (!lista) return false;
  if (!vaDespues(lista, encabezados[iSeccion])) return false;
  const siguiente = encabezados[iSeccion + 1];
  return siguiente ? vaDespues(siguiente, lista) : true;
};

check('Global: los descansos van DENTRO de la sección de la jornada',
  dentroDe('.filas-descanso', 1));
check('Global: la curva de arranque va DENTRO de la sección de arranque',
  dentroDe('.caja-curva', 2));
check('Global: la tabla de lote va DENTRO de la sección de lotes',
  dentroDe('.filas-lote', 3));
check('Global: las vigencias van DENTRO de la sección laboral',
  dentroDe('.filas-regla', 4));

// Y lo que se arreglaba: las vigencias dicen «lo que digan los valores de ARRIBA»,
// asi que los campos que pisa tienen que estar de verdad por encima de su tabla.
const camposSobreVigencias = [
  'overtime.payMultiplier', 'overtime.excessPayMultiplier',
  'labor.sundayPremiumPercent', 'labor.holidayPremiumPercent',
  'labor.dailyOvertimeLimitHours', 'labor.maxOvertimeDaysPerWeek'
];
const tablaVigencias = document.querySelector('.filas-regla');
const porDebajo = camposSobreVigencias.filter((c) =>
  !vaDespues(tablaVigencias, document.querySelector(`[data-field="${c}"]`)));
check('Global: los campos que las vigencias sobrescriben están POR ENCIMA de su tabla',
  porDebajo.length === 0,
  porDebajo.length ? `POR DEBAJO: ${porDebajo.join(', ')}` : `${camposSobreVigencias.length} campos`);

// --- 7c. La ayuda por campo (el «?») ----------------------------------------
const botonesAyuda = Array.from(document.querySelectorAll('.btn-ayuda-campo'));
check('Global: cada campo tiene su botón «?» de ayuda',
  botonesAyuda.length === CAMPOS_GLOBALES.length,
  `${botonesAyuda.length} botones / ${CAMPOS_GLOBALES.length} campos`);

// Cada boton apunta a SU campo (no a otro) y detras hay texto de verdad.
const sinTexto = CAMPOS_GLOBALES.filter((c) => {
  const boton = document.querySelector(`.btn-ayuda-campo[data-ayuda="${c}"]`);
  const caja = document.querySelector(`[data-ayuda-de="${c}"]`);
  return !boton || !caja || caja.textContent.trim().length < 20;
});
check('Global: cada «?» apunta a su campo y tiene un texto de verdad detrás',
  sinTexto.length === 0,
  sinTexto.length ? `SIN TEXTO: ${sinTexto.join(', ')}` : 'los 30 con texto');

// Y los textos tienen que ser DISTINTOS: si todos dijeran lo mismo seria relleno.
const textosAyuda = CAMPOS_GLOBALES.map((c) =>
  (document.querySelector(`[data-ayuda-de="${c}"]`) || {}).textContent || '');
const distintos = new Set(textosAyuda).size;
check('Global: los textos de ayuda son distintos entre sí',
  distintos === CAMPOS_GLOBALES.length,
  `${distintos} distintos de ${CAMPOS_GLOBALES.length}`);

// El «?» abre y cierra. Se prueba el ciclo completo, no solo que exista el boton.
const botonUno = botonesAyuda[0];
const cajaUno = document.querySelector(`[data-ayuda-de="${botonUno.dataset.ayuda}"]`);
check('Global: la ayuda arranca OCULTA', cajaUno.classList.contains('hidden'));

botonUno.click();
check('Global: al pulsar «?» la ayuda se despliega',
  !cajaUno.classList.contains('hidden') && botonUno.classList.contains('activo'));

botonUno.click();
check('Global: al volver a pulsarlo se repliega',
  cajaUno.classList.contains('hidden') && !botonUno.classList.contains('activo'));

check('Global: se pinta la tabla de tamaños de lote (aunque esté vacía)',
  Boolean(document.querySelector('.filas-lote')) && Boolean(document.querySelector('[data-accion="anadir-lote"]')));
check('Global: la tabla empieza sin filas', !document.querySelector('[data-lote="size"]'));

// El boton «+ Añadir tamaño» inserta una fila de verdad (insertAdjacentHTML en
// un <tbody>, que es lo unico que sobrevive al parseo de un <tr>).
document.querySelector('[data-accion="anadir-lote"]').click();
check('Global: el botón de añadir crea una fila editable', Boolean(document.querySelector('[data-lote="size"]')));

const filaNueva = document.querySelector('.filas-lote tr');
filaNueva.querySelector('[data-lote="size"]').value = '25';
filaNueva.querySelector('[data-lote="weight"]').value = '0.4';
document.querySelector('[data-accion="anadir-lote"]').click();
const filaDos = document.querySelectorAll('.filas-lote tr')[1];
filaDos.querySelector('[data-lote="size"]').value = '40';
filaDos.querySelector('[data-lote="weight"]').value = '0.6';

escribirCheck('lots.enabled', true);
escribirSelect('lots.sizeMode', 'empirical');
let globalWrites = recoger('global');
check('Global: la tabla de tamaños se guarda tal cual se escribió',
  iguales(globalWrites[0].data.lots.table, [ { size: 25, weight: 0.4 }, { size: 40, weight: 0.6 } ]),
  JSON.stringify(globalWrites[0].data.lots.table));

// Fila recien añadida y vacia: se ignora, no bloquea el guardado.
document.querySelector('[data-accion="anadir-lote"]').click();
globalWrites = recoger('global');
check('Global: una fila de lote vacía se ignora en vez de dar error',
  globalWrites[0].data.lots.table.length === 2, globalWrites[0].data.lots.table.length);
document.querySelectorAll('.filas-lote tr')[2].remove();

// Una fila con el tamaño pero sin peso: se avisa.
document.querySelector('[data-accion="anadir-lote"]').click();
document.querySelectorAll('.filas-lote tr')[2].querySelector('[data-lote="size"]').value = '7';
let errorPeso = null;
try { recoger('global'); } catch (e) { errorPeso = e.message; }
check('Global: un tamaño sin peso se rechaza',
  Boolean(errorPeso) && /peso/.test(errorPeso), errorPeso);
document.querySelectorAll('.filas-lote tr')[2].remove();

// El boton de quitar de la fila la elimina.
document.querySelector('.filas-lote tr .btn-quitar-pool').click();
check('Global: el botón de quitar borra la fila', document.querySelectorAll('.filas-lote tr').length === 1);
document.querySelector('[data-accion="anadir-lote"]').click();
document.querySelectorAll('.filas-lote tr')[1].querySelector('[data-lote="size"]').value = '40';
document.querySelectorAll('.filas-lote tr')[1].querySelector('[data-lote="weight"]').value = '0.6';

escribirSelect('lots.sizeMode', 'triangular');
escribirGlobal('lots.min', 10);
escribirGlobal('lots.mode', 20);
escribirGlobal('lots.max', 5);
let errorLote = null;
try { recoger('global'); } catch (e) { errorLote = e.message; }
check('Global: la triangular incoherente se rechaza',
  Boolean(errorLote) && /mínimo ≤ moda ≤ máximo/.test(errorLote), errorLote);

escribirGlobal('lots.max', 30);
escribirSelect('lots.sizeMode', 'fixed');
const globalWrites2 = recoger('global');
check('Global: se guarda el evento raiz una sola vez', globalWrites2.length === 1);

// Sin lotes activados no se valida su coherencia: es configuracion dormida.
escribirCheck('lots.enabled', false);
escribirSelect('lots.sizeMode', 'empirical');
let errorDormido = null;
try { recoger('global'); } catch (e) { errorDormido = e.message; }
check('Global: con los lotes desactivados no se valida su coherencia', errorDormido === null, errorDormido);

// «empirical» sin ninguna fila: el motor caeria en silencio al tamaño fijo.
Array.from(document.querySelectorAll('.filas-lote tr')).forEach((tr) => tr.remove());
escribirCheck('lots.enabled', true);
escribirSelect('lots.sizeMode', 'empirical');
let errorVacio = null;
try { recoger('global'); } catch (e) { errorVacio = e.message; }
check('Global: «empirical» con la tabla vacía se rechaza',
  Boolean(errorVacio) && /tabla está vacía/.test(errorVacio), errorVacio);
escribirSelect('lots.sizeMode', 'fixed');
escribirCheck('lots.enabled', false);

// --- 8. CSV global: la tabla de lotes va y vuelve -------------------------

panel._activeTab = 'global';
const filasGlobal = panel._csvForActiveTab();
const csvGlobal = aCsv(filasGlobal);
check('CSV global: no trae filas de lote si no hay tabla',
  !filasGlobal.some((r) => /^lote\./.test(String(r[0]))));

// Se añaden dos tamaños a mano, como haria el usuario en Excel. Las filas
// llevan las MISMAS tres columnas que las de descanso: clave, etiqueta, valor.
const cola = '\r\nlote.1.tamano,Tamaño 1,10\r\nlote.1.peso,Peso 1,0.3'
  + '\r\nlote.2.tamano,Tamaño 2,20\r\nlote.2.peso,Peso 2,0.7';
const csvConLotes = csvGlobal + cola;

// Aislado: solo las filas de lote, para ver exactamente que se parsea.
let aislado = null;
try {
  const r = panel._applyCsv('campo,etiqueta,valor' + cola);
  aislado = JSON.stringify(r[0].data.lots.table);
} catch (e) { aislado = 'ERROR: ' + e.message; }
check('CSV global: las filas de lote se parsean aisladas',
  aislado === '[{"size":10,"weight":0.3},{"size":20,"weight":0.7}]', aislado);
check('CSV global: la cola añadida es la esperada',
  /lote\.1\.tamano,Tamaño 1,10/.test(csvConLotes) && csvConLotes.endsWith('lote.2.peso,Peso 2,0.7'),
  JSON.stringify(csvConLotes.slice(-60)));
const aplicado = panel._applyCsv(csvConLotes);
const datosGlobal = aplicado[0].data;
check('CSV global: la tabla de lotes se importa entera',
  iguales(datosGlobal.lots.table, [ { size: 10, weight: 0.3 }, { size: 20, weight: 0.7 } ]),
  JSON.stringify(datosGlobal.lots.table));

const csvLoteMalo = csvGlobal + '\r\nlote.1.tamano,Tamaño 1,0\r\nlote.1.peso,Peso 1,1';
let errorLote2 = null;
try { panel._applyCsv(csvLoteMalo); } catch (e) { errorLote2 = e.message; }
check('CSV global: un tamaño de lote invalido se rechaza',
  Boolean(errorLote2) && /entero mayor o igual que 1/.test(errorLote2), errorLote2);

// Ida y vuelta contra el modelo, igual que en Tareas.
guardar(panel._applyCsv(csvConLotes));
const reexportado = panel._csvForActiveTab();
check('CSV global: la tabla importada se vuelve a exportar',
  reexportado.some((r) => String(r[0]) === 'lote.2.peso' && String(r[2]) === '0.7'),
  reexportado.filter((r) => /^lote\./.test(String(r[0]))).map((r) => r.join(':')).join(' / '));
check('CSV global: exportar → importar → exportar es idempotente',
  iguales(aCsv(reexportado), aCsv(filasGlobal.concat([
    [ 'lote.1.tamano', 'Tamaño de lote 1: tamaño', 10 ],
    [ 'lote.1.peso', 'Tamaño de lote 1: peso', 0.3 ],
    [ 'lote.2.tamano', 'Tamaño de lote 2: tamaño', 20 ],
    [ 'lote.2.peso', 'Tamaño de lote 2: peso', 0.7 ]
  ]))),
  JSON.stringify(reexportado.filter((r, i) => !/^lote\.|^campo/.test(String(r[0]))).length));

// --- 9. Reglas laborales (A2) ---------------------------------------------

panel._activeTab = 'global';
panel._renderGlobal();

check('Laboral: se pintan los campos de turno, topes y primas',
  Boolean(document.querySelector('[data-field="labor.shiftType"]'))
  && Boolean(document.querySelector('[data-field="labor.dailyOvertimeLimitHours"]'))
  && Boolean(document.querySelector('[data-field="labor.maxOvertimeDaysPerWeek"]'))
  && Boolean(document.querySelector('[data-field="labor.sundayPremiumPercent"]'))
  && Boolean(document.querySelector('[data-field="labor.holidayPremiumPercent"]')));

const opcionesTurno = Array.from(document.querySelector('[data-field="labor.shiftType"]').options)
  .map((o) => o.value);
check('Laboral: el selector de turno ofrece los tres de la LFT',
  iguales(opcionesTurno, [ 'diurna', 'nocturna', 'mixta' ]), opcionesTurno.join('/'));

check('Laboral: los valores por defecto ya son la ley',
  document.querySelector('[data-field="labor.shiftType"]').value === 'diurna'
  && document.querySelector('[data-field="labor.dailyOvertimeLimitHours"]').value === '3'
  && document.querySelector('[data-field="labor.maxOvertimeDaysPerWeek"]').value === '3'
  && document.querySelector('[data-field="labor.sundayPremiumPercent"]').value === '25'
  && document.querySelector('[data-field="labor.holidayPremiumPercent"]').value === '0',
  document.querySelector('[data-field="labor.sundayPremiumPercent"]').value);

check('Laboral: se pinta la tabla de vigencias (vacía)',
  Boolean(document.querySelector('.filas-regla')) && Boolean(document.querySelector('[data-accion="anadir-regla"]')));
check('Laboral: la tabla empieza sin filas', !document.querySelector('[data-regla="desde"]'));

document.querySelector('[data-accion="anadir-regla"]').click();
check('Laboral: el botón de añadir crea una fila con fecha',
  Boolean(document.querySelector('[data-regla="desde"]')));

const regla1 = document.querySelectorAll('.filas-regla tr')[0];
regla1.querySelector('[data-regla="desde"]').value = '2026-07-01';
regla1.querySelector('[data-regla="limitHours"]').value = '8';
regla1.querySelector('[data-regla="payMultiplier"]').value = '2.5';
regla1.querySelector('[data-regla="excessPayMultiplier"]').value = '3';

let gWrites = recoger('global');
check('Laboral: la vigencia se guarda solo con lo declarado',
  iguales(gWrites[0].data.labor.rules, [ { desde: '2026-07-01', limitHours: 8, payMultiplier: 2.5, excessPayMultiplier: 3 } ]),
  JSON.stringify(gWrites[0].data.labor.rules));
check('Laboral: guardar NO borra lo que ya tenía el evento raíz',
  Boolean(gWrites[0].data.calendar) && Boolean(gWrites[0].data.simulationConfig),
  `calendar: ${Boolean(gWrites[0].data.calendar)} / config: ${Boolean(gWrites[0].data.simulationConfig)}`);

// Ida y vuelta por el modelo: lo guardado tiene que sobrevivir a un re-render.
guardar(gWrites);
panel._renderGlobal();
check('Laboral: tras guardar y re-render la vigencia sigue en la tabla',
  document.querySelectorAll('.filas-regla tr').length === 1
  && document.querySelector('[data-regla="desde"]').value === '2026-07-01',
  document.querySelectorAll('.filas-regla tr').length);

// Lo que cambia el formulario de arriba tiene que llegar al modelo.
escribirSelect('labor.shiftType', 'nocturna');
escribirGlobal('labor.holidayPremiumPercent', 50);
gWrites = recoger('global');
check('Laboral: el turno y la prima de festivo se guardan',
  gWrites[0].data.labor.shiftType === 'nocturna' && gWrites[0].data.labor.holidayPremiumPercent === 50,
  `${gWrites[0].data.labor.shiftType} / ${gWrites[0].data.labor.holidayPremiumPercent}`);

// Una fila sin fecha: se avisa.
document.querySelector('[data-accion="anadir-regla"]').click();
const regla2 = document.querySelectorAll('.filas-regla tr')[1];
regla2.querySelector('[data-regla="limitHours"]').value = '7';
let errorRegla = null;
try { recoger('global'); } catch (e) { errorRegla = e.message; }
check('Laboral: una vigencia sin fecha se rechaza',
  Boolean(errorRegla) && /falta la fecha/.test(errorRegla), errorRegla);
regla2.querySelector('[data-regla="desde"]').value = '2026-07-01'; // repetida
errorRegla = null;
try { recoger('global'); } catch (e) { errorRegla = e.message; }
check('Laboral: dos vigencias con la misma fecha se rechazan',
  Boolean(errorRegla) && /misma fecha/.test(errorRegla), errorRegla);

regla2.querySelector('[data-regla="desde"]').value = '2027-01-01';
regla2.querySelector('[data-regla="payMultiplier"]').value = '5';
regla2.querySelector('[data-regla="excessPayMultiplier"]').value = '2';
errorRegla = null;
try { recoger('global'); } catch (e) { errorRegla = e.message; }
check('Laboral: una prima de exceso menor que la normal se rechaza',
  Boolean(errorRegla) && /no puede ser menor/.test(errorRegla), errorRegla);

// Se arregla la fila 2 para que el resto de casos dejen de chocar con ella.
regla2.querySelector('[data-regla="payMultiplier"]').value = '2';
regla2.querySelector('[data-regla="excessPayMultiplier"]').value = '3';

// Fila recien añadida y vacía: se ignora.
document.querySelector('[data-accion="anadir-regla"]').click();
gWrites = recoger('global');
check('Laboral: una vigencia vacía se ignora en vez de dar error',
  gWrites[0].data.labor.rules.length === 2, gWrites[0].data.labor.rules.length);
document.querySelectorAll('.filas-regla tr')[2].remove();

// El botón de quitar borra la fila: se comprueba con una fila añadida para no
// quedarnos sin vigencia que exportar en el caso siguiente.
document.querySelector('[data-accion="anadir-regla"]').click();
check('Laboral: el botón de quitar borra la vigencia',
  document.querySelectorAll('.filas-regla tr').length === 3);
document.querySelectorAll('.filas-regla tr')[2].querySelector('.btn-quitar-pool').click();
check('Laboral: y la fila desaparece',
  document.querySelectorAll('.filas-regla tr').length === 2);

// --- 10. CSV de Global con vigencias --------------------------------------

panel._activeTab = 'global';
const filasConReglas = panel._csvForActiveTab();
const csvConReglas = aCsv(filasConReglas);
check('CSV global: la pestaña Global exporta algo',
  filasConReglas.length > 5, `${filasConReglas.length} filas`);
check('CSV global: el modelo tiene las vigencias que se van a exportar',
  ((panel._globalData() || {}).data.labor.rules || []).length === 1,
  JSON.stringify(((panel._globalData() || {}).data.labor || {}).rules));
check('CSV global: las vigencias se exportan con todas sus columnas',
  filasConReglas.some((r) => String(r[0]) === 'regla.1.desde' && String(r[2]) === '2026-07-01')
  && filasConReglas.some((r) => String(r[0]) === 'regla.1.limitHours' && String(r[2]) === '8')
  && filasConReglas.some((r) => String(r[0]) === 'regla.1.holidayPremiumPercent'),
  filasConReglas.filter((r) => /^regla\./.test(String(r[0]))).map((r) => r[0]).join(' '));

guardar(panel._applyCsv(csvConReglas));
const reexp = panel._csvForActiveTab();
check('CSV global: la ida y vuelta de las vigencias es idempotente',
  iguales(aCsv(reexp), csvConReglas),
  JSON.stringify(reexp.filter((r, i) => !iguales(r, filasConReglas[i]))));

const csvReglaMala = csvConReglas.replace('regla.1.desde,Vigencia 1: desde,2026-07-01',
  'regla.1.desde,Vigencia 1: desde,07/2026');
let errorCsvRegla = null;
try { panel._applyCsv(csvReglaMala); } catch (e) { errorCsvRegla = e.message; }
check('CSV global: una fecha de vigencia inválida se rechaza',
  Boolean(errorCsvRegla) && /AAAA-MM-DD/.test(errorCsvRegla), errorCsvRegla);

// --- 11. Ayuda por pestaña (helpme completo) ------------------------------

panel._activeTab = 'tasks';
panel._renderTasks();

check('Ayuda: el botón de ayuda existe en el panel',
  Boolean(document.querySelector('.btn-ayuda')));
check('Ayuda: empieza oculta', document.querySelector('.panel-ayuda').classList.contains('hidden'));

document.querySelector('.btn-ayuda').click();
const ayuda = document.querySelector('.panel-ayuda');
check('Ayuda: al pulsar, se despliega', !ayuda.classList.contains('hidden'));
check('Ayuda: explica los campos', ayuda.querySelector('ul.campos') && ayuda.querySelectorAll('ul.campos li').length >= 5,
  ayuda.querySelectorAll('ul.campos li').length);
check('Ayuda: y explica QUÉ SE MIDE con ellos (lo que de verdad se pregunta)',
  ayuda.querySelector('ul.mide') && ayuda.querySelectorAll('ul.mide li').length >= 3,
  ayuda.querySelectorAll('ul.mide li').length);
check('Ayuda: y avisa de la trampa con una sección propia',
  ayuda.querySelector('ul.ojo') && ayuda.querySelectorAll('ul.ojo li').length >= 1);
check('Ayuda: la trampa de la unidad está explicada (60 000×)',
  /60 000/.test(ayuda.textContent));

// Cambiar de pestaña y volver a pulsar tiene que dar la ayuda DE ESA pestaña.
document.querySelector('.panel-tabs button[data-tab="flows"]').click();
panel._renderFlows();
if (document.querySelector('.panel-ayuda').classList.contains('hidden')) document.querySelector('.btn-ayuda').click();
check('Ayuda: la de Flujos habla del reparto de compuertas',
  /reparto/i.test(document.querySelector('.panel-ayuda').textContent)
  && !/60 000/.test(document.querySelector('.panel-ayuda').textContent),
  document.querySelector('.panel-ayuda').querySelector('h4').textContent);

document.querySelector('.panel-tabs button[data-tab="resources"]').click();
panel._renderResources();
if (document.querySelector('.panel-ayuda').classList.contains('hidden')) document.querySelector('.btn-ayuda').click();
const ayudaRec = document.querySelector('.panel-ayuda').textContent;
check('Ayuda: la de Recursos explica capacidad y utilización',
  /utilización/.test(ayudaRec) && /capacidad/i.test(ayudaRec));
check('Ayuda: y ya menciona a los colaboradores con nombre (A5)',
  /miembros/i.test(ayudaRec) && /carga máxima/i.test(ayudaRec));

document.querySelector('.panel-tabs button[data-tab="global"]').click();
panel._renderGlobal();
if (document.querySelector('.panel-ayuda').classList.contains('hidden')) document.querySelector('.btn-ayuda').click();
const ayudaGlob = document.querySelector('.panel-ayuda').textContent;
check('Ayuda: la de Global avisa de que la tasa NO es un intervalo',
  /una tasa/i.test(ayudaGlob) && /segundo/.test(ayudaGlob));
check('Ayuda: y menciona el cumplimiento de la LFT', /LFT/.test(ayudaGlob));

// --- 12. Carga física y miembros con nombre (A5, UI) ----------------------

panel._activeTab = 'tasks';
panel._renderTasks();

check('Carga UI: hay columnas de masa cargada, arrastrada y distancia',
  Boolean(celda('Task_1', 'carga.masaCargadaKg'))
  && Boolean(celda('Task_1', 'carga.masaArrastradaKg'))
  && Boolean(celda('Task_1', 'carga.distanciaM')));
check('Carga UI: y una columna de habilidad',
  Boolean(celda('Task_1', 'habilidad')));
check('Carga UI: sin carga declarada las casillas salen VACÍAS (no un 0)',
  celda('Task_1', 'carga.masaCargadaKg').value === ''
  && celda('Task_1', 'carga.distanciaM').value === '',
  `"${celda('Task_1', 'carga.masaCargadaKg').value}"`);

escribir('Task_1', 'carga.masaCargadaKg', 12);
escribir('Task_1', 'carga.distanciaM', 8);
escribir('Task_1', 'habilidad', 'soldadura');

let w = recoger('tasks');
const dCarga = buscar(w, 'Task_1');
check('Carga UI: la masa y la distancia se guardan',
  iguales(dCarga.carga, { masaCargadaKg: 12, distanciaM: 8 }),
  JSON.stringify(dCarga.carga));
check('Carga UI: una sola habilidad se guarda en singular',
  dCarga.habilidad === 'soldadura' && !('habilidades' in dCarga),
  JSON.stringify({ h: dCarga.habilidad, hs: dCarga.habilidades }));

// Varias habilidades separadas por comas -> lista.
escribir('Task_1', 'habilidad', 'soldadura, pintura');
w = recoger('tasks');
check('Carga UI: varias habilidades se guardan como lista',
  iguales(buscar(w, 'Task_1').habilidades, [ 'soldadura', 'pintura' ]),
  JSON.stringify(buscar(w, 'Task_1').habilidades));

// Y al vaciarla, se borran las dos formas.
escribir('Task_1', 'habilidad', '');
w = recoger('tasks');
const dSinHab = buscar(w, 'Task_1');
check('Carga UI: vaciar la habilidad la borra en las dos formas',
  !('habilidad' in dSinHab) && !('habilidades' in dSinHab));

// Carga inválida.
escribir('Task_1', 'carga.masaCargadaKg', -5);
let errorCarga = null;
try { recoger('tasks'); } catch (e) { errorCarga = e.message; }
check('Carga UI: una masa negativa se rechaza',
  Boolean(errorCarga) && /no puede ser negativo/.test(errorCarga), errorCarga);
escribir('Task_1', 'carga.masaCargadaKg', '');

w = recoger('tasks');
const dSoloDistancia = buscar(w, 'Task_1');
check('Carga UI: con solo la distancia, se guarda solo esa clave (sin nulls)',
  iguales(dSoloDistancia.carga, { distanciaM: 8 }),
  JSON.stringify(dSoloDistancia.carga));

// Y con las tres vacías, no se guarda el objeto.
escribir('Task_1', 'carga.distanciaM', '');
w = recoger('tasks');
check('Carga UI: sin nada declarado no se guarda el objeto carga',
  !('carga' in buscar(w, 'Task_1')), JSON.stringify(buscar(w, 'Task_1').carga));

// --- 13. Miembros con nombre en Recursos ---------------------------------

const procesoEl = panel._elementRegistry.get('Process_1');
panel._activeTab = 'resources';
panel._renderResources();

check('Miembros UI: se pinta la subtabla de miembros',
  Boolean(document.querySelector('.filas-miembro'))
  && Boolean(document.querySelector('.btn-anadir-miembro')));
check('Miembros UI: y el botón de añadir miembro',
  Boolean(document.querySelector('.btn-anadir-miembro')));

document.querySelector('.btn-anadir-miembro').click();
check('Miembros UI: añadir crea una fila de miembro con sus cuatro campos',
  document.querySelectorAll('.fila-miembro').length === 1
  && Boolean(document.querySelector('[data-miembro="nombre"]'))
  && Boolean(document.querySelector('[data-miembro="tarifaHora"]'))
  && Boolean(document.querySelector('[data-miembro="cargaMaximaKg"]'))
  && Boolean(document.querySelector('[data-miembro="habilidades"]')));

document.querySelector('[data-miembro="nombre"]').value = 'Ana';
document.querySelector('[data-miembro="tarifaHora"]').value = '55';
document.querySelector('[data-miembro="cargaMaximaKg"]').value = '25';
document.querySelector('[data-miembro="habilidades"]').value = 'soldadura, pintura';

document.querySelector('.btn-anadir-miembro').click();
document.querySelectorAll('.fila-miembro')[1].querySelector('[data-miembro="nombre"]').value = 'Luis';

w = recoger('resources');
const poolGuardada = w[0].data.resourcePools[0];
check('Miembros UI: se guardan los miembros con sus datos',
  iguales(poolGuardada.members, [
    { nombre: 'Ana', tarifaHora: 55, cargaMaximaKg: 25, habilidades: [ 'soldadura', 'pintura' ] },
    { nombre: 'Luis' }
  ]), JSON.stringify(poolGuardada.members));
check('Miembros UI: la cantidad de la piscina NO cambia por poner nombres',
  poolGuardada.quantity === 2, poolGuardada.quantity);

// Un miembro sin nombre: se avisa.
document.querySelector('.btn-anadir-miembro').click();
document.querySelectorAll('.fila-miembro')[2].querySelector('[data-miembro="tarifaHora"]').value = '40';
let errorMiembro = null;
try { recoger('resources'); } catch (e) { errorMiembro = e.message; }
check('Miembros UI: un miembro sin nombre se rechaza',
  Boolean(errorMiembro) && /falta el nombre/.test(errorMiembro), errorMiembro);
document.querySelectorAll('.fila-miembro')[2].remove();

// Nombre repetido.
document.querySelectorAll('.fila-miembro')[1].querySelector('[data-miembro="nombre"]').value = 'Ana';
errorMiembro = null;
try { recoger('resources'); } catch (e) { errorMiembro = e.message; }
check('Miembros UI: un nombre repetido en la misma piscina se rechaza',
  Boolean(errorMiembro) && /repetido/.test(errorMiembro), errorMiembro);
document.querySelectorAll('.fila-miembro')[1].querySelector('[data-miembro="nombre"]').value = 'Luis';

// El botón de quitar miembro quita SOLO ese miembro.
document.querySelectorAll('.fila-miembro')[1].querySelector('.btn-quitar-miembro').click();
check('Miembros UI: quitar un miembro no borra la piscina',
  document.querySelectorAll('.filas-pool > tr').length === 1
  && document.querySelectorAll('.fila-miembro').length === 1);

// Y solo hay UNA piscina leída, no una por miembro (filas anidadas).
document.querySelector('.btn-anadir-miembro').click();
document.querySelectorAll('.fila-miembro')[1].querySelector('[data-miembro="nombre"]').value = 'Luis';
w = recoger('resources');
check('Miembros UI: las subfilas de miembro NO se leen como piscinas',
  w[0].data.resourcePools.length === 1, w[0].data.resourcePools.length);

// --- 14. CSV de carga y de miembros ---------------------------------------

panel._activeTab = 'tasks';
panel._renderTasks();
escribir('Task_1', 'carga.masaCargadaKg', 12);
escribir('Task_1', 'carga.masaArrastradaKg', 90);
escribir('Task_1', 'carga.distanciaM', 8);
// El modelo tiene que tener la carga ANTES de exportar: el CSV sale del modelo
// guardado, no de las casillas. Es justo la trampa que se prueba aqui.
guardar(recoger('tasks'));
panel._renderTasks();

const filasT = panel._csvForActiveTab();
const cab = filasT[0];
check('CSV tareas: lleva las columnas de carga y habilidad',
  [ 'carga_kg', 'arrastre_kg', 'distancia_m', 'habilidad' ].every((c) => cab.includes(c)),
  cab.slice(-6).join(','));

const csvT = aCsv(filasT);
guardar(panel._applyCsv(csvT));
panel._renderTasks();
const filaT1 = panel._csvForActiveTab().find((r) => r[0] === 'Task_1');
check('CSV tareas: la carga sobrevive a exportar e importar',
  String(filaT1[cab.indexOf('arrastre_kg')]) === '90'
  && String(filaT1[cab.indexOf('carga_kg')]) === '12'
  && String(filaT1[cab.indexOf('distancia_m')]) === '8',
  filaT1.join(' | '));

// Un CSV antiguo (sin las columnas nuevas) sigue entrando y borra la carga.
const csvViejo2 = [
  [ 'id', 'nombre', 'unidad_proceso', 'tiempo_proceso', 'tasa_fallo', 'retrabajo', 'unidad_retrabajo' ],
  [ 'Task_1', 'Cortar', 'minutes', '15', '0.1', '20', 'minutes' ]
].map((r) => r.join(',')).join('\r\n');
const imp = panel._applyCsv(csvViejo2);
check('CSV tareas antiguo: sigue entrando y deja la tarea sin carga',
  !('carga' in buscar(imp, 'Task_1')) && !('habilidad' in buscar(imp, 'Task_1')),
  Object.keys(buscar(imp, 'Task_1')).join(','));

// CSV de recursos con miembros. Se vuelve a montar la piscina porque el caso
// anterior dejo el modelo con la piscina que hubiera en ese momento.
panel._activeTab = 'resources';
panel._renderResources();
const cajaPools = document.querySelector('.filas-pool').closest('table');
void cajaPools;
// Se rellenan las casillas de la piscina que exista (Process_1 tiene una).
const trPool = document.querySelector('.filas-pool > tr');
trPool.querySelector('[data-field="pool.name"]').value = 'Soldadores';
trPool.querySelector('[data-field="pool.quantity"]').value = '2';
const quitarTodos = Array.from(document.querySelectorAll('.fila-miembro'));
quitarTodos.forEach((f) => f.remove());
document.querySelector('.btn-anadir-miembro').click();
const fA = document.querySelectorAll('.fila-miembro')[0];
fA.querySelector('[data-miembro="nombre"]').value = 'Ana';
fA.querySelector('[data-miembro="tarifaHora"]').value = '55';
fA.querySelector('[data-miembro="cargaMaximaKg"]').value = '25';
fA.querySelector('[data-miembro="habilidades"]').value = 'soldadura, pintura';
guardar(recoger('resources'));
panel._renderResources();

const filasR = panel._csvForActiveTab();
check('CSV recursos: lleva la columna de miembros',
  filasR[0].includes('miembros'), filasR[0].join(','));
const csvR = aCsv(filasR);
guardar(panel._applyCsv(csvR));
panel._renderResources();
const poolVuelta = recoger('resources')[0].data.resourcePools[0];
check('CSV recursos: los miembros sobreviven a exportar e importar',
  iguales(poolVuelta.members, [
    { nombre: 'Ana', tarifaHora: 55, cargaMaximaKg: 25, habilidades: [ 'soldadura', 'pintura' ] }
  ]), JSON.stringify(poolVuelta.members));

// Un CSV de recursos SIN la columna (exportado antes de A5) sigue entrando.
const csvRSinMiembros = [ [ 'nombre', 'cantidad' ], [ 'Soldadores', '3' ] ]
  .map((r) => r.join(',')).join('\r\n');
const impR = panel._applyCsv(csvRSinMiembros);
check('CSV recursos antiguo: entra y deja la piscina sin miembros',
  !impR[0].data.resourcePools[0].members, JSON.stringify(impR[0].data.resourcePools[0]));

// --- 15. El atajo del diagnostico: ir al campo que falta -------------------
//
// El diagnostico dice QUE falta; esto lleva DONDE se escribe. Lo que se prueba es el
// viaje completo sobre DOM real, porque tiene dos partes que solo se ven juntas: que
// el editor cambie de pestaña Y que el campo quede resaltado. Y el resaltado solo
// puede funcionar si el viaje re-renderiza, que es el detalle que se rompe en silencio.
panel.close();

const viajar = (destino) => panel._eventBus.fire('simulation.dataTable.ir', { destino });

// 1) Un dato de TAREAS: toda la COLUMNA, no una celda.
viajar({ espacio: 'tabla', tab: 'tasks', columna: 'carga.distanciaM' });
check('Atajo: el viaje abre la pestaña de la tabla que toca', panel._activeTab === 'tasks',
  panel._activeTab);
check('Atajo: y abre el editor si estaba cerrado', panel.isOpen());
check('Atajo: resalta el campo que falta', Boolean(document.querySelector('[data-field="carga.distanciaM"].destino-resaltado')));

// La columna ENTERA: el dato falta en varias tareas y resaltar solo la primera seria
// mentir sobre donde hay que escribir. Hay 3 tareas en el modelo de prueba.
const resaltadosColumna = document.querySelectorAll('[data-field="carga.distanciaM"].destino-resaltado').length;
check('Atajo: resalta la columna ENTERA, no solo la primera fila',
  resaltadosColumna === 3, `${resaltadosColumna} casillas de 3`);

// 2) Un dato con VARIOS campos: se resaltan todos los del grupo.
viajar({ espacio: 'tabla', tab: 'global', campos: [ 'calendar.workingDays', 'calendar.workingHours.start' ] });
check('Atajo: el viaje cambia de pestaña cuando el dato vive en otra', panel._activeTab === 'global',
  panel._activeTab);
check('Atajo: con varios campos del mismo dato, resalta los que haya',
  Boolean(document.querySelector('[data-days].destino-resaltado'))
  || Boolean(document.querySelector('[data-field="calendar.workingHours.start"].destino-resaltado')));

// 3) El resaltado ANTERIOR se apaga al viajar a otro sitio: si no, al cabo de unos
//    viajes la tabla entera estaria azul y el resaltado no diria nada.
check('Atajo: el resaltado anterior se apaga al viajar a otro sitio',
  !document.querySelector('[data-field="carga.distanciaM"].destino-resaltado'));

// ... y tambien CADUCA SOLO. Se llama al apagado directamente en vez de esperar los
// cuatro segundos: el arnes mira el DOM una sola vez y un temporizador no se puede
// comprobar por fe. Asi se prueba el mismo camino que recorre el temporizador.
viajar({ espacio: 'tabla', tab: 'tasks', columna: 'carga.distanciaM' });
check('Atajo: el resaltado vuelve a pintarse', Boolean(document.querySelector('.destino-resaltado')));
panel._limpiarDestino();
check('Atajo: y caduca solo (el apagado deja la tabla limpia)',
  !document.querySelector('.destino-resaltado'));

// Cerrar el editor tambien lo apaga: al volver a abrirlo, la tabla no puede aparecer
// con la marca de un viaje viejo.
viajar({ espacio: 'tabla', tab: 'tasks', columna: 'carga.distanciaM' });
panel.close();
check('Atajo: cerrar el editor apaga el resaltado',
  !document.querySelector('.destino-resaltado'));

// 4) Un dato que NO se escribe a mano: no se viaja, y SE DICE por que.
const antes = panel._activeTab;
viajar({ espacio: 'solo-aviso' });
check('Atajo: un dato que calcula el diagrama NO mueve la tabla',
  panel._activeTab === antes, `${antes} -> ${panel._activeTab}`);
check('Atajo: y se explica por qué no se viaja, en vez de no hacer nada',
  /no se escribe a mano/i.test(panel._status.textContent || ''), panel._status.textContent);

// 5) Un destino que apunta a un campo que no existe en esa pestaña: se avisa. Es lo
//    que pasaria si el mapa de destinos y el editor se desincronizaran.
viajar({ espacio: 'tabla', tab: 'tasks', campo: 'campo.que.no.existe' });
check('Atajo: un destino sin casilla se avisa en vez de quedarse mudo',
  /No se encontró el campo/i.test(panel._status.textContent || ''), panel._status.textContent);

// --- informe --------------------------------------------------------------

}

try {
  ejecutar();
} catch (e) {
  fallos++;
  resultados.push(`EXCEPCION NO CONTROLADA: ${e && e.message}\n${e && e.stack ? e.stack : ''}`);
}
volcar();
