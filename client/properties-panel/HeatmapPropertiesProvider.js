import { is } from 'bpmn-js/lib/util/ModelUtil';
import HeatmapProps from './parts/HeatmapProps';

const LOW_PRIORITY = 500;

/**
 * A provider for heatmap properties.
 */
export default function HeatmapPropertiesProvider(propertiesPanel, translate) {

  this.getTabs = function(element) {

    const generalTab = propertiesPanel.getTab('general');

    if (generalTab) {
      const groups = generalTab.groups;

      if (is(element, 'bpmn:Task') || is(element, 'bpmn:CallActivity')) {
        groups.push(createHeatmapGroup(element, translate));
      }
    }

    return [
      generalTab
    ];
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

HeatmapPropertiesProvider.$inject = [ 'propertiesPanel', 'translate' ];

function createHeatmapGroup(element, translate) {

  const heatmapGroup = {
    id: 'heatmap',
    label: translate('Heatmap'),
    entries: HeatmapProps({ element })
  };

  return heatmapGroup;
}
