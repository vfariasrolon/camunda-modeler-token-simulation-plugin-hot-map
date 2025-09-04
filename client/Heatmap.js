import {
  domify,
  query,
  classes as domClasses
} from 'min-dom';

import {
  find
} from 'min-dash';

import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

import h337 from 'heatmap.js';

const DEBOUNCE_DELAY = 10; // Use a small delay for responsiveness

export default class Heatmap {
  constructor(canvas, eventBus, elementRegistry) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;

    this._heatmap = null;
    this._heatmapContainer = null;
    this._isRandom = false;

    // A debounced version of the transform update function
    this._debouncedUpdateTransform = this._debounce(this._updateTransform.bind(this), DEBOUNCE_DELAY);

    // On viewbox change, update the transform
    eventBus.on('canvas.viewbox.changed', this._updateTransform, this);
    eventBus.on('canvas.resized', this._debouncedUpdateTransform, this);

    eventBus.on('toggle-simulation-heatmap.toggle', this.toggleHeatmap, this);
    eventBus.on('generate-random-data', this.generateRandomData, this);

    eventBus.on('import.done', () => {
      if (this._heatmap) {
        this.destroyHeatmap();
      }
    });
  }

  _debounce(func, delay) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }

  _updateTransform() {
    if (!this._heatmapContainer) {
      return;
    }
    const overlayContainer = query('.djs-overlay-container', this._canvas.getContainer());
    if (overlayContainer) {
      // Copy transform and transformOrigin from the bpmn-js overlay container
      // This is the key to keeping the heatmap aligned with the diagram
      this._heatmapContainer.style.transform = overlayContainer.style.transform;
      this._heatmapContainer.style.transformOrigin = overlayContainer.style.transformOrigin;
    }
  }

  _isSupported(element) {
    return element && [
      'bpmn:Task',
      'bpmn:UserTask',
      'bpmn:ScriptTask',
      'bpmn:ServiceTask',
      'bpmn:ManualTask',
      'bpmn:ReceiveTask',
      'bpmn:SendTask',
      'bpmn:BusinessRuleTask',
      'bpmn:SubProcess',
      'bpmn:Event',
      'bpmn:StartEvent',
      'bpmn:EndEvent',
      'bpmn:IntermediateThrowEvent',
      'bpmn:BoundaryEvent',
      'bpmn:ExclusiveGateway',
      'bpmn:ParallelGateway',
      'bpmn:InclusiveGateway',
      'bpmn:ComplexGateway',
      'bpmn:EventBasedGateway'
    ].includes(element.type);
  }

  _getSimulationTime(element) {
    const businessObject = element.businessObject;
    let time = 0;

    if (businessObject.extensionElements && businessObject.extensionElements.values) {
      const properties = find(businessObject.extensionElements.values, v => is(v, 'camunda:Properties'));
      if (properties && properties.values) {
        const timeProperty = find(properties.values, p => p.name === 'tiempoSimulacion');
        if (timeProperty && timeProperty.value) {
          time = parseInt(timeProperty.value, 10);
        }
      }
    }
    return isNaN(time) ? 0 : time;
  }

  _getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  _getHeatmapData(isRandom) {
    const elements = this._elementRegistry.filter(element => this._isSupported(element));
    let max = 0;

    const dataPoints = elements.map(element => {
      const value = isRandom ? this._getRandomInt(1, 100) : this._getSimulationTime(element);

      if (value > max) {
        max = value;
      }

      // Use absolute diagram coordinates because the container is transformed
      return {
        x: Math.round(element.x + element.width / 2),
        y: Math.round(element.y + element.height / 2),
        value: value,
        radius: Math.round(Math.max(element.width, element.height) / 1.2)
      };
    }).filter(point => point.value > 0);

    return { dataPoints, max: max || 100 };
  }

  _updateDataAndRedraw(isRandom) {
    if (!this._heatmap) {
      return;
    }
    this._isRandom = isRandom;
    const { dataPoints, max } = this._getHeatmapData(isRandom);
    this._heatmap.setData({ max: max, data: dataPoints });
    this._updateTransform(); // Ensure position is correct on first draw
  }

  toggleHeatmap() {
    if (!this._heatmap) {
      this.createHeatmap();
    } else {
      this.destroyHeatmap();
    }
  }

  createHeatmap() {
    const container = this._canvas.getContainer();
    const djsContainer = query('.djs-container', container);

    // Create our own container for the heatmap and append it to the djs-container
    this._heatmapContainer = domify('<div class="heatmap-layer" style="position: absolute; top: 0; left: 0; pointer-events: none;"></div>');
    djsContainer.appendChild(this._heatmapContainer);

    this._heatmap = h337.create({
      container: this._heatmapContainer,
    });

    domClasses(container).add('heatmap-shown');
    this._updateDataAndRedraw(false);
  }

  destroyHeatmap() {
    const container = this._canvas.getContainer();
    if (this._heatmap) {
      this.clear();
    }
    if (this._heatmapContainer && this._heatmapContainer.parentNode) {
      this._heatmapContainer.parentNode.removeChild(this._heatmapContainer);
    }
    this._heatmap = null;
    this._heatmapContainer = null;
    domClasses(container).remove('heatmap-shown');
  }

  generateRandomData() {
    if (!this._heatmap) {
      this.createHeatmap();
    }
    this._updateDataAndRedraw(true);
  }

  clear() {
    if (this._heatmap) {
      this._heatmap.setData({ max: 0, data: [] });
    }
  }
}

Heatmap.$inject = ['canvas', 'eventBus', 'elementRegistry'];
