# App de toma de tiempos (Apps Script)

Esta carpeta es un **proyecto de Apps Script** con su propio `.clasp.json`. Contiene la app de campo
que cierra el ciclo con el plugin de Camunda:

```
Camunda + token (diseño)  →  configurador.json  →  ESTA APP  →  mediciones.json  →  simulación real
```

El plugin exporta qué tareas hay que medir; esta app recoge los tiempos reales con intervalo de
confianza y devuelve el `mediciones.json` que realimenta el simulador.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `Code.gs` | El backend: hoja, estudios, apartados, muestras y estadística |
| `index.html` | TODO: el marcado, el tema visual y el JavaScript de la interfaz |
| `appsscript.json` | Manifiesto: permisos, zona horaria y modo de despliegue |
| `.clasp.json` | El `scriptId` (ignorado por git: es de la cuenta, no del código) |

**Todo va en un solo archivo (`index.html`), y es a proposito.** Se intento partirlo en
dos archivos usando una plantilla de Apps Script (`createTemplateFromFile` + un punto de
inyeccion) y **no funciona**: la composicion ocurre DENTRO del literal de JavaScript con el
que Apps Script sirve el panel, asi que el resultado queda doblemente escapado y el
navegador recibe etiquetas y llaves que no puede interpretar. La app revienta.

**Ojo con la conclusion facil.** El panel de Apps Script SIEMPRE llega con el contenido
escapado (`\x3c`, `\x27`, `\x7b`): eso es normal y el navegador lo desescapa al evaluarlo.
Una app que funciona lo tiene igual. Lo que rompe no es el escapado, es la SEGUNDA capa que
mete la plantilla.

El patron que SI funciona —y el que ya usaba la herramienta de cotizacion— es
`createHtmlOutputFromFile` con el marcado y el JavaScript en el mismo archivo.

### Dos trampas al editar este archivo

1. **No usar plantillas de Apps Script** (`<? ?>`, `createTemplateFromFile`, `evaluate()`).
   Escapan el contenido y rompen la app.
2. **Ningun comentario HTML puede contener la etiqueta de apertura de un script**: el
   archivo se procesa como plantilla aunque no la uses, y esa etiqueta rompe el parseo.

Las dos las comprueba `pnpm run verificar` (arnes 15) antes de que hagas push, con prueba
negativa verificada.

---

## Un estudio por importación

**Cada importación del `configurador.json` crea un estudio nuevo**, con la fecha en el id
(`demo.bpmn` → `demo-2026-09-18`).

No es una preferencia de estilo: el `idCorto` (el número visible de cada tarea) **se
reasigna cuando cambia el diagrama**. Si se fusionaran dos versiones del mismo archivo,
una tarea añadida al principio correría todos los números y las mediciones de la versión
vieja quedarían atribuidas a **otra tarea**, en silencio. Con un estudio por importación
eso no puede pasar, y además se pueden comparar las dos versiones.

La entrada de la app es **siempre la lista de estudios**: nunca carga uno sin preguntar.

---

## Cómo se mide

Un **solo botón**, y nunca hay que parar:

| Estado | Qué dice | Qué hace al pulsar |
|---|---|---|
| Parado | **Iniciar medición** (azul) | Arranca el reloj |
| Corriendo | **Cerrar y empezar la siguiente** (verde) | Cierra esa pieza, la anota, pone el reloj a cero y sigue |
| Pausado | **Reanudar medición** (naranja) | Reanuda |

Y **dos contadores**: el grande es el **intervalo** (lo que se registra en cada toque) y el
chico el **total de la sesión, con la hora de inicio**. Con un solo reloj que se reinicia,
el observador pierde la noción de cuánto lleva midiendo.

### Por qué el botón funciona así

Midiendo pieza tras pieza, el operario no espera a que el observador pulse «detener» y
luego «iniciar». Con un solo toque **no se pierde el arranque de la pieza siguiente**.

El botón está enlazado **solo a `click`**, nunca a `touchstart`: en iOS eso guardaría
**dos mediciones por toque**, porque el navegador emite además el click sintético.

