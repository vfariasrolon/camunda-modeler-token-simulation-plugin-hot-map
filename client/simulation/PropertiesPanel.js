import {
  domify,
  event as domEvent
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';

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
                <div class="form-group"><label>Tiempo de Proceso (min)</label><select name="procTimeDist"><option value="fixed">Fijo</option><option value="triangular">Triangular</option></select><input type="number" name="procTimeVal1" placeholder="Valor"><input type="number" name="procTimeVal2" placeholder="Moda" style="display:none;"><input type="number" name="procTimeVal3" placeholder="Máx" style="display:none;"></div>
                <div class="form-group"><label>Costo por Hora ($)</label><input type="number" name="cost" value="0"></div>
                <div class="form-group"><label>Tasa de Fallo (%)</label><input type="number" name="failureRate" min="0" max="100" value="0"></div>
                <div class="form-group"><label>Tiempo de Reparación (min)</label><input type="number" name="reworkTime" value="0"></div>
                <hr>
                <h4>Configuración de Transporte</h4>
                <div class="form-group"><label>Rol de Transporte</label><select name="transportRole"><option value="none">Ninguno</option><option value="loads">Carga Carro</option><option value="requires">Requiere Carro</option></select></div>
                <div class="form-group"><label>Flota de Carros</label><input type="text" name="transportPool" placeholder="ej. carros_grandes"></div>
            </div>
            <div class="flow-fields" style="display:none;">
                <h4>Configuración de Flujo</h4>
                <div class="form-group"><label>Tiempo de Transporte (min)</label><input type="number" name="transportTime" value="0"></div>
                <div class="form-group"><label>Probabilidad de Bifurcación (%)</label><input type="number" name="branchingProbability" min="0" max="100" value="0"></div>
            </div>
            <div class="start-event-fields" style="display:none;">
                <h4>Configuración de Evento de Inicio</h4>
                <div class="form-group"><label>Tasa de Llegada (min)</label><input type="number" name="arrivalRate" value="10"></div>
            </div>
            <div class="form-group buttons"><button type="submit">Guardar</button><button type="button" class="cancel">Cancelar</button></div>
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
    const data = getSimulationData(this._element) || {};
    this._panel.querySelector('form').reset();
    this._panel.querySelector('.task-fields').style.display = 'none';
    this._panel.querySelector('.flow-fields').style.display = 'none';
    this._panel.querySelector('.start-event-fields').style.display = 'none';

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
        if (data.branchingProbability) this._panel.querySelector('[name="branchingProbability"]').value = data.branchingProbability * 100;
    } else if (is(this._element, 'bpmn:StartEvent')) {
        this._panel.querySelector('.start-event-fields').style.display = 'block';
        if (data.arrivalRate) this._panel.querySelector('[name="arrivalRate"]').value = data.arrivalRate.value;
    }
  }

  save() {
    const data = getSimulationData(this._element) || {};
    if (is(this._element, 'bpmn:Task')) {
        // ... save proc time, cost, failure, rework ...
        const transportRole = this._panel.querySelector('[name="transportRole"]').value;
        const poolName = this._panel.querySelector('[name="transportPool"]').value;
        if (transportRole === 'loads') { data.loads = { pool: poolName }; delete data.requires; }
        else if (transportRole === 'requires') { data.requires = { pool: poolName }; delete data.loads; }
        else { delete data.loads; delete data.requires; }
    } else if (is(this._element, 'bpmn:SequenceFlow')) {
        const transportTime = parseFloat(this._panel.querySelector('[name="transportTime"]').value);
        if (transportTime > 0) data.transportTime = { distribution: "fixed", unit: "minutes", value: transportTime };
        else delete data.transportTime;
        const branchingProb = parseFloat(this._panel.querySelector('[name="branchingProbability"]').value);
        if (branchingProb > 0) data.branchingProbability = branchingProb / 100;
        else delete data.branchingProbability;
    } else if (is(this._element, 'bpmn:StartEvent')) {
        const arrivalRate = parseFloat(this._panel.querySelector('[name="arrivalRate"]').value);
        if (arrivalRate > 0) data.arrivalRate = { distribution: "fixed", unit: "minutes", value: arrivalRate };
    }
    this.setSimulationData(this._element, data);
    this.close();
  }

  setSimulationData(element, data) {
    const businessObject = element.businessObject;
    if (Object.keys(data).length === 0) {
        // ... logic to remove property if data is empty ...
        return;
    }
    const simulationDataString = JSON.stringify(data, null, 2);
    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) extensionElements = this._bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
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
