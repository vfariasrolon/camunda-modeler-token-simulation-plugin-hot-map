# Especificación de la Estructura de Datos `simulationData`

Este documento detalla la estructura del objeto JSON que debe ser almacenado en la propiedad de extensión `simulationData` de los elementos BPMN para configurar el motor de simulación.

## 1. Proceso (Process) o Pool (Participant)

Se aplica al elemento raíz del proceso o al Pool que lo contiene. Define la configuración global de la simulación y los recursos disponibles.

-   **Propiedad**: `simulationData`
-   **Objeto JSON**:
    ```json
    {
      "simulationConfig": {
        "runUntil": "instances",
        "runValue": 1000,
        "runUnit": "instances"
      },
      "resourcePools": [
        { "name": "Analistas", "quantity": 3 },
        { "name": "Gerentes", "quantity": 1 }
      ]
    }
    ```
-   **Campos**:
    -   `simulationConfig`:
        -   `runUntil` (String): Condición de fin. Opciones: `"instances"` (se ejecuta hasta completar un número de instancias), `"time"` (se ejecuta por un tiempo determinado).
        -   `runValue` (Number): El valor numérico para la condición de fin (ej. 1000 instancias, 500 minutos).
        -   `runUnit` (String): La unidad para `runValue`. Opciones: `"instances"`, `"seconds"`, `"minutes"`, `"hours"`, `"days"`.
    -   `resourcePools` (Array): Una lista de los pools de recursos disponibles en la simulación.
        -   `name` (String): Nombre único del pool de recursos (ej. "Analistas").
        -   `quantity` (Number): Cantidad de recursos disponibles en ese pool.

---

## 2. Evento de Inicio (StartEvent)

Define cómo llegan nuevas instancias al proceso.

-   **Propiedad**: `simulationData`
-   **Objeto JSON**:
    ```json
    {
      "arrivalRate": {
        "distribution": "fixed",
        "unit": "minutes",
        "value": 10
      }
    }
    ```
-   **Campos**:
    -   `arrivalRate`:
        -   `distribution` (String): La distribución estadística para el tiempo entre llegadas. Opciones: `"fixed"`, `"uniform"`, `"triangular"`, `"normal"`.
        -   `unit` (String): Unidad de tiempo. Opciones: `"seconds"`, `"minutes"`, `"hours"`, `"days"`.
        -   **Parámetros de distribución**:
            -   Para `"fixed"`: `value` (Number).
            -   Para `"uniform"`: `min` (Number), `max` (Number).
            -   Para `"triangular"`: `min` (Number), `mode` (Number), `max` (Number).
            -   Para `"normal"`: `mean` (Number), `stddev` (Number).

---

## 3. Tareas (UserTask, ServiceTask, etc.) y Eventos Intermedios

Define el tiempo de procesamiento, los recursos requeridos y el costo de ejecutar el elemento.

-   **Propiedad**: `simulationData`
-   **Objeto JSON**:
    ```json
    {
      "processingTime": {
        "distribution": "triangular",
        "unit": "minutes",
        "min": 5,
        "mode": 10,
        "max": 25
      },
      "resources": {
        "pool": "Analistas",
        "quantityRequired": 1
      },
      "cost": {
        "type": "perHour",
        "value": 40,
        "currency": "USD"
      }
    }
    ```
-   **Campos**:
    -   `processingTime`: Define el tiempo que toma completar la tarea. La estructura es idéntica a la de `arrivalRate`.
    -   `resources`:
        -   `pool` (String): El nombre del `resourcePool` a utilizar (debe coincidir con uno definido globalmente).
        -   `quantityRequired` (Number): Cuántas unidades de ese recurso son necesarias.
    -   `cost`:
        -   `type` (String): Tipo de costo. Opciones: `"fixed"` (un costo fijo por ejecución), `"perHour"` (un costo basado en el tiempo de procesamiento).
        -   `value` (Number): El valor monetario.
        -   `currency` (String): La moneda (ej. "USD", "EUR").

---

## 4. Flujo de Secuencia (SequenceFlow)

Se aplica únicamente a los flujos de secuencia que salen de una **compuerta exclusiva o inclusiva**. Define la probabilidad de que se tome ese camino. La suma de probabilidades de todos los flujos de salida de una compuerta debería ser 1 (o 100%). El sistema normalizará los valores si la suma es diferente de 1.

-   **Propiedad**: `simulationData`
-   **Objeto JSON**:
    ```json
    {
      "branchingProbability": 0.85
    }
    ```
-   **Campos**:
    -   `branchingProbability` (Number): Un valor entre 0 y 1 que representa la probabilidad de tomar este camino.
