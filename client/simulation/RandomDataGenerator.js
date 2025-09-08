import { is } from 'bpmn-js/lib/util/ModelUtil';

const random = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

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
    const allElements = [];
    const rootElement = this._canvas.getRootElement();

    if (is(rootElement, 'bpmn:Collaboration')) {
        rootElement.children.forEach(participant => {
            if (is(participant, 'bpmn:Participant')) {
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
    } else if (is(rootElement, 'bpmn:Process')) {
        rootElement.children.forEach(child => allElements.push(child));
        allElements.push(rootElement);
    }


    // Add general process info to the first process or participant
    const processRoot = allElements.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    if (processRoot) {
      const simulationConfig = {
        simulationConfig: { runUntil: "instances", runValue: 1000, runUnit: "instances" },
        resourcePools: [ { name: "Analistas", quantity: random(2, 5) }, { name: "Gerentes", quantity: random(1, 2) } ]
      };
      this.setSimulationData(processRoot, simulationConfig);
    }

    allElements.forEach(element => {
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
              probability = Math.random() * remainingProbability * 0.7;
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

    let extensionElements = businessObject.get('extensionElements');
    if (!extensionElements) {
      extensionElements = this._bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    }

    let properties = extensionElements.get('values').find(v => is(v, 'camunda:Properties'));
    if (!properties) {
      properties = this._bpmnFactory.create('camunda:Properties', { values: [] });
      extensionElements.get('values').push(properties);
    }

    const existingProperty = properties.get('values').find(p => p.name === 'simulationData');
    if (existingProperty) {
        const index = properties.get('values').indexOf(existingProperty);
        properties.get('values').splice(index, 1);
    }

    const newProperty = this._bpmnFactory.create('camunda:Property', {
        name: 'simulationData',
        value: simulationDataString
    });

    properties.get('values').push(newProperty);

    this._modeling.updateProperties(element, {
      extensionElements
    });
  }
}

RandomDataGenerator.$inject = [
  'elementRegistry',
  'modeling',
  'bpmnFactory',
  'editorActions',
  'canvas'
];
