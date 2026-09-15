# Changelog

All notable changes to the [camunda-modeler-token-simulation-plugin](https://github.com/camunda/camunda-modeler-token-simulation-plugin/blob/master/CHANGELOG.md) are documented here. We use [semantic versioning](http://semver.org/) for releases.

## Unreleased

* `FEAT`: **tramos de trabajo y descansos**. La jornada deja de ser un bloque: un descanso la parte
  en tramos, y la tarea que lo pilla a medias **se pausa y se retoma al volver**. Un descanso tiene
  **tres interruptores independientes**: si cuenta como jornada (afecta al umbral de horas extra —
  la ley lo exige cuando no se puede salir del centro), si es tiempo productivo (nunca lo es) y si
  también se toma en el tramo de horas extra. Editor en la pestaña Global y round-trip por CSV.
* `FEAT`: **curva de arranque** (`WarmupCurve.js`). El arranque lento no se mide: se declara, y con
  una curva es más realista que con un porcentaje fijo (el porcentaje plano repartiría la pérdida por
  toda la jornada, incluida la tarde). Formas **exponencial** (por defecto) y **lineal**; la
  logarítmica se descartó porque nunca llega al 100 % y exigiría inventar un tope. Con **vista previa
  de la curva** en el configurador, porque un parámetro abstracto no se puede discutir y una curva sí.
  Dos disparadores activables por separado: **inicio de jornada** y **regreso de descanso**.
* `FEAT`: la rampa **cuesta dinero**: el coste de operación usa la duración efectiva (ir lento se
  paga) mientras que el trabajo contabilizado sigue siendo el real. Sin arranque declarado no cambia
  nada, así que los diagramas existentes no se alteran.
* `FIX`: **regresión en `addWorkingTime`** encontrada al reescribirlo. Calculaba los días completos
  *después* de haber avanzado ya al día siguiente, así que contaba una jornada de más en cuanto la
  duración cruzaba días enteros: una tarea de 16 h que empezaba el martes terminaba el **jueves** en
  lugar del miércoles. Solo afectaba a duraciones de dos jornadas o más, por eso no salía en las
  corridas normales. Además ya no trunca los decimales al sumar (`setMinutes` hacía que 10,5 min
  sumaran 10, y ese medio minuto por tarea se acumulaba).
* `FIX`: los festivos se comparaban con la fecha en **UTC** (`toISOString`), así que en un huso
  negativo un festivo podía no aplicarse. Ahora la clave de día es local.
* `FEAT`: el informe de consola imprime los **tramos de trabajo**, los minutos de trabajo al día, los
  descansos y la **curva de arranque resuelta** («arranca al 70 %, las primeras tareas tardan ~43 %
  más, recupera en 30 min»), para poder contrastarla con la planta.
* `FEAT`: **informe técnico de evaluación** (botón «Informe PDF» en la barra). Se compone en
  HTML con las tablas del modelo, las figuras y un **scorecard auditable**, y se guarda como
  PDF con el diálogo de impresión. Incluye un apartado de **comprobación** que recompone el
  coste total a partir de sus componentes. Se imprime dentro de un `iframe` con su propio
  documento para que el PDF salga limpio sin depender del DOM de la aplicación.
* `FEAT`: **puntuación por dimensiones** con rampa lineal entre dos umbrales declarados (el
  umbral *bueno* vale 100 puntos, el *malo* 0). Siete dimensiones: saturación de recursos,
  variabilidad del ciclo, peso de la espera, coste indirecto de horas extra, calidad,
  estabilidad del ritmo y consistencia del modelo. El peso y el cálculo de cada punto se
  imprimen, y la nota se renormaliza sobre las dimensiones realmente medidas en lugar de dar
  cero a lo que no se ha medido. El **costo unitario y el plazo se informan sin calificar**:
  sin un objetivo declarado por el negocio, ponerles nota sería inventar el criterio.
* `FEAT`: el motor guarda **muestras por caso** del tiempo de ciclo y calcula la
  **utilización (ρ) por piscina de recursos**. Con eso se pueden dar percentiles
  (p50/p90/p95/p99) y juzgar capacidad, que con los totales por elemento no era posible.
* `FEAT`: siete gráficos nuevos — **desglose del costo apilado** (operación + primas +
  espera), **run chart** de producción con su media, **curva S** acumulada, **Pareto de
  esperas** (el del cuello de botella), **volumen por camino**, **distribución del tiempo de
  ciclo** (histograma con los percentiles en el título) y **utilización por recurso** con la
  línea de capacidad. El desplegable se agrupa por familias.
* `FEAT`: el informe de consola añade la utilización por piscina, la lectura de ρ en palabras
  y los percentiles del tiempo de ciclo.
* `CHORE`: `nombreElemento` pasa a `util.js` (lo comparten el controlador y el informe).
* `FEAT`: el reparto de las compuertas exclusivas se muestra y edita en **%** en vez de en
  fracciones (0-1), con un indicador de la suma por compuerta. Al cambiar una salida, **el
  resto se ajusta solo** para mantener el 100 %: a partes iguales si estaban iguales, y en
  proporción a lo que tuvieran si no. La última salida se calcula por resta, así que la suma
  es exacta (nada de 99,99 %).
* `FEAT`: el guardado **bloquea** una compuerta cuyo reparto no sume 100 %. No es una
  preferencia: el motor acumula las probabilidades, así que un reparto que no cuadre manda
  todo el sobrante a la última rama (o deja ramas inalcanzables) sin ningún aviso.
* `FEAT`: las compuertas de una sola salida aparecen fijas al 100 % y deshabilitadas: el
  motor siempre las toma y no lee su probabilidad. Se explica también que solo las
  compuertas exclusivas usan este reparto.
* `FEAT`: edición de datos por tabla (pestañas Tareas, Flujos, Recursos y Global) con
  exportación/importación de CSV, datos de prueba y validación bloqueante. Sustituye al
  modal por elemento, que sobrescribía `distribution` a `fixed` y destruía una
  distribución triangular configurada.
* `UI`: el panel de tabla se ensancha (hasta 1560 px) y se centra, con margen a los lados
  para no tocar los bordes. Con 12 columnas la tabla ya entra sin desplazamiento
  horizontal en pantallas normales; antes se quedaba en 1180 px.
* `UI`: el panel de gráficos se centra y usa el mismo ancho y márgenes. Su `box-sizing`
  era `content-box`, así que el relleno se sumaba por fuera y los márgenes laterales
  quedaban en 5 px en lugar de 24.
* `FIX`: el canvas de los gráficos llena su hueco exactamente (`maintainAspectRatio:false`).
  Antes crecía en alto con el ancho del panel (relación 2:1 por defecto) y el gráfico
  quedaba recortado y obligaba a desplazarse.
* `FIX`: la opción «Resumen General» del desplegable no tenía ninguna rama que la
  atendiera: dibujaba un gráfico vacío y es la primera opción, o sea lo primero que veía
  el usuario al abrir el panel. Ahora pinta el resumen en línea.
* `FEAT`: pestaña **Recursos** (`resourcePools`) y columnas **Recurso** / **Cant.** en
  Tareas. El campo `resources` del motor ya se puede escribir desde la interfaz.
* `FEAT`: informe de validación en consola con entradas y salidas, desglose de horas extra
  por tramo, número de semanas con horas extra y comprobación del cuadre de costos.
* `FEAT`: exportación del mapa de calor a PNG (`<nombre>_<métrica>.png`) y aviso de carga
  durante la simulación.
* `FEAT`: ayuda extensa en el panel de gráficos y guía de usuario completa en
  `docs/GUIA_SIMULACION.md` (teoría de colas, matemática de la triangular, cupo semanal,
  fórmulas de costos, método de validación y limitaciones estadísticas).
* `FIX`: la **tasa de llegada** por defecto pasa de `60/minuto` (una llegada por *segundo*)
  a `1/minuto`, y la interfaz explica que es una tasa, no un intervalo.
* `FIX`: el cupo semanal de horas extra se indexa por semana ISO completa (`2026-W03`).
  Con solo el número, la semana 1 de dos años distintos compartía contador.
* `FIX`: `INSTANCE_COMPLETE` ya no cuenta como ejecución del elemento terminal (duplicaba
  su frecuencia y partía a la mitad su tiempo de ciclo medio).
* `FIX`: ejes de los gráficos en las unidades reales. Las series de tiempo están
  normalizadas a minutos; el tiempo de espera se formateaba como milisegundos (error de
  60 000×) y los ejes decían `(s)` sobre valores en milisegundos.
* `FIX`: **eliminadas** tres métricas que el motor nunca calculó («Costo de Reparación»,
  «Espera de Transporte», «Despachos Ineficientes») y tres tarjetas del resumen que
  mostraban siempre `$0.00`.
* `FIX`: al guardar con el modo Token Simulation activo se ofrece desactivarlo y reintentar
  **sin perder** lo escrito, en lugar de avisar y descartar los cambios.
* `FIX`: `AI_DEVELOPER_GUIDE.md` corregido contra el código (unidades, formato de
  `startDate`, campos fantasma, módulos que ya no existen).
* `CHORE`: retirados `RandomDataGenerator.js` y el módulo `client/editor/`. El icono del
  lápiz sobre cada figura abre ahora el panel de tabla centrado en el elemento.

___Note:__ Yet to be released changes appear here._

## 0.22.0

* `FEAT`: improve collapsed sub-process support ([#58](https://github.com/camunda/camunda-modeler-token-simulation-plugin/issues/58))
* `FEAT`: make parallel gateway join spec compliant ([#84](https://github.com/camunda/camunda-modeler-token-simulation-plugin/issues/84))
* `DEPS`: bump to `bpmn-js-token-simulation@0.38.1`

## 0.21.0

* `FEAT`: support Camunda Modeler `v5.29.0`
* `DEPS`: bump to `bpmn-js-token-simulation@0.36.0`

## 0.20.0

* `FEAT`: support implicit start events ([bpmn-io/bpmn-js-token-simulation#144](https://github.com/bpmn-io/bpmn-js-token-simulation/issues/144))
* `DEPS`: bump to `bpmn-js-token-simulation@0.33.0`

## 0.19.0

* `FEAT`: support inclusive gateways ([bpmn-io/bpmn-js-token-simulation#110](https://github.com/bpmn-io/bpmn-js-token-simulation/pull/110), [bpmn-io/bpmn-js-token-simulation#88](https://github.com/bpmn-io/bpmn-js-token-simulation/issues/88))
* `DEPS`: bump to `bpmn-js-token-simulation@0.32.0`

## 0.18.0

* `DEPS`: bump to `bpmn-js-token-simulation@0.31.1`

## 0.17.0

* `FEAT`: reworked the simulation log ([bpmn-io/bpmn-js-token-simulation#123](https://github.com/bpmn-io/bpmn-js-token-simulation/pull/123))
* `FIX`: don't activate token simulation when pressing `R` ([#60](https://github.com/camunda/camunda-modeler-token-simulation-plugin/issues/60))
* `CHORE`: rename project to `camunda-modeler-token-simulation-plugin` ([#47](https://github.com/camunda/camunda-modeler-token-simulation-plugin/issues/47))
* `DEPS`: bump to `bpmn-js-token-simulation@0.30.1`

## 0.15.0

* `DEPS`: bump to `bpmn-js-token-simulation@0.24.0`
* `DEPS`: bump to `bpmn-js@8.9.0`
* `DEPS`: bump to `camunda-modeler-plugin-helpers@3.1.0`

## 0.14.0

* `FEAT`: execute message flows in interaction direction
* `FEAT`: support bi-directional message flows ([#42](https://github.com/bpmn-io/bpmn-js-token-simulation-plugin/issues/42))
* `FIX`: do not signal participant on un-directed message receive
* `DEPS`: bump to `bpmn-js-token-simulation@0.22.0`

## 0.13.1

* `FIX`: correct join after parallel gateway with destroyed scopes
* `DEPS`: bump to `bpmn-js-token-simulation@0.21.2`

## 0.13.0

_Uses [`bpmn-js-token-simulation@0.12+`](https://github.com/bpmn-io/bpmn-js-token-simulation/blob/master/CHANGELOG.md#0120) under the hood which is a major rework of the original token simulation tool._

* `FEAT`: support signals
* `FEAT`: support message flows
* `FEAT`: support escalation
* `FEAT`: support BPMN 2.0 spec like event sub-processes
* `FEAT`: support multiple concurrent process instances
* `FEAT`: support link events
* `FEAT`: color tokens to distinguish process instances
* `FEAT`: add ability to filter view on a single running process instance
* `FEAT`: allow triggering of boundary events on tasks
* `FIX`: correct pause and play activation ([#30](https://github.com/bpmn-io/bpmn-js-token-simulation-plugin/issues/30), [#29](https://github.com/bpmn-io/bpmn-js-token-simulation-plugin/issues/29))
* `DEPS`: bump to `bpmn-js-token-simulation@0.19.3`

## 0.12.0

* `FEAT`: allow switch to XML tab / diagram save when simulation is active
* `FIX`: make compatible with Camunda Modeler v4.6+

## 0.11.0

* `DEPS`: bump to `bpmn-js-token-simulation@0.11.0`

## 0.10.1

* `FIX`: update token simulation styles ([#18](https://github.com/bpmn-io/bpmn-js-token-simulation-plugin/issues/18))

## 0.10.0

* `CHORE`: update to [`bpmn-js-token-simulation@0.10`](https://github.com/bpmn-io/bpmn-js-token-simulation/blob/master/CHANGELOG.md#0100)

## 0.9.0

* `CHORE`: support Camunda Modeler v3.x.x

## 0.8.0

* `CHORE`: support Camunda Modeler v2.1.0 ([#13](https://github.com/bpmn-io/bpmn-js-token-simulation-plugin/pull/13))
* `CHORE`: update to [`bpmn-js-token-simulation@0.8`](https://github.com/bpmn-io/bpmn-js-token-simulation/blob/master/CHANGELOG.md#080)

## ...

Check `git log` for earlier history.
