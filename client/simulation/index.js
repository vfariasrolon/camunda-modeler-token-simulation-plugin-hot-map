import SimulationController from './SimulationController';
import SimulationPalette from './SimulationPalette';
import SimulationEngine from './SimulationEngine';
import ChartPanel from './ChartPanel';
import DataTablePanel from './DataTablePanel';
import MatrixLoader from './MatrixLoader';
import ReportPanel from './ReportPanel';
import DataAuditPanel from './DataAuditPanel';

export default {
  __init__: [
    'simulationController',
    'simulationPalette',
    'chartPanel',
    'dataTablePanel',
    'matrixLoader',
    // DESPUES de simulationController: lo inyecta para leer los informes de la
    // corrida, y didi instancia los modulos en orden de __init__.
    'reportPanel',
    'dataAuditPanel'
  ],
  simulationController: [ 'type', SimulationController ],
  simulationPalette: [ 'type', SimulationPalette ],
  simulationEngine: [ 'type', SimulationEngine ],
  chartPanel: [ 'type', ChartPanel ],
  // El editor por tabla vive en este modulo (y no en uno propio) porque
  // SimulationController lo inyecta: didi instancia los modulos en orden de
  // __init__, y un modulo registrado despues no estaria disponible.
  dataTablePanel: [ 'type', DataTablePanel ],
  matrixLoader: [ 'type', MatrixLoader ],
  reportPanel: [ 'type', ReportPanel ],
  // No lo inyecta nadie: se comunica por eventos, igual que el informe.
  dataAuditPanel: [ 'type', DataAuditPanel ]
};
