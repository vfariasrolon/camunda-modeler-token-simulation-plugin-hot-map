import { domify, event as domEvent, classes as domClasses } from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, setSimulationData, isLabel } from './util';
import './data-table.css';

const PANEL_CLS = 'sim-data-table-panel';
const OPEN_CLS = 'open';
const TAB_ACTIVE_CLS = 'active';

// ---------------------------------------------------------------------------
// Unidades. NO unificar en una sola lista: el motor usa DOS convenciones
// distintas y confundirlas produce errores silenciosos.
//
//   - Tareas (processingTime / reworkTime): PLURAL -> lo lee
//     timeToMilliseconds() en SimulationEngine.js. Cualquier otro valor cae al
//     fallback y se interpreta como MILISEGUNDOS (factor 60.000 de error).
//   - arrivalRate: SINGULAR -> lo lee el bloque de arrivalRate en
//     SimulationEngine.js. Cualquier otro valor se trata como minutos.
// ---------------------------------------------------------------------------
const TASK_UNITS = ['minutes', 'hours', 'seconds'];
const RATE_UNITS = ['minute', 'hour', 'second'];

// Nombres de los dias para las casillas de "dias laborables". El indice es el
// valor que espera el motor: 0 = domingo.
const DIAS = [ 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb' ];

const TASK_DEFAULTS = () => ({
  processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' },
  failureRate: 0,
  reworkTime: { distribution: 'fixed', value: 20, unit: 'minutes' }
});

const FLOW_DEFAULTS = () => ({ branchingProbability: 0.5 });

// ---------------------------------------------------------------------------
// Campos de la configuracion global (StartEvent raiz). Se describen por ruta
// para poder leerlos y escribirlos de forma generica.
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

const GLOBAL_FIELDS = [
  { key: 'startDate', label: 'Fecha de inicio de la simulación', kind: 'text', path: [ 'startDate' ] },
  { key: 'simulationConfig.runValue', label: 'Instancias a simular', kind: 'number', path: [ 'simulationConfig', 'runValue' ], min: 1 },
  { key: 'arrivalRate.value', label: 'Tasa de llegada: cuántas llegadas por unidad', kind: 'number', path: [ 'arrivalRate', 'value' ], min: 0 },
  { key: 'arrivalRate.unit', label: 'Tasa de llegada: unidad de tiempo', kind: 'select', options: RATE_UNITS, path: [ 'arrivalRate', 'unit' ] },
  { key: 'cost.baseRatePerHour', label: 'Tarifa base por hora', kind: 'number', path: [ 'cost', 'baseRatePerHour' ], min: 0 },
  { key: 'cost.waitCostPerHour', label: 'Costo de espera por hora', kind: 'number', path: [ 'cost', 'waitCostPerHour' ], min: 0 },
  { key: 'overtime.limitHours', label: 'Límite de horas antes de recargo', kind: 'number', path: [ 'overtime', 'limitHours' ], min: 0 },
  { key: 'overtime.payMultiplier', label: 'Multiplicador de hora extra (x)', kind: 'number', path: [ 'overtime', 'payMultiplier' ], min: 1 },
  { key: 'overtime.excessPayMultiplier', label: 'Multiplicador de exceso (x)', kind: 'number', path: [ 'overtime', 'excessPayMultiplier' ], min: 1 },
  { key: 'calendar.workingDays', label: 'Días laborables (0=Dom … 6=Sáb)', kind: 'days', path: [ 'calendar', 'workingDays' ] },
  { key: 'calendar.workingHours.start', label: 'Hora de entrada', kind: 'time', path: [ 'calendar', 'workingHours', 'start' ] },
  { key: 'calendar.workingHours.end', label: 'Hora de salida', kind: 'time', path: [ 'calendar', 'workingHours', 'end' ] }
];

const DEFAULT_GLOBAL = () => ({
  startDate: '',
  // CORREGIDO: antes era `{ value: 60, unit: 'minute' }`, que NO significa «una
  // llegada cada 60 minutos» sino 60 llegadas por minuto, o sea una por SEGUNDO:
  // las 1000 instancias entraban en la primera jornada y el cupo semanal de
  // horas extra se agotaba de una vez. Es una tasa, y el valor por defecto debe
  // ser una tasa razonable: una llegada por minuto.
  arrivalRate: { value: 1, unit: 'minute' },
  simulationConfig: { runValue: 1000 },
  isRoot: true,
  calendar: {
    workingDays: [ 1, 2, 3, 4, 5 ],
    workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }
  },
  cost: { baseRatePerHour: 50, waitCostPerHour: 0 },
  overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 }
});

const getByPath = (obj, path) => path.reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
const setByPath = (obj, path, value) => {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] == null || typeof cur[path[i]] !== 'object') cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
};

