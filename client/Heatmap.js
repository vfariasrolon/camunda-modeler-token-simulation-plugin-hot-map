// client/Heatmap.js
import {
  domify,
  event as domEvent
} from 'min-dom';

import h337 from 'heatmap.js';

const FireSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" height="16" width="16"><path fill="currentColor" d="M216 23.86c0-13.1-13.43-23.86-30-23.86C76.43 0 0 125.14 0 224c0 77.33 52.24 142.86 122.29 164.96.4.13.8.26 1.19.39C128.32 399.73 138.6 416 160 416c35.35 0 64-28.65 64-64s-28.65-64-64-64c-17.67 0-33.58 7.16-45.25 18.83-11.43-12.43-18.75-28.17-18.75-45.25 0-33.33 22.86-61.57 53.71-69.71 2.33-27.05 24.25-48.83 51.29-48.83 28.28 0 51.29 22.95 51.29 51.29 0 28.28-22.95 51.29-51.29 51.29-2.22 0-4.4-.15-6.55-.42-2.84 13.9-8.39 26.58-15.45 37.64 16.71 13.1 27 34.29 27 57.57 0 39.76-32.24 72-72 72-14.93 0-28.7-4.59-40-12.42-3.17 14.24-11.16 26.54-22.29 34.93C144.5 450.4 192 480 248 480c88.37 0 160-125.14 160-224S327.63 0 216 0c-2.49 0-4.93.09-7.33.25C207.2 1.34 208 2.62 208 4.14v19.72z"/></svg>`;

function FireIcon() {
  return `<span class="bts-icon">${FireSVG}</span>`;
}

const VERY_HIGH_PRIORITY = 10000;

export default function Heatmap(
    eventBus,
    canvas,
    elementRegistry,
    tokenSimulationPalette
) {
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._tokenSimulationPalette = tokenSimulationPalette;
  this.heatmapInstance = null;
  this.heatmapVisible = true;
  this.simulationData = {};
  this.scopeStartTimes = {};

  eventBus.on('tokenSimulation.toggleMode', ({ active }) => {
    if (active) {
      this.addHeatmapToggleButton();
      this.resetState();
    } else if (this.heatmapInstance) {
      this.heatmapInstance.setData({ max: 1, data: [] });
    }
  });

  eventBus.on('tokenSimulation.simulator.ended', () => {
    this.drawHeatmap();
  });

  eventBus.on('tokenSimulation.simulator.trace', VERY_HIGH_PRIORITY, (event) => {
    const {
      element,
      scope,
      action
    } = event;

    // We are only interested in tasks
    if (!element.type.includes('Task')) {
      return;
    }

    console.log(`[DEBUG] Trace Event: ${action} on ${element.id}`);

    const scopeId = scope.id;

    if (action === 'enter') {
      this.scopeStartTimes[scopeId] = new Date().getTime();
    } else if (action === 'exit') {
      const startTime = this.scopeStartTimes[scopeId];
      if (startTime) {
        const endTime = new Date().getTime();
        const duration = endTime - startTime;
        const elementId = element.id;

        if (!this.simulationData[elementId]) {
          this.simulationData[elementId] = {
            name: element.businessObject.name || elementId,
            count: 0,
            totalTime: 0
          };
        }
        this.simulationData[elementId].count++;
        this.simulationData[elementId].totalTime += duration;

        delete this.scopeStartTimes[scopeId];
      }
    }
  });
}

Heatmap.prototype.resetState = function() {
  this.simulationData = {};
  this.scopeStartTimes = {};
  if (this.heatmapInstance) {
    this.heatmapInstance.setData({ max: 1, data: [] });
  }
};

Heatmap.prototype.addHeatmapToggleButton = function() {
  if (document.querySelector('.bts-entry[title="Toggle Heatmap Visibility"]')) {
    return;
  }

  const paletteEntry = domify(`
    <div class="bts-entry" title="Toggle Heatmap Visibility">
      ${ FireIcon() }
    </div>
  `);

  domEvent.bind(paletteEntry, 'click', () => {
    this.heatmapVisible = !this.heatmapVisible;
    const heatmapCanvas = this.heatmapInstance.get('canvas');
    heatmapCanvas.style.display = this.heatmapVisible ? 'block' : 'none';
  });

  this._tokenSimulationPalette.addEntry(paletteEntry, 4);
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

Heatmap.prototype.drawHeatmap = function() {
  const heatmap = this.getOrCreateHeatmapInstance();
  const dataPoints = [];
  let maxTime = 0;

  for (const elementId in this.simulationData) {
    const data = this.simulationData[elementId];
    if (data.totalTime > maxTime) {
      maxTime = data.totalTime;
    }
  }

  if (maxTime === 0) {
    heatmap.setData({ max: 1, data: [] });
    return;
  }

  for (const elementId in this.simulationData) {
    const data = this.simulationData[elementId];
    if (data.totalTime > 0) {
      const element = this._elementRegistry.get(elementId);
      if (element) {
        const x = Math.round(element.x + element.width / 2);
        const y = Math.round(element.y + element.height / 2);
        const value = Math.round((data.totalTime / maxTime) * 100);
        dataPoints.push({ x, y, value });
      }
    }
  }

  heatmap.setData({
    max: 100,
    data: dataPoints
  });
};

Heatmap.$inject = [
  'eventBus',
  'canvas',
  'elementRegistry',
  'tokenSimulationPalette'
];
