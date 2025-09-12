import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';

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

export default class RandomDataGenerator {
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
    console.log("--- INICIANDO GENERADOR DE DATOS (AVANZADO) ---");

    const allElements = this._elementRegistry.getAll();
    const processRoot = allElements.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));

    if (processRoot) {
      const simulationConfig = {
        simulationConfig: { runValue: 1000 },
        resourcePools: [
          { name: "Analistas", quantity: random(2, 5) },
          { name: "Gerentes", quantity: random(1, 2) }
        ]
      };
      this.setSimulationData(processRoot, simulationConfig);
    }

    allElements.forEach(element => {
      let data = null;

      if (is(element, 'bpmn:StartEvent')) {
        data = { arrivalRate: { distribution: "fixed", unit: 'minutes', value: random(5, 20) } };
      } else if (is(element, 'bpmn:Task')) {
        data = {
          processingTime: generateRealisticTimeObject('triangular'),
          resources: { pool: "Analistas", quantityRequired: random(1, 2) },
          cost: { value: random(10, 100), currency: "USD" },
          failureRate: parseFloat((Math.random() * 0.2).toFixed(2)),
          reworkTime: generateRealisticTimeObject('fixed')
        };
      } else if (is(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
        let remainingProbability = 1.0;
        element.outgoing.forEach((flow, index) => {
            let probability;
            if (index === element.outgoing.length - 1) {
              probability = remainingProbability;
            } else {
              probability = Math.random() * remainingProbability * 0.8;
              remainingProbability -= probability;
            }
            this.setSimulationData(flow, { branchingProbability: parseFloat(probability.toFixed(2)) });
        });
      }

      if (data) {
        this.setSimulationData(element, data);
      }
    });
    console.log("--- GENERADOR DE DATOS FINALIZADO ---");
  }

  setSimulationData(element, existingData = {}) {
    const businessObject = element.businessObject;
    if (!businessObject) return;

    const currentSimData = getSimulationData(element) || {};
    const newData = { ...currentSimData, ...existingData };
    const simulationDataString = JSON.stringify(newData, null, 2);

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

RandomDataGenerator.$inject = [
  'elementRegistry',
  'modeling',
  'bpmnFactory',
  'editorActions',
  'canvas'
];