---

## En el celular

Tres cosas que **no** son de estilo y que estaban mal:

1. **El reloj no miente.** El pintado usa `requestAnimationFrame` y no `setInterval`: con
   la pantalla apagada el navegador **suspende** los timers y el reloj mostrado se
   congelaba. El tiempo guardado siempre fue correcto (se calcula con `Date.now`), pero
   el número en pantalla no.
2. **No te bloqueas a ti mismo.** `beforeunload` **no se dispara nunca en celular**. Con
   solo ese evento, cada vez que se cerraba la pestaña la tarea quedaba apartada y el
   propio operario no podía reabrirla hasta que el cron la marcara abandonada (5 min).
   Ahora libera con `visibilitychange` y `pagehide`.
3. **Las mediciones no se pierden.** Se guardan en `localStorage` **en cada registro** y se
   recuperan al reabrir la tarea. Se limpia el borrador al guardar en la hoja — si no, se
   contarían dobles.

Y de diseño: el botón de medir es grande (72 px), **se queda pegado abajo** al hacer
scroll, los campos van a 16 px (por debajo, iOS hace zoom al enfocar y descoloca la
pantalla) y el reloj crece para leerse a un metro.

---

## Diagnóstico por URL

`doGet` atiende acciones de diagnóstico cuando lleva el parámetro `accion`:

```
https://.../exec?accion=ping       -> que el script responde, version y umbrales
https://.../exec?accion=esquema    -> las pestanas, sus columnas y si coinciden
https://.../exec?accion=estudios   -> los estudios con sus conteos
https://.../exec?accion=muestras   -> conteo de muestras por tarea y por operario
```

Sin el parámetro, sirve la interfaz normal.

**Lo que NO devuelven, y es a propósito:** ningún tiempo medido. La app está desplegada
con acceso de **«cualquier persona»**, así que cualquiera con la URL puede llamar a estas
acciones: si devolvieran los tiempos, el enlace bastaría para leer el estudio entero. Con
estructura y conteos, lo máximo que se filtra es «3 estudios, 12 tareas, 84 muestras»,
que no dice nada del proceso.

Los campos de tiempo (`media_s`, `desv_s`, los valores de las muestras) **nunca** salen
por aquí. Está comprobado en el arnés 15 con dos pruebas negativas: si alguien añade un
campo de tiempo al diagnóstico, `pnpm run verificar` falla y señala el valor que se filtró.

---

## El tema visual y la red

La interfaz usa **Tailwind por CDN y la tipografía Inter**, igual que la herramienta de
cotización, para que las dos se sientan la misma herramienta.

**Consecuencia asumida:** si el celular no tiene red, la app se ve **como texto plano**
(sin colores, sin tarjetas). El cronómetro sigue funcionando porque el JavaScript es
local, pero la pantalla se vuelve incómoda. Se decidió así a conciencia, por coherencia
visual con el resto de las herramientas.

---

## Puesta en marcha

### 1. La hoja de cálculo

Crea (o usa) una hoja de Google. **Copia su ID** de la URL:

```
https://docs.google.com/spreadsheets/d/AQUI_ESTA_EL_ID/edit
```

### 2. El ID va en las propiedades del script, no en el código

En el editor de Apps Script:

```
Archivo > Configuración del proyecto > Propiedades del script > Añadir
  Nombre: ID_HOJA
  Valor:  <el id que copiaste>
```

**Por qué así y no escrito en `Code.gs`:** permite tener una hoja de pruebas y otra de producción sin
dos ramas de código, y el repositorio no lleva dentro un identificador de cuenta.

### 3. Subir el código

```bash
cd app-tiempos
clasp push
```

### 4. Preparar la hoja

En el editor, ejecuta **`prepararHoja()`** una vez. Debe crear cinco pestañas:

