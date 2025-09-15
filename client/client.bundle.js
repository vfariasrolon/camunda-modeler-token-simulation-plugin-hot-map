/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./client/HideModelerElements.js":
/*!***************************************!*\
  !*** ./client/HideModelerElements.js ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ HideModelerElements)
/* harmony export */ });
/* harmony import */ var min_dom__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! min-dom */ "./node_modules/min-dom/dist/index.esm.js");
/* harmony import */ var bpmn_js_token_simulation_lib_util_EventHelper__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! bpmn-js-token-simulation/lib/util/EventHelper */ "./node_modules/bpmn-js-token-simulation/lib/util/EventHelper.js");





function HideModelerElements(eventBus, toggleMode) {
  var css = '.properties.hidden { display: none; } .tabs .tab.hidden { display: none; }',
      head = document.head,
      style = document.createElement('style');

  style.type = 'text/css';

  style.appendChild(document.createTextNode(css));

  head.appendChild(style);

  eventBus.on('saveXML.start', 5000, function() {
    // disable simulation before saving
    if (toggleMode.active) {
      toggleMode.toggleMode();
    }
  });

  eventBus.on(bpmn_js_token_simulation_lib_util_EventHelper__WEBPACK_IMPORTED_MODULE_0__.TOGGLE_MODE_EVENT, function(context) {
    var active = context.active;

    var propertiesPanel = (0,min_dom__WEBPACK_IMPORTED_MODULE_1__.query)('.properties');

    if (active) {
      (0,min_dom__WEBPACK_IMPORTED_MODULE_1__.classes)(propertiesPanel).add('hidden');
    } else {
      (0,min_dom__WEBPACK_IMPORTED_MODULE_1__.classes)(propertiesPanel).remove('hidden');
    }
  });
}

HideModelerElements.$inject = [
  'eventBus',
  'toggleMode'
];

/***/ }),

/***/ "./client/TimeTracker.js":
/*!*******************************!*\
  !*** ./client/TimeTracker.js ***!
  \*******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ TimeTracker)
/* harmony export */ });
/* harmony import */ var bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! bpmn-js/lib/util/ModelUtil */ "./node_modules/bpmn-js/lib/util/ModelUtil.js");
/* harmony import */ var bpmn_js_token_simulation_lib_util_EventHelper__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! bpmn-js-token-simulation/lib/util/EventHelper */ "./node_modules/bpmn-js-token-simulation/lib/util/EventHelper.js");



const LOW_PRIORITY = 500;

function TimeTracker(eventBus) {
  this._eventBus = eventBus;

  this.taskStartTimes = new Map();
  this.recordedTimes = {};

  // Listen for trace events to capture task entry and exit
  eventBus.on(bpmn_js_token_simulation_lib_util_EventHelper__WEBPACK_IMPORTED_MODULE_0__.TRACE_EVENT, LOW_PRIORITY, event => {
    const {
      element,
      scope,
      action
    } = event;

    if (!(0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.isAny)(element, ['bpmn:Task', 'bpmn:CallActivity'])) {
      return;
    }

    const taskKey = `${element.id}-${scope.id}`;

    if (action === 'enter') {
      this.taskStartTimes.set(taskKey, new Date().getTime());
    } else if (action === 'exit') {
      const startTime = this.taskStartTimes.get(taskKey);

      if (startTime) {
        const endTime = new Date().getTime();
        const duration = endTime - startTime;

        // Accumulate time for the element ID
        this.recordedTimes[element.id] = (this.recordedTimes[element.id] || 0) + duration;

        console.log(`[TimeTracker] Task ${element.id} finished. Duration: ${duration}ms. Total for element: ${this.recordedTimes[element.id]}ms`);

        this.taskStartTimes.delete(taskKey);
      }
    }
  });

  // Clear data on simulation reset
  eventBus.on(bpmn_js_token_simulation_lib_util_EventHelper__WEBPACK_IMPORTED_MODULE_0__.RESET_SIMULATION_EVENT, () => {
    this.taskStartTimes.clear();
    this.recordedTimes = {};
    this._eventBus.fire('heatmap.data.clear');
    console.log('[TimeTracker] Cleared time tracking data.');
  });
}

TimeTracker.prototype.getRecordedTimes = function() {
  return this.recordedTimes;
};

TimeTracker.$inject = [
  'eventBus'
];


/***/ }),

/***/ "./client/client.js":
/*!**************************!*\
  !*** ./client/client.js ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony import */ var camunda_modeler_plugin_helpers__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! camunda-modeler-plugin-helpers */ "./node_modules/camunda-modeler-plugin-helpers/index.js");
/* harmony import */ var _simulation_simulation_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./simulation/simulation.css */ "./client/simulation/simulation.css");
/* harmony import */ var bpmn_js_token_simulation__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! bpmn-js-token-simulation */ "./node_modules/bpmn-js-token-simulation/lib/modeler.js");
/* harmony import */ var _HideModelerElements__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./HideModelerElements */ "./client/HideModelerElements.js");
/* harmony import */ var _TimeTracker__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./TimeTracker */ "./client/TimeTracker.js");
/* harmony import */ var _simulation__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./simulation */ "./client/simulation/index.js");
/* harmony import */ var _editor__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./editor */ "./client/editor/index.js");


// new css import









const TokenSimulationPluginModule = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', _HideModelerElements__WEBPACK_IMPORTED_MODULE_2__["default"] ]
};

const TimeTrackerPluginModule = {
  __init__: [ 'timeTracker' ],
  timeTracker: [ 'type', _TimeTracker__WEBPACK_IMPORTED_MODULE_3__["default"] ]
};

// Register the BpmnJS modules
(0,camunda_modeler_plugin_helpers__WEBPACK_IMPORTED_MODULE_0__.registerBpmnJSPlugin)(bpmn_js_token_simulation__WEBPACK_IMPORTED_MODULE_6__["default"]);
(0,camunda_modeler_plugin_helpers__WEBPACK_IMPORTED_MODULE_0__.registerBpmnJSPlugin)(TimeTrackerPluginModule);
(0,camunda_modeler_plugin_helpers__WEBPACK_IMPORTED_MODULE_0__.registerBpmnJSPlugin)(_simulation__WEBPACK_IMPORTED_MODULE_4__["default"]);
(0,camunda_modeler_plugin_helpers__WEBPACK_IMPORTED_MODULE_0__.registerBpmnJSPlugin)(_editor__WEBPACK_IMPORTED_MODULE_5__["default"]);


/***/ }),

/***/ "./client/editor/DataEditor.js":
/*!*************************************!*\
  !*** ./client/editor/DataEditor.js ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ DataEditor)
/* harmony export */ });
/* harmony import */ var min_dom__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! min-dom */ "./node_modules/min-dom/dist/index.esm.js");
/* harmony import */ var _simulation_util__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../simulation/util */ "./client/simulation/util.js");
/* harmony import */ var bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! bpmn-js/lib/util/ModelUtil */ "./node_modules/bpmn-js/lib/util/ModelUtil.js");
/* harmony import */ var _data_editor_css__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./data-editor.css */ "./client/editor/data-editor.css");





const EditIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="currentColor" d="M19.4,6.6l-3.9-3.9c-0.4-0.4-1-0.4-1.4,0l-11,11c-0.2,0.2-0.3,0.4-0.3,0.7v3.9c0,0.6,0.4,1,1,1h3.9c0.3,0,0.5-0.1,0.7-0.3l11-11C19.8,7.6,19.8,7,19.4,6.6z M7.5,17.5H5.1v-2.4l7.5-7.5l2.4,2.4L7.5,17.5z"/>
</svg>`;

class DataEditor {
  constructor(eventBus, modeling, bpmnFactory, elementRegistry, notifications, selection, canvas, overlays) {
    this._eventBus = eventBus;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._elementRegistry = elementRegistry;
    this._notifications = notifications;
    this._selection = selection;
    this._canvas = canvas;
    this._overlays = overlays;

    this._modal = null;
    this._selectedElement = null;
    this._currentOverlayId = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    // this.createModal();  <-- ¡QUITA ESTO DE AQUÍ!

    this._eventBus.on('selection.changed', ({ newSelection }) => {
      this.removeOverlay();
      this.closeModal();

      if (newSelection.length === 1) {
        this.addOverlay(newSelection[0]);
      }
    });
  }

  createModal() {
    this._modal = (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)(`
      <div class="sim-data-editor-modal hidden">
        <div class="sim-data-editor-content">
          <div class="sim-data-editor-header">
            <span id="data-editor-title">Editar Propiedades de Simulación</span>
            <button class="close">×</button>
          </div>
          <div class="sim-data-editor-body"></div>
          <div class="sim-data-editor-footer">
            <button class="save">Guardar y Cerrar</button>
          </div>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._modal);

    const closeButton = this._modal.querySelector('button.close');
    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(closeButton, 'click', () => this.closeModal());

    const saveButton = this._modal.querySelector('button.save');
    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(saveButton, 'click', () => this.save());

    // Close modal on background click
    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(this._modal, 'click', (e) => {
      if (e.target === this._modal) {
        this.closeModal();
      }
    });
  }

  openModal(element) {
    // ¡Crea el modal solo la primera vez que se abre!
    if (!this._modal) {
      this.createModal();
    }

    this._selectedElement = element;
    this.updateModalContent();
    this._modal.classList.remove('hidden');
  }

  closeModal() {
    this._modal.classList.add('hidden');
    this._selectedElement = null;
  }

  addOverlay(element) {
    const overlayHtml = (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)(`<div class="sim-data-editor-overlay">${EditIcon}</div>`);

    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(overlayHtml, 'click', () => {
      this.openModal(element);
    });

    this._currentOverlayId = this._overlays.add(element, 'sim-data-editor', {
      position: {
        top: -12,
        left: -12
      },
      html: overlayHtml
    });
  }

  removeOverlay() {
    if (this._currentOverlayId) {
      this._overlays.remove(this._currentOverlayId);
      this._currentOverlayId = null;
    }
  }

  updateModalContent() {
    const body = this._modal.querySelector('.sim-data-editor-body');
    const title = this._modal.querySelector('#data-editor-title');
    const footer = this._modal.querySelector('.sim-data-editor-footer');
    body.innerHTML = '';

    const rawData = (0,_simulation_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(this._selectedElement) || {};
    title.textContent = `Propiedades de: ${this._selectedElement.businessObject.name || this._selectedElement.id}`;
    footer.classList.remove('hidden');

    if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:Task')) {
      const data = this._getTaskDefaults(rawData);
      this.renderTaskForm(body, data);
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:SequenceFlow') && this._selectedElement.source.type === 'bpmn:ExclusiveGateway') {
      const data = this._getSequenceFlowDefaults(rawData);
      this.renderSequenceFlowForm(body, data);
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:StartEvent')) {
      const data = this._getStartEventDefaults(rawData);
      this.renderStartEventForm(body, data);
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:Process') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:Participant')) {
      const data = this._getProcessDefaults(rawData);
      this.renderProcessForm(body, data);
    } else {
      body.innerHTML = '<p>Propiedades de simulación no aplicables para este tipo de elemento.</p>';
      footer.classList.add('hidden');
    }
  }

  _getTaskDefaults(data = {}) {
    const defaults = {
      processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' },
      cost: { value: 10, currency: 'USD' },
      resources: { pool: '', quantityRequired: 1 },
      failureRate: 0.0,
      reworkTime: { distribution: 'fixed', value: 20, unit: 'minutes' }
    };
    return {
      ...defaults,
      ...data,
      processingTime: { ...defaults.processingTime, ...(data.processingTime || {}) },
      cost: { ...defaults.cost, ...(data.cost || {}) },
      resources: { ...defaults.resources, ...(data.resources || {}) },
      reworkTime: { ...defaults.reworkTime, ...(data.reworkTime || {}) },
    };
  }

  _getSequenceFlowDefaults(data = {}) {
    const defaults = { branchingProbability: 0.5 };
    return { ...defaults, ...data };
  }

  _getStartEventDefaults(data = {}) {
    const defaults = { arrivalRate: { value: 60, unit: 'minute' } };
    return {
      ...defaults,
      ...data,
      arrivalRate: { ...defaults.arrivalRate, ...(data.arrivalRate || {}) }
    };
  }

  _getProcessDefaults(data = {}) {
    const defaults = {
      simulationConfig: { runValue: 1000 },
      resourcePools: []
    };
    return {
      ...defaults,
      ...data,
      simulationConfig: { ...defaults.simulationConfig, ...(data.simulationConfig || {}) }
    };
  }

  renderTaskForm(container, data) {
    const { processingTime, cost, resources, failureRate, reworkTime } = data;
    container.innerHTML = `
      <div class="form-group">
        <label>Tiempo de Proceso (processingTime)</label>
        <input type="number" name="processingTime.value" value="${processingTime.value}">
        <select name="processingTime.unit">
          <option value="minutes" ${processingTime.unit === 'minutes' ? 'selected' : ''}>Minutos</option>
          <option value="hours" ${processingTime.unit === 'hours' ? 'selected' : ''}>Horas</option>
          <option value="seconds" ${processingTime.unit === 'seconds' ? 'selected' : ''}>Segundos</option>
        </select>
      </div>
      <div class="form-group">
        <label>Costo (cost)</label>
        <input type="number" name="cost.value" value="${cost.value}">
        <input type="text" name="cost.currency" value="${cost.currency}" placeholder="Moneda">
      </div>
      <div class="form-group">
        <label>Recursos (resources)</label>
        <input type="text" name="resources.pool" value="${resources.pool}" placeholder="Pool de Recursos">
        <input type="number" name="resources.quantityRequired" value="${resources.quantityRequired}" min="1">
      </div>
      <div class="form-group">
        <label>Tasa de Fallo (failureRate)</label>
        <input type="number" name="failureRate" value="${failureRate}" min="0" max="1" step="0.01">
      </div>
      <div class="form-group">
        <label>Tiempo de Retrabajo (reworkTime)</label>
        <input type="number" name="reworkTime.value" value="${reworkTime.value}">
        <select name="reworkTime.unit">
          <option value="minutes" ${reworkTime.unit === 'minutes' ? 'selected' : ''}>Minutos</option>
          <option value="hours" ${reworkTime.unit === 'hours' ? 'selected' : ''}>Horas</option>
          <option value="seconds" ${reworkTime.unit === 'seconds' ? 'selected' : ''}>Segundos</option>
        </select>
      </div>
    `;
  }

  renderSequenceFlowForm(container, data) {
    const { branchingProbability } = data;
    container.innerHTML = `
      <div class="form-group">
        <label>Probabilidad de Ramificación (branchingProbability)</label>
        <input type="number" name="branchingProbability" value="${branchingProbability}" min="0" max="1" step="0.01">
      </div>
    `;
  }

  renderStartEventForm(container, data) {
    const { arrivalRate } = data;
    container.innerHTML = `
      <div class="form-group">
        <label>Tasa de Llegada (arrivalRate)</label>
        <input type="number" name="arrivalRate.value" value="${arrivalRate.value}">
        <select name="arrivalRate.unit">
          <option value="minute" ${arrivalRate.unit === 'minute' ? 'selected' : ''}>por Minuto</option>
          <option value="hour" ${arrivalRate.unit === 'hour' ? 'selected' : ''}>por Hora</option>
        </select>
      </div>
    `;
  }

  renderProcessForm(container, data) {
    const { simulationConfig, resourcePools } = data;
    const poolsHtml = resourcePools.map((pool, index) => `
      <div class="resource-pool-row">
        <input type="text" name="resourcePools[${index}].name" value="${pool.name}" placeholder="Nombre del Pool">
        <input type="number" name="resourcePools[${index}].quantity" value="${pool.quantity}" placeholder="Cantidad">
        <button class="remove-pool" data-index="${index}">-</button>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="form-group">
        <label>Instancias a Simular (runValue)</label>
        <input type="number" name="simulationConfig.runValue" value="${simulationConfig.runValue}">
      </div>
      <div class="form-group">
        <label>Piscinas de Recursos (resourcePools)</label>
        <div id="resource-pools-container">${poolsHtml}</div>
        <button id="add-pool" class="add-button">+</button>
      </div>
    `;

    const poolsContainer = container.querySelector('#resource-pools-container');

    const addPoolButton = container.querySelector('#add-pool');
    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(addPoolButton, 'click', (e) => {
      e.preventDefault();
      const newIndex = poolsContainer.children.length;
      const newPoolRow = (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)(`
        <div class="resource-pool-row">
          <input type="text" name="resourcePools[${newIndex}].name" placeholder="Nombre del Pool">
          <input type="number" name="resourcePools[${newIndex}].quantity" placeholder="Cantidad">
          <button class="remove-pool" data-index="${newIndex}">-</button>
        </div>
      `);
      poolsContainer.appendChild(newPoolRow);
      this.bindRemoveButtons(poolsContainer);
    });

    this.bindRemoveButtons(poolsContainer);
  }

  bindRemoveButtons(container) {
      const removeButtons = container.querySelectorAll('.remove-pool');
      removeButtons.forEach(button => {
          min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(button, 'click', (e) => {
              e.preventDefault();
              e.target.closest('.resource-pool-row').remove();
          });
      });
  }

  save() {
    if (!this._selectedElement) return;

    const body = this._modal.querySelector('.sim-data-editor-body');
    const existingData = (0,_simulation_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(this._selectedElement) || {};
    let newData = {};

    if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:Task')) {
      newData = {
        processingTime: {
          value: parseFloat(body.querySelector('[name="processingTime.value"]').value),
          unit: body.querySelector('[name="processingTime.unit"]').value
        },
        cost: {
          value: parseFloat(body.querySelector('[name="cost.value"]').value),
          currency: body.querySelector('[name="cost.currency"]').value
        },
        resources: {
          pool: body.querySelector('[name="resources.pool"]').value,
          quantityRequired: parseInt(body.querySelector('[name="resources.quantityRequired"]').value, 10)
        },
        failureRate: parseFloat(body.querySelector('[name="failureRate"]').value),
        reworkTime: {
          value: parseFloat(body.querySelector('[name="reworkTime.value"]').value),
          unit: body.querySelector('[name="reworkTime.unit"]').value
        }
      };
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:SequenceFlow')) {
      newData = {
        branchingProbability: parseFloat(body.querySelector('[name="branchingProbability"]').value)
      };
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:StartEvent')) {
      newData = {
        arrivalRate: {
          value: parseFloat(body.querySelector('[name="arrivalRate.value"]').value),
          unit: body.querySelector('[name="arrivalRate.unit"]').value
        }
      };
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:Process') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(this._selectedElement, 'bpmn:Participant')) {
      const resourcePools = [];
      const poolRows = body.querySelectorAll('.resource-pool-row');
      poolRows.forEach(row => {
        const name = row.querySelector('input[name*="name"]').value;
        const quantity = parseInt(row.querySelector('input[name*="quantity"]').value, 10);
        if (name && quantity) {
          resourcePools.push({ name, quantity });
        }
      });
      newData = {
        simulationConfig: {
          runValue: parseInt(body.querySelector('[name="simulationConfig.runValue"]').value, 10)
        },
        resourcePools
      };
    } else {
      return;
    }

    const finalData = { ...existingData, ...newData };
    const simulationDataString = JSON.stringify(finalData, null, 2);

    const businessObject = this._selectedElement.businessObject;
    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) {
      extensionElements = this._bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    }

    let properties = extensionElements.get('values').find(v => v.$type === 'camunda:Properties');
    if (!properties) {
      properties = this._bpmnFactory.create('camunda:Properties', { values: [] });
      extensionElements.get('values').push(properties);
    }

    let simProperty = properties.get('values').find(p => p.name === 'simulationData');
    if (!simProperty) {
      simProperty = this._bpmnFactory.create('camunda:Property', { name: 'simulationData' });
      properties.get('values').push(simProperty);
    }

    simProperty.value = simulationDataString;

    this._modeling.updateProperties(this._selectedElement, {
      extensionElements: extensionElements
    });

    this._notifications.showNotification({ text: 'Propiedades de simulación guardadas.', type: 'info', duration: 3000 });
    this.closeModal();
  }
}

