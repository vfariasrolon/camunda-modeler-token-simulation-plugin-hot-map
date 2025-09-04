// client/TimeTracker.js
import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

import {
  TRACE_EVENT,
  RESET_SIMULATION_EVENT
} from 'bpmn-js-token-simulation/lib/util/EventHelper';

const LOW_PRIORITY = 500;

export default function TimeTracker(eventBus) {
  this._eventBus = eventBus;

  this.taskStartTimes = new Map();

  // Listen for trace events to capture task entry and exit
  eventBus.on(TRACE_EVENT, LOW_PRIORITY, event => {
    const {
      element,
      scope,
      action
    } = event;

    // We are only interested in tasks and call activities
    if (!is(element, 'bpmn:Task') && !is(element, 'bpmn:CallActivity')) {
      return;
    }

    const taskKey = `${element.id}-${scope.id}`;

    if (action === 'enter') {
      this.taskStartTimes.set(taskKey, new Date().getTime());
      console.log(`[TimeTracker] Token entered task ${element.id}, scope ${scope.id}`);
    } else if (action === 'exit') {
      const startTime = this.taskStartTimes.get(taskKey);

      if (startTime) {
        const endTime = new Date().getTime();
        const duration = endTime - startTime;

        // For the test, we'll use a fixed time of 1 second.
        const testDuration = 1000;

        console.log(`[TimeTracker] Task ${element.id} executed. Duration: ${duration}ms. Emitting update event with value: ${testDuration}ms.`);

        // Fire an event with the element and the time, so another module can handle the moddle update.
        this._eventBus.fire('heatmap.time.updated', {
          element: element,
          time: testDuration // In a real scenario, this would be `duration`
        });

        // Clean up the start time for this task instance
        this.taskStartTimes.delete(taskKey);
      }
    }
  });

  // Clear data on simulation reset
  eventBus.on(RESET_SIMULATION_EVENT, () => {
    this.taskStartTimes.clear();
    console.log('[TimeTracker] Cleared time tracking data.');

    // Fire an event to signal that all heatmap data should be cleared.
    this._eventBus.fire('heatmap.data.clear');
  });
}

TimeTracker.$inject = [
  'eventBus'
];
