import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import SimulationEngine from './SimulationEngine';
import ChartPanel from './ChartPanel';
import DataTablePanel from './DataTablePanel';
import MatrixLoader from './MatrixLoader';

export default {
  __init__: [
    'simulationController',
    'simulationPalette',
    'chartPanel',
    'dataTablePanel',
    'matrixLoader'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  simulationEngine: [ 'type', SimulationEngine ],
  chartPanel: [ 'type', ChartPanel ],
  // El editor por tabla vive en este modulo (y no en uno propio) porque
  // SimulationController lo inyecta: didi instancia los modulos en orden de
  // __init__, y un modulo registrado despues no estaria disponible.
  dataTablePanel: [ 'type', DataTablePanel ],
  matrixLoader: [ 'type', MatrixLoader ]
};
