# Diseño: realismo operativo — calendario, lotes y barrera

> **Estado: diseño acordado, pendiente de implementar.** Este documento recoge las decisiones
> tomadas en la fase de análisis, con el motivo de cada una. Existe porque el diseño vivía solo
> en una conversación: aquí queda escrito para que se pueda leer dentro de un mes y para que
> cualquier otra persona pueda seguirlo sin haberla vivido.
>
> Alcance de este documento: los bloques **A1 a A4** (calendario, lotes, reglas laborales y
> gráficos honestos). Los bloques posteriores están **acordados en concepto** pero no detallados
> al mismo nivel; se resumen en §8 para que no se pierdan.

---

## 1. Por qué

El motor simula un mundo que no existe: **los casos llegan uno a uno, perfectamente espaciados,
nadie descansa, nada se para y todo arranca a plena velocidad.** Cada una de esas simplificaciones
hace que los resultados sean **optimistas**, y en conjunto explican la brecha entre lo que dice
un plan y lo que pasa en la planta.

Los cuatro bloques de este documento atacan eso, en orden de impacto sobre los números:

| Bloque | Qué corrige | Toca |
|---|---|---|
| **A1 · Calendario** | La capacidad inflada y el arranque ideal | Motor de calendario |
| **A3 · Lotes y barrera** | El patrón de llegadas irreal y la administración por pieza | Motor + tabla de datos |
| **A4 · Gráficos honestos** | Las curvas suavizadas que ocultan el ritmo real | Gráficos |
| **A2 · Reglas laborales** | Las horas extra sin marco legal ni vigencia | Configuración + coste |

A3 va antes que A2 a propósito: **el lote cambia los números; la regla laboral los reetiqueta.**

---

## 2. Reglas invariables

Estas cuatro salen de la conversación y **no son preferencias de estilo: si se rompen, el
resultado es incorrecto aunque el programa funcione.**

1. **Las series que no se suman, no se suman.** Masa cargada y masa arrastrada son magnitudes
   distintas (una la soporta la persona, la otra no). Se reportan por separado, **nunca en un
   total único**. Cualquier equivalencia la declara el analista, no el programa.
2. **El arranque no se cuenta dos veces.** Un arranque lento solo se **modela** si es real en la
   planta, o solo se **descarta** si es artefacto de empezar con el sistema vacío. Modelarlo *y*
   descartarlo subestima la capacidad.
3. **Todo aviso va con su umbral impreso al lado.** Una banda, un corte o una tolerancia sin su
   valor a la vista es una cifra con autoridad falsa. Mismo criterio que el puntaje del informe.
4. **La capacidad nunca incluye el descanso.** El reloj legal y el reloj de la planta son dos
   cosas distintas: un descanso puede contar como jornada y **seguir sin ser capacidad**.

---

## 3. A1 · Calendario

> **Estado: IMPLEMENTADO.** `BusinessCalendar` con tramos, editor de descansos en la pestaña
> Global, curva de arranque (`WarmupCurve.js`) con vista previa, los tres interruptores del
> descanso y la jornada extendida que respeta `existeEnExtra`. Verificado con 23 comprobaciones
> de integración sobre el motor real.
>
> **Dos decisiones tomadas al implementar** (no estaban en el diseño original):
>
> 1. **El descanso no se guarda como lista de tramos, sino como `workingHours` + `breaks[]`.**
>    Es equivalente y más útil: un tramo suelto no puede llevar sus propios interruptores, y el
>    descanso necesita dos. Los tramos se derivan (jornada menos descansos) y **sin `breaks` el
>    comportamiento es exactamente el de antes**, así que no hay migración.
> 2. **El coste de operación usa la duración EFECTIVA** (con la rampa), no la real. Si alguien va
>    lento al arrancar está en el puesto más tiempo y ese tiempo se paga; además así **la rampa
>    tiene coste**, que es justo lo que se quiere medir. El trabajo contabilizado
>    (`processingTime`) sí sigue siendo el real, y las dos cifras se separan a propósito.
>
> **Pendiente de refinar (documentado, no olvidado):**
>
> - **El recurso se mantiene retenido durante el descanso.** Al pausar la tarea, la unidad de la
>   piscina no se libera, así que otra tarea en cola no la puede aprovechar. Es defendible (el
>   puesto queda ocupado con trabajo a medias), pero la versión «liberar y volver a tomar la
>   unidad» es la que produce la *segunda espera* — y no está hecha.
> - **El re-arranque tras descanso se aplica a las tareas que EMPIEZAN en el tramo posterior**,
>   no a las que se reanudan a medias. Modelarlo por segmentos exige partir el trabajo en cada
>   frontera de tramo.

### 3.1 Tramos de trabajo

La jornada deja de ser **un bloque** y pasa a ser **varios tramos**:

