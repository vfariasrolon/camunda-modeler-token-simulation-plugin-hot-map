# Guía para Desarrolladores de IA: Módulo de Simulación

Este documento es una guía técnica para agentes de IA que describe la arquitectura y el flujo de datos del módulo de simulación.

## Análisis General del Plugin

Este proyecto es un plugin para Camunda Modeler que añade una potente capacidad de **simulación y análisis de procesos de negocio**. Permite a un usuario analizar y optimizar un proceso BPMN antes de su implementación mediante la ejecución de dos escenarios: un "Plan Normal" y un "Plan con Horas Extras".

## Guía de la Interfaz de Usuario (Diseño con Modales)

El plugin añade tres controles principales a la interfaz de Camunda Modeler:

| Icono | Título | Función |
| :--- | :--- | :--- |
| **▶️** | **Ejecutar Simulación** | Inicia el motor de simulación. |
| **☯️** | **Mostrar Análisis de Frecuencia** | Abre la paleta de análisis de "heatmap". |
| **📊** | **Mostrar Panel de Gráficos** | Abre el panel de análisis principal. |

### El Panel de Análisis

Este panel es el centro de análisis y su cabecera contiene:
1.  **Menú Desplegable (`<select>`)**: Permite al usuario elegir entre una variedad de gráficos y tablas detalladas (Pareto, Top 5, etc.) que se renderizan en el área de contenido principal del panel.
2.  **Botones de Iconos**:
    *   **Reloj (🕒)**: Lanza un modal con el "Resumen General" de la simulación.
    *   **Dólar ($)**: Lanza un modal con el "Comparativo de Planes" y su desglose de costos detallado.
    *   **Ayuda (?)**: Muestra información sobre los gráficos del menú desplegable.

---

## Módulo de Simulación Avanzada (Arquitectura y Lógica)

### 1. Arquitectura de los Módulos

*   **`client/simulation/SimulationEngine.js`**: El motor principal. Su método `run` ahora acepta la `rootConfig` como parámetro para asegurar que cada ejecución sea sin estado. Es responsable de calcular los costos desglosados (`operationCost`, `doubleOvertimePremium`, etc.). La lógica para prevenir el crash de `getTime` ha sido implementada.
*   **`client/simulation/ChartPanel.js`**: El panel de la UI. Contiene la lógica para el menú desplegable, el canvas de gráficos, y los botones de la cabecera (reloj, dólar, ayuda). Escucha eventos para mostrar ventanas modales genéricas con el contenido que le envía el controlador.
*   **`client/simulation/SimulationController.js`**: El orquestador.
    *   Escucha los eventos de los botones del `ChartPanel` (`simulation.summary.requested`, `simulation.comparison.requested`) y genera el HTML para los modales correspondientes.
    *   Contiene toda la lógica de `getChartConfig` y `getChartData` para todos los gráficos y tablas detallados del menú desplegable.

### 2. Lógica de Costos y Horas Extras
El sistema de costos desglosa los costos para mayor claridad:
*   **`totalOperationCost`**: El costo base de todo el tiempo trabajado (procesamiento + reparación) a tarifa normal.
*   **`totalDoubleOvertimeCost` / `totalTripleOvertimeCost`**: El pago **extra (premium)** por las horas en sobretiempo.
*   **`totalCost`**: La suma de todos los componentes.

---
*El resto de la guía (Estructura de Datos JSON, etc.) se mantiene sin cambios y es correcta.*
