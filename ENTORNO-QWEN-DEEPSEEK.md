# Entorno de configuración: Qwen Code + DeepSeek

> **Documento para agentes de IA. Esto es una ORDEN, no una descripción.**
>
> Si estás leyendo esto, tu trabajo es **escribir el `~/.qwen/settings.json` de esta máquina**
> para que el usuario tenga, en **toda sesión nueva**, los mismos selectores que ya usa en su
> entorno de siempre. No lo leas y pases de largo: **haz §3**.
>
> **Verificado el:** 2026-09-22 contra la configuración en disco y contra la documentación
> oficial de Qwen Code CLI.

---

## 1. Qué consigue esto

El usuario quiere que **cada chat nuevo traiga sus selectores poblados**: el de **modelo** con
sus modelos cargados, y el de **modo de aprobación** con el suyo elegido. Sin esto, cada
sesión nueva sale de fábrica y hay que reconfigurarla a mano.

> **Un aviso que evita una promesa falsa:** los selectores **ya existen** en Qwen Code y se
> invocan como comandos —`/model`, `/approval-mode`, `/effort`, `/auth`—, en cualquier sesión.
> Lo que **no** persiste entre chats es **qué valores** hay elegidos ni **qué modelos** aparecen
> en el selector. Un selector sin proveedores declarados sale vacío. Eso es lo que se arregla
> aquí.
>
> Y **no** se puede añadir un botón nuevo a la interfaz desde `settings.json`: los controles de
> la extensión son fijos. Si alguien promete "montar la interfaz con selectores nuevos", está
> describiendo algo que la configuración no hace.

---

## 2. Antes de escribir nada

1. **Comprueba si ya está.** Lee `~/.qwen/settings.json`. Si ya tiene `modelProviders` y
   `tools.approvalMode`, **no lo dupliques ni lo pises**: mezcla solo lo que falte.
2. **Copia de seguridad.** `cp ~/.qwen/settings.json ~/.qwen/settings.json.bak-$(date +%Y%m%d-%H%M%S)`
3. **Pregunta la clave.** Necesitas la API key de DeepSeek. **No la inventes.** Si el usuario no
   la da, escribe `"DEEPSEEK_API_KEY": ""` y dile que la rellene.
4. **Confirma dónde.** El fichero de usuario (`~/.qwen/settings.json`) afecta a **todos** los
   proyectos. El de proyecto (`<proyecto>/.qwen/settings.json`) solo a uno. Lo de aquí es
   **usuario**.

---

## 3. La orden: qué escribir

Escribe esto en `~/.qwen/settings.json`, respetando lo que ya hubiera:

```jsonc
{
  // La clave vive aquí o en ~/.qwen/.env. El `envKey` de cada modelo apunta a este nombre.
  "env": {
    "DEEPSEEK_API_KEY": "<LA CLAVE DEL USUARIO>"
  },

  // ESTO ES LO QUE PUEBLA EL SELECTOR `/model`.
  // Cada entrada es un modelo elegible. Sin esto, `/model` sale vacío.
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "[DeepSeek] deepseek-v4-pro (thinking max)",
        "baseUrl": "https://api.deepseek.com",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          "contextWindowSize": 1000000,
          "reasoning": { "effort": "max" }
        }
      },
      {
        "id": "deepseek-flash",
        "name": "[DeepSeek] deepseek-flash (vision)",
        "baseUrl": "https://api.deepseek.com",
        "envKey": "DEEPSEEK_API_KEY",
        "capabilities": { "vision": true, "agent": true },
        "generationConfig": { "contextWindowSize": 1000000 }
      }
    ]
  },

  // ESTO ES LO QUE FIJA EL MODO DE ARRANQUE DE CADA SESIÓN.
  // Sin esta clave, cada chat nuevo vuelve al default de fábrica.
  //
  // Y EL toolSearch VA ANIDADO DENTRO, no como clave plana: la clave real es
  // `tools.toolSearch.enabled`, que en JSON se escribe así.
  //
  // DeepSeek conserva caché de prefijo, y ToolSearch mete y saca esquemas de
  // herramientas entre turnos, lo que CAMBIA EL PREFIJO y hace que el caché falle.
  // Desactivado, el prefijo se mantiene y el caché acierta más. Ver §6.
  "tools": {
    "approvalMode": "auto",
    "toolSearch": { "enabled": false }
  },

  "security": { "auth": { "selectedType": "openai" } },
  "$version": 4
}
```

**Al terminar, dilo con estas palabras:** *"Reinicia Qwen Code (`/exit` y volver a abrir) para
que lo lea. Los selectores `/model` y `/approval-mode` ya estarán poblados en todos los chats,
incluidos los que ya tenías abiertos."*

**Por qué hay que reiniciar:** `modelProviders` se relee en caliente, pero `tools` y
`tools.toolSearch` **se leen al arrancar**. Hasta que no se reinicie, el modo no cambia.

---

## 4. Los selectores, y qué elige cada uno

Esto es lo que el usuario tendrá disponible en **cualquier** sesión. No hay que instalarlo: ya
viene, y esta configuración es lo que lo deja **poblado**.

