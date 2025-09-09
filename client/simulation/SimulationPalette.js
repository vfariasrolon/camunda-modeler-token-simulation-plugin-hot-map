import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const RunIcon = `...`; // Keep new icons
const ShowIcon = `...`;
const ClockIcon = `...`;
const CycleTimeIcon = `...`;
const FrequencyIcon = `...`;
const BugIcon = `...`;
const ClearIcon = `...`;
const BackIcon = `...`;

export default class SimulationPalette {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this.init();
  }

  init() {
    // ... create palette container ...

    this.addEntry({ title: 'Atrás', icon: BackIcon, event: 'simulation.palette.close' });
    this.addSeparator();
    this.addEntry({ title: 'Visualizar Costos', text: '$', event: 'simulation.showMetric', metric: 'cost' });
    this.addEntry({ title: 'Visualizar Tiempos de Espera', icon: ClockIcon, event: 'simulation.showMetric', metric: 'waitTime' });
    // ... add all other metric buttons, firing 'simulation.showMetric' with the correct metric ...
    this.addEntry({ title: 'Visualizar Tasa de Fallos', icon: BugIcon, event: 'simulation.showMetric', metric: 'failureRate' });
    this.addSeparator();
    this.addEntry({ title: 'Limpiar Visualización', text: 'Limpiar', event: 'simulation.clear' });
    this.addSeparator();
    this.addControl('R+', 'Aumentar Radio', 'radius', 5);
    // ... add other controls ...
  }

  addEntry(options) {
    const { title, icon, text, event, metric } = options;
    let content = text ? `<span class="bts-entry-text">${text}</span>` : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>`;
    const button = domify(`<button class="bts-entry" title="${title}">${content}</button>`);
    domEvent.bind(button, 'click', () => {
        this._eventBus.fire(event, { metric });
        if (event === 'simulation.palette.close') this.close();
    });
    this._palette.appendChild(button);
  }

  addControl(text, title, type, amount) {
    const button = domify(`<button class="bts-entry" title="${title}">${text}</button>`);
    domEvent.bind(button, 'click', () => this._eventBus.fire('simulation.adjustHeatmap', { type, amount }));
    this._palette.appendChild(button);
  }

  // ... rest of the methods ...
}

SimulationPalette.$inject = [ 'canvas', 'eventBus' ];
