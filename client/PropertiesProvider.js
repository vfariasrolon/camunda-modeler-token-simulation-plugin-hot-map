import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';

import {
  TextFieldEntry,
  isTextFieldEntryEdited
} from '@bpmn-io/properties-panel';

import { h as createElement } from 'preact';

const LOW_PRIORITY = 500;

export default function PropertiesProvider(propertiesPanel, translate, modeling, moddle, debounceInput) {

  this.getGroups = function(element) {
    return function(groups) {
      if (is(element, 'bpmn:Task') || is(element, 'bpmn:CallActivity')) {
        groups.push(createHeatmapGroup(element, translate, modeling, moddle, debounceInput));
      }
      return groups;
    };
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

PropertiesProvider.$inject = [
  'propertiesPanel',
  'translate',
  'modeling',
  'moddle',
  'debounceInput'
];

function createHeatmapGroup(element, translate, modeling, moddle, debounce) {
  const heatmapGroup = {
    id: 'heatmap',
    label: translate('Heatmap'),
    entries: []
  };

  heatmapGroup.entries.push({
    id: 'heatmap-tiempo-simulacion',
    element,
    component: TiempoSimulacion,
    isEdited: isTextFieldEntryEdited,
    moddle: moddle,
    modeling: modeling,
    debounce: debounce,
    translate: translate
  });

  return heatmapGroup;
}

function TiempoSimulacion(props) {
  const { element, id, moddle, modeling, debounce, translate } = props;

  const getHeatmapData = (element) => {
    const businessObject = getBusinessObject(element);
    const extensionElements = businessObject.get('extensionElements');
    if (extensionElements && extensionElements.get('values')) {
      return extensionElements.get('values').find(v => v.$type === 'heatmap:Data');
    }
    return null;
  };

  const getValue = () => {
    const heatmapData = getHeatmapData(element);
    return heatmapData ? heatmapData.get('tiempoSimulacion') : '';
  };

  const setValue = value => {
    const businessObject = getBusinessObject(element);
    let extensionElements = businessObject.get('extensionElements');

    if (!extensionElements) {
      extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
      modeling.updateProperties(element, { extensionElements: extensionElements });
      extensionElements = getBusinessObject(element).get('extensionElements');
    }

    let heatmapData = getHeatmapData(element);

    if (!heatmapData) {
      heatmapData = moddle.create('heatmap:Data');
      modeling.updateModdleProperties(element, extensionElements, {
        values: [...(extensionElements.get('values') || []), heatmapData]
      });
      heatmapData = getHeatmapData(getBusinessObject(element));
    }

    modeling.updateModdleProperties(element, heatmapData, {
      tiempoSimulacion: value
    });
  };

  return <TextFieldEntry
    id={ id }
    element={ element }
    description={ translate('Simulation time in milliseconds') }
    label={ translate('Simulation Time (ms)') }
    getValue={ getValue }
    setValue={ setValue }
    debounce={ debounce }
  />;
}
