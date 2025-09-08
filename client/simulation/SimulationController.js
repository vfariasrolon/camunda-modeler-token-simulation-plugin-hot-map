import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';

const DiceIcon = '<path d="M19,5H5A2,2 0 0,0 3,7V17A2,2 0 0,0 5,19H19A2,2 0 0,0 21,17V7A2,2 0 0,0 19,5M9,7A2,2 0 0,1 11,9A2,2 0 0,1 9,11A2,2 0 0,1 7,9A2,2 0 0,1 9,7M15,7A2,2 0 0,1 17,9A2,2 0 0,1 15,11A2,2 0 0,1 13,9A2,2 0 0,1 15,7M9,13A2,2 0 0,1 11,15A2,2 0 0,1 9,17A2,2 0 0,1 7,15A2,2 0 0,1 9,13M15,13A2,2 0 0,1 17,15A2,2 0 0,1 15,17A2,2 0 0,1 13,15A2,2 0 0,1 15,13Z" />';
const ShowIcon = '<path d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.7,7.6 1,12C2.7,16.4 7,19.5 12,19.5C17,19.5 21.3,16.4 23,12C21.3,7.6 17,4.5 12,4.5Z" />';

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
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${DiceIcon}</svg>
      </button>
    `);

    const showButton = domify(`
      <button class="bts-entry simulation-show-button" title="Mostrar Análisis">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ShowIcon}</svg>
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
