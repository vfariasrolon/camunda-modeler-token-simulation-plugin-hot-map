# Guía para Desarrolladores de IA: Lectura y Escritura de Datos de Simulación

Este documento es una guía técnica para agentes de IA. Describe cómo interactuar con los datos de simulación (`simulationData`) almacenados dentro de los diagramas BPMN en este proyecto. El objetivo es permitir que un agente pueda construir nuevas herramientas, como un panel de propiedades, para editar estos datos.

> **Estado de este documento (revisado el 2026-09-15):** el contenido se verificó
> línea a línea contra el código fuente. Se corrigieron tres afirmaciones que contradecían
> la implementación real (el rendimiento de `addWorkingTime`, el fallback inexistente cuando
> falta el evento raíz, y la fórmula de `totalCost`), se completaron cuatro métricas de la
> paleta de análisis que faltaban y se documentaron los módulos del cliente que no
> aparecían. Los bloques marcados con ⚠️ señalan **discrepancias reales entre lo
> documentado y el código**, no simples matices de redacción: léelos antes de confiar en
> la sección que los contiene. Lo que no se pudo verificar se marca explícitamente como no
> verificado en lugar de omitirse.
>
> **Cambios estructurales de esta revisión** (afectan a cómo se edita y a qué módulos
> existen; el detalle está en cada sección):
>
> - Se **eliminó** `client/editor/` (`DataEditor.js`, `data-editor.css`, `index.js`) y el
>   módulo `RandomDataGenerator.js`. **El único editor de datos es el panel de tabla**
>   (`client/simulation/DataTablePanel.js`). El icono del lápiz sobre cada figura ya no
>   abre un modal propio: abre esa tabla centrada en el elemento.
> - Se añadió la pestaña **Recursos** (`resourcePools`) y las columnas **Recurso** /
>   **Cant.** en la pestaña Tareas: el campo `resources` del motor ya se puede escribir
>   desde la interfaz.
> - Se **eliminaron** tres métricas fantasma de la paleta y tres tarjetas siempre-cero del
>   resumen (ver §3).
> - Se corrigió el **cupo semanal de horas extra** para indexarlo por semana ISO completa
>   (`2026-W03`), no solo por número.
> - El valor por defecto de `arrivalRate` pasó de `{ value: 60, unit: "minute" }` (que
>   significa *una llegada por segundo*) a `{ value: 1, unit: "minute" }`.
> - Documentación de usuario extensa en **`docs/GUIA_SIMULACION.md`**.

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

En la barra de herramientas principal (generalmente a la izquierda, junto a la paleta de elementos BPMN), se añaden cuatro nuevos botones:

| Icono | Título | Función |
| :--- | :--- | :--- |
| **▶️** | **Ejecutar Simulación** | Inicia el motor de simulación. Lee los `simulationData` del diagrama, ejecuta la simulación completa en segundo plano y guarda los resultados agregados para su análisis. Corre **dos planes**: normal y con horas extra. |
| **☯️** | **Mostrar Análisis** | Abre la **Paleta de Análisis**. Esta paleta lateral permite visualizar diferentes métricas de la simulación directamente sobre el diagrama en forma de mapa de calor (heatmap). |
| **📊** | **Mostrar Gráficos** | Abre el **Panel de Gráficos** en la parte inferior de la pantalla. Este panel ofrece un análisis más profundo con tablas de datos y diversos tipos de gráficos (barras, dispersión, Pareto). |
| **▦** | **Editar Datos por Tabla** | Abre el **panel de edición por tabla**: la única vía de edición de datos. Cuatro pestañas (Tareas, Flujos, Recursos, Global), exportación e importación de CSV, botón de datos de prueba y validación bloqueante. |

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
| **🕒** | **Horas Extras (Overtime)** | Horas trabajadas dentro de las franjas de pago doble/triple. |
| **$** | **Costo de Tiempos Muertos** | Costo incurrido por espera de recursos, calculado con `cost.waitCostPerHour`. |
| **👥** | **Cantidad de Recursos** | Muestra el **número de recursos configurados** para cada tarea. |

