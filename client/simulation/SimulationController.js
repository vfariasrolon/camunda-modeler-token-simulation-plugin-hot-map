import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData } from './util';

// Geometric icons to match the look and feel of the editor
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
    this._eventBus.on('simulation.charts.typeChanged', (e) => this.showChart(e.type));
  }

  runSimulation() {
    this.clear();
    this.simulationResults = this._simulationEngine.run();
    this._notifications.showNotification({ text: 'Simulación completada', type: 'info', duration: 3000 });
  }

  adjustHeatmap(type, amount) {
      if (type === 'radius') this._radius = Math.max(1, this._radius + amount);
      else if (type === 'blur') this._blur = Math.max(0, this._blur + amount);
      if (this.lastMetric) this.showMetric(this.lastMetric);
  }

  showMetric(metric) {
    this.clearOverlaysAndHeatmap();
    this.lastMetric = metric;
    const dataPoints = [];
    let max = 0;

    if (metric === 'resourceQuantity') {
      this._elementRegistry.forEach(element => {
        if (is(element, 'bpmn:Task')) {
          const data = getSimulationData(element);
          const value = (data && data.resources && data.resources.quantityRequired) || 0;
          if (value > max) max = value;
          if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
        }
      });
    } else {
      if (!this.simulationResults) {
          this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
          return;
      }
      this.simulationResults.forEach((result, elementId) => {
          const element = this._elementRegistry.get(elementId);
          if (!element || !is(element, 'bpmn:FlowNode')) return;

          let value = 0;
          if (metric === 'frequency') value = result.executionCount;
          else if (metric === 'cost') value = result.totalCost;
          else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1) / 1000;
          else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1) / 1000;
          else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1) / 1000;
          else if (metric === 'failureRate') value = result.failureCount / (result.executionCount || 1);
          else if (metric === 'transportWaitTime') value = result.totalTransportWaitTime / (result.executionCount || 1) / 1000;
          else if (metric === 'inefficientDispatch') value = result.inefficientDispatchCount;

          if (value > max) max = value;
          if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
      });
    }

    this.createHeatmap();
    this._heatmap.data(dataPoints).max(max || 1).radius(this._radius, this._blur).draw();
    this.showOverlays(metric);
  }

  showOverlays(metric) {
    const elements = metric === 'resourceQuantity'
      ? this._elementRegistry.filter(el => is(el, 'bpmn:Task'))
      : Array.from(this.simulationResults.keys()).map(id => this._elementRegistry.get(id));

    elements.forEach(element => {
        if (!element) return;
        let overlayText = '';
        const result = this.simulationResults ? this.simulationResults.get(element.id) : null;

        if (metric === 'resourceQuantity') {
            const data = getSimulationData(element);
            const value = (data && data.resources && data.resources.quantityRequired) || 0;
            if (value > 0) overlayText = `Recursos: ${value}`;
        } else if (result) {
            if (is(element, 'bpmn:Task')) {
                if (metric === 'cost') overlayText = `Costo: $${result.totalCost.toFixed(2)}`;
                else if (metric === 'waitTime') overlayText = `Espera: ${(result.totalWaitTime / (result.executionCount || 1) / 1000).toFixed(1)}s`;
                else if (metric === 'processTime') overlayText = `Proceso: ${(result.totalProcessingTime / (result.executionCount || 1) / 1000).toFixed(1)}s`;
                else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
                else if (metric === 'failureRate' && result.executionCount > 0) {
                    const rate = (result.failureCount / result.executionCount * 100).toFixed(1);
                    overlayText = `Fallos: ${result.failureCount} (${rate}%)`;
                }
                else if (metric === 'transportWaitTime' && result.totalTransportWaitTime > 0) {
                  overlayText = `E.Carro: ${(result.totalTransportWaitTime / result.executionCount / 1000).toFixed(1)}s`;
                }
                else if (metric === 'inefficientDispatch' && result.inefficientDispatchCount > 0) {
                  overlayText = `Desp. Inef: ${result.inefficientDispatchCount}`;
                }
            } else if (is(element, 'bpmn:EndEvent') && metric === 'cycleTime' && result.totalCycleTime > 0) {
                overlayText = `Ciclo: ${(result.totalCycleTime / (result.executionCount || 1) / 1000).toFixed(1)}s`;
            }
        }

        if (overlayText) this._overlays.add(element, 'simulation-overlay', { position: { bottom: -5, left: element.width / 2 - 20 }, html: `<div class="simulation-overlay-text">${overlayText}</div>` });

        if (result && is(element, 'bpmn:ExclusiveGateway')) {
            element.outgoing.forEach(flow => {
                const flowResult = this.simulationResults.get(flow.id);
                if (flowResult && result.executionCount > 0 && flowResult.executionCount > 0) {
                    const percentage = (flowResult.executionCount / result.executionCount * 100).toFixed(1);
                    this._overlays.add(flow.id, 'simulation-overlay', { position: { top: -15, left: -20 }, html: `<div class="simulation-overlay-text">${flowResult.executionCount} (${percentage}%)</div>` });
                }
            });
        }
    });
  }

  showChart(metric) {
    if (!metric) {
      metric = this._chartPanel.getChartType();
    }

    if (!this.simulationResults) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        return;
    }

    if (this._chart) {
      this._chart.destroy();
    }

    const { data, labels, label } = this.getChartData(metric);

    const ctx = this._chartPanel.getCanvas().getContext('2d');
    this._chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: label,
          data: data,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  getChartData(metric) {
    const tasks = [];
    this.simulationResults.forEach((result, elementId) => {
      const element = this._elementRegistry.get(elementId);
      if (element && is(element, 'bpmn:Task')) {
        tasks.push({ ...result });
      }
    });

    let dataProperty, label;
    if (metric === 'cost') { dataProperty = 'totalCost'; label = 'Costo Total por Tarea'; }
    else if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso Total'; }
    else if (metric === 'waitTime') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'transportWaitTime') { dataProperty = 'totalTransportWaitTime'; label = 'Tiempo de Espera Total (Transporte)'; }

    tasks.sort((a, b) => b[dataProperty] - a[dataProperty]);
    const top5 = tasks.filter(t => t[dataProperty] > 0).slice(0, 5);

    const labels = top5.map(t => t.name);
    const data = top5.map(t => t[dataProperty]);

    return { data, labels, label };
  }

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this.clearOverlaysAndHeatmap();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  clearOverlaysAndHeatmap() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
    this._overlays.remove({ type: 'simulation-overlay' });
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
  'simulationPalette',
  'simulationEngine',
  'elementRegistry',
  'overlays',
  'tokenSimulationPalette',
  'notifications',
  'chartPanel'
];
