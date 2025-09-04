import {
  getBusinessObject,
  isAny
} from 'bpmn-js/lib/util/ModelUtil';

export default function HeatmapData(eventBus, elementRegistry, modeling, moddle) {
  this._eventBus = eventBus;
  this._elementRegistry = elementRegistry;
  this._modeling = modeling;
  this._moddle = moddle;

  // Listen for the custom event from TimeTracker to update the model
  eventBus.on('heatmap.time.updated', ({ element, time }) => {
    this.updateElementTime(element, time);
  });

  // Listen for the custom event from TimeTracker to clear all data
  eventBus.on('heatmap.data.clear', () => {
    this.clearAllHeatmapData();
  });
}

HeatmapData.prototype.updateElementTime = function(element, time) {
  const businessObject = getBusinessObject(element);

  let extensionElements = businessObject.get('extensionElements');

  if (!extensionElements) {
    extensionElements = this._moddle.create('bpmn:ExtensionElements');

    // Using modeling.updateProperties to ensure the change is undo/redo-able
    this._modeling.updateProperties(element, { extensionElements });
  }

  // After updating properties, we need to get the latest business object
  const newBusinessObject = getBusinessObject(element);
  extensionElements = newBusinessObject.get('extensionElements');

  let heatmapData = extensionElements.get('values').find(v => v.$type === 'heatmap:Data');

  if (!heatmapData) {
    heatmapData = this._moddle.create('heatmap:Data', { tiempoSimulacion: '0' });

    // Use updateModdleProperties for adding to a list property
    const currentValues = extensionElements.get('values') || [];
    this._modeling.updateModdleProperties(element, extensionElements, {
      values: [...currentValues, heatmapData]
    });
  }

  // Get the latest heatmapData element after potential creation
  const finalBusinessObject = getBusinessObject(element);
  const finalExtensionElements = finalBusinessObject.get('extensionElements');
  const finalHeatmapData = finalExtensionElements.get('values').find(v => v.$type === 'heatmap:Data');

  const currentTime = parseInt(finalHeatmapData.get('tiempoSimulacion'), 10) || 0;
  const newTime = currentTime + time;

  // Use updateModdleProperties to change the attribute on the custom element
  this._modeling.updateModdleProperties(element, finalHeatmapData, {
    tiempoSimulacion: String(newTime)
  });

  console.log(`[HeatmapData] Updated 'heatmap:tiempoSimulacion' to ${newTime} for ${element.id}`);
};


HeatmapData.prototype.clearAllHeatmapData = function() {
  const elements = this._elementRegistry.filter(element => {
    return isAny(element, ['bpmn:Task', 'bpmn:CallActivity']);
  });

  elements.forEach(element => {
    const businessObject = getBusinessObject(element);
    const extensionElements = businessObject.get('extensionElements');

    if (!extensionElements) {
      return;
    }

    const heatmapData = extensionElements.get('values').find(v => v.$type === 'heatmap:Data');

    if (heatmapData) {
      // Set time to 0
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
  'moddle'
];
