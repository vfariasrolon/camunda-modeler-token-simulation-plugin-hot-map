import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  RESET_SIMULATION_EVENT,
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

import SimpleHeatSVG from './simpleheat-svg.js';

// Re-define icons here for simplicity
const CostIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M11.8 10.9c-2.28-.46-3.2-1.5-3.2-2.9 0-1.7.94-2.5 2.4-2.5 2.29 0 3.82 1.63 3.98 3.4h2.02c-.16-2.93-2.26-5-5.98-5-3.47 0-6.02 2.07-6.02 5.5 0 3.07 2.06 4.78 5.43 5.58 2.5.6 3.17 1.63 3.17 2.8 0 1.26-.9 2.5-2.99 2.5-2.09 0-4.09-1.49-4.32-3.8h-2.02c.23 3.34 2.72 5.8 6.34 5.8 3.93 0 6.52-2.02 6.52-5.7 0-2.67-1.7-4.48-5.23-5.28z"/></svg>`;
const WaitTimeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M18 2H6v6l4 4-4 4v6h12v-6l-4-4 4-4V2zm-2 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z"/></svg>`;
const CycleTimeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm4.49 8.31L17.5 14.5l-1.06 1.06-2.82-2.82V7h1.5v5.61l2.37 2.37z"/></svg>`;
const FrequencyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
const BrushIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/></svg>`;
const BroomIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M19.36 2.72l-2.08 2.08c-1.17-0.37-2.44-0.37-3.61 0l-2.4-2.4c-1.56-1.56-4.09-1.56-5.66 0l-2.83 2.83c-1.56 1.56-1.56 4.09 0 5.66l2.4 2.4c-0.37 1.17-0.37 2.44 0 3.61l-2.08 2.08c-1.56 1.56-1.56 4.09 0 5.66l2.83 2.83c1.56 1.56 4.09 1.56 5.66 0l2.08-2.08c1.17 0.37 2.44 0.37 3.61 0l2.4 2.4c1.56 1.56 4.09 1.56 5.66 0l2.83-2.83c1.56-1.56-1.56-4.09 0-5.66l-2.4-2.4c0.37-1.17 0.37-2.44 0-3.61l2.08-2.08c1.56-1.56 1.56-4.09 0-5.66l-2.83-2.83c-1.56-1.57-4.09-1.57-5.66 0zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`;

function createIcon(svg) {
  return function Icon(className = '') { return `<span class="bts-icon ${ className }">${svg}</span>`; };
}

const CostIcon = createIcon(CostIconSVG);
const WaitTimeIcon = createIcon(WaitTimeIconSVG);
const CycleTimeIcon = createIcon(CycleTimeIconSVG);
const FrequencyIcon = createIcon(FrequencyIconSVG);
const BrushIcon = createIcon(BrushIconSVG);
const BroomIcon = createIcon(BroomIconSVG);

export default class Heatmap {
  constructor(canvas, eventBus, elementRegistry, overlays, tokenSimulationPalette, simulationController) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._simulationController = simulationController;

    this._heatmap = null;
    this._radius = 40;
    this._blur = 30;
    this._currentView = null;

    this._eventBus.on('diagram.init', () => this.destroyVisualization());
    this._eventBus.on(RESET_SIMULATION_EVENT, () => this.destroyVisualization());
    this._eventBus.on(TOGGLE_MODE_EVENT, event => {
        if (!event.active) {
            this.destroyVisualization();
        }
    });

