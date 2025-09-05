import {
  domify,
  query,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

import {
  find
} from 'min-dash';

import {
  is,
  isAny
} from 'bpmn-js/lib/util/ModelUtil';

import {
  RESET_SIMULATION_EVENT,
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

import h337 from 'heatmap.js';

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

const DEBOUNCE_DELAY = 50; // ms

export default class Heatmap {
  constructor(canvas, eventBus, elementRegistry, tokenSimulationPalette, toggleMode) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._toggleMode = toggleMode;

    this._heatmap = null;
    this._heatmapContainer = null;

    this._debouncedRenderManually = this._debounce(this.renderManually.bind(this), DEBOUNCE_DELAY);

    eventBus.on('canvas.viewbox.changed', this._debouncedRenderManually, this);
    eventBus.on('canvas.resized', this._debouncedRenderManually, this);

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
      <div class="bts-entry" title="Generate Heatmap from Extension Properties">
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
  }

  _debounce(func, delay) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }

  _isSupported(element) {
    return isAny(element, [
      'bpmn:Task', 'bpmn:CallActivity', 'bpmn:StartEvent', 'bpmn:EndEvent',
      'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway', 'bpmn:IntermediateCatchEvent', 'bpmn:SubProcess'
    ]);
  }

  _getSimulationTime(element) {
    const businessObject = element.businessObject;
    if (!businessObject.extensionElements || !businessObject.extensionElements.values) {
      return 0;
    }
    const properties = find(businessObject.extensionElements.values, v => is(v, 'camunda:Properties'));
    if (!properties || !properties.values) {
      return 0;
    }
    const timeProperty = find(properties.values, p => p.name === 'tiempoSimulacion');
    if (!timeProperty || !timeProperty.value) {
      return 0;
    }
    const time = parseInt(timeProperty.value, 10);
    return isNaN(time) ? 0 : time;
  }

  _getHeatmapData() {
    const allSupportedElements = this._elementRegistry.filter(element => this._isSupported(element));
    let max = 0;

    const bbox = this._getBBox(allSupportedElements);

    if (!bbox.width || !bbox.height) {
      return { dataPoints: [], max: 0, bbox };
    }

    const dataPoints = allSupportedElements.map(element => {
      const value = this._getSimulationTime(element);

      if (value > 0) {
        console.log(`[Heatmap] -> Element ID: ${element.id}, Time: ${value}`);
      }
      if (value > max) max = value;

      return {
        elementId: element.id,
        x: Math.round(element.x + element.width / 2) - bbox.x,
        y: Math.round(element.y + element.height / 2) - bbox.y,
        value: value,
        radius: Math.round(Math.max(element.width, element.height) / 2)
      };
    }).filter(point => point.value > 0);

    return { dataPoints, max: max || 100, bbox };
  }

  renderManually() {
    if (!this._heatmap) {
      return;
    }

    const viewbox = this._canvas.viewbox();
    const scale = viewbox.scale;

    const {
      dataPoints,
      max,
      bbox
    } = this._getHeatmapData();

    if (!bbox || !bbox.width || !bbox.height) {
      this._heatmap.setData({ max: 0, data: [] });
      return;
    }

    const newWidth = Math.round(bbox.width * scale);
    const newHeight = Math.round(bbox.height * scale);
    const newX = (bbox.x - viewbox.x) * scale;
    const newY = (bbox.y - viewbox.y) * scale;

    this._heatmapContainer.style.left = `${newX}px`;
    this._heatmapContainer.style.top = `${newY}px`;
    this._heatmapContainer.style.width = `${newWidth}px`;
    this._heatmapContainer.style.height = `${newHeight}px`;

    const heatmapCanvas = this._heatmapContainer.querySelector('.heatmap-canvas');
    if (heatmapCanvas) {
      heatmapCanvas.width = newWidth;
      heatmapCanvas.height = newHeight;
    }

    const scaledDataPoints = dataPoints.map(p => ({
      x: Math.round(p.x * scale),
      y: Math.round(p.y * scale),
      value: p.value,
      radius: Math.round(p.radius * scale)
    }));

    this._heatmap.setData({
      max: max,
      data: scaledDataPoints
    });
  }

  _updateDataAndRedraw() {
    if (this._toggleMode.active) {
      console.warn('[Heatmap] Please stop simulation before generating a heatmap.');
      return;
    }

    if (!this._heatmap) {
      this.createHeatmap();
    }

    this.renderManually();
  }

  showHeatmapFromProperties() {
    this._updateDataAndRedraw();
  }

  // A robust, manual bounding box calculation
  _getBBox(elements) {
    if (!elements.length) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;

    elements.forEach(element => {
      minX = Math.min(minX, element.x);
      minY = Math.min(minY, element.y);
      maxX = Math.max(maxX, element.x + element.width);
      maxY = Math.max(maxY, element.y + element.height);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  createHeatmap() {
    const parentContainer = query('.djs-overlay-container');
    if (!parentContainer) {
      console.error('[Heatmap] Could not find .djs-overlay-container to initialize heatmap.');
      return;
    }

    // Create a container that we can position and size manually.
    const heatmapContainer = domify('<div class="heatmap-container" style="position: absolute; top: 0; left: 0;"></div>');
    heatmapContainer.style.pointerEvents = 'none';

    parentContainer.appendChild(heatmapContainer);
    this._heatmapContainer = heatmapContainer;

    this._heatmap = h337.create({ container: heatmapContainer });

    domClasses(this._canvas.getContainer()).add('heatmap-shown');
  }

  destroyHeatmap() {
    if (!this._heatmap) return;

    if (this._heatmapContainer && this._heatmapContainer.parentNode) {
      this._heatmapContainer.parentNode.removeChild(this._heatmapContainer);
    }

    this._heatmap = null;
    this._heatmapContainer = null;
    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
  }

  clear() {
    if (this._heatmap) {
      this._heatmap.setData({ max: 0, data: [] });
    }
  }
}

Heatmap.$inject = ['canvas', 'eventBus', 'elementRegistry', 'tokenSimulationPalette', 'toggleMode'];

function isAny(element, types) {
  return types.some(t => is(element, t));
}
