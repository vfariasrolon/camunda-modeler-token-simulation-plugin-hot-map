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

    if (this._activeTab === 'tasks') return this._renderTasks();
    if (this._activeTab === 'flows') return this._renderFlows();
    return this._renderGlobal();
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
            <th>Tiempo de proceso</th>
            <th>Unidad</th>
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
            return `
              <tr data-el-id="${el.id}">
                <td class="col-name" title="${esc(this._label(el))}">${esc(this._label(el))}</td>
                <td><input type="number" step="any" min="0" class="cell" data-field="processingTime.value" value="${d.processingTime.value}"></td>
                <td><select class="cell" data-field="processingTime.unit">${units(d.processingTime.unit)}</select></td>
                <td><input type="number" step="0.01" min="0" max="1" class="cell" data-field="failureRate" value="${d.failureRate}"></td>
                <td><input type="number" step="any" min="0" class="cell" data-field="reworkTime.value" value="${d.reworkTime.value}"></td>
                <td><select class="cell" data-field="reworkTime.unit">${units(d.reworkTime.unit)}</select></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="hint">Unidades de tarea en <strong>plural</strong> (<code>minutes</code>/<code>hours</code>/<code>seconds</code>). El motor no reconoce otra forma y la interpretaría como milisegundos.</p>
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
      this._body.innerHTML = `
        <p class="empty">
          No hay ningún evento de inicio marcado como <strong>«Usar como Configuración Raíz»</strong>.<br>
          Marca uno en el editor de datos antes de usar esta pestaña: sin evento raíz la simulación no se ejecuta.
        </p>`;
      return;
    }

    const { element, data } = info;

    const cell = (field) => {
      const value = getByPath(data, field.path);

      if (field.kind === 'select') {
        return `<select class="cell" data-field="${field.key}">${field.options
          .map((o) => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      }
      if (field.kind === 'days') {
        const text = Array.isArray(value) ? value.join(',') : '';
        return `<input type="text" class="cell" data-field="${field.key}" value="${esc(text)}" placeholder="1,2,3,4,5">`;
      }
      if (field.kind === 'time') {
        const text = value && typeof value === 'object' ? `${pad(value.hour)}:${pad(value.minute)}` : '';
        return `<input type="text" class="cell" data-field="${field.key}" value="${esc(text)}" placeholder="09:00">`;
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
      <p class="hint">«Días laborables»: números separados por comas, 0 = domingo. Horas en formato <code>HH:MM</code>.</p>
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
        const val = (f) => tr.querySelector(`[data-field="${f}"]`).value;
        const name = this._label(el);

        const processing = this._num(val('processingTime.value'), `${name} · tiempo de proceso`, tr);
        const rework = this._num(val('reworkTime.value'), `${name} · retrabajo`, tr);
        const failure = this._num(val('failureRate'), `${name} · tasa de fallo`, tr);

        if (processing < 0 || rework < 0) throw new Error(`${name}: los tiempos no pueden ser negativos`);
        if (failure < 0 || failure > 1) throw new Error(`${name}: la tasa de fallo debe estar entre 0 y 1`);

        const current = this._taskData(el);
        writes.push({
          element: el,
          data: {
            ...current,
            processingTime: { ...current.processingTime, value: processing, unit: val('processingTime.unit') },
            reworkTime: { ...current.reworkTime, value: rework, unit: val('reworkTime.unit') },
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
    this._body.querySelectorAll('tbody tr').forEach((tr) => {
      tr.querySelectorAll('[data-field]').forEach((input) => {
        const field = GLOBAL_FIELDS.find((f) => f.key === input.dataset.field);
        if (!field) return;
        const raw = input.value;

        if (field.kind === 'number') {
          const n = this._num(raw, field.label, tr);
          if (field.min != null && n < field.min) throw new Error(`${field.label}: debe ser ≥ ${field.min}`);
          setByPath(data, field.path, n);
        } else if (field.kind === 'days') {
          const days = String(raw).split(',').map((s) => s.trim()).filter((s) => s !== '')
            .map((s) => {
              const n = Number(s);
              if (!Number.isInteger(n) || n < 0 || n > 6) throw new Error(`Días laborables: «${s}» no es un día válido (0-6)`);
              return n;
            });
          setByPath(data, field.path, days);
        } else if (field.kind === 'time') {
          const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
          if (!m) throw new Error(`${field.label}: usa el formato HH:MM («${raw}»)`);
          const hour = Number(m[1]);
          const minute = Number(m[2]);
          if (hour > 23 || minute > 59) throw new Error(`${field.label}: hora fuera de rango («${raw}»)`);
          setByPath(data, field.path, { hour, minute });
        } else {
          setByPath(data, field.path, raw);
        }
      });
    });

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

    changed.forEach(({ element, data }) => {
      setSimulationData(element, data, { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
    });

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
