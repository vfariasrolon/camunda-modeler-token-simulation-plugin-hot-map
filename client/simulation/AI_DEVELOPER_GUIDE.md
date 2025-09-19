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
        *   **Comparativo de Planes (Vista Principal)**: Al seleccionar "Resumen General" (la primera opción), ahora se muestra una vista de comparación avanzada. Esta interfaz presenta dos tarjetas lado a lado: "Plan Normal" vs. "Plan con Horas Extras". La tarjeta de horas extras desglosa los costos detalladamente, permitiendo al usuario ver exactamente cuánto corresponde al costo de operación base y cuánto a los bonos de tiempo extra. Esta es la herramienta principal para el análisis financiero y la toma de decisiones.
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
| **🕒** | **Tiempo de Espera Total** | Muestra el **tiempo total de espera sumado**, no el promedio. |
| **↻** | **Tiempo de Ciclo (Cycle Time)** | Muestra el **tiempo promedio total de un caso** (de principio a fin). Se visualiza sobre los eventos de fin. |
| **📊** | **Frecuencia (Frequency)** | Muestra el **número de veces que se ha ejecutado** cada elemento, revelando las rutas más comunes. |
| **🕒** | **Tiempo de Proceso (Process Time)** | Muestra el **tiempo de trabajo activo** promedio en cada tarea. |
| **🐞** | **Tasa de Fallos (Failure Rate)** | Visualiza las tareas donde ocurren más fallos. |
| **🚚** | **Espera de Transporte** | Muestra el tiempo perdido esperando por un vehículo o lote (si la lógica está activada). |
| **⚠️** | **Despachos Ineficientes** | Muestra el número de despachos de transporte ineficientes (ej. un vehículo que sale sin estar lleno). |
| **👥** | **Cantidad de Recursos** | Muestra el **número de recursos configurados** para cada tarea. |

#### Controles de la Paleta

*   **Limpiar**: Elimina el mapa de calor y las etiquetas de datos del diagrama.
*   **R+ / R-**: Aumentan/disminuyen el **Radio** de las manchas de calor.
*   **B+ / B-**: Aumentan/disminuyen el **Blur** (desenfoque) del mapa de calor.

---

## Módulo de Simulación Avanzada (Calendario Laboral y Costos)

Esta sección detalla las funcionalidades avanzadas añadidas al motor de simulación para permitir un análisis de costos y tiempos mucho más realista.

### 1. Arquitectura de los Nuevos Módulos

*   **`client/simulation/BusinessCalendar.js`**: Este es un módulo nuevo y autocontenido que maneja toda la lógica de tiempo laboral. Es el responsable de sumar tiempo saltando noches/fines de semana y de calcular el tiempo de trabajo neto entre dos fechas. Es la fuente de verdad para todos los cálculos de tiempo. Su función `addWorkingTime` fue optimizada para realizar saltos matemáticos en lugar de iterar, evitando así que la aplicación se congele en simulaciones largas.
*   **`client/editor/DataEditor.js`**: Este archivo controla la interfaz de usuario del panel de propiedades. La lógica para renderizar los formularios se encuentra en los métodos `render<ElementType>Form`. Fue modificado para centralizar toda la configuración global en el `StartEvent`.
*   **`client/simulation/SimulationEngine.js`**: El motor principal. Fue refactorizado para usar el `BusinessCalendar` y para buscar su configuración en un "Evento de Inicio Raíz".
*   **`client/simulation/SimulationController.js`**: El orquestador que conecta el motor con la UI. Fue actualizado para manejar y visualizar las nuevas métricas y el panel de resumen.
*   **`client/simulation/ChartPanel.js`**: El panel de gráficos. Fue actualizado para incluir una opción de "Resumen General".

### 2. Flujo de Configuración Global (MUY IMPORTANTE)

La configuración de la simulación (calendario, costos, reglas de horas extras, número de instancias) ya no se encuentra en el elemento Proceso/Participante. El nuevo flujo es:

