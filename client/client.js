import {
  registerBpmnJSPlugin,
} from 'camunda-modeler-plugin-helpers';

// new css import
import './simulation/simulation.css';

import TokenSimulationModule from 'bpmn-js-token-simulation';

import HideModelerElements from './HideModelerElements';
import TimeTracker from './TimeTracker';
import SimulationAnalysisModule from './simulation';

const TokenSimulationPluginModule = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', HideModelerElements ]
};

const TimeTrackerPluginModule = {
  __init__: [ 'timeTracker' ],
  timeTracker: [ 'type', TimeTracker ]
};

// Register the BpmnJS modules
registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(TimeTrackerPluginModule);
registerBpmnJSPlugin(SimulationAnalysisModule);