> **Métricas retiradas (2026-09-15).** La paleta ofrecía también «Costo de Reparación por
> Fallo», «Espera de Transporte» y «Despachos Ineficientes». **El motor nunca acumuló los
> campos que las alimentaban** (`totalReworkCost`, `totalTransportWaitTime`,
> `inefficientDispatchCount`): el mapa de calor recibía `NaN` y los gráficos salían vacíos.
> Se eliminaron en lugar de documentarlas como si funcionaran. Si en el futuro se
> implementa la logística, hay que **volver a añadirlas** en tres sitios a la vez:
> `SimulationPalette.js` (entrada + ayuda), el `<select>` de `ChartPanel.js`, y el mapa
> `NOMBRES_METRICA` y las ramas de `showMetric`/`getChartData` de `SimulationController.js`.

> **Nota:** Las métricas se definen en `client/simulation/SimulationPalette.js`. Las claves
> internas vigentes son `cost`, `waitTime`, `totalWaitTime`, `cycleTime`, `frequency`,
> `processTime`, `failureRate`, `reworkTime`, `overtime`, `waitTimeCost` y
> `resourceQuantity`. Si añades una métrica, regístrala ahí: el mapa de calor de
> `SimulationController.js` consume esas claves.

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
*   **`client/simulation/SimulationEngine.js`**: El motor principal. Usa el `BusinessCalendar`
    y busca su configuración en un "Evento de Inicio Raíz". Contiene además `_logReport()`,
    el informe de validación que imprime entradas y salidas en consola (§Validación).
*   **`client/simulation/SimulationController.js`**: El orquestador que conecta el motor con
    la UI. Contiene la lógica del mapa de calor, la exportación a PNG y el resumen. También
    normaliza las unidades de los gráficos (ver `METRICAS_TIEMPO`).
*   **`client/simulation/ChartPanel.js`**: El panel de gráficos y tablas, con el resumen, el
    comparativo de planes y la ayuda extensa.
*   **`client/simulation/DataTablePanel.js`**: **La única interfaz de edición de datos.**
    Cuatro pestañas (Tareas, Flujos, Recursos, Global), exportación/importación de CSV con
    validación bloqueante, botón de datos de prueba y el icono de lápiz que abre la tabla
    centrada en el elemento seleccionado (`openFor`). Cualquier campo nuevo de datos debe
    añadirse aquí.
    > **Historia:** antes existía además `client/editor/DataEditor.js`, un modal por
    > elemento. Se retiró porque **destruía datos**: al guardar escribía
    > `distribution: "fixed"` de forma incondicional, así que abrir y guardar el modal de
    > una tarea con distribución triangular borraba su `min`/`mode`/`max` y la convertía en
    > fija. Dos editores escribiendo la misma propiedad es, además, una fuente garantizada
    > de inconsistencias.
*   **`client/simulation/SimulationPalette.js`**: Registra las métricas de la paleta de análisis y sus controles (limpiar, radio, blur). **Es el punto de entrada para añadir una métrica nueva al mapa de calor.** El mapa de calor que ves en el diagrama se define aquí, aunque el renderizado ocurra en `SimulationController.js`.
*   **`client/simulation/MatrixLoader.js`** (+ `matrix-loader.css`): aviso de carga durante la simulación. Anima con CSS sobre `transform` **a propósito**: la simulación es síncrona y bloquea el hilo principal, así que una animación en JavaScript se congelaría. Las animaciones de `transform`/`opacity` corren en el hilo de composición del navegador y siguen moviéndose aunque el JS esté bloqueado.
*   **`client/simpleheat-svg.js`**: Implementación del mapa de calor sobre SVG. Es el motor de dibujo de las manchas de calor.
*   **`client/TimeTracker.js`**: Rastreador de tiempos alternativo basado en eventos `TRACE_EVENT` del token-simulation original. **No forma parte del motor nuevo**: es una vía paralela que sigue el flujo de tokens del plugin original.
*   **`client/HideModelerElements.js`**: Oculta elementos del panel del modeler.
*   **`client/simulation/index.js`**, **`client/client.js`**: Registro de servicios de inyección de dependencias y punto de entrada del cliente. (`client/editor/` **ya no existe**.)

### 2. Flujo de Configuración Global (MUY IMPORTANTE)

La configuración de la simulación (calendario, costos, reglas de horas extras, número de instancias) ya no se encuentra en el elemento Proceso/Participante. El nuevo flujo es:

1.  El usuario selecciona un `bpmn:StartEvent`.
2.  Abre el panel de tabla (`client/simulation/DataTablePanel.js`) y, en la pestaña **Global**,
    pulsa **«Usar … como configuración raíz»** si no existe ninguna. Eso escribe los valores
    por defecto y marca `isRoot: true`.
3.  Todos los parámetros globales se editan en esa pestaña Global.
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

