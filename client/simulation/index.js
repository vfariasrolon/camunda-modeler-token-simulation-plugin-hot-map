import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import RandomDataGenerator from './RandomDataGenerator';
import SimulationEngine from './SimulationEngine';
import ChartPanel from './ChartPanel';
import DataTablePanel from './DataTablePanel';
import MatrixLoader from './MatrixLoader';

export default {
  __init__: [
    'simulationController',
    'simulationPalette',
    'randomDataGenerator',
    'chartPanel',
    'dataTablePanel',
    'matrixLoader'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  randomDataGenerator: [ 'type', RandomDataGenerator ],
  simulationEngine: [ 'type', SimulationEngine ],
  chartPanel: [ 'type', ChartPanel ],
  // Se registra en este modulo (y no en el del editor) porque
  // SimulationController lo inyecta: didi instancia los modulos en orden de
  // __init__, y el modulo del editor se registra despues, por lo que la
  // inyeccion fallaria si estuviera alli.
  dataTablePanel: [ 'type', DataTablePanel ],
  matrixLoader: [ 'type', MatrixLoader ]
};
