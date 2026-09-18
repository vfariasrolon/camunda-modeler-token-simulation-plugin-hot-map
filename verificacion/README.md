# Verificación

Arneses que comprueban el **motor real** del plugin: 15 ficheros, **683 comprobaciones**, más
3 arneses de **navegador** que montan diagram-js de verdad.

```bash
pnpm run verificar             # lógica (Node, rápido)
pnpm run verificar:navegador   # DOM, canvas y filtros SVG (Chrome)
```

`verificar` copia el código del plugin, lo prepara para Node y corre los arneses, imprimiendo al
final un resumen y **solo lo que falle** si algo falla. `verificar:navegador` compila los arneses de
`verificacion/navegador/` y los ejecuta en Chrome headless; si no encuentra Chrome, se salta solo.

---

## Qué comprueba cada arnés

| Arnés | Qué cubre | Checks |
|---|---|---|
| `01-integracion-calendario-y-curva` | Tramos de trabajo, descansos y curva de arranque, **de punta a punta** con el motor: el trabajo es idéntico con y sin descanso, y la rampa cuesta dinero | 22 |
| `02-reglas-laborales` | Jornada base por turno, topes del art. 65, prima dominical y de festivo, cumplimiento, y las trampas de la espera por recurso | 38 |
| `03-lotes-y-barrera` | Lotes en serie por tracción, tamaño fijo/triangular/empírico, parón de cambio, tarea por lote y barrera de firma | 41 |
| `04-mapa-del-dia` | Acumulación hora × ocupación: minutos-recurso, hora de arranque y que una duración cero no inventa celda | 11 |
| `05-carga-y-personas` | Series de masa que no se suman, peso por frecuencia, reparto en ronda, tarifas, habilidades que bloquean y operatividad | 46 |
| `06-calendario-y-curva` | El calendario y la curva por dentro: festivos locales, días laborables, eficiencia y formas de la curva | 64 |
| `07-calendario` | Calendario laboral: horarios, descansos, fin de jornada y días laborables | 20 |
| `08-inverso-del-calendario` | `subtractWorkingTime`, con la propiedad **`add(sub(t, d), d) === t`** y los cruces de descanso y fin de semana | 15 |
| `09-diagnostico-de-datos` | El diagnóstico de lo que se puede medir: inventario, estados y **coherencia de rutas** | 55 |
| `10-ejemplo-de-validacion` | El fichero `docs/ejemplo-validacion.bpmn`: XML válido, JSON válido, referencias completas y **el motor corriéndolo de verdad** | 40 |
| `11-textos-sin-mentir` | Que **ningún texto del producto niegue una capacidad que sí existe**. Si implementas algo y dejas el «sin X», este arnés falla | 27 |
| `12-ventana-de-tiempo` | Los días **laborables** y **naturales** de la ventana: que se cuenten los dos, que los naturales nunca sean menos, y que cruzar un fin de semana o un festivo los separe | 21 |
| `13-mapa-de-calor` | El color del mapa: **uniforme en frío** cuando no hay contraste (el caso «cantidad de recursos»), la leyenda con el rango real, y que la regla esté **cableada** | 59 |
| `14-id-de-tareas` | El ID visible: numeración por **orden de flujo** (no de pantalla), bucles y ramas sin dejar tareas sin número, y el **contrato del configurador** | 44 |

## Arneses de navegador (`verificacion/navegador/`)

Comprueban lo que solo se ve en un navegador. Existen porque el fallo que dejó pasar la regresión del
zoom **no era de lógica, era del ciclo de eventos**: ningún arnés de Node lo habría cazado.

| Arnés | Qué cubre | Checks |
|---|---|---|
| `mapa-de-calor.js` | El filtro SVG real: la tabla de color da azul en 0 y rojo en 255, y el caso uniforme sale con opacidad fría | 14 |
| `ids-de-tarea.js` | Que el ID se pinte, que a zoom 25 % **siga visible** (contraste: un overlay con `minZoom` se oculta) y que se compense x1.4 | 14 |
| `panel-de-datos.js` | El editor de datos (el archivo **más grande del plugin**): Tareas, Global y los ciclos de **ida y vuelta del CSV**. Incluye el guardián de los **30 campos globales**, que caza un campo perdido en una reestructuración | 115 |

