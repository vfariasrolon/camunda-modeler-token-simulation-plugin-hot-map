// client/Heatmap.js
import h337 from 'heatmap.js';
import { domify, event as domEvent } from 'min-dom';

import {
  RESET_SIMULATION_EVENT,
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

import {
  isAny,
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';


function FireIcon() {
  return '<i class="fa fa-fire"></i>';
}

function TestIcon() {
  return '<i class="fa fa-flask"></i>';
}

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

  this._init();

  // Clear heatmap on simulation reset
  eventBus.on(RESET_SIMULATION_EVENT, () => {
    this.clearHeatmap();
  });

  // Clear and remove heatmap when simulation is toggled off
  eventBus.on(TOGGLE_MODE_EVENT, event => {
    if (!event.active) {
      this.removeHeatmap();
    }
  });
}

Heatmap.prototype._init = function() {
  const self = this;

  // 1. Generate Heatmap Button
  const heatmapButton = domify(`
    <div class="bts-entry" title="Generate Heatmap from Simulation Times">
      ${ FireIcon() }
    </div>
  `);

  domEvent.bind(heatmapButton, 'click', () => {
    console.log('[Heatmap] Generating heatmap from properties...');
    self.generateHeatmapFromProperties();
  });

  this._tokenSimulationPalette.addEntry(heatmapButton, 4);

  // 2. Test Heatmap Button
  const testButton = domify(`
    <div class="bts-entry" title="Test Heatmap with Hardcoded Values">
      ${ TestIcon() }
    </div>
  `);

  domEvent.bind(testButton, 'click', () => {
    console.log('[Heatmap] Testing heatmap with hardcoded values...');
    self.setHardcodedTimesAndGenerate();
  });

  this._tokenSimulationPalette.addEntry(testButton, 5);
};

Heatmap.prototype.setHardcodedTimesAndGenerate = function() {

  // Test button should only work when simulation is off
  if (this._toggleMode.active) {
    this._toggleMode.toggleMode(false);
  }

  // Use a timeout to ensure toggleMode event processing is complete
  setTimeout(() => {
    // First, clear any existing data
    this._eventBus.fire('heatmap.data.clear');

    const tasks = this._elementRegistry.filter(element => {
      return isAny(element, ['bpmn:Task', 'bpmn:CallActivity']);
    });

    // Fire events to update the model for each task
    tasks.forEach(task => {
      this._eventBus.fire('heatmap.test.update', {
        element: task,
        time: Math.floor(Math.random() * 5000) + 500 // Random time for visual variety
      });
    });

    console.log('[Heatmap] Hardcoded values set via events. Generating heatmap.');

    // Use another timeout to allow the model updates to process before generating the heatmap
    setTimeout(() => {
      this.generateHeatmapFromProperties();
    }, 100);

  }, 100);
};


Heatmap.prototype.generateHeatmapFromProperties = function() {
  const heatmap = this.getOrCreateHeatmapInstance();
  const dataPoints = [];
  let maxTime = 0;

  const tasks = this._elementRegistry.filter(function(element) {
    return isAny(element, ['bpmn:Task', 'bpmn:CallActivity']);
  });

  tasks.forEach((task) => {
    const businessObject = getBusinessObject(task);
    const extensionElements = businessObject.get('extensionElements');

    if (!extensionElements) {
      return;
    }

    const values = extensionElements.get('values');
    if (!values) {
        return;
    }

    const heatmapData = values.find(v => v.$type === 'heatmap:Data');

    if (!heatmapData) {
      return;
    }

    const time = parseInt(heatmapData.get('tiempoSimulacion'), 10) || 0;

    if (time > maxTime) {
      maxTime = time;
    }
  });

  if (maxTime === 0) {
    this.clearHeatmap();
    console.log('[Heatmap] No simulation data found. Clearing heatmap.');
    return;
  }

  tasks.forEach((task) => {
    const businessObject = getBusinessObject(task);
    const extensionElements = businessObject.get('extensionElements');

    if (!extensionElements) {
      return;
    }

    const values = extensionElements.get('values');
    if (!values) {
        return;
    }

    const heatmapData = values.find(v => v.$type === 'heatmap:Data');

    if (!heatmapData) {
      return;
    }

    const time = parseInt(heatmapData.get('tiempoSimulacion'), 10) || 0;

    if (time > 0) {
      const x = Math.round(task.x + task.width / 2);
      const y = Math.round(task.y + task.height / 2);
      const value = Math.round((time / maxTime) * 100);
      dataPoints.push({ x, y, value });
    }
  });

  console.log('[Heatmap] Generated data points:', dataPoints);

  heatmap.setData({
    max: 100, // We normalized our values to be between 0 and 100
    data: dataPoints
  });
};

Heatmap.prototype.clearHeatmap = function() {
  if (this.heatmapInstance) {
    this.heatmapInstance.setData({ max: 1, data: [] });
    console.log('[Heatmap] Cleared heatmap data.');
  }
};

Heatmap.prototype.removeHeatmap = function() {
  if (this.heatmapInstance) {
    const container = this._canvas.getContainer();
    const heatmapCanvas = container.querySelector('.heatmap-canvas');
    if (heatmapCanvas) {
      heatmapCanvas.remove();
    }
    this.heatmapInstance = null;
    console.log('[Heatmap] Heatmap instance removed.');
  }
};

Heatmap.prototype.getOrCreateHeatmapInstance = function() {
  if (!this.heatmapInstance) {
    const container = this._canvas.getContainer();

    // Ensure no old canvas exists
    const oldCanvas = container.querySelector('.heatmap-canvas');
    if (oldCanvas) {
      oldCanvas.remove();
    }

    this.heatmapInstance = h337.create({
      container: container,
      radius: 50,
      maxOpacity: .5,
      minOpacity: 0,
      blur: .75
    });
    const heatmapCanvas = container.querySelector('.heatmap-canvas');
    heatmapCanvas.style.pointerEvents = 'none';
    heatmapCanvas.style.position = 'absolute';
    heatmapCanvas.style.top = 0;
    heatmapCanvas.style.left = 0;
    heatmapCanvas.style.zIndex = -1; // Put it behind the diagram elements
  }
  return this.heatmapInstance;
};


Heatmap.$inject = [
  'canvas',
  'elementRegistry',
  'eventBus',
  'tokenSimulationPalette',
  'toggleMode'
];
