# Changelog

All notable changes to the [camunda-modeler-token-simulation-plugin](https://github.com/camunda/camunda-modeler-token-simulation-plugin/blob/master/CHANGELOG.md) are documented here. We use [semantic versioning](http://semver.org/) for releases.

## Unreleased

* `FIX`: **el mapa de calor desaparecía al alejar el zoom**, justo cuando más falta hace (diagramas
  grandes). Las manchas tienen el radio en coordenadas del **diagrama** —para cubrir la figura
  entera— así que encogían con todo lo demás: al 25 % una mancha de 30 px se veía de 7,5 px. Ahora el
  radio se **compensa por el zoom**, de forma que mide lo mismo **en pantalla** a cualquier
  distancia, y se redibuja al terminar de hacer zoom (con rebote de 120 ms, para que una rueda del
  ratón cueste un redibujado y no veinte).
* `FEAT`: la compensación tiene **tope** (`MIN_ZOOM_COMPENSADO`, 25 %). Sin él, un zoom del 5 %
  pediría manchas 20× más grandes y **todas se solaparían en una sola que tapa el diagrama**, que es
  peor que el fallo original. Por encima del 100 % no se compensa nada: acercarse se comporta como
  siempre.
* `DOCS`: **los iconos de la librería de tokens sí desaparecen por debajo del 50 %**, y esto **no se
  toca**: es una restricción de `bpmn-js-token-simulation` (`show: { minZoom: 0.5 }` en
  `ElementNotifications`, `ContextPads` y `TokenCount`). No se parchea `node_modules` para
  sobrescribirla: el mapa de calor —que es nuestro— ya se ve a cualquier zoom, y forzarlo obligaría a
  revisar el parche en cada actualización de la dependencia.
* `FEAT`: **el resumen (y el informe) dicen cuándo empieza y cuándo termina**, con los días contados
  en los **dos relojes**: **días laborables** (lo que se trabaja y se paga) y **días naturales** (lo
  que tarda en llegar la fecha, con fines de semana y festivos dentro). Antes solo había un «Días
  Laborales Totales» suelto, y quien pregunta «si produzco 1000 piezas, ¿cuándo termino?» no tenía
  respuesta. El bloque va **primero** en el resumen porque es la primera pregunta, y explica en
  palabras para qué sirve cada contador: el natural es el que se le dice al cliente, el laborable el
  que se le paga a la plantilla.
* `FEAT`: el bloque añade los **días no laborables** que quedan dentro de la ventana (la diferencia
  entre los dos relojes, que es lo que explica por qué el trabajo se estira) y las **horas netas por
  día laborable**, para poder contrastar la carga real de la jornada.
* `FIX`: **una fecha inválida devolvía `NaN`** en el contador de días naturales, y ese `NaN` se
  habría propagado al resumen como «NaN días». El guard `instanceof Date` no bastaba:
  `new Date('cualquier cosa')` **es** un `Date`, solo que con `getTime()` a `NaN`. Ahora se comprueba
  que la fecha sea utilizable.
* `FIX`: **los backticks dentro del CSS del informe rompían la compilación**, porque el CSS es un
  template literal de JavaScript y un backtick lo cierra. Mismo tipo de error que ya pasó con una
  comilla suelta.
* `DOCS`: **A6 (réplicas e intervalo de confianza) queda acordado en el diseño** como primer bloque
  de la próxima tanda, con las decisiones ya fijadas para no volver a discutirlas: el modelo
  determinista da **intervalo de ancho cero** (no se corre N veces ni se inventa incertidumbre), el
  intervalo se calcula **sobre la diferencia de planes emparejados** (no sobre dos medias
  independientes), **solo las medias llevan intervalo** —un total acumulado crece con n, su intervalo
  no significa nada— y **20 réplicas** por defecto. El motivo de que sea el bloque más urgente: hoy
  una corrida es una réplica, así que no se puede saber si una diferencia de 1,4 min es el cambio o
  el azar.
* `FIX`: **el informe mentía sobre sí mismo.** Decía «una sola réplica, **sin semilla fija** y sin
  intervalo de confianza» cuando la semilla existe desde A3, y las limitaciones seguían citando «sin
  lotes ni transporte» cuando los lotes también están hechos. Un documento que miente sobre sus
  propias capacidades es peor que uno incompleto: quien lo audita deja de fiarse de todo lo demás.
  Ahora el informe **imprime la semilla que se usó** en la portada, con la frase que la hace útil
  («con esta semilla la corrida se reproduce exactamente»), y distingue lo que **sí** está resuelto
  (los dos planes de una corrida comparten azar) de lo que **no** (el ruido de una sola réplica).
* `FEAT`: **arnés de verificación que impide que vuelva a pasar** (`11-textos-sin-mentir.mjs`). Cada
  afirmación de «no hace X» se comprueba contra el código: si implementas X y dejas el texto, el
  arnés **falla y te obliga a actualizarlo**. Probado poniendo el texto falso a propósito: lo caza.
* `CHORE`: **los arneses de verificación se versionan** en `verificacion/` (11 ficheros, **379
  comprobaciones**) con un comando único: `pnpm run verificar`. Estaban fuera del repositorio y se
  habrían perdido al reiniciar la máquina, que es justo lo contrario de lo que hace falta para
  validar durante semanas. Los arneses **no reimplementan nada**: copian el código del plugin y lo
  corren, con un stub mínimo en las fronteras que dependen de `bpmn-js`. La comprobación de que
  `docs/ejemplo-validacion.bpmn` es válido incluye **correrlo con el motor de verdad**.
* `DOCS`: **esquema de arranque para validar a mano** (`docs/ejemplo-validacion.bpmn`). Ya está
  configurado, así que se puede simular y comparar con papel en cuanto se abre: jornada con
  descanso, 200 instancias, compuerta 80/20, recurso con 2 unidades y tarifa. El propio fichero trae
  documentados los números para que cuadren a mano, y la receta para empezar por lo fácil (poner la
  inspección fija y sin fallos, y así cada pieza son 35 min exactos).
* `FIX`: **fuera el suavizado de las líneas.** Las líneas venían con `tension` puesta y eso **miente**:
  el suavizado dibuja subidas y bajadas graduales que no existieron (un día se produjeron 5 y el
  siguiente 8: no hubo un 6,5 a media tarde) y oculta justo lo que se mira, que es si un día
  concreto se descolgó.
* `FEAT`: **la producción acumulada se dibuja en ESCALONES** (`stepped: 'before'`). No es estética:
  la acumulación sube a saltos y se queda **plana** entre ellos. Con lotes el alto del escalón es el
  tamaño del lote y el tramo plano es el hueco entre lotes, que es el dato más útil del gráfico — y
  el suavizado lo borraba.
* `FEAT`: **mapa de calor del día: hora × ocupación**. Rejilla donde el color dice cuánto se ocupó
  cada hora, así que se ven los picos de lote, los valles del descanso y las horas muertas de un
  vistazo. El **corte de color va impreso en la leyenda**: una banda sin su umbral es una cifra con
  autoridad falsa. Guarda **minutos-recurso** (duración × unidades), no minutos sueltos: una tarea
  que ocupa 2 unidades durante 30 min ocupa el doble que una de 1 unidad.
* `FEAT`: **perfil de la jornada** (piezas por día en barras) y el bloque de perfil en el informe de
  consola, que imprime el mapa del día como rejilla de texto para poder leerlo sin salir de la
  consola.
* `FEAT`: `BusinessCalendar.subtractWorkingTime()`, el **inverso de `addWorkingTime`**. Hace falta
  para saber **cuándo empezó** una tarea conociendo cuándo terminó y lo que duró: restar los
  milisegundos de reloj es incorrecto en cuanto hay un descanso en medio, porque ese rato no se
  trabajó. Se resuelve por **bisección** sobre el instante de inicio, que garantiza la ida y vuelta
  exacta sin depender de convenciones en las fronteras.
* `FIX`: **el mapa del día apilaba todas las tareas de un caso en la misma hora.** Se usaba
  `event.startTime`, que es cuándo arrancó la **instancia**, no esta tarea. Ahora se retrocede desde
  el fin con `subtractWorkingTime`, que además salta los descansos correctamente.
* `FIX`: **un cursor de fecha mal avanzado en `_finDeTramoAnterior`** daba fechas de 2018: el
  `setHours` se aplicaba sobre el día nuevo en vez del viejo, y el bucle gastaba el límite de días
  buscando. Lo cazó el arnés del inverso, que comprueba que `add(sub(t, d), d) === t`.
* `FEAT`: **operatividad por persona**: activo y las tres ociosidades que el motor puede medir de
  verdad (**sin trabajo**, **esperando firma**, **bloqueado por habilidad**). Las cuatro cifras
  **suman la jornada disponible** de cada persona, así que no queda un resto sin explicar, y el
  informe lo **comprueba** e imprime el veredicto. La espera de firma y el bloqueo se reparten entre
  las personas de la piscina: es una **imputación declarada**, no una medida, y se dice así.
  «Con trabajo asignable» **no se calcula** —haría falta reconstruir qué cola había en cada
  instante— y se declara en la tabla, porque un hueco sin explicar se leería como un cero.
* `FEAT`: dos gráficos nuevos en el grupo «Personas»: **jornada por persona** (barras apiladas con
  activo y las tres ociosidades, con la ocupación en el tooltip) y **carga física por persona**
  (masa cargada y arrastrada en **columnas separadas**, nunca apiladas: no son la misma magnitud).
  Sin miembros con nombre explican que hacen falta, en vez de dibujar un gráfico vacío.
* `FIX`: **el tiempo bloqueado por habilidad siempre valía cero.** El acumulador leía un campo
  (`bloqueoMinutos`) que no existía en ningún evento. Ahora el tiempo es la **duración que habría
  ocupado la tarea**, que es la única lectura honesta: no hay reloj que medir porque la tarea no
  llega a arrancar.
* `FIX`: **el tiempo trabajado no se anotaba cuando la tarea no tenía carga.** El reparto de minutos
  por persona vivía detrás del corte por «carga vacía», así que cualquier tarea sin masa declarada
  dejaba el **activo de la persona en cero** y toda su jornada aparecía como «sin trabajo». El
  tiempo y la masa son dos cosas distintas: una tarea sin peso también ocupa a quien la hace.
* `FEAT`: **carga física por tarea** (bloque A5). Cada tarea declara **masa cargada**, **masa
  arrastrada** y **distancia**, y el motor acumula kg, kg·m y toneladas. Las dos series **nunca se
  suman**: cargar (soportar el peso) y arrastrar (deslizarlo) no son la misma magnitud, y el informe
  las imprime en columnas distintas sin ninguna fila de total conjunto. La masa se aplica **una vez
  por ejecución de la tarea**, y como una tarea «por lote» se ejecuta una vez por lote, mover 12 kg
  por pieza en un lote de 20 da 12 kg y no 240.
* `FEAT`: **colaboradores con nombre** dentro de una piscina, con **tarifa**, **habilidades** y
  **carga máxima**. Sin miembros nada cambia (compatibilidad total). Con miembros, cada unidad es una
  persona concreta y el reparto va **en ronda**, para que dos personas equivalentes trabajen lo mismo
  en vez de acaparar una. La **cantidad sigue mandando la capacidad**: los nombres solo dan identidad.
* `FEAT`: la **tarifa por persona** sustituye a la de la planta cuando existe, y las primas se
  calculan con la misma tarifa que la operación (si no, el cuadre del informe dejaría de cerrar).
  Quien no tenga tarifa usa la de la planta, así que poner nombres no mueve el coste por sí solo.
* `FEAT`: las **habilidades bloquean de verdad**. Si ninguna unidad de la piscina tiene la que la
  tarea exige, la tarea **no arranca** y el tiempo se cuenta en su propia categoría («bloqueado por
  habilidad»). Es la decisión conservadora —un dato que falta bloquea, no acelera— y es lo único que
  puede producir esa categoría de tiempo muerto.
* `FEAT`: **editor de todo lo anterior**: columnas de carga y habilidad en Tareas, subtabla de
  miembros en Recursos (con añadir y quitar por fila), generación de datos de prueba que incluye una
  tarea de carga y otra de arrastre, y round-trip completo por CSV. Los CSV exportados antes siguen
  importándose: las columnas nuevas son opcionales.
* `FEAT`: el **informe técnico** gana una subsección de carga física y personas con las dos series
  separadas, la tabla por colaborador y el **aviso de alcance impreso**: el sistema da masa,
  distancia y horas, y **no valora posturas ni riesgo**.
* `FIX`: **sin piscina asignada no se anotaba ninguna carga.** El acumulador vivía dentro del bloque
  de recursos, así que una tarea sin piscina —lo más común— no reportaba nada de lo que movía. La
  carga es una propiedad del **trabajo**, no del recurso que lo hace.
* `FIX`: `release()` devolvía la tarea que esperaba y la persona que le tocaba, pero el bucle de
  liberación seguía tratándolo como si fuera el marcador: la simulación **se caía** en cuanto una
  tarea por lote esperaba por un recurso.
* `FIX`: las filas **anidadas** de la tabla de miembros se leían como piscinas. Los recorridos de la
  tabla principal ahora se limitan a las filas con `data-el-id` y a los hijos directos del cuerpo.
* `FEAT`: **diagnóstico de datos** (icono nuevo en la barra). Responde a la pregunta que se hace
  *antes* de simular: «quiero medir esto, ¿qué me falta?». Lista las **13 capacidades** del sistema
  (coste, ciclo, capacidad, colas, lotes, cumplimiento LFT, calendario, calidad, carga física,
  colaboradores, habilidades, operatividad y reparto de caminos) con estado **listo / parcial /
  falta**, y agrupa lo que falta **por el dato que lo desbloquea**, ordenado por cuántas capacidades
  devuelve cada uno. Cada pendiente lleva su **consecuencia** («sin distancia no hay kg·m, solo kg»),
  porque un aviso sin consecuencia no se lee dos veces. No simula: lee el modelo tal como lo lee el
  editor de datos, así que no puede discrepar de lo que se va a simular.
* `FEAT`: **ayuda por pestaña** en el editor de datos (botón «?» en la cabecera). Cada una explica
  tres cosas y en este orden: **qué se declara**, **qué se puede medir con esos datos** y **la trampa
  que más cara sale**. Decir solo la lista de campos no ayuda: la pregunta real es para qué sirven.
  La ayuda se **recarga al cambiar de pestaña**, porque si no seguiría explicando la anterior, que es
  peor que no tener ayuda: el usuario leería la respuesta equivocada.
* `FEAT`: **reglas laborales versionadas por fecha** (`LaborRules.js`). Un número en una casilla
  reescribe el pasado: si el cupo semanal de horas extra se guardara suelto y mañana cambiara la ley,
  todos los informes ya emitidos se recalcularían con la ley nueva y dejarían de ser auditables. Con
  una **tabla de vigencias** se añade una fila, y cada corrida guarda **qué versión usó**. Se
  resuelven por la fecha de arranque de la simulación, no por la de hoy. Deja la tabla vacía para
  usar los valores de siempre.
* `FEAT`: **tipo de jornada** (LFT art. 61): diurna 8 h, nocturna 7 h, mixta 7,5 h. La extra se mide
  contra la jornada **base del turno**, no contra el horario declarado: un horario de 9 h en turno
  diurno ya lleva dentro 1 h que se pagaba a tarifa base. Es un recorte, nunca una ampliación, así
  que una jornada de 8 h o menos no cambia nada.
* `FEAT`: **cumplimiento de la LFT art. 65** (máx. 3 h de extra al día y 3 días con extra por
  semana). Es una salida **distinta del coste**: pasarse cuesta más, pero además es ilegal, y el
  informe puede decirlo *antes* de que ocurra — «con este plan, en 8 de 20 semanas se superó el
  límite legal, en promedio 2,3 h de más». El tope diario **no** cambia lo que se paga: el pago lo
  fijan los arts. 66 y 68, que son semanales.
* `FEAT`: **prima dominical** (art. 73, 25 %) y **prima de día festivo** (art. 74). Cada una en su
  propio cubo, para que el cuadre del informe pueda demostrarlas. La de festivo viene a **0** por
  defecto: cuánto se paga depende del contrato, e inventarlo sería peor que no tenerlo.
* `FEAT`: el **informe técnico** gana una sección de reglas laborales con la base legal de cada
  tope, el veredicto de cumplimiento y el detalle por semana, y la portada resume las reglas
  aplicadas. El cuadre del coste incluye las primas de día como quinto componente, y la sección de
  hallazgos pone el incumplimiento **el primero** cuando existe, porque no es un problema de
  eficiencia.
* `FIX`: **una tarea que esperaba por un recurso pagaba horas extra que no existió.** Calculaba su
  tiempo extra y sus primas con la hora del **intento**, no con la hora real, y las apuntaba al día
  y a la semana equivocados: una tarea que arranca a las 18:00, espera al recurso y trabaja el
  martes pagaba 1 h extra de una franja en la que no trabajó. Ahora la unidad se pide **antes** de
  costear y la tarea se re-programa con su hora real.
* `FIX`: **un festivo en un día laborable cerraba la planta sin avisar.** El calendario se
  contradecía: `workingDays` decía «abierto» y `holidays` «cerrado», y ganaba `holidays`, así que la
  corrida se saltaba el día en silencio y la **prima de festivo era imposible de pagar**. Ahora un
  festivo cierra **solo** si su día de la semana no está declarado laborable.
* `FIX`: la pestaña Global **perdía los valores por defecto de los objetos anidados** cuando el
  modelo solo tenía parte de ellos (`labor`, `warmup` o `lots`): el `...raw` superficial sustituía
  el objeto entero y las casillas salían vacías.
* `FEAT`: **llegadas por lotes, en serie y por tracción**. No hay dos lotes a la vez: se arranca
  uno, se cierra, y arranca el siguiente. El reloj de llegadas pasa a ser el reloj de lotes, y el
  **parón de cambio** entre ellos se mide como tiempo muerto con causa declarada («ocioso por fin
  de lote»). El tamaño se elige **fijo**, **triangular** o por **tabla empírica** (10 el 30 % de las
  veces, 20 el 50 %…), que es como llegan los pedidos de verdad. El **último lote puede ser
  parcial**: es lo que hace que la muestra efectiva sean los lotes y no las piezas.
* `FEAT`: **semilla global** (`mulberry32`) en el motor y en el configurador. Da reproducibilidad
  (misma corrida, mismo resultado) y **números aleatorios comunes**, que es lo que permite comparar
  dos escenarios sabiendo que la diferencia se debe al cambio y no a la suerte. Vacío = al azar, y
  la que se usó queda guardada en el informe.
* `FEAT`: **tareas por lote** (columna «Frecuencia» en la pestaña Tareas). `por token` es lo de
  siempre; `por lote` se ejecuta **una sola vez por lote**, la primera vez que el flujo pasa por
  ahí. Un documento de 30 minutos hecho por pieza en un lote de 20 son 10 horas; hecho por lote, 30
  minutos: un factor 20×, que es la razón de fondo por la que producir por lotes abarata lo
  administrativo.
* `FEAT`: **barrera de firma**. El lote entero espera a que firmen, y se modela **por su efecto y no
  como una persona** (la agenda del firmante no se conoce y modelarla sería falsa precisión):
  probabilidad de que atiendan a la primera, espera con forma mín/moda/máx si no atienden, y una
  **tolerancia** que decide qué espera cuenta como parón reportable. Sin umbral, cada espera de tres
  minutos ensucia el informe y al final nadie lo lee.
* `FEAT`: el informe de consola imprime el bloque de **lotes**: cuántos, piezas por lote de media,
  ciclo de lote (medio/mín/máx), parones de cambio y su total, esperas de firma, cuántas superaron
  la tolerancia y las ejecuciones de tareas por lote.
* `FIX`: **las dos pasadas de una corrida (normal y con horas extra) usaban semillas distintas.** La
  semilla se resolvía en cada pasada, así que con el campo vacío cada plan sacaba una del reloj: la
  comparación entre planes mezclaba el efecto del plan con el de la suerte, que es justo lo que el
  campo existe para evitar, y el informe imprimía **dos semillas distintas** para lo que el usuario
  cree que es una sola corrida. Ahora una corrida fija su semilla y la comparte entre pasadas; la
  siguiente pulsación saca otra. Lo encontró una comprobación escrita para el efecto contrario.
* `FIX`: **exportar y volver a importar la pestaña Global estaba roto**. La semilla es un campo
  opcional («vacío = al azar») y esa rama solo existía al recoger del formulario: al importar, el
  valor vacío se rechazaba por «no numérico». Lo encontró el arnés de DOM, no una prueba del motor.
* `FIX`: **el parón de cambio se contaba también en el último lote**, aunque ya no quedara nada que
  producir: con un lote de prueba salían dos parones en vez de uno.
* `FIX`: importar el CSV de tareas con `frecuencia = lot` **explica** qué falta si las columnas de
  barrera no están o si la fila viene recortada, en vez de decir «valor no numérico».
* `FEAT`: la ida y vuelta del CSV es **idempotente** y está verificada: exportar → importar →
  exportar devuelve exactamente lo mismo, tanto en Tareas (frecuencia y barrera incluidas) como en
  Global (tabla de tamaños de lote incluida). Los CSV exportados antes de este cambio siguen
  importándose: las columnas nuevas son opcionales.
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