---

## El esquema de arranque: `docs/ejemplo-validacion.bpmn`

Ábrelo en el Camunda Modeler y ya está configurado: no hay que rellenar nada para empezar a comparar
a mano. Es el caso mínimo que ejercita todo el motor:

```
inicio → inspección (triangular 5/10/20, recurso) → compuerta 80/20 → procesado → fin
                                                          ↓
                                                     reparación ──┘
```

- Jornada **09:00–17:00 con descanso de 13:00 a 14:00** (dos tramos: 4 h y 3 h).
- **200 instancias**, una llegada por minuto, tarifa **50 $/h**, sin coste de espera (para que el
  cuadre salga limpio).
- Piscina `Operarios` con 2 unidades.

**Para validar a mano, empieza por lo fácil**: pon `Inspeccion` en **fija a 10 min** y la tasa de
fallo a 0. Así cada pieza son exactamente **10 + 25 = 35 min de trabajo**, y cualquier desviación
que veas es un fallo real del motor o un error tuyo de lectura — no de la aleatoriedad.

---

## Cómo están hechos (y por qué importa)

**Los arneses no reimplementan nada.** `build.mjs` copia `client/simulation/*.js` a `.mjs` y solo
reescribe los especificadores de import, con un stub mínimo en las fronteras que dependen de
`bpmn-js` (el `is()` y el `getSimulationData()`). Todo lo demás —el motor, el calendario, las reglas
laborales, la carga y el diagnóstico— es **el mismo código que se empaqueta en el plugin**.

Esto es lo que hace que la verificación valga: si los arneses tuvieran su propia copia de la lógica,
estarían comprobando la copia y no el producto. **Cuando cambies el motor, vuelve a correr
`pnpm run verificar`**, y si algo se rompe lo verás ahí antes de abrir el modelador.

Los ficheros `*.mjs` que genera `build.mjs` están en `.gitignore`: son derivados y se regeneran.

---

## Dónde mirar cuando un número no te cuadre

Los arneses usan los **mismos** cálculos que el motor, así que sirven para responder «¿por qué sale
esto?» con papel:

1. **Corre el escenario en el modelador** y mira el **informe de consola** (DevTools → Console).
   Imprime entradas y salidas: la tasa de llegada ya resuelta, los tramos, la curva de arranque
   resuelta, los lotes, el cumplimiento, la operatividad por persona y la carga.
2. **Compara con `docs/GUIA_SIMULACION.md`**, que tiene la fórmula de cada cifra y un ejemplo
   resuelto a mano.
3. Si la discrepancia está en una **frontera** (un descanso, el fin de jornada, un festivo), mira el
   arnés correspondiente: **cada comprobación es un caso con su resultado esperado escrito al
   lado**, así que se lee como una lista de «esto debería dar esto».

---

## Añadir un caso nuevo

Cuando encuentres una discrepancia validando a mano, lo más rápido es **añadirla como comprobación**
en el arnés que le corresponda. El patrón es siempre el mismo:

```js
ok(condicion, 'qué debería pasar', valorObtenido);
```

Y luego `pnpm run verificar`. Un caso añadido hoy vale para siempre: es lo que convierte «creo que
esto está mal» en «esto está mal, aquí está la prueba y ya no puede volver a pasar».

---

## Los arneses de interfaz

Estos doce cubren el **motor** y la coherencia de los textos. La interfaz (panel de datos, diagnóstico y gráficos) se verificó con
un arnés aparte que monta el panel real en un navegador (webpack + Chrome headless, 112
comprobaciones). **No se versiona** porque necesita el binario de Chrome, y un arnés que no corre en
cualquier máquina es peor que no tenerlo: se queda como herramienta puntual y su resultado está
descrito en el `CHANGELOG.md`.
