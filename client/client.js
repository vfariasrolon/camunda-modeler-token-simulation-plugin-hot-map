import {
  registerBpmnJSPlugin,
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';

// All our custom modules
import Heatmap from './Heatmap';
import SimulationController from './SimulationController';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationConfigReader from './SimulationConfigReader';
import SimulationPalette from './SimulationPalette';
import SimulationModeToggle from './SimulationModeToggle';

// Unify all simulation analysis components into a single module
// This ensures they can be injected into each other correctly.
const SimulationAnalysisModule = {
  __init__: [
    'heatmap',
    'simulationController',
    'simulationPalette',
    'simulationModeToggle'
  ],
  heatmap: [ 'type', Heatmap ],
  simulationController: [ 'type', SimulationController ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationConfigReader: [ 'type', SimulationConfigReader ],
  simulationPalette: [ 'type', SimulationPalette ],
  simulationModeToggle: [ 'type', SimulationModeToggle ]
};

// Register the original token simulation module
registerBpmnJSPlugin(TokenSimulationModule);

// Register our new, unified simulation analysis module
registerBpmnJSPlugin(SimulationAnalysisModule);
