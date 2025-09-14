import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData, formatMilliseconds } from './util';

const RunIcon = `...`; // (content omitted for brevity)
const ShowIcon = `...`;
const ChartIcon = `...`;

export default class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays, tokenSimulationPalette, notifications, chartPanel) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._simulationEngine = simulationEngine;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;
    this._chartPanel = chartPanel;

    this._heatmap = null;
    this._chart = null;
    this._radius = 20;
    this._blur = 10;
    this.simulationResults = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    // ... (init logic is the same)
  }

  runSimulation() {
    this.clear();
    this.simulationResults = this._simulationEngine.run();
    this._notifications.showNotification({ text: 'Simulación completada', type: 'info', duration: 3000 });

    const estimationOption = this._chartPanel.getContainer().querySelector('[data-production="true"]');
    if (estimationOption) {
      estimationOption.style.display = this._simulationEngine.workCalendar ? '' : 'none';
    }
  }

  // ... (adjustHeatmap, showMetric, showOverlays are the same)

  showChart() {
    const metric = this._chartPanel.getChartType();

    if (metric === 'estimations') {
      const tableHtml = this.createEstimationsTable();
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    // ... (rest of showChart logic is the same)
  }

  createEstimationsTable() {
    if (!this.simulationResults || !this._simulationEngine.workCalendar) {
      return '<p style="text-align: center; margin-top: 20px;">No hay estimaciones de producción disponibles. Ejecute una simulación en modo de producción primero.</p>';
    }

    const rootElementId = this._simulationEngine.rootElementId;
    const rootResults = this.simulationResults.get(rootElementId);

    if (!rootResults) {
      return '<p style="text-align: center; margin-top: 20px;">No se encontraron resultados para el elemento raíz.</p>';
    }

    const completionDate = rootResults.estimatedCompletionDate
      ? rootResults.estimatedCompletionDate.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' })
      : 'N/A';
    const totalOvertime = rootResults.totalOvertime
      ? formatMilliseconds(rootResults.totalOvertime)
      : '0s';

    return `
      <h4 class="sim-results-header">Estimaciones de Producción</h4>
      <table class="sim-results-table summary-table">
        <thead>
          <tr>
            <th>Fecha de Finalización Estimada</th>
            <th>Horas Extras Totales Requeridas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${completionDate}</td>
            <td>${totalOvertime}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  // ... (getChartConfig, getInputParametersData, createInputParametersTable, createResultsTable, getChartData, clear, etc. are the same, but with all productionScurve logic removed)
}

SimulationController.$inject = [
  'canvas',
  'eventBus',
  'simulationPalette',
  'simulationEngine',
  'elementRegistry',
  'overlays',
  'tokenSimulationPalette',
  'notifications',
  'chartPanel'
];
