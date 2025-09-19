# Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación

Este documento es una guía técnica para agentes de IA. Describe cómo interactuar con los datos de simulación (`simulationData`) almacenados dentro de los diagramas BPMN en este proyecto.

## Análisis General del Plugin: ¿Qué Hace y Cómo Funciona?

Este proyecto es un **plugin para Camunda Modeler** que añade una potente capacidad de **simulación y análisis de procesos de negocio**. Su objetivo es permitir a un usuario analizar y optimizar un proceso BPMN antes de su implementación.

El flujo de trabajo general es el siguiente:

1.  **Definición de Datos de Simulación**: El usuario enriquece el diagrama BPMN con datos específicos para la simulación. Por ejemplo, a una tarea se le puede asignar su tiempo de procesamiento, su costo, los recursos que necesita e incluso su probabilidad de fallo. Estos datos se almacenan directamente en el archivo `.bpmn` dentro de una propiedad de extensión llamada `simulationData`.

2.  **Ejecución de la Simulación**: El plugin contiene un **motor de simulación de eventos discretos**. Al iniciar la simulación, este motor lee los datos `simulationData` de cada elemento y ejecuta el proceso de forma virtual un número configurable de veces. Durante la ejecución, se ejecutan dos escenarios en paralelo: un "Plan Normal" y un "Plan con Horas Extras".

3.  **Análisis y Visualización de Resultados**: Una vez finalizada la simulación, el plugin ofrece dos herramientas visuales principales para analizar los resultados:
    *   **Análisis de Frecuencia (Heatmap)**: Colorea el diagrama para mostrar visualmente los "puntos calientes" del proceso, como las tareas que consumen más tiempo o las rutas más transitadas.
    *   **Panel de Análisis de Planes**: Muestra una vista consolidada que compara los resultados de los dos planes (Normal vs. Extras), con un desglose detallado de costos y tiempos para facilitar la toma de decisiones.

## Guía de la Interfaz de Usuario

El plugin añade tres controles principales a la interfaz de Camunda Modeler:

| Icono | Título | Función |
| :--- | :--- | :--- |
| **▶️** | **Ejecutar Simulación** | Inicia el motor de simulación. Lee los `simulationData` del diagrama, ejecuta las simulaciones de ambos planes y guarda los resultados. |
| **☯️** | **Mostrar Análisis de Frecuencia** | Abre la **Paleta de Análisis**. Esta paleta lateral permite visualizar diferentes métricas (frecuencia, costo, tiempo) directamente sobre el diagrama en forma de mapa de calor (heatmap). |
| **📊** | **Mostrar Análisis de Planes** | Abre el **Panel de Análisis de Planes** en la parte inferior de la pantalla. Este panel es el centro de análisis principal y muestra una vista consolidada. |

### El Panel de Análisis de Planes

Este panel ha sido simplificado para mostrar la información más relevante de forma directa, sin menús ni botones adicionales (excepto el de cerrar). Su contenido es fijo y presenta:

1.  **Cronograma de Trabajo**: En la parte superior, se muestran los detalles del calendario laboral (días, horas, festivos) que se utilizó en la simulación.
2.  **Comparativo de Planes**: El contenido principal son dos tarjetas, "Plan Normal" y "Plan con Horas Extras", una al lado de la otra.
3.  **Desglose de Costos**: La tarjeta del "Plan con Horas Extras" desglosa los costos en `Costo de Operación` (tarifa base) y `Pago Extra` (bonos de sobretiempo).
4.  **Ayuda Contextual (?)**: Un ícono de ayuda junto al título principal que explica en detalle cómo interpretar cada métrica.

---

## Módulo de Simulación Avanzada (Arquitectura y Lógica)

### 1. Arquitectura de los Módulos

*   **`client/simulation/BusinessCalendar.js`**: Maneja toda la lógica de tiempo laboral. Su función principal es `calculateBusinessTime`, que determina el tiempo de trabajo neto y el tiempo extra.
*   **`client/editor/DataEditor.js`**: Controla la interfaz del panel de propiedades donde el usuario define los datos de simulación.
*   **`client/simulation/SimulationEngine.js`**: El motor principal. Ejecuta la lógica de la simulación de eventos discretos y calcula los costos.
*   **`client/simulation/SimulationController.js`**: El orquestador. Conecta el motor con la UI. Su función principal ahora es `showAnalysisPanel`, que llama a `createUnifiedComparisonView` para generar el HTML completo del panel de análisis y lo pasa al `ChartPanel` para su renderizado.
*   **`client/simulation/ChartPanel.js`**: El panel de la UI. Fue simplificado para ser un simple contenedor. Ya no maneja lógica de gráficos ni modales; solo recibe y muestra el HTML que le envía el `SimulationController`.

### 2. Lógica de Costos y Horas Extras (Refactorizada)

El sistema de costos fue refactorizado para proveer un desglose claro:

*   **`totalOperationCost`**: El costo base de la operación. Se calcula tomando todo el tiempo de trabajo de una tarea (procesamiento + reparación) y multiplicándolo por la tarifa base (`baseRatePerHour`).
*   **`totalDoubleOvertimeCost` / `totalTripleOvertimeCost`**: El pago **extra (premium)** por las horas trabajadas en franjas de pago doble o triple. No incluye el costo base de esas horas.
*   **`totalCost`**: La suma de todos los componentes (`totalOperationCost` + primas de sobretiempo + costo de espera).

---

## Estructura de Datos JSON `simulationData`

La estructura no ha cambiado. La configuración global se define en un **Evento de Inicio** con `isRoot: true`.

*El resto de la guía se mantiene sin cambios.*
