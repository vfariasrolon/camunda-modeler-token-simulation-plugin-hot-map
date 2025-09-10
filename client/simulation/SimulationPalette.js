import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

// Icons from https://materialdesignicons.com/
const ClockIcon = '<path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,7V12H17V14H10V7H12Z" />';
const CycleTimeIcon = '<path d="M12 4V1L8 5l4 4V6c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/>';
const FrequencyIcon = '<path d="M21 8H3V4h18v4zm0 2H3v4h18v-4zm0 6H3v4h18v-4z"/>';
const BugIcon = '<path d="M14,12h-4v-2h4V12z M19,9h-2.1c-0.5-1.2-1.4-2.2-2.6-2.9l1.5-1.5L14.4,3.1l-1.5,1.5C12.3,4.2,11.7,4,11,4 s-1.3,0.2-1.9,0.6L7.6,3.1L6.2,4.5l1.5,1.5C6.4,6.8,5.5,7.8,5.1,9H3v2h2.1c0.1,0.7,0.3,1.4,0.6,2H3v2h2.7c0.8,1,1.8,1.8,2.9,2.4 l-1.5,1.5L9.6,20.9l1.5-1.5c0.6,0.4,1.3,0.6,2,0.6s1.3-0.2,2-0.6l1.5,1.5l1.4-1.4l-1.5-1.5c1-0.6,1.9-1.4,2.6-2.4H21v-2h-2.1 c-0.3-0.6-0.5-1.3-0.6-2H21V9z"/>';
const BackIcon = '<path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />';

const PALETTE_CLS = 'simulation-palette';
const PALETTE_OPEN_CLS = 'open';

export default class SimulationPalette {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._metricCallback = () => {};
    this._clearCallback = () => {};
    this._adjustCallback = () => {};

    // *** FIX: Defer initialization until canvas is ready ***
    this._eventBus.on('canvas.init', () => {
      this.init();
    });

    this._eventBus.on('diagram.destroy', () => this.destroy());
  }

  init() {
    // Check if palette already exists to prevent duplicates on re-init
    if (this._palette) {
        return;
    }
    const container = this._canvas.getContainer();
    const palette = this._palette = domify(`<div class="${PALETTE_CLS}"></div>`);
    container.appendChild(palette);

    this.addEntry({
      title: 'Atrás',
      icon: BackIcon,
      isBack: true
    });

    this.addSeparator();

    this.addEntry({
      title: 'Visualizar Costos',
      text: '$',
      metric: 'cost'
    });
    this.addEntry({
      title: 'Visualizar Tiempos de Espera (Cuellos de Botella)',
      icon: ClockIcon,
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
        icon: ClockIcon,
        metric: 'processTime'
    });
    this.addEntry({
        title: 'Visualizar Tasa de Fallos',
        icon: BugIcon,
        metric: 'failureRate'
    });

    this.addSeparator();

    this.addEntry({
      title: 'Limpiar Visualización',
      text: 'Limpiar',
      isClear: true
    });

    this.addSeparator();

    this.addControl('R+', 'Aumentar Radio', () => this._adjustCallback('radius', 5));
    this.addControl('R-', 'Disminuir Radio', () => this._adjustCallback('radius', -5));
    this.addControl('B+', 'Aumentar Desenfoque', () => this._adjustCallback('blur', 5));
    this.addControl('B-', 'Disminuir Desenfoque', () => this._adjustCallback('blur', -5));
  }

  addEntry(options) {
    const { title, icon, text, metric, isClear, isBack } = options;

    let content;
    if (icon) {
        content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>`;
    } else {
        content = `<span class="bts-entry-text">${text}</span>`;
    }

    const button = domify(`
      <button class="bts-entry" title="${title}">
        ${content}
      </button>
    `);

    domEvent.bind(button, 'click', () => {
        if (isClear) this._clearCallback();
        else if (isBack) this.close();
        else this._metricCallback(metric);
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
