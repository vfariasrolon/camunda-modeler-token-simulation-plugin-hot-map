# Documentación del Módulo de Análisis de Simulación

Este documento detalla el funcionamiento, la arquitectura y el uso de la nueva funcionalidad de "Análisis de Simulación de Procesos" añadida a este plugin de Camunda Modeler.

## I. Cómo Usar la Nueva Funcionalidad

El flujo de trabajo está diseñado para ser intuitivo y se divide en tres pasos principales:

### Paso 1: Preparar los Datos de Simulación

Tienes dos opciones para definir los datos que usará la simulación:

**Opción A (Recomendada para pruebas): Generar Datos Aleatorios**
1.  Ve al menú superior de la aplicación: `Plugins`.
2.  Haz clic en **"Insertar Lógica de Simulación (Datos Aleatorios)"**.
3.  Automáticamente, el diagrama se poblará con datos de simulación lógicos pero aleatorios.

**Opción B: Introducir Datos Manuales**
1.  Selecciona un elemento del diagrama (una tarea, un evento de inicio, una flecha de secuencia).
2.  En la paleta de herramientas de la izquierda, aparecerá un nuevo icono de **engranaje**. Haz clic en él.
3.  Se abrirá una ventana emergente (un formulario) donde puedes introducir los parámetros de simulación para ese elemento específico.
4.  Haz clic en "Guardar". Los datos se guardarán en el elemento como una propiedad de extensión (`simulationData`).

### Paso 2: Ejecutar la Simulación

1.  En la barra de herramientas principal (arriba a la izquierda), haz clic en el nuevo botón con el icono de un **dado**.
2.  El motor de simulación se ejecutará en segundo plano con los datos actuales del diagrama.
3.  Aparecerá una notificación confirmando "Simulación completada". Los resultados se guardan internamente, listos para ser visualizados.

### Paso 3: Visualizar y Analizar los Resultados

1.  Junto al botón del dado, haz clic en el nuevo botón con el icono de un **yin-yang/ojo**.
2.  Se abrirá una **paleta de análisis** con varios botones.
3.  Haz clic en cualquiera de los botones para visualizar una métrica diferente (Costo, Tiempo de Espera, Tasa de Fallos, etc.).
4.  Puedes cambiar entre las diferentes vistas sin tener que volver a ejecutar la simulación. La paleta tiene un botón de "Atrás" para cerrarla.

## II. Arquitectura y Funcionamiento Interno

Toda la nueva funcionalidad se encuentra en el directorio `client/simulation/` y se registra como un único módulo en `client/client.js` para asegurar una correcta inyección de dependencias.

-   **`RandomDataGenerator.js`**: Implementa la lógica del menú "Insertar Lógica de Simulación".
-   **`PropertiesPanel.js`**: Define el formulario modal para editar los datos de simulación manualmente.
-   **`SimulationPaletteProvider.js`**: Añade el botón contextual del engranaje a la paleta principal de `bpmn-js`.
-   **`SimulationController.js`**: Orquesta la UI, creando los botones de "Ejecutar" y "Mostrar" y conectándolos con el motor y la paleta de visualización.
-   **`SimulationPalette.js`**: Define la paleta de visualización de métricas.
-   **`SimulationEngine.js`**: Es el cerebro. Implementa un motor de **simulación de eventos discretos**.
-   **`util.js`**: Contiene funciones de ayuda compartidas para leer los datos del modelo.

### Lógica del Motor de Simulación

El motor mantiene una cola de eventos ordenada por tiempo y procesa un evento en cada ciclo.

-   **Compuertas Exclusivas (con 'X')**: El motor usa la propiedad `branchingProbability` de los flujos de salida para tomar una decisión probabilística sobre qué camino seguir.
-   **Compuertas Paralelas (con '+')**: El motor activa **todas** las rutas de salida simultáneamente, creando un nuevo hilo de ejecución para cada camino.
-   **Recursos y Tiempos de Espera**: Si una tarea requiere un recurso (`resources`) que no está disponible, la tarea (y la instancia) se pone en una cola de espera hasta que el recurso se libera. El tiempo pasado en esta cola se acumula como `totalWaitTime`.
-   **Fallos y Reparaciones**: Si una tarea tiene una `failureRate`, el motor "lanza un dado". Si falla, se añade el `reworkTime` y su costo asociado al total de la tarea, y se incrementa el `failureCount`.

