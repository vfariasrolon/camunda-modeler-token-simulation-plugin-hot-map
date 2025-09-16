import { domify, event as domEvent } from 'min-dom';
import { getSimulationData } from '../simulation/util';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import './data-editor.css';

const EditIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="currentColor" d="M19.4,6.6l-3.9-3.9c-0.4-0.4-1-0.4-1.4,0l-11,11c-0.2,0.2-0.3,0.4-0.3,0.7v3.9c0,0.6,0.4,1,1,1h3.9c0.3,0,0.5-0.1,0.7-0.3l11-11C19.8,7.6,19.8,7,19.4,6.6z M7.5,17.5H5.1v-2.4l7.5-7.5l2.4,2.4L7.5,17.5z"/>
</svg>`;

const formatTime = (timeObj) => {
  if (typeof timeObj === 'string') return timeObj;
  if (typeof timeObj === 'object' && timeObj !== null) {
    const hour = String(timeObj.hour).padStart(2, '0');
    const minute = String(timeObj.minute).padStart(2, '0');
    return `${hour}:${minute}`;
  }
  return '09:00'; // Fallback
};

export default class DataEditor {
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
    this.createModal();

    this._eventBus.on('selection.changed', ({ newSelection }) => {
      this.removeOverlay();
      this.closeModal();

      if (newSelection.length === 1) {
        this.addOverlay(newSelection[0]);
      }
    });
  }

  createModal() {
    this._modal = domify(`
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
    domEvent.bind(closeButton, 'click', () => this.closeModal());

    const saveButton = this._modal.querySelector('button.save');
    domEvent.bind(saveButton, 'click', () => this.save());

    // Close modal on background click
    domEvent.bind(this._modal, 'click', (e) => {
      if (e.target === this._modal) {
        this.closeModal();
      }
    });
  }

  openModal(element) {
    this._selectedElement = element;
    this.updateModalContent();
    this._modal.classList.remove('hidden');
  }

  closeModal() {
    this._modal.classList.add('hidden');
    this._selectedElement = null;
  }

  addOverlay(element) {
    const overlayHtml = domify(`<div class="sim-data-editor-overlay">${EditIcon}</div>`);

    domEvent.bind(overlayHtml, 'click', () => {
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

    const rawData = getSimulationData(this._selectedElement) || {};
    title.textContent = `Propiedades de: ${this._selectedElement.businessObject.name || this._selectedElement.id}`;
    footer.classList.remove('hidden');

    if (is(this._selectedElement, 'bpmn:Task')) {
      const data = this._getTaskDefaults(rawData);
      this.renderTaskForm(body, data);
    } else if (is(this._selectedElement, 'bpmn:SequenceFlow') && this._selectedElement.source.type === 'bpmn:ExclusiveGateway') {
      const data = this._getSequenceFlowDefaults(rawData);
      this.renderSequenceFlowForm(body, data);
    } else if (is(this._selectedElement, 'bpmn:StartEvent')) {
      const data = this._getStartEventDefaults(rawData);
      this.renderStartEventForm(body, data);
    } else if (is(this._selectedElement, 'bpmn:Process') || is(this._selectedElement, 'bpmn:Participant')) {
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
    const defaults = {
      arrivalRate: { value: 60, unit: 'minute' },
      simulationConfig: { runValue: 1000 },
      isRoot: false,
      calendar: {
        workingDays: [1, 2, 3, 4, 5],
        workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }
      },
      cost: {
        waitCostPerHour: 0,
        baseRatePerHour: 50
      },
      overtime: {
        limitHours: 9,
        payMultiplier: 2,
        excessPayMultiplier: 3
      }
    };
    return {
      ...defaults,
      ...data,
      arrivalRate: { ...defaults.arrivalRate, ...(data.arrivalRate || {}) },
      simulationConfig: { ...defaults.simulationConfig, ...(data.simulationConfig || {}) },
      calendar: { ...defaults.calendar, ...(data.calendar || {}) },
      cost: { ...defaults.cost, ...(data.cost || {}) },
      overtime: { ...defaults.overtime, ...(data.overtime || {}) }
    };
  }

  _getProcessDefaults(data = {}) {
    const defaults = {
      resourcePools: []
    };
    return {
      ...defaults,
      ...data
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
    const { arrivalRate, isRoot, calendar, cost, overtime, simulationConfig } = data;

    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const workingDaysCheckboxes = days.map((day, index) => `
      <label>
        <input type="checkbox" name="calendar.workingDays" value="${index}" ${calendar.workingDays.includes(index) ? 'checked' : ''}>
        ${day}
      </label>
    `).join('');

    const startTimeValue = formatTime(calendar.workingHours.start);
    const endTimeValue = formatTime(calendar.workingHours.end);

    container.innerHTML = `
      <div class="form-group">
        <label>Tasa de Llegada (arrivalRate)</label>
        <input type="number" name="arrivalRate.value" value="${arrivalRate.value}">
        <select name="arrivalRate.unit">
          <option value="minute" ${arrivalRate.unit === 'minute' ? 'selected' : ''}>por Minuto</option>
          <option value="hour" ${arrivalRate.unit === 'hour' ? 'selected' : ''}>por Hora</option>
        </select>
      </div>
      <div class="form-group">
        <label>Instancias a Simular (runValue)</label>
        <input type="number" name="simulationConfig.runValue" value="${simulationConfig.runValue}">
      </div>
      <hr/>
      <div class="form-group">
        <label class="is-root-label">
            <input type="checkbox" name="isRoot" ${isRoot ? 'checked' : ''}>
            Usar como Configuración Raíz (init_root)
        </label>
      </div>
      <p class="helper-text">Marque esta casilla para que las reglas de calendario y costos de este evento de inicio se apliquen a toda la simulación.</p>
      <fieldset>
        <legend>Calendario Laboral</legend>
        <div class="form-group">
          <label>Días Laborales</label>
          <div class="checkbox-group">${workingDaysCheckboxes}</div>
        </div>
        <div class="form-group">
          <label>Horario Laboral</label>
          <input type="time" name="calendar.workingHours.start" value="${startTimeValue}">
          <span>-</span>
          <input type="time" name="calendar.workingHours.end" value="${endTimeValue}">
        </div>
      </fieldset>
      <fieldset>
          <legend>Reglas de Costos y Horas Extras</legend>
          <div class="form-group">
              <label>Costo Base por Hora ($)</label>
              <input type="number" name="cost.baseRatePerHour" value="${cost.baseRatePerHour}" min="0">
          </div>
          <div class="form-group">
              <label>Costo de Espera por Hora ($)</label>
              <input type="number" name="cost.waitCostPerHour" value="${cost.waitCostPerHour}" min="0">
          </div>
          <div class="form-group">
              <label>Límite Horas Extras Semanales</label>
              <input type="number" name="overtime.limitHours" value="${overtime.limitHours}" min="0">
          </div>
          <div class="form-group">
              <label>Multiplicador Pago Normal (e.g., 2 = Doble)</label>
              <input type="number" name="overtime.payMultiplier" value="${overtime.payMultiplier}" min="1">
          </div>
          <div class="form-group">
              <label>Multiplicador Pago Excedente (e.g., 3 = Triple)</label>
              <input type="number" name="overtime.excessPayMultiplier" value="${overtime.excessPayMultiplier}" min="1">
          </div>
      </fieldset>
    `;
  }

  renderProcessForm(container, data) {
    const { resourcePools } = data;
    const poolsHtml = resourcePools.map((pool, index) => `
      <div class="resource-pool-row">
        <input type="text" name="resourcePools[${index}].name" value="${pool.name}" placeholder="Nombre del Pool">
        <input type="number" name="resourcePools[${index}].quantity" value="${pool.quantity}" placeholder="Cantidad">
        <button class="remove-pool" data-index="${index}">-</button>
      </div>
    `).join('');

    container.innerHTML = `
      <fieldset>
        <legend>Piscinas de Recursos (resourcePools)</legend>
        <div id="resource-pools-container">${poolsHtml}</div>
        <button id="add-pool" class="add-button">+</button>
      </fieldset>
    `;

    const poolsContainer = container.querySelector('#resource-pools-container');

    const addPoolButton = container.querySelector('#add-pool');
    domEvent.bind(addPoolButton, 'click', (e) => {
      e.preventDefault();
      const newIndex = poolsContainer.children.length;
      const newPoolRow = domify(`
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
          domEvent.bind(button, 'click', (e) => {
              e.preventDefault();
              e.target.closest('.resource-pool-row').remove();
          });
      });
  }

  save() {
    if (!this._selectedElement) return;

    const body = this._modal.querySelector('.sim-data-editor-body');
    const existingData = getSimulationData(this._selectedElement) || {};
    let newData = {};

    if (is(this._selectedElement, 'bpmn:Task')) {
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
    } else if (is(this._selectedElement, 'bpmn:SequenceFlow')) {
      newData = {
        branchingProbability: parseFloat(body.querySelector('[name="branchingProbability"]').value)
      };
    } else if (is(this._selectedElement, 'bpmn:StartEvent')) {
      const workingDays = Array.from(body.querySelectorAll('[name="calendar.workingDays"]:checked'))
                                 .map(input => parseInt(input.value, 10));
      const workingHours = {
        start: body.querySelector('[name="calendar.workingHours.start"]').value,
        end: body.querySelector('[name="calendar.workingHours.end"]').value
      };

      newData = {
        arrivalRate: {
          value: parseFloat(body.querySelector('[name="arrivalRate.value"]').value),
          unit: body.querySelector('[name="arrivalRate.unit"]').value
        },
        simulationConfig: {
          runValue: parseInt(body.querySelector('[name="simulationConfig.runValue"]').value, 10)
        },
        isRoot: body.querySelector('[name="isRoot"]').checked,
        calendar: {
          workingDays,
          workingHours: {
            start: {
              hour: parseInt(workingHours.start.split(':')[0], 10),
              minute: parseInt(workingHours.start.split(':')[1], 10)
            },
            end: {
              hour: parseInt(workingHours.end.split(':')[0], 10),
              minute: parseInt(workingHours.end.split(':')[1], 10)
            }
          }
        },
        cost: {
          baseRatePerHour: parseFloat(body.querySelector('[name="cost.baseRatePerHour"]').value),
          waitCostPerHour: parseFloat(body.querySelector('[name="cost.waitCostPerHour"]').value)
        },
        overtime: {
          limitHours: parseInt(body.querySelector('[name="overtime.limitHours"]').value, 10),
          payMultiplier: parseFloat(body.querySelector('[name="overtime.payMultiplier"]').value),
          excessPayMultiplier: parseFloat(body.querySelector('[name="overtime.excessPayMultiplier"]').value)
        }
      };
    } else if (is(this._selectedElement, 'bpmn:Process') || is(this._selectedElement, 'bpmn:Participant')) {
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
