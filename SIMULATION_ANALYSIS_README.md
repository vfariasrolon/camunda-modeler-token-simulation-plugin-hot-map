# Documentación del Módulo de Análisis de Simulación

Este documento detalla el funcionamiento, la arquitectura y el uso de la nueva funcionalidad de "Análisis de Simulación de Procesos" añadida a este plugin de Camunda Modeler.

## I. Cómo Usar la Nueva Funcionalidad

El flujo de trabajo está diseñado para ser intuitivo y se divide en tres pasos principales:

### Paso 1: Preparar los Datos de Simulación

Tienes dos opciones para definir los datos que usará la simulación:

**Opción A (Recomendada para pruebas): Generar Datos Aleatorios**
1.  Ve al menú superior de la aplicación: `Plugins`.
2.  Haz clic en **"Generar Datos de Simulación Aleatorios"**.
3.  Automáticamente, todas las tareas, eventos de inicio y compuertas del diagrama se poblarán con datos de simulación lógicos pero aleatorios (tiempos de proceso, costos, probabilidades de decisión, tasa de fallos, etc.). Puedes ver estos datos en el panel de propiedades de cada elemento, en una propiedad de extensión llamada `simulationData`.

**Opción B: Introducir Datos Manuales**
1.  Selecciona un elemento del diagrama (ej. una tarea).
2.  En el panel de propiedades, ve a la sección "Extensiones" y añade una nueva propiedad (`camunda:property`).
3.  Nombra la propiedad **`simulationData`**.
4.  En el campo "Valor", introduce un objeto JSON con la configuración deseada. La estructura del JSON se detalla en el Apéndice A de este documento.

### Paso 2: Ejecutar la Simulación

1.  En la barra de herramientas principal del modelador (en la parte superior izquierda), verás un nuevo botón de color **rosa** con un icono de "Play".
2.  Haz clic en este botón **"Ejecutar Simulación"**.
3.  El motor de simulación se ejecutará en segundo plano utilizando los datos que preparaste en el Paso 1. No verás ningún cambio visual inmediato, pero aparecerá una notificación confirmando que "Simulación completada". Los resultados se guardan internamente.

### Paso 3: Visualizar y Analizar los Resultados

1.  Junto al botón rosa, hay un nuevo botón de color **azul** con un icono de un "ojo", llamado **"Mostrar Análisis"**.
2.  Al hacer clic en él, se abrirá una **paleta de análisis** con varios botones.
3.  Haz clic en cualquiera de los botones de la paleta para visualizar una métrica diferente:
    *   **$**: Mapa de calor de **Costos**.
    *   **Reloj**: Mapa de calor de **Tiempos de Espera** (cuellos de botella) o **Tiempo de Proceso**.
    *   **Bicho**: Mapa de calor de **Tasa de Fallos**.
    *   Y otros...
4.  Cada vez que selecciones una métrica, el diagrama se actualizará con un mapa de calor y superposiciones de texto que muestran los valores correspondientes. Puedes cambiar entre las diferentes vistas sin tener que volver a ejecutar la simulación.
5.  La paleta también incluye un botón de **"Atrás"** para cerrarla.

## II. Resumen de Cambios

Para implementar esta funcionalidad, se realizaron los siguientes cambios:

-   **Nuevos Archivos Creados**:
    -   `client/simulation/`: Un nuevo directorio para encapsular toda la lógica de la nueva característica.
        -   `index.js`: Define el módulo de `bpmn-js` y gestiona la inyección de dependencias.
        -   `SimulationController.js`: Orquesta toda la lógica de la UI, los nuevos botones y la visualización.
        -   `SimulationEngine.js`: Contiene el motor de simulación de eventos discretos.
        -   `SimulationPalette.js`: Define y gestiona la paleta de análisis.
        -   `RandomDataGenerator.js`: Implementa la lógica para generar datos aleatorios.
        -   `simulation.css`: Contiene todos los estilos para los nuevos componentes de la UI.
-   **Archivos Modificados**:
    -   `index.js` (raíz): Se modificó para registrar el nuevo módulo y su hoja de estilos.
    -   `menu.js`: Se añadió la nueva opción "Generar Datos de Simulación Aleatorios" al menú de plugins.
    -   `client/client.js`: Se registró el nuevo módulo `simulationAnalysis` para que el modelador lo cargue.
    -   `webpack.config.js`: Se añadieron los `loaders` de CSS para poder importar los estilos directamente en JavaScript.
    -   `package.json`: Se añadieron las dependencias `style-loader` y `css-loader`.

