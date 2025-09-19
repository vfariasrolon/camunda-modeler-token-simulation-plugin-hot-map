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

## II. El Panel de Análisis Híbrido

El panel de análisis ha sido diseñado para ofrecer la información más importante de un vistazo, sin dejar de lado la capacidad de un análisis profundo.

### Parte Superior: Comparación de Planes (Vista Fija)

La sección superior del panel siempre muestra la información más crítica para la toma de decisiones:
*   **Cronograma de Trabajo**: Los detalles del calendario laboral usado en la simulación.
*   **Comparativo de Planes**: Dos tarjetas, "Plan Normal" y "Plan con Horas Extras", una al lado de la otra.
*   **Desglose de Costos Detallado**: La tarjeta de horas extras desglosa los costos en `Costo de Operación` (tarifa base) y `Pago Extra` (bonos).
*   **Icono de Ayuda (?)**: Un ícono de ayuda que explica en detalle cómo interpretar los costos.

### Parte Inferior: Gráficos Detallados (Vista Dinámica)

La sección inferior del panel permite un análisis más profundo:
*   **Menú Desplegable**: Usa este menú para seleccionar diferentes métricas.
*   **Área de Gráfico**: El gráfico correspondiente a tu selección (ej. "Top 5 por Costo", "Diagrama de Pareto", etc.) se mostrará en esta área.

Este diseño híbrido te da lo mejor de ambos mundos: una conclusión de alto nivel siempre visible y las herramientas para explorar los datos a fondo justo debajo.

## III. Guía para Desarrolladores de IA

Para extender esta funcionalidad, consulta la guía técnica detallada:
[**Guía para Desarrolladores de IA](./client/simulation/AI_DEVELOPER_GUIDE.md)**
