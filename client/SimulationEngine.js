import {
  find
} from 'min-dash';

import {
  is
} from 'bpmn-js/lib/util/ModelUtil';

export default class SimulationEngine {

  run(elements, metric) {
    const results = elements.map(element => {
      const businessObject = element.businessObject;
      let value = 0;

      if (businessObject.extensionElements && businessObject.extensionElements.values) {
        const properties = find(businessObject.extensionElements.values, v => is(v, 'camunda:Properties'));
        if (properties && properties.values) {
          const dataProperty = find(properties.values, p => p.name === 'simulationData');
          if (dataProperty && dataProperty.value) {
            try {
              const simulationData = JSON.parse(dataProperty.value);
              value = this._calculateMetric(simulationData, metric);
            } catch (e) {
              console.error('Error parsing simulationData JSON for element ' + element.id, e);
            }
          }
        }
      }

      return { element, value };
    });

    return results.filter(r => r.value > 0);
  }

  _calculateMetric(simulationData, metric) {
    switch (metric) {
      case 'cycleTime':
        return this._calculateCycleTime(simulationData);
      case 'cost':
        return this._calculateCost(simulationData);
      case 'bottleneck':
        return this._calculateBottleneck(simulationData);
      case 'frequency':
        // Placeholder for future implementation
        return 0;
      default:
        return 0;
    }
  }

  _calculateCycleTime(simulationData) {
    if (simulationData && simulationData.processingTime) {
      const { distribution, min, mode, max, mean, stdDev, value } = simulationData.processingTime;

      switch (distribution) {
        case 'triangular':
          if (typeof min === 'number' && typeof mode === 'number' && typeof max === 'number') {
            return (min + mode + max) / 3;
          }
          break;
        // Add other distributions here in the future
        case 'fixed':
          return value || 0;
      }
    }
    return 0;
  }

  _calculateBottleneck(simulationData) {
    if (simulationData && simulationData.waitingTime) {
      const { distribution, min, mode, max, value } = simulationData.waitingTime;

      // For now, we'll just use the raw values, similar to cycle time.
      // A real simulation would generate this data.
       switch (distribution) {
        case 'triangular':
          if (typeof min === 'number' && typeof mode === 'number' && typeof max === 'number') {
            return (min + mode + max) / 3;
          }
          break;
        case 'fixed':
          return value || 0;
      }
    }
    return 0;
  }

  _calculateCost(simulationData) {
    if (simulationData && simulationData.cost) {
      const { type, value } = simulationData.cost;

      if (type === 'fixed') {
        return value || 0;
      }

      if (type === 'perHour') {
        const processingTimeMinutes = this._calculateCycleTime(simulationData);
        const processingTimeHours = processingTimeMinutes / 60;
        return (value || 0) * processingTimeHours;
      }
    }
    return 0;
  }
}