DataEditor.$inject = [
  'eventBus',
  'modeling',
  'bpmnFactory',
  'elementRegistry',
  'notifications',
  'selection',
  'canvas',
  'overlays'
];


/***/ }),

/***/ "./client/editor/index.js":
/*!********************************!*\
  !*** ./client/editor/index.js ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _DataEditor__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./DataEditor */ "./client/editor/DataEditor.js");


/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  __init__: [ 'dataEditor' ],
  dataEditor: [ 'type', _DataEditor__WEBPACK_IMPORTED_MODULE_0__["default"] ]
});


/***/ }),

/***/ "./client/simpleheat-svg.js":
/*!**********************************!*\
  !*** ./client/simpleheat-svg.js ***!
  \**********************************/
/***/ ((module) => {



// Default gradient copied from the original example
const defaultGradient = {
  0.4: 'blue',
  0.6: 'cyan',
  0.7: 'lime',
  0.8: 'yellow',
  1.0: 'red'
};

/**
 * A customized version of simpleheatSVG, adapted to work with bpmn-js.
 * Instead of an SVG element ID, it takes a bpmn-js `canvas` object.
 *
 * @param {Canvas} canvas The bpmn-js canvas.
 */
function SimpleHeatSVG(canvas) {
  if (!canvas) {
    throw new Error('bpmn-js canvas required');
  }

  if (!(this instanceof SimpleHeatSVG)) {
    return new SimpleHeatSVG(canvas);
  }

  this._canvas = canvas;

  // Robustly find the <defs> element within the canvas's SVG container.
  const svg = canvas.getContainer().querySelector('svg');
  if (!svg) {
    throw new Error('Could not find SVG element in canvas container.');
  }

  let defs = svg.querySelector('defs');
  if (!defs) {
    // If <defs> does not exist, create and append it. This is a fallback.
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.prepend(defs);
  }
  this._defs = defs;

  this._layer = canvas.getLayer('overlays');

  if (!this._layer) {
    throw new Error('Could not get overlays layer from canvas.');
  }

  this._max = 1;
  this._data = [];
  this._heatGroup = null;

  this._setupSVG();
}

SimpleHeatSVG.prototype = {

  defaultRadius: 25,
  defaultBlur: 15,

  _setupSVG: function() {
    const ns = 'http://www.w3.org/2000/svg';

    // --- Create Gradient ---
    // Check if gradient already exists to avoid duplicates
    if (!this._defs.querySelector('#heatmap-blur-gradient')) {
      const radialGradient = document.createElementNS(ns, 'radialGradient');
      radialGradient.id = 'heatmap-blur-gradient';
      this._defs.appendChild(radialGradient);
      this._blurGradient = radialGradient;
    } else {
      this._blurGradient = this._defs.querySelector('#heatmap-blur-gradient');
    }

    // --- Create Filter ---
    // Check if filter already exists
    if (!this._defs.querySelector('#heatmap-colorize')) {
      const filter = document.createElementNS(ns, 'filter');
      filter.id = 'heatmap-colorize';
      this._defs.appendChild(filter);

      const feComponentTransferAlpha = document.createElementNS(ns, 'feComponentTransfer');
      feComponentTransferAlpha.setAttribute('in', 'SourceGraphic');
      feComponentTransferAlpha.setAttribute('result', 'boostedAlpha');
      filter.appendChild(feComponentTransferAlpha);

      const feFuncA = document.createElementNS(ns, 'feFuncA');
      feFuncA.setAttribute('type', 'gamma');
      feFuncA.setAttribute('exponent', '0.75');
      feComponentTransferAlpha.appendChild(feFuncA);

      const feColorMatrix = document.createElementNS(ns, 'feColorMatrix');
      feColorMatrix.setAttribute('type', 'matrix');
      feColorMatrix.setAttribute('values', '0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 0');
      feColorMatrix.setAttribute('in', 'boostedAlpha');
      feColorMatrix.setAttribute('result', 'grayscale');
      filter.appendChild(feColorMatrix);

      const feComponentTransferColor = document.createElementNS(ns, 'feComponentTransfer');
      feComponentTransferColor.setAttribute('in', 'grayscale');
      feComponentTransferColor.setAttribute('result', 'colorized');
      filter.appendChild(feComponentTransferColor);

      this._feFuncR = document.createElementNS(ns, 'feFuncR');
      this._feFuncR.setAttribute('type', 'table');
      feComponentTransferColor.appendChild(this._feFuncR);

      this._feFuncG = document.createElementNS(ns, 'feFuncG');
      this._feFuncG.setAttribute('type', 'table');
      feComponentTransferColor.appendChild(this._feFuncG);

      this._feFuncB = document.createElementNS(ns, 'feFuncB');
      this._feFuncB.setAttribute('type', 'table');
      feComponentTransferColor.appendChild(this._feFuncB);
    } else {
      // If filter exists, just get the references to the color functions
      this._feFuncR = this._defs.querySelector('#heatmap-colorize feFuncR');
      this._feFuncG = this._defs.querySelector('#heatmap-colorize feFuncG');
      this._feFuncB = this._defs.querySelector('#heatmap-colorize feFuncB');
    }

    // --- Create Heatmap Group ---
    // This is the group where the circles will be drawn.
    this._heatGroup = document.createElementNS(ns, 'g');
    this._heatGroup.setAttribute('class', 'heatmap-layer');
    this._heatGroup.setAttribute('filter', 'url(#heatmap-colorize)');

    // Prepend to the layer to be below other overlays.
    this._layer.prepend(this._heatGroup);

    // Set default gradient
    this.gradient(defaultGradient);
  },

  data: function(data) {
    this._data = data;
    return this;
  },

  max: function(max) {
    this._max = max;
    return this;
  },

  add: function(point) {
    this._data.push(point);
    return this;
  },

  clear: function() {
    this._data = [];
    if (this._heatGroup) {
      this._heatGroup.innerHTML = '';
    }
    return this;
  },

  radius: function(r, blur) {
    blur = blur === undefined ? this.defaultBlur : blur;
    r = r === undefined ? this.defaultRadius : r;
    this._r = r + blur;

    const blurStopRatio = r / this._r;

    // Use domify from min-dom would be better, but to keep this standalone, use innerHTML
    this._blurGradient.innerHTML = `
      <stop offset="0%" stop-color="white" stop-opacity="1"></stop>
      <stop offset="${blurStopRatio * 100}%" stop-color="white" stop-opacity="1"></stop>
      <stop offset="100%" stop-color="white" stop-opacity="0"></stop>
    `;

    return this;
  },

  gradient: function(grad) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);

    canvas.width = 1;
    canvas.height = 256;

    for (var i in grad) {
      gradient.addColorStop(+i, grad[i]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);

    const pixels = ctx.getImageData(0, 0, 1, 256).data;
    const r = [], g = [], b = [];

    for (let i = 0; i < pixels.length; i += 4) {
      r.push(pixels[i] / 255);
      g.push(pixels[i + 1] / 255);
      b.push(pixels[i + 2] / 255);
    }

    this._feFuncR.setAttribute('tableValues', r.join(' '));
    this._feFuncG.setAttribute('tableValues', g.join(' '));
    this._feFuncB.setAttribute('tableValues', b.join(' '));

    return this;
  },

  draw: function(minOpacity) {
    if (!this._r) this.radius(this.defaultRadius, this.defaultBlur);

    const ns = 'http://www.w3.org/2000/svg';
    minOpacity = minOpacity === undefined ? 0.05 : minOpacity;

    // clear previous heatmap content
    this._heatGroup.innerHTML = '';

    for (var i = 0, len = this._data.length, p; i < len; i++) {
      p = this._data[i];

      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', p[0]);
      circle.setAttribute('cy', p[1]);
      circle.setAttribute('r', this._r);
      circle.setAttribute('fill', 'url(#heatmap-blur-gradient)');

      const opacity = Math.min(Math.max(p[2] / this._max, minOpacity), 1);
      circle.setAttribute('opacity', opacity);

      this._heatGroup.appendChild(circle);
    }
    return this;
  },

  destroy: function() {
    if (this._heatGroup) {
      this._heatGroup.remove();
      this._heatGroup = null;
    }
    // Note: We are not removing the defs (filter, gradient) because other
    // instances might be using them. They are lightweight anyway.
  }
};

module.exports = SimpleHeatSVG;


/***/ }),

