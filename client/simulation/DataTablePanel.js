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
  { key: 'arrivalRate.value', label: 'Tasa de llegada (valor)', kind: 'number', path: [ 'arrivalRate', 'value' ], min: 0 },
  { key: 'arrivalRate.unit', label: 'Tasa de llegada (unidad)', kind: 'select', options: RATE_UNITS, path: [ 'arrivalRate', 'unit' ] },
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
  arrivalRate: { value: 60, unit: 'minute' },
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

const svg = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;

export default class DataTablePanel {

  constructor(canvas, eventBus, elementRegistry, modeling, bpmnFactory, notifications) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._notifications = notifications;

    this._panel = null;
    this._activeTab = 'tasks';

    this._eventBus.on('canvas.init', () => this._init());
    this._eventBus.on('diagram.destroy', () => this.destroy());
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
  close() {
    if (this._panel) domClasses(this._panel).remove(OPEN_CLS);
  }
  destroy() {
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

    if (this._activeTab === 'tasks') this._renderTasks();
    else if (this._activeTab === 'flows') this._renderFlows();
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
    `;
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
          Se crearán los valores por defecto: 1000 instancias, llegada cada 60 min,
          jornada 09:00-17:00 de lunes a viernes, y 50 por hora. Podrás ajustarlos aquí mismo.
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
      <p class="hint">Marca los días laborables y ajusta las horas con los selectores. La hora de entrada debe ser anterior a la de salida.</p>
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

        const current = this._taskData(el);
        writes.push({
          element: el,
          data: {
            ...current,
            processingTime,
            // Se conserva la distribucion del retrabajo que hubiera: la tabla
            // todavia no la edita, y forzarla a "fixed" destruiria un triangular
            // configurado. Mismo error que tenia el modal del lapiz.
            reworkTime: { ...current.reworkTime, value: reworkValue, unit: unitRetrabajo },
            failureRate: failure
          }
        });
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
   * Los rangos son los mismos que usaba RandomDataGenerator, que ya estaban
   * revisados: tiempo de proceso 5-45 min, fallo 1-30%, retrabajo 5-30 min.
   */
  generarDatosDePrueba() {
    if (this._activeTab === 'global') {
      this._setStatus('Los datos de prueba aplican a Tareas y Flujos. En Global define tu propio escenario.', 'info');
      return;
    }

    const filas = Array.from(this._body.querySelectorAll('tbody tr'));
    if (!filas.length) {
      this._setStatus('No hay filas que rellenar en esta pestaña.', 'info');
      return;
    }

    if (this._activeTab === 'tasks') {
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
      });

      this._setStatus(`${filas.length} tarea(s) rellenadas con datos de prueba. Revisa y pulsa «Guardar todo».`, 'ok');
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
          + 'Token Simulation está activo. Desactívalo (menú «Toggle Token Simulation» o la tecla T).'
        : `No se pudo crear la configuración raíz: ${err.message || err}`;
      this._setStatus(texto, 'error');
      this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });
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

      const texto = soloLectura
        ? 'El diagrama está en solo lectura porque el modo Token Simulation está activo. '
          + 'Desactívalo (menú «Toggle Token Simulation» o la tecla T) y vuelve a guardar.'
          + (escritos ? ` Se guardaron ${escritos} de ${changed.length} elementos antes de fallar.` : '')
        : `No se pudieron guardar los datos: ${err.message || err}`;

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
      const rows = [ [ 'id', 'nombre', 'tiempo_proceso', 'unidad_proceso', 'tasa_fallo', 'retrabajo', 'unidad_retrabajo' ] ];
      this._getTasks().forEach((el) => {
        const d = this._taskData(el);
        rows.push([ el.id, this._label(el), d.processingTime.value, d.processingTime.unit, d.failureRate, d.reworkTime.value, d.reworkTime.unit ]);
      });
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
      const name = { tasks: 'tareas', flows: 'flujos', global: 'global' }[this._activeTab];
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
      const iT = idx('tiempo_proceso');
      const iU = idx('unidad_proceso');
      const iF = idx('tasa_fallo');
      const iR = idx('retrabajo');
      const iRU = idx('unidad_retrabajo');

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
        updates.push({
          element: el,
          data: {
            ...cur,
            processingTime: { ...cur.processingTime, value: this._num(r[iT], `Línea ${line}: tiempo de proceso`), unit },
            reworkTime: { ...cur.reworkTime, value: this._num(r[iR], `Línea ${line}: retrabajo`), unit: unitR },
            failureRate: failure
          }
        });
      });
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
      changed.forEach(({ element, data }) => {
        setSimulationData(element, data, { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
      });

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
  'notifications'
];