## III. Arquitectura y Funcionamiento Interno

### Módulos Principales

La funcionalidad se divide en cuatro componentes principales, todos registrados a través de un único módulo `simulationAnalysis` para asegurar una correcta inyección de dependencias.

-   **`RandomDataGenerator`**: Su única responsabilidad es escuchar la acción del menú y poblar el modelo BPMN con datos aleatorios. Usa el servicio `modeling` de `bpmn-js` para actualizar las propiedades de los elementos.
-   **`SimulationEngine`**: Es el cerebro de la simulación. No interactúa con la UI. Su método `run()` recibe los elementos del diagrama, extrae los datos de `simulationData`, y ejecuta un bucle de simulación de eventos discretos. Gestiona un reloj global, una cola de eventos priorizada por tiempo, y los pools de recursos. Al final, devuelve un mapa con los resultados agregados por cada ID de elemento.
-   **`SimulationPalette`**: Es un componente de UI puro. Define los botones de la paleta de análisis (costo, tiempo, etc.). Cuando se hace clic en un botón, invoca un `callback` que le fue proporcionado por el `SimulationController`.
-   **`SimulationController`**: Es el orquestador que une todo.
    1.  Crea los dos botones principales ("Ejecutar" y "Mostrar").
    2.  Cuando se hace clic en "Ejecutar", llama al `SimulationEngine.run()`, guarda los resultados y muestra una notificación.
    3.  Cuando se hace clic en "Mostrar", alterna la visibilidad de la `SimulationPalette`.
    4.  Proporciona el `callback` a la paleta. Cuando se hace clic en un botón de métrica en la paleta, el `callback` (`showMetric`) se ejecuta.
    5.  La función `showMetric` toma los resultados guardados y usa los servicios `overlays` y `SimpleHeatSVG` (el motor de mapa de calor) para mostrar la información visualmente sobre el diagrama.

### Flujo de la Simulación (Interno)

1.  **Inicialización**: Se crea un mapa de resultados vacío y una cola de eventos. Se programa el primer evento: la llegada de la primera instancia de proceso en el tiempo `0`.
2.  **Bucle de Eventos**: El motor entra en un bucle `while` que se ejecuta mientras la cola de eventos no esté vacía. En cada iteración, extrae el siguiente evento (el que tenga el tiempo más cercano).
3.  **Procesamiento de Eventos**:
    -   El reloj de la simulación avanza al tiempo del evento actual.
    -   Se incrementa el contador de ejecución del elemento del evento.
    -   Se llama a la función `findNextElement`. Esta función mira las flechas de salida del elemento actual. Si es una compuerta, usa la `branchingProbability` para decidir qué camino tomar. Una vez que elige un camino (un flujo de secuencia), incrementa el contador de ejecución de ese flujo y devuelve el siguiente elemento de destino.
    -   Se crea un nuevo evento para el elemento de destino. Si es una tarea, se calcula su tiempo de proceso (incluyendo posibles fallos y reparaciones) y se programa un evento `TASK_COMPLETE` para el futuro. Si es otro elemento (como una compuerta o evento final), se programa para ejecutarse inmediatamente (tiempo de proceso cero).
4.  **Finalización**: El bucle continúa hasta que se cumple la condición de finalización (ej. 1000 instancias completadas) o la cola de eventos se vacía. Al final, se devuelve el mapa de resultados completo.

## Apéndice A: Estructura de `simulationData`

A continuación se muestra la estructura del JSON que se debe usar en la propiedad `simulationData`.

-   **En el Proceso o Pool (elemento raíz)**:
    ```json
    {
      "simulationConfig": { "runUntil": "instances", "runValue": 1000 },
      "resourcePools": [ { "name": "Analistas", "quantity": 3 } ]
    }
    ```
-   **En un Evento de Inicio**:
    ```json
    {
      "arrivalRate": { "distribution": "fixed", "unit": "minutes", "value": 10 }
    }
    ```
-   **En una Tarea**:
    ```json
    {
      "processingTime": { "distribution": "triangular", "unit": "minutes", "min": 5, "mode": 10, "max": 25 },
      "resources": { "pool": "Analistas", "quantityRequired": 1 },
      "cost": { "type": "perHour", "value": 40, "currency": "USD" },
      "failureRate": 0.10,
      "reworkTime": { "distribution": "fixed", "unit": "minutes", "value": 30 }
    }
    ```
-   **En un Flujo de Secuencia (salida de compuerta)**:
    ```json
    {
      "branchingProbability": 0.85
    }
    ```