/***/ "./client/simulation/ChartPanel.js":
/*!*****************************************!*\
  !*** ./client/simulation/ChartPanel.js ***!
  \*****************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ ChartPanel)
/* harmony export */ });
/* harmony import */ var min_dom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! min-dom */ "./node_modules/min-dom/dist/index.esm.js");


const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';
const HELP_OPEN_CLS = 'help-open';

const HelpIcon = '<path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zm1,15h-2v-2h2v2zm0,-4h-2V7h2v6z"/>';

class ChartPanel {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;

    this._init();
  }

  _init() {
    this._container = (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.domify)(`
      <div class="${PALETTE_CLS}">
        <div class="header">
          <select class="chart-select">
            <option value="inputParams">Parámetros de Entrada (Tabla)</option>
            <option value="resultsTable">Resultados de Simulación (Tabla)</option>
            <option value="cost">Top 5 por Costo</option>
            <option value="processTime">Top 5 por Tiempo de Proceso</option>
            <option value="waitTime">Top 5 por Tiempo de Espera (Recursos)</option>
            <option value="resourceQuantity">Recursos Asignados por Tarea</option>
            <option value="scatter">Diagrama de Dispersión (Tiempo vs. Costo)</option>
            <option value="pareto">Diagrama de Pareto (Fallos)</option>
            <option value="paretoTime">Diagrama de Pareto (Tiempos)</option>
            <option value="paretoCost">Diagrama de Pareto (Costos)</option>
            <option value="allWaitTimes">Tiempos de Espera por Tarea (Completo)</option>
          </select>
          <button class="help-button" title="Ayuda"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${HelpIcon}</svg></button>
          <button class="close" title="Cerrar">×</button>
        </div>
        <div class="content">
          <div class="html-content"></div>
          <canvas id="simulationChartCanvas"></canvas>
        </div>
        <div class="help-content hidden">
          <h4>Ayuda de Gráficos y Tablas de Simulación</h4>
          <p><strong>Parámetros de Entrada (Tabla):</strong> Muestra una tabla con todos los datos de simulación configurados para cada elemento del diagrama (tiempos, costos, probabilidades, etc.). Útil para verificar la configuración antes de ejecutar la simulación.</p>
          <p><strong>Resultados de Simulación (Tabla):</strong> Presenta una tabla con las métricas de salida agregadas para cada elemento del diagrama después de ejecutar la simulación. Incluye conteos de ejecución, fallos, tiempos y costos totales.</p>
          <p><strong>Top 5 por Costo:</strong> Muestra las 5 tareas más caras de todo el proceso.</p>
          <p><strong>Top 5 por Tiempo de Proceso:</strong> Muestra las 5 tareas que más tiempo de trabajo activo consumen.</p>
          <p><strong>Top 5 por Tiempo de Espera (Recursos):</strong> Muestra las 5 tareas donde se pierde más tiempo esperando a que un recurso (persona) esté disponible. Indica cuellos de botella de personal.</p>
          <p><strong>Recursos Asignados por Tarea:</strong> Muestra cuántas personas (\`quantityRequired\`) están asignadas a cada tarea según la configuración.</p>
          <p><strong>Diagrama de Dispersión (Tiempo vs. Costo):</strong> Cada punto representa un tipo de tarea. El eje X es el tiempo de proceso promedio y el eje Y es el costo total incurrido por todas las ejecuciones de esa tarea. Ayuda a identificar tareas que son a la vez largas (en promedio) y caras (en total).</p>
          <p><strong>Diagrama de Pareto (Fallos):</strong> Muestra las tareas que causan la mayoría de los fallos. Las barras (eje izquierdo) son el número de fallos por tarea, ordenadas de mayor a menor. La línea (eje derecho) es el porcentaje acumulado del total de fallos. Útil para aplicar la regla 80/20 e identificar los "pocos vitales" problemas.</p>
          <p><strong>Diagrama de Pareto (Tiempos):</strong> Similar al de fallos, pero analiza el tiempo de proceso total. Ayuda a identificar qué pocas tareas contribuyen a la mayor parte del tiempo de trabajo total en el proceso. Las barras son el tiempo total de proceso por tarea, y la línea es el porcentaje acumulado.</p>
          <p><strong>Diagrama de Pareto (Costos):</strong> Aplica el principio de Pareto a los costos. Ayuda a identificar las tareas que son responsables de la mayor parte del costo total del proceso. Las barras son el costo total por tarea, y la línea es el porcentaje acumulado.</p>
          <p><strong>Tiempos de Espera por Tarea (Completo):</strong> Muestra el tiempo total de espera acumulado para cada tarea del proceso, ordenado de mayor a menor. A diferencia de los gráficos "Top 5", esta vista incluye todas las tareas para un análisis exhaustivo de los "tiempos muertos" y cuellos de botella de recursos.</p>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.helpButton = this._container.querySelector('button.help-button');
    this.helpContent = this._container.querySelector('.help-content');
    this.chartSelect = this._container.querySelector('select.chart-select');
    this.content = this._container.querySelector('.content');
    this.canvas = this._container.querySelector('#simulationChartCanvas');

    min_dom__WEBPACK_IMPORTED_MODULE_0__.event.bind(this.closeButton, 'click', () => this.toggle(false));
    min_dom__WEBPACK_IMPORTED_MODULE_0__.event.bind(this.helpButton, 'click', () => this.toggleHelp());
    min_dom__WEBPACK_IMPORTED_MODULE_0__.event.bind(this.chartSelect, 'change', (e) => {
        this._eventBus.fire('simulation.charts.opened');
    });

    this._eventBus.on('diagram.destroy', () => this.hide());
  }

  getChartType() {
    return this.chartSelect.value;
  }

  getCanvas() {
    return this.canvas;
  }

  showHtmlContent(html) {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = html;
    (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this.canvas).add('hidden');
    (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(htmlContent).remove('hidden');
  }

  showCanvas() {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = ''; // Clear it
    (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this.canvas).remove('hidden');
    (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(htmlContent).add('hidden');
  }

  isOpen() {
    return (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this._container).has(PALETTE_OPEN_CLS);
  }

  toggle(open) {
    const shouldOpen = (open !== undefined) ? open : !this.isOpen();

    if (shouldOpen) {
      (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this._container).add(PALETTE_OPEN_CLS);
      this._eventBus.fire('simulation.charts.opened');
    } else {
      (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this._container).remove(PALETTE_OPEN_CLS);
      this._eventBus.fire('simulation.charts.closed');
    }
  }

  toggleHelp() {
    (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this.helpContent).toggle('hidden');
    (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this.content).toggle('hidden');
  }

  hide() {
    this.toggle(false);
  }

  show() {
    this.toggle(true);
  }
}

ChartPanel.$inject = [ 'canvas', 'eventBus' ];


/***/ }),

/***/ "./client/simulation/RandomDataGenerator.js":
/*!**************************************************!*\
  !*** ./client/simulation/RandomDataGenerator.js ***!
  \**************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ RandomDataGenerator)
/* harmony export */ });
/* harmony import */ var bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! bpmn-js/lib/util/ModelUtil */ "./node_modules/bpmn-js/lib/util/ModelUtil.js");
/* harmony import */ var _util__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./util */ "./client/simulation/util.js");



const random = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const timeUnits = ['seconds', 'minutes', 'hours'];
const getRandomTimeUnit = () => timeUnits[random(0, timeUnits.length - 1)];

const generateRealisticTimeObject = (distribution = 'fixed') => {
  const unit = getRandomTimeUnit();
  let value, min, mode, max;

  if (unit === 'seconds') {
    min = random(20, 60);
    mode = random(60, 180);
    max = random(180, 400);
    value = random(30, 300);
  } else if (unit === 'minutes') {
    min = random(1, 10);
    mode = random(10, 25);
    max = random(25, 60);
    value = random(5, 50);
  } else { // hours
    min = random(1, 2);
    mode = random(2, 3);
    max = random(3, 5);
    value = random(1, 4);
  }

  if (distribution === 'triangular') {
    return { distribution, unit, min, mode, max };
  }
  return { distribution, unit, value };
};


class RandomDataGenerator {
  constructor(elementRegistry, modeling, bpmnFactory, editorActions, canvas) {
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._canvas = canvas;

    editorActions.register({
      generateRandomSimulationData: () => this.generate()
    });
  }

  generate() {
    console.log("--- INICIANDO GENERADOR DE DATOS ALEATORIOS ---");

    const allElements = [];
    const rootElement = this._canvas.getRootElement();

    if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(rootElement, 'bpmn:Collaboration')) {
        console.log("Detectado diagrama de colaboración.");
        rootElement.children.forEach(participant => {
            if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(participant, 'bpmn:Participant')) {
                const process = participant.businessObject.processRef;
                if (process && process.flowElements) {
                    process.flowElements.forEach(flowElement => {
                        const element = this._elementRegistry.get(flowElement.id);
                        if (element) {
                            allElements.push(element);
                        }
                    });
                }
                allElements.push(participant);
            }
        });
    } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(rootElement, 'bpmn:Process')) {
        console.log("Detectado diagrama de proceso simple.");
        rootElement.children.forEach(child => allElements.push(child));
        allElements.push(rootElement);
    }
    console.log(`Encontrados ${allElements.length} elementos para procesar.`);

    const processRoot = allElements.find(el => (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(el, 'bpmn:Process') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(el, 'bpmn:Participant'));
    if (processRoot) {
      console.log("Estableciendo configuración global en: ", processRoot.id);
      const simulationConfig = {
        simulationConfig: { runValue: 1000 },
        resourcePools: [ { name: "Analistas", quantity: random(1, 5) }, { name: "Gerentes", quantity: random(1, 3) } ]
      };
      this.setSimulationData(processRoot, simulationConfig);
    }

    allElements.forEach(element => {
      console.log("Procesando elemento:", element.id, `(Tipo: ${element.type})`);
      let data = null;

      if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(element, 'bpmn:StartEvent')) {
        data = { arrivalRate: { distribution: "fixed", unit: 'minutes', value: random(5, 15) } };
      } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(element, 'bpmn:Task')) {
        data = {
          processingTime: generateRealisticTimeObject('triangular'),
          resources: { pool: "Analistas", quantityRequired: random(1, 2) },
          cost: { type: "perHour", value: random(10, 100), currency: "USD" },
          failureRate: parseFloat((Math.random() * 0.29 + 0.01).toFixed(2)),
          reworkTime: generateRealisticTimeObject('fixed')
        };
      } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
        let remainingProbability = 1.0;
        element.outgoing.forEach((flow, index) => {
            let probability;
            if (index === element.outgoing.length - 1) {
              probability = remainingProbability;
            } else {
              probability = Math.random() * remainingProbability * 0.7;
              remainingProbability -= probability;
            }
            this.setSimulationData(flow, { branchingProbability: parseFloat(probability.toFixed(2)) });
        });
      }

      if (data) {
        this.setSimulationData(element, data);
      }
    });
    console.log("--- GENERADOR DE DATOS ALEATORIOS FINALIZADO ---");
  }

  setSimulationData(element, existingData = {}) {
    console.log(`Guardando datos para ${element.id}...`);
    const businessObject = element.businessObject;
    const currentSimData = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(element) || {};
    const newData = { ...currentSimData, ...existingData };
    const simulationDataString = JSON.stringify(newData, null, 2);
    console.log(" -> Datos a guardar:", newData);

    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) extensionElements = this._bpmnFactory.create('bpmn:ExtensionElements', { values: [] });

    let properties = extensionElements.get('values').find(v => (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(v, 'camunda:Properties'));
    if (!properties) {
      properties = this._bpmnFactory.create('camunda:Properties', { values: [] });
      extensionElements.get('values').push(properties);
    }

    let simProperty = properties.get('values').find(p => p.name === 'simulationData');
    if (!simProperty) {
        simProperty = this._bpmnFactory.create('camunda:Property', { name: 'simulationData' });
        properties.get('values').push(simProperty);
    }

    simProperty.value = simulationDataString;
    this._modeling.updateProperties(element, { extensionElements });
  }
}

RandomDataGenerator.$inject = [
  'elementRegistry',
  'modeling',
  'bpmnFactory',
  'editorActions',
  'canvas'
];


/***/ }),

/***/ "./client/simulation/SimulationController.js":
/*!***************************************************!*\
  !*** ./client/simulation/SimulationController.js ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ SimulationController)
/* harmony export */ });
/* harmony import */ var min_dom__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! min-dom */ "./node_modules/min-dom/dist/index.esm.js");
/* harmony import */ var bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! bpmn-js/lib/util/ModelUtil */ "./node_modules/bpmn-js/lib/util/ModelUtil.js");
/* harmony import */ var _simpleheat_svg_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../simpleheat-svg.js */ "./client/simpleheat-svg.js");
/* harmony import */ var _simpleheat_svg_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_simpleheat_svg_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _util__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./util */ "./client/simulation/util.js");





// Geometric icons to match the look and feel of the editor
const RunIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <path d="M 4 2 L 4 14 L 14 8 Z" fill="currentColor" />
    </svg>
  </span>
`;

const ShowIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80">
      <circle r="39"/>
      <path fill="#fff" d="M0,38a38,38 0 0 1 0,-76a19,19 0 0 1 0,38a19,19 0 0 0 0,38"/>
      <circle r="5" cy="19" fill="#fff"/>
      <circle r="5" cy="-19"/>
    </svg>
  </span>
`;

const ChartIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" />
    </svg>
  </span>
`;

class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays, tokenSimulationPalette, notifications, chartPanel) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._simulationEngine = simulationEngine;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;
    this._chartPanel = chartPanel;

    this._heatmap = null;
    this._chart = null;
    this._radius = 20;
    this._blur = 10;
    this.simulationResults = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    const runButton = (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)(`<div class="bts-entry" title="Ejecutar Simulación">${RunIcon}</div>`);
    const showButton = (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)(`<div class="bts-entry" title="Mostrar Análisis">${ShowIcon}</div>`);
    const chartButton = (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)(`<div class="bts-entry" title="Mostrar Gráficos">${ChartIcon}</div>`);

    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(runButton, 'click', () => this.runSimulation());
    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(showButton, 'click', () => this._simulationPalette.toggle());
    min_dom__WEBPACK_IMPORTED_MODULE_2__.event.bind(chartButton, 'click', () => this._chartPanel.toggle());

    this._tokenSimulationPalette.addEntry((0,min_dom__WEBPACK_IMPORTED_MODULE_2__.domify)('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);
    this._tokenSimulationPalette.addEntry(chartButton, 14);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));

    this._eventBus.on('simulation.charts.opened', () => this.showChart());
    this._eventBus.on('simulation.charts.typeChanged', (e) => this.showChart());
  }

  runSimulation() {
    this.clear();
    this.simulationResults = this._simulationEngine.run();
    this._notifications.showNotification({ text: 'Simulación completada', type: 'info', duration: 3000 });
  }

  adjustHeatmap(type, amount) {
      if (type === 'radius') this._radius = Math.max(1, this._radius + amount);
      else if (type === 'blur') this._blur = Math.max(0, this._blur + amount);
      if (this.lastMetric) this.showMetric(this.lastMetric);
  }

  showMetric(metric) {
    this.clearOverlaysAndHeatmap();
    this.lastMetric = metric;
    const dataPoints = [];
    let max = 0;

    if (metric === 'resourceQuantity') {
      this._elementRegistry.forEach(element => {
        if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Task')) {
          const data = (0,_util__WEBPACK_IMPORTED_MODULE_1__.getSimulationData)(element);
          const value = (data && data.resources && data.resources.quantityRequired) || 0;
          if (value > max) max = value;
          if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
        }
      });
    } else {
      if (!this.simulationResults) {
          this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
          return;
      }
      this.simulationResults.forEach((result, elementId) => {
          const element = this._elementRegistry.get(elementId);
          if (!element || !(0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:FlowNode')) return;

          let value = 0;
          if (metric === 'frequency') value = result.executionCount;
          else if (metric === 'cost') value = result.totalCost;
          else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1) / 1000; // Average
          else if (metric === 'totalWaitTime') value = result.totalWaitTime / 1000; // Total
          else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1) / 1000;
          else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1) / 1000;
          else if (metric === 'failureRate') value = result.failureCount / (result.executionCount || 1);
          else if (metric === 'transportWaitTime') value = result.totalTransportWaitTime / (result.executionCount || 1) / 1000;
          else if (metric === 'inefficientDispatch') value = result.inefficientDispatchCount;

          if (value > max) max = value;
          if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
      });
    }

    this.createHeatmap();
    this._heatmap.data(dataPoints).max(max || 1).radius(this._radius, this._blur).draw();
    this.showOverlays(metric);
  }

  showOverlays(metric) {
    const elements = metric === 'resourceQuantity'
      ? this._elementRegistry.filter(el => (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(el, 'bpmn:Task'))
      : Array.from(this.simulationResults.keys()).map(id => this._elementRegistry.get(id));

    elements.forEach(element => {
        if (!element) return;
        let overlayText = '';
        const result = this.simulationResults ? this.simulationResults.get(element.id) : null;

        if (metric === 'resourceQuantity') {
            const data = (0,_util__WEBPACK_IMPORTED_MODULE_1__.getSimulationData)(element);
            const value = (data && data.resources && data.resources.quantityRequired) || 0;
            if (value > 0) overlayText = `Recursos: ${value}`;
        } else if (result) {
            if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Task')) {
                if (metric === 'cost') overlayText = `Costo: $${result.totalCost.toFixed(2)}`;
                else if (metric === 'waitTime') overlayText = `Espera Prom: ${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalWaitTime / (result.executionCount || 1))}`;
                else if (metric === 'totalWaitTime') overlayText = `Espera Total: ${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalWaitTime)}`;
                else if (metric === 'processTime') overlayText = `Proceso: ${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalProcessingTime / (result.executionCount || 1))}`;
                else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
                else if (metric === 'failureRate' && result.executionCount > 0) {
                    const rate = (result.failureCount / result.executionCount * 100).toFixed(1);
                    overlayText = `Fallos: ${result.failureCount} (${rate}%)`;
                }
                else if (metric === 'transportWaitTime' && result.totalTransportWaitTime > 0) {
                  overlayText = `E.Carro: ${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalTransportWaitTime / (result.executionCount || 1))}`;
                }
                else if (metric === 'inefficientDispatch' && result.inefficientDispatchCount > 0) {
                  overlayText = `Desp. Inef: ${result.inefficientDispatchCount}`;
                }
            } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:EndEvent') && metric === 'cycleTime' && result.totalCycleTime > 0) {
                overlayText = `Ciclo: ${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalCycleTime / (result.executionCount || 1))}`;
            }
        }

        if (overlayText) this._overlays.add(element, 'simulation-overlay', { position: { bottom: -5, left: element.width / 2 - 20 }, html: `<div class="simulation-overlay-text">${overlayText}</div>` });

        if (result && (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:ExclusiveGateway')) {
            element.outgoing.forEach(flow => {
                const flowResult = this.simulationResults.get(flow.id);
                if (flowResult && result.executionCount > 0 && flowResult.executionCount > 0) {
                    const percentage = (flowResult.executionCount / result.executionCount * 100).toFixed(1);
                    this._overlays.add(flow.id, 'simulation-overlay', { position: { top: -15, left: -20 }, html: `<div class="simulation-overlay-text">${flowResult.executionCount} (${percentage}%)</div>` });
                }
            });
        }
    });
  }

  showChart() {
    const metric = this._chartPanel.getChartType();

    if (metric === 'inputParams') {
      const data = this.getInputParametersData();
      const tableHtml = this.createInputParametersTable(data);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    if (metric === 'resultsTable') {
      if (!this.simulationResults) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
        return;
      }
      const tableHtml = this.createResultsTable(this.simulationResults);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    this._chartPanel.showCanvas(); // Ensure canvas is visible for charts

    if (!this.simulationResults && metric !== 'resourceQuantity') {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        return;
    }

    // DESTRUYE EL GRÁFICO ANTERIOR (SI EXISTE)
    if (this._chart) {
      this._chart.destroy();
      this._chart = null; // Asegúrate de limpiarlo
    }

    // ¡AQUÍ ESTÁ LA MAGIA!
    // Carga Chart.js dinámicamente SOLO cuando este método es llamado
    Promise.all(/*! import() */[__webpack_require__.e("vendors"), __webpack_require__.e("client_simulation_chart-loader_js")]).then(__webpack_require__.bind(__webpack_require__, /*! ./chart-loader.js */ "./client/simulation/chart-loader.js")).then(({ Chart }) => {

        const chartConfig = this.getChartConfig(metric);
        const ctx = this._chartPanel.getCanvas().getContext('2d');

        // Crea la nueva instancia del gráfico DENTRO del callback del import
        this._chart = new Chart(ctx, chartConfig);

    }).catch(error => console.error('Error al cargar el módulo de gráficos', error));
  }

  getChartConfig(metric) {
    const chartData = this.getChartData(metric);

    let chartType = 'bar';
    if (metric === 'scatter') chartType = 'scatter';
    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') chartType = 'bar'; // It's a mixed type, but 'bar' is the base

    const options = {
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Valor' // Placeholder
                }
            }
        }
    };

    const yAxisTitle =
        metric === 'cost' ? 'Costo Total ($)' :
        metric === 'processTime' ? 'Tiempo de Proceso Total (s)' :
        metric === 'waitTime' || metric === 'allWaitTimes' ? 'Tiempo de Espera Total (s)' :
        metric === 'resourceQuantity' ? 'Cantidad de Recursos' :
        metric === 'pareto' ? 'Número de Fallos' :
        metric === 'paretoTime' ? 'Tiempo de Proceso Total' :
        metric === 'paretoCost' ? 'Costo Total ($)' :
        'Valor';
    options.scales.y.title.text = yAxisTitle;

    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') {
        options.scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0,
            max: 100,
            title: {
                display: true,
                text: 'Porcentaje Acumulado (%)'
            },
            grid: {
                drawOnChartArea: false, // only draw grid for primary axis
            },
        };
    }

    if (metric === 'scatter') {
        options.scales.x = {
            type: 'linear',
            position: 'bottom',
            title: {
                display: true,
                text: 'Tiempo de Proceso Promedio (s)'
            }
        };
        options.scales.y.title = {
            display: true,
            text: 'Costo Total ($)'
        };
    }

    // For pareto, datasets are pre-built. For others, build them now.
    const datasets = chartData.datasets ? chartData.datasets : [{
        label: chartData.label,
        data: chartData.data,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
    }];

    const timeMetrics = ['processTime', 'waitTime', 'allWaitTimes'];
    if (timeMetrics.includes(metric) || metric === 'paretoTime') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') {
                            label += context.parsed.y.toFixed(1) + '%';
                          } else {
                            label += (0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(context.parsed.y);
                          }
                        }
                        return label;
                    }
                }
            }
        };
    }

    if (metric === 'paretoCost') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') {
                            label += context.parsed.y.toFixed(1) + '%';
                          } else {
                            label += '$' + context.parsed.y.toFixed(2);
                          }
                        }
                        return label;
                    }
                }
            }
        };
    }

    if (metric === 'scatter') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const time = (0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(context.parsed.x * 1000); // convert seconds back to ms for formatting
                        const cost = context.parsed.y.toFixed(2);
                        return `${context.chart.data.labels[context.dataIndex]}: (${time}, $${cost})`;
                    }
                }
            }
        };
    }

    return {
      type: chartType,
      data: {
        labels: chartData.labels,
        datasets: datasets
      },
      options: options
    };
  }

  getInputParametersData() {
    const allElements = this._elementRegistry.getAll();
    const elementsWithData = [];
    allElements.forEach(element => {
      // We are interested in elements that can have simulation data
      if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Process') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Participant') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Task') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:StartEvent') || ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:SequenceFlow') && element.source?.type === 'bpmn:ExclusiveGateway')) {
        const data = (0,_util__WEBPACK_IMPORTED_MODULE_1__.getSimulationData)(element);
        if (data && Object.keys(data).length > 0) {
          elementsWithData.push({
            id: element.id,
            name: element.businessObject.name || element.id,
            type: element.type,
            data: data
          });
        }
      }
    });
    return elementsWithData;
  }

  createInputParametersTable(data) {
    if (!data || data.length === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No se encontraron elementos con datos de simulación configurados.</p>';
    }

    let tableHtml = `
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Tipo</th>
            <th>Parámetro</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach(element => {
      Object.entries(element.data).forEach(([key, value]) => {
        if (key === 'resourcePools' && Array.isArray(value)) {
           value.forEach(pool => {
              tableHtml += `
                <tr>
                  <td>${element.name}</td>
                  <td>${element.type.replace('bpmn:', '')}</td>
                  <td>resourcePools</td>
                  <td>${pool.name} (Qty: ${pool.quantity})</td>
                </tr>
              `;
           });
        } else if (typeof value !== 'object' || value === null) {
          tableHtml += `
            <tr>
              <td>${element.name}</td>
              <td>${element.type.replace('bpmn:', '')}</td>
              <td>${key}</td>
              <td>${JSON.stringify(value)}</td>
            </tr>
          `;
        } else {
          Object.entries(value).forEach(([subKey, subValue]) => {
            tableHtml += `
              <tr>
                <td>${element.name}</td>
                <td>${element.type.replace('bpmn:', '')}</td>
                <td>${key}.${subKey}</td>
                <td>${JSON.stringify(subValue)}</td>
              </tr>
            `;
          });
        }
      });
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  createResultsTable(results) {
    if (!results || results.size === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles. Por favor, ejecute una simulación primero.</p>';
    }

    let tableHtml = `
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Ejecuciones</th>
            <th>Fallos</th>
            <th>Espera Total</th>
            <th>Proceso Total</th>
            <th>Costo Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    results.forEach(result => {
      // Only show elements that were executed or have some value
      if (result.executionCount > 0 || result.totalCost > 0 || result.totalProcessingTime > 0) {
        tableHtml += `
          <tr>
            <td>${result.name}</td>
            <td>${result.executionCount}</td>
            <td>${result.failureCount}</td>
            <td>${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalWaitTime)}</td>
            <td>${(0,_util__WEBPACK_IMPORTED_MODULE_1__.formatMilliseconds)(result.totalProcessingTime)}</td>
            <td>$${result.totalCost.toFixed(2)}</td>
          </tr>
        `;
      }
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  getChartData(metric) {
    const tasks = [];

    if (metric === 'resourceQuantity') {
        this._elementRegistry.forEach(element => {
            if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Task')) {
                const data = (0,_util__WEBPACK_IMPORTED_MODULE_1__.getSimulationData)(element);
                const value = (data && data.resources && data.resources.quantityRequired) || 0;
                tasks.push({ name: element.businessObject.name || element.id, value: value });
            }
        });
    } else {
        this.simulationResults.forEach((result, elementId) => {
            const element = this._elementRegistry.get(elementId);
            if (element && (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_3__.is)(element, 'bpmn:Task')) {
                tasks.push({ ...result, name: element.businessObject.name || element.id });
            }
        });
    }

    if (metric === 'scatter') {
        const scatterData = tasks.map(t => ({
            x: t.totalProcessingTime / (t.executionCount || 1) / 1000,
            y: t.totalCost
        }));
        return { data: scatterData, labels: tasks.map(t => t.name), label: 'Tiempo de Proceso vs. Costo' };
    }

    if (metric === 'pareto') {
        const failedTasks = tasks.filter(t => t.failureCount > 0);
        failedTasks.sort((a, b) => b.failureCount - a.failureCount);

        const labels = failedTasks.map(t => t.name);
        const failureData = failedTasks.map(t => t.failureCount);
        const totalFailures = failureData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = failureData.map(count => {
            cumulative += count;
            return totalFailures > 0 ? (cumulative / totalFailures) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Número de Fallos',
                    data: failureData,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    if (metric === 'paretoCost') {
        const costTasks = tasks.filter(t => t.totalCost > 0);
        costTasks.sort((a, b) => b.totalCost - a.totalCost);

        const labels = costTasks.map(t => t.name);
        const costData = costTasks.map(t => t.totalCost);
        const totalCostValue = costData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = costData.map(count => {
            cumulative += count;
            return totalCostValue > 0 ? (cumulative / totalCostValue) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Costo Total',
                    data: costData,
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    if (metric === 'paretoTime') {
        const timedTasks = tasks.filter(t => t.totalProcessingTime > 0);
        timedTasks.sort((a, b) => b.totalProcessingTime - a.totalProcessingTime);

        const labels = timedTasks.map(t => t.name);
        const timeData = timedTasks.map(t => t.totalProcessingTime);
        const totalTime = timeData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = timeData.map(count => {
            cumulative += count;
            return totalTime > 0 ? (cumulative / totalTime) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Tiempo de Proceso Total',
                    data: timeData,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    let dataProperty, label;
    if (metric === 'cost') { dataProperty = 'totalCost'; label = 'Costo Total por Tarea'; }
    else if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso Total'; }
    else if (metric === 'waitTime') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'allWaitTimes') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'transportWaitTime') { dataProperty = 'totalTransportWaitTime'; label = 'Tiempo de Espera Total (Transporte)'; }
    else if (metric === 'inefficientDispatch') { dataProperty = 'inefficientDispatchCount'; label = 'Total de Despachos Ineficientes'; }
    else if (metric === 'resourceQuantity') { dataProperty = 'value'; label = 'Cantidad de Recursos por Tarea'; }

    tasks.sort((a, b) => b[dataProperty] - a[dataProperty]);

    const chartTasks = metric === 'allWaitTimes'
        ? tasks.filter(t => t[dataProperty] > 0)
        : tasks.filter(t => t[dataProperty] > 0).slice(0, 5);

    const labels = chartTasks.map(t => t.name);
    const data = chartTasks.map(t => t[dataProperty]);

    return { data, labels, label };
  }

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this.clearOverlaysAndHeatmap();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  clearOverlaysAndHeatmap() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.classes)(this._canvas.getContainer()).remove('heatmap-shown');
    this._overlays.remove({ type: 'simulation-overlay' });
  }

  createHeatmap() {
    if (this._heatmap) return;
    this._heatmap = new (_simpleheat_svg_js__WEBPACK_IMPORTED_MODULE_0___default())(this._canvas);
    (0,min_dom__WEBPACK_IMPORTED_MODULE_2__.classes)(this._canvas.getContainer()).add('heatmap-shown');
  }
}

SimulationController.$inject = [
  'canvas',
  'eventBus',
  'simulationPalette',
  'simulationEngine',
  'elementRegistry',
  'overlays',
  'tokenSimulationPalette',
  'notifications',
  'chartPanel'
];


/***/ }),

/***/ "./client/simulation/SimulationEngine.js":
/*!***********************************************!*\
  !*** ./client/simulation/SimulationEngine.js ***!
  \***********************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ SimulationEngine)
/* harmony export */ });
/* harmony import */ var bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! bpmn-js/lib/util/ModelUtil */ "./node_modules/bpmn-js/lib/util/ModelUtil.js");
/* harmony import */ var _util__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./util */ "./client/simulation/util.js");



