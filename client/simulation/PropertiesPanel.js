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
            <div class="task-fields" style="display:none;">
                <h4>Configuración de Tarea</h4>
                <div class="form-group">
                  <label>Tiempo de Proceso (min)</label>
                  <select name="procTimeDist"><option value="fixed">Fijo</option><option value="triangular">Triangular</option></select>
                  <input type="number" name="procTimeVal1" placeholder="Valor"><input type="number" name="procTimeVal2" placeholder="Moda" style="display:none;"><input type="number" name="procTimeVal3" placeholder="Máx" style="display:none;">
                </div>
                <div class="form-group"><label>Costo por Hora ($)</label><input type="number" name="cost" value="0"></div>
                <div class="form-group"><label>Tasa de Fallo (%)</label><input type="number" name="failureRate" min="0" max="100" value="0"></div>
                <div class="form-group"><label>Tiempo de Reparación (min)</label><input type="number" name="reworkTime" value="0"></div>

                <h4>Configuración de Transporte</h4>
                <div class="form-group">
                    <label>Rol de Transporte</label>
                    <select name="transportRole"><option value="none">Ninguno</option><option value="loads">Carga Carro</option><option value="requires">Requiere Carro</option></select>
                </div>
                <div class="form-group"><label>Flota de Carros</label><input type="text" name="transportPool" placeholder="ej. carros_grandes"></div>
            </div>
            <div class="flow-fields" style="display:none;">
                <h4>Configuración de Flujo</h4>
                <div class="form-group"><label>Tiempo de Transporte (min)</label><input type="number" name="transportTime" value="0"></div>
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
    domEvent.bind(form, 'submit', event => { event.preventDefault(); this.save(); });
    domEvent.bind(this._panel.querySelector('.cancel'), 'click', () => this.close());
    domEvent.bind(this._panel.querySelector('[name="procTimeDist"]'), 'change', event => this.updateProcTimeFields(event.target.value));
  }

  updateProcTimeFields(dist) { /* ... same as before ... */ }

  open(element) {
    this._element = element;
    this._panel.style.display = 'block';
    this.load();
  }

  close() { /* ... same as before ... */ }

  load() {
    const data = getSimulationData(this._element);

    // Hide all sections first
    this._panel.querySelector('.task-fields').style.display = 'none';
    this._panel.querySelector('.flow-fields').style.display = 'none';

    if (is(this._element, 'bpmn:Task')) {
        this._panel.querySelector('.task-fields').style.display = 'block';
        if (data.processingTime) { /* ... load proc time ... */ }
        if (data.cost) this._panel.querySelector('[name="cost"]').value = data.cost.value;
        if (data.failureRate) this._panel.querySelector('[name="failureRate"]').value = data.failureRate * 100;
        if (data.reworkTime) this._panel.querySelector('[name="reworkTime"]').value = data.reworkTime.value;
        if (data.loads) {
            this._panel.querySelector('[name="transportRole"]').value = 'loads';
            this._panel.querySelector('[name="transportPool"]').value = data.loads.pool;
        } else if (data.requires) {
            this._panel.querySelector('[name="transportRole"]').value = 'requires';
            this._panel.querySelector('[name="transportPool"]').value = data.requires.pool;
        }
    } else if (is(this._element, 'bpmn:SequenceFlow')) {
        this._panel.querySelector('.flow-fields').style.display = 'block';
        if (data.transportTime) this._panel.querySelector('[name="transportTime"]').value = data.transportTime.value;
    }
  }

  save() {
    const data = getSimulationData(this._element); // Start with existing data

    if (is(this._element, 'bpmn:Task')) {
        // ... save proc time, cost, failure, rework ...
        const transportRole = this._panel.querySelector('[name="transportRole"]').value;
        if (transportRole === 'loads') {
            data.loads = { pool: this._panel.querySelector('[name="transportPool"]').value };
            delete data.requires;
        } else if (transportRole === 'requires') {
            data.requires = { pool: this._panel.querySelector('[name="transportPool"]').value };
            delete data.loads;
        } else {
            delete data.loads;
            delete data.requires;
        }
    } else if (is(this._element, 'bpmn:SequenceFlow')) {
        const transportTime = parseFloat(this._panel.querySelector('[name="transportTime"]').value);
        if (transportTime > 0) {
            data.transportTime = { distribution: "fixed", unit: "minutes", value: transportTime };
        } else {
            delete data.transportTime;
        }
    }

    this.setSimulationData(this._element, data);
    this.close();
  }

  setSimulationData(element, data) { /* ... same as before ... */ }
}

PropertiesPanel.$inject = [ 'canvas', 'modeling', 'bpmnFactory' ];
