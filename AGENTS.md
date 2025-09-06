# Agent Instructions

This document provides instructions and conventions for AI agents working on this project.

## Simulation Data Structure

The simulation engine relies on data stored in `camunda:Properties` within the BPMN XML.

### 1. Element-Specific Data

- **Property Name:** `simulationData`
- **Location:** Attached to any supported BPMN element (Tasks, Events, Gateways).
- **Format:** JSON string.

**Structure for Tasks/Events:**
```json
{
  "processingTime": {
    "distribution": "triangular",
    "unit": "minutes",
    "min": 5,
    "mode": 10,
    "max": 25
  },
  "waitingTime": {
    "distribution": "fixed",
    "unit": "minutes",
    "value": 5
  },
  "resources": {
    "pool": "Analistas Junior",
    "quantityRequired": 1
  },
  "cost": {
    "type": "perHour",
    "value": 40,
    "currency": "USD"
  },
  "executionCount": 1
}
```

**Structure for Sequence Flows (from Gateways):**
```json
{
  "branchingProbability": 0.85
}
```

### 2. Global Simulation Data

- **Property Name:** `simulationGlobalData`
- **Location:** Must be attached to the main `bpmn:Process` element.
- **Format:** JSON string.

**Structure for Global Data:**
```json
{
  "resourcePools": [
    { "name": "Analistas Junior", "capacity": 3 },
    { "name": "Sistema A", "capacity": 1 }
  ]
}
```
