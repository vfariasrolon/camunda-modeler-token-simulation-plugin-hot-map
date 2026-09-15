# Guía de Simulación: Teoría, Matemáticas y Uso Práctico

> Documento para el **analista** (ingeniería industrial, mejora de procesos, investigación
> de operaciones). Explica qué calcula este plugin, con qué fórmula exacta y cómo
> **comprobar a mano** que el resultado es correcto. Todo lo que aquí se afirma está
> contrastado contra el código de `client/simulation/`.
>
> Aviso de exactitud: donde el plugin **no** hace algo (por ejemplo, intervalos de
> confianza) se dice explícitamente. Es más útil un «no lo hace» claro que una
> fórmula de libro que el motor no ejecuta.

---

## Índice

1. [Qué es y qué no es](#1-qué-es-y-qué-no-es)
2. [El motor por dentro](#2-el-motor-por-dentro)
3. [Unidades: la trampa número uno](#3-unidades-la-trampa-número-uno)
4. [Las columnas de la tabla, una a una](#4-las-columnas-de-la-tabla-una-a-una)
5. [Distribuciones y su matemática](#5-distribuciones-y-su-matemática)
6. [Calendario laboral: tiempo de reloj vs. tiempo de trabajo](#6-calendario-laboral-tiempo-de-reloj-vs-tiempo-de-trabajo)
7. [Horas extra: el cupo semanal](#7-horas-extra-el-cupo-semanal)
8. [Costos: la fórmula exacta](#8-costos-la-fórmula-exacta)
9. [Recursos y colas: teoría de espera aplicada](#9-recursos-y-colas-teoría-de-espera-aplicada)
10. [Las métricas del mapa de calor](#10-las-métricas-del-mapa-de-calor)
11. [Cómo validar una corrida a mano](#11-cómo-validar-una-corrida-a-mano)
12. [Método estadístico: lo que el plugin hace y lo que no](#12-método-estadístico-lo-que-el-plugin-hace-y-lo-que-no)
13. [Limitaciones conocidas](#13-limitaciones-conocidas)
14. [Ejemplo resuelto de principio a fin](#14-ejemplo-resuelto-de-principio-a-fin)
15. [Glosario](#15-glosario)

---

## 1. Qué es y qué no es

Es un **simulador de eventos discretos** (DES, *discrete-event simulation*) de un
proceso BPMN. Avanza un reloj virtual de suceso en suceso —no en pasos fijos de
tiempo— y acumula estadísticas.

Sirve para responder preguntas del tipo:

- ¿Cuánto cuesta una corrida de 1 000 casos con esta jornada y esta plantilla?
- ¿Dónde está el cuello de botella? (→ la tarea con más **espera**)
- ¿Cuánto más cuesta abrir horas extra, y compensa en piezas producidas?

**No** sirve para:

- Predecir con precisión estadística (una corrida = **una** réplica; ver §12).
- Optimizar automáticamente (no busca soluciones; evalúa la que le des).
- Modelar turnos múltiples, averías, lotes o transporte real: el motor no los tiene.

### El ciclo de trabajo

```
1. Rellenas datos  →  pestaña "Datos de simulación por tabla"
2. Ejecutas        →  ▶  (corre DOS planes: normal y con horas extra)
3. Analizas        →  mapa de calor (☯) y panel de gráficos (📊)
4. Compruebas      →  el informe de la consola del navegador (§11)
```

---

## 2. El motor por dentro

### 2.1 Cola de eventos

Todo el motor son tres piezas:

| Pieza | Qué hace |
|---|---|
| `EventQueue` | Lista de sucesos ordenada por instante. Se reordena en cada inserción. |
| `ResourcePool` | Cubetas de unidades equivalentes, con cola FIFO de espera. |
| `BusinessCalendar` | Traduce *minutos de trabajo* a *fechas de reloj* y viceversa. |

Tipos de suceso que circulan:

- `GATEWAY_COMPLETE` — un elemento no-tarea (evento, compuerta, fin) se ha activado.
- `TASK_COMPLETE` — una tarea ha terminado de trabajarse.
- `INSTANCE_COMPLETE` — un caso ha llegado a un elemento sin salida. **Cierra el caso.**

> Detalle importante: `INSTANCE_COMPLETE` **no cuenta como una ejecución del elemento**.
> Se emite llevando el elemento terminal como simple transporte. Contarlo hacía que el
> último elemento del diagrama sumara 2 ejecuciones por caso, duplicando su «Frecuencia»
> y partiendo a la mitad su tiempo de ciclo medio. (Corregido.)

### 2.2 El bucle principal

```
mientras la cola no esté vacía:
    saca el suceso más próximo
    avanza el reloj a ese instante
    procésalo (y puede encolar sucesores con instantes futuros)
    si el suceso era el evento de inicio y faltan instancias: programa la siguiente llegada
    si ya se completaron las instancias pedidas: parar
```

Hay un **freno de seguridad**: si se superan `runValue × 1000` iteraciones, lanza
error en vez de colgarse. Si lo ves, casi siempre hay un ciclo sin salida en el
diagrama o un tiempo de proceso que se anula a sí mismo.

### 2.3 El número de instancias

`runValue` es el **objetivo de casos COMPLETADOS**, no el número de llegadas
programadas. La simulación programa la siguiente llegada cada vez que procesa un
evento de inicio, y se detiene en cuanto `completados >= runValue`.

Consecuencia práctica: si el proceso tiene ciclos o compuertas que descartan casos,
puede haber **más llegadas que completados**. El informe imprime ambas cifras.

---

## 3. Unidades: la trampa número uno

El motor usa **dos convenciones distintas** y no son intercambiables.

| Campo | Unidad esperada | Si escribes otra cosa |
|---|---|---|
| `processingTime.unit` / `reworkTime.unit` (**tareas**) | **plural**: `seconds`, `minutes`, `hours` | Cae al *fallback* y se interpreta como **milisegundos**. Factor **60 000×**. Silencioso: sin error ni aviso. |
| `arrivalRate.unit` (**evento raíz**) | **singular**: `second`, `hour`, `minute` | Cualquier otro valor se trata como minutos. |

El editor por tabla solo ofrece los valores válidos en cada caso, así que por la vía
normal no puedes equivocarte. El aviso es para quien escriba el JSON a mano o lo
importe por CSV.

### Y la trampa número uno bis: `arrivalRate` es una TASA

`arrivalRate` significa **llegadas por unidad de tiempo**, no «una cada tanto».

| Configuración | Significado real |
|---|---|
| `{ value: 60, unit: "minute" }` | 60 llegadas por minuto → **una cada segundo** |
| `{ value: 1, unit: "minute" }` | una cada minuto |
| `{ value: 1, unit: "hour" }` | una cada 60 minutos |
| `{ value: 0, unit: "minute" }` | no hay llegadas nuevas: solo se ejecuta la primera instancia |

Es el error más caro de esta herramienta porque **no rompe nada**: la simulación
termina y da números plausibles. Pero con `60/minute` las 1 000 instancias entran en
la primera jornada, no hay colas de verdad, y el cupo semanal de horas extra se agota
en la primera semana. El informe de la consola imprime la tasa **ya resuelta**
(«una cada 1.0 s») precisamente para que esto salte a la vista.

---

## 4. Las columnas de la tabla, una a una

### Pestaña **Tareas**

| Columna | Qué es | Cómo se usa |
|---|---|---|
| **Tarea** | Nombre del elemento en el diagrama (solo lectura). | Para saber a qué figura corresponde la fila. |
| **Distribución** | `fija` o `triangular`. Decide **qué columnas se leen**. | Con `fija` se lee «Tiempo»; con `triangular` se leen mín/moda/máx y **«Tiempo» se ignora por completo**. |
| **Tiempo** | Duración con distribución fija. | El valor determinista de la duración. |
| **Unidad** | Unidad de ese tiempo (`minutes`/`hours`/`seconds`). | Ver §3. |
| **mín / moda / máx** | Parámetros de la triangular. | Solo se leen si la distribución es `triangular`. Debe cumplirse mín ≤ moda ≤ máx. |
| **Tasa de fallo** | Probabilidad, entre 0 y 1, de que la tarea falle al ejecutarse. | 0.05 = 5 % de las ejecuciones requieren retrabajo. |
| **Retrabajo** | Tiempo añadido cuando falla. | Se **suma** al tiempo de proceso ese ciclo. |
| **Unidad** (2.ª) | Unidad del retrabajo. | Independiente de la anterior. |
| **Recurso** | Piscina de la que toma unidades la tarea (`(ninguno)` = sin restricción). | Si la piscina no existe, el motor **ignora el recurso en silencio**; por eso es un desplegable y no texto libre. |
| **Cant.** | Cuántas unidades toma a la vez. | Entero ≥ 1. Con 2 y una piscina de 3, dos tareas lo agotan. |

> **Scrap vs. retrabajo.** Este motor modela **retrabajo**, no chatarra: un fallo
> añade tiempo y el caso continúa. No hay pérdida de piezas. Si tu proceso descarta
> producto, el modelo no lo representa y debes tenerlo en cuenta al leer el costo por
> pieza.

### Pestaña **Flujos**

Solo aparecen los flujos que salen de una **compuerta exclusiva**. `branchingProbability`
es la probabilidad de tomar ese camino.

> Si las probabilidades de salida de una compuerta **no suman 1**, el motor no
> renormaliza: acumula hasta pasarse y manda toda la masa sobrante a la **última**
> rama. Una salida configurada al 30 % puede acabar recibiendo el 70 %. El botón de
> datos de prueba reparte las probabilidades por compuerta sumando exactamente 1.

### Pestaña **Recursos**

`nombre` + `cantidad`. Es un grupo de `cantidad` unidades **idénticas e
intercambiables**. Se guardan en el **proceso** (o participante), no en la tarea.

### Pestaña **Global**

Configuración del evento de inicio marcado como **raíz**. Sin raíz la simulación no
arranca (no hay fallback a valores por defecto).

| Campo | Significado |
|---|---|
| Fecha de inicio | Día desde el que arranca el reloj. Vacío = hoy. |
| Instancias a simular | `runValue`: casos **completados** objetivo. |
| Tasa de llegada (valor + unidad) | Ver §3. |
| Tarifa base por hora | Coste de **toda** hora trabajada, a tarifa normal. |
| Costo de espera por hora | Coste de una hora de **espera de recursos**. 0 = no se penaliza. |
| Límite de horas antes de recargo | Horas extra por **semana** que se pagan a la prima menor. |
| Multiplicador de hora extra | 2 = doble. |
| Multiplicador de exceso | 3 = triple. |
| Días laborables | 0 = domingo … 6 = sábado. |
| Hora de entrada / salida | Jornada estándar. Entrada debe ser anterior a salida. |

---

## 5. Distribuciones y su matemática

### 5.1 Determinista (fija)

`D = v`. La varianza es cero, así que **una sola corrida basta**: no hay
incertidumbre que promediar. Es el modo de validación por excelencia, porque todo
resultado se puede recalcular con papel y calculadora.

### 5.2 Triangular

Se elige cuando conoces tres cosas: el peor caso optimista `a`, el caso más probable
`m` y el pesimista `b`, pero no la forma de la distribución. Es la distribución
estándar de la estimación por tres puntos (PERT usa una Beta con la misma idea).

Soporte: `[a, b]`. Función de densidad:

```
        ⎧ 2(x−a) / ((m−a)(b−a))      si a ≤ x ≤ m
f(x) =  ⎨
        ⎩ 2(b−x) / ((b−m)(b−a))      si m ≤ x ≤ b
```

Función de acumulación (CDF):

```
        ⎧ (x−a)² / ((m−a)(b−a))          si a ≤ x ≤ m
F(x) =  ⎨
        ⎩ 1 − (b−x)² / ((b−m)(b−a))     si m ≤ x ≤ b
```

**Por qué importa la CDF aquí**: el motor muestrea por **inversa de la CDF**. Genera
`U ~ Uniforme(0,1)` y despeja `x = F⁻¹(U)`. El punto de corte es `F(m) = (m−a)/(b−a)`:

```
        ⎧ a + √( U·(m−a)·(b−a) )                 si U < F(m)
x(U) =  ⎨
        ⎩ b − √( (1−U)·(b−a)·(b−m) )             si U ≥ F(m)
```

Es el método exacto: no hay sesgo de discretización ni límites artificiales.

Momentos:

```
media     μ = (a + m + b) / 3
varianza  σ² = (a² + m² + b² − a·m − a·b − m·b) / 18
moda      m
```

**Error que tuvo este motor** (corregido): el corte estaba escrito como su recíproco,
`(b−a)/(m−a)`, que siempre vale ≥ 1. Como `U ∈ [0,1)`, la condición `U < corte` era
**siempre** verdadera: la segunda rama era código muerto y el máximo `b` nunca se
alcanzaba. Con `triangular(1, 2, 4)` el soporte real terminaba en 2,73 y un 27 % de la
distribución era inalcanzable — la simulación subestimaba sistemáticamente los tiempos
largos.

### 5.3 ¿Cuántas réplicas necesito?

Regla práctica (aproximación normal):

```
n  ≥  ( z · s / E )²
```

con `s` la desviación típica observada, `E` el margen de error que toleras y
`z ≈ 1,96` para el 95 %. Y la media de `n` réplicas es más fiable que una sola, porque
su error estándar es `s/√n`.

El plugin **no hace esto automáticamente** (§12).

---

## 6. Calendario laboral: tiempo de reloj vs. tiempo de trabajo

Esta distinción es la que más confunde y la que más afecta a las conclusiones.

- **Tiempo de reloj**: lo que marca el calendario. Un lunes a las 16:00 más 2 horas de
  trabajo son las 10:00 del martes → **18 h de reloj**.
- **Tiempo de trabajo**: horas realmente trabajadas → **2 h**.

Una tarea de 2 h que cruza la noche tiene 2 h de trabajo y 18 h de reloj. **Contar las
18 h como coste sería un error de 9×**, y contar las 2 h como fecha de entrega sería
igualmente falso: el cliente recibe el martes.

El motor separa las dos cosas:

- `addWorkingTime(fecha, minutos)` → avanza `minutos` **de trabajo** saltando noches,
  fines de semana y festivos.
- `calculateBusinessDurationInMinutes(inicio, fin)` → cuenta los minutos **laborables**
  entre dos instantes (recorre minuto a minuto).
- `calculateBusinessTime(inicio, minutos, calendarioEstándar)` → devuelve `endTime`
  (reloj), `businessTime` (trabajo) y `overtime` (trabajo fuera de la jornada estándar).

### Días laborables de una operación

```
días laborables = ⌈ minutos_de_trabajo / (salida − entrada) ⌉
```

Solo si la operación empieza a las 09:00 en punto. Empezando a las 10:00 con jornada
09:00–17:00, un trabajo de 8 h termina a las 10:00 del día siguiente, porque solo hay
7 h disponibles hoy.

---

## 7. Horas extra: el cupo semanal

Así es como este motor construye el plan con horas extra:

```
extensión diaria = limitHours / nº de días laborables de la semana
nueva salida     = salida estándar + extensión diaria
```

Con `limitHours = 9` y 5 días laborables: `9 / 5 = 1,8 h = 108 min` al día. Jornada
09:00–17:00 → **09:00–18:48**.

> **Ojo, condición de contorno.** Si `limitHours / días` desborda la medianoche, el
> motor recorta la salida a las 23:59. Una jornada no puede pasar de un día.

### Cómo se reparte el pago

El límite es **semanal**, y la clave de acumulación es la **semana ISO** completa
(`2026-W03`), no solo el número. (Antes era solo el número, así que la semana 1 de 2026
y la de 2027 compartían contador: la segunda heredaba el cupo ya agotado de la primera.
Corregido.)

Para cada ejecución de tarea:

```
acumuladoSemana = horas extra ya contadas en esa semana ISO
cupoRestante    = max(0, limitHours − acumuladoSemana)

tramoDoble = min(extraDeLaTarea, cupoRestante)
tramoTriple = max(0, extraDeLaTarea − tramoDoble)

primaDoble  = (tramoDoble  / 3600) × tarifa × (multDoble  − 1)
primaTriple = (tramoTriple / 3600) × tarifa × (multTriple − 1)

acumuladoSemana += extraDeLaTarea
```

Las primas son **solo el recargo**, nunca el coste base de la hora: esa hora ya se paga
en el coste de operación. Sumar las dos cosas duplicaría el coste.

### Consecuencia no obvia (y muy útil)

Si repartes las llegadas a lo largo de las semanas, **cada semana agota su propio cupo
de 9 h en el tramo doble** y el tramo triple casi no aparece. Si en cambio metes todas
las instancias en una sola semana, el cupo se consume **una vez** y **todo lo demás**
va al triple. Comprobado numéricamente con el mismo diagrama y la misma jornada:

| Llegadas | Semanas con extra | Tramo doble | Tramo triple | Prima total |
|---|---|---|---|---|
| 60 por minuto (1/segundo) | 1 | 9,00 h → $450 | 1 791,00 h → $179 100 | $179 550 |
| 1 por hora | 21 | 189,00 h → $9 450 | 1 647,80 h → $164 780 | $174 230 |

El mismo proceso, el mismo cupo semanal y **dos facturas de prima casi idénticas**, pero
con repartos en tramos opuestos. La lección de ingeniería: **la prima de horas extra no
depende solo de cuántas horas extra haces, sino de cómo se agrupan en el calendario.**
Repartir la carga baja la factura de prima aun trabajando las mismas horas.

---

## 8. Costos: la fórmula exacta

El motor acumula **cuatro** componentes por tarea:

```
operación  = (tiempoProceso + retrabajo) / 3600000 × tarifaBase     [ms → h]
primaDoble = (horasEnTramoDoble  / 3600) × tarifaBase × (multDoble  − 1)
primaTriple= (horasEnTramoTriple / 3600) × tarifaBase × (multTriple − 1)
espera     = (minutosDeEspera / 60) × costoEsperaPorHora
```

y `totalCost` es la suma de los cuatro. El resumen general muestra una línea de
**comprobación** que recalcula esa suma y la compara con el total: si no cuadra al
centavo, algo se rompió.

Observa dos cosas:

1. **El retrabajo se factura a tarifa base**, dentro del coste de operación. No hay
   partida separada de «coste de reparación».
2. **El coste de espera es opcional.** Con `waitCostPerHour = 0` esperar es gratis, y
   las colas no aparecen en el coste aunque aparezcan en el tiempo.

### Coste unitario

```
coste por pieza = coste total / instancias completadas
```

Úsalo para comparar escenarios con distinto volumen. Un plan con horas extra suele
subir el coste total y **bajar** (o no bajar) el coste unitario: eso es exactamente lo
que hay que decidir.

---

## 9. Recursos y colas: teoría de espera aplicada

### 9.1 Utilización: el indicador que lo explica todo

```
ρ = (llegadas por hora × horas de recurso por trabajo) / nº de unidades
```

- `ρ < 1` → el sistema es estable a largo plazo, pero la espera **crece de forma no
  lineal** al acercarse a 1.
- `ρ ≥ 1` → el sistema es inestable: la cola crece sin límite. En la práctica lo verás
  como esperas enormes y un mapa de calor rojo solo en una tarea.

Ejemplo: llegan 12 casos/hora, cada uno necesita 20 min (1/3 h) de recurso, y hay 5
unidades:

```
ρ = (12 × 1/3) / 5 = 4 / 5 = 0,8   → 80 % de utilización
```

Con `ρ = 0,8` ya hay espera apreciable. Con `ρ = 0,95` la espera se dispara. **La
intuición de que «queda un 20 % de capacidad, así que no hay problema» es falsa.**

### 9.2 Ley de Little

```
L = λ × W
```

Caso en el sistema (`L`) = tasa de llegada (`λ`) × tiempo medio en el sistema (`W`).
Útil para contrastar: si mides 30 casos en cola y entran 12 por hora, el tiempo medio
de espera es `W = L/λ = 30/12 = 2,5 h`. Sirve para detectar incoherencias entre lo que
dice el mapa de calor y el volumen declarado.

### 9.3 Cuello de botella

El cuello de botella es el recurso con **mayor utilización**, no el de mayor tiempo de
proceso. Se localiza en el mapa de calor con la métrica **Tiempo de espera**: la tarea
que brilla en espera son los recursos que no dan abasto aguas arriba.

### 9.4 Cómo modela las colas este motor

- La petición se hace **al empezar** la tarea y se libera **al terminar**.
- Si no hay unidades suficientes, el suceso se aparca en una cola **FIFO**.
- Al liberar, se despachan los primeros de la cola que quepan.

**Simplificación a tener presente**: no hay prioridades, no hay reservas por adelantado
(una tarea que necesita 2 unidades no espera a tenerlas todas "casi": o las toma todas
o espera), y no hay averías ni turnos.

---

## 10. Las métricas del mapa de calor

Fórmulas tal como las evalúa `SimulationController.js`. `n` = ejecuciones del elemento.

| Métrica | Fórmula | Unidad mostrada |
|---|---|---|
| Costo total | `totalCost` | moneda |
| Tiempo de espera | `totalWaitTime / n` | minutos |
| Espera total | `totalWaitTime` | minutos |
| Tiempo de proceso | `totalProcessingTime / n` | milisegundos |
| Tiempo de ciclo | `totalCycleTime / n` | minutos |
| Frecuencia | `n` (ejecuciones) | conteo |
| Tasa de fallos | `failureCount / n` | proporción |
| Tiempo de reparación | `totalReworkTime` | milisegundos |
| Horas extras | `totalOvertime` | milisegundos |
| Costo de tiempos muertos | `totalWaitTimeCost` | moneda |
| Cantidad de recursos | `resources.quantityRequired` | conteo |

Los rangos de los ejes de los gráficos están **normalizados a minutos** y así se
rotulan; antes decían `(s)` sobre valores en milisegundos, y el tiempo de espera —que
viene en minutos— se formateaba como si fueran milisegundos (error de 60 000×).

**El «Tiempo de ciclo» se atribuye al elemento terminal** (el que no tiene salida), no
a cada tarea: es el tiempo de un caso completo, medido desde su llegada hasta el cierre.
Si el diagrama termina en un evento de fin, ahí es donde se acumula; por eso el mapa de
calor lo dibuja sobre los eventos de fin y no sobre las tareas.

> **Métricas retiradas.** La paleta tenía «Espera de transporte», «Despachos
> ineficientes» y «Costo de reparación». El motor **no acumula** los campos que las
> alimentan, así que salían siempre vacías o como `NaN`. Una métrica que no puede dar
> dato es peor que no tenerla: se han eliminado. Lo mismo con las tarjetas «Costo del
> Tiempo de Reparación», «Costo Total Horas Extras» y «Costo Horas Normales» del
> resumen, que mostraban siempre $0.00 y ahora se sustituyeron por valores reales.

---

## 11. Cómo validar una corrida a mano

El motor imprime un informe en la **consola del navegador** (DevTools → Console) con
cuatro bloques: entradas globales, entradas por tarea, salidas por tarea y totales. Con
distribución **fija** y sin fallos, **cada número se recalcula con papel**.

### El procedimiento

1. **Comprueba las entradas.** Que lo que ves es lo que creías haber configurado.
   Mira especialmente `llegada`: viene ya resuelta («una cada 1.0 s»).
2. **Comprueba las salidas por tarea.** `proceso_total_min` debe ser
   `n × duración` (con distribución fija).
3. **Comprueba los totales**, en este orden:
   - `horas_extra_min` = suma de las horas extra de las tareas.
   - `semanas_con_horas_extra` y las horas de cada tramo → **es la llave para entender
     la prima**. Si solo hay 1 semana, el tramo doble no puede pasar del límite.
   - `cuadre_operacion_mas_primas` debe coincidir con `costo_total`.
4. **Comprueba las primas** con la fórmula de §7.

### Ejemplo de cuadre real

Proceso de una sola tarea, 600 min, 1 000 instancias, tarifa \$50/h, jornada 8 h
ampliada a 9 h 48 min, cupo semanal 9 h:

| Concepto | Cálculo a mano | Informe |
|---|---|---|
| `proceso_total_min` | 1 000 × 600 = 600 000 | 600 000 ✔ |
| Operación | 600 000 min = 10 000 h × \$50 = **\$500 000** | \$500 000 ✔ |
| `horas_extra_min` | 1 000 × 108 = **108 000** | 108 000 ✔ |
| Semanas con extra | todas las instancias en una → **1** | 1 ✔ |
| Tramo doble | 5 × 108 min = 540 min = **9 h** → \$450 | \$450 ✔ |
| Tramo triple | 995 × 108 min = **1 791 h** → \$179 100 | \$179 100 ✔ |
| Coste total | 500 000 + 450 + 179 100 = **\$679 550** | \$679 550 ✔ |

¿De dónde sale el 108 exacto por instancia? La jornada extendida dura 588 min
(09:00–18:48) y la tarea necesita 600. Como 600 > 588, **cualquier** instancia consume
la ventana completa de horas extra (17:00–18:48 = 108 min) y derrama 12 min al día
siguiente. De ahí que el total sea exactamente 1 000 × 108, sin dispersión.

Ese proceso cuadra al centavo. **Un informe que cuadra es la prueba de que la
aritmética del motor es correcta**; si algo no cuadra, el desajuste te dice en qué
bloque mirar.

---

## 12. Método estadístico: lo que el plugin hace y lo que no

Esto es lo más importante del documento para quien vaya a **decidir** con estos números.

### Lo que hace

- Simulación de eventos discretos **exacta**: no hay paso de tiempo fijo, cada suceso
  ocurre en el instante que le corresponde.
- Muestreo de la triangular por **inversa de la CDF** (exacto, sin sesgo).
- Fallos muestreados con `Bernoulli(failureRate)` en cada ejecución.
- Ramificación exclusiva muestreada en cada paso por la compuerta.
- Informe de validación con los datos de entrada **y** de salida.

### Lo que **no** hace

| Práctica | Estado |
|---|---|
| Semilla fija (PRNG reproducible) | **No.** Usa `Math.random()`. Dos corridas del mismo modelo dan números distintos. |
| Réplicas independientes | **No.** Cada corrida es **una** réplica. |
| Intervalos de confianza | **No.** Se reportan medias puntuales. |
| Periodo de calentamiento (*warm-up*) | **No.** El transitorio inicial se incluye en los resultados. |
| Números aleatorios comunes para comparar escenarios | **No.** Los planes normal y con horas extra usan flujos aleatorios independientes. |

### Qué implica, en la práctica

1. **Con distribución fija y sin fallos, el modelo es determinista**: dos corridas dan
   exactamente lo mismo y comparar planes es limpio. **Empieza siempre así.**

2. **Con distribuciones aleatorias, una diferencia entre planes NO es
   automáticamente real.** Parte de la diferencia es ruido de muestreo. Y como los dos
   planes usan flujos aleatorios independientes, ese ruido **no se cancela**: se suma.

3. **Cómo sortearlo hoy** (sin tocar el código):

   - Ejecuta cada plan **varias veces** y compara las distribuciones de resultados, no
     un único número. Si los rangos se solapan, la diferencia no está demostrada.
   - Fija la distribución a `fija` para la duración y deja la aleatoriedad solo donde
     te interese (p. ej. fallos al 0 %): aislarás el efecto que quieres medir.
   - Para decisiones de inversión, trata los resultados como **cotas orientativas**, no
     como estimaciones con margen de error declarado.

4. **El transitorio.** La simulación arranca con el sistema vacío. Si tu proceso real
   ya está "caliente" (con trabajo en curso), los primeros casos del modelo salen
   artificialmente rápidos. Con 1 000 instancias el efecto es pequeño, pero con pocas
   instancias puede dominar. **Desconfía de conclusiones con `runValue` por debajo de
   ~500.**

---

## 13. Limitaciones conocidas

Deliberadamente explícitas, para que no se confundan con funcionalidad ausente:

1. **Sin semilla ni réplicas** (§12). Es la limitación metodológica principal.
2. **`calculateBusinessDurationInMinutes` recorre el rango minuto a minuto.** Es
   correcto pero su coste crece con la duración simulada. En corridas de decenas de
   miles de minutos puede notarse.
3. **Sin turnos múltiples**: un solo bloque de jornada por día.
4. **Sin lotes ni transporte**: las métricas de logística se retiraron porque el motor
   no las calculaba.
5. **La espera no se penaliza si `waitCostPerHour = 0`**: las colas aparecerán en el
   tiempo, no en el coste.
6. **Terminación**: si un caso no llega nunca a un elemento sin salida, no se cuenta
   como completado y el objetivo puede no alcanzarse. El freno de seguridad evita el
   cuelgue, pero el error que lanza hay que leerlo como «revisa el diagrama».

---

## 14. Ejemplo resuelto de principio a fin

**El caso.** Un taller recibe pedidos, los inspecciona y los procesa.

- Llegadas: 12 pedidos por hora → `{ value: 12, unit: "hour" }`.
- Inspección: triangular `mín = 5`, `moda = 10`, `máx = 20` min. 10 % de fallos,
  retrabajo 15 min.
- Procesado: 25 min fijos, 1 unidad de la piscina `Operarios`.
- Piscina `Operarios`: 4 unidades.
- Jornada 09:00–17:00, lunes a viernes. Tarifa \$40/h. Coste de espera \$10/h.
- 1 000 pedidos.

### Paso 1 — Utilización de `Operarios`

Cada pedido consume 25 min = 25/60 h de operario. Llegan 12/h:

```
ρ = (12 × 25/60) / 4 = 5 / 4 = 1,25
```

**`ρ = 1,25 > 1` → el sistema es inestable.** La cola crecerá sin límite: el mapa de
calor mostrará una espera enorme en «Procesado» y creciendo con el número de
instancias. No hace falta simular para saber esto; la simulación sirve para **cuantificar**
el daño. Con 5 operarios, `ρ = 1,0` (límite); con 6, `ρ = 0,83`. Conclusión inmediata:
**hay que subir a 6 operarios** antes de cualquier otra consideración.

### Paso 2 — Qué esperar con 6 operarios (`ρ = 0,83`)

- Sigue habiendo espera (la espera no es cero hasta `ρ = 0`, imposible con 1 servidor).
- El tiempo de espera se estabiliza; el mapa de calor se ve uniforme, no creciente.
- Súbelo a 6 y vuelve a correr para **ver** la diferencia: es el uso correcto de la
  herramienta — comparar escenarios, no adivinar.

### Paso 3 — Duración media de la inspección

```
μ = (5 + 10 + 20) / 3 = 11,67 min
σ² = (25 + 100 + 400 − 50 − 100 − 200) / 18 = 175 / 18 = 9,72  →  σ = 3,12 min
```

La media (11,67) **no** es la moda (10). Con 1 000 casos el promedio simulado debe
acercarse a 11,67 min, no a 10. Si te sale sistemáticamente cerca de 10, sospecha de un
muestreo mal hecho (como el error de la inversa de la CDF que tuvo este motor).

### Paso 4 — Validación a mano

Con la inspección en `fija = 10 min` y 0 % de fallos, todo es determinista:

```
inspección: 1 000 × 10 min = 10 000 min = 166,67 h
procesado:  1 000 × 25 min = 25 000 min = 416,67 h
operación:  (166,67 + 416,67) × $40 = $23 333,60
```

Y ese número debe aparecer en `de_eso_operacion` del informe. **Valida siempre con
`fija` primero**; después pasa a la triangular para ver el efecto de la variabilidad.

### Paso 5 — Coste unitario

```
coste por pieza = (operación + primas + espera) / 1 000
```

Compáralo entre el escenario de 4, 5 y 6 operarios. Subir a 6 sube el coste de
operación y baja el de espera: el óptimo está donde el **total** es mínimo, no donde
la utilización es máxima.

---

## 15. Glosario

| Término | Significado |
|---|---|
| **Evento discreto** | Simulación que salta de suceso en suceso, sin paso fijo de tiempo. |
| **Instancia / caso** | Una ejecución completa del proceso, de la llegada al cierre. |
| **Tiempo de reloj** | Tiempo de calendario, incluidas noches y festivos. |
| **Tiempo de trabajo** | Tiempo realmente trabajado dentro de la jornada. |
| **Transitorio / *warm-up*** | Tramo inicial en que el sistema aún no está en régimen estable. |
| **Réplica** | Una corrida independiente completa. Varias réplicas → intervalo de confianza. |
| **ρ (utilización)** | Fracción del tiempo que un recurso está ocupado. `ρ ≥ 1` ⇒ cola infinita. |
| **Ley de Little** | `L = λW`: casos en el sistema = llegadas × tiempo en el sistema. |
| **Cuello de botella** | Recurso con mayor utilización. Se ve en la métrica de espera. |
| **Retrabajo** | Tiempo extra por rehacer algo tras un fallo. No es chatarra. |
| **Tramo doble / triple** | Franjas de prima de horas extra, con cupo semanal. |
| **Prima** | Recargo sobre la tarifa base. La hora base se factura aparte. |
| **CDF** | Función de distribución acumulada, `F(x) = P(X ≤ x)`. |
| **Inversa de la CDF** | Método exacto de muestreo: `x = F⁻¹(U)`, `U ~ Uniforme(0,1)`. |
| **Semana ISO** | Semana normalizada (lunes a domingo) identificada por año ISO y número. |
