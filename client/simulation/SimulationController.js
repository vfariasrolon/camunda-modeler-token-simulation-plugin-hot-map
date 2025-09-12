import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, formatMilliseconds } from './util';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';

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

const DataIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M9,5V9H21V5M9,19H21V15H9M9,14H21V10H9M4,9H8V5H4M4,19H8V15H4M4,14H8V10H4V14Z" />
    </svg>
  </span>
`;

export default class SimulationController {
  constructor(eventBus, simulationEngine, tokenSimulationPalette, notifications, simulationPalette, elementRegistry, chartPanel, dataPanel) {
    this._eventBus = eventBus;
    this._simulationEngine = simulationEngine;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;
    this._simulationPalette = simulationPalette;
    this._elementRegistry = elementRegistry;
    this._chartPanel = chartPanel;
    this._dataPanel = dataPanel;
    this._overlays = null;
    this._heatmap = null;
    this._chart = null;
    this.simulationResults = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', ({ canvas }) => {
      this._overlays = canvas.get('overlays');
      this.init();
    });
  }

  init() {
    const runButton = domify(`<div class="bts-entry" title="Ejecutar Simulación">${RunIcon}</div>`);
    const showButton = domify(`<div class="bts-entry" title="Mostrar Análisis">${ShowIcon}</div>`);
    const chartButton = domify(`<div class="bts-entry" title="Mostrar Gráficos">${ChartIcon}</div>`);
    const dataButton = domify(`<div class="bts-entry" title="Mostrar Datos">${DataIcon}</div>`);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());
    domEvent.bind(chartButton, 'click', () => this._chartPanel.toggle());
    domEvent.bind(dataButton, 'click', () => this._dataPanel.toggle());

    this._tokenSimulationPalette.addEntry(runButton, 11);
    this._tokenSimulationPalette.addEntry(showButton, 12);
    this._tokenSimulationPalette.addEntry(chartButton, 13);
    this._tokenSimulationPalette.addEntry(dataButton, 14);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));

    this._eventBus.on('simulation.charts.opened', () => this.showChart());
    this._eventBus.on('simulation.charts.typeChanged', () => this.showChart());
  }

  runSimulation() {
    this.clear();
    this.simulationResults = this._simulationEngine.run();
    this._notifications.showNotification({ text: 'Simulación completada', type: 'info', duration: 3000 });
    this._eventBus.fire('simulation.results.available', { results: this.simulationResults });
  }

  showMetric(metric) {
    this.clearOverlaysAndHeatmap();
    this.lastMetric = metric;
    const dataPoints = [];
    let max = 0;

    if (!this.simulationResults) {
      this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
      return;
    }

    this.simulationResults.forEach((result, elementId) => {
      const element = this._elementRegistry.get(elementId);
      if (!element || !is(element, 'bpmn:FlowNode')) return;

      let value = 0;
      if (metric === 'frequency') value = result.executionCount;
      else if (metric === 'avgProcessingTime') value = result.totalProcessingTime / (result.executionCount || 1);
      else if (metric === 'avgWaitTime') value = result.totalWaitTime / (result.executionCount || 1);
      else if (metric === 'totalCost') value = result.totalCost;
      else if (metric === 'failureRate') value = result.failureCount / (result.executionCount || 1);

      if (value > max) max = value;
      if (value > 0) dataPoints.push([Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value]);
    });

    this.createHeatmap();
    this._heatmap.data(dataPoints).max(max || 1).radius(20, 10).draw();
    this.showOverlays(metric);
  }

  showOverlays(metric) {
    this.simulationResults.forEach((result, elementId) => {
      const element = this._elementRegistry.get(elementId);
      if (!element || result.executionCount === 0) return;
      let overlayText = '';
      if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
      else if (metric === 'avgProcessingTime') overlayText = `T. Proceso: ${formatMilliseconds(result.totalProcessingTime / result.executionCount)}`;
      else if (metric === 'avgWaitTime') overlayText = `T. Espera: ${formatMilliseconds(result.totalWaitTime / result.executionCount)}`;
      else if (metric === 'totalCost') overlayText = `Costo: $${result.totalCost.toFixed(2)}`;
      else if (metric === 'failureRate') overlayText = `Fallos: ${(result.failureCount / result.executionCount * 100).toFixed(1)}%`;

      if (overlayText) {
        this._overlays.add(element, 'simulation-overlay', {
          position: { bottom: -5, left: element.width / 2 - 20 },
          html: `<div class="simulation-overlay-text">${overlayText}</div>`
        });
      }
    });
  }

  showChart() {
    if (!this.simulationResults) {
      this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
      return;
    }
    if (this._chart) this._chart.destroy();
    const chartConfig = this.getChartConfig(this._chartPanel.getChartType());
    const ctx = this._chartPanel.getCanvas().getContext('2d');
    this._chart = new Chart(ctx, chartConfig);
  }

  getChartConfig(metric) {
    const chartData = this.getChartData(metric);
    const chartType = (metric === 'scatter' || metric === 'pareto') ? 'bar' : 'bar';
    const options = { scales: { y: { beginAtZero: true } } };

    if (metric === 'pareto') {
        Object.assign(options.scales, {
            y1: { type: 'linear', display: true, position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false } }
        });
    } else if (metric === 'scatter') {
        Object.assign(options.scales, {
            x: { type: 'linear', position: 'bottom' }
        });
    }

    const timeMetrics = ['processTime', 'waitTime', 'allWaitTimes'];
    if (timeMetrics.includes(metric)) {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: (context) => `${context.dataset.label}: ${formatMilliseconds(context.parsed.y)}`
                }
            }
        };
    }

    return {
      type: chartType,
      data: {
        labels: chartData.labels,
        datasets: chartData.datasets
      },
      options: options
    };
  }

  getChartData(metric) {
    const tasks = [];
    this.simulationResults.forEach((result, elementId) => {
      const element = this._elementRegistry.get(elementId);
      if (element && is(element, 'bpmn:Task') && result.executionCount > 0) {
        tasks.push({ ...result, name: element.businessObject.name || element.id });
      }
    });

    if (metric === 'scatter') {
      return {
        labels: tasks.map(t => t.name),
        datasets: [{
          type: 'scatter',
          label: 'Tiempo vs. Costo',
          data: tasks.map(t => ({ x: t.totalProcessingTime / t.executionCount, y: t.totalCost }))
        }]
      };
    }

    if (metric === 'pareto') {
      tasks.sort((a, b) => b.failureCount - a.failureCount);
      const totalFailures = tasks.reduce((sum, t) => sum + t.failureCount, 0);
      let cumulative = 0;
      const cumulativePercentage = tasks.map(t => (cumulative += t.failureCount) / totalFailures * 100);
      return {
        labels: tasks.map(t => t.name),
        datasets: [
          { type: 'bar', label: 'Número de Fallos', data: tasks.map(t => t.failureCount), yAxisID: 'y' },
          { type: 'line', label: 'Porcentaje Acumulado', data: cumulativePercentage, yAxisID: 'y1' }
        ]
      };
    }

    let dataProperty, label;
    if (metric === 'cost') { dataProperty = 'totalCost'; label = 'Costo Total'; }
    else if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso Total'; }
    else { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total'; }

    tasks.sort((a, b) => b[dataProperty] - a[dataProperty]);
    const chartTasks = metric === 'allWaitTimes' ? tasks : tasks.slice(0, 5);

    return {
      labels: chartTasks.map(t => t.name),
      datasets: [{ label, data: chartTasks.map(t => t[dataProperty]) }]
    };
  }

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this.clearOverlaysAndHeatmap();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
    this._eventBus.fire('simulation.cleared');
  }

  clearOverlaysAndHeatmap() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    if (this._overlays) {
      this._overlays.remove({ type: 'simulation-overlay' });
    }
    const canvasContainer = this._elementRegistry.get('canvas').getContainer();
    domClasses(canvasContainer).remove('heatmap-shown');
  }

  createHeatmap() {
    if (this._heatmap) return;
    const canvas = this._elementRegistry.get('canvas');
    this._heatmap = new SimpleHeatSVG(canvas);
    domClasses(canvas.getContainer()).add('heatmap-shown');
  }
}

SimulationController.$inject = [
  'eventBus',
  'simulationEngine',
  'tokenSimulationPalette',
  'notifications',
  'simulationPalette',
  'elementRegistry',
  'chartPanel',
  'dataPanel'
];
