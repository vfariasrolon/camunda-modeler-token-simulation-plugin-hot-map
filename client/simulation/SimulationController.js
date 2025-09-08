import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';

// Replacement icons from FontAwesome to match the editor's style.
// 'play' for Run Simulation, 'eye' for Show Analysis.
const RunIcon = '<path d="M1384 609l-1328 -738q-23 -13 -39.5 -3t-16.5 36v1472q0 26 16.5 36t39.5 -3l1328 -738q23 -13 23 -31t-23 -31z" />';
const ShowIcon = '<path d="M1664 576q-152 236 -381 353q61 -104 61 -225q0 -185 -131.5 -316.5t-316.5 -131.5t-316.5 131.5t-131.5 316.5q0 121 61 225q-229 -117 -381 -353q133 -205 333.5 -326.5t434.5 -121.5t434.5 121.5t333.5 326.5zM944 960q0 20 -14 34t-34 14q-125 0 -214.5 -89.5t-89.5 -214.5q0 -20 14 -34t34 -14t34 14t14 34q0 86 61 147t147 61q20 0 34 14t14 34zM1792 576q0 -34 -20 -69q-140 -230 -376.5 -368.5t-499.5 -138.5t-499.5 139t-376.5 368q-20 35 -20 69t20 69q140 229 376.5 368t499.5 139t499.5 -139t376.5 -368q20 -35 20 -69z" />';

export default class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays, tokenSimulationPalette, notifications) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._simulationEngine = simulationEngine;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;

    this._heatmap = null;
    this._radius = 20;
    this._blur = 10;
    this.simulationResults = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    const runButton = domify(`
      <button class="bts-entry simulation-run-button" title="Ejecutar Simulación">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1792 1792" style="width: 100%; height: 100%;" fill="currentColor">${RunIcon}</svg>
      </button>
    `);

    const showButton = domify(`
      <button class="bts-entry simulation-show-button" title="Mostrar Análisis">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1792 1792" style="width: 100%; height: 100%;" fill="currentColor">${ShowIcon}</svg>
      </button>
    `);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());

    // Add a separator before our button for visual distinction
    // Use high indices to avoid conflicts with other plugins
    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));
  }

  runSimulation() {
    this.clear();
    this.simulationResults = this._simulationEngine.run();
    this._notifications.showNotification({
        text: 'Simulación completada',
        type: 'info',
        duration: 3000
    });
  }

  adjustHeatmap(type, amount) {
      if (type === 'radius') this._radius = Math.max(1, this._radius + amount);
      else if (type === 'blur') this._blur = Math.max(0, this._blur + amount);
      if (this.lastMetric) this.showMetric(this.lastMetric);
  }

  showMetric(metric) {
    this.clearOverlaysAndHeatmap();
    this.lastMetric = metric;

    if (!this.simulationResults) {
        this._notifications.showNotification({
            text: 'Por favor, ejecute una simulación primero',
            type: 'warning',
            duration: 4000
        });
        return;
    }

    const dataPoints = [];
    let max = 0;

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

        if (value > max) max = value;
        if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
    });

    this.createHeatmap();
    this._heatmap.data(dataPoints).max(max || 1).radius(this._radius, this._blur).draw();
    this.showOverlays(metric);
  }

  showOverlays(metric) {
      this.simulationResults.forEach((result, elementId) => {
          const element = this._elementRegistry.get(elementId);
          if (!element) return;
          let overlayText = '';

          if (is(element, 'bpmn:Task')) {
              if (metric === 'cost') overlayText = `Costo: $${result.totalCost.toFixed(2)}`;
              else if (metric === 'waitTime') overlayText = `Espera: ${(result.totalWaitTime / (result.executionCount || 1) / 1000).toFixed(1)}s`;
              else if (metric === 'processTime') overlayText = `Proceso: ${(result.totalProcessingTime / (result.executionCount || 1) / 1000).toFixed(1)}s`;
              else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
              else if (metric === 'failureRate' && result.executionCount > 0) {
                  const rate = (result.failureCount / result.executionCount * 100).toFixed(1);
                  overlayText = `Fallos: ${result.failureCount} (${rate}%)`;
              }
          } else if (is(element, 'bpmn:EndEvent') && metric === 'cycleTime' && result.totalCycleTime > 0) {
              overlayText = `Ciclo: ${(result.totalCycleTime / (result.executionCount || 1) / 1000).toFixed(1)}s`;
          }

          if (overlayText) this._overlays.add(element, 'simulation-overlay', { position: { bottom: -5, left: element.width / 2 - 20 }, html: `<div class="simulation-overlay-text">${overlayText}</div>` });

          if (is(element, 'bpmn:ExclusiveGateway')) {
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

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this.clearOverlaysAndHeatmap();
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
  'notifications'
];
