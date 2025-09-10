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
1.  Selecciona un elemento del diagrama (ej. una tarea).
2.  En el panel de propiedades, ve a la sección "Extensiones" y añade una nueva propiedad (`camunda:property`).
3.  Nombra la propiedad **`simulationData`**.
4.  En el campo "Valor", introduce un objeto JSON con la configuración deseada. La estructura del JSON se detalla en el Apéndice A de este documento.

### Paso 2: Ejecutar la Simulación

1.  En la barra de herramientas principal (arriba a la izquierda), haz clic en el nuevo botón con el icono de **reproducir (play)**.
2.  El motor de simulación se ejecutará en segundo plano con los datos actuales del diagrama.
3.  Aparecerá una notificación confirmando "Simulación completada". Los resultados se guardan internamente.

### Paso 3: Visualizar y Analizar los Resultados

1.  Junto al botón de reproducir, haz clic en el nuevo botón con el icono de un **yin-yang**.
2.  Se abrirá una **paleta de análisis** con varios botones.
3.  Haz clic en cualquiera de los botones para visualizar una métrica diferente (Costo, Tiempo de Espera, Tasa de Fallos, etc.).
4.  Puedes cambiar entre las diferentes vistas sin tener que volver a ejecutar la simulación.

## II. Arquitectura y Funcionamiento Interno

Toda la nueva funcionalidad se encuentra en el directorio `client/simulation/`.

-   **`RandomDataGenerator.js`**: Implementa la lógica del menú.
-   **`SimulationController.js`**: Orquesta la UI.
-   **`SimulationPalette.js`**: Define la paleta de visualización.
-   **`SimulationEngine.js`**: Es el cerebro, implementa un motor de simulación de eventos discretos.
-   **`util.js`**: Contiene funciones de ayuda compartidas.

### Lógica del Motor de Simulación (`SimulationEngine.js`)

El motor usa una **Simulación de Eventos Discretos**.

-   **Compuertas Exclusivas (con 'X')**: Usa la propiedad `branchingProbability` para decidir qué camino tomar.
-   **Recursos y Tiempos de Espera**: Gestiona `resourcePools`. Si un recurso no está disponible, la tarea se pone en cola, acumulando `totalWaitTime`.
-   **Fallos y Reparaciones**: Usa `failureRate` para simular fallos en tareas. Si una tarea falla, se añade el `reworkTime` y su costo asociado.

## Apéndice A: Estructura de `simulationData`

-   **En el Proceso o Pool:**
    ```json
    {
      "simulationConfig": { "runValue": 1000 },
      "resourcePools": [ { "name": "...", "quantity": 0 } ]
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
      "reworkTime": { "...": "..." }
    }
    ```
-   **En un Flujo de Secuencia:**
    ```json
    { "branchingProbability": 0.0 }
    ```

## III. Guía para Desarrolladores de IA

Para extender esta funcionalidad o construir nuevas herramientas que interactúen con los datos de simulación, consulta la guía técnica detallada:
[**Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación](./AI_DEVELOPER_GUIDE.md)**
