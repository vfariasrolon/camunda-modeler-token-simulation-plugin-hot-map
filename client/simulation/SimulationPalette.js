import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

// Icons from https://materialdesignicons.com/
const ClockIcon = '<path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,7V12H17V14H10V7H12Z" />';
const FrequencyIcon = '<path d="M21 8H3V4h18v4zm0 2H3v4h18v-4zm0 6H3v4h18v-4z"/>';

const PALETTE_CLS = 'simulation-palette';
const PALETTE_OPEN_CLS = 'open';

export default class SimulationPalette {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._metricCallback = () => {};
    this._clearCallback = () => {};

    this._eventBus.on('canvas.init', () => {
      this.init();
    });

    this._eventBus.on('diagram.destroy', () => this.destroy());
  }

  init() {
    if (this._palette) {
        return;
    }
    const container = this._canvas.getContainer();
    const palette = this._palette = domify(`<div class="${PALETTE_CLS}"></div>`);
    container.appendChild(palette);

    this.addEntry({
      title: 'Visualizar Frecuencia de Ejecución',
      icon: FrequencyIcon,
      metric: 'frequency'
    });

    this.addEntry({
        title: 'Visualizar Tiempo de Proceso Promedio',
        icon: ClockIcon,
        metric: 'avgProcessingTime'
    });

    this.addSeparator();

    this.addEntry({
      title: 'Limpiar Visualización',
      text: 'Limpiar',
      isClear: true
    });
  }

  addEntry(options) {
    const { title, icon, text, metric, isClear } = options;

    let content;
    if (icon) {
        content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>`;
    } else {
        content = `<span class="bts-entry-text">${text}</span>`;
    }

    const button = domify(`<button class="bts-entry" title="${title}">${content}</button>`);
    domEvent.bind(button, 'click', () => {
        if (isClear) this._clearCallback();
        else this._metricCallback(metric);
    });
    this._palette.appendChild(button);
  }

  addSeparator() {
    this._palette.appendChild(domify('<hr class="bts-entry-separator">'));
  }

  setMetricCallback(cb) { this._metricCallback = cb; }
  setClearCallback(cb) { this._clearCallback = cb; }

  isOpen() {
      return this._palette && domClasses(this._palette).has(PALETTE_OPEN_CLS);
  }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() {
      if (this._palette) domClasses(this._palette).add(PALETTE_OPEN_CLS);
  }
  close() {
      if (this._palette) domClasses(this._palette).remove(PALETTE_OPEN_CLS);
  }
  destroy() {
    if (this._palette && this._palette.parentNode) {
      this._palette.parentNode.removeChild(this._palette);
      this._palette = null;
    }
  }
}

SimulationPalette.$inject = [ 'canvas', 'eventBus' ];
