# Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación

Este documento es una guía técnica para agentes de IA. Describe cómo interactuar con los datos de simulación (`simulationData`) almacenados dentro de los diagramas BPMN en este proyecto. El objetivo es permitir que un agente pueda construir nuevas herramientas, como un panel de propiedades, para editar estos datos.

> **Estado de este documento (auditado el 2026-09-14):** el contenido se verificó línea a
> línea contra el código fuente. Se corrigieron tres afirmaciones que contradecían la
> implementación real (el rendimiento de `addWorkingTime`, el fallback inexistente cuando
> falta el evento raíz, y la fórmula de `totalCost`), se completaron cuatro métricas de la
> paleta de análisis que faltaban y se documentaron los módulos del cliente que no
> aparecían. Los bloques marcados con ⚠️ señalan **discrepancias reales entre lo
> documentado y el código**, no simples matices de redacción: léelos antes de confiar en
> la sección que los contiene. Lo que no se pudo verificar se marca explícitamente como no
> verificado en lugar de omitirse.

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
| **🕒** | **Tiempo de Reparación por Fallo** | Tiempo medio dedicado a reparar (rework) tras un fallo. |
| **$** | **Costo de Reparación por Fallo** | Costo acumulado del tiempo de reparación. |
| **🕒** | **Horas Extras (Overtime)** | Horas trabajadas dentro de las franjas de pago doble/triple. |
| **$** | **Costo de Tiempos Muertos** | Costo incurrido por espera de recursos, calculado con `cost.waitCostPerHour`. |
| **🚚** | **Espera de Transporte** | Muestra el tiempo perdido esperando por un vehículo o lote (si la lógica está activada). |
| **⚠️** | **Despachos Ineficientes** | Muestra el número de despachos de transporte ineficientes (ej. un vehículo que sale sin estar lleno). |
| **👥** | **Cantidad de Recursos** | Muestra el **número de recursos configurados** para cada tarea. |

> **Nota:** Las métricas se definen en `client/simulation/SimulationPalette.js`. Las claves
> internas son `cost`, `waitTime`, `totalWaitTime`, `cycleTime`, `frequency`, `processTime`,
> `failureRate`, `reworkTime`, `reworkCost`, `overtime`, `waitTimeCost`,
> `transportWaitTime`, `inefficientDispatch` y `resourceQuantity`. Si añades una métrica,
> regístrala ahí: el mapa de calor de `SimulationController.js` consume esas claves.

#### Controles de la Paleta

*   **Limpiar**: Elimina el mapa de calor y las etiquetas de datos del diagrama.
*   **R+ / R-**: Aumentan/disminuyen el **Radio** de las manchas de calor (paso de ±5).
*   **B+ / B-**: Aumentan/disminuyen el **Blur** (desenfoque) del mapa de calor (paso de ±5).

---

## Módulo de Simulación Avanzada (Calendario Laboral y Costos)

Esta sección detalla las funcionalidades avanzadas añadidas al motor de simulación para permitir un análisis de costos y tiempos mucho más realista.

### 1. Arquitectura de los Nuevos Módulos

*   **`client/simulation/BusinessCalendar.js`**: Este es un módulo nuevo y autocontenido que maneja toda la lógica de tiempo laboral. Es el responsable de sumar tiempo saltando noches/fines de semana y de calcular el tiempo de trabajo neto entre dos fechas. Es la fuente de verdad para todos los cálculos de tiempo.
    > ⚠️ **Rendimiento (estado real, no el deseado):** `addWorkingTime` calcula el número de
    > días laborables de forma matemática, pero **después los recorre uno a uno** en un
    > `while (workDaysCounted < fullDays)`. La iteración está reducida a granularidad de
    > **día**, no eliminada. Peor: `calculateBusinessDurationInMinutes` — la función que
    > alimenta el "Tiempo Total (Horas Netas)" del resumen — **sí itera minuto a minuto**.
    > La optimización de este módulo es **parcial y sigue pendiente**. No des por hecho que
    > el problema de rendimiento en simulaciones largas está resuelto.
*   **`client/editor/DataEditor.js`**: Controla la interfaz de usuario del editor de datos de simulación. **Abre un modal** (clase `sim-data-editor-modal`), no el panel de propiedades nativo del modeler. La lógica para renderizar los formularios se encuentra en los métodos `render<ElementType>Form`. Fue modificado para centralizar toda la configuración global en el `StartEvent`.
*   **`client/simulation/SimulationEngine.js`**: El motor principal. Fue refactorizado para usar el `BusinessCalendar` y para buscar su configuración en un "Evento de Inicio Raíz".
*   **`client/simulation/SimulationController.js`**: El orquestador que conecta el motor con la UI. Fue actualizado para manejar y visualizar las nuevas métricas y el panel de resumen. También contiene la lógica del mapa de calor.
*   **`client/simulation/ChartPanel.js`**: El panel de gráficos. Fue actualizado para incluir una opción de "Resumen General".

Módulos que existen y conviene conocer (no documentados hasta ahora):