const triangular = (min, mode, max) => {
  const F = (max - min) / (mode - min);
  const rand = Math.random();
  return rand < F ? min + Math.sqrt(rand * (mode - min) * (max - min)) : max - Math.sqrt((1 - rand) * (max - min) * (max - mode));
};

const timeToMilliseconds = (value, unit) => {
  if (unit === 'seconds') return value * 1000;
  if (unit === 'minutes') return value * 60 * 1000;
  if (unit === 'hours') return value * 60 * 60 * 1000;
  return value; // Default to milliseconds
};

class EventQueue {
  constructor() { this.items = []; }
  add(event) { this.items.push(event); this.items.sort((a, b) => a.time - b.time); }
  next() { return this.items.shift(); }
  isEmpty() { return this.items.length === 0; }
}

class ResourcePool {
  constructor(config) {
    this.name = config.name;
    this.available = config.quantity;
    this.queue = [];
  }
  request(quantity, task) {
    if (this.available >= quantity) {
      this.available -= quantity;
      return true;
    }
    this.queue.push({ quantity, task });
    return false;
  }
  release(quantity) {
    this.available += quantity;
    const newTasks = [];
    this.queue = this.queue.filter(waiting => {
      if (this.available >= waiting.quantity) {
        this.available -= waiting.quantity;
        newTasks.push(waiting.task);
        return false; // remove from queue
      }
      return true; // keep in queue
    });
    return newTasks;
  }
}

