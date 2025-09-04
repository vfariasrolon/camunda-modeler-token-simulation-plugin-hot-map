import {
  registerBpmnJSPlugin,
  registerBpmnJSModdleExtension
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';

import HeatmapExtension from '../resources/heatmap-extension.json';
import HideModelerElements from './HideModelerElements';
import Heatmap from './Heatmap';
import TimeTracker from './TimeTracker';
import HeatmapData from './HeatmapData';
import HeatmapPropertiesProvider from './properties/HeatmapPropertiesProvider';

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

const HeatmapPropertiesModule = {
  __init__: [ 'heatmapPropertiesProvider' ],
  heatmapPropertiesProvider: [ 'type', HeatmapPropertiesProvider ]
};

// Register the BpmnJS Moddle Extension
registerBpmnJSModdleExtension(HeatmapExtension);

// Register the BpmnJS modules
registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(TokenSimulationPluginModule);
registerBpmnJSPlugin(HeatmapPluginModule);
registerBpmnJSPlugin(TimeTrackerPluginModule);
registerBpmnJSPlugin(HeatmapDataPluginModule);
registerBpmnJSPlugin(HeatmapPropertiesModule);
