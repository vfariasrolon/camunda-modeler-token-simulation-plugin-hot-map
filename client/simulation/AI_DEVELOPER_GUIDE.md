# Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación

Este documento es una guía técnica para agentes de IA. Describe cómo interactuar con los datos de simulación (`simulationData`) almacenados dentro de los diagramas BPMN en este proyecto. El objetivo es permitir que un agente pueda construir nuevas herramientas, como un panel de propiedades, para editar estos datos.

## Análisis General del Plugin: ¿Qué Hace y Cómo Funciona?

Este proyecto es un **plugin para Camunda Modeler** que añade una potente capacidad de **simulación y análisis de procesos de negocio**. Su objetivo es permitir a un usuario analizar y optimizar un proceso BPMN antes de su implementación.

El flujo de trabajo general es el siguiente:

1.  **Definición de Datos de Simulación**: El usuario enriquece el diagrama BPMN con datos específicos para la simulación. Por ejemplo, a una tarea se le puede asignar su tiempo de procesamiento, su costo, los recursos que necesita e incluso su probabilidad de fallo. Estos datos se almacenan directamente en el archivo `.bpmn` dentro de una propiedad de extensión llamada `simulationData`.

2.  **Ejecución de la Simulación**: El plugin contiene un **motor de simulación de eventos discretos**. Al iniciar la simulación, este motor lee los datos `simulationData` de cada elemento y ejecuta el proceso de forma virtual un número configurable de veces (ej. 1000 instancias). Durante la ejecución, recopila métricas detalladas sobre el rendimiento del proceso.

3.  **Análisis y Visualización de Resultados**: Una vez finalizada la simulación, el plugin ofrece herramientas visuales para analizar los resultados:
    *   **Mapa de Calor (Heatmap)**: Colorea el diagrama para mostrar visualmente los "puntos calientes" del proceso, como las tareas que consumen más tiempo o las rutas más transitadas.
    *   **Panel de Gráficos Avanzados**: Muestra un panel con múltiples gráficos para un análisis más profundo, incluyendo:
        *   **Gráficos de Barras**: Para identificar las tareas "Top 5" por costo, tiempo de espera o tiempo de procesamiento.
        *   **Diagrama de Dispersión**: Para correlacionar el costo y el tiempo de las tareas.
        *   **Diagrama de Pareto**: Para aplicar el principio 80/20 e identificar qué pocas tareas son responsables de la mayoría de los fallos del proceso.

En resumen, este plugin transforma Camunda Modeler de una herramienta de modelado a una plataforma de **inteligencia de procesos**, permitiendo la toma de decisiones basada en datos cuantitativos.

## Guía de la Interfaz de Usuario

El plugin añade varios controles a la interfaz de Camunda Modeler para ejecutar la simulación y visualizar los resultados.

### Barra de Herramientas Principal

En la barra de herramientas principal (generalmente a la izquierda, junto a la paleta de elementos BPMN), se añaden tres nuevos botones:

| Icono | Título | Función |
| :--- | :--- | :--- |
| **▶️** | **Ejecutar Simulación** | Inicia el motor de simulación. Lee los `simulationData` del diagrama, ejecuta la simulación completa en segundo plano y guarda los resultados agregados para su análisis. |
| **☯️** | **Mostrar Análisis** | Abre la **Paleta de Análisis**. Esta paleta lateral permite visualizar diferentes métricas de la simulación directamente sobre el diagrama en forma de mapa de calor (heatmap). |
| **📊** | **Mostrar Gráficos** | Abre el **Panel de Gráficos** en la parte inferior de la pantalla. Este panel ofrece un análisis más profundo con tablas de datos y diversos tipos de gráficos (barras, dispersión, Pareto). |

### Paleta de Análisis (Heatmap)

Esta paleta se abre al hacer clic en el botón del Yin-Yang (☯️). Cada botón aplica un "filtro" o mapa de calor diferente sobre el diagrama.

