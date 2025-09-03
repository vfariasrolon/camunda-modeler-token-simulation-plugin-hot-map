// client/Heatmap.js
import h337 from 'heatmap.js';

const VERY_HIGH_PRIORITY = 10000;

export default function Heatmap(
    eventBus,
    simulator,
    canvas,
    elementRegistry,
    tokenSimulationPalette
) {
  this._eventBus = eventBus;
  this._simulator = simulator;
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._tokenSimulationPalette = tokenSimulationPalette;
  this.heatmapInstance = null;
  this.heatmapVisible = true;
  this.simulationData = {};
  this.elementActiveState = {};

  eventBus.on('tokenSimulation.simulator.created', VERY_HIGH_PRIORITY, () => {
    this.simulationData = {};
    this.elementActiveState = {};
    this.getOrCreateHeatmapInstance();
    this.addHeatmapToggleButton();
  });

  eventBus.on('tokenSimulation.simulator.ended', VERY_HIGH_PRIORITY, () => {
    this.drawHeatmap();
  });

  eventBus.on('tokenSimulation.simulator.elementChanged', VERY_HIGH_PRIORITY, (context) => {

    console.log(`[DEBUG] elementChanged fired for element: ${context.element.id}`);

    const allScopes = this._simulator.findScopes(() => true);
    const activeElements = new Set(allScopes.map(s => s.element.id));

    // Check for newly active elements
    activeElements.forEach(elementId => {
      if (!this.elementActiveState[elementId]) {
        // Element has become active
        this.elementActiveState[elementId] = { startTime: new Date().getTime() };
      }
    });

    // Check for newly inactive elements
    for (const elementId in this.elementActiveState) {
      if (!activeElements.has(elementId)) {
        // Element has become inactive
        const startTime = this.elementActiveState[elementId].startTime;
        if (startTime) {
          const endTime = new Date().getTime();
          const duration = endTime - startTime;

          if (!this.simulationData[elementId]) {
            const element = this._elementRegistry.get(elementId);
            this.simulationData[elementId] = {
              name: element.businessObject.name || elementId,
              count: 0,
              totalTime: 0
            };
          }
          this.simulationData[elementId].count++;
          this.simulationData[elementId].totalTime += duration;
        }
        delete this.elementActiveState[elementId];
      }
    }
  });
}

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

Heatmap.prototype.addHeatmapToggleButton = function() {
  // Using a random icon for now, for example, the fork icon.
  const ForkIcon = () => '<i class="fa fa-fire"></i>';

  if (document.querySelector('.bts-entry[title="Toggle Heatmap"]')) {
    return;
  }

  const paletteEntry = domify(`
    <div class="bts-entry" title="Toggle Heatmap">
      ${ ForkIcon() }
    </div>
  `);

  domEvent.bind(paletteEntry, 'click', () => {
    this.heatmapVisible = !this.heatmapVisible;
    const display = this.heatmapVisible ? 'block' : 'none';
    const heatmapCanvas = this.heatmapInstance.get('canvas');
    heatmapCanvas.style.display = display;
  });

  this._tokenSimulationPalette.addEntry(paletteEntry, 4);
};

Heatmap.$inject = [
  'eventBus',
  'simulator',
  'canvas',
  'elementRegistry',
  'tokenSimulationPalette'
];
