import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationEngine from './SimulationEngine';
import PropertiesPanel from './PropertiesPanel';
import SimulationPaletteProvider from './SimulationPaletteProvider';

export default {
  __init__: [
    'simulationController',
    'randomDataGenerator',
    'propertiesPanel',
    'simulationPaletteProvider'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationEngine: [ 'type', SimulationEngine ],
  propertiesPanel: [ 'type', PropertiesPanel ],
  simulationPaletteProvider: [ 'type', SimulationPaletteProvider ]
};
