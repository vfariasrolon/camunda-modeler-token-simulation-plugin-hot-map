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

1.  Junto al botón del dado, haz clic en el nuevo botón con el icono de un **yin-yang**.
2.  Se abrirá una **paleta de análisis** con varios botones.
3.  Haz clic en cualquiera de los botones para visualizar una métrica diferente (Costo, Tiempo de Espera, Tasa de Fallos, etc.).
4.  Puedes cambiar entre las diferentes vistas sin tener que volver a ejecutar la simulación. La paleta tiene un botón de "Atrás" para cerrarla.

## II. Arquitectura y Funcionamiento Interno

Toda la nueva funcionalidad se encuentra en el directorio `client/simulation/` y se registra como un único módulo en `client/client.js`.

-   **`RandomDataGenerator.js`**: Implementa la lógica del menú "Insertar Lógica de Simulación".
-   **`PropertiesPanel.js`**: Define el formulario modal para editar los datos de simulación manualmente.
-   **`SimulationPaletteProvider.js`**: Añade el botón contextual del engranaje a la paleta principal de `bpmn-js`.
-   **`SimulationController.js`**: Orquesta la UI, creando los botones y conectándolos con el motor y la paleta.
-   **`SimulationPalette.js`**: Define la paleta de visualización de métricas.
-   **`SimulationEngine.js`**: Es el cerebro. Implementa un motor de simulación de eventos discretos.
-   **`util.js`**: Contiene funciones de ayuda compartidas.

### Lógica del Motor de Simulación (`SimulationEngine.js`)

El motor usa una **Simulación de Eventos Discretos** para ser eficiente.

-   **Compuertas Exclusivas (con 'X')**: Usa la propiedad `branchingProbability` para decidir qué camino tomar.
-   **Compuertas Paralelas (con '+')**: Activa **todas** las rutas de salida simultáneamente.
-   **Recursos y Tiempos de Espera**: Gestiona `resourcePools`. Si un recurso no está disponible, la tarea se pone en cola, acumulando `totalWaitTime`.
-   **Fallos y Reparaciones**: Usa `failureRate` para simular fallos en tareas. Si una tarea falla, se añade el `reworkTime` y su costo asociado.
-   **Transporte y Lotes (Carros)**:
    -   Gestiona `transportPools` (flotas de carros con capacidad).
    -   Las tareas con la propiedad `loads` agrupan instancias hasta llenar la capacidad de un carro.
    -   Una vez lleno, se simula el `transportTime` definido en el flujo de secuencia de salida.
    -   Las tareas con la propiedad `requires` se pausan hasta que un carro lleno llega a su ubicación, generando tiempo de espera si no hay carros disponibles.

## III. Guía para Desarrolladores y Agentes de IA

Esta sección es un "meta-prompt" para guiar futuras modificaciones.

**Objetivo del Código:** Implementar un motor de simulación y una UI dentro de Camunda Modeler. La abstracción central es el objeto JSON `simulationData`.

**Archivos Clave:**
-   `SimulationEngine.js`: Lógica de simulación pura. Modificar para nuevas reglas de negocio.
-   `SimulationController.js`: Orquestador de UI. Modificar para nuevas visualizaciones.
-   `PropertiesPanel.js`: Formulario para editar `simulationData`. Modificar para añadir nuevos parámetros configurables.
-   `RandomDataGenerator.js`: Generador de datos de prueba. Modificar al añadir nuevos parámetros.

**Cómo Añadir una Nueva Característica (ej. "Mantenimiento de Carros"):**
1.  **Modelo de Datos**: Decide cómo se representará en el JSON (ej. `maintenanceAfterTrips: 10` en la definición del `transportPool`).
2.  **Estado del Recurso**: En `SimulationEngine.js`, dentro de la clase `TransportPool`, añade `trips: 0` a cada objeto `cart`.
3.  **Lógica del Motor**: En `SimulationEngine.js`, intercepta un evento relevante. El evento `CART_ARRIVAL` marca un viaje completado.
    -   Dentro del manejador de `CART_ARRIVAL`, incrementa `cart.trips++`.
    -   Añade una condición: `if (cart.trips >= maintenanceAfterTrips)`.
    -   Si se cumple, cambia el estado del carro: `cart.state = 'IN_MAINTENANCE'`.
    -   Programa un nuevo evento para el futuro: `this.eventQueue.add({ type: 'MAINTENANCE_COMPLETE', cart, time: this.clock + DURACION_MANTENIMIENTO });`.
4.  **Nuevo Evento**: Añade un `if (type === 'MAINTENANCE_COMPLETE')` al manejador de eventos principal. Dentro, cambia el estado del carro de vuelta a `'IDLE'` y resetea `cart.trips = 0;`.
5.  **UI (`PropertiesPanel.js`)**: Añade un campo en el formulario para que el usuario pueda definir `maintenanceAfterTrips`.

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
      "processingTime": { "...": "..." },
      "cost": { "...": "..." },
      "resources": { "...": "..." },
      "failureRate": 0.0,
      "reworkTime": { "...": "..." },
      "loads": { "pool": "..." },
      "requires": { "pool": "..." }
    }
    ```
-   **En un Flujo de Secuencia:**
    ```json
    {
      "branchingProbability": 0.0,
      "transportTime": { "...": "..." }
    }
    ```
