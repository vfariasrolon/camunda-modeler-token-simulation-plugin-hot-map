import h337 from 'heatmap.js';

const VERY_HIGH_PRIORITY = 10000;

export default function Heatmap(
    eventBus,
    simulator,
    canvas,
    elementRegistry,
    tokenSimulationPalette,
    toggleMode
) {
  this._eventBus = eventBus;
  this._simulator = simulator;
  this._canvas = canvas;
  this._elementRegistry = elementRegistry;
  this._tokenSimulationPalette = tokenSimulationPalette;
  this.heatmapInstance = null;
  this.heatmapVisible = true;

  this.simulationData = {};

  const init = () => {
    this.simulationData = {};
    this.getOrCreateHeatmapInstance();
    this.addHeatmapToggleButton();
  };

  eventBus.on('tokenSimulation.simulator.created', VERY_HIGH_PRIORITY, init);

  if (toggleMode.isSimulationActive()) {
    init();
  }

  eventBus.on('tokenSimulation.simulator.ended', VERY_HIGH_PRIORITY, (context) => {
    this.drawHeatmap();
  });

  const scopeStartTimes = {};

  eventBus.on('tokenSimulation.simulator.createScope', VERY_HIGH_PRIORITY, (event) => {
    const { scope } = event;
    scopeStartTimes[scope.id] = new Date().getTime();
  });

  eventBus.on('tokenSimulation.simulator.destroyScope', VERY_HIGH_PRIORITY, (event) => {
    const { scope } = event;

    const startTime = scopeStartTimes[scope.id];
    if (!startTime) {
      return;
    }

    const endTime = new Date().getTime();
    const duration = endTime - startTime;
    const elementId = scope.element.id;

    if (!this.simulationData[elementId]) {
      this.simulationData[elementId] = {
        name: scope.element.businessObject.name || elementId,
        count: 0,
        totalTime: 0
      };
    }

    this.simulationData[elementId].count++;
    this.simulationData[elementId].totalTime += duration;

    delete scopeStartTimes[scope.id];
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

  if (maxTime === 0) return;

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
  if (this._tokenSimulationPalette.getEntry('toggle-heatmap')) {
    return;
  }

  this._tokenSimulationPalette.addEntry({
    id: 'toggle-heatmap',
    title: 'Toggle Heatmap',
    action: {
      click: () => {
        this.heatmapVisible = !this.heatmapVisible;
        const display = this.heatmapVisible ? 'block' : 'none';
        const heatmapCanvas = this.heatmapInstance.get('canvas');
        heatmapCanvas.style.display = display;
      }
    }
  });
};

Heatmap.$inject = [
  'eventBus',
  'simulator',
  'canvas',
  'elementRegistry',
  'tokenSimulationPalette',
  'toggleMode'
];