```
antes:  de 09:00 a 17:00
ahora:  de 09:00 a 13:00  y  de 14:00 a 17:00
```

Es más general (vale para dos descansos, turno partido o lo que venga) y **reutiliza la maquinaria
de calendario existente**: el motor ya salta noches y fines de semana; un hueco a media jornada
es el mismo mecanismo. Los tramos son la base para calcular bien la disponibilidad y, por tanto, ρ.

### 3.2 Descansos: tres interruptores independientes

| Interruptor | Afecta a | Caso declarado |
|---|---|---|
| **¿Cuenta como jornada?** (legal) | El umbral de horas extra | **No** — la plantilla puede salir de la empresa |
| **¿Es tiempo productivo?** | La capacidad, ρ y el ciclo | **No**, en ningún caso |
| **¿Existe en el tramo extra?** | La capacidad **del tramo de horas extra** | Seleccionable en el configurador de horarios y extras |

El primer interruptor existe porque la ley mexicana marca que **si no puedes salir de la empresa,
el descanso se considera tiempo laboral**. En este caso sí se puede salir, de modo que no lo es —
pero es un supuesto **configurable**, no una constante, porque la condición puede cambiar por área
o por norma.

> **Consecuencia que hay que asumir de frente:** al excluir el descanso, la capacidad disponible
> **baja** y ρ **sube**. Los resultados anteriores a este bloque eran optimistas. No es un fallo
> que se introduce: es uno que se corrige.

### 3.3 Curva de arranque

El arranque lento **no se mide** (es difícil), pero se puede **declarar** con una curva. Un
porcentaje plano de pérdida repartiría la pérdida por **toda** la jornada, incluida la tarde,
donde no ocurre; la curva la concentra donde de verdad está.

| Forma | Comportamiento | Veredicto |
|---|---|---|
| **Exponencial** | Recupera rápido y se acerca al 100 % suavemente. Un solo parámetro | **Por defecto** |
| **Lineal** | Recuperación a ritmo constante hasta el 100 % | Alternativa simple: «en N minutos estamos a tope» |
| **Logarítmica** | Rápida al principio, luego se arrastra | **Descartada**: nunca llega al 100 % → exige un tope, que es otro número inventado |

**Valores por defecto:** eficiencia inicial `0,70`, recuperación en ~30 min. Con arranque al 0,70,
las primeras tareas tardan `1 / 0,70 = 43 %` más — cifra que sirve para **contrastar con la planta**:
si parece exagerada, la curva está mal ajustada.

**El configurador debe enseñar la curva mientras se ajusta.** Un parámetro abstracto no se puede
discutir; una curva sí. Es el método correcto para ajustar algo que no se puede medir: no pedir un
número, sino **enseñar el efecto** y dejar que lo reconozca quien conoce el proceso.

### 3.4 Un solo mecanismo, tres disparadores

La curva es siempre la misma; lo que cambia es **cuándo se dispara**, y cada uno es activable:

| Disparador | Cuándo | Extras |
|---|---|---|
| **Inicio de jornada** | Al empezar el día | — |
| **Regreso del descanso** | Al volver de la comida | — |
| **Cambio de lote** | Al cerrar un lote y abrir el siguiente | **Parón propio** además de la curva |

**Parón y recuperación son dos cosas distintas y se declaran por separado:** el parón es el tiempo
literal sin producir (cambiar herramienta, traer material) y la recuperación es la vuelta al ritmo.
Separarlos permite saber **cuánto de la pérdida es el cambio y cuánto la organización del puesto**,
que se atacan de forma distinta: el parón es SMED; la recuperación es método.

Este tercer disparador es, de hecho, **la cotización de un SMED**: «si bajo el cambio de herramienta
de 20 a 5 minutos, ¿cuánto gano?», respondido con los números del propio proceso.

### 3.5 Interrupción de la tarea en curso

Decidido: **se interrumpe**. La tarea se pausa en el descanso y se retoma al volver.

Consecuencias:

- El **tiempo de proceso** total no cambia, pero el **tiempo de reloj** del caso crece en todo el
  descanso. Es lo que engorda el **p95**, y es correcto que lo haga.
- Aparece un indicador útil: **tareas interrumpidas por descanso**, que es una fuente real de errores.
- **Depende del tipo de recurso:** una **persona con nombre** retoma *su* tarea; una **piscina
  anónima** tiene que **volver a tomar una unidad**, y puede esperar otra vez. Es realista, y el
  informe debe decir cuál se usó.

---

## 4. A3 · Lotes y barrera

