// client/Heatmap.js
import h337 from 'heatmap.js';

function FireIcon() {
  return '<i class="fa fa-fire"></i>';
}

export default function Heatmap(
    canvas,
    elementRegistry,
    palette
) {
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._palette = palette;
  this.heatmapInstance = null;

  palette.registerProvider(this);
}

Heatmap.prototype.getPaletteEntries = function(element) {
  const self = this;

  return {
    'generate-heatmap': {
      group: 'tools',
      className: 'fa-fire',
      title: 'Generate Heatmap from Simulation Times',
      action: {
        click: function(event) {
          console.log('[Heatmap] Generating heatmap from properties...');
          self.generateHeatmapFromProperties();
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
    return element.type.includes('Task');
  });

  tasks.forEach(function(task) {
    // Read the custom property, default to 1 if not set
    const time = task.businessObject.get('heatmap:tiempoSimulacion') || 1;

    if (time > maxTime) {
      maxTime = time;
    }
  });

  if (maxTime === 0) {
    heatmap.setData({ max: 1, data: [] }); // Clear heatmap
    return;
  }

  tasks.forEach(function(task) {
    const time = task.businessObject.get('heatmap:tiempoSimulacion') || 1;

    const x = Math.round(task.x + task.width / 2);
    const y = Math.round(task.y + task.height / 2);
    const value = Math.round((time / maxTime) * 100);
    dataPoints.push({ x, y, value });
  });

  console.log('[Heatmap] Generated data points:', dataPoints);

  heatmap.setData({
    max: 100,
    data: dataPoints
  });
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
  }
  return this.heatmapInstance;
};


Heatmap.$inject = [
  'canvas',
  'elementRegistry',
  'palette'
];
