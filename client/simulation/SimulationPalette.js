import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

// Icons from https://materialdesignicons.com/
const MoneyIcon = '<path d="M11.8,10.9c-2.3,0-4.2,1.9-4.2,4.2s1.9,4.2,4.2,4.2s4.2-1.9,4.2-4.2S14.1,10.9,11.8,10.9z M11.8,17.5c-1.3,0-2.4-1.1-2.4-2.4c0-1.3,1.1-2.4,2.4-2.4s2.4,1.1,2.4,2.4C14.2,16.4,13.1,17.5,11.8,17.5z"/><path d="M19.4,10.6c-0.9-0.4-2-0.6-3.1-0.6c-1.8,0-3.4,0.6-4.7,1.5c-0.5-0.5-1.1-0.9-1.7-1.1c0-0.1,0-0.2,0-0.3c0-1.3,0.8-2.3,2-2.8V5.8h1.5v1.1c1,0.3,1.8,1.1,2.1,2c0.6-0.2,1.2-0.3,1.8-0.3c0.5,0,1,0.1,1.5,0.2C19.2,8.1,18.6,7.3,18,6.8c-0.8-0.6-1.7-0.9-2.7-1c0.3-0.8,0.4-1.6,0.4-2.5c0-1.7-1.4-3.1-3.1-3.1S9.4,1.7,9.4,3.4c0,0.9,0.2,1.7,0.4,2.5c-1,0.1-1.9,0.4-2.7,1C6.4,7.3,5.8,8.1,5.2,8.8c0.5-0.2,1-0.2,1.5-0.2c0.6,0,1.2,0.1,1.8,0.3c0.3-0.9,1.1-1.6,2.1-2V5.8h1.5v1.3c1.2,0.4,2,1.5,2,2.8c0,0.1,0,0.2,0,0.3c-0.6,0.3-1.2,0.7-1.7,1.1c-1.3-0.9-2.9-1.5-4.7-1.5c-1.1,0-2.2,0.2-3.1,0.6C2.6,11.3,2,12.3,2,13.4v7.2h19.5v-7.2C21.5,12.3,20.9,11.3,19.4,10.6z M19.8,18.8H3.8v-5.4c0-0.5,0.3-1,0.8-1.2c0.8-0.3,1.6-0.5,2.5-0.5c1.5,0,2.9,0.5,4,1.2c0.9,0.6,1.6,1.4,2,2.4h-1.6c-0.3-0.9-1.1-1.6-2.1-2c-0.6-0.2-1.2-0.3-1.8-0.3s-1.2,0.1-1.8,0.3c-0.9,0.4-1.5,1.2-1.5,2.3c0,0.1,0,0.2,0,0.3c0.6-0.3,1.2-0.7,1.7-1.1c1.3,0.9,2.9,1.5,4.7,1.5c1.1,0,2.2-0.2,3.1-0.6c0.5-0.2,0.8-0.7,0.8-1.2L19.8,18.8L19.8,18.8z"/>';
const WaitIcon = '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-12h2v5h-2zm0 6h2v2h-2z"/>';
const CycleTimeIcon = '<path d="M12 4V1L8 5l4 4V6c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/>';
const FrequencyIcon = '<path d="M21 8H3V4h18v4zm0 2H3v4h18v-4zm0 6H3v4h18v-4z"/>';
const ProcessTimeIcon = '<path d="M15 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 8c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4zm-6 4c.2-.7 2.8-2 6-2s5.8 1.3 6 2H9z"/>';
const ClearIcon = '<path d="M19.36 2.72l-2.08 2.08c-1.17-.37-2.44-.37-3.61 0l-2.4-2.4c-1.56-1.56-4.09-1.56-5.66 0l-2.83 2.83c-1.56 1.56-1.56 4.09 0 5.66l2.4 2.4c-.37 1.17-.37 2.44 0 3.61l-2.08 2.08c-1.56 1.56-1.56 4.09 0 5.66l2.83 2.83c1.56 1.56 4.09 1.56 5.66 0l2.08-2.08c1.17.37 2.44.37 3.61 0l2.4 2.4c1.56 1.56 4.09 1.56 5.66 0l2.83-2.83c1.56-1.56-1.56-4.09 0-5.66l-2.4-2.4c.37-1.17.37-2.44 0-3.61l2.08-2.08c1.56-1.56 1.56-4.09 0-5.66l-2.83-2.83c-1.56-1.57-4.09-1.57-5.66 0zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>';

const PALETTE_CLS = 'simulation-palette';
const PALETTE_OPEN_CLS = 'open';

export default class SimulationPalette {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._metricCallback = () => {};
    this._clearCallback = () => {};
    this._adjustCallback = () => {};

    this.init();
  }

  init() {
    const container = this._canvas.getContainer();
    const palette = this._palette = domify(`<div class="${PALETTE_CLS}"></div>`);
    container.appendChild(palette);

    this.addEntry({
      title: 'Visualizar Costos',
      icon: MoneyIcon,
      metric: 'cost'
    });
    this.addEntry({
      title: 'Visualizar Tiempos de Espera (Cuellos de Botella)',
      icon: WaitIcon,
      metric: 'waitTime'
    });
    this.addEntry({
        title: 'Visualizar Tiempos de Ciclo',
        icon: CycleTimeIcon,
        metric: 'cycleTime'
    });
    this.addEntry({
      title: 'Visualizar Frecuencia de Ejecución',
      icon: FrequencyIcon,
      metric: 'frequency'
    });
    this.addEntry({
        title: 'Visualizar Tiempo de Proceso',
        icon: ProcessTimeIcon,
        metric: 'processTime'
    });

    this.addSeparator();

    this.addEntry({
      title: 'Limpiar Visualización',
      icon: ClearIcon,
      isClear: true
    });

    this.addSeparator();

    this.addControl('R+', 'Aumentar Radio', () => this._adjustCallback('radius', 5));
    this.addControl('R-', 'Disminuir Radio', () => this._adjustCallback('radius', -5));
    this.addControl('B+', 'Aumentar Desenfoque', () => this._adjustCallback('blur', 5));
    this.addControl('B-', 'Disminuir Desenfoque', () => this._adjustCallback('blur', -5));

    this._eventBus.on('diagram.destroy', () => this.destroy());
  }

  addEntry(options) {
    const { title, icon, metric, isClear } = options;
    const button = domify(`
      <button class="bts-entry" title="${title}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>
      </button>
    `);

    domEvent.bind(button, 'click', () => {
        if (isClear) {
            this._clearCallback();
        } else {
            this._metricCallback(metric);
        }
    });

    this._palette.appendChild(button);
  }

  addControl(text, title, action) {
    const button = domify(`<button class="bts-entry" title="${title}">${text}</button>`);
    domEvent.bind(button, 'click', action);
    this._palette.appendChild(button);
  }

  addSeparator() {
    this._palette.appendChild(domify('<hr class="bts-entry-separator">'));
  }

  setMetricCallback(cb) { this._metricCallback = cb; }
  setClearCallback(cb) { this._clearCallback = cb; }
  setAdjustCallback(cb) { this._adjustCallback = cb; }

  isOpen() { return domClasses(this._palette).has(PALETTE_OPEN_CLS); }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() { domClasses(this._palette).add(PALETTE_OPEN_CLS); }
  close() { domClasses(this._palette).remove(PALETTE_OPEN_CLS); }
  destroy() { if (this._palette) this._palette.remove(); }
}

SimulationPalette.$inject = [ 'canvas', 'eventBus' ];
