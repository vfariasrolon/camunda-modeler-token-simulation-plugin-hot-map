import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, formatMilliseconds } from './util';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';

const RunIcon = `<path d="M 4 2 L 4 14 L 14 8 Z" fill="currentColor" />`;
const ShowIcon = `<path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" />`;
const ChartIcon = `<path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" />`;
const DataIcon = `<path d="M9,5V9H21V5M9,19H21V15H9M9,14H21V10H9M4,9H8V5H4M4,19H8V15H4M4,14H8V10H4V14Z" />`;

export default class SimulationController {
  constructor(canvas, eventBus, simulationEngine, tokenSimulationPalette, notifications, simulationPalette, elementRegistry, chartPanel, dataPanel) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationEngine = simulationEngine;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;
    this._simulationPalette = simulationPalette;
    this._elementRegistry = elementRegistry;
    this._chartPanel = chartPanel;
    this._dataPanel = dataPanel;
    this._overlays = canvas.get('overlays');

    this._heatmap = null;
    this._chart = null;
    this.simulationResults = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    const createButton = (title, path) => domify(`<div class="bts-entry" title="${title}"><span class="bts-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${path}</svg></span></div>`);

    const runButton = createButton('Ejecutar Simulación', RunIcon);
    const showButton = createButton('Mostrar Análisis de Simulación', ShowIcon);
    const chartButton = createButton('Mostrar Gráficos', ChartIcon);
    const dataButton = createButton('Mostrar Datos', DataIcon);

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
      const cumulativePercentage = tasks.map(t => totalFailures > 0 ? (cumulative += t.failureCount) / totalFailures * 100 : 0);
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
    const canvasContainer = this._canvas.getContainer();
    domClasses(canvasContainer).remove('heatmap-shown');
  }

  createHeatmap() {
    if (this._heatmap) return;
    this._heatmap = new SimpleHeatSVG(this._canvas);
    domClasses(this._canvas.getContainer()).add('heatmap-shown');
  }
}

SimulationController.$inject = [
  'canvas',
  'eventBus',
  'simulationEngine',
  'tokenSimulationPalette',
  'notifications',
  'simulationPalette',
  'elementRegistry',
  'chartPanel',
  'dataPanel'
];
