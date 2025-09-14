import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData, formatMilliseconds } from './util';

const RunIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <path d="M 4 2 L 4 14 L 14 8 Z" fill="currentColor" />
    </svg>
  </span>
`;

const ShowIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80">
      <circle r="39"/>
      <path fill="#fff" d="M0,38a38,38 0 0 1 0,-76a19,19 0 0 1 0,38a19,19 0 0 0 0,38"/>
      <circle r="5" cy="19" fill="#fff"/>
      <circle r="5" cy="-19"/>
    </svg>
  </span>
`;

const ChartIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" />
    </svg>
  </span>
`;

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
    const runButton = domify(`<div class="bts-entry" title="Ejecutar Simulación">${RunIcon}</div>`);
    const showButton = domify(`<div class="bts-entry" title="Mostrar Análisis">${ShowIcon}</div>`);
    const chartButton = domify(`<div class="bts-entry" title="Mostrar Gráficos">${ChartIcon}</div>`);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());
    domEvent.bind(chartButton, 'click', () => this._chartPanel.toggle());

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);
    this._tokenSimulationPalette.addEntry(chartButton, 14);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));

    this._eventBus.on('simulation.charts.opened', () => this.showChart());
    this._eventBus.on('simulation.charts.typeChanged', (e) => this.showChart());

    // Hide estimation chart option by default
    const estimationOption = this._chartPanel.getContainer().querySelector('[data-production="true"]');
    if (estimationOption) {
      estimationOption.style.display = 'none';
    }
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