*   ✅ **Campos fantasma (corregidos el 2026-09-15).** `SimulationController.js` leía
    `result.totalReworkCost`, `result.totalOvertimeCost` y `result.totalNormalTimeCost` al
    construir el resumen, pero **`SimulationEngine.initialize` no los crea ni el motor los
    acumula en ningún punto**. El `|| 0` del consumidor los convertía en tres tarjetas que
    mostraban **siempre `$0.00`**. Se sustituyeron por valores reales:
    `totalOperationCost` (costo base), `totalDoubleOvertimeCost + totalTripleOvertimeCost`
    (primas) y `totalWaitTimeCost` (espera). El resumen incluye ahora una línea de
    **comprobación** que recalcula `operación + primas + espera` y la compara con `totalCost`.
    Si vuelves a añadir una tarjeta, comprueba que el campo existe de verdad en
    `initialize()`.

*   **Campos que el motor sí acumula** (lista completa, en `initialize()`):
    `executionCount`, `failureCount`, `totalWaitTime` *(minutos)*, `totalProcessingTime`
    *(ms)*, `totalCost`, `totalCycleTime` *(minutos)*, `totalOvertime` *(ms)*,
    `totalReworkTime` *(ms)*, `totalWaitTimeCost`, `totalOperationCost`,
    `totalDoubleOvertimeCost`, `totalTripleOvertimeCost`, `name`.

    > ⚠️ **Dos unidades de tiempo conviven en el mismo objeto de resultados.**
    > `totalWaitTime` y `totalCycleTime` están en **minutos** (los acumula
    > `calculateBusinessDurationInMinutes`); el resto de campos de tiempo están en
    > **milisegundos**. Formatear un campo de minutos con `formatMilliseconds()` da un error
    > de 60 000×. Usa `formatMinutes()` para los dos primeros. En los gráficos, el mapa
    > `METRICAS_TIEMPO` de `SimulationController.js` centraliza esa conversión: **añade ahí
    > cualquier métrica de tiempo nueva** en lugar de dividir a mano por 60000.

*   **`this.overtimeBreakdown` y `this.weeklyStats`**: el primero acumula el tiempo extra
  repartido por tramo (`normalMs` / `excessMs`); el segundo, el cupo consumido por semana
  ISO. Ambos los imprime `_logReport()`. El cupo se indexa con
  `BusinessCalendar.getWeekKey()` (clave `AAAA-Wnn`, año ISO incluido): indexarlo con
  `getWeekNumber()` a secas hacía que la semana 1 de dos años distintos compartiera contador,
  y la segunda heredaba el cupo ya agotado de la primera.

*   ⚠️ **`executionCount` y el elemento terminal.** `INSTANCE_COMPLETE` se emite llevando el
  elemento terminal como transporte para cerrar el caso, y **no** debe contar como ejecución
  suya. Contarlo (como se hacía) sumaba 2 ejecuciones por caso al último elemento del
  diagrama, duplicando su «Frecuencia» y **partiendo a la mitad** su tiempo de ciclo medio
  (que se acumula justo en ese punto). El incremento de `executionCount` va **después** del
  `return` de `INSTANCE_COMPLETE`: no lo muevas hacia arriba.

---

## Estructura de Datos JSON `simulationData` (Actualizada)

La estructura del JSON varía según el tipo de elemento.

