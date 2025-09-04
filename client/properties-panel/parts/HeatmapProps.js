import {
  TextFieldEntry
} from '@bpmn-io/properties-panel';

import {
  useService
} from 'bpmn-js-properties-panel';

import {
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

import {
  find,
  get as _get
} from 'min-dash';


export default function HeatmapProps(props) {
  const {
    element
  } = props;

  return [
    {
      id: 'tiempoSimulacion',
      component: TiempoSimulacion,
      isEdited: (node) => {
        // This is a simplified check. A more robust check might be needed
        // depending on the properties panel version.
        return node.value !== undefined;
      }
    }
  ];
}

function TiempoSimulacion(props) {
  const { element } = props;
  const modeling = useService('modeling');
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const commandStack = useService('commandStack');
  const moddle = useService('bpmnjs').get('moddle');

  const getValue = () => {
    const businessObject = getBusinessObject(element);
    const extensionElements = businessObject.get('extensionElements');

    if (!extensionElements) {
      return '';
    }

    const heatmapData = find(extensionElements.get('values'), function(value) {
      return value.$type === 'heatmap:Data';
    });

    return _get(heatmapData, [ 'tiempoSimulacion' ], '');
  };

  const setValue = (value) => {
    const businessObject = getBusinessObject(element);
    let extensionElements = businessObject.get('extensionElements');

    // (1) ensure extension elements exists
    if (!extensionElements) {
      extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
      modeling.updateProperties(element, { extensionElements });

      // refetch business object
      extensionElements = getBusinessObject(element).get('extensionElements');
    }

    // (2) ensure heatmap:Data exists
    let heatmapData = find(extensionElements.get('values'), function(value) {
      return value.$type === 'heatmap:Data';
    });

    if (!heatmapData) {
      heatmapData = moddle.create('heatmap:Data');
      modeling.updateModdleProperties(element, extensionElements, {
        values: [ ...extensionElements.get('values'), heatmapData ]
      });
    }

    // (3) set property
    modeling.updateModdleProperties(element, heatmapData, {
      tiempoSimulacion: value
    });
  };

  return TextFieldEntry({
    element,
    id: 'tiempoSimulacion',
    label: translate('Tiempo de Simulación (ms)'),
    getValue,
    setValue,
    debounce
  });
}
