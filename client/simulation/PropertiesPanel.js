import {
  domify,
  event as domEvent
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';

const getSimulationData = (element) => {
  const businessObject = element.businessObject;
  if (!businessObject.extensionElements || !businessObject.extensionElements.values) return {};
  const properties = businessObject.extensionElements.values.find(v => is(v, 'camunda:Properties'));
  if (!properties || !properties.values) return {};
  const property = properties.values.find(p => p.name === 'simulationData');
  if (!property || !property.value) return {};
  try {
    return JSON.parse(property.value);
  } catch (e) { return {}; }
};

export default class PropertiesPanel {
  constructor(canvas, modeling, bpmnFactory) {
    this._canvas = canvas;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._element = null;
    this.init();
  }

  init() {
    const container = this._canvas.getContainer();
    this._panel = domify(`
      <div class="simulation-properties-panel" style="display: none;">
        <div class="panel-content">
          <h3>Configuración de Simulación</h3>
          <form>
            <div class="form-group">
              <label>Tiempo de Proceso (min)</label>
              <select name="procTimeDist">
                <option value="fixed">Fijo</option>
                <option value="triangular">Triangular</option>
              </select>
              <input type="number" name="procTimeVal1" placeholder="Valor">
              <input type="number" name="procTimeVal2" placeholder="Moda" style="display:none;">
              <input type="number" name="procTimeVal3" placeholder="Máx" style="display:none;">
            </div>
            <div class="form-group">
              <label>Costo por Hora ($)</label>
              <input type="number" name="cost" value="0">
            </div>
            <div class="form-group">
              <label>Tasa de Fallo (%)</label>
              <input type="number" name="failureRate" min="0" max="100" value="0">
            </div>
            <div class="form-group">
              <label>Tiempo de Reparación (min)</label>
              <input type="number" name="reworkTime" value="0">
            </div>
            <hr>
            <div class="form-group buttons">
                <button type="submit">Guardar</button>
                <button type="button" class="cancel">Cancelar</button>
            </div>
          </form>
        </div>
      </div>
    `);
    container.appendChild(this._panel);

    const form = this._panel.querySelector('form');
    domEvent.bind(form, 'submit', event => {
      event.preventDefault();
      this.save();
    });

    const cancelButton = this._panel.querySelector('.cancel');
    domEvent.bind(cancelButton, 'click', () => this.close());

    const procTimeDist = this._panel.querySelector('[name="procTimeDist"]');
    domEvent.bind(procTimeDist, 'change', event => this.updateProcTimeFields(event.target.value));
  }

  updateProcTimeFields(dist) {
      const v1 = this._panel.querySelector('[name="procTimeVal1"]');
      const v2 = this._panel.querySelector('[name="procTimeVal2"]');
      const v3 = this._panel.querySelector('[name="procTimeVal3"]');
      if (dist === 'fixed') {
          v1.placeholder = 'Valor';
          v2.style.display = 'none';
          v3.style.display = 'none';
      } else {
          v1.placeholder = 'Mín';
          v2.style.display = '';
          v3.style.display = '';
      }
  }

  open(element) {
    this._element = element;
    this._panel.style.display = 'block';
    this.load();
  }

  close() {
    this._panel.style.display = 'none';
    this._element = null;
  }

  load() {
    const data = getSimulationData(this._element);

    if (data.processingTime) {
        const dist = data.processingTime.distribution;
        this._panel.querySelector('[name="procTimeDist"]').value = dist;
        this.updateProcTimeFields(dist);
        if (dist === 'fixed') {
            this._panel.querySelector('[name="procTimeVal1"]').value = data.processingTime.value;
        } else {
            this._panel.querySelector('[name="procTimeVal1"]').value = data.processingTime.min;
            this._panel.querySelector('[name="procTimeVal2"]').value = data.processingTime.mode;
            this._panel.querySelector('[name="procTimeVal3"]').value = data.processingTime.max;
        }
    }

    if (data.cost) this._panel.querySelector('[name="cost"]').value = data.cost.value;
    if (data.failureRate) this._panel.querySelector('[name="failureRate"]').value = data.failureRate * 100;
    if (data.reworkTime) this._panel.querySelector('[name="reworkTime"]').value = data.reworkTime.value;
  }

  save() {
    const data = {};

    const procTimeDist = this._panel.querySelector('[name="procTimeDist"]').value;
    const v1 = parseFloat(this._panel.querySelector('[name="procTimeVal1"]').value);
    if (procTimeDist === 'fixed') {
        data.processingTime = { distribution: 'fixed', unit: 'minutes', value: v1 };
    } else {
        const v2 = parseFloat(this._panel.querySelector('[name="procTimeVal2"]').value);
        const v3 = parseFloat(this._panel.querySelector('[name="procTimeVal3"]').value);
        data.processingTime = { distribution: 'triangular', unit: 'minutes', min: v1, mode: v2, max: v3 };
    }

    data.cost = { type: "perHour", value: parseFloat(this._panel.querySelector('[name="cost"]').value), currency: "USD" };
    data.failureRate = parseFloat(this._panel.querySelector('[name="failureRate"]').value) / 100;
    data.reworkTime = { distribution: "fixed", unit: "minutes", value: parseFloat(this._panel.querySelector('[name="reworkTime"]').value) };

    this.setSimulationData(this._element, data);
    this.close();
  }

  setSimulationData(element, data) {
    const businessObject = element.businessObject;
    const simulationDataString = JSON.stringify(data, null, 2);

    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) {
      extensionElements = this._bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    }

    let properties = extensionElements.get('values').find(v => is(v, 'camunda:Properties'));
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

PropertiesPanel.$inject = [ 'canvas', 'modeling', 'bpmnFactory' ];
