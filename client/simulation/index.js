import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationEngine from './SimulationEngine';
import ChartPanel from './ChartPanel';
import DataPanel from './DataPanel';

export default {
  __init__: [
    'simulationController',
    'simulationPalette',
    'randomDataGenerator',
    'chartPanel',
    'dataPanel'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationEngine: [ 'type', SimulationEngine ],
  chartPanel: [ 'type', ChartPanel ],
  dataPanel: [ 'type', DataPanel ]
};