| Icono | Nombre de la Métrica | Explicación |
| :--- | :--- | :--- |
| **←** | **Atrás** | Cierra la paleta de análisis. |
| **$** | **Costo (Cost)** | Visualiza el **costo total acumulado** en cada tarea. |
| **🕒** | **Tiempo de Espera (Wait Time)** | Muestra el **tiempo de espera promedio** de cada tarea. Es clave para detectar **cuellos de botella** de recursos. |
| **↻** | **Tiempo de Ciclo (Cycle Time)** | Muestra el **tiempo promedio total de un caso** (de principio a fin). Se visualiza sobre los eventos de fin. |
| **📊** | **Frecuencia (Frequency)** | Muestra el **número de veces que se ha ejecutado** cada elemento, revelando las rutas más comunes. |
| **🐞** | **Tasa de Fallos (Failure Rate)** | Visualiza las tareas donde ocurren más fallos. |

## Estructura del Proyecto y Archivos Clave

A continuación se detalla la estructura de los archivos más importantes del plugin y sus responsabilidades.

| Archivo / Directorio | Propósito | Conexiones Principales |
| :--- | :--- | :--- |
| `index.js` | **Punto de entrada principal del plugin**. Es el primer archivo que Camunda Modeler carga. Su función es registrar el resto del código del plugin. | Carga `client/client.js` y `menu.js`. |
| `menu.js` | **Define los menús del plugin** en la barra superior de Camunda Modeler. | Es llamado por `index.js`. |
| **`client/`** | **Directorio que contiene todo el código que se ejecuta en la interfaz de usuario**. | |
| `client/client.js` | **Punto de entrada del código del cliente**. Aquí se inician todos los módulos. | Carga e inicializa los módulos de `client/simulation/`. |
| **`client/simulation/`** | **El corazón del plugin**. Contiene toda la lógica para la simulación y el análisis. | |
| `simulation/SimulationEngine.js` | **El cerebro de la simulación**. Contiene la lógica para ejecutar la simulación de eventos discretos. | Es utilizado por `SimulationController.js`. |
| `simulation/SimulationController.js` | **El orquestador**. Conecta la UI con la lógica de negocio. | Interactúa con `SimulationEngine.js`, `SimulationPalette.js` y `ChartPanel.js`. |

## Componentes de Software y Conceptos Clave

1.  **El Objeto `simulationData`**:
    *   Es un **objeto JSON** que contiene todos los parámetros de simulación para un elemento BPMN. Se almacena como un *string* dentro de una propiedad XML (`camunda:property`).
2.  **Servicios de `bpmn-js`**:
    *   `selection`, `elementRegistry`: Para leer el modelo.
    *   `modeling`, `bpmnFactory`: Para escribir y hacer cambios en el modelo.
3.  **Clases Principales**:
    *   `SimulationEngine`: Contiene la lógica pura de la simulación.
    *   `SimulationController`: Actúa como "pegamento" entre la UI y el motor.

## 1. Arquitectura de Datos: ¿Dónde se guardan los datos?

Los datos de simulación no se guardan en un archivo separado. Se almacenan directamente dentro del archivo `.bpmn` (que es un XML) como una **propiedad de extensión de Camunda**.

- **Elemento Raíz**: `bpmn:ExtensionElements`
- **Contenedor**: `camunda:Properties`
- **Propiedad**: `camunda:Property` con el atributo `name="simulationData"`
- **Valor**: El valor de esta propiedad es una **cadena de texto (string) que contiene un objeto JSON**.

**Ejemplo de XML para una Tarea:**
\`\`\`xml
<bpmn:task id="Activity_123" name="Mi Tarea">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="simulationData" value="{&quot;processingTime&quot;:{&quot;value&quot;:10}}" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:task>
\`\`\`
**Nota Importante:** El JSON dentro del atributo `value` está escapado en formato XML.

## 2. Guía Técnica para LEER `simulationData`
(Contenido original de la guía...)

## 3. Guía Técnica para ESCRIBIR `simulationData`
(Contenido original de la guía...)
