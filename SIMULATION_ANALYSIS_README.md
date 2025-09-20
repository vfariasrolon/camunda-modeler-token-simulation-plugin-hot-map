# Documentación del Módulo de Análisis de Simulación

Este documento detalla el funcionamiento y uso de la funcionalidad de "Análisis de Simulación de Procesos" en este plugin de Camunda Modeler.

## I. Flujo de Trabajo: De Modelo a Decisión

El flujo de trabajo está diseñado para ser intuitivo y se divide en tres pasos principales:

### Paso 1: Configurar la Simulación
Toda la configuración de la simulación se centraliza en un único **Evento de Inicio (`bpmn:StartEvent`)** que debe ser marcado como "Configuración Raíz". Desde allí se definen el calendario, costos, y reglas de horas extras. Los parámetros de cada tarea (tiempos, fallos) se definen en las propias tareas.

### Paso 2: Ejecutar la Simulación
En la barra de herramientas de la izquierda, haz clic en el botón de **reproducir (▶️)**. El motor ejecutará dos simulaciones completas: una con el horario normal y otra aplicando las reglas de horas extras.

### Paso 3: Analizar los Resultados
Haz clic en el botón de **gráfico de barras (📊)** para abrir el **Panel de Análisis**.

## II. El Panel de Análisis

El panel de análisis te da acceso a todas las visualizaciones de datos.

### Iconos de Acceso Rápido (en la cabecera del panel)

*   **Icono de Reloj (🕒) - Ver Resumen General**: Abre una ventana emergente (modal) que muestra las métricas totales más importantes de la simulación (considerando el plan con horas extras).
*   **Icono de Dólar ($) - Ver Comparativo de Planes**: Abre un modal con la herramienta de análisis más potente. Esta vista presenta dos tarjetas, "Plan Normal" y "Plan con Horas Extras", una al lado de la otra, con un desglose financiero detallado.
*   **Icono de Ayuda (?)**: Muestra una guía sobre los diferentes gráficos disponibles en el menú desplegable.

### Gráficos y Tablas Detalladas

Usa el **menú desplegable** principal para cambiar entre diferentes tipos de gráficos y tablas que te permitirán un análisis más profundo de aspectos específicos, como:
*   **Análisis de Producción**: Compara la producción diaria entre el plan normal y el de horas extras.
*   **Top 5 por Costo/Tiempo**: Identifica rápidamente las tareas más costosas o que más tiempo consumen.
*   **Diagramas de Pareto**: Aplica el principio 80/20 para encontrar las causas raíz de los fallos o los altos costos.
*   **Tabla de Resultados**: Ve una tabla con todas las métricas detalladas para cada elemento del proceso.

## III. Guía para Desarrolladores de IA

Para extender esta funcionalidad, consulta la guía técnica detallada:
[**Guía para Desarrolladores de IA](./client/simulation/AI_DEVELOPER_GUIDE.md)**
