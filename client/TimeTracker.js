import { isAny } from 'bpmn-js/lib/util/ModelUtil';
import { TRACE_EVENT, RESET_SIMULATION_EVENT } from 'bpmn-js-token-simulation/lib/util/EventHelper';

const LOW_PRIORITY = 500;

export default function TimeTracker(eventBus) {
  this._eventBus = eventBus;

  this.taskStartTimes = new Map();
  this.recordedTimes = {};

  // Listen for trace events to capture task entry and exit
  eventBus.on(TRACE_EVENT, LOW_PRIORITY, event => {
    const {
      element,
      scope,
      action
    } = event;

    if (!isAny(element, ['bpmn:Task', 'bpmn:CallActivity'])) {
      return;
    }

    const taskKey = `${element.id}-${scope.id}`;

    if (action === 'enter') {
      this.taskStartTimes.set(taskKey, new Date().getTime());
    } else if (action === 'exit') {
      const startTime = this.taskStartTimes.get(taskKey);

      if (startTime) {
        const endTime = new Date().getTime();
        const duration = endTime - startTime;

        // Accumulate time for the element ID
        this.recordedTimes[element.id] = (this.recordedTimes[element.id] || 0) + duration;

        console.log(`[TimeTracker] Task ${element.id} finished. Duration: ${duration}ms. Total for element: ${this.recordedTimes[element.id]}ms`);

        this.taskStartTimes.delete(taskKey);
      }
    }
  });

  // Clear data on simulation reset
  eventBus.on(RESET_SIMULATION_EVENT, () => {
    this.taskStartTimes.clear();
    this.recordedTimes = {};
    this._eventBus.fire('heatmap.data.clear');
    console.log('[TimeTracker] Cleared time tracking data.');
  });
}

TimeTracker.prototype.getRecordedTimes = function() {
  return this.recordedTimes;
};

TimeTracker.$inject = [
  'eventBus'
];