// Los nombres de elementos vienen del archivo .bpmn del usuario y pueden
// contener comillas o angulos. Sin escapar, romperian el markup de la tabla.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
const csvEscape = (value) => {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

// Parser tolerante: soporta comillas dobles escapadas, campos multilinea y
// separador coma o punto y coma (Excel en español exporta con ';').
const parseCsv = (text) => {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
};

const download = (filename, text) => {
  const blob = new Blob([ '\uFEFF' + text ], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Nota: los elementos del registro incluyen las ETIQUETAS (los textos). Se
// descartan con isLabel() de util.js antes de comprobar el tipo; si no, la tabla
// mostraria una fila por figura MAS una por su texto.
// ---------------------------------------------------------------------------

const TableIcon = '<path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 4H4V5h16v2zm-10 4h3v3h-3v-3zm0 5h3v3h-3v-3zm-5-5h3v3H5v-3zm0 5h3v3H5v-3zm11-5h3v3h-3v-3zm0 5h3v3h-3v-3z"/>';
// Estrella de cuatro puntas: "generar datos de prueba".
const TestDataIcon = '<path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z"/>';
const ExportIcon = '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>';
const ImportIcon = '<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>';
const CloseIcon = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
// Lapiz del acceso directo sobre la figura seleccionada.
const EditIcon = '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>';

const svg = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;

export default class DataTablePanel {

  constructor(canvas, eventBus, elementRegistry, modeling, bpmnFactory, notifications, editorActions, overlays, selection) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._notifications = notifications;
    // Sirve para disparar 'toggleTokenSimulation' (esta en la lista blanca de
    // DisableModeling, asi que funciona con el modo activo) y resolver el
    // bloqueo de solo lectura sin mandar al usuario al menu.
    this._editorActions = editorActions;
    // El acceso directo por elemento (el lapiz) vive aqui y no en un modulo
    // aparte: abre ESTA tabla, asi que mantenerlo separado solo servia para
    // duplicar la logica de guardado (y para perderla: el modal antiguo forzaba
    // `distribution: "fixed"` y destruia un triangular configurado).
    this._overlays = overlays;
    this._selection = selection;

    this._panel = null;
    this._activeTab = 'tasks';
    this._focusId = null;
    this._btnDesactivar = null;
    this._overlayId = null;

    this._eventBus.on('canvas.init', () => this._init());
    this._eventBus.on('diagram.destroy', () => this.destroy());

    // Lapiz sobre la figura seleccionada, para llegar a su fila de un clic.
    this._eventBus.on('selection.changed', ({ newSelection }) => {
      this._quitarLapiz();
      if (newSelection.length === 1 && this._esEditable(newSelection[0])) {
        this._ponerLapiz(newSelection[0]);
      }
    });
  }

  /**
   * Indica si la tabla tiene algo que editar para ese elemento.
   *
   * Evita poner el lapiz sobre figuras que no aparecen en ninguna pestaña: al
   * pulsarlo no habria a donde llevar al usuario.
   */
  _esEditable(element) {
    if (!element || isLabel(element)) return false;
    if (is(element, 'bpmn:Task')) return true;
    if (is(element, 'bpmn:StartEvent')) return true;
    if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant')) return true;
    return is(element, 'bpmn:SequenceFlow')
      && Boolean(element.source && is(element.source, 'bpmn:ExclusiveGateway'));
  }

  _ponerLapiz(element) {
    const nodo = domify(
      `<div class="sim-data-table-overlay" title="Editar los datos de simulación de este elemento"`
      + ` data-tip="Editar en la tabla de datos">${svg(EditIcon)}</div>`
    );
    domEvent.bind(nodo, 'click', () => this.openFor(element));
    this._overlayId = this._overlays.add(element, 'sim-data-table', {
      position: { top: -12, left: -12 },
      html: nodo
    });
  }

  _quitarLapiz() {
    if (this._overlayId) {
      this._overlays.remove(this._overlayId);
      this._overlayId = null;
    }
  }

  // -- infraestructura ------------------------------------------------------

  _init() {
    if (this._panel) return;

    const panel = this._panel = domify(`
      <div class="${PANEL_CLS}">
        <div class="panel-header">
          <span class="panel-title">${svg(TableIcon)} Datos de simulación por tabla</span>
          <div class="panel-actions">
            <button class="btn-test" title="Datos de prueba" data-tip="Rellena la pestaña con datos de prueba, para revisarlos antes de guardar">${svg(TestDataIcon)}</button>
            <button class="btn-export" title="Exportar CSV" data-tip="Exportar la pestaña actual a CSV (para Excel)">${svg(ExportIcon)}</button>
            <button class="btn-import" title="Importar CSV" data-tip="Importar un CSV exportado, editado en Excel">${svg(ImportIcon)}</button>
            <button class="btn-close" title="Cerrar" data-tip="Cerrar la tabla" data-tip-pos="left">${svg(CloseIcon)}</button>
          </div>
        </div>
        <div class="panel-tabs">
          <button data-tab="tasks" class="${TAB_ACTIVE_CLS}">Tareas</button>
          <button data-tab="flows">Flujos</button>
          <button data-tab="resources">Recursos</button>
          <button data-tab="global">Global</button>
        </div>
        <div class="panel-body"></div>
        <div class="panel-footer">
          <span class="status"></span>
          <button class="btn-save">Guardar todo</button>
        </div>
        <input type="file" class="csv-input" accept=".csv,text/csv" hidden>
      </div>
    `);

    this._canvas.getContainer().appendChild(panel);

    this._body = panel.querySelector('.panel-body');
    this._status = panel.querySelector('.status');
    this._fileInput = panel.querySelector('.csv-input');

    domEvent.bind(panel.querySelector('.btn-close'), 'click', () => this.close());
    domEvent.bind(panel.querySelector('.btn-save'), 'click', () => this.save());
    domEvent.bind(panel.querySelector('.btn-test'), 'click', () => this.generarDatosDePrueba());
    domEvent.bind(panel.querySelector('.btn-export'), 'click', () => this.exportCsv());
    domEvent.bind(panel.querySelector('.btn-import'), 'click', () => this._fileInput.click());
    domEvent.bind(this._fileInput, 'change', (e) => this.importCsv(e));

    panel.querySelectorAll('.panel-tabs button').forEach((btn) => {
      domEvent.bind(btn, 'click', () => {
        this._activeTab = btn.dataset.tab;
        panel.querySelectorAll('.panel-tabs button').forEach((b) => domClasses(b).toggle(TAB_ACTIVE_CLS, b === btn));
        this._render();
      });
    });
  }

  isOpen() { return this._panel && domClasses(this._panel).has(OPEN_CLS); }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() {
    if (!this._panel) this._init();
    domClasses(this._panel).add(OPEN_CLS);
    this._render();
  }

  /**
   * Abre la tabla centrada en un elemento concreto.
   *
   * Sustituye al modal del lapiz: en vez de mantener un formulario aparte que
   * solo editaba un elemento a la vez (y que forzaba `distribution: "fixed"` al
   * guardar, destruyendo un triangular configurado), lleva al panel de tabla
   * —la unica fuente de verdad— a la pestaña que corresponde al elemento y
   * marca su fila para que se vea cual se va a editar.
   */
  openFor(element) {
    if (!element) return this.open();

    if (is(element, 'bpmn:Task')) this._activeTab = 'tasks';
    else if (is(element, 'bpmn:SequenceFlow')) this._activeTab = 'flows';
    else if (is(element, 'bpmn:StartEvent')) this._activeTab = 'global';
    else if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant')) this._activeTab = 'resources';
    else this._activeTab = 'tasks';

    this._focusId = element.id;
    this.open();

    // _render() reconstruye las pestañas sin conservar cual estaba activa, asi
    // que se marca aqui.
    this._panel.querySelectorAll('.panel-tabs button').forEach((b) =>
      domClasses(b).toggle(TAB_ACTIVE_CLS, b.dataset.tab === this._activeTab));

    const fila = this._panel.querySelector(`tbody tr[data-el-id="${element.id}"]`);
    if (fila) {
      domClasses(fila).add('fila-foco');
      if (fila.scrollIntoView) fila.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  close() {
    if (this._panel) domClasses(this._panel).remove(OPEN_CLS);
    this._focusId = null;
    this._quitarOferta();
  }
  destroy() {
    this._quitarLapiz();
    this._quitarOferta();
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
      this._panel = null;
    }
  }

  _setStatus(text, kind) {
    if (!this._status) return;
    this._status.textContent = text || '';
    this._status.className = 'status' + (kind ? ' ' + kind : '');
  }

  /**
   * Ofrece desactivar el modo Token Simulation y reintentar la operacion.
   *
   * Antes solo se mostraba un aviso y el usuario tenia que ir al menu, pulsar
   * «Toggle Token Simulation» y volver a empezar. Peor: el aviso venia seguido de
   * un `_render()` que reconstruia la tabla desde el diagrama, asi que TODO lo
   * que el usuario acababa de teclear se perdia — justo el escenario donde mas
   * molesta. Aqui no se re-renderiza (los valores siguen en pantalla) y se
   * ofrece un boton que dispara 'toggleTokenSimulation' y reintenta tal cual.
   *
   * `toggleTokenSimulation` esta en la lista blanca de DisableModeling, asi que
   * funciona aunque el modo este activo (es su proposito).
   *
   * @param {string}   mensaje      texto del estado (el motivo del bloqueo)
   * @param {Function} alReintentar accion a repetir tras desactivar el modo
   */
  _ofrecerDesactivarModo(mensaje, alReintentar) {
    this._quitarOferta();
    if (!this._panel) return;

    const boton = this._btnDesactivar = domify(
      '<button class="btn-desactivar" type="button">Desactivar modo y reintentar</button>'
    );

    domEvent.bind(boton, 'click', () => {
      this._quitarOferta();
      try {
        this._editorActions.trigger('toggleTokenSimulation');
      } catch (err) {
        this._setStatus(`No se pudo desactivar el modo Token Simulation: ${err.message || err}`, 'error');
        return;
      }
      alReintentar();
    });

    const footer = this._panel.querySelector('.panel-footer');
    footer.insertBefore(boton, footer.querySelector('.btn-save'));
    this._setStatus(mensaje, 'error');
  }

  _quitarOferta() {
    if (this._btnDesactivar && this._btnDesactivar.parentNode) {
      this._btnDesactivar.parentNode.removeChild(this._btnDesactivar);
    }
    this._btnDesactivar = null;
  }

  // -- acceso a datos -------------------------------------------------------

  _getTasks() {
    return this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task'));
  }

  _getFlows() {
    return this._elementRegistry.filter(
      (el) => !isLabel(el) && is(el, 'bpmn:SequenceFlow') && el.source && is(el.source, 'bpmn:ExclusiveGateway')
    );
  }

  _getRootStartEvent() {
    const starts = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:StartEvent'));
    return starts.find((el) => {
      const d = getSimulationData(el);
      return d && d.isRoot;
    }) || null;
  }

  /**
   * Elemento que guarda las piscinas de recursos: el proceso o el participante.
   *
   * Se replica el MISMO criterio que usa el motor (`_elementRegistry.find(...)`)
   * para que lo que se edita aqui sea exactamente lo que el motor lee. En un
   * diagrama con varios participantes el motor toma el primero; si eso cambia
   * algun dia, tiene que cambiar en los dos sitios a la vez.
   */
  _getProcessRoot() {
    return this._elementRegistry.find((el) => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant')) || null;
  }

  /** Piscinas de recursos declaradas en el proceso. */
  _getPools() {
    const root = this._getProcessRoot();
    if (!root) return [];
    const d = getSimulationData(root) || {};
    return Array.isArray(d.resourcePools) ? d.resourcePools : [];
  }

  _label(element) {
    const bo = element.businessObject;
    return bo.name || element.id;
  }

  _taskData(element) {
    const raw = getSimulationData(element) || {};
    const d = TASK_DEFAULTS();
    return {
      ...d,
      ...raw,
      processingTime: { ...d.processingTime, ...(raw.processingTime || {}) },
      reworkTime: { ...d.reworkTime, ...(raw.reworkTime || {}) }
    };
  }

  _flowData(element) {
    const raw = getSimulationData(element) || {};
    return { ...FLOW_DEFAULTS(), ...raw };
  }

  _globalData() {
    const root = this._getRootStartEvent();
    if (!root) return null;
    const raw = getSimulationData(root) || {};
    const d = DEFAULT_GLOBAL();
    return { element: root, data: { ...d, ...raw, isRoot: true } };
  }

  // -- render ---------------------------------------------------------------

  _render() {
    if (!this._panel) return;
    this._setStatus('');
    this._quitarOferta();

    if (this._activeTab === 'tasks') this._renderTasks();
    else if (this._activeTab === 'flows') this._renderFlows();
    else if (this._activeTab === 'resources') this._renderResources();
    else this._renderGlobal();

    this._avisarSinRaiz();
  }

  /**
   * Aviso en Tareas y Flujos cuando no hay evento raiz.
   *
   * Sin esto se puede rellenar y guardar toda la tabla y descubrir al simular
   * que el motor se niega a arrancar ("No root start event found"), sin ninguna
   * pista de donde esta el problema: la causa esta en otra pestaña.
   */
  _avisarSinRaiz() {
    if (this._activeTab === 'global') return;
    if (this._getRootStartEvent()) return;
    if (!this._body) return;

    const aviso = domify(
      '<p class="aviso-raiz">Sin evento raíz configurado la simulación no se ejecutará. '
      + 'Ve a la pestaña <strong>Global</strong> para crearlo.</p>'
    );
    this._body.insertBefore(aviso, this._body.firstChild);
  }

  _renderTasks() {
    const tasks = this._getTasks();

    if (!tasks.length) {
      this._body.innerHTML = '<p class="empty">No hay tareas en el diagrama.</p>';
      return;
    }

    const nombresPool = this._getPools().map((p) => p.name).filter(Boolean);

    this._body.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-name">Tarea</th>
            <th>Distribución</th>
            <th>Tiempo</th>
            <th>Unidad</th>
            <th>mín</th>
            <th>moda</th>
            <th>máx</th>
            <th>Tasa de fallo</th>
            <th>Retrabajo</th>
            <th>Unidad</th>
            <th>Recurso</th>
            <th>Cant.</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((el) => {
            const d = this._taskData(el);
            const units = (selected) => TASK_UNITS
              .map((u) => `<option value="${u}" ${selected === u ? 'selected' : ''}>${u}</option>`).join('');
            const dist = d.processingTime.distribution || 'fixed';
            const tri = dist === 'triangular';
            // Los campos de min/moda/max solo se leen cuando la distribucion es
            // triangular; con "fija" se ignora lo que haya en ellos.
            const p = (campo, valor, marcador) =>
              `<input type="number" step="any" min="0" class="cell mini" `
              + `data-field="${campo}" value="${valor == null ? '' : valor}" placeholder="${marcador}">`;

            // Selector en vez de texto libre: el motor busca la piscina por
            // nombre exacto y, si no la encuentra, IGNORA el recurso en silencio.
            // Una errata desactivaria la restriccion sin avisar.
            const actual = (d.resources && d.resources.pool) || '';
            const opciones = [ '' ].concat(nombresPool);
            // Si la tarea apunta a una piscina que ya no existe, se conserva
            // como opcion para no borrarla sin querer al guardar.
            if (actual && !nombresPool.includes(actual)) opciones.push(actual);
            const selectPool = opciones.map((n) =>
              `<option value="${esc(n)}" ${actual === n ? 'selected' : ''}>${n === '' ? '(ninguno)' : esc(n)}</option>`
            ).join('');

            return `
              <tr data-el-id="${el.id}">
                <td class="col-name" title="${esc(this._label(el))}">${esc(this._label(el))}</td>
                <td><select class="cell" data-field="processingTime.distribution">
                  <option value="fixed" ${!tri ? 'selected' : ''}>fija</option>
                  <option value="triangular" ${tri ? 'selected' : ''}>triangular</option>
                </select></td>
                <td><input type="number" step="any" min="0" class="cell" data-field="processingTime.value" value="${d.processingTime.value}"></td>
                <td><select class="cell" data-field="processingTime.unit">${units(d.processingTime.unit)}</select></td>
                <td>${p('processingTime.min', d.processingTime.min, 'mín')}</td>
                <td>${p('processingTime.mode', d.processingTime.mode, 'moda')}</td>
                <td>${p('processingTime.max', d.processingTime.max, 'máx')}</td>
                <td><input type="number" step="0.01" min="0" max="1" class="cell" data-field="failureRate" value="${d.failureRate}"></td>
                <td><input type="number" step="any" min="0" class="cell" data-field="reworkTime.value" value="${d.reworkTime.value}"></td>
                <td><select class="cell" data-field="reworkTime.unit">${units(d.reworkTime.unit)}</select></td>
                <td><select class="cell" data-field="resources.pool">${selectPool}</select></td>
                <td><input type="number" step="1" min="1" class="cell mini" data-field="resources.quantityRequired"
                  value="${(d.resources && d.resources.quantityRequired) || 1}"
                  ${actual ? '' : 'disabled title="Elige primero una piscina"'}>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="hint">
        El tiempo se interpreta de una forma u otra según la <strong>distribución</strong>:
        con <em>fija</em> se usa el valor de «Tiempo»; con <em>triangular</em> se usan
        <strong>mín</strong>, <strong>moda</strong> y <strong>máx</strong>, y el valor de «Tiempo» se ignora.
        Con la distribución fija la simulación es determinista.
      </p>
      <p class="hint">
        <strong>Recurso</strong>: la tarea toma esa cantidad de la piscina antes de empezar y la devuelve al
        terminar. Si no hay unidades libres, <em>espera en cola</em>: esa espera se ve en el
        «Tiempo de espera» del mapa de calor y, si defines un costo de espera, en el «Costo de tiempos muertos».
        Las piscinas se definen en la pestaña <strong>Recursos</strong>; sin ninguna dada de alta, esta columna
        no tiene nada que ofrecer.
      </p>
    `;
  }

  /**
   * Pestaña de piscinas de recursos.
   *
   * Faltaba: el motor lee `resourcePools` del proceso, la metrica "Cantidad de
   * Recursos" existe en la paleta y las tareas ya podian consumir recursos...
   * pero no habia NINGUNA forma de declarar una piscina desde el plugin. Solo el
   * generador aleatorio (ya retirado) las creaba.
   */
  _renderResources() {
    const root = this._getProcessRoot();

    if (!root) {
      this._body.innerHTML = '<p class="empty">El diagrama no tiene ningún proceso donde guardar los recursos.</p>';
      return;
    }

    const pools = this._getPools();

    this._body.innerHTML = `
      <p class="hint">
        Piscinas de recursos del proceso: <strong>${esc(this._label(root))}</strong>.
        Cada piscina es un grupo de unidades equivalentes (personas, máquinas, vehículos).
      </p>
      <table class="data-table">
        <thead>
          <tr><th>Nombre de la piscina</th><th>Cantidad</th><th></th></tr>
        </thead>
        <tbody class="filas-pool">
          ${pools.map((p) => this._filaPool(p.name, p.quantity)).join('')}
        </tbody>
      </table>
      <p class="hint">
        Los nombres deben ser <strong>únicos</strong> y las cantidades enteros ≥ 1.
        Después podrás asignarlas en la pestaña <strong>Tareas</strong>.
      </p>
      <button class="btn-anadir-fila" type="button">+ Añadir piscina</button>
    `;

    const boton = this._body.querySelector('.btn-anadir-fila');
    if (boton) {
      domEvent.bind(boton, 'click', () => {
        const tbody = this._body.querySelector('.filas-pool');
        // insertAdjacentHTML y no domify(): un <tr> suelto no sobrevive al
        // parseo de un contenedor que no sea <table>/<tbody>.
        tbody.insertAdjacentHTML('beforeend', this._filaPool('', 1));
      });
    }

    // Delegacion: un unico manejador en el tbody cubre las filas que se añadan
    // despues, y evita re-vincular los botones que ya existian.
    const tbody = this._body.querySelector('.filas-pool');
    if (tbody) {
      domEvent.bind(tbody, 'click', (e) => {
        const btn = e.target.closest ? e.target.closest('.btn-quitar-pool') : null;
        if (!btn) return;
        const tr = btn.closest('tr');
        if (tr) tr.remove();
      });
    }
  }

  _filaPool(nombre, cantidad) {
    const valor = cantidad == null || cantidad === '' ? 1 : cantidad;
    return `
      <tr>
        <td><input type="text" class="cell" data-field="pool.name"
          value="${esc(nombre == null ? '' : nombre)}" placeholder="p. ej. Analistas"></td>
        <td><input type="number" step="1" min="1" class="cell mini" data-field="pool.quantity" value="${valor}"></td>
        <td><button class="btn-quitar-pool" type="button" title="Quitar esta piscina" data-tip="Quitar esta fila">×</button></td>
      </tr>`;
  }

  _renderFlows() {
    const flows = this._getFlows();

    if (!flows.length) {
      this._body.innerHTML = '<p class="empty">No hay flujos salientes de compuertas exclusivas.</p>';
      return;
    }

    this._body.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Compuerta</th>
            <th>Hacia</th>
            <th>Probabilidad</th>
          </tr>
        </thead>
        <tbody>
          ${flows.map((el) => {
            const d = this._flowData(el);
            return `
              <tr data-el-id="${el.id}">
                <td title="${esc(this._label(el.source))}">${esc(this._label(el.source))}</td>
                <td title="${esc(el.target ? this._label(el.target) : '')}">${esc(el.target ? this._label(el.target) : '(sin destino)')}</td>
                <td><input type="number" step="0.01" min="0" max="1" class="cell" data-field="branchingProbability" value="${d.branchingProbability}"></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="hint">La probabilidad es por flujo saliente. Normalmente deben sumar 1 entre todas las salidas de la misma compuerta.</p>
    `;
  }

  _renderGlobal() {
    const info = this._globalData();

    if (!info) {
      // Hueco que tenia la tabla: la pestaña Global solo EDITABA un evento raiz
      // que ya existiera, pero no habia forma de crearlo desde aqui. El usuario
      // rellenaba las tareas, guardaba, y al simular recibia "No root start
      // event found" sin saber que le faltaba. Ahora se puede crear desde aqui.
      const inicios = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:StartEvent'));

      if (!inicios.length) {
        this._body.innerHTML = `
          <p class="empty">
            El diagrama no tiene ningún <strong>evento de inicio</strong>.<br>
            Añade uno al diagrama para poder configurar la simulación.
          </p>`;
        return;
      }

      this._body.innerHTML = `
        <p class="empty">
          Ningún evento de inicio está marcado como <strong>configuración raíz</strong>.<br>
          Sin él la simulación no se ejecuta: no hay jornada, ni tarifa, ni número de instancias.
        </p>
        <div class="raices">
          ${inicios.map((el) => `
            <button class="btn-raiz" data-el-id="${el.id}">
              Usar <strong>${esc(this._label(el))}</strong> como configuración raíz
            </button>`).join('')}
        </div>
        <p class="hint">
          Se crearán los valores por defecto: 1000 instancias, <strong>una llegada por minuto</strong>
          (tasa 1 por <code>minute</code>), jornada 09:00-17:00 de lunes a viernes y 50 por hora.
          Podrás ajustarlos aquí mismo.
        </p>
      `;

      this._body.querySelectorAll('.btn-raiz').forEach((btn) => {
        domEvent.bind(btn, 'click', () => this.marcarRaiz(btn.dataset.elId));
      });
      return;
    }

    const { element, data } = info;

    const cell = (field) => {
      const value = getByPath(data, field.path);

      if (field.kind === 'select') {
        return `<select class="cell" data-field="${field.key}">${field.options
          .map((o) => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      }
      // Dias laborables con CASILLAS, no texto libre: era una regresion respecto
      // al editor elemento a elemento. Un "1,2,3,4,5" escrito a mano puede
      // quedar invalido por una errata sin que nada avise; con casillas no hay
      // forma de equivocarse. El CSV los sigue tratando como lista de numeros.
      if (field.kind === 'days') {
        const activos = Array.isArray(value) ? value : [];
        return `<span class="dias">${DIAS.map((nombre, i) =>
          `<label><input type="checkbox" data-days="${field.key}" value="${i}"`
          + `${activos.includes(i) ? ' checked' : ''}> ${nombre}</label>`
        ).join('')}</span>`;
      }
      // Selector de hora nativo: mismo motivo, y evita el formato invalido.
      if (field.kind === 'time') {
        const text = value && typeof value === 'object' ? `${pad(value.hour)}:${pad(value.minute)}` : '';
        return `<input type="time" class="cell" data-field="${field.key}" value="${esc(text)}">`;
      }
      return `<input type="text" class="cell" data-field="${field.key}" value="${esc(value == null ? '' : value)}">`;
    };

    this._body.innerHTML = `
      <p class="hint">Configuración global del evento raíz: <strong>${esc(this._label(element))}</strong> (${esc(element.id)})</p>
      <table class="data-table">
        <thead>
          <tr><th class="col-campo">Campo</th><th>Valor</th></tr>
        </thead>
        <tbody>
          ${GLOBAL_FIELDS.map((f) => `
            <tr data-el-id="${element.id}">
              <td class="col-campo" title="${esc(f.key)}">${esc(f.label)}</td>
              <td>${cell(f)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="hint">
        <strong>La tasa de llegada es una tasa, no un intervalo.</strong>
        Con valor <code>60</code> y unidad <code>minute</code> no significa «una cada 60 minutos»:
        significa <strong>60 llegadas por minuto, o sea una cada segundo</strong>, y las 1000 instancias
        entrarían en la primera jornada. Para una llegada cada 60 minutos pon <code>1</code> con unidad
        <code>hour</code>. El informe de la consola imprime la tasa ya resuelta («una cada 1.0 s»).
      </p>
      <p class="hint">
        Marca los días laborables y ajusta las horas con los selectores.
        La hora de entrada debe ser anterior a la de salida.
      </p>
    `;
  }

  // -- guardar --------------------------------------------------------------

  _num(raw, label, row) {
    const n = Number(String(raw).trim().replace(',', '.'));
    if (String(raw).trim() === '' || Number.isNaN(n)) {
      throw new Error(`${label}: valor no numérico («${raw}»)`);
    }
    return n;
  }

  /**
   * Reune los cambios de la pestaña activa. Lanza Error con el primer problema
   * encontrado para no escribir datos a medias.
   */
  _collect() {
    const writes = [];

    if (this._activeTab === 'tasks') {
      this._body.querySelectorAll('tbody tr').forEach((tr) => {
        const el = this._elementRegistry.get(tr.dataset.elId);
        if (!el) return;

        const name = this._label(el);
        const val = (f) => {
          const input = tr.querySelector(`[data-field="${f}"]`);
          return input ? input.value : '';
        };
        const num = (f, etiqueta) => this._num(val(f), `${name} · ${etiqueta}`);

        const distribucion = val('processingTime.distribution') || 'fixed';
        const unit = val('processingTime.unit');
        const unitRetrabajo = val('reworkTime.unit');

        const failure = num('failureRate', 'tasa de fallo');
        if (failure < 0 || failure > 1) {
          throw new Error(`${name}: la tasa de fallo debe estar entre 0 y 1`);
        }

        // El tiempo de proceso se lee SEGUN la distribucion elegida: con
        // triangular mandan min/moda/max y el campo "Tiempo" no se lee en
        // absoluto. Leer los dos seria peor que no leer ninguno: se guardaria
        // un valor que el motor va a ignorar.
        let processingTime;
        if (distribucion === 'triangular') {
          const min = num('processingTime.min', 'mínimo');
          const mode = num('processingTime.mode', 'moda');
          const max = num('processingTime.max', 'máximo');

          if (!(min <= mode && mode <= max)) {
            throw new Error(
              `${name}: en la distribución triangular debe cumplirse mínimo ≤ moda ≤ máximo `
              + `(has puesto ${min}, ${mode}, ${max})`
            );
          }
          processingTime = { distribution: 'triangular', min, mode, max, unit };
        } else {
          const value = num('processingTime.value', 'tiempo de proceso');
          if (value < 0) throw new Error(`${name}: el tiempo de proceso no puede ser negativo`);
          processingTime = { distribution: 'fixed', value, unit };
        }

        const reworkValue = num('reworkTime.value', 'retrabajo');
        if (reworkValue < 0) throw new Error(`${name}: el retrabajo no puede ser negativo`);

        // Recurso: '(ninguno)' deja el campo vacio, que es lo que el motor lee
        // como "sin restriccion de recursos".
        const pool = val('resources.pool');
        const cantRaw = val('resources.quantityRequired');
        let recurso = null;
        if (pool) {
          const cantidad = cantRaw === '' ? 1 : this._num(cantRaw, `${name} · cantidad de recurso`);
          if (!(cantidad >= 1)) {
            throw new Error(`${name}: la cantidad de recurso debe ser un número mayor o igual que 1`);
          }
          if (!this._getPools().some((p) => p.name === pool)) {
            throw new Error(
              `${name}: la piscina «${pool}» no está dada de alta. Créala en la pestaña Recursos antes de asignarla.`
            );
          }
          recurso = { pool, quantityRequired: cantidad };
        }

        const current = this._taskData(el);
        const datos = {
          ...current,
          processingTime,
          // Se conserva la distribucion del retrabajo que hubiera: la tabla
          // todavia no la edita, y forzarla a "fixed" destruiria un triangular
          // configurado. Mismo error que tenia el modal del lapiz.
          reworkTime: { ...current.reworkTime, value: reworkValue, unit: unitRetrabajo },
          failureRate: failure
        };
        // delete y no null: el motor comprueba `data.resources && data.resources.pool`,
        // asi que un objeto con pool vacio pasaria el primer filtro. Ademas el
        // JSON no arrastra claves muertas.
        if (recurso) datos.resources = recurso;
        else delete datos.resources;

        writes.push({ element: el, data: datos });
      });
      return writes;
    }

    if (this._activeTab === 'resources') {
      const root = this._getProcessRoot();
      if (!root) throw new Error('El diagrama no tiene ningún proceso donde guardar los recursos');

      const pools = [];
      const vistos = new Set();

      this._body.querySelectorAll('.filas-pool tr').forEach((tr, i) => {
        const nombre = String(tr.querySelector('[data-field="pool.name"]').value || '').trim();
        const cantRaw = String(tr.querySelector('[data-field="pool.quantity"]').value || '').trim();

        // Fila totalmente vacia: se ignora en vez de dar error, para que la fila
        // que se acaba de añadir y no se ha rellenado no bloquee el guardado.
        if (nombre === '' && cantRaw === '') return;

        if (!nombre) throw new Error(`Piscina ${i + 1}: falta el nombre`);
        if (vistos.has(nombre)) throw new Error(`Piscina «${nombre}»: el nombre está repetido`);
        vistos.add(nombre);

        const cantidad = this._num(cantRaw, `Piscina «${nombre}» · cantidad`);
        if (!Number.isInteger(cantidad) || cantidad < 1) {
          throw new Error(`Piscina «${nombre}»: la cantidad debe ser un entero mayor o igual que 1`);
        }

        pools.push({ name: nombre, quantity: cantidad });
      });

      writes.push({
        element: root,
        data: { ...(getSimulationData(root) || {}), resourcePools: pools }
      });
      return writes;
    }

    if (this._activeTab === 'flows') {
      this._body.querySelectorAll('tbody tr').forEach((tr) => {
        const el = this._elementRegistry.get(tr.dataset.elId);
        if (!el) return;
        const raw = tr.querySelector('[data-field="branchingProbability"]').value;
        const p = this._num(raw, `${this._label(el.source)} → ${el.target ? this._label(el.target) : '?'}`, tr);
        if (p < 0 || p > 1) throw new Error(`Probabilidad fuera de rango (0-1): «${raw}»`);
        writes.push({ element: el, data: { ...this._flowData(el), branchingProbability: p } });
      });
      return writes;
    }

    const info = this._globalData();
    if (!info) throw new Error('No hay evento raíz configurado');

    const data = JSON.parse(JSON.stringify(info.data));

    // Se recorre la lista de campos en vez de los inputs del DOM: los dias son
    // VARIAS casillas por campo (una por dia), asi que no encajan en el patron
    // "un input por campo" que usan las demas pestañas.
    GLOBAL_FIELDS.forEach((field) => {
      if (field.kind === 'days') {
        const marcados = Array.from(this._body.querySelectorAll(`[data-days="${field.key}"]:checked`))
          .map((c) => Number(c.value));
        if (!marcados.length) {
          throw new Error(`${field.label}: marca al menos un día`);
        }
        setByPath(data, field.path, marcados.sort((a, b) => a - b));
        return;
      }

      const input = this._body.querySelector(`[data-field="${field.key}"]`);
      if (!input) return;
      const raw = input.value;

      if (field.kind === 'number') {
        const n = this._num(raw, field.label);
        if (field.min != null && n < field.min) throw new Error(`${field.label}: debe ser ≥ ${field.min}`);
        setByPath(data, field.path, n);
      } else if (field.kind === 'time') {
        // <input type="time"> ya entrega HH:MM, pero puede quedar vacio si el
        // usuario borra el campo, asi que se valida igualmente.
        const m = String(raw).match(/^(\d{2}):(\d{2})$/);
        if (!m) throw new Error(`${field.label}: hora no válida («${raw}»)`);
        const hour = Number(m[1]);
        const minute = Number(m[2]);
        if (hour > 23 || minute > 59) throw new Error(`${field.label}: hora fuera de rango («${raw}»)`);
        setByPath(data, field.path, { hour, minute });
      } else {
        setByPath(data, field.path, raw);
      }
    });

    // Coherencia del horario: si la entrada es posterior a la salida, el motor
    // no calcula nada util y el usuario no recibe ningun aviso.
    const entrada = getByPath(data, [ 'calendar', 'workingHours', 'start' ]);
    const salida = getByPath(data, [ 'calendar', 'workingHours', 'end' ]);
    if (entrada && salida && (entrada.hour * 60 + entrada.minute) >= (salida.hour * 60 + salida.minute)) {
      throw new Error('La hora de entrada debe ser anterior a la de salida');
    }

    writes.push({ element: info.element, data });
    return writes;
  }

  /**
   * Rellena la pestaña activa con datos de prueba.
   *
   * IMPORTANTE: escribe en las CELDAS de la tabla, no en el diagrama. El boton
   * del menu de la aplicacion escribia directamente en el BPMN, sobrescribiendo
   * lo que hubiera sin posibilidad de revisarlo. Aqui los valores quedan a la
   * vista, se pueden corregir a mano y solo se aplican al pulsar "Guardar todo".
   * Ademas, como no se guarda nada, un clic accidental solo cuesta los cambios
   * que hubiera sin guardar en la tabla.
   *
   * Los rangos son deliberadamente amplios y siguen la convencion habitual en
   * simulacion de procesos: tiempo de proceso 5-45 min, fallo 1-30%, retrabajo
   * 5-30 min. Lo que importa es que se VEAN en la tabla y se puedan corregir.
   */
  generarDatosDePrueba() {
    if (this._activeTab === 'global' || this._activeTab === 'resources') {
      this._setStatus(
        'Los datos de prueba aplican a Tareas y Flujos. En Global y Recursos define tu propio escenario.',
        'info'
      );
      return;
    }

    const filas = Array.from(this._body.querySelectorAll('tbody tr'));
    if (!filas.length) {
      this._setStatus('No hay filas que rellenar en esta pestaña.', 'info');
      return;
    }

    if (this._activeTab === 'tasks') {
      // Si hay piscinas dadas de alta, se asigna la primera a cada tarea con
      // cantidad 1. Es lo que hace que la simulacion EJERCITE el codigo de
      // recursos (cola, espera, costo de espera), que de otro modo nunca se
      // ejecuta porque nada escribia el campo `resources`.
      const pools = this._getPools();
      const primeraPool = pools.length ? pools[0].name : null;

      filas.forEach((tr) => {
        const poner = (campo, valor) => {
          const el = tr.querySelector(`[data-field="${campo}"]`);
          if (el) el.value = valor;
        };

        // La distribucion se fija a "fixed" para que el valor generado sea el
        // que se use: si quedara "triangular", el motor ignoraria el tiempo y
        // tomaria min/moda/max, y el usuario veria resultados que no cuadran con
        // lo que relleno el boton.
        poner('processingTime.distribution', 'fixed');
        poner('processingTime.value', this._azar(5, 45));
        poner('processingTime.unit', 'minutes');
        poner('failureRate', (0.01 + Math.random() * 0.29).toFixed(2));
        poner('reworkTime.value', this._azar(5, 30));
        poner('reworkTime.unit', 'minutes');

        const selPool = tr.querySelector('[data-field="resources.pool"]');
        if (selPool && primeraPool) {
          selPool.value = primeraPool;
          const cant = tr.querySelector('[data-field="resources.quantityRequired"]');
          if (cant) {
            cant.disabled = false;
            cant.value = 1;
          }
        }
      });

      const extra = primeraPool
        ? ` Asignadas a la piscina «${primeraPool}» (x1) para que se simule la espera por recursos.`
        : '';
      this._setStatus(
        `${filas.length} tarea(s) rellenadas con datos de prueba.${extra} Revisa y pulsa «Guardar todo».`,
        'ok'
      );
      return;
    }

    // Flujos: las probabilidades se reparten por COMPUERTA y suman 1. Generarlas
    // sueltas seria peor que no generarlas: el motor, si la suma no es 1, manda
    // toda la masa sobrante a la ULTIMA rama, asi que una salida configurada al
    // 30% terminaria recibiendo el 70%.
    const porCompuerta = new Map();
    filas.forEach((tr) => {
      const el = this._elementRegistry.get(tr.dataset.elId);
      if (!el || !el.source) return;
      const lista = porCompuerta.get(el.source.id) || [];
      lista.push(tr);
      porCompuerta.set(el.source.id, lista);
    });

    porCompuerta.forEach((lista) => {
      let resto = 1;
      lista.forEach((tr, i) => {
        const ultima = i === lista.length - 1;
        const p = ultima ? resto : Number((Math.random() * resto * 0.7).toFixed(2));
        resto = Number((resto - p).toFixed(2));
        const campo = tr.querySelector('[data-field="branchingProbability"]');
        if (campo) campo.value = p;
      });
    });

    this._setStatus(`${filas.length} flujo(s) rellenados; cada compuerta suma 1. Revisa y pulsa «Guardar todo».`, 'ok');
  }

  _azar(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Marca un evento de inicio como configuracion raiz, creando los valores por
   * defecto. Se escribe de inmediato porque el resto del panel depende de que
   * exista la raiz (es lo que leen getRootStartEvent() y el motor).
   */
  marcarRaiz(elId) {
    const el = this._elementRegistry.get(elId);
    if (!el) return;

    try {
      setSimulationData(el, DEFAULT_GLOBAL(), { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
    } catch (err) {
      const soloLectura = /read-only/i.test(String(err && err.message));
      const texto = soloLectura
        ? 'No se pudo crear la configuración raíz: el diagrama está en solo lectura porque el modo '
          + 'Token Simulation está activo.'
        : `No se pudo crear la configuración raíz: ${err.message || err}`;

      this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });

      if (soloLectura) this._ofrecerDesactivarModo(texto, () => this.marcarRaiz(elId));
      else this._setStatus(texto, 'error');
      return;
    }

    this._notifications.showNotification({
      text: `«${this._label(el)}» es ahora la configuración raíz. Ya puedes simular.`,
      type: 'info',
      duration: 4000
    });
    this._render();
  }

  save() {
    let writes;
    try {
      writes = this._collect();
    } catch (err) {
      this._setStatus(err.message, 'error');
      this._notifications.showNotification({ text: `No se guardó nada. ${err.message}`, type: 'error', duration: 6000 });
      return;
    }

    // Solo se escriben los elementos cuyo contenido cambia de verdad: asi no se
    // generan comandos de edicion innecesarios ni ruido en el historial.
    const changed = writes.filter(({ element, data }) => {
      const before = JSON.stringify(getSimulationData(element) || {});
      const after = JSON.stringify(data);
      return before !== after;
    });

    if (!changed.length) {
      this._setStatus('Sin cambios que guardar.', 'info');
      return;
    }

    // El modo Token Simulation deja el diagrama en SOLO LECTURA: su feature
    // DisableModeling intercepta los metodos de modeling y lanza
    // "model is read-only" (DisableModeling.js:51). Se captura aqui para
    // explicar la causa en lugar de dejar un error criptico. Como el guardado
    // es elemento a elemento, se informa tambien de cuantos quedaron escritos:
    // un fallo a mitad deja el diagrama a medias.
    let escritos = 0;
    try {
      changed.forEach(({ element, data }) => {
        setSimulationData(element, data, { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
        escritos++;
      });
    } catch (err) {
      const soloLectura = /read-only/i.test(String(err && err.message));

      if (soloLectura) {
        // NO se re-renderiza: los valores que el usuario acaba de escribir siguen
        // en la tabla, y el reintento los vuelve a recoger tal cual.
        const texto = 'El diagrama está en solo lectura porque el modo Token Simulation está activo.'
          + (escritos ? ` Se guardaron ${escritos} de ${changed.length} elementos antes de fallar.` : '')
          + ' Se puede desactivar y reintentar sin perder lo escrito.';
        this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });
        this._ofrecerDesactivarModo(texto, () => this.save());
        return;
      }

      const texto = `No se pudieron guardar los datos: ${err.message || err}`;
      this._setStatus(texto, 'error');
      this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });
      this._render();
      return;
    }

    this._setStatus(`${changed.length} elemento(s) actualizado(s).`, 'ok');
    this._notifications.showNotification({
      text: `Datos de simulación guardados en ${changed.length} elemento(s).`,
      type: 'info',
      duration: 3000
    });
    this._render();
  }

  // -- CSV ------------------------------------------------------------------

  _csvForActiveTab() {
    if (this._activeTab === 'tasks') {
      // Se exportan TAMBIEN las columnas de la triangular y las de recurso: antes
      // el CSV solo llevaba el tiempo fijo, asi que una tarea triangular salia
      // con `tiempo_proceso` vacio y sus min/moda/max se perdian de vista.
      const rows = [ [
        'id', 'nombre', 'distribucion',
        'tiempo_proceso', 'unidad_proceso', 'min', 'moda', 'max',
        'tasa_fallo', 'retrabajo', 'unidad_retrabajo',
        'recurso', 'cant_recurso'
      ] ];
      this._getTasks().forEach((el) => {
        const d = this._taskData(el);
        const tri = d.processingTime.distribution === 'triangular';
        rows.push([
          el.id,
          this._label(el),
          d.processingTime.distribution || 'fixed',
          tri ? '' : d.processingTime.value,
          d.processingTime.unit,
          tri ? d.processingTime.min : '',
          tri ? d.processingTime.mode : '',
          tri ? d.processingTime.max : '',
          d.failureRate,
          d.reworkTime.value,
          d.reworkTime.unit,
          (d.resources && d.resources.pool) || '',
          (d.resources && d.resources.quantityRequired) || ''
        ]);
      });
      return rows;
    }

    if (this._activeTab === 'resources') {
      const rows = [ [ 'nombre', 'cantidad' ] ];
      this._getPools().forEach((p) => rows.push([ p.name, p.quantity ]));
      return rows;
    }

    if (this._activeTab === 'flows') {
      const rows = [ [ 'id', 'compuerta', 'hacia', 'probabilidad' ] ];
      this._getFlows().forEach((el) => {
        const d = this._flowData(el);
        rows.push([ el.id, this._label(el.source), el.target ? this._label(el.target) : '', d.branchingProbability ]);
      });
      return rows;
    }

    const info = this._globalData();
    if (!info) throw new Error('No hay evento raíz configurado');

    const rows = [ [ 'campo', 'etiqueta', 'valor' ] ];
    GLOBAL_FIELDS.forEach((f) => {
      const v = getByPath(info.data, f.path);
      let text;
      if (f.kind === 'days') text = Array.isArray(v) ? v.join(',') : '';
      else if (f.kind === 'time') text = v && typeof v === 'object' ? `${pad(v.hour)}:${pad(v.minute)}` : '';
      else text = v == null ? '' : v;
      rows.push([ f.key, f.label, text ]);
    });
    return rows;
  }

  exportCsv() {
    try {
      const rows = this._csvForActiveTab();
      const name = { tasks: 'tareas', flows: 'flujos', resources: 'recursos', global: 'global' }[this._activeTab];
      download(`simulacion-${name}.csv`, toCsv(rows));
      this._setStatus(`CSV exportado (${rows.length - 1} fila(s)).`, 'ok');
    } catch (err) {
      this._setStatus(err.message, 'error');
    }
  }

  /**
   * Aplica un CSV a la pestaña activa. Valida TODO antes de escribir: si hay un
   * solo error no se modifica el diagrama.
   */
  _applyCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('El archivo está vacío');

    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const body = rows.slice(1);
    const idx = (name) => {
      const i = header.indexOf(name);
      if (i === -1) throw new Error(`Falta la columna «${name}» en el CSV`);
      return i;
    };

    const updates = [];

    if (this._activeTab === 'tasks') {
      const iId = idx('id');
      const iU = idx('unidad_proceso');
      const iF = idx('tasa_fallo');
      const iR = idx('retrabajo');
      const iRU = idx('unidad_retrabajo');

      // Columnas OPCIONALES: un CSV exportado por una version anterior (sin
      // distribucion, sin triangular y sin recurso) sigue importandose, y en ese
      // caso se conserva lo que tuviera el elemento en vez de destruirlo.
      const iDist = header.indexOf('distribucion');
      const iT = header.indexOf('tiempo_proceso');
      const iMin = header.indexOf('min');
      const iModa = header.indexOf('moda');
      const iMax = header.indexOf('max');
      const iRec = header.indexOf('recurso');
      const iCant = header.indexOf('cant_recurso');

      body.forEach((r, n) => {
        const line = n + 2;
        const el = this._elementRegistry.get(String(r[iId]).trim());
        if (!el) throw new Error(`Línea ${line}: no existe el elemento «${r[iId]}»`);

        const unit = String(r[iU]).trim();
        const unitR = String(r[iRU]).trim();
        if (!TASK_UNITS.includes(unit)) throw new Error(`Línea ${line}: unidad «${unit}» inválida (usa ${TASK_UNITS.join('/')}, en plural)`);
        if (!TASK_UNITS.includes(unitR)) throw new Error(`Línea ${line}: unidad «${unitR}» inválida (usa ${TASK_UNITS.join('/')}, en plural)`);

        const failure = this._num(r[iF], `Línea ${line}: tasa de fallo`);
        if (failure < 0 || failure > 1) throw new Error(`Línea ${line}: la tasa de fallo debe estar entre 0 y 1`);

        const cur = this._taskData(el);

        const dist = (iDist !== -1 && String(r[iDist]).trim())
          ? String(r[iDist]).trim()
          : (cur.processingTime.distribution || 'fixed');
        if (dist !== 'fixed' && dist !== 'triangular') {
          throw new Error(`Línea ${line}: distribución «${dist}» inválida (usa fixed o triangular)`);
        }

        let processingTime;
        if (dist === 'triangular') {
          const min = this._num(r[iMin], `Línea ${line}: mínimo`);
          const mode = this._num(r[iModa], `Línea ${line}: moda`);
          const max = this._num(r[iMax], `Línea ${line}: máximo`);
          if (!(min <= mode && mode <= max)) {
            throw new Error(`Línea ${line}: en la triangular debe cumplirse mínimo ≤ moda ≤ máximo`);
          }
          processingTime = { distribution: 'triangular', min, mode, max, unit };
        } else {
          const value = iT !== -1
            ? this._num(r[iT], `Línea ${line}: tiempo de proceso`)
            : (cur.processingTime.value || 0);
          processingTime = { distribution: 'fixed', value, unit };
        }

        const data = {
          ...cur,
          processingTime,
          reworkTime: { ...cur.reworkTime, value: this._num(r[iR], `Línea ${line}: retrabajo`), unit: unitR },
          failureRate: failure
        };

        const recurso = iRec !== -1 ? String(r[iRec]).trim() : ((cur.resources && cur.resources.pool) || '');
        if (recurso) {
          const cantRaw = iCant !== -1 ? String(r[iCant]).trim() : '';
          const cantidad = cantRaw === '' ? 1 : this._num(cantRaw, `Línea ${line}: cantidad de recurso`);
          if (!(cantidad >= 1)) throw new Error(`Línea ${line}: la cantidad de recurso debe ser ≥ 1`);
          if (!this._getPools().some((p) => p.name === recurso)) {
            throw new Error(`Línea ${line}: la piscina «${recurso}» no está dada de alta (créala en la pestaña Recursos)`);
          }
          data.resources = { pool: recurso, quantityRequired: cantidad };
        } else {
          delete data.resources;
        }

        updates.push({ element: el, data });
      });
      return updates;
    }

    if (this._activeTab === 'resources') {
      const root = this._getProcessRoot();
      if (!root) throw new Error('El diagrama no tiene ningún proceso donde guardar los recursos');

      const iN = idx('nombre');
      const iC = idx('cantidad');

      const pools = [];
      const vistos = new Set();

      body.forEach((r, n) => {
        const line = n + 2;
        const nombre = String(r[iN]).trim();
        if (!nombre) throw new Error(`Línea ${line}: falta el nombre de la piscina`);
        if (vistos.has(nombre)) throw new Error(`Línea ${line}: la piscina «${nombre}» está repetida`);
        vistos.add(nombre);

        const cantidad = this._num(r[iC], `Línea ${line}: cantidad`);
        if (!Number.isInteger(cantidad) || cantidad < 1) {
          throw new Error(`Línea ${line}: la cantidad debe ser un entero mayor o igual que 1`);
        }
        pools.push({ name: nombre, quantity: cantidad });
      });

      updates.push({ element: root, data: { ...(getSimulationData(root) || {}), resourcePools: pools } });
      return updates;
    }

    if (this._activeTab === 'flows') {
      const iId = idx('id');
      const iP = idx('probabilidad');
      body.forEach((r, n) => {
        const line = n + 2;
        const el = this._elementRegistry.get(String(r[iId]).trim());
        if (!el) throw new Error(`Línea ${line}: no existe el elemento «${r[iId]}»`);
        const p = this._num(r[iP], `Línea ${line}: probabilidad`);
        if (p < 0 || p > 1) throw new Error(`Línea ${line}: la probabilidad debe estar entre 0 y 1`);
        updates.push({ element: el, data: { ...this._flowData(el), branchingProbability: p } });
      });
      return updates;
    }

    const info = this._globalData();
    if (!info) throw new Error('No hay evento raíz configurado');

    const iKey = idx('campo');
    const iVal = header.indexOf('valor') !== -1 ? header.indexOf('valor') : null;
    if (iVal === null) throw new Error('Falta la columna «valor» en el CSV');

    const data = JSON.parse(JSON.stringify(info.data));

    body.forEach((r, n) => {
      const line = n + 2;
      const field = GLOBAL_FIELDS.find((f) => f.key === String(r[iKey]).trim());
      if (!field) throw new Error(`Línea ${line}: campo desconocido «${r[iKey]}»`);
      const raw = r[iVal];

      if (field.kind === 'number') {
        const num = this._num(raw, `Línea ${line}: ${field.label}`);
        if (field.min != null && num < field.min) throw new Error(`Línea ${line}: ${field.label} debe ser ≥ ${field.min}`);
        setByPath(data, field.path, num);
      } else if (field.kind === 'select') {
        const v = String(raw).trim();
        if (!field.options.includes(v)) throw new Error(`Línea ${line}: valor «${v}» inválido (usa ${field.options.join('/')})`);
        setByPath(data, field.path, v);
      } else if (field.kind === 'days') {
        const days = String(raw).split(',').map((s) => s.trim()).filter((s) => s !== '').map((s) => {
          const num = Number(s);
          if (!Number.isInteger(num) || num < 0 || num > 6) throw new Error(`Línea ${line}: día «${s}» inválido (0-6)`);
          return num;
        });
        setByPath(data, field.path, days);
      } else if (field.kind === 'time') {
        const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) throw new Error(`Línea ${line}: ${field.label} debe ser HH:MM («${raw}»)`);
        setByPath(data, field.path, { hour: Number(m[1]), minute: Number(m[2]) });
      } else {
        setByPath(data, field.path, String(raw));
      }
    });

    updates.push({ element: info.element, data });
    return updates;
  }

  importCsv(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      let updates;
      try {
        updates = this._applyCsv(text);
      } catch (err) {
        this._setStatus(err.message, 'error');
        this._notifications.showNotification({ text: `Importación cancelada. ${err.message}`, type: 'error', duration: 8000 });
        return;
      }

      const changed = updates.filter(({ element, data }) => JSON.stringify(getSimulationData(element) || {}) !== JSON.stringify(data));

      // Mismo tratamiento que en save(): la importacion tambien escribe en el
      // diagrama y tambien choca con el modo de solo lectura. Aqui si se
      // re-renderiza tras desactivar, porque el CSV es la fuente de verdad.
      try {
        changed.forEach(({ element, data }) => {
          setSimulationData(element, data, { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
        });
      } catch (err) {
        const soloLectura = /read-only/i.test(String(err && err.message));
        const texto = soloLectura
          ? 'No se pudo importar: el diagrama está en solo lectura porque el modo Token Simulation está activo.'
          : `No se pudo importar el CSV: ${err.message || err}`;

        this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });

        if (soloLectura) this._ofrecerDesactivarModo(texto, () => this.importCsv(event));
        else this._setStatus(texto, 'error');
        return;
      }

      this._setStatus(`Importado: ${changed.length} de ${updates.length} fila(s) con cambios.`, 'ok');
      this._notifications.showNotification({
        text: `CSV importado: ${changed.length} elemento(s) actualizado(s).`,
        type: 'info',
        duration: 4000
      });
      this._render();
    };
    reader.readAsText(file, 'utf-8');
  }
}

DataTablePanel.$inject = [
  'canvas',
  'eventBus',
  'elementRegistry',
  'modeling',
  'bpmnFactory',
  'notifications',
  'editorActions',
  'overlays',
  'selection'
];