class SimulationEngine {
  constructor(elementRegistry) {
    this._elementRegistry = elementRegistry;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this.clock = 0;
    this.completedInstances = 0;
  }

  initialize() {
    this.clock = 0;
    this.completedInstances = 0;
    this.eventQueue = new EventQueue();
    this.results = new Map();
    this.resourcePools = new Map();
    this.instanceStates = new Map();
    this._elementRegistry.getAll().forEach(element => {
      this.results.set(element.id, {
        executionCount: 0, failureCount: 0, totalWaitTime: 0,
        totalProcessingTime: 0, totalCost: 0, totalCycleTime: 0,
        name: element.businessObject.name || element.id
      });
    });
  }

  findNextElements(element) {
    if (!element.outgoing || element.outgoing.length === 0) {
      return [];
    }

    if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(element, 'bpmn:ParallelGateway')) {
      return element.outgoing.map(flow => {
        const flowResults = this.results.get(flow.id);
        if (flowResults) flowResults.executionCount++;
        return { element: flow.target, connection: flow };
      });
    }

    let chosenFlow = null;
    if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
      const rand = Math.random();
      let cumulativeProbability = 0;
      for (const flow of element.outgoing) {
        const data = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(flow);
        const probability = data ? data.branchingProbability : (1 / element.outgoing.length);
        cumulativeProbability += probability;
        if (rand <= cumulativeProbability) {
          chosenFlow = flow;
          break;
        }
      }
      if (!chosenFlow) chosenFlow = element.outgoing[element.outgoing.length - 1];
    } else {
      chosenFlow = element.outgoing[0];
    }

    if (chosenFlow) {
      const flowResults = this.results.get(chosenFlow.id);
      if (flowResults) flowResults.executionCount++;
      return [{ element: chosenFlow.target, connection: chosenFlow }];
    }
    return [];
  }

  processEvent(event) {
    const { type, element, instanceId, startTime } = event;
    const elementResults = this.results.get(element.id);
    elementResults.executionCount++;
    this.clock = event.time;

    if (type === 'INSTANCE_COMPLETE') {
      this.completedInstances++;
      elementResults.totalCycleTime += (this.clock - startTime);
      this.instanceStates.delete(instanceId);
      return;
    }

    const nextElements = this.findNextElements(element);

    if (nextElements.length === 0) {
      this.eventQueue.add({ type: 'INSTANCE_COMPLETE', element, time: this.clock, instanceId, startTime });
      return;
    }

    nextElements.forEach(({ element: nextElement, connection: nextConnection }) => {
      const data = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(nextElement);

      if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(nextElement, 'bpmn:ParallelGateway') && nextElement.incoming.length > 1) {
        const instanceState = this.instanceStates.get(instanceId);
        const gatewayState = instanceState.gateways[nextElement.id] || (instanceState.gateways[nextElement.id] = { arrived: new Set() });

        gatewayState.arrived.add(nextConnection.id);

        if (gatewayState.arrived.size === nextElement.incoming.length) {
          this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
        }
      } else if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(nextElement, 'bpmn:Task') && data) {
        this.scheduleTask({ type: 'TASK_START', element: nextElement, time: this.clock, instanceId, startTime });
      } else {
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: nextElement, time: this.clock, instanceId, startTime });
      }
    });
  }

  scheduleTask(taskEvent) {
    const { element, time, instanceId, startTime } = taskEvent;
    const data = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(element);
    let processingTime = 0;
    if (data.processingTime.distribution === 'fixed') {
      processingTime = timeToMilliseconds(data.processingTime.value, data.processingTime.unit);
    } else if (data.processingTime.distribution === 'triangular') {
      const randomValue = triangular(data.processingTime.min, data.processingTime.mode, data.processingTime.max);
      processingTime = timeToMilliseconds(randomValue, data.processingTime.unit);
    }
    if (data.failureRate && Math.random() < data.failureRate) {
      const reworkTime = data.reworkTime ? timeToMilliseconds(data.reworkTime.value, data.reworkTime.unit) : 0;
      processingTime += reworkTime;
      this.results.get(element.id).failureCount++;
    }
    const cost = data.cost ? (data.cost.value / 3600000) * processingTime : 0;

    const quantityRequired = (data.resources && data.resources.quantityRequired) || 1;
    const newTaskEvent = { type: 'TASK_COMPLETE', element, time: time + processingTime, instanceId, startTime, processingTime, cost, quantityRequired };

    if (data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
      const pool = this.resourcePools.get(data.resources.pool);
      if (!pool.request(quantityRequired, newTaskEvent)) {
        newTaskEvent.waitStart = time;
      } else {
        this.eventQueue.add(newTaskEvent);
      }
    } else {
      this.eventQueue.add(newTaskEvent);
    }
  }

  run() {
    this.initialize();
    const processRoot = this._elementRegistry.find(el => (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(el, 'bpmn:Process') || (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(el, 'bpmn:Participant'));
    const configData = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(processRoot);
    const { runValue } = configData ? configData.simulationConfig : { runValue: 100 };
    if (configData && configData.resourcePools) {
      configData.resourcePools.forEach(p => this.resourcePools.set(p.name, new ResourcePool(p)));
    }
    const startEvent = this._elementRegistry.find(el => (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(el, 'bpmn:StartEvent'));
    if (!startEvent) return this.results;

    const startEventData = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(startEvent);
    let arrivalInterval = 1000; // Default to 1 second if not specified
    if (startEventData && startEventData.arrivalRate) {
      const rate = startEventData.arrivalRate.value;
      const unit = startEventData.arrivalRate.unit; // per second, minute, or hour
      if (rate > 0) {
        let intervalInSeconds;
        if (unit === 'second') {
          intervalInSeconds = 1 / rate;
        } else if (unit === 'minute') {
          intervalInSeconds = 60 / rate;
        } else { // hour
          intervalInSeconds = 3600 / rate;
        }
        arrivalInterval = intervalInSeconds * 1000;
      }
    }

    this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: 0, instanceId: 1, startTime: 0 });
    this.instanceStates.set(1, { gateways: {} });
    let instanceCounter = 1;

    while (!this.eventQueue.isEmpty()) {
      const event = this.eventQueue.next();
      this.clock = event.time;

      if (event.type === 'TASK_COMPLETE') {
        const results = this.results.get(event.element.id);
        results.totalProcessingTime += event.processingTime;
        results.totalCost += event.cost;
        if (event.waitStart) results.totalWaitTime += (this.clock - event.waitStart);

        const data = (0,_util__WEBPACK_IMPORTED_MODULE_0__.getSimulationData)(event.element);
        if (data && data.resources && data.resources.pool && this.resourcePools.has(data.resources.pool)) {
          const pool = this.resourcePools.get(data.resources.pool);
          const newTasks = pool.release(event.quantityRequired);
          newTasks.forEach(nextTask => {
            this.results.get(nextTask.element.id).totalWaitTime += (this.clock - nextTask.waitStart);
            nextTask.time = this.clock + nextTask.processingTime;
            delete nextTask.waitStart;
            this.eventQueue.add(nextTask);
          });
        }
        this.processEvent(event);
      } else {
        this.processEvent(event);
      }

      if (this.completedInstances >= runValue) break;
      if ((0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_1__.is)(event.element, 'bpmn:StartEvent') && instanceCounter < runValue) {
        instanceCounter++;
        const nextArrivalTime = event.time + arrivalInterval;
        this.eventQueue.add({ type: 'GATEWAY_COMPLETE', element: startEvent, time: nextArrivalTime, instanceId: instanceCounter, startTime: nextArrivalTime });
        this.instanceStates.set(instanceCounter, { gateways: {} });
      }
    }

    console.log("--- Simulation Finished ---");
    console.table(Object.fromEntries(this.results));
    return this.results;
  }
}

SimulationEngine.$inject = ['elementRegistry'];


/***/ }),

/***/ "./client/simulation/SimulationPalette.js":
/*!************************************************!*\
  !*** ./client/simulation/SimulationPalette.js ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (/* binding */ SimulationPalette)
/* harmony export */ });
/* harmony import */ var min_dom__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! min-dom */ "./node_modules/min-dom/dist/index.esm.js");


// Icons from https://materialdesignicons.com/
const ClockIcon = '<path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,7V12H17V14H10V7H12Z" />';
const CycleTimeIcon = '<path d="M12 4V1L8 5l4 4V6c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/>';
const FrequencyIcon = '<path d="M21 8H3V4h18v4zm0 2H3v4h18v-4zm0 6H3v4h18v-4z"/>';
const BugIcon = '<path d="M14,12h-4v-2h4V12z M19,9h-2.1c-0.5-1.2-1.4-2.2-2.6-2.9l1.5-1.5L14.4,3.1l-1.5,1.5C12.3,4.2,11.7,4,11,4 s-1.3,0.2-1.9,0.6L7.6,3.1L6.2,4.5l1.5,1.5C6.4,6.8,5.5,7.8,5.1,9H3v2h2.1c0.1,0.7,0.3,1.4,0.6,2H3v2h2.7c0.8,1,1.8,1.8,2.9,2.4 l-1.5,1.5L9.6,20.9l1.5-1.5c0.6,0.4,1.3,0.6,2,0.6s1.3-0.2,2-0.6l1.5,1.5l1.4-1.4l-1.5-1.5c1-0.6,1.9-1.4,2.6-2.4H21v-2h-2.1 c-0.3-0.6-0.5-1.3-0.6-2H21V9z"/>';
const TruckIcon = '<path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM15 11V6h3.5l1.96 2.5H15z"/>';
const WarningIcon = '<path d="M13 14h-2V9h2m0-6h-2v2h2M1 21h22L12 2 1 21z"/>';
const GroupIcon = '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>';
const BackIcon = '<path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />';

const PALETTE_CLS = 'simulation-palette';
const PALETTE_OPEN_CLS = 'open';

