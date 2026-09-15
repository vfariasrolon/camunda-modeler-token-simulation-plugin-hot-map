# Changelog

All notable changes to the [camunda-modeler-token-simulation-plugin](https://github.com/camunda/camunda-modeler-token-simulation-plugin/blob/master/CHANGELOG.md) are documented here. We use [semantic versioning](http://semver.org/) for releases.

## Unreleased

* `FEAT`: edición de datos por tabla (pestañas Tareas, Flujos, Recursos y Global) con
  exportación/importación de CSV, datos de prueba y validación bloqueante. Sustituye al
  modal por elemento, que sobrescribía `distribution` a `fixed` y destruía una
  distribución triangular configurada.
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