*   **`client/simulation/SimulationPalette.js`**: Registra las métricas de la paleta de análisis y sus controles (limpiar, radio, blur). **Es el punto de entrada para añadir una métrica nueva al mapa de calor.** El mapa de calor que ves en el diagrama se define aquí, aunque el renderizado ocurra en `SimulationController.js`.
*   **`client/simpleheat-svg.js`**: Implementación del mapa de calor sobre SVG. Es el motor de dibujo de las manchas de calor.
*   **`client/simulation/RandomDataGenerator.js`**: Generador de datos de simulación aleatorios. Registra la acción `generateRandomSimulationData` (útil para demos y pruebas). **Ojo:** escribe un campo `cost` en las tareas que ya no se usa (el costo se calcula desde `baseRatePerHour`); es código heredado.
*   **`client/TimeTracker.js`**: Rastreador de tiempos alternativo basado en eventos `TRACE_EVENT` del token-simulation original. **No forma parte del motor nuevo**: es una vía paralela que sigue el flujo de tokens del plugin original.
*   **`client/HideModelerElements.js`**: Oculta elementos del panel del modeler.
*   **`client/simulation/index.js`**, **`client/editor/index.js`**, **`client/client.js`**: Registro de servicios de inyección de dependencias y punto de entrada del cliente.

### 2. Flujo de Configuración Global (MUY IMPORTANTE)

La configuración de la simulación (calendario, costos, reglas de horas extras, número de instancias) ya no se encuentra en el elemento Proceso/Participante. El nuevo flujo es:

1.  El usuario selecciona un `bpmn:StartEvent`.
2.  En el editor de datos (`DataEditor.js`), marca la casilla **"Usar como Configuración Raíz (init_root)"**.
3.  Todos los parámetros globales se configuran en este editor.
4.  Al ejecutar la simulación, `SimulationEngine.js` llama a `_findRootConfig()` para escanear todos los eventos de inicio y encontrar el que tiene la bandera `isRoot: true`.
5.  Toda la simulación se ejecuta con base en la configuración de ese evento de inicio raíz.
6.  **Si no hay ningún evento raíz (o hay más de uno), la simulación FALLA.** No existe
    fallback: `_findRootConfig()` emite un `console.warn` y devuelve `null`, y acto seguido
    `run()` lanza `throw new Error("Cannot run simulation without a root configuration.")`.
    El controlador aborta y muestra una notificación de error. **No asumas valores por
    defecto**: sin evento raíz no hay resultados.

### 3. Lógica de Costos y Horas Extras (Refactorizada)

El sistema de costos fue refactorizado para proveer un desglose más claro y útil para la toma de decisiones.

*   Los componentes que **inicializa el motor** (`SimulationEngine.initialize`) y que se almacenan en el objeto de resultados son:
    *   **`totalOperationCost`**: Este es el **costo base de la operación**. Se calcula tomando todo el tiempo de trabajo de una tarea (tiempo de procesamiento + tiempo de reparación) y multiplicándolo por la tarifa base (`baseRatePerHour`). Es el costo del trabajo como si todas las horas se pagaran a tarifa normal.
    *   **`totalDoubleOvertimeCost`**: Este es el **pago extra (premium)** por las horas trabajadas en la franja de "pago doble". No incluye el costo base de esas horas (que ya está en `totalOperationCost`).
    *   **`totalTripleOvertimeCost`**: Similar al anterior, es el **pago extra (premium)** por las horas que exceden el límite y entran en la franja de "pago triple".
    *   **`totalWaitTimeCost`**: El costo incurrido por el tiempo de espera de recursos.
*   **El cálculo real de `totalCost` NO es una suma limpia de esos cuatro campos.** La fórmula
  del motor es:

  ```
  totalCost = (totalCost - waitTimeCost)
            + operationCost
            + doubleOvertimePremium
            + tripleOvertimePremium
            + waitTimeCost
  ```

  y el costo de espera del caso en curso se acumula **aparte**. Si necesitas el desglose
  exacto, lee `SimulationEngine.js` alrededor de la línea 384; no lo reconstruyas desde el MD.

*   ⚠️ **Bug conocido (campos fantasma):** `SimulationController.js` lee
  `result.totalReworkCost` y `result.totalNormalTimeCost` al construir el resumen, pero
  **`SimulationEngine.initialize` no los crea ni el motor los acumula en ningún punto**.
  Con el `|| 0` del consumidor, esos valores son **siempre cero**. No documentes su valor
  como si fuera real; o se calculan en el motor, o se eliminan de la UI. Existen además
  `totalReworkTime` y `totalOvertimeCost`, que sí se usan en el resumen.

---

## Estructura de Datos JSON `simulationData` (Actualizada)

La estructura del JSON varía según el tipo de elemento.

