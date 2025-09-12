# Documentación del Módulo de Análisis de Simulación

Este documento detalla el funcionamiento, la arquitectura y el uso de la nueva funcionalidad de "Análisis de Simulación de Procesos" añadida a este plugin de Camunda Modeler.

## I. Cómo Usar la Nueva Funcionalidad

El flujo de trabajo está diseñado para ser intuitivo y se divide en tres pasos principales:

### Paso 1: Preparar los Datos de Simulación
Para ejecutar una simulación, primero necesitas datos. La forma más sencilla es usar el generador de datos aleatorios:
1.  Ve al menú superior de la aplicación: `Plugins`.
2.  Haz clic en **"Insertar Lógica de Simulación (Datos Aleatorios)"**.
3.  Automáticamente, el diagrama se poblará con datos de simulación (tiempos, costos, recursos, etc.).

### Paso 2: Ejecutar la Simulación
1.  En la barra de herramientas principal (arriba a la izquierda), haz clic en el nuevo botón con el icono de **reproducir (play)**.
2.  El motor de simulación se ejecutará en segundo plano.
3.  Aparecerá una notificación confirmando "Simulación completada". Los resultados se guardan internamente.

### Paso 3: Visualizar y Analizar los Resultados
Una vez completada la simulación, puedes analizar los resultados de varias maneras:

1.  **Análisis Visual (Heatmaps):**
    -   Haz clic en el botón con el icono de **ojo** para abrir la paleta de análisis.
    -   Selecciona una métrica (ej. Frecuencia, Costo, Tiempo de Espera) para visualizarla como un mapa de calor sobre el diagrama.

2.  **Análisis Gráfico (Panel de Gráficos):**
    -   Haz clic en el botón con el icono de **gráfico de barras**.
    -   Se abrirá un panel con gráficos detallados. Usa el menú desplegable para cambiar entre diferentes vistas como:
        -   **Top 5** por Costo, Tiempo, etc.
        -   **Diagrama de Pareto** para analizar las causas de los fallos.
        -   **Diagrama de Dispersión** para correlacionar Tiempo vs. Costo.

3.  **Análisis de Datos Crudos (Panel de Datos):**
    -   Haz clic en el botón con el icono de **tabla**.
    -   Este panel tiene dos pestañas:
        -   **Datos de Entrada:** Muestra la configuración JSON de cada elemento del diagrama.
        -   **Resultados:** Muestra una tabla con todos los resultados de la simulación.
