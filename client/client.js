import {
  registerBpmnJSPlugin,
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';
import SimulationModule from './simulation';

import HideModelerElements from './HideModelerElements';
import Heatmap from './Heatmap';
import TimeTracker from './TimeTracker';

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

// Register the BpmnJS modules
registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(HeatmapPluginModule);
registerBpmnJSPlugin(TimeTrackerPluginModule);
registerBpmnJSPlugin(SimulationModule);
