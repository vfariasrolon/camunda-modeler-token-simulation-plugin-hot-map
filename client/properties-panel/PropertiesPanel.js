import { domify, event as domEvent } from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from '../simulation/util';
import './properties-panel.css';

const EditIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="currentColor" d="M19.4,6.6l-3.9-3.9c-0.4-0.4-1-0.4-1.4,0l-11,11c-0.2,0.2-0.3,0.4-0.3,0.7v3.9c0,0.6,0.4,1,1,1h3.9c0.3,0,0.5-0.1,0.7-0.3l11-11C19.8,7.6,19.8,7,19.4,6.6z M7.5,17.5H5.1v-2.4l7.5-7.5l2.4,2.4L7.5,17.5z"/>
</svg>`;

export default class PropertiesPanel {
  constructor(eventBus, overlays, selection, modeling, bpmnFactory, elementRegistry, canvas, notifications) {
    this._eventBus = eventBus;
    this._overlays = overlays;
    this._selection = selection;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._elementRegistry = elementRegistry;
    this._canvas = canvas;
    this._notifications = notifications;

    this._currentOverlayId = null;
    this._panel = null;
    this._selectedElement = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    this.createPanel();

    this._eventBus.on('selection.changed', (context) => {
      this.removeOverlay();
      this.togglePanel(false); // Hide panel on selection change

      const { newSelection } = context;

      this._selectedElement = newSelection.length === 1 ? newSelection[0] : null;

      if (this._selectedElement) {
        this.addOverlay(this._selectedElement);
      }
    });
  }

  createPanel() {
    this._panel = domify(`
      <div class="sim-properties-panel hidden">
        <div class="sim-properties-panel-header">
          <span id="properties-panel-title">Simulation Properties</span>
          <button class="close">×</button>
        </div>
        <div class="sim-properties-panel-body"></div>
        <div class="sim-properties-panel-footer">
            <button class="save">Guardar</button>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._panel);

    const closeButton = this._panel.querySelector('button.close');
    domEvent.bind(closeButton, 'click', () => this.togglePanel(false));

    const saveButton = this._panel.querySelector('button.save');
    domEvent.bind(saveButton, 'click', () => this.saveProperties());
  }

  togglePanel(open) {
    if (open === undefined) {
      this._panel.classList.toggle('hidden');
    } else if (open) {
      this._panel.classList.remove('hidden');
    } else {
      this._panel.classList.add('hidden');
    }
  }

  updatePanelContent() {
    const body = this._panel.querySelector('.sim-properties-panel-body');
    const title = this._panel.querySelector('#properties-panel-title');
    body.innerHTML = '';

    if (!this._selectedElement) {
      return;
    }

    const data = getSimulationData(this._selectedElement) || {};
    title.textContent = `Propiedades de: ${this._selectedElement.businessObject.name || this._selectedElement.id}`;

    if (is(this._selectedElement, 'bpmn:Task')) {
      this.renderTaskForm(body, data);
    } else if (is(this._selectedElement, 'bpmn:SequenceFlow') && this._selectedElement.source.type === 'bpmn:ExclusiveGateway') {
      this.renderSequenceFlowForm(body, data);
    } else if (is(this._selectedElement, 'bpmn:StartEvent')) {
      this.renderStartEventForm(body, data);
    } else if (is(this._selectedElement, 'bpmn:Process') || is(this._selectedElement, 'bpmn:Participant')) {
      this.renderProcessForm(body, data);
    } else {
      body.innerHTML = '<p>Propiedades de simulación no aplicables para este tipo de elemento.</p>';
      this._panel.querySelector('.sim-properties-panel-footer').classList.add('hidden');
    }

    if (body.innerHTML) {
      this._panel.querySelector('.sim-properties-panel-footer').classList.remove('hidden');
    }
  }

  renderTaskForm(container, data) {
    const {
      processingTime = { distribution: 'fixed', value: 10, unit: 'minutes' },
      cost = { value: 10, currency: 'USD' },
      resources = { pool: '', quantityRequired: 1 },
      failureRate = 0.0,
      reworkTime = { distribution: 'fixed', value: 20, unit: 'minutes' }
    } = data;

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
    const { branchingProbability = 0.5 } = data;
    container.innerHTML = `
      <div class="form-group">
        <label>Probabilidad de Ramificación (branchingProbability)</label>
        <input type="number" name="branchingProbability" value="${branchingProbability}" min="0" max="1" step="0.01">
      </div>
    `;
  }

  renderStartEventForm(container, data) {
    const { arrivalRate = { value: 60, unit: 'minute' } } = data;
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
    const {
      simulationConfig = { runValue: 1000 },
      resourcePools = []
    } = data;

    let poolsHtml = resourcePools.map((pool, index) => `
      <div class="resource-pool-row">
        <input type="text" name="resourcePools[${index}].name" value="${pool.name}" placeholder="Nombre del Pool">
        <input type="number" name="resourcePools[${index}].quantity" value="${pool.quantity}" placeholder="Cantidad">
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
      </div>
    `;
  }

  saveProperties() {
    if (!this._selectedElement) return;

    const body = this._panel.querySelector('.sim-properties-panel-body');
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
      newData = {
        arrivalRate: {
          value: parseFloat(body.querySelector('[name="arrivalRate.value"]').value),
          unit: body.querySelector('[name="arrivalRate.unit"]').value
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
    this.togglePanel(false);
  }

  addOverlay(element) {
    const overlayHtml = domify(`<div class="sim-properties-overlay">${EditIcon}</div>`);

    domEvent.bind(overlayHtml, 'click', () => {
      this.updatePanelContent();
      this.togglePanel(true);
    });

    this._currentOverlayId = this._overlays.add(element, 'sim-properties', {
      position: {
        top: -12,
        right: -12
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
}

PropertiesPanel.$inject = [
  'eventBus',
  'overlays',
  'selection',
  'modeling',
  'bpmnFactory',
  'elementRegistry',
  'canvas',
  'notifications'
];
