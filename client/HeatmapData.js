import {
  getBusinessObject,
  isAny
} from 'bpmn-js/lib/util/ModelUtil';

import {
  TOGGLE_MODE_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

export default function HeatmapData(eventBus, elementRegistry, modeling, moddle, timeTracker, toggleMode) {
  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
  this._modeling = modeling;
  this._moddle = moddle;
  this._timeTracker = timeTracker;
  this._toggleMode = toggleMode;

  // Listen for the toggle mode event to write data when simulation is turned off
  eventBus.on(TOGGLE_MODE_EVENT, event => {
    //
    // We only write data when the simulation is turned OFF.
    // This is because the model is read-only during simulation.
    //
    if (!event.active) {
      this.writeTimesToModel();
    }
  });

  // Listen for the custom event from TimeTracker to clear all data
  eventBus.on('heatmap.data.clear', () => {
    this.clearAllHeatmapData();
  });

}

HeatmapData.prototype.writeTimesToModel = function() {
  const recordedTimes = this._timeTracker.getRecordedTimes();

  for (const elementId in recordedTimes) {
    const element = this._elementRegistry.get(elementId);
    const time = recordedTimes[elementId];

    if (element) {
      // Pass overwrite=true because we are writing the final accumulated value
      this.updateElementTime(element, time, true);
    }
  }
  console.log('[HeatmapData] Wrote all recorded times to model.');
}

HeatmapData.prototype.updateElementTime = function(element, time, overwrite = false) {

  // do not write to model when simulation is active
  if (this._toggleMode.active) {
    return;
  }

  const businessObject = getBusinessObject(element);

  let extensionElements = businessObject.get('extensionElements');

  if (!extensionElements) {
    extensionElements = this._moddle.create('bpmn:ExtensionElements', { values: [] });
    this._modeling.updateProperties(element, { extensionElements: extensionElements });
    extensionElements = getBusinessObject(element).get('extensionElements');
  }

  let heatmapData = extensionElements.get('values').find(v => v.$type === 'heatmap:Data');

  if (!heatmapData) {
    heatmapData = this._moddle.create('heatmap:Data');
    this._modeling.updateModdleProperties(element, extensionElements, {
      values: [...extensionElements.get('values'), heatmapData]
    });
    heatmapData = getBusinessObject(element).get('extensionElements').get('values').find(v => v.$type === 'heatmap:Data');
  }

  const currentTime = parseInt(heatmapData.get('tiempoSimulacion'), 10) || 0;

  const newTime = overwrite ? time : currentTime + time;

  this._modeling.updateModdleProperties(element, heatmapData, {
    tiempoSimulacion: String(newTime)
  });
};


HeatmapData.prototype.clearAllHeatmapData = function() {

  // do not write to model when simulation is active
  if (this._toggleMode.active) {
    return;
  }

  const elements = this._elementRegistry.filter(element => {
    return isAny(element, [
      'bpmn:Task',
      'bpmn:CallActivity',
      'bpmn:StartEvent',
      'bpmn:EndEvent',
      'bpmn:ExclusiveGateway',
      'bpmn:ParallelGateway',
      'bpmn:InclusiveGateway',
      'bpmn:EventBasedGateway',
      'bpmn:IntermediateCatchEvent',
      'bpmn:SubProcess'
    ]);
  });

  elements.forEach(element => {
    const businessObject = getBusinessObject(element);
    const extensionElements = businessObject.get('extensionElements');

    if (!extensionElements) {
      return;
    }

    const heatmapData = extensionElements.get('values').find(v => v.$type === 'heatmap:Data');

    if (heatmapData) {
      this._modeling.updateModdleProperties(element, heatmapData, {
        tiempoSimulacion: '0'
      });
    }
  });

  console.log('[HeatmapData] Cleared all heatmap:tiempoSimulacion attributes.');
};

HeatmapData.$inject = [
  'eventBus',
  'elementRegistry',
  'modeling',
  'moddle',
  'timeTracker', // Inject the timeTracker to get the data
  'toggleMode'
];
