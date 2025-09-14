import {
  registerBpmnJSPlugin,
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';

import HideModelerElements from './HideModelerElements';
import SimulationAnalysisModule from './simulation';
import DataEditorModule from './editor';

import './simulation/simulation.css';

const TokenSimulationPluginModule = {
  __init__: [ 'hideModelerElements' ],
  hideModelerElements: [ 'type', HideModelerElements ]
};

// Register the BpmnJS modules
registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(SimulationAnalysisModule);
registerBpmnJSPlugin(DataEditorModule);
