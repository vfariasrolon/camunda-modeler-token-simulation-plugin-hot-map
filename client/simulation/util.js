import { is } from 'bpmn-js/lib/util/ModelUtil';

/**
 * Indica si un elemento del registro es una ETIQUETA (un texto).
 *
 * En bpmn-js cada texto es un elemento propio del registro y COMPARTE el
 * businessObject de su figura. Como `is()` mira el businessObject y no el tipo
 * del elemento, comprobaciones como is(etiquetaDeTarea, 'bpmn:Task') devuelven
 * true. Sin descartarlas, cualquier filtro por tipo incluye los textos: aparecen
 * manchas sobre ellos, filas duplicadas en tablas y etiquetas de datos de mas.
 *
 * Usar SIEMPRE antes de comprobar el tipo de un elemento del registro.
 */
export const isLabel = (element) =>
  Boolean(element && (element.labelTarget || element.type === 'label'));

export const getExtensionProperty = (element, name) => {
  if (!element || !element.businessObject) return null;
  const bo = element.businessObject;
  if (!bo.extensionElements || !bo.extensionElements.values) {
    return null;
  }
  const props = bo.extensionElements.values.find(v => is(v, 'camunda:Properties'));
  if (!props || !props.values) {
    return null;
  }
  const prop = props.values.find(p => p.name === name);
  return prop ? prop.value : null;
};

export const getSimulationData = (element) => {
  const dataString = getExtensionProperty(element, 'simulationData');
  if (!dataString) return null;
  try {
    return JSON.parse(dataString);
  } catch (e) {
    console.error(`Error parsing simulationData for element ${element.id}`, e);
    return null;
  }
};

/**
 * Escribe simulationData en un elemento, creando la jerarquia de extension
 * elements si no existe:
 *   bpmn:ExtensionElements > camunda:Properties > camunda:Property(name=simulationData)
 *
 * El valor se guarda como string JSON, que es el formato que leen
 * getSimulationData() y el motor de simulacion.
 *
 * @param {Object} element            elemento de bpmn-js
 * @param {Object} data               objeto de datos de simulacion
 * @param {Object} services           { modeling, bpmnFactory }
 */
export const setSimulationData = (element, data, services) => {
  const { modeling, bpmnFactory } = services;
  const businessObject = element.businessObject;

  let extensionElements = businessObject.get('extensionElements');
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
  }

  let properties = extensionElements.get('values').find(v => v.$type === 'camunda:Properties');
  if (!properties) {
    properties = bpmnFactory.create('camunda:Properties', { values: [] });
    extensionElements.get('values').push(properties);
  }

  let simProperty = properties.get('values').find(p => p.name === 'simulationData');
  if (!simProperty) {
    simProperty = bpmnFactory.create('camunda:Property', { name: 'simulationData' });
    properties.get('values').push(simProperty);
  }

  simProperty.value = JSON.stringify(data, null, 2);

  modeling.updateProperties(element, { extensionElements });
};

export const formatMilliseconds = (ms) => {
  if (ms === 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
};

/**
 * Formatea una cantidad de MINUTOS.
 *
 * Hace falta porque no todos los campos del motor estan en milisegundos.
 * `totalWaitTime` y `totalCycleTime` se acumulan con
 * calculateBusinessDurationInMinutes(), que cuenta minutos, mientras que
 * totalProcessingTime, totalOvertime y totalReworkTime si estan en milisegundos.
 *
 * Usar formatMilliseconds() sobre los dos primeros los mostraba 60.000 veces
 * menores: una espera de 480 minutos aparecia como "0.5s" en lugar de "8.0h".
 */
export const formatMinutes = (minutes) => {
  if (!minutes) return '0s';
  const totalMinutes = minutes;
  if (totalMinutes < 1) return `${(totalMinutes * 60).toFixed(0)}s`;
  if (totalMinutes < 60) return `${totalMinutes.toFixed(1)}m`;
  const hours = totalMinutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

export const formatCurrency = (amount, currency = 'MXN') => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};
