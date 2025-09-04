// client/Heatmap.js
import h337 from 'heatmap.js';

import {
  isAny,
  getBusinessObject
} from 'bpmn-js/lib/util/ModelUtil';

function FireIcon() {
  return '<i class="fa fa-fire"></i>';
}

function ClearIcon() {
    return '<i class="fa fa-trash"></i>';
}

export default function Heatmap(
    canvas,
    elementRegistry,
    palette,
    eventBus
) {
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._palette = palette;
  this._eventBus = eventBus;
  this.heatmapInstance = null;

  palette.registerProvider(this);

  // Remove heatmap when diagram is cleared or a new one is imported
  eventBus.on(['diagram.clear', 'import.done'], () => {
    this.removeHeatmap();
  });
}

Heatmap.prototype.getPaletteEntries = function() {
  const self = this;

  return {
    'generate-heatmap': {
      group: 'tools',
      className: 'bpmn-icon-heatmap',
      title: 'Generate Heatmap',
      action: {
        click: function() {
          console.log('[Heatmap] Generating heatmap from properties...');
          self.generateHeatmapFromProperties();
        }
      }
    },
    'clear-heatmap': {
      group: 'tools',
      className: 'bpmn-icon-clear',
      title: 'Clear Heatmap',
      action: {
        click: function() {
          console.log('[Heatmap] Clearing heatmap...');
          self.removeHeatmap();
        }
      }
    }
  };
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
    heatmap.setData({ max: 1, data: [] }); // Clear heatmap
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
    max: 100,
    data: dataPoints
  });
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
    // Setting z-index to be behind the diagram but in front of the background
    heatmapCanvas.style.zIndex = 0;
  }
  return this.heatmapInstance;
};

Heatmap.$inject = [
  'canvas',
  'elementRegistry',
  'palette',
  'eventBus'
];
