import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationEngine from './SimulationEngine';

export default {
  __init__: [
    'simulationController',
    'simulationPalette',
    'randomDataGenerator'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationEngine: [ 'type', SimulationEngine ]
};
