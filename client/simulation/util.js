import { is } from 'bpmn-js/lib/util/ModelUtil';

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