1.  El usuario selecciona un `bpmn:StartEvent`.
2.  En el panel de propiedades (`DataEditor.js`), marca la casilla **"Usar como Configuración Raíz"**.
3.  Todos los parámetros globales se configuran en este panel.
4.  Al ejecutar la simulación, `SimulationEngine.js` llama a `_findRootConfig()` para escanear todos los eventos de inicio y encontrar el que tiene la bandera `isRoot: true`.
5.  Toda la simulación se ejecuta con base en la configuración de ese evento de inicio raíz. Si no se encuentra ninguno, se usa una configuración por defecto y se muestra una advertencia en la consola.

### 3. Lógica de Costos y Horas Extras (Refactorizada)

El sistema de costos fue refactorizado para proveer un desglose más claro y útil para la toma de decisiones.

*   El costo de una tarea ahora se calcula con base en los siguientes componentes, que se almacenan en el objeto de resultados de la simulación:
    *   **`totalOperationCost`**: Este es el **costo base de la operación**. Se calcula tomando todo el tiempo de trabajo de una tarea (tiempo de procesamiento + tiempo de reparación) y multiplicándolo por la tarifa base (`baseRatePerHour`). Es el costo del trabajo como si todas las horas se pagaran a tarifa normal.
    *   **`totalDoubleOvertimeCost`**: Este es el **pago extra (premium)** por las horas trabajadas en la franja de "pago doble". No incluye el costo base de esas horas (que ya está en `totalOperationCost`).
    *   **`totalTripleOvertimeCost`**: Similar al anterior, es el **pago extra (premium)** por las horas que exceden el límite y entran en la franja de "pago triple".
    *   **`totalWaitTimeCost`**: El costo incurrido por el tiempo de espera de recursos.
*   El **`totalCost`** de una tarea (y del proceso) es la suma de todos estos componentes: `totalOperationCost` + `totalDoubleOvertimeCost` + `totalTripleOvertimeCost` + `totalWaitTimeCost`.

---

## Estructura de Datos JSON `simulationData` (Actualizada)

La estructura del JSON varía según el tipo de elemento.

**A. Para un `bpmn:StartEvent` (cuando es `isRoot: true`):**
```json
{
  "arrivalRate": { "value": 1, "unit": "minute" },
  "simulationConfig": { "runValue": 10 },
  "isRoot": true,
  "calendar": {
    "workingDays": [1, 2, 3, 4, 5],
    "workingHours": {
      "start": { "hour": 9, "minute": 0 },
      "end": { "hour": 17, "minute": 0 }
    }
  },
  "cost": {
    "baseRatePerHour": 50,
    "waitCostPerHour": 0
  },
  "overtime": {
    "limitHours": 9,
    "payMultiplier": 2,
    "excessPayMultiplier": 3
  }
}
```

**B. Para un `bpmn:Task` (o UserTask, ScriptTask, etc.):**
```json
{
  "processingTime": {
    "distribution": "fixed", "value": 3, "unit": "minutes"
  },
  "failureRate": 0.11,
  "reworkTime": {
    "value": 3, "unit": "minutes"
  }
}
```
**Nota:** El costo de la tarea ya no se define aquí, se calcula a partir del `baseRatePerHour` de la configuración raíz.

**C. Para un Flujo de Secuencia (`bpmn:SequenceFlow`) saliente de una Compuerta Exclusiva:**
```json
{
  "branchingProbability": 0.78
}
```

**D. Para el Proceso (`bpmn:Process`) o un Participante (`bpmn:Participant`):**
```json
{
  "resourcePools": [
    { "name": "Analistas", "quantity": 1 }
  ]
}
```

---

## Aprendizajes Clave para Futuros Agentes