**A. Para un `bpmn:StartEvent` (cuando es `isRoot: true`):**
```json
{
  "arrivalRate": { "value": 60, "unit": "minute" },
  "simulationConfig": { "runValue": 10 },
  "isRoot": true,
  "startDate": "2026-01-15T09:00",
  "calendar": {
    "workingDays": [1, 2, 3, 4, 5],
    "workingHours": {
      "start": { "hour": 9, "minute": 0 },
      "end": { "hour": 17, "minute": 0 }
    },
    "holidays": ["2026-01-01", "2026-12-25"]
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

> ⚠️ **Unidades: hay DOS convenciones distintas. No las mezcles.**
>
> - **`arrivalRate.unit`** → singular: `"second"` o `"hour"`. *Cualquier otro valor*
>   (incluido `"minute"`) se trata como **minutos**. El default del editor es
>   `{ value: 60, unit: "minute" }`.
> - **`processingTime.unit` y `reworkTime.unit`** (tareas) → **plural**:
>   `"seconds"`, `"minutes"` o `"hours"`. *Cualquier otro valor*, incluido el singular
>   `"minute"`, cae al fallback de `timeToMilliseconds` (`SimulationEngine.js:11-16`),
>   que **devuelve el número tal cual, como milisegundos**.
>
> Ese fallback es un **error silencioso**: un valor de `10` con `unit: "minute"` se
> interpreta como 10 ms en lugar de 10 minutos — un factor de 60.000 — y no aparece
> ningún aviso en consola. Escribe siempre la unidad exacta que espera cada campo.

**B. Para un `bpmn:Task` (o UserTask, ScriptTask, etc.):**
```json
{
  "processingTime": {
    "distribution": "fixed", "value": 3, "unit": "minute"
  },
  "failureRate": 0.11,
  "reworkTime": {
    "value": 3, "unit": "minute"
  },
  "resources": {
    "pool": "Analistas", "quantityRequired": 1
  }
}
```

Para una distribución **triangular** (`distribution: "triangular"`), `processingTime` usa
`min`, `mode` y `max` en lugar de `value`:
```json
{
  "processingTime": {
    "distribution": "triangular", "min": 2, "mode": 4, "max": 9, "unit": "minute"
  }
}
```

**Nota:** El costo de la tarea ya no se define aquí, se calcula a partir del `baseRatePerHour` de la configuración raíz. (`RandomDataGenerator.js` sigue escribiendo un campo `cost` en las tareas: es código heredado, ignóralo.)

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
    > ⚠️ **Corrección (verificado):** este problema **NO está resuelto del todo**. `addWorkingTime`
    > redujo la iteración de minuto a **día**, pero sigue recorriendo los días uno a uno; y
    > `calculateBusinessDurationInMinutes`, que alimenta el "Tiempo Total (Horas Netas)",
    > **sigue iterando minuto a minuto**. Antes de dar esto por cerrado, mide: una simulación
    > con muchos casos y ventanas de calendario amplias todavía puede degradarse.
*   **Fuente Única de Verdad para la Configuración**: Un bug de bucle infinito fue causado por tener la configuración dividida en dos lugares (el `runValue` en el Proceso y el resto en el Evento de Inicio). Centralizar toda la configuración en el Evento de Inicio Raíz solucionó el problema. Es un principio de diseño clave. **Consecuencia:** no existe fallback; sin evento raíz marcado, la simulación aborta con error.
*   **Unidades de Medida**: Un error crítico que causaba resultados de miles de años fue pasar milisegundos a una función (`addWorkingTime`) que esperaba minutos. Se debe tener extremo cuidado con las unidades de medida, especialmente al interactuar entre diferentes módulos. **Añadido:** hay DOS convenciones y no son intercambiables: las tareas usan **plural** (`"minutes"`, `"hours"`, `"seconds"`) y `arrivalRate` usa **singular** (`"minute"`, `"hour"`, `"second"`). En una tarea, una unidad no reconocida **no da error**: se interpreta como milisegundos. Ver el aviso ampliado en la sección de estructura JSON.
*   **Visión a Futuro del Usuario (Modo Planificación)**: El usuario ha expresado un gran interés en una futura funcionalidad de "Modo Planificación". Esto implicaría que el usuario proporciona una **fecha límite** y el sistema debe simular si es posible cumplirla, usando proactivamente las horas extras como un recurso para acelerar las tareas. Este sería el siguiente gran paso lógico en la evolución de esta herramienta.
    > ℹ️ **Estado:** no implementado. No hay ningún campo de fecha límite ni lógica de
    > planificación en el código (`startDate` es solo la fecha de arranque de la simulación,
    > no un plazo). Es una idea registrada, no una funcionalidad.
*   **Diferencia entre Tiempo de Calendario y Tiempo de Trabajo**: Los usuarios pueden confundirse si los resultados muestran el tiempo de calendario bruto (incluyendo noches y fines de semana). Por eso el resumen presenta el **Tiempo de Trabajo Neto**, calculado a través del `BusinessCalendar`.
    > **Etiquetas reales en el resumen** (no "Duración Total"): "Tiempo Total (Horas Netas)",
    > "Días Laborales Totales", "Tiempo de Reparación Total" y "Total de Horas Extra".
    > Búscalas en `SimulationController.js` si necesitas referenciarlas.
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
