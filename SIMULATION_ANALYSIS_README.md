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

1.  **Visualizar Mapa de Calor**: Haz clic en el botón con el icono de un **yin-yang** para abrir la paleta de análisis y visualizar métricas como mapas de calor sobre el diagrama.
2.  **Visualizar Gráficos**: Haz clic en el botón con el icono de un **gráfico de barras** para abrir un panel con gráficos detallados. Este panel, que ahora es más ancho para mejor visualización, incluye:
    -   Un menú desplegable para cambiar entre diferentes tipos de gráficos:
        -   **Top 5 por...**: Gráficos de barras que muestran las tareas con mayor impacto en Costo, Tiempo de Proceso y Tiempo de Espera.
        -   **Recursos Asignados**: Un resumen de la configuración de recursos por tarea.
        -   **Diagrama de Dispersión (Tiempo vs. Costo)**: Un gráfico de puntos para identificar visualmente las tareas que son a la vez costosas y largas.
        -   **Diagrama de Pareto (Fallos)**: Un gráfico combinado de barras y línea que ayuda a identificar qué pocas tareas son responsables de la mayoría de los fallos (el principio 80/20).
    -   Un botón de ayuda (`?`) que explica en detalle qué significa cada gráfico.

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
-   **Compuertas Paralelas (con '+')**: El motor ahora soporta la bifurcación y unión de flujos en compuertas paralelas.
-   **Recursos Múltiples por Tarea**: Una tarea puede requerir más de un recurso de una piscina. Esto se define con la propiedad `quantityRequired`.
-   **Fallos y Reparaciones**: Usa `failureRate` para simular fallos en tareas. Si una tarea falla, se añade el `reworkTime` y su costo asociado.
-   **Lógica de Transporte (Desactivada)**: El motor contenía una lógica compleja para simular transporte y agrupación de ítems ("carritos"). Esta funcionalidad se ha desactivado temporalmente para garantizar la estabilidad y fiabilidad del motor de simulación principal, resolviendo un error crítico que provocaba que las simulaciones se detuvieran. El código se conserva comentado para una futura revisión.

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
      "resources": { "pool": "...", "quantityRequired": 1 },
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
[**Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación](./client/simulation/AI_DEVELOPER_GUIDE.md)**

## IV. Diagrama de Flujo de la Simulación

El siguiente diagrama de flujo ilustra el funcionamiento interno del motor de simulación a alto nivel.

```mermaid
graph TD
    A[Inicio: Usuario hace clic en "Ejecutar Simulación"] --> B{SimulationController.runSimulation()};
    B --> C{Encontrar Configuración Raíz};
    C --> D[Inicializar Motor de Simulación];
    D --> E[Poblar Cola de Eventos con Evento de Inicio];
    E --> F{Bucle de Eventos (mientras la cola no esté vacía)};
    F --> G{Procesar Siguiente Evento};
    G --> H{Tipo de Evento?};
    H -- Tarea Iniciada --> I[Agendar Tarea (Calcular tiempo, costo, etc.)];
    I --> F;
    H -- Tarea Completada --> J[Actualizar Resultados y Liberar Recursos];
    J --> F;
    H -- Compuerta --> K[Encontrar Siguiente(s) Elemento(s)];
    K --> F;
    H -- Instancia Completada --> L[Actualizar Métricas Finales];
    L --> M{Se alcanzó el número de instancias objetivo?};
    M -- No --> F;
    M -- Sí --> N[Finalizar Simulación];
    N --> O[Devolver Resultados al Controlador];
    O --> P[Resultados disponibles para Gráficos y Overlays];
```
