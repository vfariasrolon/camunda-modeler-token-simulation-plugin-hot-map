import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  find
} from 'min-dash';

/**
 * Genera datos de simulación aleatorios para un diagrama BPMN.
 */
export default class RandomDataGenerator {
  constructor(bpmnjs, elementRegistry, modeling, moddle) {
    this._bpmnjs = bpmnjs;
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._moddle = moddle;

    this._resourcePools = [{
      name: "Analistas",
      quantity: 3
    }, {
      name: "Gerentes",
      quantity: 1
    }, {
      name: "Sistemas",
      quantity: 2
    }];
  }

  /**
   * Genera y aplica datos aleatorios a todos los elementos compatibles del diagrama.
   */
  generateData() {
    const elements = this._elementRegistry.getAll();
    const updates = new Map();

    // 1. Generar datos para cada elemento
    for (const element of elements) {
      const randomData = this._generateDataForElement(element);
      if (randomData) {
        updates.set(element, randomData);
      }
    }

    // 2. Normalizar probabilidades de compuertas
    const gateways = elements.filter(e => is(e, 'bpmn:ExclusiveGateway') || is(e, 'bpmn:InclusiveGateway'));
    for (const gateway of gateways) {
        this._normalizeGatewayProbabilities(gateway, updates);
    }

    // 3. Aplicar los cambios al modelo
    for (const [element, data] of updates.entries()) {
      this._updateElementData(element, data);
    }

    console.log("Datos de simulación aleatorios generados y aplicados.");
  }

  _generateDataForElement(element) {
    if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant') && element.children.length > 0) {
      return {
        simulationConfig: {
          runUntil: "instances",
          runValue: 1000,
          runUnit: "instances"
        },
        resourcePools: this._resourcePools
      };
    }

    if (is(element, 'bpmn:StartEvent')) {
      return {
        arrivalRate: {
          distribution: "fixed",
          unit: "minutes",
          value: this._getRandomInt(5, 15)
        }
      };
    }

    if (is(element, 'bpmn:Task')) {
      const min = this._getRandomInt(5, 10);
      const mode = min + this._getRandomInt(5, 15);
      const max = mode + this._getRandomInt(5, 20);
      const resource = this._resourcePools[this._getRandomInt(0, this._resourcePools.length - 1)];

      return {
        processingTime: {
          distribution: "triangular",
          unit: "minutes",
          min: min,
          mode: mode,
          max: max
        },
        resources: {
          pool: resource.name,
          quantityRequired: 1
        },
        cost: {
          type: "perHour",
          value: this._getRandomInt(20, 60),
          currency: "USD"
        }
      };
    }

    if (is(element, 'bpmn:SequenceFlow') && (is(element.source, 'bpmn:ExclusiveGateway') || is(element.source, 'bpmn:InclusiveGateway'))) {
        return {
            branchingProbability: Math.random()
        };
    }

    return null;
  }

  _normalizeGatewayProbabilities(gateway, updates) {
    const outgoingFlows = gateway.outgoing.filter(flow => updates.has(flow));
    if (outgoingFlows.length === 0) return;

    const totalProbability = outgoingFlows.reduce((sum, flow) => {
        const data = updates.get(flow);
        return sum + (data.branchingProbability || 0);
    }, 0);

    if (totalProbability === 0) {
        // Asignar probabilidad equitativa si todas son 0
        for (const flow of outgoingFlows) {
            updates.get(flow).branchingProbability = 1 / outgoingFlows.length;
        }
        return;
    }

    // Normalizar para que la suma sea 1
    for (const flow of outgoingFlows) {
        const data = updates.get(flow);
        data.branchingProbability = data.branchingProbability / totalProbability;
    }
  }

  _updateElementData(element, data) {
    const businessObject = element.businessObject;
    let extensionElements = businessObject.extensionElements;

    if (!extensionElements) {
      extensionElements = this._moddle.create('bpmn:ExtensionElements');
    }

    let properties = find(extensionElements.get('values'), v => is(v, 'camunda:Properties'));

    if (!properties) {
      properties = this._moddle.create('camunda:Properties');
      extensionElements.get('values').push(properties);
    }

    let simDataProperty = find(properties.get('values'), p => p.name === 'simulationData');

    if (!simDataProperty) {
      simDataProperty = this._moddle.create('camunda:Property', {
        name: 'simulationData'
      });
      properties.get('values').push(simDataProperty);
    }

    simDataProperty.value = JSON.stringify(data, null, 2); // Pretty print JSON

    this._modeling.updateProperties(element, {
      extensionElements: extensionElements
    });
  }

  _getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

RandomDataGenerator.$inject = ['bpmnjs', 'elementRegistry', 'modeling', 'moddle'];
