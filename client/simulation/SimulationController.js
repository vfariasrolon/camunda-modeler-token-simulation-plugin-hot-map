import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';

export default class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._simulationEngine = simulationEngine;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;

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
    const parent = this._canvas.getContainer().parentNode;

    const button = domify(`
      <button class="simulation-toggle" title="Análisis de Simulación">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M5 3v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2H7c-1.1 0-2 .9-2 2zm2 2h10v14H7V5zm2 2v2h6V7H9zm0 4v2h6v-2H9zm0 4v2h4v-2H9z" fill="currentColor"/></svg>
        <span>Análisis de Simulación</span>
      </button>
    `);

    parent.appendChild(button);

    domEvent.bind(button, 'click', () => {
      this._simulationPalette.toggle();
    });

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));
  }

  adjustHeatmap(type, amount) {
      if (type === 'radius') {
          this._radius = Math.max(1, this._radius + amount);
      } else if (type === 'blur') {
          this._blur = Math.max(0, this._blur + amount);
      }

      if (this.lastMetric) {
          this.showMetric(this.lastMetric, false); // don't re-run simulation
      }
  }

  showMetric(metric, runSimulation = true) {
    this.clear(false); // don't clear results
    this.lastMetric = metric;

    if (runSimulation) {
        this.simulationResults = this._simulationEngine.run();
    }

    if (!this.simulationResults) {
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
        else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1) / 1000; // avg seconds
        else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1) / 1000; // avg seconds
        else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1) / 1000; // avg seconds

        if (value > max) max = value;

        if (value > 0) {
            dataPoints.push([
                Math.round(element.x + element.width / 2),
                Math.round(element.y + element.height / 2),
                value
            ]);
        }
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
          } else if (is(element, 'bpmn:EndEvent') && metric === 'cycleTime') {
              const avgCycleTime = result.totalCycleTime / (result.executionCount || 1) / 1000;
              if (avgCycleTime > 0) {
                overlayText = `Ciclo: ${avgCycleTime.toFixed(1)}s`;
              }
          }

          if (overlayText) {
              this._overlays.add(element, 'simulation-overlay', {
                  position: { bottom: -5, left: element.width / 2 - 20 },
                  html: `<div class="simulation-overlay-text">${overlayText}</div>`
              });
          }

          if (is(element, 'bpmn:ExclusiveGateway')) {
              const totalExecutions = result.executionCount;
              element.outgoing.forEach(flow => {
                  const flowResult = this.simulationResults.get(flow.id);
                  if (flowResult && totalExecutions > 0 && flowResult.executionCount > 0) {
                      const percentage = (flowResult.executionCount / totalExecutions * 100).toFixed(1);
                      const overlayText = `${flowResult.executionCount} (${percentage}%)`;
                       this._overlays.add(flow.id, 'simulation-overlay', {
                          position: { top: -15, left: -20 },
                          html: `<div class="simulation-overlay-text">${overlayText}</div>`
                      });
                  }
              });
          }
      });
  }

  clear(clearResults = true) {
    this.lastMetric = null;
    if (clearResults) {
        this.simulationResults = null;
    }
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
    this._overlays.remove({ type: 'simulation-overlay' });
  }

  createHeatmap() {
    if (this._heatmap) return;
    this._heatmap = new SimpleHeatSVG(this._canvas.getContainer());
    domClasses(this._canvas.getContainer()).add('heatmap-shown');
  }
}

SimulationController.$inject = [
  'canvas',
  'eventBus',
  'simulationPalette',
  'simulationEngine',
  'elementRegistry',
  'overlays'
];
