import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

// ... (keep all existing icon constants)
const GearIcon = '<path d="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22Z" />';
const BackIcon = '<path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />';

export default class SimulationPalette {
  constructor(canvas, eventBus) {
    // ... (constructor as before)
    this._configCallback = () => {};
    this._configButton = null;
  }

  init() {
    // ... (create palette container)

    this.addEntry({ title: 'Atrás', icon: BackIcon, isBack: true });
    this.addSeparator();

    // Add new configure button
    this._configButton = this.addEntry({
      title: 'Configurar Elemento Seleccionado',
      icon: GearIcon,
      isConfig: true
    });
    this.toggleConfig(false); // Initially disabled

    this.addSeparator();

    // ... (add all metric buttons as before)

    this.addSeparator();
    this.addEntry({ title: 'Limpiar Visualización', text: 'Limpiar', isClear: true });
    // ... (add controls as before)
  }

  addEntry(options) {
    const { title, icon, text, metric, isClear, isBack, isConfig } = options;
    // ... (logic to create button content)
    const button = domify(`<button class="bts-entry" title="${title}">${content}</button>`);
    domEvent.bind(button, 'click', () => {
        if (isClear) this._clearCallback();
        else if (isBack) this.close();
        else if (isConfig) this._configCallback();
        else this._metricCallback(metric);
    });
    this._palette.appendChild(button);
    return button; // Return the button element
  }

  toggleConfig(enabled) {
      if (this._configButton) {
          this._configButton.disabled = !enabled;
          this._configButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
          this._configButton.style.opacity = enabled ? '1' : '0.5';
      }
  }

  // ... (rest of the methods as before)
  setConfigCallback(cb) { this._configCallback = cb; }
}

SimulationPalette.$inject = [ 'canvas', 'eventBus' ];
