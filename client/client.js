import {
  registerBpmnJSPlugin,
  registerBpmnJSModdleExtension
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';
import HeatmapExtension from '../resources/heatmap-extension.json';
import HideModelerElements from './HideModelerElements';
import HeatmapModule from './Heatmap';
import TimeTracker from './TimeTracker';
import HeatmapData from './HeatmapData';

// Note: We register the HeatmapModule as a separate plugin
// to ensure it loads correctly, based on our debugging.
// The HeatmapModule itself will no longer depend on the token simulation
// but will provide its own palette button.
const TokenSimulationPluginModule = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', HideModelerElements ]
};

const HeatmapPluginModule = {
  __init__: [ 'heatmap' ],
  heatmap: [ 'type', HeatmapModule ]
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
