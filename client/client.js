import {
  registerBpmnJSPlugin,
  registerBpmnJSModdleExtension
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';

// properties-panel
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
} from 'bpmn-js-properties-panel';

import HeatmapExtension from '../resources/heatmap-extension.json';
import HideModelerElements from './HideModelerElements';
import Heatmap from './Heatmap';
import TimeTracker from './TimeTracker';
import HeatmapData from './HeatmapData';
import HeatmapPropertiesProviderModule from './properties-panel';

const TokenSimulationPluginModule = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', HideModelerElements ]
};

const HeatmapPluginModule = {
  __init__: [ 'heatmap' ],
  heatmap: [ 'type', Heatmap ]
};

const TimeTrackerPluginModule = {
  __init__: [ 'timeTracker' ],
  timeTracker: [ 'type', TimeTracker ]
};

const HeatmapDataPluginModule = {
  __init__: [ 'heatmapData' ],
  heatmapData: [ 'type', HeatmapData ]
};

// Register the BpmnJS Moddle Extension
registerBpmnJSModdleExtension(HeatmapExtension);

// Register the BpmnJS modules
registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(TokenSimulationPluginModule);
registerBpmnJSPlugin(HeatmapPluginModule);
registerBpmnJSPlugin(TimeTrackerPluginModule);
registerBpmnJSPlugin(HeatmapDataPluginModule);
registerBpmnJSPlugin(BpmnPropertiesPanelModule);
registerBpmnJSPlugin(HeatmapPropertiesProviderModule);
