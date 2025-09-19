# Guía para Desarrolladores de IA: Módulo de Simulación

Este documento es una guía técnica para agentes de IA que describe la arquitectura y el flujo de datos del módulo de simulación.

## Análisis General del Plugin

Este proyecto es un plugin para Camunda Modeler que añade una potente capacidad de **simulación y análisis de procesos de negocio**. Permite a un usuario analizar y optimizar un proceso BPMN antes de su implementación mediante la ejecución de dos escenarios: un "Plan Normal" y un "Plan con Horas Extras".

## Guía de la Interfaz de Usuario (Diseño Híbrido Final)

El plugin añade tres controles principales a la interfaz de Camunda Modeler:

| Icono | Título | Función |
| :--- | :--- | :--- |
| **▶️** | **Ejecutar Simulación** | Inicia el motor de simulación. Ejecuta las simulaciones de ambos planes y guarda los resultados. |
| **☯️** | **Mostrar Análisis de Frecuencia** | Abre la paleta de análisis de "heatmap" para visualizar métricas como frecuencia o costo directamente sobre el diagrama. |
| **📊** | **Mostrar Panel de Análisis** | Abre el panel de análisis principal. |

### El Panel de Análisis Híbrido

Este panel es el centro de análisis y está dividido en dos secciones:

1.  **Sección Superior (Estática)**: Muestra siempre la información más crítica para la toma de decisiones. Contiene el **cronograma de trabajo** utilizado y las **tarjetas de comparación** de "Plan Normal" vs. "Plan con Horas Extras", con el desglose de costos detallado y un ícono de ayuda.
2.  **Sección Inferior (Dinámica)**: Contiene un **menú desplegable (`select`)** que permite al usuario elegir entre varios gráficos detallados (Top 5 por Costo, Diagramas de Pareto, etc.). El gráfico seleccionado se renderiza en un elemento `<canvas>` en esta sección.

---

## Módulo de Simulación Avanzada (Arquitectura y Lógica)

### 1. Arquitectura de los Módulos

*   **`client/simulation/SimulationEngine.js`**: El motor principal. Su método `run` ahora acepta la `rootConfig` como parámetro para asegurar que cada ejecución sea sin estado. Es responsable de calcular los costos desglosados (`operationCost`, `doubleOvertimePremium`, etc.).
*   **`client/simulation/ChartPanel.js`**: El panel de la UI. Su HTML ha sido reestructurado para soportar el diseño híbrido con una sección superior para contenido estático (`#comparison-container`) y una sección inferior para los gráficos dinámicos (`#charts-container`), que incluye el `<select>` y el `<canvas>`.
*   **`client/simulation/SimulationController.js`**: El orquestador.
    *   Su función `showAnalysisPanel` ahora maneja toda la lógica de renderizado. Llama a `createComparisonCardsHtml` para generar el HTML de la sección superior y lo envía al `ChartPanel` a través de un evento `simulation.panel.show`.
    *   Inmediatamente después, llama a `showChart` para renderizar el gráfico por defecto en la sección inferior.
    *   Contiene toda la lógica de `getChartConfig` y `getChartData` para todos los gráficos detallados del menú desplegable.

### 2. Lógica de Costos y Horas Extras
El sistema de costos desglosa los costos para mayor claridad:
*   **`totalOperationCost`**: El costo base de todo el tiempo trabajado (procesamiento + reparación) a tarifa normal.
*   **`totalDoubleOvertimeCost` / `totalTripleOvertimeCost`**: El pago **extra (premium)** por las horas en sobretiempo.
*   **`totalCost`**: La suma de todos los componentes.

---
*El resto de la guía (Estructura de Datos JSON, etc.) se mantiene sin cambios y es correcta.*
