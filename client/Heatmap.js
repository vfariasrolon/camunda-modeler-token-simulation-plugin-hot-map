// client/Heatmap.js
import h337 from 'heatmap.js';
import { domify, event as domEvent } from 'min-dom';
import { find } from 'min-dash';

import {
  RESET_SIMULATION_EVENT,
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

import {
  isAny,
  is,
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

// SVG Icon Data
const BroomIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="none" d="M0 0h24v24H0z"/><path fill="currentColor" d="M19.36 2.72l-2.08 2.08c-1.17-0.37-2.44-0.37-3.61 0l-2.4-2.4c-1.56-1.56-4.09-1.56-5.66 0l-2.83 2.83c-1.56 1.56-1.56 4.09 0 5.66l2.4 2.4c-0.37 1.17-0.37 2.44 0 3.61l-2.08 2.08c-1.56 1.56-1.56 4.09 0 5.66l2.83 2.83c1.56 1.56 4.09 1.56 5.66 0l2.08-2.08c1.17 0.37 2.44 0.37 3.61 0l2.4 2.4c1.56 1.56 4.09 1.56 5.66 0l2.83-2.83c1.56-1.56-1.56-4.09 0-5.66l-2.4-2.4c0.37-1.17 0.37-2.44 0-3.61l2.08-2.08c1.56-1.56 1.56-4.09 0-5.66l-2.83-2.83c-1.56-1.57-4.09-1.57-5.66 0zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>`;
const BrushIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path d="M0 0h24v24H0z" fill="none"/><path fill="currentColor" d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 12.25 11.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z"/></svg>`;

// helper to create a reusable icon component
function createIcon(svg) {
  return function Icon(className = '') {
    // bts-icon is the class used by the parent plugin for styling
    return `<span class="bts-icon ${ className }">${svg}</span>`;
  };
}

const BroomIcon = createIcon(BroomIconSVG);
const BrushIcon = createIcon(BrushIconSVG);

export default function Heatmap(
    canvas,
    elementRegistry,
    eventBus,
    tokenSimulationPalette,
    toggleMode
) {
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._eventBus = eventBus;
  this._tokenSimulationPalette = tokenSimulationPalette;
  this._toggleMode = toggleMode;
  this.heatmapInstance = null;
  this.heatmapCanvas = null;

  this._init();

  eventBus.on('canvas.viewbox.changed', () => {
    this.updateTransform();
  });

  eventBus.on(RESET_SIMULATION_EVENT, () => {
    this.clearHeatmap();
  });

  eventBus.on(TOGGLE_MODE_EVENT, event => {
    if (!event.active) {
      this.removeHeatmap();
    } else {
      this.updateTransform();
    }
  });
}

Heatmap.prototype.updateTransform = function() {
  if (!this.heatmapCanvas) {
    return;
  }
  const viewbox = this._canvas.viewbox();
  const { scale, x, y } = viewbox;
  this.heatmapCanvas.style.transform = `matrix(${scale}, 0, 0, ${scale}, ${x}, ${y})`;
};

Heatmap.prototype._init = function() {
  const self = this;

  const heatmapButton = domify(`
    <div class="bts-entry" title="Generate Heatmap from Extension Properties">
      ${ BroomIcon() }
    </div>
  `);

  domEvent.bind(heatmapButton, 'click', () => {
    console.log('[Heatmap] Generating heatmap from properties...');
    self.generateHeatmapFromProperties();
  });

  this._tokenSimulationPalette.addEntry(heatmapButton, 4);

  const testButton = domify(`
    <div class="bts-entry" title="Generate Test Heatmap">
      ${ BrushIcon() }
    </div>
  `);

  domEvent.bind(testButton, 'click', () => {
    console.log('[Heatmap] Testing heatmap with hardcoded values...');
    self.setHardcodedTimesAndGenerate();
  });

  this._tokenSimulationPalette.addEntry(testButton, 5);
};

Heatmap.prototype.setHardcodedTimesAndGenerate = function() {
  setTimeout(() => {
    const dataPoints = [];
    const elementTimes = new Map();
    let maxTime = 0;

    if (this._toggleMode.active) {
      return;
    }

    const allElements = this._elementRegistry.getAll();
    const nodesToColor = allElements.filter(element => isAny(element, [
      'bpmn:Task', 'bpmn:CallActivity', 'bpmn:StartEvent', 'bpmn:EndEvent',
      'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway', 'bpmn:IntermediateCatchEvent', 'bpmn:SubProcess'
    ]));
    const flows = allElements.filter(element => is(element, 'bpmn:SequenceFlow'));

    nodesToColor.forEach(node => {
      const time = Math.floor(Math.random() * 100) + 1;
      elementTimes.set(node.id, time);
      if (time > maxTime) maxTime = time;
    });

    if (maxTime === 0) {
      this.clearHeatmap();
      return;
    }

    const bbox = this._canvas.getAbsoluteBBox();
    const heatmap = this.getOrCreateHeatmapInstance(bbox);

    nodesToColor.forEach(node => {
      const time = elementTimes.get(node.id);
      const x = Math.round(node.x + node.width / 2) - bbox.x;
      const y = Math.round(node.y + node.height / 2) - bbox.y;
      const value = Math.round((time / maxTime) * 100);
      dataPoints.push({ x, y, value, radius: 40 });
    });

    flows.forEach(flow => {
      if (flow && flow.waypoints) {
        const sourceTime = flow.source && elementTimes.get(flow.source.id);
        if (sourceTime) {
          const value = Math.round((sourceTime / maxTime) * 100);
          const pathPoints = getPointsAlongPath(flow.waypoints);
          pathPoints.forEach(point => {
            dataPoints.push({ x: point.x - bbox.x, y: point.y - bbox.y, value, radius: 15 });
          });
        }
      }
    });

    console.log('[Heatmap] Generated hardcoded data points:', dataPoints);
    heatmap.setData({ max: 100, data: dataPoints });
    this.updateTransform();
  }, 0);
};

Heatmap.prototype.generateHeatmapFromProperties = function() {
  setTimeout(() => {
    const dataPoints = [];
    const elementTimes = new Map();
    let maxTime = 0;

    const allElements = this._elementRegistry.getAll();
    const nodesToColor = allElements.filter(element => isAny(element, [
      'bpmn:Task', 'bpmn:CallActivity', 'bpmn:StartEvent', 'bpmn:EndEvent',
      'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway', 'bpmn:IntermediateCatchEvent', 'bpmn:SubProcess'
    ]));
    const flows = allElements.filter(element => is(element, 'bpmn:SequenceFlow'));

    nodesToColor.forEach((node) => {
      const businessObject = getBusinessObject(node);
      const extensionElements = businessObject.get('extensionElements');
      if (extensionElements) {
        const camundaProperties = find(extensionElements.get('values'), v => is(v, 'camunda:Properties'));
        if (camundaProperties) {
          const properties = camundaProperties.get('values');
          const timeProperty = find(properties, p => p.name === 'tiempoSimulacion');
          if (timeProperty && timeProperty.value) {
            // User can enter seconds, we use them directly.
            // If they enter ms, it will also work, just be a larger number.
            const time = parseInt(timeProperty.value, 10) || 0;
            if (time > 0) {
              elementTimes.set(node.id, time);
              if (time > maxTime) maxTime = time;
            }
          }
        }
      }
    });

    if (maxTime === 0) {
      this.clearHeatmap();
      console.log('[Heatmap] No \'tiempoSimulacion\' extension properties found. Clearing heatmap.');
      return;
    }

    const bbox = this._canvas.getAbsoluteBBox();
    const heatmap = this.getOrCreateHeatmapInstance(bbox);

    nodesToColor.forEach((node) => {
      const time = elementTimes.get(node.id) || 0;
      if (time > 0) {
        const x = Math.round(node.x + node.width / 2) - bbox.x;
        const y = Math.round(node.y + node.height / 2) - bbox.y;
        const value = Math.round((time / maxTime) * 100);
        dataPoints.push({ x, y, value, radius: 40 });
      }
    });

    flows.forEach(flow => {
      if (flow && flow.waypoints) {
        const sourceTime = flow.source && elementTimes.get(flow.source.id);
        if (sourceTime) {
          const value = Math.round((sourceTime / maxTime) * 100);
          const pathPoints = getPointsAlongPath(flow.waypoints);
          pathPoints.forEach(point => {
            dataPoints.push({ x: point.x - bbox.x, y: point.y - bbox.y, value, radius: 15 });
          });
        }
      }
    });

    console.log('[Heatmap] Generated data points from extension properties:', dataPoints);
    heatmap.setData({ max: 100, data: dataPoints });
    this.updateTransform();
  }, 0);
};

Heatmap.prototype.clearHeatmap = function() {
  if (this.heatmapInstance) {
    this.heatmapInstance.setData({ max: 1, data: [] });
    console.log('[Heatmap] Cleared heatmap data.');
  }
};

Heatmap.prototype.removeHeatmap = function() {
  if (this.heatmapInstance) {
    if (this.heatmapCanvas && this.heatmapCanvas.parentNode) {
      this.heatmapCanvas.parentNode.removeChild(this.heatmapCanvas);
    }
    this.heatmapInstance = null;
    this.heatmapCanvas = null;
    console.log('[Heatmap] Heatmap instance removed.');
  }
};

Heatmap.prototype.getOrCreateHeatmapInstance = function(bbox) {
  const container = this._canvas.getContainer();

  if (!this.heatmapInstance) {
    this.heatmapInstance = h337.create({
      container: container,
      radius: 20,
      maxOpacity: .5,
      minOpacity: 0,
      blur: .90
    });

    this.heatmapCanvas = container.querySelector('.heatmap-canvas');

    this.heatmapCanvas.style.position = 'absolute';
    this.heatmapCanvas.style.pointerEvents = 'none';
    this.heatmapCanvas.style.zIndex = 1;
    this.heatmapCanvas.style.transformOrigin = 'top left';
  }

  // Set canvas dimensions and position based on diagram bounding box
  this.heatmapCanvas.width = bbox.width;
  this.heatmapCanvas.height = bbox.height;
  this.heatmapCanvas.style.left = `${bbox.x}px`;
  this.heatmapCanvas.style.top = `${bbox.y}px`;

  return this.heatmapInstance;
};

Heatmap.$inject = [
  'canvas',
  'elementRegistry',
  'eventBus',
  'tokenSimulationPalette',
  'toggleMode'
];

// helpers //////////////////////

function getPointsAlongPath(waypoints) {
  const points = [];
  const density = 5;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];

    const deltaX = p2.x - p1.x;
    const deltaY = p2.y - p1.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const numPoints = Math.floor(distance / density);

    points.push({ x: p1.x, y: p1.y });

    for (let j = 1; j <= numPoints; j++) {
      const t = j / (numPoints + 1);
      const x = Math.round(p1.x + t * deltaX);
      const y = Math.round(p1.y + t * deltaY);
      points.push({ x, y });
    }
  }
  points.push(waypoints[waypoints.length - 1]);
  return points;
}
