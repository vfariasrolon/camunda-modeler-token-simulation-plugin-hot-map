import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationEngine from './SimulationEngine';
import ChartPanel from './ChartPanel';

export default {
  __init__: [
    'simulationController',
    'simulationPalette',
    'randomDataGenerator',
    'chartPanel'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationEngine: [ 'type', SimulationEngine ],
  chartPanel: [ 'type', ChartPanel ]
};