**A. Para un `bpmn:StartEvent` (cuando es `isRoot: true`):**
```json
{
  "arrivalRate": { "value": 1, "unit": "minute" },
  "simulationConfig": { "runValue": 10 },
  "isRoot": true,
  "startDate": "2026-01-15",
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
> - **`arrivalRate.unit`** → singular: `"second"`, `"minute"` o `"hour"`. *Cualquier otro
>   valor* se trata como **minutos**. El default de la interfaz es
>   `{ value: 1, unit: "minute" }` (una llegada por minuto).
>   ⚠️ **`arrivalRate` es una TASA (llegadas por unidad de tiempo), no un intervalo.**
>   `{ value: 60, unit: "minute" }` **no** es «una cada 60 minutos»: son 60 llegadas por
>   minuto, es decir **una cada segundo**. Es el error más fácil de cometer y no produce
>   ningún aviso; el informe de consola imprime la tasa resuelta («una cada 1.0 s») para
>   hacerlo visible. El default era `60/minute` y producía ese efecto: 1 000 instancias
>   entraban en la primera jornada y agotaban el cupo semanal de horas extra en una sola
>   semana. Se cambió a `1/minute`.
> - **`processingTime.unit` y `reworkTime.unit`** (tareas) → **plural**:
>   `"seconds"`, `"minutes"` o `"hours"`. *Cualquier otro valor*, incluido el singular
>   `"minute"`, cae al fallback de `timeToMilliseconds` (`SimulationEngine.js:11-16`),
>   que **devuelve el número tal cual, como milisegundos**.
>
> Ese fallback es un **error silencioso**: un valor de `10` con `unit: "minute"` se
> interpreta como 10 ms en lugar de 10 minutos — un factor de 60.000 — y no aparece
> ningún aviso en consola. Escribe siempre la unidad exacta que espera cada campo.

> ⚠️ **`startDate` debe ser exactamente `YYYY-MM-DD`.** `SimulationEngine.initialize` lo
> valida con `/^\d{4}-\d{2}-\d{2}$/` y, si no encaja, **usa la fecha actual y no avisa**.
> Un `"2026-01-15T09:00"` (con hora) es un valor silenciosamente ignorado. La hora de
> arranque no se toma de aquí, sino de `calendar.workingHours.start`.
> Déjalo vacío (`""`) para simular desde hoy.

**B. Para un `bpmn:Task` (o UserTask, ScriptTask, etc.):**
```json
{
  "processingTime": {
    "distribution": "fixed", "value": 3, "unit": "minutes"
  },
  "failureRate": 0.11,
  "reworkTime": {
    "distribution": "fixed", "value": 3, "unit": "minutes"
  },
  "resources": {
    "pool": "Analistas", "quantityRequired": 1
  }
}
```

Las dos formas de `processingTime`:

```json
{ "distribution": "fixed", "value": 3, "unit": "minutes" }