> **Estado: IMPLEMENTADO.** Semilla (`mulberry32`) en el motor y en el configurador, llegadas por
> lotes en serie por tracción con tamaño fijo / triangular / tabla empírica, parón de cambio entre
> lotes, **tareas por lote** una sola vez por lote, **barrera de firma** (disponibilidad + espera
> triangular + tolerancia) con el lote entero esperando, y las métricas de lote en el informe de
> consola. Verificado con **34 comprobaciones** sobre el motor real y **54** sobre el panel de datos
> (`_renderTasks`, `_collect`, CSV de ida y vuelta) en un DOM real.
>
> **Decisiones tomadas al implementar** (más allá del diseño):
>
> 1. **El reparto del lote se marca con `frequency` en la tarea, y la barrera se borra cuando la
>    frecuencia es `token`.** Guardar una barrera que el motor no lee es una trampa para el que
>    abra el XML después; y al revés, no guardar nada deja el diagrama igual que antes de A3.
> 2. **La barrera no toma unidades de la piscina.** Quien firma no está dado de alta como recurso:
>    se modela por su efecto (§4.5). Una tarea por lote que encuentra la barrera se reencola
>    (`LOT_TASK_START` → `LOT_CONTINUE`) en vez de ocupar una unidad durante la espera, porque la
>    espera no consume capacidad: la consume el trabajo, y ese sí pasa por `scheduleTask`.
> 3. **El último lote puede ser parcial** (el que cierra la corrida se corta con lo que falte para
>    `runValue`). No es un defecto: es lo que hace que la muestra efectiva sean los lotes.
> 4. **La continuidad de un token tras la barrera viaja en un evento propio** (`LOT_CONTINUE`), no
>    reutilizando `TASK_COMPLETE`. Reutilizarlo hacía que la contabilidad de la tarea sumara un
>    `totalProcessingTime` inexistente y el informe saliera con `NaN`.
>
> **Tres defectos que encontró la verificación** (los tres reales, los tres corregidos):
>
> - **El parón se contaba también en el último lote**: el cierre del lote disparaba el cambio de
>   herramienta aunque ya no quedara nada que producir. Con un lote de prueba salían 2 parones
>   (60 min) en vez de 1 (30 min).
> - **La ida y vuelta del CSV de la pestaña Global estaba rota**: `seed` es un campo opcional, y la
>   rama «vacío es *no declarado*» solo existía al recoger del formulario, no al importar. Exportar
>   la pestaña Global con los valores por defecto y volver a importarla fallaba. Lo cazó el arnés de
>   DOM, no una prueba del motor.
> - **Las dos pasadas de una corrida (normal y con horas extra) usaban semillas distintas.** La
>   semilla se resolvía en cada pasada, así que con el campo vacío cada plan sacaba una del reloj y
>   el informe imprimía dos semillas para una sola corrida. Es exactamente el fallo que el campo
>   existe para evitar (§4.7): la comparación dejaba de ser sobre el mismo azar. Ahora la corrida
>   fija su semilla (`nuevaCorrida()` la olvida al pulsar de nuevo) y la comparten todas las pasadas.
>
> **Pendiente de refinar (documentado, no olvidado):**
>
> - **El reintento de la barrera es una sola espera** (decidido): no hay segunda tanda de atención.
> - **El % de disponibilidad es una estimación del analista.** Para eso está la semilla: correr con
>   90 % y con 70 % y ver si el plan se mueve (§4.5).

### 4.1 Modos de llegada

`arrivalRate` describe hoy un chorro continuo. Se añade el modo por lotes, y **conviven**:

| Modo | Ejemplo |
|---|---|
| Individual (el actual) | uno cada 5 minutos |
| Por lotes, tamaño fijo | 20 juntos |
| Por lotes, tamaño variable | triangular, o **tabla discreta empírica** (10 el 30 %, 20 el 50 %, 50 el 20 %) |
| Por corridas al día | 5 lotes de 20, o 2 de 100 |
| Mixto | flujo continuo más un lote grande los lunes |

La **tabla discreta empírica** es la que mejor refleja pedidos reales y deja poner la granularidad
sin inventar una forma matemática.

### 4.2 Lotes en serie y **por tracción**

Decidido, y es más estricto que una simple ráfaga de llegadas:

> **No hay dos lotes a la vez.** Se arranca uno, se cierra, y arranca el siguiente (por tracción).

| | Ráfaga (descartado) | Serie por tracción (elegido) |
|---|---|---|
| ¿Se solapan los lotes? | Sí → colas **entre** lotes | **No** → no hay cola entre lotes |
| ¿Qué manda el ritmo? | Teoría de colas | **El tiempo de ciclo del lote** |
| ¿Dónde está el parón? | Se pierde en la cola | **Se ve y se mide** |

El reloj de llegadas **pasa a ser el reloj de lotes**.

### 4.3 El parón entre lotes

Es el **precio exacto de la política de lotes** y se mide como una categoría de tiempo muerto con
causa declarada: *«ocioso por fin de lote»*. Sus componentes son el **parón de cambio** (§3.4) y la
**curva de re-arranque**.