class SimulationPalette {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._metricCallback = () => {};
    this._clearCallback = () => {};
    this._adjustCallback = () => {};

    // *** FIX: Defer initialization until canvas is ready ***
    this._eventBus.on('canvas.init', () => {
      this.init();
    });

    this._eventBus.on('diagram.destroy', () => this.destroy());
  }

  init() {
    // Check if palette already exists to prevent duplicates on re-init
    if (this._palette) {
        return;
    }
    const container = this._canvas.getContainer();
    const palette = this._palette = (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.domify)(`<div class="${PALETTE_CLS}"></div>`);
    container.appendChild(palette);

    this.addEntry({
      title: 'Atrás',
      icon: BackIcon,
      isBack: true
    });

    this.addSeparator();

    this.addEntry({
      title: 'Visualizar Costos',
      text: '$',
      metric: 'cost'
    });
    this.addEntry({
      title: 'Visualizar Tiempos de Espera Promedio (Cuellos de Botella)',
      icon: ClockIcon,
      metric: 'waitTime'
    });
    this.addEntry({
      title: 'Visualizar Tiempos de Espera Totales',
      icon: ClockIcon,
      metric: 'totalWaitTime'
    });
    this.addEntry({
        title: 'Visualizar Tiempos de Ciclo',
        icon: CycleTimeIcon,
        metric: 'cycleTime'
    });
    this.addEntry({
      title: 'Visualizar Frecuencia de Ejecución',
      icon: FrequencyIcon,
      metric: 'frequency'
    });
    this.addEntry({
        title: 'Visualizar Tiempo de Proceso',
        icon: ClockIcon,
        metric: 'processTime'
    });
    this.addEntry({
        title: 'Visualizar Tasa de Fallos',
        icon: BugIcon,
        metric: 'failureRate'
    });
    this.addEntry({
        title: 'Visualizar Espera de Transporte',
        icon: TruckIcon,
        metric: 'transportWaitTime'
    });
    this.addEntry({
        title: 'Visualizar Despachos Ineficientes',
        icon: WarningIcon,
        metric: 'inefficientDispatch'
    });
    this.addEntry({
        title: 'Visualizar Cantidad de Recursos Asignados',
        icon: GroupIcon,
        metric: 'resourceQuantity'
    });

    this.addSeparator();

    this.addEntry({
      title: 'Limpiar Visualización',
      text: 'Limpiar',
      isClear: true
    });

    this.addSeparator();

    this.addControl('R+', 'Aumentar Radio', () => this._adjustCallback('radius', 5));
    this.addControl('R-', 'Disminuir Radio', () => this._adjustCallback('radius', -5));
    this.addControl('B+', 'Aumentar Desenfoque', () => this._adjustCallback('blur', 5));
    this.addControl('B-', 'Disminuir Desenfoque', () => this._adjustCallback('blur', -5));
  }

  addEntry(options) {
    const { title, icon, text, metric, isClear, isBack } = options;

    let content;
    if (icon) {
        content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>`;
    } else {
        content = `<span class="bts-entry-text">${text}</span>`;
    }

    const button = (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.domify)(`
      <button class="bts-entry" title="${title}">
        ${content}
      </button>
    `);

    min_dom__WEBPACK_IMPORTED_MODULE_0__.event.bind(button, 'click', () => {
        if (isClear) this._clearCallback();
        else if (isBack) this.close();
        else this._metricCallback(metric);
    });

    this._palette.appendChild(button);
  }

  addControl(text, title, action) {
    const button = (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.domify)(`<button class="bts-entry" title="${title}">${text}</button>`);
    min_dom__WEBPACK_IMPORTED_MODULE_0__.event.bind(button, 'click', action);
    this._palette.appendChild(button);
  }

  addSeparator() {
    this._palette.appendChild((0,min_dom__WEBPACK_IMPORTED_MODULE_0__.domify)('<hr class="bts-entry-separator">'));
  }

  setMetricCallback(cb) { this._metricCallback = cb; }
  setClearCallback(cb) { this._clearCallback = cb; }
  setAdjustCallback(cb) { this._adjustCallback = cb; }

  isOpen() {
      return this._palette && (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this._palette).has(PALETTE_OPEN_CLS);
  }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() {
      if (this._palette) (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this._palette).add(PALETTE_OPEN_CLS);
  }
  close() {
      if (this._palette) (0,min_dom__WEBPACK_IMPORTED_MODULE_0__.classes)(this._palette).remove(PALETTE_OPEN_CLS);
  }
  destroy() {
    if (this._palette && this._palette.parentNode) {
      this._palette.parentNode.removeChild(this._palette);
      this._palette = null;
    }
  }
}

SimulationPalette.$inject = [ 'canvas', 'eventBus' ];


/***/ }),

/***/ "./client/simulation/index.js":
/*!************************************!*\
  !*** ./client/simulation/index.js ***!
  \************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _SimulationController__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./SimulationController */ "./client/simulation/SimulationController.js");
/* harmony import */ var _SimulationPalette__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./SimulationPalette */ "./client/simulation/SimulationPalette.js");
/* harmony import */ var _RandomDataGenerator__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./RandomDataGenerator */ "./client/simulation/RandomDataGenerator.js");
/* harmony import */ var _SimulationEngine__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./SimulationEngine */ "./client/simulation/SimulationEngine.js");
/* harmony import */ var _ChartPanel__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./ChartPanel */ "./client/simulation/ChartPanel.js");






/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = ({
  __init__: [
    'simulationController',
    'simulationPalette',
    'randomDataGenerator',
    'chartPanel'
  ],
  simulationController: [ 'type', _SimulationController__WEBPACK_IMPORTED_MODULE_0__["default"] ],
  simulationPalette: [ 'type', _SimulationPalette__WEBPACK_IMPORTED_MODULE_1__["default"] ],
  randomDataGenerator: [ 'type', _RandomDataGenerator__WEBPACK_IMPORTED_MODULE_2__["default"] ],
  simulationEngine: [ 'type', _SimulationEngine__WEBPACK_IMPORTED_MODULE_3__["default"] ],
  chartPanel: [ 'type', _ChartPanel__WEBPACK_IMPORTED_MODULE_4__["default"] ]
});


/***/ }),

/***/ "./client/simulation/util.js":
/*!***********************************!*\
  !*** ./client/simulation/util.js ***!
  \***********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   formatMilliseconds: () => (/* binding */ formatMilliseconds),
/* harmony export */   getExtensionProperty: () => (/* binding */ getExtensionProperty),
/* harmony export */   getSimulationData: () => (/* binding */ getSimulationData)
/* harmony export */ });
/* harmony import */ var bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! bpmn-js/lib/util/ModelUtil */ "./node_modules/bpmn-js/lib/util/ModelUtil.js");


const getExtensionProperty = (element, name) => {
  if (!element || !element.businessObject) return null;
  const bo = element.businessObject;
  if (!bo.extensionElements || !bo.extensionElements.values) {
    return null;
  }
  const props = bo.extensionElements.values.find(v => (0,bpmn_js_lib_util_ModelUtil__WEBPACK_IMPORTED_MODULE_0__.is)(v, 'camunda:Properties'));
  if (!props || !props.values) {
    return null;
  }
  const prop = props.values.find(p => p.name === name);
  return prop ? prop.value : null;
};

const getSimulationData = (element) => {
  const dataString = getExtensionProperty(element, 'simulationData');
  if (!dataString) return null;
  try {
    return JSON.parse(dataString);
  } catch (e) {
    console.error(`Error parsing simulationData for element ${element.id}`, e);
    return null;
  }
};

const formatMilliseconds = (ms) => {
  if (ms === 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
};


/***/ }),

/***/ "./node_modules/css-loader/dist/cjs.js!./client/editor/data-editor.css":
/*!*****************************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./client/editor/data-editor.css ***!
  \*****************************************************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/sourceMaps.js */ "./node_modules/css-loader/dist/runtime/sourceMaps.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/api.js */ "./node_modules/css-loader/dist/runtime/api.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);
// Imports


var ___CSS_LOADER_EXPORT___ = _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default()((_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default()));
// Module
___CSS_LOADER_EXPORT___.push([module.id, `.sim-data-editor-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.sim-data-editor-modal.hidden {
  display: none;
}

.sim-data-editor-content {
  background-color: #f7f7f7;
  border-radius: 4px;
  width: 500px;
  max-width: 90%;
  box-shadow: 0 5px 15px rgba(0,0,0,0.3);
}

.sim-data-editor-header {
  background-color: #f0f0f0;
  padding: 15px;
  font-weight: bold;
  border-bottom: 1px solid #ccc;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}

.sim-data-editor-header .close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

.sim-data-editor-body {
  padding: 20px;
  max-height: 60vh;
  overflow-y: auto;
}

.sim-data-editor-footer {
  padding: 15px;
  background-color: #f0f0f0;
  border-top: 1px solid #ccc;
  text-align: right;
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
}

.sim-data-editor-footer button.save {
  background-color: #4CAF50;
  color: white;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.sim-data-editor-footer button.save:hover {
  background-color: #45a049;
}

.sim-data-editor-footer.hidden {
  display: none;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 5px;
  font-size: 13px;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007bff;
}

.resource-pool-row {
  display: flex;
  gap: 10px;
  margin-bottom: 5px;
}

.resource-pool-row input:first-child {
  flex-grow: 1;
}

button.add-button,
button.remove-pool {
  background-color: #e0e0e0;
  border: 1px solid #ccc;
  cursor: pointer;
  font-weight: bold;
  border-radius: 4px;
}

button.add-button {
  width: 100%;
  padding: 5px;
  margin-top: 5px;
}

button.remove-pool {
  background-color: #f44336;
  color: white;
  border-color: #d32f2f;
  min-width: 30px;
}

button.add-button:hover {
  background-color: #d5d5d5;
}

button.remove-pool:hover {
  background-color: #d32f2f;
}

.sim-data-editor-overlay {
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  color: #555;
}

.sim-data-editor-overlay:hover {
  background-color: #f0f0f0;
  color: black;
}
`, "",{"version":3,"sources":["webpack://./client/editor/data-editor.css"],"names":[],"mappings":"AAAA;EACE,eAAe;EACf,MAAM;EACN,OAAO;EACP,WAAW;EACX,YAAY;EACZ,oCAAoC;EACpC,aAAa;EACb,uBAAuB;EACvB,mBAAmB;EACnB,aAAa;AACf;;AAEA;EACE,aAAa;AACf;;AAEA;EACE,yBAAyB;EACzB,kBAAkB;EAClB,YAAY;EACZ,cAAc;EACd,sCAAsC;AACxC;;AAEA;EACE,yBAAyB;EACzB,aAAa;EACb,iBAAiB;EACjB,6BAA6B;EAC7B,aAAa;EACb,8BAA8B;EAC9B,mBAAmB;EACnB,2BAA2B;EAC3B,4BAA4B;AAC9B;;AAEA;EACE,gBAAgB;EAChB,YAAY;EACZ,eAAe;EACf,eAAe;EACf,cAAc;AAChB;;AAEA;EACE,aAAa;EACb,gBAAgB;EAChB,gBAAgB;AAClB;;AAEA;EACE,aAAa;EACb,yBAAyB;EACzB,0BAA0B;EAC1B,iBAAiB;EACjB,8BAA8B;EAC9B,+BAA+B;AACjC;;AAEA;EACE,yBAAyB;EACzB,YAAY;EACZ,kBAAkB;EAClB,YAAY;EACZ,kBAAkB;EAClB,eAAe;EACf,eAAe;AACjB;;AAEA;EACE,yBAAyB;AAC3B;;AAEA;EACE,aAAa;AACf;;AAEA;EACE,mBAAmB;AACrB;;AAEA;EACE,cAAc;EACd,iBAAiB;EACjB,kBAAkB;EAClB,eAAe;AACjB;;AAEA;;;EAGE,WAAW;EACX,YAAY;EACZ,sBAAsB;EACtB,kBAAkB;EAClB,sBAAsB;AACxB;;AAEA;;EAEE,aAAa;EACb,qBAAqB;AACvB;;AAEA;EACE,aAAa;EACb,SAAS;EACT,kBAAkB;AACpB;;AAEA;EACE,YAAY;AACd;;AAEA;;EAEE,yBAAyB;EACzB,sBAAsB;EACtB,eAAe;EACf,iBAAiB;EACjB,kBAAkB;AACpB;;AAEA;EACE,WAAW;EACX,YAAY;EACZ,eAAe;AACjB;;AAEA;EACE,yBAAyB;EACzB,YAAY;EACZ,qBAAqB;EACrB,eAAe;AACjB;;AAEA;EACE,yBAAyB;AAC3B;;AAEA;EACE,yBAAyB;AAC3B;;AAEA;EACE,uBAAuB;EACvB,sBAAsB;EACtB,kBAAkB;EAClB,WAAW;EACX,YAAY;EACZ,aAAa;EACb,mBAAmB;EACnB,uBAAuB;EACvB,eAAe;EACf,qCAAqC;EACrC,WAAW;AACb;;AAEA;EACE,yBAAyB;EACzB,YAAY;AACd","sourcesContent":[".sim-data-editor-modal {\n  position: fixed;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: 100%;\n  background-color: rgba(0, 0, 0, 0.5);\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  z-index: 1000;\n}\n\n.sim-data-editor-modal.hidden {\n  display: none;\n}\n\n.sim-data-editor-content {\n  background-color: #f7f7f7;\n  border-radius: 4px;\n  width: 500px;\n  max-width: 90%;\n  box-shadow: 0 5px 15px rgba(0,0,0,0.3);\n}\n\n.sim-data-editor-header {\n  background-color: #f0f0f0;\n  padding: 15px;\n  font-weight: bold;\n  border-bottom: 1px solid #ccc;\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  border-top-left-radius: 4px;\n  border-top-right-radius: 4px;\n}\n\n.sim-data-editor-header .close {\n  background: none;\n  border: none;\n  font-size: 24px;\n  cursor: pointer;\n  line-height: 1;\n}\n\n.sim-data-editor-body {\n  padding: 20px;\n  max-height: 60vh;\n  overflow-y: auto;\n}\n\n.sim-data-editor-footer {\n  padding: 15px;\n  background-color: #f0f0f0;\n  border-top: 1px solid #ccc;\n  text-align: right;\n  border-bottom-left-radius: 4px;\n  border-bottom-right-radius: 4px;\n}\n\n.sim-data-editor-footer button.save {\n  background-color: #4CAF50;\n  color: white;\n  padding: 10px 15px;\n  border: none;\n  border-radius: 4px;\n  cursor: pointer;\n  font-size: 14px;\n}\n\n.sim-data-editor-footer button.save:hover {\n  background-color: #45a049;\n}\n\n.sim-data-editor-footer.hidden {\n  display: none;\n}\n\n.form-group {\n  margin-bottom: 15px;\n}\n\n.form-group label {\n  display: block;\n  font-weight: bold;\n  margin-bottom: 5px;\n  font-size: 13px;\n}\n\n.form-group input[type=\"text\"],\n.form-group input[type=\"number\"],\n.form-group select {\n  width: 100%;\n  padding: 8px;\n  border: 1px solid #ccc;\n  border-radius: 4px;\n  box-sizing: border-box;\n}\n\n.form-group input:focus,\n.form-group select:focus {\n  outline: none;\n  border-color: #007bff;\n}\n\n.resource-pool-row {\n  display: flex;\n  gap: 10px;\n  margin-bottom: 5px;\n}\n\n.resource-pool-row input:first-child {\n  flex-grow: 1;\n}\n\nbutton.add-button,\nbutton.remove-pool {\n  background-color: #e0e0e0;\n  border: 1px solid #ccc;\n  cursor: pointer;\n  font-weight: bold;\n  border-radius: 4px;\n}\n\nbutton.add-button {\n  width: 100%;\n  padding: 5px;\n  margin-top: 5px;\n}\n\nbutton.remove-pool {\n  background-color: #f44336;\n  color: white;\n  border-color: #d32f2f;\n  min-width: 30px;\n}\n\nbutton.add-button:hover {\n  background-color: #d5d5d5;\n}\n\nbutton.remove-pool:hover {\n  background-color: #d32f2f;\n}\n\n.sim-data-editor-overlay {\n  background-color: white;\n  border: 1px solid #ccc;\n  border-radius: 50%;\n  width: 24px;\n  height: 24px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  box-shadow: 0 2px 5px rgba(0,0,0,0.2);\n  color: #555;\n}\n\n.sim-data-editor-overlay:hover {\n  background-color: #f0f0f0;\n  color: black;\n}\n"],"sourceRoot":""}]);
// Exports
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (___CSS_LOADER_EXPORT___);


/***/ }),

/***/ "./node_modules/css-loader/dist/cjs.js!./client/simulation/simulation.css":
/*!********************************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./client/simulation/simulation.css ***!
  \********************************************************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/sourceMaps.js */ "./node_modules/css-loader/dist/runtime/sourceMaps.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/api.js */ "./node_modules/css-loader/dist/runtime/api.js");
/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);
// Imports


var ___CSS_LOADER_EXPORT___ = _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default()((_node_modules_css_loader_dist_runtime_sourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default()));
// Module
___CSS_LOADER_EXPORT___.push([module.id, `/*
* The run/show buttons now use the default .bts-entry style
* to ensure visual consistency. No custom styles are needed.
*/

/* Simulation Palette */
.simulation-palette {
  position: absolute;
  top: 20px;
  left: 80px; /* Positioned to the right of the main palette */
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 5px;
  display: none; /* Hidden by default */
  z-index: 100;
}

.simulation-palette.open {
  display: flex;
  flex-direction: column;
}

.simulation-palette .bts-entry {
  padding: 5px;
  cursor: pointer;
  border-radius: 4px;
  margin: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  border: none;
  background: none;
}

.simulation-palette .bts-entry-text {
    font-size: 18px;
    font-weight: bold;
}

.simulation-palette .bts-entry:hover {
  background: #eee;
}

.simulation-palette .bts-entry svg {
  width: 20px;
  height: 20px;
}

.simulation-palette .bts-entry-separator {
  margin: 5px 0;
  border-top: 1px solid #ccc;
  border-bottom: none;
  border-left: none;
  border-right: none;
  padding: 0;
}


/* Overlays */
.simulation-overlay-text {
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}

/* Heatmap container */
.heatmap-shown svg {
    overflow: visible !important;
}

.heatmap-shown .heatmap-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    mix-blend-mode: multiply;
    opacity: 0.7;
}

/* Chart Panel */
.simulation-chart-panel {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px;
  display: none;
  z-index: 100;
  width: 1000px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}

.simulation-chart-panel.open {
  display: block;
}

.simulation-chart-panel .header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
  margin-bottom: 10px;
  font-weight: bold;
}

.simulation-chart-panel .header .close,
.simulation-chart-panel .header .help-button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 5px;
}

.simulation-chart-panel .header .help-button svg {
    width: 18px;
    height: 18px;
}

.simulation-chart-panel .header .close {
  font-size: 20px;
}

.simulation-chart-panel .help-content {
    padding: 10px;
    border-top: 1px solid #eee;
}

.simulation-chart-panel .help-content.hidden,
.simulation-chart-panel .content.hidden,
.simulation-chart-panel .html-content.hidden {
    display: none;
}

/* Styles for HTML Table Views */
.simulation-chart-panel .content {
    max-height: 60vh; /* Limit height to 60% of viewport height */
    overflow-y: auto; /* Add vertical scroll if content overflows */
}

.simulation-chart-panel .html-content {
    width: 100%;
    height: 100%;
    overflow: auto; /* Scrollbars for the table container itself */
}

.sim-results-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed; /* Prevent table from expanding uncontrollably */
}

