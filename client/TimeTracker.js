// client/TimeTracker.js
import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  TRACE_EVENT,
  RESET_SIMULATION_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

const LOW_PRIORITY = 500;

export default function TimeTracker(eventBus, bpmnjs, moddle, elementRegistry, modeling) {
  this._eventBus = eventBus;
  this._bpmnjs = bpmnjs;
  this._moddle = moddle;
  this._elementRegistry = elementRegistry;
  this._modeling = modeling;

  this.taskStartTimes = new Map();

  eventBus.on(TRACE_EVENT, LOW_PRIORITY, event => {
    const {
      element,
      scope,
      action
    } = event;

    // We are only interested in tasks
    if (!is(element, 'bpmn:Task') && !is(element, 'bpmn:CallActivity')) {
      return;
    }

    const taskKey = `${element.id}-${scope.id}`;

    if (action === 'enter') {
      this.taskStartTimes.set(taskKey, new Date().getTime());
      console.log(`[TimeTracker] Token entered task ${element.id}, scope ${scope.id}`);
    } else if (action === 'exit') {

      const startTime = this.taskStartTimes.get(taskKey);

      // For the test, we'll just set a fixed time of 1 second on exit.
      // This aligns with the user's request for the initial test.
      const testDuration = 1000;

      const businessObject = element.businessObject;

      let extensionElements = businessObject.get('extensionElements');

      if (!extensionElements) {
          extensionElements = this._moddle.create('bpmn:ExtensionElements');
          businessObject.extensionElements = extensionElements;
      }

      let heatmapData = extensionElements.get('values').find(v => v.$type === 'heatmap:Data');

      if (!heatmapData) {
          heatmapData = this._moddle.create('heatmap:Data');
          extensionElements.get('values').push(heatmapData);
      }

      // Set the simulation time to 1 second (1000 ms)
      heatmapData.set('tiempoSimulacion', testDuration);

      console.log(`[TimeTracker] Set 'heatmap:tiempoSimulacion' to ${testDuration} for ${element.id}`);

      // Clean up the start time for this task instance
      this.taskStartTimes.delete(taskKey);
    }
  });

  // Clear data on simulation reset
  eventBus.on(RESET_SIMULATION_EVENT, () => {
    this.taskStartTimes.clear();
    console.log('[TimeTracker] Cleared time tracking data.');

    // Also clear the heatmap properties from all tasks
    this._elementRegistry.forEach(element => {
      if (is(element, 'bpmn:Task') || is(element, 'bpmn:CallActivity')) {
        const businessObject = element.businessObject;
        let extensionElements = businessObject.get('extensionElements');
        if (extensionElements) {
          const heatmapData = extensionElements.get('values').find(v => v.$type === 'heatmap:Data');

          if (heatmapData) {
            heatmapData.set('tiempoSimulacion', '0');
          }
        }
      }
    });

    console.log('[TimeTracker] Cleared all heatmap:tiempoSimulacion attributes.');
  });
}

TimeTracker.$inject = [
  'eventBus',
  'bpmnjs',
  'moddle',
  'elementRegistry',
  'modeling'
];