| Selector | Comando | Qué elige |
| --- | --- | --- |
| **Modelo** | `/model` | Los que declares en `modelProviders`. **Sin declararlos, sale vacío.** |
| **Modo de aprobación** | `/approval-mode` | `plan`, `default`, `auto-edit`, `auto`, `yolo`. También con **Shift+Tab**. |
| **Esfuerzo** | `/effort` | `low`, `medium`, `high`, `xhigh`, `max`. |
| **Auth** | `/auth` | Proveedor y clave. |

> **Para el usuario:** `/approval-mode` y `/effort` cambian **solo la sesión actual**. Para que
> un modo quede fijo en todas, va en `tools.approvalMode` del `settings.json` (es lo que hace
> §3). El de `/model` sí se guarda como elección de sesión.

---

## 5. Los modelos, y por qué están esos dos

| Modelo | Para qué | Nota |
| --- | --- | --- |
| `deepseek-v4-pro` | Razonamiento fuerte. | `effort: "max"`. **Sin visión.** |
| `deepseek-flash` | Uso diario, **con visión**. | Es el barato. Contexto de 1 M. |

**DeepSeek factura el razonamiento como tokens de salida** —el lado caro—, así que el
interruptor de *thinking* es el ajuste que más mueve la factura. Y ojo: **`effort: "low"` no
ahorra nada**, porque DeepSeek lo normaliza a `high` en el servidor.

---

## 6. Bajar el consumo de tokens

Esto es **criterio para elegir**, no una receta de valores. Aplícalo según lo que el usuario
cuente que le pasa.

| Si el problema es… | El ajuste | Por qué |
| --- | --- | --- |
| El prefijo cambia y el caché no acierta | `tools` → `toolSearch.enabled: false` | ToolSearch mete y saca esquemas de herramientas entre turnos, y eso **rompe el prefijo estable** que DeepSeek necesita para acertar el caché. Desactivado, el prefijo no cambia y el caché acierta más. |
| El contexto se llena y se recomprime | `context.autoCompactThreshold` | Fracción de la ventana a la que salta la compactación (por defecto `0.85`). Bajar el número compacta antes: **menos contexto enviado, pero más pérdida de hilo**. Es un intercambio, no una mejora gratis. |
| El razonamiento cuesta caro | `/effort` (o `model.reasoningEffort`) | Es lo que más mueve la factura en DeepSeek. Recuerda que `low` **se normaliza a `high`**: no sirve pedir menos. |
| No arranca por tamaño | `model.sessionTokenLimit` | Corta el envío cuando el prompt supera un número. `-1` es sin límite. Es un tope de seguridad, no un ahorro. |
| La compactación tarda o cuesta | `compactionModel` | Modelo aparte para resumir, más barato que el principal. |

> **Lo que NO hay que hacer:** prometer un porcentaje de ahorro concreto. Depende del uso, y un
> número inventado hace que el usuario desconfíe del resto del documento.

---

## 7. Dónde vive la clave

Dos sitios válidos. Elige uno y sé coherente con el `envKey`:

| Opción | Cómo | Cuándo |
| --- | --- | --- |
| **En `settings.json`** | El `env` de §3. | Simple. Es lo que hay hoy. |
| **En `~/.qwen/.env`** | `DEEPSEEK_API_KEY=sk-...` | Más seguro. **Añade `.env` al `.gitignore`** si está en un proyecto. |

**Nunca** escribas una clave en un fichero versionado, ni en un log, ni en la salida de un
comando.

---

## 8. Errores que ya han pasado, para no repetirlos

**1. Leer este MD y no hacer nada.**
Ocurrió: se mandó a un entorno nuevo y el sistema *"no supo cómo implementarlo"*.
Causa: el documento **describía** el entorno en vez de **ordenar** escribirlo. Un agente lo lee,
aprende datos y sigue igual. **Por eso este documento empieza con una orden.**

**2. Prometer selectores nuevos.**
Los selectores son fijos. Lo que se puebla es el contenido de `/model`. Si alguien espera "un
botón nuevo en el panel", no lo va a encontrar y dará el trabajo por fallido.

**3. Escribir el fichero sin mirar el que había.**
Pisa la configuración del usuario. **Siempre** leer primero y mezclar.

**4. Poner un `approvalMode` muy abierto.**
`yolo` no pregunta nada. Es cómodo y es peligroso: el agente puede borrar o subir cosas sin
consultar. `auto` es el equilibrio —un clasificador aprueba lo seguro y bloquea lo peligroso—;
pon `yolo` **solo** si el usuario lo pide y entiende el riesgo.

---

## 9. Comprobación final

Cuando termines, enséñale al usuario estas tres comprobaciones:

```bash
# 1. El fichero es JSON válido y tiene las dos claves que importan.
node -e "
const d=require(process.env.HOME+'/.qwen/settings.json');
console.log('modelos:', Object.values(d.modelProviders||{}).flat().length);
console.log('approvalMode:', d.tools && d.tools.approvalMode);
console.log('toolSearch:', d.tools && d.tools.toolSearch);
"
```

2. **Que reinicie** y escriba `/model`: tienen que aparecer **los dos** modelos.
3. Que escriba `/approval-mode` sin argumentos: tiene que salir el **selector**, con el modo
   actual marcado.

Si el selector de `/model` sale vacío, `modelProviders` no se escribió bien: revisa que el
`id` de cada modelo esté y que el proveedor sea `openai` (que es el protocolo, no la marca).
