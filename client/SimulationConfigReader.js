import {
  find
} from 'min-dash';

import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

/**
 * Lee y procesa la configuración de simulación desde las propiedades
 * de extensión de los elementos BPMN.
 */
export default class SimulationConfigReader {
  constructor(elementRegistry) {
    this._elementRegistry = elementRegistry;
  }

  /**
   * Extrae la propiedad 'simulationData' en formato JSON de un elemento.
   * @param {djs.model.Base} element - El elemento del diagrama.
   * @returns {Object|null} - El objeto de configuración parseado o null si no se encuentra/es inválido.
   */
  _getSimulationData(element) {
    const businessObject = element.businessObject;

    if (!businessObject.extensionElements || !businessObject.extensionElements.values) {
      return null;
    }

    const properties = find(businessObject.extensionElements.values, v => is(v, 'camunda:Properties'));

    if (!properties || !properties.values) {
      return null;
    }

    const simDataProperty = find(properties.values, p => p.name === 'simulationData');

    if (!simDataProperty || !simDataProperty.value) {
      return null;
    }

    try {
      // Intenta parsear el valor de la propiedad, que debe ser un string JSON.
      return JSON.parse(simDataProperty.value);
    } catch (error) {
      console.error(`Error al parsear JSON de simulationData para el elemento ${element.id}:`, error);
      // Opcional: notificar al usuario sobre el JSON mal formado.
      return null;
    }
  }

  /**
   * Lee la configuración de todos los elementos y la del proceso global.
   * @returns {{global: Object, elements: Map<string, Object>}}
   */
  readAll() {
    const allElements = this._elementRegistry.getAll();
    const config = {
      global: {},
      elements: new Map()
    };

    for (const element of allElements) {
      // La configuración global se define en el elemento Proceso o Participante (Pool)
      if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant')) {
        const globalData = this._getSimulationData(element);
        if (globalData && globalData.simulationConfig) {
          config.global = {
            ...config.global,
            ...globalData
          };
        }
      }

      // Lee la configuración de cualquier elemento que la tenga
      const elementData = this._getSimulationData(element);
      if (elementData) {
        // No sobreescribir la configuración global que ya procesamos
        const { simulationConfig, resourcePools, ...restData } = elementData;

        if (Object.keys(restData).length > 0) {
            config.elements.set(element.id, restData);
        }
      }
    }

    return config;
  }
}

SimulationConfigReader.$inject = ['elementRegistry'];
