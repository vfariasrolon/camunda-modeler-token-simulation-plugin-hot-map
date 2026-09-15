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
11. [Los gráficos y cómo leerlos](#11-los-gráficos-y-cómo-leerlos)
12. [El informe de evaluación y su puntaje](#12-el-informe-de-evaluación-y-su-puntaje)
13. [Cómo validar una corrida a mano](#13-cómo-validar-una-corrida-a-mano)
14. [Método estadístico: lo que el plugin hace y lo que no](#14-método-estadístico-lo-que-el-plugin-hace-y-lo-que-no)
15. [Limitaciones conocidas](#15-limitaciones-conocidas)
16. [Ejemplo resuelto de principio a fin](#16-ejemplo-resuelto-de-principio-a-fin)
17. [Glosario](#17-glosario)

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

- Predecir con precisión estadística (una corrida = **una** réplica; ver §14).
- Optimizar automáticamente (no busca soluciones; evalúa la que le des).
- Modelar turnos múltiples, averías, lotes o transporte real: el motor no los tiene.

### El ciclo de trabajo

```
1. Rellenas datos  →  pestaña "Datos de simulación por tabla"
2. Ejecutas        →  ▶  (corre DOS planes: normal y con horas extra)
3. Analizas        →  mapa de calor (☯) y panel de gráficos (📊)
4. Compruebas      →  el informe de la consola del navegador (§13)
5. Documentas      →  el informe PDF, con figuras, cuadre y puntaje (§12)
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
| **Frecuencia** | `por token` (lo de siempre) o `por lote` (una sola vez por lote). | «Llenar la orden» es `por lote`; «registrar cada pieza» es `por token`. Ver §4.1. |
| **Barrera** (`disp.` / `mín` / `moda` / `máx` / `tol.`) | Quien firma: probabilidad de atender a la primera, espera si no atiende, y tolerancia. | Solo se lee con `por lote`. Con `disp.` a 1 no hay ninguna espera. Ver §4.2. |
| **Carga física** (`kg` / `kg` / `m`) | **Masa cargada** (la que soporta), **masa arrastrada** (la que desliza) y **distancia**. | Opcional. Ver §4.8. Deja las casillas **vacías** si no aplica: vacío es «no lo sabemos». |
| **Habilidad** | La etiqueta que la tarea **exige**. Varias, separadas por comas. | Si nadie de la piscina la tiene, la tarea se **bloquea**. Ver §4.9. |

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

Opcionalmente, cada piscina puede declarar **miembros con nombre** (§4.10): cada uno con su
**tarifa** ($/h), su **carga máxima** (kg) y sus **habilidades**. Ver §4.9 y §4.10.

### 4.8 Carga física: dos series que no se suman

Cada tarea puede declarar cuánta masa mueve y a qué distancia:

| Campo | Qué es |
|---|---|
| **Masa cargada (kg)** | Lo que la persona **soporta**: en brazos, al hombro, en la mano. |
| **Masa arrastrada (kg)** | Lo que **no soporta**: un carro, una tarima con ruedas, algo que se desliza. |
| **Distancia (m)** | Lo que recorre moviéndola. |

De ahí salen tres cifras: **kg movidos**, **kg·m** (masa × distancia) y **toneladas** acumuladas.

> **La regla que importa: cargada y arrastrada NUNCA se suman.** Cargar (soportar el peso) y
> arrastrar (deslizarlo) no son la misma magnitud, así que el informe las imprime en **columnas
> distintas** y **no hay ninguna fila de total conjunto**. Si quieres una equivalencia, la declaras
> tú: el programa no la inventa.

**La masa se aplica una vez por ejecución de la tarea.** Y como una tarea `por lote` se ejecuta una
vez por lote, mover 12 kg por pieza en un lote de 20 da **12 kg**, no 240: en planta se hizo un solo
viaje.

> **Alcance, explícito:** el sistema **da datos, no valoraciones**. Dice «moverás 12 t a 8 m durante
> 6 h» y marca las bandas que tú hayas declarado. **No** evalúa posturas, ni riesgo, ni lesiones: eso
> se hace fuera, con estos números.

### 4.9 Habilidades: bloquean de verdad

Una tarea puede **exigir** una habilidad (o varias, separadas por comas), y una persona declara las
que **tiene**. Si **ninguna unidad de la piscina** tiene las que la tarea exige, la tarea **no
arranca**: se bloquea y el tiempo se cuenta en su propia categoría.

Es la decisión **conservadora**: un dato que falta bloquea, no acelera. Y es lo único que puede
producir la categoría «bloqueado por habilidad» del informe.

Si la tarea no exige ninguna habilidad, nunca se bloquea (aunque la piscina tenga nombres).

### 4.10 Colaboradores con nombre

Con **miembros** declarados, cada unidad de la piscina pasa a ser **una persona concreta**:

| Campo del miembro | Qué aporta |
|---|---|
| **Nombre** | Identidad: el informe y las cargas se atribuyen a esa persona. |
| **Tarifa ($/h)** | Su coste propio. Si no la pones, se usa la tarifa de la planta. |
| **Carga máxima (kg)** | Un dato para **avisar** de un exceso, no para rechazar trabajo. |
| **Habilidades** | Las que tiene, para saber si puede hacer una tarea. |

Tres cosas que conviene saber:

- **La cantidad sigue mandando la capacidad.** Los nombres dan identidad, no plazas. Una piscina de 3
  con 2 nombres sigue teniendo 3 puestos.
- **El reparto va en ronda.** Dos personas equivalentes trabajan lo mismo, en vez de que una acapare
  todo y la otra salga ociosa.
- **Sin miembros, todo se comporta como antes.** Poner un nombre no cambia ningún tiempo por sí solo,
  y solo cambia el coste si le pones tarifa propia.

> **El sistema no asigna personal.** Muestra quién trabajó, cuánto y qué movió, y quién tiene holgura;
> mover gente es tu decisión. Para comprobarla, cambia la política y **vuelve a simular**: la política
> es declarada, no una caja negra.

### 4.11 Operatividad: cómo se repartió la jornada

Con miembros con nombre, el informe reparte la jornada de cada persona en **cuatro categorías que
suman el total** (no queda un resto sin explicar):

| Categoría | Qué es |
|---|---|
| **Activo** | Trabajando. Es lo que antes se llamaba «minutos del puesto». |
| **Sin trabajo** | No había nada que hacer: la planta estaba ociosa. |
| **Esperando firma** | El lote entero aguantó la barrera (§4.2). |
| **Bloqueado por habilidad** | La tarea esperaba a alguien con la etiqueta que exige y no lo había. Ver §4.9. |

«Con trabajo asignable» (había cola, pero no era la suya) **no se calcula**: haría falta reconstruir
qué cola había en cada instante. Se declara en el informe en vez de dejar un hueco, porque un hueco
sin explicar se lee como un cero.

**La espera de firma y el bloqueo se reparten entre las personas de la piscina.** Es una *imputación
declarada*, no una medida: el motor no sabe a ciencia cierta quién aguantó cada espera. El informe lo
dice tal cual, para que no se lea como un dato medido.

Con esto, el informe puede decir **quién tiene holgura** y **por qué** está parado cada uno — que es
justo lo que hace falta para decidir a quién mover, sin que el programa lo decida solo.

### 11.4 Gráficos honestos: por qué no hay curvas suaves

Las líneas del panel **no llevan suavizado**, y no es una preferencia estética. El suavizado dibuja
subidas y bajadas **graduales que no existieron**: si un día se produjeron 5 piezas y el siguiente 8,
no hubo un 6,5 a media tarde. Y lo que se mira en esos gráficos es justo si un día concreto se
descolgó, cosa que una curva suave tapa.

- **Producción acumulada en escalones.** La acumulación sube a saltos y se queda **plana** entre
  ellos. Con lotes, el alto del escalón es el tamaño del lote y el tramo plano es el parón entre
  lotes: **es el dato más útil del gráfico**, y el suavizado lo borraba.
- **Ocupación por hora × día.** Una rejilla donde el color dice cuánto se ocupó cada hora: se ven los
  picos de lote, los valles del descanso y las horas muertas de un vistazo. El **corte de color va
  impreso en la leyenda**, porque una banda sin su umbral es una cifra con autoridad falsa.
  - Guarda **minutos-recurso** (duración × unidades), no minutos: una tarea que ocupa 2 unidades
    durante 30 min ocupa el doble que una de 1 unidad durante 30 min.
  - La escala es **por día**: cada fila se compara con su propia hora más cargada, así que dice
    *cuándo* se trabajó, no *qué día fue más intenso*.
- **Perfil de la jornada.** Piezas por día en barras: un día es un valor, no una curva.

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
| Descansos | Lista de descansos con **tres interruptores**: si cuenta como jornada, si es tiempo productivo y si también se toma en horas extra. Ver §6. |
| Arranque (curva) | Forma (exponencial/lineal), eficiencia inicial, minutos de recuperación y sus dos disparadores. Se dibuja la curva mientras se ajusta. Ver §6. |
| Llegadas por LOTES | Activado, las llegadas dejan de ser un chorro continuo y van **en serie**: un lote detrás de otro. Ver §4.3. |
| Tamaño de lote (modo y valores) | `fixed`, `triangular` (mín/moda/máx) o `empirical` (tabla de tamaños con su peso). |
| Parón de cambio entre lotes | Minutos de cambio de herramienta/utillaje entre un lote y el siguiente. |
| Semilla | Vacío = al azar; la que se use queda guardada en el informe. Ver §4.4. |
| Tabla de tamaños de lote | Solo con el modo `empirical`: cada tamaño con su **peso** (frecuencia relativa; no hace falta que sume 100). |
| Tipo de jornada | Diurna (8 h), nocturna (7 h) o mixta (7,5 h). LFT art. 61. Ver §4.5. |
| Tope de horas extra al día | 3 h. LFT art. 65. **No cambia lo que se paga**: cambia el veredicto. |
| Máximo de días con extra por semana | 3. LFT art. 65. |
| Prima dominical / Prima de festivo | % sobre el salario del día. LFT arts. 73 y 74. Ver §4.6. |
| Tabla de vigencias | Reglas con **fecha desde la que rigen**. Vacía = usar los valores de arriba. Ver §4.7. |


### 4.1 Frecuencia: ¿una vez por pieza o una vez por lote?

`por lote` se ejecuta **una sola vez por lote**, la primera vez que el flujo pasa por ahí. La
**posición en el diagrama da el momento**: al principio del flujo es la preparación (rellenar la
orden), al final es el cierre (reportar lo producido), y si hay dos, son las dos. No hace falta un
campo «inicio/cierre», y dentro de un bucle **no se repite en cada vuelta**.

No es un detalle menor: un documento de 30 minutos hecho **por pieza** en un lote de 20 son
**10 horas**; hecho **por lote**, **30 minutos**. Un factor **20×**. Es la razón de fondo por la que
producir por lotes abarata lo administrativo: **el sobrecoste se reparte entre el lote**.

Y la etiqueta **sugiere, no deriva**: marcar una tarea como administrativa puede pre-rellenar la
frecuencia, pero dos tareas administrativas pueden comportarse distinto.

### 4.2 Barrera: el lote entero espera la firma

Con la frecuencia `por lote`, la barrera describe a quien tiene que firmar. Se modela **por su
efecto y no como una persona**, porque su agenda no se conoce y modelarla sería falsa precisión:

| Campo | Qué significa | Por defecto |
|---|---|---|
| `disp.` | Probabilidad de que atiendan **a la primera** (espera 0). | 0,70 |
| `mín` / `moda` / `máx` | Si no atienden, lo que espera el lote, en minutos. | 10 / 20 / 60 |
| `tol.` | **Tolerancia**: por debajo, la espera es ruido; por encima, se marca y se mide. | 15 min |

La **tolerancia** es el umbral de lo aceptable: sin ella, cada espera de tres minutos ensucia el
informe y al final nadie lo lee. El precio de la simplificación, para que sea una decisión y no un
descuido: no hay contrapresión entre avisos (no se ve si el firmante atiende a muchas áreas) y no
se puede «simular contratar a otro firmante». A cambio, se cuantifica **el coste de la espera**, que
es lo que hace falta para decidir.

Como el `disp.` es una estimación, la forma honesta de usarlo es **análisis de sensibilidad**:
correr con 90 % y con 70 %. Si el plan apenas se mueve, el dato no importa y no merece perder
tiempo en medirlo; si se desmorona, hay que ir a medirlo. **El programa dice cuánto pesa no
saberlo.**

### 4.3 Lotes en serie: el reloj deja de ser el de llegadas

Con las llegadas por lotes **no hay dos lotes a la vez**: se arranca uno, se cierra y arranca el
siguiente (**por tracción**). El reloj de llegadas pasa a ser el **reloj de lotes**, y el **parón de
cambio** entre ellos se mide como tiempo muerto con causa declarada («ocioso por fin de lote»).

Es el **precio exacto de la política de lotes**, y como la política se declara, se puede **cotizar**:
«¿cuánto ganaría si dejara solapar dos lotes?» tiene respuesta.

El **último lote puede ser parcial** (se corta con lo que falte para completar las instancias
pedidas). No es un defecto: es lo que hace que **la muestra efectiva sean los lotes**, no las
piezas.

Dos consecuencias que hay que tener presentes al leer los resultados:

- **El tamaño de muestra efectivo son los LOTES.** 1 000 piezas en 50 lotes no son 1 000 muestras
  del patrón de llegada: son **50**. Con lotes pequeños, la incertidumbre de todo lo que dependa del
  ritmo de llegada es mucho mayor de lo que parece.
- **El ranking por número de ejecuciones deja de ser comparable.** Una tarea por lote se ejecuta 50
  veces y otra por token 1 000. Ordena por **tiempo o coste total** y, para el coste por pieza,
  **divide por el tamaño del lote**.

### 4.4 La semilla

Con ella se consiguen tres cosas, y la tercera es la que justifica el campo:

1. **Reproducibilidad**: la misma corrida da el mismo resultado.
2. **Réplicas de verdad**: varias semillas → intervalo de confianza.
3. **Números aleatorios comunes**: dos escenarios ven **la misma secuencia de azar**, así que la
   diferencia se debe al cambio y **no a la suerte**. Sin esto, comparar dos tamaños de lote es
   comparar dos muestras pequeñas: **ruido contra ruido**.

Déjala **vacía** para simular con azar y que el sistema guarde la que usó (así el resultado sigue
siendo auditable). Escríbela a mano solo si quieres **repetir** una corrida concreta.

---

### 4.5 Tipo de jornada: la extra se mide contra la jornada BASE

La LFT fija la jornada en **8 h diurna, 7 h nocturna y 7,5 h mixta** (art. 61). Lo que pase de ahí en
el día **ya es tiempo extra**, aunque el horario que hayas declarado en el calendario sea más largo:

```
horario declarado: 09:00 - 18:00 (9 h)      turno diurno (base 8 h)
                   ├── 8 h de jornada base  ── se pagan a tarifa
                   └── 1 h extra            ── se paga con prima
```

Es un **recorte, nunca una ampliación**: si tu jornada declarada ya es igual o más corta que la base
legal, no cambia nada (nadie hace horas extra por trabajar menos). Por eso los diagramas que ya
tenías dan exactamente los mismos números que antes.

### 4.6 Primas de domingo (art. 73) y de festivo (art. 74)

- **Dominical**: 25 % sobre el salario de los días ordinarios, si trabajas en domingo. Viene al 25 %
  por defecto porque es lo que dice la ley.
- **Festivo**: depende del contrato y de si el festivo cae en domingo, así que viene **a 0** y lo
  declaras tú. Inventar un porcentaje sería peor que no tenerlo.
- Si un festivo cae en **domingo**, manda la prima de festivo: **no se suman**.

Y un matiz del calendario que conviene entender: **un festivo cierra el día solo si ese día de la
semana no está declarado laborable**. Si tienes el lunes entre los días laborables y declaras un
lunes como festivo, la planta **abre** ese día (y se paga la prima). Si no lo tuvieras como
laborable, el día se cierra y la corrida se desplaza al siguiente.

### 4.7 Reglas con vigencia: por qué no son una casilla

El cupo semanal de horas extra, los multiplicadores, los topes y las primas se pueden declarar con
**una fecha desde la que rigen**:

| Desde | Cupo semanal (h) | Prima doble (×) | … |
|---|---|---|---|
| 2026-01-01 | 9 | 2 | … |
| 2026-07-01 | 8 | 2,5 | … |

La diferencia importa: si el cupo se guardara en una casilla suelta y mañana cambiara la ley,
**todos los informes ya emitidos** se recalcularían con la ley nueva y dejarían de ser auditables.
Con vigencias, se **añade una fila** y cada corrida guarda **qué versión usó**.

Se resuelven por la **fecha de arranque de la simulación**, no por la de hoy: un informe de enero
sigue cuadrando en junio. Una celda vacía significa **«lo que digan los valores de arriba»**, así que
solo hay que rellenar lo que cambia. Si ninguna fila rige todavía, mandan los valores de arriba y el
informe lo dice tal cual.

> **Alcance, explícito:** esto es una **tabla de tasas y umbrales para costear el proceso**, no una
> nómina. **No** se calculan IMSS, ISR, aguinaldo, prima vacacional ni finiquitos.

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

El plugin **no hace esto automáticamente** (§14).

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

## 11. Los gráficos y cómo leerlos

El desplegable del panel de gráficos está agrupado por familias. Cada uno responde a una
pregunta distinta, y usarlos en el orden equivocado lleva a conclusiones equivocadas.

### Producción

| Gráfico | Qué pregunta responde |
|---|---|
| **Producción Diaria** (barras) | Cómo se repartió el trabajo entre los días: comparación directa día a día. |
| **Producción Diaria, tendencia y media** (línea) | Si el ritmo se **estabiliza** o va a la deriva. La línea roja es la media. El tramo inicial bajo es el arranque del sistema vacío, no un problema. |
| **Avance Acumulado** (curva S) | Cuándo se alcanza cada porcentaje del total. Es la curva de entrega. |
| **Comparativa Normal vs. Extras** | Cuántas piezas más aportan realmente las horas extra. |

### Costos

| Gráfico | Qué pregunta responde |
|---|---|
| **Costo por Tarea, desglose** (apilado) | **Por qué** es cara una tarea: la altura es el costo total y los colores dicen si es trabajo, horas extra o espera. |
| **Comparativa de Costos** | Dónde se va el dinero extra del plan con horas extra, componente a componente. |
| **Pareto (Costos)** | Qué pocas tareas concentran el gasto. |

### Tiempos y capacidad

| Gráfico | Qué pregunta responde |
|---|---|
| **Distribución del Tiempo de Ciclo** (histograma) | La forma de la distribución. El título lleva **p50, p90, p95 y máximo**: si el p95 está muy lejos de la media, hay cola, y la cola es lo que rompe un plazo. |
| **Utilización de Recursos (ρ)** | **Dónde está el cuello de botella.** La línea roja es el 100 %. Barra por encima del 90 % = al límite; por encima del 100 % = saturado. |
| **Top 5 Tiempo de Proceso / Espera / Horas extra** | Los mayores consumos por tarea. |

### Calidad y flujos

| Gráfico | Qué pregunta responde |
|---|---|
| **Pareto (Fallos / Tiempos / Esperas)** | Qué pocas tareas explican la mayor parte del problema. El de **esperas** es el del cuello de botella. |
| **Volumen por Camino** | Por dónde se va el trabajo de verdad, en casos y en % de los completados. |
| **Dispersión (Tiempo vs. Costo)** | Si una tarea es cara por durar mucho o por otra cosa. |

> **Sobre el Sankey.** Un diagrama de Sankey es muy vistoso, pero en BPMN el diagrama ya es el
> mapa de flujo: duplicaría lo que ya se ve. Para *analizar*, una barra ordenada de volumen
> por camino compara y ordena mejor. Por eso el plugin trae `flowVolume` y no un Sankey.

---

## 12. El informe de evaluación y su puntaje

El botón **«Informe PDF»** compone un documento técnico con el modelo, las figuras, las tablas
de resultados y una evaluación por puntos, y lo manda al diálogo de impresión para guardarlo
como PDF.

### Estructura

1. **Portada** — ficha del modelo y de la corrida.
2. **Resumen ejecutivo** — veredicto, puntaje y los ocho indicadores clave.
3. **Metodología y supuestos** — y, de forma explícita, lo que el modelo **no** hace.
4. **Entradas** — tareas, reparto de compuertas y recursos, tal como se simularon.
5. **Resultados** — figuras y tabla por tarea.
6. **Capacidad y cuello de botella** — utilización por recurso y Pareto de esperas.
7. **Evaluación por puntos** — el scorecard con el cálculo de cada nota.
8. **Hallazgos y recomendaciones** — derivados de los datos, no redactados a mano.
9. **Anexos** — percentiles del ciclo, producción diaria y resultados por elemento.

### El apartado de comprobación

El informe dedica una sección a **recomponer el costo total a partir de sus cuatro
componentes** y a declarar si cuadra. Un informe que presenta números es una cosa; uno que
demuestra que sus números son correctos es otra. Esa sección es el aval del resto del documento.

### Cómo se puntúa

Cada dimensión se puntúa con una **rampa lineal entre dos umbrales declarados**: el umbral
*bueno* vale 100 puntos, el *malo* vale 0, y en medio se interpola.

```
puntos = 100 × (1 − (valor − bueno) / (malo − bueno))     recortado a [0, 100]
```

Ejemplo real: utilización ρ = 0,85 con umbrales 0,70 (bueno) y 1,00 (malo):

```
100 × (1 − (0,85 − 0,70) / (1,00 − 0,70)) = 100 × (1 − 0,5) = 50 puntos
```

La nota final es la **media ponderada**, y el informe imprime valor, umbrales, peso, puntos y
aporte de cada dimensión: con esos cinco datos cualquiera puede rehacer la cuenta.

| Dimensión | Métrica | Umbrales (bueno → malo) | Peso |
|---|---|---|---|
| Saturación de recursos | ρ del recurso más cargado | 0,70 → 1,00 | 20 % |
| Variabilidad del tiempo de ciclo | coeficiente de variación | 0,05 → 0,50 | 15 % |
| Peso de la espera | espera media ÷ ciclo medio | 0 % → 40 % | 15 % |
| Coste indirecto de horas extra | primas ÷ coste de operación | 0 % → 30 % | 15 % |
| Calidad (retrabajo) | fallos por ejecución | 0 % → 10 % | 15 % |
| Estabilidad del ritmo | CV de la producción diaria | 0,00 → 0,40 | 10 % |
| Consistencia del modelo | incidencias detectadas | 0 → 1 | 10 % |

Los pesos suman 100 %.

### Tres reglas del puntaje que conviene entender

1. **Una dimensión que no se ha medido no vale cero.** Si el modelo no declara recursos, no hay
   ρ que juzgar: la dimensión se marca *sin medir*, el peso se reparte entre las demás y el
   informe lo dice. Poner un cero a algo que no se ha medido hundiría la nota sin motivo.
2. **El costo unitario y el plazo se informan SIN nota.** Un costo o un plazo no son buenos ni
   malos en abstracto: dependen del objetivo del negocio. Sin un objetivo declarado,
   calificarlos sería inventar el criterio. Se muestran con su valor para que los juzgue quien
   decide.
3. **El puntaje es orientativo.** Sale de **una sola réplica**, sin intervalo de confianza. El
   informe lo advierte en el resumen ejecutivo y lo repite en los hallazgos: el titular es el
   veredicto en palabras y el puntaje va como respaldo, no al revés.

### Veredicto por tramos

| Puntaje | Veredicto |
|---|---|
| 85 – 100 | Proceso sólido |
| 70 – 84 | Apto con reservas |
| 50 – 69 | Requiere mejoras antes de operar |
| 0 – 49 | No apto: hay un problema estructural |

### Cómo guardarlo como PDF

Al pulsar «Guardar como PDF» se abre el diálogo de impresión del sistema con el informe ya
compuesto. Elige **«Guardar como PDF»** como destino. El nombre del fichero sale propuesto a
partir del nombre del diagrama y la fecha. Los encabezados y pies de página (con los números
de página) los añade ese diálogo, no el plugin: actívalos si los quieres.

---

## 13. Cómo validar una corrida a mano

El motor imprime un informe en la **consola del navegador** (DevTools → Console) con
cuatro bloques — entradas globales, entradas por tarea, salidas por tarea y totales — y un
quinto bloque **`SALIDAS · lotes`** cuando las llegadas son por lotes: cuántos lotes, piezas por
lote de media, ciclo de lote (medio / mín / máx), parones de cambio y su total, esperas de firma,
cuántas superaron la tolerancia y cuántas tareas se ejecutaron por lote. Con
distribución **fija** y sin fallos, **cada número se recalcula con papel**.

### El procedimiento

1. **Comprueba las entradas.** Que lo que ves es lo que creías haber configurado.
   Mira especialmente `llegada`: viene ya resuelta («una cada 1.0 s»), y `semilla`, sin la cual
   una corrida interesante no se puede repetir.
2. **Comprueba las salidas por tarea.** `proceso_total_min` debe ser
   `n × duración` (con distribución fija). Con lotes, `n` son las **piezas**, pero una tarea
   `por lote` solo se ejecuta **una vez por lote**: ahí `proceso_total_min` es
   `nº de lotes × duración`, y `ejecuciones_de_tareas_por_lote` te lo confirma.
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

## 14. Método estadístico: lo que el plugin hace y lo que no

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
| Semilla fija (PRNG reproducible) | **Sí** (§4.4). Vacío = al azar, pero la usada se guarda y se imprime. |
| Números aleatorios comunes para comparar escenarios | **Sí.** Los dos planes de una corrida comparten la misma secuencia de azar. |
| Réplicas independientes | **A mano.** Cada corrida es **una** réplica; con semilla puedes repetirla o cambiarla. |
| Intervalos de confianza | **No.** Se reportan medias puntuales. |
| Periodo de calentamiento (*warm-up* estadístico) | **No.** El transitorio inicial se incluye en los resultados. No confundir con la **curva de arranque** (§6): esa no descarta nada, modela que la planta empieza lenta. |

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

## 15. Limitaciones conocidas

Deliberadamente explícitas, para que no se confundan con funcionalidad ausente:

1. **Sin réplicas automáticas ni intervalos de confianza** (§14). Hay semilla (así que las
   réplicas se pueden hacer a mano y repetir), pero no se lanzan N corridas ni se agrega el
   intervalo: esa sigue siendo la limitación metodológica principal.
2. **`calculateBusinessDurationInMinutes` recorre el rango minuto a minuto.** Es
   correcto pero su coste crece con la duración simulada. En corridas de decenas de
   miles de minutos puede notarse.
3. **Sin turnos múltiples**: un solo bloque de jornada por día.
4. **Sin métricas de transporte ni de distancia**: se retiraron porque el motor no las
   calculaba. Los **lotes** sí están modelados (§4.3); el *por dónde* y el *cuánto pesa*
   llegar hasta ahí, no.
5. **La espera no se penaliza si `waitCostPerHour = 0`**: las colas aparecerán en el
   tiempo, no en el coste.
6. **Terminación**: si un caso no llega nunca a un elemento sin salida, no se cuenta
   como completado y el objetivo puede no alcanzarse. El freno de seguridad evita el
   cuelgue, pero el error que lanza hay que leerlo como «revisa el diagrama».
7. **La barrera de firma es un único aviso.** Si no atienden, el lote espera **una** vez;
   no hay segunda tanda ni contrapresión entre áreas (§4.2).
8. **El recurso se mantiene retenido durante el descanso.** Al pausar la tarea no se libera
   la unidad de la piscina, así que otra tarea en cola no la aprovecha. Y el re-arranque
   tras el descanso se aplica a las tareas que **empiezan** en el tramo siguiente, no a las
   que se reanudan a medias.

---

## 16. Ejemplo resuelto de principio a fin

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

## 17. Glosario

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
