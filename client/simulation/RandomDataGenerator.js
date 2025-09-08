import { is } from 'bpmn-js/lib/util/ModelUtil';

const random = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

export default class RandomDataGenerator {
  constructor(elementRegistry, modeling, bpmnFactory, editorActions) {
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;

    editorActions.register({
      generateRandomSimulationData: () => this.generate()
    });
  }

  generate() {
    const elements = this._elementRegistry.getAll();

    // Add general process info to the first process or participant
    const processRoot = this._elementRegistry.find(el => is(el, 'bpmn:Process')) || this._elementRegistry.find(el => is(el, 'bpmn:Participant'));
    if (processRoot) {
      const simulationConfig = {
        simulationConfig: { runUntil: "instances", runValue: 1000, runUnit: "instances" },
        resourcePools: [ { name: "Analistas", quantity: random(2, 5) }, { name: "Gerentes", quantity: random(1, 2) } ]
      };
      this.setSimulationData(processRoot, simulationConfig);
    }

    elements.forEach(element => {
      let data = null;

      if (is(element, 'bpmn:StartEvent')) {
        data = {
          arrivalRate: { distribution: "fixed", unit: "minutes", value: random(5, 15) }
        };
      } else if (is(element, 'bpmn:Task')) {
        data = {
          processingTime: { distribution: "triangular", unit: "minutes", min: random(5, 10), mode: random(11, 20), max: random(21, 30) },
          resources: { pool: "Analistas", quantityRequired: 1 },
          cost: { type: "perHour", value: random(20, 50), currency: "USD" }
        };
      } else if (is(element, 'bpmn:ExclusiveGateway')) {
        const outgoing = element.outgoing;
        if (outgoing && outgoing.length > 1) {
          let remainingProbability = 1.0;
          outgoing.forEach((flow, index) => {
            let probability;
            if (index === outgoing.length - 1) {
              probability = remainingProbability;
            } else {
              probability = Math.random() * remainingProbability * 0.7; // ensure not all is taken by first
              remainingProbability -= probability;
            }
            this.setSimulationData(flow, { branchingProbability: parseFloat(probability.toFixed(2)) });
          });
        }
      }

      if (data) {
        this.setSimulationData(element, data);
      }
    });
  }

  setSimulationData(element, data) {
    const businessObject = element.businessObject;

    const simulationDataString = JSON.stringify(data, null, 2);

    const properties = this._bpmnFactory.create('camunda:Properties', {
      values: [
        this._bpmnFactory.create('camunda:Property', {
          name: 'simulationData',
          value: simulationDataString
        })
      ]
    });

    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) {
      extensionElements = this._bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    }

    // Remove existing simulationData property if it exists
    const existingValues = extensionElements.get('values').filter(v => {
        if (is(v, 'camunda:Properties')) {
            const properties = v.get('values').filter(p => p.name === 'simulationData');
            return properties.length === 0;
        }
        return true;
    });

    extensionElements.get('values').length = 0;
    Array.prototype.push.apply(extensionElements.get('values'), existingValues);

    extensionElements.get('values').push(properties);

    this._modeling.updateProperties(element, {
      extensionElements
    });
  }
}

RandomDataGenerator.$inject = [
  'elementRegistry',
  'modeling',
  'bpmnFactory',
  'editorActions'
];