## III. Guía para Desarrolladores y Agentes de IA (Meta-Prompt)

Esta sección sirve como un resumen técnico para futuras modificaciones o extensiones.

**Objetivo del Código:** Implementar un motor de simulación de procesos de negocio y una interfaz de usuario dentro de Camunda Modeler. La abstracción central es el objeto JSON `simulationData` que se almacena en las propiedades de extensión de los elementos BPMN y que dirige el comportamiento de la simulación.

**Archivos Clave y sus Responsabilidades:**
-   `SimulationEngine.js`: Contiene toda la lógica de simulación pura. No depende de la UI. Para añadir nueva lógica de simulación (ej. nuevos tipos de recursos), este es el archivo a modificar.
-   `SimulationController.js`: Actúa como el controlador principal. Conecta los botones de la UI con las acciones del motor y la visualización. Para añadir un nuevo tipo de visualización, este archivo debe ser modificado.
-   `PropertiesPanel.js`: Define el formulario emergente para editar `simulationData`. Para añadir un nuevo parámetro de simulación editable por el usuario, este archivo debe ser modificado para incluir el nuevo campo en el formulario.
-   `RandomDataGenerator.js`: Crea datos de prueba. Si se añade un nuevo parámetro de simulación, este archivo debe ser actualizado para poder generarlo aleatoriamente.
-   `SimulationPalette.js`: Define los botones en la paleta de análisis. Para visualizar una nueva métrica, se debe añadir un nuevo botón aquí.

**Cómo Añadir una Nueva Métrica de Simulación (ej. "Energía Consumida"):**
1.  **Modelo de Datos**: Decide cómo se representará en el JSON (ej. `{"energyConsumed": {"value": 50, "unit": "kWh"}}` en una tarea).
2.  **Motor (`SimulationEngine.js`)**:
    -   En `initialize()`, añade `totalEnergyConsumed: 0` al mapa de resultados.
    -   En `processEvent()`, cuando una tarea se completa, lee la nueva propiedad `energyConsumed` y súmala al total en el mapa de resultados.
3.  **Generador de Datos (`RandomDataGenerator.js`)**: Añade lógica para generar valores aleatorios para `energyConsumed`.
4.  **Panel de Propiedades (`PropertiesPanel.js`)**: Añade un nuevo campo de formulario para que el usuario pueda introducir el consumo de energía manualmente. Actualiza los métodos `load()` y `save()`.
5.  **Paleta de Visualización (`SimulationPalette.js`)**: Añade un nuevo botón con un icono para "Energía Consumida" y el `metric: 'energy'`.
6.  **Controlador (`SimulationController.js`)**:
    -   En `showMetric()`, añade un `else if (metric === 'energy')` para calcular el valor a visualizar (ej. `value = result.totalEnergyConsumed`).
    -   En `showOverlays()`, añade un `else if` para mostrar el texto de la superposición (ej. `overlayText = \`Energía: ${result.totalEnergyConsumed} kWh\``).

## Apéndice A: Estructura Completa de `simulationData`

-   **En el Proceso o Pool:**
    ```json
    {
      "simulationConfig": { "runValue": 1000 },
      "resourcePools": [ { "name": "...", "quantity": 0 } ],
      "transportPools": [ { "name": "...", "quantity": 0, "capacity": 0 } ]
    }
    ```
-   **En un Evento de Inicio:**
    ```json
    { "arrivalRate": { "distribution": "...", "unit": "...", "value": 0 } }
    ```
-   **En una Tarea:**
    ```json
    {
      "processingTime": { "distribution": "...", "unit": "...", "min": 0, "mode": 0, "max": 0 },
      "cost": { "type": "perHour", "value": 0 },
      "resources": { "pool": "...", "quantityRequired": 0 },
      "failureRate": 0.0,
      "reworkTime": { "distribution": "...", "unit": "...", "value": 0 },
      "loads": { "pool": "..." },
      "requires": { "pool": "..." }
    }
    ```
-   **En un Flujo de Secuencia:**
    ```json
    {
      "branchingProbability": 0.0,
      "transportTime": { "distribution": "...", "unit": "...", "value": 0 }
    }
    ```