*   **Cuidado con el Rendimiento de los Bucles**: El principal "bug" de la aplicación no era un bucle infinito, sino un bucle de muy bajo rendimiento en `BusinessCalendar.js` que iteraba sobre el tiempo en lugar de hacer saltos matemáticos. En simulaciones, los cálculos de tiempo deben ser eficientes para evitar congelar la aplicación.
*   **Fuente Única de Verdad para la Configuración**: Un bug de bucle infinito fue causado por tener la configuración dividida en dos lugares (el `runValue` en el Proceso y el resto en el Evento de Inicio). Centralizar toda la configuración en el Evento de Inicio Raíz solucionó el problema. Es un principio de diseño clave.
*   **Unidades de Medida**: Un error crítico que causaba resultados de miles de años fue pasar milisegundos a una función (`addWorkingTime`) que esperaba minutos. Se debe tener extremo cuidado con las unidades de medida, especialmente al interactuar entre diferentes módulos.
*   **Visión a Futuro del Usuario (Modo Planificación)**: El usuario ha expresado un gran interés en una futura funcionalidad de "Modo Planificación". Esto implicaría que el usuario proporciona una **fecha límite** y el sistema debe simular si es posible cumplirla, usando proactivamente las horas extras como un recurso para acelerar las tareas. Este sería el siguiente gran paso lógico en la evolución de esta herramienta.
*   **Diferencia entre Tiempo de Calendario y Tiempo de Trabajo**: Los usuarios pueden confundirse si los resultados muestran el tiempo de calendario bruto (incluyendo noches y fines de semana). Es importante que los resultados, como la "Duración Total", se presenten como **Tiempo de Trabajo Neto**, calculado a través del `BusinessCalendar`.
---

*El resto de la guía original se mantiene sin cambios.*

## 1. Arquitectura de Datos: ¿Dónde se guardan los datos?

Los datos de simulación no se guardan en un archivo separado. Se almacenan directamente dentro del archivo `.bpmn` (que es un XML) como una **propiedad de extensión de Camunda**.

- **Elemento Raíz**: `bpmn:ExtensionElements`
- **Contenedor**: `camunda:Properties`
- **Propiedad**: `camunda:Property` con el atributo `name="simulationData"`
- **Valor**: El valor de esta propiedad es una **cadena de texto (string) que contiene un objeto JSON**.

**Ejemplo de XML para una Tarea:**
```xml
<bpmn:task id="Activity_123" name="Mi Tarea">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="simulationData" value="{&quot;processingTime&quot;:{&quot;value&quot;:10}}" />
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:task>
```
**Nota Importante:** El JSON dentro del atributo `value` está escapado en formato XML (ej. `"` se convierte en `&quot;`). Las herramientas de `bpmn-js` manejan esto automáticamente.

## 2. Guía Técnica para LEER `simulationData`

Para leer el JSON de un elemento del diagrama, necesitas usar los servicios que provee `bpmn-js`. Se recomienda usar la función `getSimulationData` de `client/simulation/util.js` que ya encapsula esta lógica.

**Pasos (Implementación interna de `getSimulationData`):**
1.  **Obtener el `businessObject`**: Este es el objeto que contiene los datos subyacentes del modelo.
2.  **Obtener `extensionElements`**.
3.  **Obtener `camunda:Properties`**.
4.  **Obtener la Propiedad `simulationData`**.
5.  **Parsear el JSON**: El valor (`simProperty.value`) es un string. Hay que convertirlo a un objeto JavaScript.

## 3. Guía Técnica para ESCRIBIR `simulationData`

Para modificar o crear los datos, el proceso es similar pero a la inversa. Se necesitan los servicios `modeling` y `bpmnFactory`.

**Servicios Requeridos:**
- `modeling`: El servicio principal para realizar cambios en el diagrama.
- `bpmnFactory`: Para crear nuevos elementos de BPMN (como `camunda:Property`) de forma segura.

**Pasos:**
1.  **Obtener el Elemento y `businessObject`**.
2.  **Preparar los Nuevos Datos**: Construir el objeto JavaScript con los datos de simulación.
3.  **Convertir a String**: `JSON.stringify(newData, null, 2)`.
4.  **Obtener o Crear `extensionElements`**, `camunda:Properties`, y la `camunda:Property` "simulationData".
5.  **Asignar el Nuevo Valor y Actualizar el Modelo**:
    ```javascript
    simProperty.value = simulationDataString;
    modeling.updateProperties(element, {
      extensionElements: extensionElements
    });
    ```
