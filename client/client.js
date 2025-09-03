import {
  registerBpmnJSPlugin
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';
import HideModelerElements from './HideModelerElements';
import HeatmapModule from './Heatmap';

const TokenSimulationPluginModule = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', HideModelerElements ]
};

const HeatmapPluginModule = {
  __init__: [ 'heatmap' ],
  heatmap: [ 'type', HeatmapModule ]
};

registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(TokenSimulationPluginModule);
registerBpmnJSPlugin(HeatmapPluginModule);
