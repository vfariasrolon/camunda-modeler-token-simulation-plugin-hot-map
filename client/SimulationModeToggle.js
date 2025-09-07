import {
  domify,
  event as domEvent
} from 'min-dom';

const ANALYSIS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H8l4-5v4h3l-4 5z"/></svg>`;

export default class SimulationModeToggle {
  constructor(canvas, eventBus, simulationPalette, injector) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._injector = injector;
    this._active = false;

    this._init();
  }

  _init() {
    this._container = domify(`
      <div class="simulation-toggle-mode" title="Activar/Desactivar Análisis de Simulación">
        <span class="bts-icon">${ANALYSIS_ICON}</span>
        Análisis de Simulación
      </div>
    `);

    domEvent.bind(this._container, 'click', () => this.toggle());

    this._canvas.getContainer().appendChild(this._container);
    this._canvas.getContainer().appendChild(this._simulationPalette.getContainer());

    this._eventBus.on('import.done', () => {
        this.deactivate();
    });

    // Escuchar el evento del menú superior
    this._eventBus.on('toggleSimulationAnalysis', () => this.toggle());
  }

  toggle() {
    this._active ? this.deactivate() : this.activate();
  }

  activate() {
    this._active = true;
    this._simulationPalette.show();
    this._container.classList.add('active');
  }

  deactivate() {
    this._active = false;
    this._simulationPalette.hide();
    this._container.classList.remove('active');

    // También limpiar la visualización al desactivar
    const heatmap = this._injector.get('heatmap', false);
    if (heatmap) {
        heatmap.destroyVisualization();
    }
  }
}

SimulationModeToggle.$inject = ['canvas', 'eventBus', 'simulationPalette', 'injector'];
