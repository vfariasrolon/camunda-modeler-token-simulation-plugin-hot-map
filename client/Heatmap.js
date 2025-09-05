import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

import {
  find
} from 'min-dash';

import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  RESET_SIMULATION_EVENT,
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

import SimpleHeatSVG from './simpleheat-svg.js';
import SimulationEngine from './SimulationEngine.js';

// SVG Icons for buttons
const BroomIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M19.36 2.72l-2.08 2.08c-1.17-0.37-2.44-0.37-3.61 0l-2.4-2.4c-1.56-1.56-4.09-1.56-5.66 0l-2.83 2.83c-1.56 1.56-1.56 4.09 0 5.66l2.4 2.4c-0.37 1.17-0.37 2.44 0 3.61l-2.08 2.08c-1.56 1.56-1.56 4.09 0 5.66l2.83 2.83c1.56 1.56 4.09 1.56 5.66 0l2.08-2.08c1.17 0.37 2.44 0.37 3.61 0l2.4 2.4c1.56 1.56 4.09 1.56 5.66 0l2.83-2.83c1.56-1.56-1.56-4.09 0-5.66l-2.4-2.4c0.37-1.17 0.37-2.44 0-3.61l2.08-2.08c1.56-1.56 1.56-4.09 0-5.66l-2.83-2.83c-1.56-1.57-4.09-1.57-5.66 0zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`;
const BrushIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/></svg>`;

function createIcon(svg) {
  return function Icon(className = '') {
    return `<span class="bts-icon ${ className }">${svg}</span>`;
  };
}

const BroomIcon = createIcon(BroomIconSVG);
const BrushIcon = createIcon(BrushIconSVG);

export default class Heatmap {
  constructor(canvas, eventBus, elementRegistry, tokenSimulationPalette, toggleMode) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._toggleMode = toggleMode;

    this._heatmap = null;
    this._radius = 20;
    this._blur = 10;
    this._simulationEngine = new SimulationEngine();
    this._activeMetric = 'cycleTime';

    eventBus.on('diagram.init', () => this.destroyHeatmap());
    eventBus.on(RESET_SIMULATION_EVENT, () => this.destroyHeatmap());
    eventBus.on(TOGGLE_MODE_EVENT, event => {
      if (!event.active) {
        this.destroyHeatmap();
      }
    });

    this._init();
  }

  _init() {
    const generateButton = domify(`
      <div class="bts-entry" title="Generate Heatmap">
        ${BrushIcon()}
      </div>
    `);
    domEvent.bind(generateButton, 'click', () => this.showHeatmapFromProperties());
    this._tokenSimulationPalette.addEntry(generateButton, 4);

    const clearButton = domify(`
      <div class="bts-entry" title="Clear Heatmap">
        ${BroomIcon()}
      </div>
    `);
    domEvent.bind(clearButton, 'click', () => this.destroyHeatmap());
    this._tokenSimulationPalette.addEntry(clearButton, 5);

    // Add separator
    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 6);

    // Add View Selector
    const viewSelector = domify(`
      <div class="bts-entry" title="Select Heatmap View">
        <select id="heatmap-view-selector" style="width: 100%; background: #f7f7f7; border: 1px solid #ccc;">
          <option value="cycleTime">Tiempo de Ciclo</option>
          <option value="cost">Costo</option>
          <option value="bottleneck" disabled>Cuellos de Botella</option>
          <option value="frequency" disabled>Frecuencia</option>
        </select>
      </div>
    `);
    domEvent.bind(viewSelector.querySelector('select'), 'change', (event) => this._onViewChange(event));
    this._tokenSimulationPalette.addEntry(viewSelector, 7);

    // Add controls
    const radiusPlusButton = domify(`<div class="bts-entry" title="Increase Radius">R+</div>`);
    domEvent.bind(radiusPlusButton, 'click', () => this._adjustRadius(5));
    this._tokenSimulationPalette.addEntry(radiusPlusButton, 8);

    const radiusMinusButton = domify(`<div class="bts-entry" title="Decrease Radius">R-</div>`);
    domEvent.bind(radiusMinusButton, 'click', () => this._adjustRadius(-5));
    this._tokenSimulationPalette.addEntry(radiusMinusButton, 8);

    const blurPlusButton = domify(`<div class="bts-entry" title="Increase Blur">B+</div>`);
    domEvent.bind(blurPlusButton, 'click', () => this._adjustBlur(5));
    this._tokenSimulationPalette.addEntry(blurPlusButton, 9);

    const blurMinusButton = domify(`<div class="bts-entry" title="Decrease Blur">B-</div>`);
    domEvent.bind(blurMinusButton, 'click', () => this._adjustBlur(-5));
    this._tokenSimulationPalette.addEntry(blurMinusButton, 10);
  }

  _adjustRadius(amount) {
    this._radius = Math.max(1, this._radius + amount);
    if (this._heatmap) {
      this.showHeatmapFromProperties();
    }
  }

  _onViewChange(event) {
    this._activeMetric = event.target.value;
    if (this._heatmap) {
      this.showHeatmapFromProperties();
    }
  }

  _adjustBlur(amount) {
    this._blur = Math.max(0, this._blur + amount);
    if (this._heatmap) {
      this.showHeatmapFromProperties();
    }
  }

  _isSupported(element) {
    return isAny(element, [
      'bpmn:Task', 'bpmn:CallActivity', 'bpmn:StartEvent', 'bpmn:EndEvent',
      'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway', 'bpmn:IntermediateCatchEvent', 'bpmn:SubProcess'
    ]);
  }

  _getHeatmapData() {
    const allSupportedElements = this._elementRegistry.filter(element => this._isSupported(element));

    const results = this._simulationEngine.run(allSupportedElements, this._activeMetric);

    let max = 0;
    results.forEach(r => {
      if (r.value > max) {
        max = r.value;
      }
    });

    const dataPoints = results.map(r => {
      return [
        Math.round(r.element.x + r.element.width / 2),
        Math.round(r.element.y + r.element.height / 2),
        r.value
      ];
    });

    return { dataPoints, max: max || 1 };
  }

  _updateDataAndRedraw() {
    if (this._toggleMode.active) {
      // console.warn('[Heatmap Plugin] Please stop simulation before generating a heatmap.');
      return;
    }

    if (!this._heatmap) {
      this.createHeatmap();
    }

    // Don't clear here, allow redraws on top
    // this.clear();

    const { dataPoints, max } = this._getHeatmapData();

    if (!this._heatmap) {
      return;
    }

    // configure and draw new heatmap
    this._heatmap
      .data(dataPoints)
      .max(max)
      .radius(this._radius, this._blur)
      .draw();
  }

  showHeatmapFromProperties() {
    this._updateDataAndRedraw();
  }

  createHeatmap() {
    if (this._heatmap) {
      return;
    }

    this._heatmap = new SimpleHeatSVG(this._canvas);
    domClasses(this._canvas.getContainer()).add('heatmap-shown');
  }

  destroyHeatmap() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }

    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
  }

  clear() {
    if (this._heatmap) {
      this._heatmap.clear();
    }
  }
}

Heatmap.$inject = ['canvas', 'eventBus', 'elementRegistry', 'tokenSimulationPalette', 'toggleMode'];

function isAny(element, types) {
  return types.some(t => is(element, t));
}
