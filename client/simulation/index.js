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
    'simulationPaletteProvider', // The provider initializes the properties panel
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationEngine: [ 'type', SimulationEngine ],
  propertiesPanel: [ 'type', PropertiesPanel ],
  simulationPaletteProvider: [ 'type', SimulationPaletteProvider ]
};