Y como la política se declara, se puede **cotizar**: «¿cuánto ganaría si dejara solapar dos lotes?»
tiene respuesta.

### 4.4 Tareas por lote

Una tarea puede ejecutarse **una vez por pieza** o **una vez por lote**. No es un detalle: un
documento de 30 minutos hecho **por pieza** en un lote de 20 son **10 horas**; hecho **por lote**,
**30 minutos**. Un factor **20×**. Es la razón de fondo por la que producir por lotes abarata lo
administrativo: **el sobrecoste se reparte entre el lote.**

**Cómo se declara:** un campo de **frecuencia** en la tarea (`por token` | `por lote`), y una regla:

> **`por lote` = se ejecuta una vez por lote, la primera vez que el flujo pasa por ahí.**

La **posición en el diagrama da el momento gratis**: al principio del flujo es la **preparación**
(llenar la orden); al final es el **cierre** (reportar lo producido); y si hay dos, son las dos.
No hace falta un campo «inicio/cierre». La regla resuelve además el caso incómodo: dentro de un
bucle, una tarea por lote **no se repite en cada vuelta**.

**La etiqueta sugiere, no deriva.** Marcar una tarea como administrativa puede **pre-rellenar** la
frecuencia a `por lote`, pero **nunca deduce el comportamiento**: dos tareas administrativas pueden
comportarse distinto («llenar la orden» es por lote; «registrar cada pieza» es por token).

### 4.5 La barrera de firma

Decidido: **el lote entero espera la firma.** Y se modela **por su efecto, no como una persona**,
porque la agenda del firmante no se conoce y modelarla sería falsa precisión:

| Parámetro | Ejemplo por defecto |
|---|---|
| Probabilidad de atención a la primera | 70 % |
| Espera si no atienden (distribución con cola) | mín 10 / moda 20 / máx 60 min |
| Reintentos | Una sola espera (más simple y se explica mejor) |
| **Tolerancia** | 15 min |

La **tolerancia** es el **umbral de lo aceptable**: por debajo, la espera es ruido y no cuenta como
parón; por encima, **se marca y se mide**. Sin umbral, cada espera de tres minutos ensucia el informe
y nadie lo lee.

**El precio de la simplificación, para que sea una decisión y no un descuido:** no hay
contrapresión entre avisos (no se ve si el firmante atiende a muchas áreas) y no se puede
«simular contratar a otro firmante». A cambio, se cuantifica **el coste de la espera**, que es lo
que hace falta para decidir.

**Y la compensación que la hace defendible:** como el % es una estimación, se puede hacer
**análisis de sensibilidad** (correr con 90 % y con 70 %). Si el plan apenas se mueve, el dato no
importa y no merece perder tiempo en medirlo; si se desmorona, hay que ir a medirlo. **El programa
dice cuánto pesa no saberlo.**

### 4.6 Métricas de lote

Con lotes en serie, el lote pasa a ser **la unidad de análisis**, no la pieza:

- **Tiempo de ciclo del lote** (de que arranca a que cierra).
- **Tiempo entre lotes** (el parón), incluido el cambio de herramienta.
- **Piezas por hora dentro del lote** (el ritmo real cuando hay trabajo).
- **Ocupación dentro del lote frente a entre lotes**: aquí los micro parones dejan de ser una
  intuición y se convierten en cifra.
- **Esperas de firma por lote**, y cuántas superaron la tolerancia.

### 4.7 La semilla

Se introduce una **semilla global** (no solo para los tamaños de lote). Con ella se consiguen tres
cosas, y la tercera es la que justifica la decisión:

1. **Reproducibilidad**: la misma corrida da el mismo resultado.
2. **Réplicas de verdad**: varias semillas → intervalo de confianza (lo que llevábamos difiriendo).
3. **Números aleatorios comunes**: dos escenarios ven **la misma secuencia de azar**, así que la
   diferencia se debe al cambio y **no a la suerte**. Sin esto, comparar dos tamaños de lote es
   comparar dos muestras pequeñas: **ruido contra ruido**.

### 4.8 Consecuencias que hay que tener presentes

- **El ranking por número de ejecuciones deja de ser comparable.** Una tarea por lote se ejecuta 50
  veces y otra por token 1.000. Hay que ordenar por **tiempo o coste total** (que sigue siendo
  correcto) y, para el coste por pieza, **dividir por el tamaño del lote**.
- **El tamaño de muestra efectivo son los LOTES, no los tokens.** 1.000 piezas en 50 lotes no son
  1.000 muestras del patrón de llegada: son **50**. Con lotes pequeños, la incertidumbre de todo lo
  que dependa del ritmo de llegada es mucho mayor de lo que parece.
- **El compromiso del tamaño de lote** queda cuantificado, y se ordena en dos bandos:

