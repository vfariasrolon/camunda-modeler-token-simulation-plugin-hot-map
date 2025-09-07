import {
  registerBpmnJSPlugin,
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';

import HideModelerElements from './HideModelerElements';
import Heatmap from './Heatmap';
import TimeTracker from './TimeTracker';
import SimulationController from './SimulationController';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationConfigReader from './SimulationConfigReader';

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

// Módulo principal de Simulación que agrupa la nueva lógica
const SimulationPluginModule = {
  __init__: [ 'simulationController' ],
  simulationController: [ 'type', SimulationController ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationConfigReader: [ 'type', SimulationConfigReader ]
};


// Register the BpmnJS modules
registerBpmnJSPlugin(TokenSimulationModule);
registerBpmnJSPlugin(HeatmapPluginModule);
registerBpmnJSPlugin(TimeTrackerPluginModule);
registerBpmnJSPlugin(SimulationPluginModule);
