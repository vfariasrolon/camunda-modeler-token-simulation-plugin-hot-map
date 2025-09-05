import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

import {
  find
} from 'min-dash';

import {
  getBusinessObject,
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  RESET_SIMULATION_EVENT,
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

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

const LOW_COLOR = '#54b454'; // green
const MID_COLOR = '#ffc800'; // yellow
const HIGH_COLOR = '#cc4237'; // red

export default class Heatmap {
  constructor(canvas, eventBus, elementRegistry, tokenSimulationPalette, toggleMode, modeling) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._toggleMode = toggleMode;
    this._modeling = modeling;

    this._originalColors = new Map();

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

  _isSupported(element) {
    return isAny(element, [
      'bpmn:Task', 'bpmn:CallActivity', 'bpmn:StartEvent', 'bpmn:EndEvent',
      'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway', 'bpmn:IntermediateCatchEvent', 'bpmn:SubProcess'
    ]);
  }

  _getSimulationTime(element) {
    const businessObject = getBusinessObject(element);
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

    const dataPoints = allSupportedElements.map(element => {
      const value = this._getSimulationTime(element);
      if (value > max) max = value;
      return { element, value };
    }).filter(point => point.value > 0);

    return { dataPoints, max: max || 1 };
  }

  _updateDataAndRedraw() {
    if (this._toggleMode.active) {
      return;
    }

    // Always clear previous state before drawing new one
    this.clear();

    const { dataPoints, max } = this._getHeatmapData();

    const elementsToColor = [];

    dataPoints.forEach(point => {
      const { element, value } = point;
      const newColor = this._getColor(value, max);
      const businessObject = getBusinessObject(element);

      // Store original color if not already stored
      if (!this._originalColors.has(element.id)) {
        const originalColor = {
          fill: businessObject.get('di:fill'),
          stroke: businessObject.get('di:stroke')
        };
        this._originalColors.set(element.id, originalColor);
      }

      elementsToColor.push({
        element: element,
        colors: {
          fill: newColor,
          stroke: '#000000' // Keep stroke black for better visibility
        }
      });
    });

    // Apply colors individually.
    // The setColor command is recorded on the command stack, so this is undo-able.
    if (elementsToColor.length > 0) {
      elementsToColor.forEach(c => {
        this._modeling.setColor([c.element], {
          fill: c.colors.fill,
          stroke: c.colors.stroke
        });
      });

      domClasses(this._canvas.getContainer()).add('heatmap-shown');
    }
  }

  _getColor(value, max) {
    const ratio = value / max;
    if (ratio < 0.5) {
      return LOW_COLOR;
    } else if (ratio < 0.8) {
      return MID_COLOR;
    } else {
      return HIGH_COLOR;
    }
  }

  showHeatmapFromProperties() {
    this._updateDataAndRedraw();
  }

  destroyHeatmap() {
    if (this._originalColors.size === 0) {
      return;
    }

    const elementsToRestore = [];
    for (const [id, colors] of this._originalColors.entries()) {
      const element = this._elementRegistry.get(id);
      if (element) {
        elementsToRestore.push({ element, colors });
      }
    }

    // Restore colors individually
    elementsToRestore.forEach(item => {
      this._modeling.setColor([item.element], {
        fill: item.colors.fill,
        stroke: item.colors.stroke
      });
    });

    this._originalColors.clear();
    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
  }

  clear() {
    this.destroyHeatmap();
  }
}

Heatmap.$inject = ['canvas', 'eventBus', 'elementRegistry', 'tokenSimulationPalette', 'toggleMode', 'modeling'];

function isAny(element, types) {
  return types.some(t => is(element, t));
}