    this._init();
  }

  _init() {
    // This adds the heatmap buttons to the original token simulation palette.
    const createButton = (title, icon, action, position) => {
      const button = domify(`<div class="bts-entry" title="${title}">${icon}</div>`);
      domEvent.bind(button, 'click', action);
      this._tokenSimulationPalette.addEntry(button, position);
    };

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 4);

    createButton('Ver Mapa de Calor de Costo Total', CostIcon(), () => this._simulationController.runSimulation('cost'), 5);
    createButton('Ver Mapa de Calor de Tiempos de Espera', WaitTimeIcon(), () => this._simulationController.runSimulation('waitTime'), 6);
    createButton('Ver Mapa de Calor de Tiempo de Ciclo', CycleTimeIcon(), () => this._simulationController.runSimulation('cycleTime'), 7);
    createButton('Ver Mapa de Calor de Frecuencia', FrequencyIcon(), () => this._simulationController.runSimulation('frequency'), 8);
    createButton('Ver Mapa de Calor de Tiempo de Proceso', BrushIcon(), () => this._simulationController.runSimulation('processTime'), 9);

    createButton('Limpiar Visualización', BroomIcon(), () => this.destroyVisualization(), 10);

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);

    createButton('Aumentar Radio', 'R+', () => this._adjustRadius(5), 12);
    createButton('Disminuir Radio', 'R-', () => this._adjustRadius(-5), 13);
    createButton('Aumentar Desenfoque', 'B+', () => this._adjustBlur(5), 14);
    createButton('Disminuir Desenfoque', 'B-', () => this._adjustBlur(-5), 15);
  }

  _adjustRadius(amount) {
    this._radius = Math.max(1, this._radius + amount);
    if (this._heatmap && this._currentView) {
      this.displayResults(this._currentView.results, this._currentView.type);
    }
  }

  _adjustBlur(amount) {
    this._blur = Math.max(0, this._blur + amount);
     if (this._heatmap && this._currentView) {
      this.displayResults(this._currentView.results, this._currentView.type);
    }
  }

  _getMetricForView(viewType) {
    const metrics = {
      cost: { key: 'totalCost', label: 'Costo Total' },
      waitTime: { key: 'avgWaitTime', label: 'Espera Prom.' },
      cycleTime: { key: 'avgCycleTime', label: 'Ciclo Prom.' },
      frequency: { key: 'executionCount', label: 'Frecuencia' },
      processTime: { key: 'avgProcessingTime', label: 'Proceso Prom.' }
    };
    return metrics[viewType] || metrics.frequency;
  }

  displayResults(results, viewType) {
    this._currentView = { results, type: viewType };
    const metric = this._getMetricForView(viewType);
    this._renderVisualization(results, metric.key);
    this._renderOverlays(results, metric);
  }

  _prepareHeatmapData(results, metricKey) {
    let max = 0;
    const dataPoints = [];

    for (const [elementId, result] of results.entries()) {
      const element = this._elementRegistry.get(elementId);
      if (!element || !isAny(element, ['bpmn:Task', 'bpmn:CallActivity', 'bpmn:SubProcess', 'bpmn:Event'])) continue;

      const value = result[metricKey] || 0;
      if (value > max) max = value;

      dataPoints.push([
        Math.round(element.x + element.width / 2),
        Math.round(element.y + element.height / 2),
        value
      ]);
    }
    return { dataPoints, max: max || 1 };
  }

  _renderVisualization(results, metricKey) {
    this.destroyVisualization();
    if (!this._heatmap) this.createHeatmap();

    const { dataPoints, max } = this._prepareHeatmapData(results, metricKey);

    if (!this._heatmap) return;

    this._heatmap.data(dataPoints).max(max).radius(this._radius, this._blur).draw();
  }

  _renderOverlays(results, metric) {
    const gateways = this._elementRegistry.filter(el => is(el, 'bpmn:ExclusiveGateway'));
    for (const gateway of gateways) {
        const result = results.get(gateway.id);
        if (!result || !result.pathCounts) continue;

        const totalExecutions = result.executionCount;
        if (totalExecutions === 0) continue;

        for (const flow of gateway.outgoing) {
            const count = result.pathCounts[flow.id] || 0;
            const percentage = ((count / totalExecutions) * 100).toFixed(1);
            const label = `${count} (${percentage}%)`;

            this._overlays.add(flow, 'simulation-info', {
                position: { top: -15, left: -25 },
                html: `<div class="simulation-overlay">${label}</div>`
            });
        }
    }

    for (const [elementId, result] of results.entries()) {
        const element = this._elementRegistry.get(elementId);
        if (!element || !isAny(element, ['bpmn:Task', 'bpmn:CallActivity', 'bpmn:SubProcess'])) continue;

        const value = result[metric.key];
        if (value === undefined) continue;

        let label = `${metric.label}: ${value.toFixed(2)}`;
        if (metric.key === 'totalCost') label = `Costo: $${value.toFixed(2)}`;
        if (metric.key === 'executionCount') label = `Ejecuciones: ${value}`;

        this._overlays.add(element, 'simulation-info', {
            position: { bottom: -5, left: 0 },
            html: `<div class="simulation-overlay-task">${label}</div>`
        });
    }
  }

  createHeatmap() {
    if (this._heatmap) return;
    this._heatmap = new SimpleHeatSVG(this._canvas);
    domClasses(this._canvas.getContainer()).add('heatmap-shown');
  }

  destroyVisualization() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    this._overlays.remove({ type: 'simulation-info' });
    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
  }
}

Heatmap.$inject = ['canvas', 'eventBus', 'elementRegistry', 'overlays', 'tokenSimulationPalette', 'simulationController'];

function isAny(element, types) {
  return types.some(t => is(element, t));
}
