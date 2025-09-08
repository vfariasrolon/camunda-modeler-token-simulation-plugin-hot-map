import {
  registerBpmnJSPlugin
} from 'camunda-modeler-plugin-helpers';

import TokenSimulationModule from 'bpmn-js-token-simulation';

import Heatmap from './Heatmap';
import SimulationController from './SimulationController';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationConfigReader from './SimulationConfigReader';

// All our custom functionality is bundled into this single module.
// This ensures that all components can be injected into each other.
const HeatmapSimulationModule = {
  __init__: [
    'heatmap', // Initializes the heatmap buttons in the palette
    'simulationController'
  ],
  heatmap: [ 'type', Heatmap ],
  simulationController: [ 'type', SimulationController ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationConfigReader: [ 'type', SimulationConfigReader ]
};

// Register the original token simulation module first
registerBpmnJSPlugin(TokenSimulationModule);

// Register our heatmap simulation module
registerBpmnJSPlugin(HeatmapSimulationModule);