{ "distribution": "triangular", "min": 2, "mode": 4, "max": 9, "unit": "minutes" }
```

Con `triangular` debe cumplirse `min <= mode <= max`; **`value` se ignora por completo**.
Cuando `distribution` está ausente se trata como `fixed`.

`resources` es **opcional**. Si está ausente, o si `pool` no coincide **exactamente** con el
nombre de una piscina declarada en el proceso, el motor **ignora el recurso en silencio**
(no avisa). `quantityRequired` por defecto vale 1. Es la razón de que la columna «Recurso» de
la tabla sea un desplegable y no un campo de texto: una errata desactivaría la restricción
sin que nada lo indicara.

**Nota:** El costo de la tarea **no** se define aquí; se calcula a partir de
`cost.baseRatePerHour` de la configuración raíz. Cualquier campo `cost` dentro de una tarea
es código heredado y se ignora.

**C. Para un Flujo de Secuencia (`bpmn:SequenceFlow`) saliente de una Compuerta Exclusiva:**
```json
{
  "branchingProbability": 0.78
}
```

⚠️ **El valor se guarda como FRACCIÓN (0-1), pero la interfaz muestra y edita en %.**

La tabla de datos muestra `78` con un sufijo `%` y guarda `0.78`. Toda la conversión vive en
`DataTablePanel.js`, con tres constantes declaradas juntas:

| Constante | Para qué |
|---|---|
| `TOLERANCIA_REPARTO_PCT` (0,5) | Holgura al comprobar que el reparto suma 100 %. La usan **el indicador y la validación**, para que el color no contradiga a lo que se puede guardar. |
| `IGUALDAD_REPARTO_PCT` (0,05) | Dos salidas se consideran «iguales» por debajo de esta diferencia, para que un reparto equitativo vuelva a salir redondo (40/40) y no 39,99/40,01. |
| `redondear2` / `pctATexto` | Redondeo a 2 decimales de porcentaje y conversión fracción ↔ texto. |

⚠️ **Invariante: las salidas de cada compuerta exclusiva deben sumar 100 %.** No es una
preferencia de estilo: `findNextElements` **acumula** las probabilidades y elige la primera
rama cuyo acumulado alcance el número aleatorio. Si la suma no llega a 1, el resto de los
casos cae en la **última** rama (`if (!chosenFlow) chosenFlow = element.outgoing[...]`), y si
la supera, **las últimas ramas nunca se eligen**. Por eso:

- El editor **autoajusta**: al cambiar una salida, reparte el resto (a partes iguales si
  estaban iguales; en proporción a lo que tuvieran si no). La última se calcula por resta
  para que la suma sea exacta.
- El guardado **bloquea** una compuerta cuya suma se aleje más de `TOLERANCIA_REPARTO_PCT`.
- Una compuerta con **una sola salida** no se valida ni se escribe: el motor la toma siempre
  porque su rama `else` no consulta la probabilidad. En la tabla aparece fija al 100 % y
  deshabilitada.
- Solo las compuertas **exclusivas** usan esta probabilidad. En inclusivas y por evento el
  motor toma `element.outgoing[0]` sin mirar los datos.

**CSV:** la columna es `probabilidad_pct` (0-100). Al **importar** también se acepta el
nombre antiguo `probabilidad` (0-1) para no romper un CSV exportado antes del cambio; el
formato se decide por el **nombre de la columna**, nunca por la magnitud del valor (adivinar
convertiría un 1 % legítimo en 100 %).

**Lo que NO hay que hacer:** normalizar en silencio al guardar. El autoajuste solo actúa
mientras se edita; lo que venga de un CSV o de un BPMN a mano se valida, no se corrige solo.

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

**Preferir el helper.** `client/simulation/util.js` ya expone
`setSimulationData(element, data, { modeling, bpmnFactory })`, que hace los cinco pasos y
crea la jerarquía de extension elements si falta. Todos los módulos del proyecto lo usan;
no dupliques la lógica.

**Modo Token Simulation = solo lectura.** La feature `DisableModeling` del plugin
token-simulation intercepta los métodos de `modeling` y lanza `new Error('model is
read-only')` (`DisableModeling.js:51`). **Cualquier escritura debe capturar ese error** y
ofrecer una salida, no dejarlo escapar como error críptico de un plugin ajeno. Ese es el
patrón que sigue `DataTablePanel`: al detectar `/read-only/i` guarda los valores en pantalla,
ofrece un botón que dispara `editorActions.trigger('toggleTokenSimulation')` y reintenta.
(`toggleTokenSimulation` está en la **lista blanca** de `DisableModeling`, así que funciona
con el modo activo — es su propósito.)

---

## 4. Validación: cómo comprobar que el motor es correcto

Dos herramientas, y conviene usar las dos.

### 4.1 El informe de consola (`SimulationEngine._logReport`)

Imprime cuatro bloques: `ENTRADAS · configuración global`, `ENTRADAS · por tarea`,
`SALIDAS · por tarea` y `SALIDAS · totales`. Con distribución **fija** y sin fallos, cada
número se recalcula a mano. En `SALIDAS · totales` destacan tres campos que existen
**específicamente** para poder auditar el reparto de horas extra:

| Campo | Por qué está |
|---|---|
| `semanas_con_horas_extra` | Si vale 1, el tramo doble **no puede** pasar del límite semanal, por muchas horas extra que haya. Explica de un vistazo un reparto 9 h / N h que de otro modo parece un error. |
| `horas_extra_en_tramo_doble_h` | Las horas reales del tramo doble, para contrastar con `de_eso_prima_doble` (prima = horas × tarifa × (mult − 1)). |
| `horas_extra_en_tramo_triple_h` | Ídem para el triple. Doble + triple debe ser el total de horas extra. |

`cuadre_operacion_mas_primas` debe coincidir con `costo_total`.

### 4.2 El arnés fuera del navegador

`BusinessCalendar.js` **no tiene dependencias**: se puede copiar a un `.mjs` y ejecutarlo en
Node directamente. Es la forma más rápida de comprobar la aritmética de calendario y de
cupo semanal sin abrir Camunda Modeler — así se verificó, por ejemplo, que
`{ value: 60, unit: "minute" }` agota el cupo una sola vez mientras que
`{ value: 1, unit: "hour" }` lo agota una vez por semana (189 h en tramo doble en 21
semanas, exactamente 21 × 9).

Cuando escribas un arnés así, **revisa las unidades de tu propio código de comprobación**:
un ayudante `horas(minutos)` aplicado a un valor ya en horas da un factor 60 y hace
sospechar del motor cuando el error está en el test.

### 4.3 Documentación de usuario

`docs/GUIA_SIMULACION.md` es la guía extensa para el analista: teoría de colas, matemática de
la triangular, cupo semanal, fórmula exacta de costos, método de validación y una sección
explícita de lo que el plugin **no** hace (sin semilla, sin réplicas, sin intervalos de
confianza, sin periodo de calentamiento). Si cambias la semántica del motor, **actualiza ese
documento**: es lo que lee quien va a decidir con los números.