| Empuja a lotes **grandes** | Empuja a lotes **pequeños** |
|---|---|
| Menos arranques por pieza | Menor tiempo de ciclo del lote |
| Menos cambios de herramienta por pieza | Menor espera del cliente |
| Menos firmas por pieza | Más flexibilidad |
| Menos administración por pieza | |

Los tres costes de eficiencia se amortizan con el lote; **solo el plazo tira al otro lado**. Así que
el óptimo **no es un número técnico: es cuánto se valora el plazo frente al coste**. Con un **plazo
objetivo declarado**, el óptimo deja de ser un debate y pasa a ser un dato.

---

## 5. A2 · Reglas laborales

> **Estado: IMPLEMENTADO.** `LaborRules.js` (reglas **versionadas por fecha**), jornada base por
> turno, topes del art. 65 con **indicador de cumplimiento**, primas de domingo (art. 73) y de
> festivo (art. 74), editor con tabla de vigencias en la pestaña Global, round-trip por CSV, y una
> **sección propia en el informe** con la base legal de cada tope y el veredicto. Verificado con
> **33 comprobaciones** sobre el motor real y **17** sobre el panel (75 en total con las de A3).
>
> **Decisiones tomadas al implementar** (más allá del diseño):
>
> 1. **La extra se mide contra la jornada BASE del turno, no contra el horario declarado.** Un
>    horario de 9 h en turno diurno ya lleva 1 h extra dentro, y con el calendario estándar esa hora
>    se pagaba a tarifa base. Es un **recorte, nunca una ampliación**: una jornada de 8 h o menos no
>    cambia nada, así que los diagramas existentes dan exactamente lo de antes.
> 2. **Una celda vacía en la tabla de vigencias significa «lo que digan los valores de arriba».** Si
>    no, cada fila tendría que repetir los ocho parámetros y una fila de «solo baja el cupo» sería
>    imposible de leer.
> 3. **La extra del día se imputa al día en que ARRANCA la tarea.** Una tarea que cruza la medianoche
>    pertenece al día en que empezó, que es como se lee un turno en planta. La regla es única y está
>    escrita, para que el tope diario sea comprobable a mano.
> 4. **El tope diario no cambia lo que se paga.** El pago lo fijan los arts. 66 y 68, que son
>    semanales. Los topes del art. 65 son de **legalidad**: no mueven un peso, pero deciden el
>    veredicto. Mezclarlos habría hecho imposible auditar el reparto de primas.
> 5. **La prima de festivo viene a 0 por defecto.** Cuánto se paga depende del contrato y de si el
>    festivo cae en domingo; inventar un porcentaje sería peor que no tenerlo.
> 6. **Solo los `limitHours`/`payMultiplier`/`excessPayMultiplier` siguen viviendo en `overtime`.**
>    Estaban ahí desde antes de A2, y moverlos habría obligado a migrar todos los diagramas a cambio
>    de nada. La tabla de vigencias los sobrescribe cuando hace falta, que es el caso que importa.
>
> **Tres defectos reales que encontró la verificación** (los tres corregidos):
>
> - **Una tarea que esperaba por un recurso pagaba horas extra que no existió.** Calculaba su extra y
>   sus primas con la hora del **intento**, no con la hora real, y las apuntaba al día y a la semana
>   equivocados: una tarea que arranca a las 18:00, espera al recurso y trabaja el martes pagaba 1 h
>   extra de una franja en la que no trabajó. Ahora la unidad se pide **antes** de costear y la tarea
>   se re-programa con su hora real — que es, además, donde el arranque se reevalúa.
> - **Un festivo en un día laborable cerraba la planta sin avisar.** El calendario se contradecía:
>   `workingDays` decía «abierto» y `holidays` «cerrado», y ganaba `holidays`, así que la corrida se
>   saltaba el día en silencio y **la prima de festivo del art. 74 era imposible de pagar**. Ahora un
>   festivo cierra **solo** si su día de la semana no está declarado laborable.
> - **La pestaña Global se rompía al mezclar objetos anidados.** Un modelo con solo
>   `labor.shiftType` declarado perdía los demás valores por defecto (y las casillas salían vacías)
>   porque el `...raw` superficial sustituía el objeto entero. Ahora `labor`, `warmup` y `lots` se
>   mezclan campo a campo.
>
> **Pendiente de refinar (documentado, no olvidado):**
>
> - **La extra del día se imputa al día de arranque, no se reparte** entre los días que toca una
>   tarea que cruza la medianoche. Es una decisión, no un descuido, pero una tarea muy larga puede
>   pasar un día sin pagar su parte.
> - **Las vigencias se resuelven por la fecha de arranque de la corrida**, no día a día. Una corrida
>   que cruce un cambio de ley aplica la ley del inicio de punta a punta.

### 5.1 Los valores por defecto ya son la ley