| Pestaña | Contenido |
|---|---|
| `_config` | Control: versión del esquema y umbrales |
| `bd` | **Una fila por muestra** (nunca una por tarea) |
| `_apartados` | Quién está midiendo qué (la verdad del candado) |
| `proyectos` | Configuradores importados |
| `tareas` | Catálogo y agregados por tarea |

### 5. El cron

Ejecuta **`instalarCron()`** una vez. Cada 5 minutos marca como abandonadas las tareas cuyo latido
caducó. **Marca, no cierra**: cerrar le borraría el trabajo en curso a quien sí estaba midiendo.

### 6. Desplegar

```
Implementar > Nueva implementación > Aplicación web
  Ejecutar como: Yo
  Quién tiene acceso: Cualquier persona
```

**Copia la URL** y ábrela. Es la dirección que usa el equipo en planta.

---

## Cómo se usa

1. **Proyecto** → importa el `configurador.json` que exporta el plugin de Camunda.
2. **Tareas** → el tablero: cada tarea es una tarjeta con su ID, el avance y quién la está midiendo.
   Pulsa una para medirla.
3. **Medir** → cronómetro. Con **Vuelta (Lap)** mides pieza tras pieza sin tocar el reloj.
4. **Guardar en la hoja** → sube las muestras. Se pueden marcar como **atípicas** (una interrupción,
   un parón): se excluyen de la media **pero se informan**, porque un descarte que no se ve es un
   dato escondido.
5. **Resumen** → medias, desviación, margen e **cuántas muestras faltan** por tarea.
6. **Exportar `mediciones.json`** → vuelve al plugin, que sustituye los supuestos por lo medido.

---

## Dos reglas que no se pueden romper

### La hoja es la verdad; la caché solo acelera

`CacheService` **no garantiza el TTL**: puede desalojar una entrada antes de tiempo. Si el candado de
una tarea viviera solo en caché, el desalojo haría que **dos operarios midieran la misma tarea sin
enterarse**. La caché se puede perder en cualquier momento y el sistema sigue siendo correcto.

### El candado tiene tres estados

| Estado | Significa | Quién pasa |
|---|---|---|
| **LIBRE** | Nadie la mide | Todos |
| **ACTIVA** | Alguien mide, con latido reciente | Solo esa sesión |
| **HUÉRFANA** | El latido caducó | Cualquiera, **con confirmación** |

La confirmación **dice quién y cuándo** («Ana la dejó hace 12 min»). Sin ese dato, el botón de liberar
es un botón a ciegas.

**Identidad:** con acceso anónimo, `Session.getActiveUser()` devuelve cadena vacía, así que
`sesionId` (el navegador, en `localStorage`) y `usuario` (lo que escribe la persona) son dos cosas
distintas y **las dos hacen falta**.

---

## Diagnóstico

Estas funciones devuelven **estructura y conteos, nunca tiempos de producción**, para poder verificar
sin ver datos de planta:

| Función | Qué devuelve |
|---|---|
| `ping()` | Que el script responde, la versión del esquema y los umbrales |
| `esquema()` | Las pestañas, sus columnas y si coinciden con las esperadas |
| `ultimasMuestras(proyectoId, limite)` | Conteos por tarea, sin los tiempos |

`esquema()` con `coincide: false` en alguna pestaña significa que una columna se renombró o se
perdió: hay que arreglarlo **antes** de seguir midiendo.

---

## Verificación

`Code.gs` está cubierto por el arnés `verificacion/15-app-de-campo.mjs` del repo del plugin
(**81 comprobaciones**), que ejecuta las funciones reales contra una hoja simulada:

```bash
cd ..                     # a la raíz del plugin
pnpm run verificar
```

Cubre la estadística (una tarea con coeficiente de variación conocido tiene que dar un `n`
calculable a mano), el candado (dos sesiones sobre la misma tarea), el cron (que marca y no cierra)
y la idempotencia del guardado.

---

## Estado

**Implementado y verificado:** backend completo, interfaz completa.
**Pendiente:** el troceador del configurador para diagramas muy grandes (>100 tareas, cuando el
`configurador.json` supera el límite del transporte en una sola llamada).
