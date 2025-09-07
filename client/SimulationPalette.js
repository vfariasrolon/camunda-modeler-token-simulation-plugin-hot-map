import {
  domify,
  event as domEvent
} from 'min-dom';

// Re-usar los iconos de Heatmap.js
const CostIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M11.8 10.9c-2.28-.46-3.2-1.5-3.2-2.9 0-1.7.94-2.5 2.4-2.5 2.29 0 3.82 1.63 3.98 3.4h2.02c-.16-2.93-2.26-5-5.98-5-3.47 0-6.02 2.07-6.02 5.5 0 3.07 2.06 4.78 5.43 5.58 2.5.6 3.17 1.63 3.17 2.8 0 1.26-.9 2.5-2.99 2.5-2.09 0-4.09-1.49-4.32-3.8h-2.02c.23 3.34 2.72 5.8 6.34 5.8 3.93 0 6.52-2.02 6.52-5.7 0-2.67-1.7-4.48-5.23-5.28z"/></svg>`;
const WaitTimeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M18 2H6v6l4 4-4 4v6h12v-6l-4-4 4-4V2zm-2 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z"/></svg>`;
const CycleTimeIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm4.49 8.31L17.5 14.5l-1.06 1.06-2.82-2.82V7h1.5v5.61l2.37 2.37z"/></svg>`;
const FrequencyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`;
const RandomDataIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-.83 0-1.5-.67-1.5-1.5S6.67 15 7.5 15s1.5.67 1.5 1.5S8.33 18 7.5 18zm0-5C6.67 13 6 12.33 6 11.5S6.67 10 7.5 10s1.5.67 1.5 1.5S8.33 13 7.5 13zm0-5C6.67 8 6 7.33 6 6.5S6.67 5 7.5 5s1.5.67 1.5 1.5S8.33 8 7.5 8zm9 5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0 10c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
const BroomIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M19.36 2.72l-2.08 2.08c-1.17-0.37-2.44-0.37-3.61 0l-2.4-2.4c-1.56-1.56-4.09-1.56-5.66 0l-2.83 2.83c-1.56 1.56-1.56 4.09 0 5.66l2.4 2.4c-0.37 1.17-0.37 2.44 0 3.61l-2.08 2.08c-1.56 1.56-1.56 4.09 0 5.66l2.83 2.83c1.56 1.56 4.09 1.56 5.66 0l2.08-2.08c1.17 0.37 2.44 0.37 3.61 0l2.4 2.4c1.56 1.56 4.09 1.56 5.66 0l2.83-2.83c1.56-1.56-1.56-4.09 0-5.66l-2.4-2.4c0.37-1.17 0.37-2.44 0-3.61l2.08-2.08c1.56-1.56 1.56-4.09 0-5.66l-2.83-2.83c-1.56-1.57-4.09-1.57-5.66 0zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`;
const BrushIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/></svg>`;

function createIcon(svg) {
  return function Icon(className = '') {
    return `<span class="bts-icon ${ className }">${svg}</span>`;
  };
}

const CostIcon = createIcon(CostIconSVG);
const WaitTimeIcon = createIcon(WaitTimeIconSVG);
const CycleTimeIcon = createIcon(CycleTimeIconSVG);
const FrequencyIcon = createIcon(FrequencyIconSVG);
const RandomDataIcon = createIcon(RandomDataIconSVG);
const BroomIcon = createIcon(BroomIconSVG);
const BrushIcon = createIcon(BrushIconSVG);


export default class SimulationPalette {
  constructor(simulationController, heatmap, eventBus) {
    this._simulationController = simulationController;
    this._heatmap = heatmap;
    this._eventBus = eventBus;
    this._container = null;

    this._init();
  }

  _init() {
    this._container = domify(`
      <div class="simulation-palette hidden"></div>
    `);

    const createButton = (title, icon, action) => {
      const button = domify(`
        <div class="bts-entry" title="${title}">
          ${icon}
        </div>
      `);
      domEvent.bind(button, 'click', action);
      this._container.appendChild(button);
    };

    createButton('Ver Mapa de Calor de Costo Total', CostIcon(), () => this._simulationController.runSimulation('cost'));
    createButton('Ver Mapa de Calor de Tiempos de Espera (Cuellos de Botella)', WaitTimeIcon(), () => this._simulationController.runSimulation('waitTime'));
    createButton('Ver Mapa de Calor de Tiempo de Ciclo', CycleTimeIcon(), () => this._simulationController.runSimulation('cycleTime'));
    createButton('Ver Mapa de Calor de Frecuencia de Ejecución', FrequencyIcon(), () => this._simulationController.runSimulation('frequency'));
    createButton('Ver Mapa de Calor de Tiempo de Proceso', BrushIcon(), () => this._simulationController.runSimulation('processTime'));

    this._container.appendChild(domify('<hr class="bts-entry-separator">'));

    createButton('Limpiar Visualización', BroomIcon(), () => this._heatmap.destroyVisualization());

    this._container.appendChild(domify('<hr class="bts-entry-separator">'));

    createButton('Probar con Datos Aleatorios', RandomDataIcon(), () => this._simulationController.generateRandomData());

    this._container.appendChild(domify('<hr class="bts-entry-separator">'));

    createButton('Aumentar Radio', 'R+', () => this._heatmap._adjustRadius(5));
    createButton('Disminuir Radio', 'R-', () => this._heatmap._adjustRadius(-5));
    createButton('Aumentar Desenfoque', 'B+', () => this._heatmap._adjustBlur(5));
    createButton('Disminuir Desenfoque', 'B-', () => this._heatmap._adjustBlur(-5));
  }

  getContainer() {
    return this._container;
  }

  show() {
    this._container.classList.remove('hidden');
  }

  hide() {
    this._container.classList.add('hidden');
  }
}

SimulationPalette.$inject = ['simulationController', 'heatmap', 'eventBus'];