| LFT | Qué marca | En el plugin |
|---|---|---|
| **Art. 66** | Prima del **100 %** (doble) hasta **9 h por semana** | `limitHours: 9`, `payMultiplier: 2` ✅ |
| **Art. 68** | Más allá de 9 h/semana, **200 %** (triple), y es una violación | `excessPayMultiplier: 3` ✅ |

### 5.2 Lo que falta

| Falta | Por qué |
|---|---|
| **Límite diario** (art. 65: máx. 3 h/día y 3 veces por semana) | Hoy solo se controla el semanal |
| **Tipo de jornada** (diurna 8 h / nocturna 7 h / mixta 7,5 h) | Cambia la línea base de la extra |
| **Prima dominical** (art. 73: 25 %) y **festivos** (art. 74) | Coste real que hoy no existe |
| **Vigencia de cada regla** | «La ley va a cambiar» |

### 5.3 Reglas con fecha

No un número en una casilla, sino una **tabla de reglas versionadas**, cada una con **desde cuándo
rige**. Cuando la ley cambie, se **añade una fila** en lugar de reescribir el pasado, y cada corrida
guarda **qué versión de la regla usó**. Así un informe de hoy sigue siendo auditable dentro de tres
años. Sin eso, los informes viejos se vuelven mentira con el tiempo.

### 5.4 Cumplimiento legal

Dos salidas distintas:

1. **Coste de las horas reales trabajadas** — lo que se paga. Ya funciona.
2. **Cumplimiento** — un indicador nuevo: *«con este plan, en 8 de 20 semanas se superó el límite
   legal, en promedio 2,3 h de más»*. Excederse no solo cuesta más: **es ilegal**, y la simulación
   puede decirlo **antes** de que ocurra.

**Límite de alcance, explícito:** esto es una **tabla de tasas y umbrales para costear el proceso**,
no una nómina. **No** se calculan IMSS, ISR, aguinaldo, prima vacacional ni finiquitos.

---

## 6. A4 · Gráficos honestos

Las líneas actuales están **suavizadas a propósito**, y eso hace que mientan: la producción
acumulada es intrínsecamente **un escalón**, no una curva.

| Cambio | Por qué |
|---|---|
| **Quitar el suavizado** de las líneas y usar **trazo de escalón** | La acumulación es escalonada; dibujarla suave oculta cuándo entró el trabajo |
| **Producción acumulada** en escalones | El alto del escalón es el tamaño del lote; el tramo plano, el hueco |
| **Ocupación en diente de sierra** | Ocupado durante el lote, ocioso hasta el siguiente |
| **Mapa de calor del día: hora × ocupación** | Una rejilla donde el color dice cuánta gente trabajaba en cada hora: se ven los picos de lote y los valles del descanso de un vistazo |
| **Perfil de la jornada apilado** | Productivo, ocioso, bloqueado y descanso a lo largo del día |

---

## 7. Parámetros y valores por defecto

Todos **ajustables** y **todos impresos en el informe** junto al resultado.

| Parámetro | Por defecto | Nota |
|---|---|---|
| Eficiencia de arranque | 0,70 | Con vista previa de la curva |
| Recuperación del arranque | ~30 min | Exponencial por defecto |
| Re-arranque tras descanso | Activado | Mismo mecanismo |
| Llegadas por lotes | Desactivado | Activado, el reloj de llegadas pasa a ser el de lotes |
| Tamaño de lote | 20 | Fijo, triangular o tabla empírica |
| Parón de cambio de lote | A declarar | Es el objetivo de SMED |
| Descanso en tramo extra | Seleccionable | El tercer interruptor |
| Frecuencia de tarea | Por token | `por lote` = una vez por lote |
| Probabilidad de atención de firma | 70 % | Sujeto a sensibilidad |
| Espera de firma si no atienden | mín 10 / moda 20 / máx 60 min | Distribución con cola |
| Tolerancia de espera de firma | 15 min | Define qué se avisa |
| Semilla | Global | Habilita réplicas y números comunes |
| Tipo de jornada | Diurna (8 h) | Nocturna 7 h / mixta 7,5 h (LFT art. 61) |
| Tope de extra al día | 3 h | LFT art. 65 · **no** cambia lo que se paga |
| Días con extra por semana | 3 | LFT art. 65 |
| Prima dominical | 25 % | LFT art. 73 |
| Prima de festivo | 0 % | LFT art. 74 · a 0 a propósito, no se inventa |
| Vigencias de las reglas | Sin filas | Con filas, mandan por fecha de arranque |

---

## 8. A5 · Personas, carga y operatividad

> **Estado: DISEÑO CERRADO, sin implementar.** Las decisiones de abajo se tomaron al abrir el
> bloque y **no se pueden deshacer sin reescribir el motor**, así que quedan escritas con su motivo.

### 8.1 Realismo de las masas: dos series que nunca se suman

Cada tarea declara su carga física:

