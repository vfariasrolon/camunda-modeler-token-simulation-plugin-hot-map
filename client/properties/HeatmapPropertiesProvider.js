import { getBusinessObject, isAny, is } from 'bpmn-js/lib/util/ModelUtil';
import { TextFieldEntry, isTextFieldEntryEdited } from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';
import { find } from 'min-dash';

const LOW_PRIORITY = 500;
const HEATMAP_DATA_TYPE = 'heatmap:Data';

/**
 * The component that renders the simulation time input field.
 */
function SimulationTimeComponent(props) {
  const { element } = props;

  // Hooks must be called at the top level of the component.
  const modeling = useService('modeling');
  const moddle = useService('moddle');
  const translate = useService('translate');
  const debounce = useService('debounceInput');
  const toggleMode = useService('toggleMode', true); // true -> optional service

  const getValue = () => {
    const businessObject = getBusinessObject(element);
    const extensionElements = businessObject.get('extensionElements');

    if (extensionElements) {
      const heatmapData = find(extensionElements.get('values'), v => is(v, HEATMAP_DATA_TYPE));
      if (heatmapData && heatmapData.get('tiempoSimulacion')) {
        const timeInMs = parseInt(heatmapData.get('tiempoSimulacion'), 10);
        // Convert milliseconds from model to seconds for display
        return isNaN(timeInMs) ? '' : timeInMs / 1000;
      }
    }
    return '';
  };

  const setValue = (value) => {
    // Guard against writing when simulation is active
    if (toggleMode && toggleMode.active) {
      console.warn('[Heatmap] Cannot set property while simulation is active.');
      return;
    }

    const businessObject = getBusinessObject(element);
    let extensionElements = businessObject.get('extensionElements');
    let heatmapData;

    // Ensure extensionElements exists
    if (!extensionElements) {
      extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] });
      modeling.updateProperties(element, { extensionElements });
      // We need to get the business object again to get the live extensionElements
      extensionElements = getBusinessObject(element).get('extensionElements');
    }

    heatmapData = find(extensionElements.get('values'), v => is(v, HEATMAP_DATA_TYPE));

    // Ensure heatmap:Data exists
    if (!heatmapData) {
      heatmapData = moddle.create(HEATMAP_DATA_TYPE);
      modeling.updateModdleProperties(element, extensionElements, {
        values: [...extensionElements.get('values'), heatmapData]
      });
      // We need to get the live moddle element after update
      heatmapData = find(getBusinessObject(element).get('extensionElements').get('values'), v => is(v, HEATMAP_DATA_TYPE));
    }

    const timeInSeconds = value ? parseFloat(value) : undefined;
    const timeInMs = timeInSeconds !== undefined ? String(Math.round(timeInSeconds * 1000)) : undefined;

    modeling.updateModdleProperties(element, heatmapData, {
      tiempoSimulacion: timeInMs
    });
  };

  const validate = (value) => {
    if (value && isNaN(parseFloat(value))) {
      return translate('Debe ser un número.');
    }
    if (value && parseFloat(value) < 0) {
      return translate('No puede ser un valor negativo.');
    }
    return null;
  };

  return TextFieldEntry({
    element,
    id: 'tiempoSimulacion',
    label: translate('Tiempo de Simulación (segundos)'),
    getValue,
    setValue,
    debounce,
    validate
  });
}

// --- Properties Provider ---

function HeatmapPropertiesGroup(element, translate) {

  const entries = [
    {
      id: 'simulation-time',
      component: SimulationTimeComponent,
      isEdited: isTextFieldEntryEdited
    }
  ];

  return {
    id: 'heatmap-properties',
    label: translate('Propiedades de Simulación'),
    entries
  };
}

export default function HeatmapPropertiesProvider(propertiesPanel, translate) {

  this.getTabs = function(element) {

    const isHeatmapElement = isAny(element, [
      'bpmn:Task',
      'bpmn:CallActivity',
      'bpmn:StartEvent',
      'bpmn:EndEvent',
      'bpmn:ExclusiveGateway',
      'bpmn:ParallelGateway',
      'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway',
      'bpmn:IntermediateCatchEvent',
      'bpmn:SubProcess'
    ]);

    if (!isHeatmapElement) {
      return [];
    }

    const simulationGroup = HeatmapPropertiesGroup(element, translate);

    const simulationTab = {
      id: 'simulation',
      label: translate('Simulación'),
      groups: [ simulationGroup ]
    };

    return [
      simulationTab
    ];
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

HeatmapPropertiesProvider.$inject = [ 'propertiesPanel', 'translate' ];
