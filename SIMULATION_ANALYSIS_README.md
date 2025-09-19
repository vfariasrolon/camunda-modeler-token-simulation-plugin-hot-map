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
    *   **Costos y Horas Extras**: Define la tarifa por hora base y las reglas para el pago de horas extras.

### Paso 2: Definir Parámetros de las Tareas

1.  Selecciona una Tarea (`bpmn:Task`) en tu diagrama.
2.  En el panel de propiedades, define sus parámetros específicos (tiempo de procesamiento, tasa de fallo, etc.).

### Paso 3: Ejecutar y Analizar

1.  **Ejecutar**: En la barra de herramientas de la izquierda, haz clic en el botón de **reproducir (▶️)**. El motor ejecutará dos simulaciones completas: una con el horario normal y otra aplicando las reglas de horas extras.
2.  **Analizar**: Haz clic en el botón de **gráfico de barras (📊)** para abrir el **Panel de Análisis de Planes**.

## II. El Panel de Análisis de Planes

Para simplificar el análisis y ofrecer la información más relevante de forma directa, el panel de análisis ahora tiene un único propósito: **comparar el rendimiento y los costos de un plan de trabajo normal contra uno con horas extras.**

Al abrir el panel, verás una vista unificada que contiene toda la información necesaria para la toma de decisiones:

*   **Cronograma de Trabajo**: En la parte superior, siempre verás el calendario laboral que se usó para la simulación, para que tengas el contexto completo.
*   **Comparativo de Planes**: El contenido principal son dos tarjetas, "Plan Normal" y "Plan con Horas Extras", una al lado de la otra para una fácil comparación.
*   **Desglose de Costos Detallado**: La tarjeta del "Plan con Horas Extras" te ofrece un desglose financiero claro:
    *   **Costo de Operación**: El costo total del tiempo trabajado, pagado a tarifa normal.
    *   **Pago Extra (Doble/Triple)**: El bono *adicional* que se paga por trabajar en horas extras.
    *   **Costo Total**: La suma de la operación más los bonos.
*   **Icono de Ayuda (?)**: Si tienes dudas sobre cómo interpretar los costos, haz clic en el ícono de ayuda junto al título para ver una explicación detallada y un ejemplo práctico.

Este diseño consolidado elimina la necesidad de navegar entre diferentes gráficos y menús, presentando la conclusión del análisis de forma directa.

## III. Guía para Desarrolladores de IA

Para extender esta funcionalidad, consulta la guía técnica detallada:
[**Guía para Desarrolladores de IA](./client/simulation/AI_DEVELOPER_GUIDE.md)**
