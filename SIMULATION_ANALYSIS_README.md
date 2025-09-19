# Documentación del Módulo de Análisis de Simulación

Este documento detalla el funcionamiento y uso de la funcionalidad de "Análisis de Simulación de Procesos" en este plugin de Camunda Modeler.

## I. Flujo de Trabajo: De Modelo a Decisión

El flujo de trabajo está diseñado para ser intuitivo y se divide en tres pasos principales:

### Paso 1: Configurar la Simulación (en el Evento de Inicio)

Toda la configuración de la simulación se centraliza en un único **Evento de Inicio (`bpmn:StartEvent`)**.

1.  Selecciona el Evento de Inicio de tu proceso.
2.  En el panel de propiedades, marca la casilla **"Usar como Configuración Raíz"**.
3.  Aparecerá un formulario donde podrás configurar todos los parámetros globales:
    *   **Configuración de Simulación**: Define cuántas instancias del proceso quieres simular (ej. 100 piezas).
    *   **Tasa de Llegada**: ¿Con qué frecuencia inicia un nuevo caso? (ej. 1 cada 5 minutos).
    *   **Calendario Laboral**: Define los días y horas de trabajo, así como los días festivos.
    *   **Costos y Horas Extras**: Define la tarifa por hora base y las reglas para el pago de horas extras (cuándo se pagan al doble o al triple).

### Paso 2: Definir Parámetros de las Tareas

1.  Selecciona una Tarea (`bpmn:Task`) en tu diagrama.
2.  En el panel de propiedades, define sus parámetros específicos:
    *   **Tiempo de Procesamiento**: ¿Cuánto tiempo toma realizar la tarea?
    *   **Tasa de Fallo y Tiempo de Reparación**: ¿Qué probabilidad hay de que la tarea falle y cuánto tiempo extra cuesta repararla?
    *   **Recursos**: Si has definido "piscinas de recursos" (en el elemento Proceso o Participante), aquí puedes asignar cuántos recursos de una piscina necesita la tarea.

### Paso 3: Ejecutar y Analizar

1.  **Ejecutar**: En la barra de herramientas de la izquierda, haz clic en el botón de **reproducir (▶️)**. El motor ejecutará dos simulaciones completas en segundo plano: una con el horario normal y otra aplicando las reglas de horas extras.
2.  **Analizar**: Haz clic en el botón de **gráfico de barras (📊)** para abrir el panel de análisis.

## II. El Panel de Análisis: Tu Centro de Mando

El panel de análisis es donde podrás entender el rendimiento de tu proceso. Se abre con el botón del **gráfico de barras (📊)**.

### Iconos de Acceso Rápido

En la cabecera del panel, junto al menú desplegable, encontrarás dos nuevos iconos para acceder a las vistas de resumen más importantes:

*   **Icono de Reloj (🕒) - Ver Resumen General**: Abre una ventana que muestra las métricas totales más importantes de la simulación (considerando el plan con horas extras).
*   **Icono de Dólar ($) - Ver Comparativo de Planes**: Abre la herramienta de análisis más potente. Esta vista presenta dos tarjetas, "Plan Normal" y "Plan con Horas Extras", una al lado de la otra para una fácil comparación. Incluye un desglose financiero detallado que separa el costo de operación de los bonos por horas extras.

### Gráficos y Tablas Detalladas

Usa el **menú desplegable** principal para cambiar entre diferentes tipos de gráficos y tablas que te permitirán un análisis más profundo de aspectos específicos, como:
*   **Análisis de Producción**: Compara la producción diaria entre el plan normal y el de horas extras.
*   **Top 5 por Costo/Tiempo**: Identifica rápidamente las tareas más costosas o que más tiempo consumen.
*   **Diagramas de Pareto**: Aplica el principio 80/20 para encontrar las causas raíz de los fallos o los altos costos.
*   **Tabla de Resultados**: Ve una tabla con todas las métricas detalladas para cada elemento del proceso.

## III. Guía para Desarrolladores de IA

Para extender esta funcionalidad o construir nuevas herramientas, consulta la guía técnica detallada:
[**Guía para Desarrolladores de IA](./client/simulation/AI_DEVELOPER_GUIDE.md)**
