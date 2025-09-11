import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData } from './util';

const random = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);
const timeUnits = ['seconds', 'minutes', 'hours'];
const getRandomTimeUnit = () => timeUnits[random(0, timeUnits.length - 1)];

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
    console.log("--- INICIANDO GENERADOR DE DATOS ALEATORIOS ---");

    const allElements = [];
    const rootElement = this._canvas.getRootElement();

    if (is(rootElement, 'bpmn:Collaboration')) {
        console.log("Detectado diagrama de colaboración.");
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
        console.log("Detectado diagrama de proceso simple.");
        rootElement.children.forEach(child => allElements.push(child));
        allElements.push(rootElement);
    }
    console.log(`Encontrados ${allElements.length} elementos para procesar.`);

    const processRoot = allElements.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
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

      if (is(element, 'bpmn:StartEvent')) {
        data = { arrivalRate: { distribution: "fixed", unit: getRandomTimeUnit(), value: random(5, 15) } };
      } else if (is(element, 'bpmn:Task')) {
        data = {
          processingTime: { distribution: "triangular", unit: getRandomTimeUnit(), min: random(2, 20), mode: random(15, 40), max: random(40, 90) },
          resources: { pool: "Analistas", quantityRequired: random(1, 2) },
          cost: { type: "perHour", value: random(10, 100), currency: "USD" },
          failureRate: parseFloat((Math.random() * 0.29 + 0.01).toFixed(2)),
          reworkTime: { distribution: "fixed", unit: getRandomTimeUnit(), value: random(10, 120) }
        };
      } else if (is(element, 'bpmn:ExclusiveGateway') && element.outgoing.length > 1) {
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
    const currentSimData = getSimulationData(element) || {};
    const newData = { ...currentSimData, ...existingData };
    const simulationDataString = JSON.stringify(newData, null, 2);
    console.log(" -> Datos a guardar:", newData);

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