.sim-results-table th,
.sim-results-table td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
    word-wrap: break-word; /* Wrap long text */
}

.sim-results-table th {
    background-color: #f2f2f2;
    font-weight: bold;
}

.sim-results-table tbody tr:nth-child(even) {
    background-color: #f9f9f9;
}

.simulation-chart-panel canvas.hidden {
    display: none;
}
`, "",{"version":3,"sources":["webpack://./client/simulation/simulation.css"],"names":[],"mappings":"AAAA;;;CAGC;;AAED,uBAAuB;AACvB;EACE,kBAAkB;EAClB,SAAS;EACT,UAAU,EAAE,gDAAgD;EAC5D,gBAAgB;EAChB,sBAAsB;EACtB,kBAAkB;EAClB,YAAY;EACZ,aAAa,EAAE,sBAAsB;EACrC,YAAY;AACd;;AAEA;EACE,aAAa;EACb,sBAAsB;AACxB;;AAEA;EACE,YAAY;EACZ,eAAe;EACf,kBAAkB;EAClB,WAAW;EACX,aAAa;EACb,mBAAmB;EACnB,uBAAuB;EACvB,eAAe;EACf,YAAY;EACZ,gBAAgB;AAClB;;AAEA;IACI,eAAe;IACf,iBAAiB;AACrB;;AAEA;EACE,gBAAgB;AAClB;;AAEA;EACE,WAAW;EACX,YAAY;AACd;;AAEA;EACE,aAAa;EACb,0BAA0B;EAC1B,mBAAmB;EACnB,iBAAiB;EACjB,kBAAkB;EAClB,UAAU;AACZ;;;AAGA,aAAa;AACb;EACE,8BAA8B;EAC9B,YAAY;EACZ,gBAAgB;EAChB,kBAAkB;EAClB,eAAe;EACf,mBAAmB;AACrB;;AAEA,sBAAsB;AACtB;IACI,4BAA4B;AAChC;;AAEA;IACI,kBAAkB;IAClB,MAAM;IACN,OAAO;IACP,WAAW;IACX,YAAY;IACZ,oBAAoB;IACpB,wBAAwB;IACxB,YAAY;AAChB;;AAEA,gBAAgB;AAChB;EACE,kBAAkB;EAClB,YAAY;EACZ,WAAW;EACX,gBAAgB;EAChB,sBAAsB;EACtB,kBAAkB;EAClB,aAAa;EACb,aAAa;EACb,YAAY;EACZ,aAAa;EACb,sCAAsC;AACxC;;AAEA;EACE,cAAc;AAChB;;AAEA;EACE,aAAa;EACb,8BAA8B;EAC9B,mBAAmB;EACnB,6BAA6B;EAC7B,mBAAmB;EACnB,mBAAmB;EACnB,iBAAiB;AACnB;;AAEA;;EAEE,gBAAgB;EAChB,YAAY;EACZ,eAAe;EACf,cAAc;AAChB;;AAEA;IACI,WAAW;IACX,YAAY;AAChB;;AAEA;EACE,eAAe;AACjB;;AAEA;IACI,aAAa;IACb,0BAA0B;AAC9B;;AAEA;;;IAGI,aAAa;AACjB;;AAEA,gCAAgC;AAChC;IACI,gBAAgB,EAAE,2CAA2C;IAC7D,gBAAgB,EAAE,6CAA6C;AACnE;;AAEA;IACI,WAAW;IACX,YAAY;IACZ,cAAc,EAAE,8CAA8C;AAClE;;AAEA;IACI,WAAW;IACX,yBAAyB;IACzB,mBAAmB,EAAE,gDAAgD;AACzE;;AAEA;;IAEI,sBAAsB;IACtB,YAAY;IACZ,gBAAgB;IAChB,qBAAqB,EAAE,mBAAmB;AAC9C;;AAEA;IACI,yBAAyB;IACzB,iBAAiB;AACrB;;AAEA;IACI,yBAAyB;AAC7B;;AAEA;IACI,aAAa;AACjB","sourcesContent":["/*\n* The run/show buttons now use the default .bts-entry style\n* to ensure visual consistency. No custom styles are needed.\n*/\n\n/* Simulation Palette */\n.simulation-palette {\n  position: absolute;\n  top: 20px;\n  left: 80px; /* Positioned to the right of the main palette */\n  background: #fff;\n  border: 1px solid #ccc;\n  border-radius: 4px;\n  padding: 5px;\n  display: none; /* Hidden by default */\n  z-index: 100;\n}\n\n.simulation-palette.open {\n  display: flex;\n  flex-direction: column;\n}\n\n.simulation-palette .bts-entry {\n  padding: 5px;\n  cursor: pointer;\n  border-radius: 4px;\n  margin: 2px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 30px;\n  border: none;\n  background: none;\n}\n\n.simulation-palette .bts-entry-text {\n    font-size: 18px;\n    font-weight: bold;\n}\n\n.simulation-palette .bts-entry:hover {\n  background: #eee;\n}\n\n.simulation-palette .bts-entry svg {\n  width: 20px;\n  height: 20px;\n}\n\n.simulation-palette .bts-entry-separator {\n  margin: 5px 0;\n  border-top: 1px solid #ccc;\n  border-bottom: none;\n  border-left: none;\n  border-right: none;\n  padding: 0;\n}\n\n\n/* Overlays */\n.simulation-overlay-text {\n  background: rgba(0, 0, 0, 0.7);\n  color: white;\n  padding: 2px 5px;\n  border-radius: 4px;\n  font-size: 12px;\n  white-space: nowrap;\n}\n\n/* Heatmap container */\n.heatmap-shown svg {\n    overflow: visible !important;\n}\n\n.heatmap-shown .heatmap-canvas {\n    position: absolute;\n    top: 0;\n    left: 0;\n    width: 100%;\n    height: 100%;\n    pointer-events: none;\n    mix-blend-mode: multiply;\n    opacity: 0.7;\n}\n\n/* Chart Panel */\n.simulation-chart-panel {\n  position: absolute;\n  bottom: 20px;\n  right: 20px;\n  background: #fff;\n  border: 1px solid #ccc;\n  border-radius: 4px;\n  padding: 10px;\n  display: none;\n  z-index: 100;\n  width: 1000px;\n  box-shadow: 0 5px 15px rgba(0,0,0,0.2);\n}\n\n.simulation-chart-panel.open {\n  display: block;\n}\n\n.simulation-chart-panel .header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  border-bottom: 1px solid #eee;\n  padding-bottom: 5px;\n  margin-bottom: 10px;\n  font-weight: bold;\n}\n\n.simulation-chart-panel .header .close,\n.simulation-chart-panel .header .help-button {\n  background: none;\n  border: none;\n  cursor: pointer;\n  padding: 0 5px;\n}\n\n.simulation-chart-panel .header .help-button svg {\n    width: 18px;\n    height: 18px;\n}\n\n.simulation-chart-panel .header .close {\n  font-size: 20px;\n}\n\n.simulation-chart-panel .help-content {\n    padding: 10px;\n    border-top: 1px solid #eee;\n}\n\n.simulation-chart-panel .help-content.hidden,\n.simulation-chart-panel .content.hidden,\n.simulation-chart-panel .html-content.hidden {\n    display: none;\n}\n\n/* Styles for HTML Table Views */\n.simulation-chart-panel .content {\n    max-height: 60vh; /* Limit height to 60% of viewport height */\n    overflow-y: auto; /* Add vertical scroll if content overflows */\n}\n\n.simulation-chart-panel .html-content {\n    width: 100%;\n    height: 100%;\n    overflow: auto; /* Scrollbars for the table container itself */\n}\n\n.sim-results-table {\n    width: 100%;\n    border-collapse: collapse;\n    table-layout: fixed; /* Prevent table from expanding uncontrollably */\n}\n\n.sim-results-table th,\n.sim-results-table td {\n    border: 1px solid #ddd;\n    padding: 8px;\n    text-align: left;\n    word-wrap: break-word; /* Wrap long text */\n}\n\n.sim-results-table th {\n    background-color: #f2f2f2;\n    font-weight: bold;\n}\n\n.sim-results-table tbody tr:nth-child(even) {\n    background-color: #f9f9f9;\n}\n\n.simulation-chart-panel canvas.hidden {\n    display: none;\n}\n"],"sourceRoot":""}]);
// Exports
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (___CSS_LOADER_EXPORT___);


/***/ }),

/***/ "./client/editor/data-editor.css":
/*!***************************************!*\
  !*** ./client/editor/data-editor.css ***!
  \***************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js */ "./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleDomAPI.js */ "./node_modules/style-loader/dist/runtime/styleDomAPI.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertBySelector.js */ "./node_modules/style-loader/dist/runtime/insertBySelector.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js */ "./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertStyleElement.js */ "./node_modules/style-loader/dist/runtime/insertStyleElement.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleTagTransform.js */ "./node_modules/style-loader/dist/runtime/styleTagTransform.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _node_modules_css_loader_dist_cjs_js_data_editor_css__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! !!../../node_modules/css-loader/dist/cjs.js!./data-editor.css */ "./node_modules/css-loader/dist/cjs.js!./client/editor/data-editor.css");











var options = {};

options.styleTagTransform = (_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default());
options.setAttributes = (_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default());
options.insert = _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default().bind(null, "head");
options.domAPI = (_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default());
options.insertStyleElement = (_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default());

var update = _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default()(_node_modules_css_loader_dist_cjs_js_data_editor_css__WEBPACK_IMPORTED_MODULE_6__["default"], options);




       /* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_css_loader_dist_cjs_js_data_editor_css__WEBPACK_IMPORTED_MODULE_6__["default"] && _node_modules_css_loader_dist_cjs_js_data_editor_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals ? _node_modules_css_loader_dist_cjs_js_data_editor_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals : undefined);


/***/ }),

/***/ "./client/simulation/simulation.css":
/*!******************************************!*\
  !*** ./client/simulation/simulation.css ***!
  \******************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js */ "./node_modules/style-loader/dist/runtime/injectStylesIntoStyleTag.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleDomAPI.js */ "./node_modules/style-loader/dist/runtime/styleDomAPI.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertBySelector.js */ "./node_modules/style-loader/dist/runtime/insertBySelector.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js */ "./node_modules/style-loader/dist/runtime/setAttributesWithoutAttributes.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/insertStyleElement.js */ "./node_modules/style-loader/dist/runtime/insertStyleElement.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4__);
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! !../../node_modules/style-loader/dist/runtime/styleTagTransform.js */ "./node_modules/style-loader/dist/runtime/styleTagTransform.js");
/* harmony import */ var _node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default = /*#__PURE__*/__webpack_require__.n(_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5__);
/* harmony import */ var _node_modules_css_loader_dist_cjs_js_simulation_css__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! !!../../node_modules/css-loader/dist/cjs.js!./simulation.css */ "./node_modules/css-loader/dist/cjs.js!./client/simulation/simulation.css");











var options = {};

options.styleTagTransform = (_node_modules_style_loader_dist_runtime_styleTagTransform_js__WEBPACK_IMPORTED_MODULE_5___default());
options.setAttributes = (_node_modules_style_loader_dist_runtime_setAttributesWithoutAttributes_js__WEBPACK_IMPORTED_MODULE_3___default());
options.insert = _node_modules_style_loader_dist_runtime_insertBySelector_js__WEBPACK_IMPORTED_MODULE_2___default().bind(null, "head");
options.domAPI = (_node_modules_style_loader_dist_runtime_styleDomAPI_js__WEBPACK_IMPORTED_MODULE_1___default());
options.insertStyleElement = (_node_modules_style_loader_dist_runtime_insertStyleElement_js__WEBPACK_IMPORTED_MODULE_4___default());

var update = _node_modules_style_loader_dist_runtime_injectStylesIntoStyleTag_js__WEBPACK_IMPORTED_MODULE_0___default()(_node_modules_css_loader_dist_cjs_js_simulation_css__WEBPACK_IMPORTED_MODULE_6__["default"], options);




       /* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (_node_modules_css_loader_dist_cjs_js_simulation_css__WEBPACK_IMPORTED_MODULE_6__["default"] && _node_modules_css_loader_dist_cjs_js_simulation_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals ? _node_modules_css_loader_dist_cjs_js_simulation_css__WEBPACK_IMPORTED_MODULE_6__["default"].locals : undefined);


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			id: moduleId,
/******/ 			loaded: false,
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/
/************************************************************************/
/******/ 	/* webpack/runtime/chunk loaded */
/******/ 	(() => {
/******/ 		var deferred = [];
/******/ 		__webpack_require__.O = (result, chunkIds, fn, priority) => {
/******/ 			if(chunkIds) {
/******/ 				priority = priority || 0;
/******/ 				for(var i = deferred.length; i > 0 && deferred[i - 1][2] > priority; i--) deferred[i] = deferred[i - 1];
/******/ 				deferred[i] = [chunkIds, fn, priority];
/******/ 				return;
/******/ 			}
/******/ 			var notFulfilled = Infinity;
/******/ 			for (var i = 0; i < deferred.length; i++) {
/******/ 				var [chunkIds, fn, priority] = deferred[i];
/******/ 				var fulfilled = true;
/******/ 				for (var j = 0; j < chunkIds.length; j++) {
/******/ 					if ((priority & 1 === 0 || notFulfilled >= priority) && Object.keys(__webpack_require__.O).every((key) => (__webpack_require__.O[key](chunkIds[j])))) {
/******/ 						chunkIds.splice(j--, 1);
/******/ 					} else {
/******/ 						fulfilled = false;
/******/ 						if(priority < notFulfilled) notFulfilled = priority;
/******/ 					}
/******/ 				}
/******/ 				if(fulfilled) {
/******/ 					deferred.splice(i--, 1)
/******/ 					var r = fn();
/******/ 					if (r !== undefined) result = r;
/******/ 				}
/******/ 			}
/******/ 			return result;
/******/ 		};
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".bundle.js";
/******/ 		};
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/global */
/******/ 	(() => {
/******/ 		__webpack_require__.g = (function() {
/******/ 			if (typeof globalThis === 'object') return globalThis;
/******/ 			try {
/******/ 				return this || new Function('return this')();
/******/ 			} catch (e) {
/******/ 				if (typeof window === 'object') return window;
/******/ 			}
/******/ 		})();
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/load script */
/******/ 	(() => {
/******/ 		var inProgress = {};
/******/ 		var dataWebpackPrefix = "camunda-modeler-token-simulation-plugin:";
/******/ 		// loadScript function to load a script via script tag
/******/ 		__webpack_require__.l = (url, done, key, chunkId) => {
/******/ 			if(inProgress[url]) { inProgress[url].push(done); return; }
/******/ 			var script, needAttach;
/******/ 			if(key !== undefined) {
/******/ 				var scripts = document.getElementsByTagName("script");
/******/ 				for(var i = 0; i < scripts.length; i++) {
/******/ 					var s = scripts[i];
/******/ 					if(s.getAttribute("src") == url || s.getAttribute("data-webpack") == dataWebpackPrefix + key) { script = s; break; }
/******/ 				}
/******/ 			}
/******/ 			if(!script) {
/******/ 				needAttach = true;
/******/ 				script = document.createElement('script');
/******/
/******/ 				script.charset = 'utf-8';
/******/ 				script.timeout = 120;
/******/ 				if (__webpack_require__.nc) {
/******/ 					script.setAttribute("nonce", __webpack_require__.nc);
/******/ 				}
/******/ 				script.setAttribute("data-webpack", dataWebpackPrefix + key);
/******/
/******/ 				script.src = url;
/******/ 			}
/******/ 			inProgress[url] = [done];
/******/ 			var onScriptComplete = (prev, event) => {
/******/ 				// avoid mem leaks in IE.
/******/ 				script.onerror = script.onload = null;
/******/ 				clearTimeout(timeout);
/******/ 				var doneFns = inProgress[url];
/******/ 				delete inProgress[url];
/******/ 				script.parentNode && script.parentNode.removeChild(script);
/******/ 				doneFns && doneFns.forEach((fn) => (fn(event)));
/******/ 				if(prev) return prev(event);
/******/ 			}
/******/ 			var timeout = setTimeout(onScriptComplete.bind(null, undefined, { type: 'timeout', target: script }), 120000);
/******/ 			script.onerror = onScriptComplete.bind(null, script.onerror);
/******/ 			script.onload = onScriptComplete.bind(null, script.onload);
/******/ 			needAttach && document.head.appendChild(script);
/******/ 		};
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/node module decorator */
/******/ 	(() => {
/******/ 		__webpack_require__.nmd = (module) => {
/******/ 			module.paths = [];
/******/ 			if (!module.children) module.children = [];
/******/ 			return module;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/publicPath */
/******/ 	(() => {
/******/ 		var scriptUrl;
/******/ 		if (__webpack_require__.g.importScripts) scriptUrl = __webpack_require__.g.location + "";
/******/ 		var document = __webpack_require__.g.document;
/******/ 		if (!scriptUrl && document) {
/******/ 			if (document.currentScript)
/******/ 				scriptUrl = document.currentScript.src;
/******/ 			if (!scriptUrl) {
/******/ 				var scripts = document.getElementsByTagName("script");
/******/ 				if(scripts.length) {
/******/ 					var i = scripts.length - 1;
/******/ 					while (i > -1 && !scriptUrl) scriptUrl = scripts[i--].src;
/******/ 				}
/******/ 			}
/******/ 		}
/******/ 		// When supporting browsers where an automatic publicPath is not supported you must specify an output.publicPath manually via configuration
/******/ 		// or pass an empty string ("") and set the __webpack_public_path__ variable from your code to use your own logic.
/******/ 		if (!scriptUrl) throw new Error("Automatic publicPath is not supported in this browser");
/******/ 		scriptUrl = scriptUrl.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/[^\/]+$/, "/");
/******/ 		__webpack_require__.p = scriptUrl;
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/jsonp chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/
/******/ 		// object to store loaded and loading chunks
/******/ 		// undefined = chunk not loaded, null = chunk preloaded/prefetched
/******/ 		// [resolve, reject, Promise] = chunk loading, 0 = chunk loaded
/******/ 		var installedChunks = {
/******/ 			"client": 0
/******/ 		};
/******/
/******/ 		__webpack_require__.f.j = (chunkId, promises) => {
/******/ 				// JSONP chunk loading for javascript
/******/ 				var installedChunkData = __webpack_require__.o(installedChunks, chunkId) ? installedChunks[chunkId] : undefined;
/******/ 				if(installedChunkData !== 0) { // 0 means "already installed".
/******/
/******/ 					// a Promise means "currently loading".
/******/ 					if(installedChunkData) {
/******/ 						promises.push(installedChunkData[2]);
/******/ 					} else {
/******/ 						if(true) { // all chunks have JS
/******/ 							// setup Promise in chunk cache
/******/ 							var promise = new Promise((resolve, reject) => (installedChunkData = installedChunks[chunkId] = [resolve, reject]));
/******/ 							promises.push(installedChunkData[2] = promise);
/******/
/******/ 							// start chunk loading
/******/ 							var url = __webpack_require__.p + __webpack_require__.u(chunkId);
/******/ 							// create error before stack unwound to get useful stacktrace later
/******/ 							var error = new Error();
/******/ 							var loadingEnded = (event) => {
/******/ 								if(__webpack_require__.o(installedChunks, chunkId)) {
/******/ 									installedChunkData = installedChunks[chunkId];
/******/ 									if(installedChunkData !== 0) installedChunks[chunkId] = undefined;
/******/ 									if(installedChunkData) {
/******/ 										var errorType = event && (event.type === 'load' ? 'missing' : event.type);
/******/ 										var realSrc = event && event.target && event.target.src;
/******/ 										error.message = 'Loading chunk ' + chunkId + ' failed.\n(' + errorType + ': ' + realSrc + ')';
/******/ 										error.name = 'ChunkLoadError';
/******/ 										error.type = errorType;
/******/ 										error.request = realSrc;
/******/ 										installedChunkData[1](error);
/******/ 									}
/******/ 								}
/******/ 							};
/******/ 							__webpack_require__.l(url, loadingEnded, "chunk-" + chunkId, chunkId);
/******/ 						}
/******/ 					}
/******/ 				}
/******/ 		};
/******/
/******/ 		// no prefetching
/******/
/******/ 		// no preloaded
/******/
/******/ 		// no HMR
/******/
/******/ 		// no HMR manifest
/******/
/******/ 		__webpack_require__.O.j = (chunkId) => (installedChunks[chunkId] === 0);
/******/
/******/ 		// install a JSONP callback for chunk loading
/******/ 		var webpackJsonpCallback = (parentChunkLoadingFunction, data) => {
/******/ 			var [chunkIds, moreModules, runtime] = data;
/******/ 			// add "moreModules" to the modules object,
/******/ 			// then flag all "chunkIds" as loaded and fire callback
/******/ 			var moduleId, chunkId, i = 0;
/******/ 			if(chunkIds.some((id) => (installedChunks[id] !== 0))) {
/******/ 				for(moduleId in moreModules) {
/******/ 					if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 						__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 					}
/******/ 				}
/******/ 				if(runtime) var result = runtime(__webpack_require__);
/******/ 			}
/******/ 			if(parentChunkLoadingFunction) parentChunkLoadingFunction(data);
/******/ 			for(;i < chunkIds.length; i++) {
/******/ 				chunkId = chunkIds[i];
/******/ 				if(__webpack_require__.o(installedChunks, chunkId) && installedChunks[chunkId]) {
/******/ 					installedChunks[chunkId][0]();
/******/ 				}
/******/ 				installedChunks[chunkId] = 0;
/******/ 			}
/******/ 			return __webpack_require__.O(result);
/******/ 		}
/******/
/******/ 		var chunkLoadingGlobal = self["webpackChunkcamunda_modeler_token_simulation_plugin"] = self["webpackChunkcamunda_modeler_token_simulation_plugin"] || [];
/******/ 		chunkLoadingGlobal.forEach(webpackJsonpCallback.bind(null, 0));
/******/ 		chunkLoadingGlobal.push = webpackJsonpCallback.bind(null, chunkLoadingGlobal.push.bind(chunkLoadingGlobal));
/******/ 	})();
/******/
/******/ 	/* webpack/runtime/nonce */
/******/ 	(() => {
/******/ 		__webpack_require__.nc = undefined;
/******/ 	})();
/******/
/************************************************************************/
/******/
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module depends on other loaded chunks and execution need to be delayed
/******/ 	var __webpack_exports__ = __webpack_require__.O(undefined, ["vendors"], () => (__webpack_require__("./client/client.js")))
/******/ 	__webpack_exports__ = __webpack_require__.O(__webpack_exports__);
/******/
/******/ })()
;
//# sourceMappingURL=client.bundle.js.map