```json
"carga": { "masaCargadaKg": 12, "masaArrastradaKg": 0, "distanciaM": 8 }
```

- **Masa CARGADA** = lo que la persona **soporta** (en brazos, al hombro, en la mano).
- **Masa ARRASTRADA** = lo que **no soporta** (un carro, una tarima con ruedas, algo que se desliza).

Son magnitudes distintas y **se reportan por separado, nunca en un total único**. Cualquier
equivalencia la declara el analista, no el programa. Es la **regla invariable nº 1** de §2, y aquí
es donde se aplica de verdad.

De cada acumulación salen tres cifras: **kg movidos**, **kg·m** (masa × distancia) y **toneladas
acumuladas**. La distancia se declara por tarea; el *por dónde* queda fuera de alcance.

**La repetición la manda la frecuencia, no el token.** Una tarea `por lote` mueve su masa **una vez
por lote**; una `por token`, una por pieza. Si no, mover 12 kg por pieza en un lote de 20 daría 240
kg cuando en la planta se hizo un solo viaje.

### 8.2 Colaboradores con nombre

La piscina pasa a poder declarar **miembros**:

```json
"resourcePools": [ {
  "name": "Soldadores", "quantity": 2,
  "members": [ { "nombre": "Ana", "tarifaHora": 55, "habilidades": [ "soldadura" ], "cargaMaximaKg": 25 } ]
} ]
```

- **Sin `members`, todo se comporta como hoy** (compatibilidad total: ninguna migración).
- **Con `members`, cada unidad es una persona concreta.** `quantity` sigue mandando la capacidad; los
  miembros solo dan identidad, tarifa, habilidades y carga máxima. El motor reparte en **ronda**, para
  que dos personas equivalentes trabajen lo mismo.
- **Tarifa**: la de la persona; si no la tiene, la de la planta (`cost.baseRatePerHour`). Así nada se
  mueve si no rellenas tarifas por persona.

### 8.3 Habilidades: bloquean de verdad

Una tarea declara las etiquetas que exige; una persona, las que tiene. **Si ninguna unidad de la
piscina tiene la habilidad, la tarea se BLOQUEA** — no arranca y el tiempo se cuenta aparte, en su
propia categoría de tiempo muerto.

Es lo **conservador**: un dato que falta bloquea, no acelera. La alternativa (que las etiquetas solo
informaran) habría dejado la cuarta categoría de tiempo muerto sin nada que la produjera.

### 8.4 Carga máxima: avisa, no altera

`cargaMaximaKg` de la persona **no cambia los tiempos**: el motor reporta, marca y sigue. Coherente
con el límite de alcance de §9 — *el sistema solo da datos*: dice «moverás 12 t a 8 m durante 6 h» y
el analista decide. Si rechazara la tarea, estaría tomando una decisión de seguridad que no le toca y
movería resultados que hoy nadie esperaría.

### 8.5 Las cuatro categorías de tiempo muerto

| Categoría | Qué es |
|---|---|
| **Sin trabajo** | No hay nada que hacer: la planta está ociosa |
| **Con trabajo asignable** | Hay cola, pero la persona no puede tomarla (no es la suya) |
| **Bloqueado por habilidad** | La tarea espera a alguien con la etiqueta que exige y no lo hay |
| **Esperando firma** | El lote entero aguanta la barrera de §4.5 |

El **activo** (trabajando) y las cuatro ociosidades se dibujan en barras por persona y en líneas a lo
largo del día.

### 8.6 Diagnóstico de absorción, sin solver

Para cada persona se calcula la **holgura** (jornada menos trabajo) y qué tareas podría absorber
según habilidades. Se imprime como **tabla de «quién puede absorber qué»**.

**El sistema no asigna personal solo.** Muestra la holgura y la elegibilidad; mover gente es del
analista, y para comprobarlo ya está **re-simular**: la política es declarada, no una caja negra.

### 8.7 Avisos con su umbral, en tres escalas

Los umbrales los declara el analista y **el informe los imprime junto al dato**: una banda sin su
corte es una cifra con autoridad falsa. Se avisa en tres escalas —**tarea**, **persona** y **área**—
porque una tarea de 20 kg repetida 500 veces no es lo mismo que una sola vez.

### 8.8 Fuera de este bloque

- **Descansos individuales** (escalonado, ventana flexible): es otro motor de calendario.
- **Rotación de puestos** y la matriz **carga física × cognitiva × valor añadido**: se apoyan en las
  series que este bloque produce, así que van después.
- **Zonas y distancia recorrida**: queda fuera con la distancia declarada por tarea.

---

## 9. Bloques posteriores (acordados en concepto)

No detallados al nivel de este documento, pero **decididos** para no perderlos:

