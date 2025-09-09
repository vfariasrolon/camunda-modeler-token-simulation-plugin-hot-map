import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import { getSimulationData } from './util';

const RunIcon = `...`; // Keep new icons
const ShowIcon = `...`;

export default class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays, tokenSimulationPalette, notifications) {
    // ... (constructor as before)
  }

  init() {
    // ... (create runButton and showButton as before)
    // ... (add them to tokenSimulationPalette as before)

    // NEW LOGIC: Listen for events from the palette
    this._eventBus.on('simulation.showMetric', (event) => {
      this.showMetric(event.metric);
    });

    this._eventBus.on('simulation.clear', () => {
      this.clear();
    });

    this._eventBus.on('simulation.adjustHeatmap', (event) => {
      this.adjustHeatmap(event.type, event.amount);
    });
  }

  runSimulation() { /* ... same as before ... */ }
  adjustHeatmap(type, amount) { /* ... same as before ... */ }
  showMetric(metric) { /* ... same as before, but without the runSimulation parameter ... */ }
  showOverlays(metric) { /* ... same as before ... */ }
  clear() { /* ... same as before ... */ }
  clearOverlaysAndHeatmap() { /* ... same as before ... */ }
  createHeatmap() { /* ... same as before ... */ }
}

SimulationController.$inject = [
  'canvas', 'eventBus', 'simulationPalette', 'simulationEngine',
  'elementRegistry', 'overlays', 'tokenSimulationPalette', 'notifications'
];