- **Personas** → **movido a §8.2** (implementado en concepto allí).
- **Operatividad** → **movido a §8.5 y §8.6**.
- **Balanceo (diagnóstico, sin solver)** → **movido a §8.6**.
- **Ergonomía** → **movido a §8.1, §8.4 y §8.7**.
- **Descansos individuales**: escalonado, ventana flexible y **descansos interrumpidos o no tomados**.
- **Zonas y distancia**: si algún día se quiere el *por dónde*; con una distancia declarada por
  tarea no hace falta.

---

## 10. Fuera de alcance (decidido, no olvidado)

- **Perfiles médicos, lesiones y elementos de protección.** El sistema no contempla lesiones: solo
  reporta cargas y marca las que destacan. La evaluación es del analista, fuera del programa.
- **Posturas y valoración clínica** (RULA, REBA, NIOSH, ISO). Si hace falta, se hace fuera con los
  kilos y los eventos que el sistema entrega.
- **Un optimizador que asigne personal.** Se admite la **política declarada** que el analista elige
  y la simulación evalúa; no una caja negra que decida.
- **Umbrales inventados por el programa.** Los pone el analista; el informe los imprime con el dato.
- **Nómina completa** (IMSS, ISR, aguinaldo, finiquitos).
- **Turnos por persona.** Jornada completa para todos.

---

## 10. Registro de decisiones

Para que quede **por qué**, no solo **qué**.

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| Lotes en serie por tracción | Ráfaga de llegadas solapadas | Descripción de la planta; además hace medible el parón |
| Barrera por % de disponibilidad | Modelar al firmante como persona | No se conoce su agenda; modelarla sería falsa precisión |
| Curva exponencial de arranque | Logarítmica | La logarítmica no llega al 100 % y exige inventar un tope |
| Curva en vez de `%` plano | Pérdida fija por hora | El porcentaje plano reparte la pérdida por toda la jornada |
| `por lote` por posición en el flujo | Campo «inicio/cierre» | La posición da las dos gratis y no añade un campo |
| Etiqueta sugiere, no deriva | Deducir la frecuencia del tag | Dos tareas administrativas pueden comportarse distinto |
| Masas en series separadas | Un total único combinado | Cargar y arrastrar no son la misma magnitud |
| Semilla global | Semilla solo en lotes | Sin números comunes, el barrido de lotes es ruido contra ruido |
| Rampas con hora de vigencia | Valores fijos | La ley cambia; los informes viejos deben seguir siendo auditables |
| La barrera se borra en tareas por token | Conservarla «por si acaso» | Una barrera que el motor no lee es una trampa al auditar el XML |
| Continuidad de lote en evento propio (`LOT_CONTINUE`) | Reutilizar `TASK_COMPLETE` | Reutilizarlo sumaba un tiempo inexistente y el informe salía con `NaN` |
| El último lote puede ser parcial | Forzar lotes completos | La muestra efectiva son los lotes; completarlo inflaría la muestra |
| El campo opcional se acepta vacío al importar | Exigir siempre un número | Exportar e importar la pestaña Global tiene que devolver lo mismo |
| La unidad de recurso se pide ANTES de costear | Costear al intentar y corregir el fin | Costear un trabajo que no ha ocurrido paga extra de una franja vacía |
| Un festivo cierra el día solo si el día de la semana no es laborable | `holidays` gana siempre | Si no, la planta se cierra sola y la prima de festivo es impagable |
| La extra se mide contra la jornada base del turno | Contra el horario declarado | Un horario de 9 h ya lleva 1 h extra que se pagaba a tarifa base |
| El tope diario no cambia lo que se paga | Sumarlo a la prima | El pago es semanal (arts. 66 y 68); el diario es de legalidad |
| Las vigencias se resuelven por fecha de arranque | Por la fecha de hoy | Un informe de enero tiene que seguir cuadrando en junio |
| Masa cargada y arrastrada en series separadas | Un total único de «kg movidos» | Cargar y arrastrar no son la misma magnitud (regla invariable nº 1) |
| El peso se aplica según la FRECUENCIA de la tarea | Una vez por token siempre | Mover 12 kg por pieza en un lote de 20 serían 240 kg y en planta fue un viaje |
| Habilidades bloquean la tarea | Solo informar de ellas | Sin bloqueo, la categoría «bloqueado por habilidad» no la produce nada |
| La carga máxima avisa y no altera | Rechazar la tarea y pasar a otra persona | El sistema solo da datos; decidir por seguridad no le toca |
| Sin miembros, la piscina se comporta igual | Obligar a declararlos al activar la función | Ningún diagrama existente debe cambiar de resultado |
| El reparto entre personas va en ronda | Aleatorio o siempre la primera | Dos personas equivalentes tienen que trabajar lo mismo |
| Tarifa de persona con la de planta como respaldo | Exigir tarifa a todo miembro | Así el coste no se mueve si no rellenas tarifas por persona |
