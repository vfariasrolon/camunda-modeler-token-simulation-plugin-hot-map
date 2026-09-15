# Entorno de configuración: Qwen Code + DeepSeek

> **Documento para agentes de IA.** Describe el entorno de Qwen Code configurado para
> usar la API de DeepSeek. Sirve para replicar esta configuración en otra máquina o
> para que otro agente entienda de partida qué modelos hay, cómo razonan y cuánto cuestan.
>
> **Verificado el:** 2026-09-14 (CST) contra la configuración en disco y contra la
> propia API de DeepSeek. Qwen Code CLI `0.23.3`.

---

## 1. Resumen para el agente

- El proveedor es **DeepSeek** vía protocolo **OpenAI-compatible** (`authType: "openai"`).
- Hay **dos modelos** configurados: `deepseek-v4-pro` (razonamiento fuerte, sin visión)
  y `deepseek-flash` (barato, **con visión**, razonamiento libre).
- El modelo por defecto de la sesión es **`deepseek-flash`**.
- Contexto de ambos: **1.000.000 tokens**.
- **DeepSeek factura el razonamiento como tokens de salida** (el lado caro), lo que hace
  del interruptor de *thinking* el ajuste que más mueve la factura.
- **`effort: "low"` no ahorra nada**: DeepSeek lo normaliza a `high` en el servidor.

---

## 2. Archivos implicados

| Ruta | Papel |
| --- | --- |
| `~/.qwen/settings.json` | Configuración de usuario. **Es el único sitio donde vive esto.** |
| `~/.qwen/.env` | **No existe** en esta máquina. La clave está en `settings.json` (ver §7). |

No hay `.qwen/settings.json` a nivel de proyecto en el árbol de trabajo.

---

## 3. `settings.json` completo

```jsonc
{
  "env": {
    "DEEPSEEK_API_KEY": "<tu-clave-deepseek>"
  },
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
        "capabilities": { "vision": true },
        "generationConfig": {
          "contextWindowSize": 1000000
        }
      }
    ]
  },
  "security": {
    "auth": { "selectedType": "openai" }
  },
  "model": {
    "name": "deepseek-flash",
    "baseUrl": "https://api.deepseek.com"
  },
  "providerMetadata": {
    "deepseek": {
      "version": "0a0e507650110cbaf09ea65b92ba06ce8ff8c1a57b2d8dd8a61897fa1469aae3",
      "baseUrl": "https://api.deepseek.com"
    }
  },
  "$version": 4
}
```

> **Aviso sobre la clave:** en el archivo real el valor de `envKey` **es la clave literal**,
> no una referencia. Se ha sustituido por un marcador aquí. `envKey` en un modelo es el
> *nombre de la variable* de entorno; el `env` del bloque superior es el que la define.

---

## 4. Los dos modelos en detalle

### `deepseek-v4-pro`

| Propiedad | Valor |
| --- | --- |
| Modelo real servido | DeepSeek-V4-Pro-0813 |
| Contexto | 1.000.000 tokens |
| Salida máx. | 384K |
| Visión | ❌ **no soportada** |
| Thinking | siempre **ON** a `effort: "max"` |
| Límite de concurrencia | 500 |

**Para qué usarlo:** diseño, depuración difícil, refactor grande, razonamiento de varios pasos.
Es el modelo caro; no lo dejes por defecto.

### `deepseek-flash`

| Propiedad | Valor |
| --- | --- |
| Modelo real servido | DeepSeek-V4.1-Flash |
| Contexto | 1.000.000 tokens |
| Salida máx. | 384K |
| Visión | ✅ **soportada** (JPEG, PNG, GIF, WebP) |
| Thinking | **libre** — controlable desde la UI |
| Límite de concurrencia | 2500 |

**Para qué usarlo:** modelo por defecto del día a día. Es el único con visión.

> **Nota de compatibilidad:** los nombres `deepseek-v4-flash` y
> `deepseek-v4-flash-vision-exp` siguen aceptándose, pero están **retirados**: las
> peticiones se sirven con el Flash actual y se facturan a precio de Flash. No los uses
> en configuración nueva.

---

## 5. `think` y `effort` — cómo funcionan de verdad

### El interruptor `think`

Es un booleano real por modelo. Qwen Code declara esta capacidad para ambos:

```js
capabilities: { reasoning: {
  thinking: true,
  efforts: ["low", "high", "max"],
  defaultEffort: "high",
  disableField: "thinking"       // campo nativo que apaga el razonamiento
}}
```

- **ON** → el modelo emite razonamiento (`reasoning_content`) antes de responder.
- **OFF** → responde directo. Más barato y rápido, peor en problemas complejos.

**DeepSeek trae el razonamiento encendido por defecto en el servidor.** No basta con no
pedirlo: hay que apagarlo explícitamente. Qwen Code lo hace emitiendo
`thinking: {type: "disabled"}` cuando se pone `reasoning: false`.

**Efectos colaterales de tener thinking ON:**
- `temperature`, `presence_penalty` y `frequency_penalty` **no tienen efecto**.
- `top_p` queda con un mínimo forzado de `0.95`.

**Coste oculto (importante):** cuando el modelo usa herramientas, DeepSeek exige que el
`reasoning_content` de todos los turnos anteriores **se reenvíe y se concatene en el
contexto**; si no, devuelve **error 400**. Es decir, el pensamiento se paga en la
generación *y otra vez* como entrada en cada turno siguiente del bucle de herramientas.

### La escala `effort` está colapsada

En DeepSeek **solo hay dos peldaños reales**:

| Se elige en la UI | Llega a la API | Efecto |
| --- | --- | --- |
| `low` | `high` (normalizado) | **idéntico a `high`** |
| `high` | `high` | nivel por defecto |
| `max` | `max` | tier extra-fuerte (solo en `api.deepseek.com`) |

**Conclusión operativa: `low` no ahorra ni un token.** La decisión real es
`off` / `high` / `max`. No pierdas tiempo bajando a `low`.

### Trampa del estado persistido

El interruptor de la UI **escribe la preferencia en el archivo**, como
`model.reasoningEffort`. Consecuencia documentada: si esa preferencia queda en `none`
(`off`), **el interruptor ya no puede volver a encenderse** y hay que borrar la línea a
mano. Por eso en esta configuración:

- `deepseek-flash` **no fija** `reasoning` → el interruptor está libre (arranca ON).
- `deepseek-v4-pro` **fija** `effort: "max"` → el interruptor no aplica.

---

## 6. Costes

Precio por 1M tokens (USD). **Off-peak = la mitad.** Peak: 01:00–04:00 y 06:00–10:00 UTC, L–V.

| | flash off-peak | flash peak | pro off-peak | pro peak |
| --- | --- | --- | --- | --- |
| Entrada (acierto de caché) | $0,003 | $0,006 | $0,022 | $0,044 |
| Entrada (fallo de caché) | $0,15 | $0,30 | $0,66 | $1,32 |
| Salida | $0,60 | $1,20 | $1,98 | $3,96 |

- **Un acierto de caché es ~50× más barato** que un fallo. DeepSeek cachea el prefijo
  automáticamente: no reescribas el inicio del contexto sin necesidad.
- El razonamiento se factura como **salida**, que es el lado caro.

### Medición real de referencia

De una sesión grabada en esta máquina con `deepseek-v4-pro` (32 peticiones):

| Métrica | Valor |
| --- | --- |
| Entrada | 1.288.824 tokens |
| — en caché | 1.209.088 |
| Salida | 49.577 tokens |
| — **de pensamiento** | **36.281 (73% de la salida)** |

Coste ≈ **$0,355** a tarifa peak del pro, de los cuales **≈ $0,144 eran solo pensamiento**.

---

## 7. Hallazgos de seguridad (pendiente)

🔴 **La API key está en texto plano en `~/.qwen/settings.json`.** No existe `~/.qwen/.env`.

Mitigación recomendada:

```bash
# 1) Crear ~/.qwen/.env con la clave
echo 'DEEPSEEK_API_KEY=sk-...' > ~/.qwen/.env
chmod 600 ~/.qwen/.env
# 2) Borrar el bloque "env" de settings.json (envKey la leerá del entorno)
```

Si ese archivo se ha compartido o sincronizado, **rota la clave**.

---

## 8. Reglas de operación para el agente

1. **Trabaja en `deepseek-flash` + `think` OFF** para tareas mecánicas: renombrados,
   batch, búsquedas, ediciones simples.
2. **Sube a `deepseek-v4-pro`** solo para razonamiento complejo, y vuelve a flash después.
3. **Nunca uses `/effort low`** esperando ahorro: es un no-op en DeepSeek.
4. **Agrupa el trabajo en off-peak** si vas a lanzar cargas largas: mitad de precio.
5. **Usa `/compress-fast`** antes que `/compress` cuando el contexto se llene: el primero
   no gasta una llamada de IA; el segundo sí (resume con el modelo).
6. **Delega investigación pesada a subagentes** para no inflar el contexto principal.
7. **Imágenes: solo con `deepseek-flash`.** `pro` no las soporta. Además, DeepSeek
   **rechaza imágenes en mensajes `system` o `assistant`** (error 400): solo en `user`.
   Qwen Code lo respeta con `splitToolMedia` (activo por defecto).

---

## 9. Notas de implementación de Qwen Code

Detalles que afectan a este entorno concreto:

- **`modelProviders` se recarga en caliente** (el watcher tiene ~300 ms de debounce); no
  hace falta reiniciar, basta reabrir el selector de modelos. `providerProtocol` **sí**
  exige reinicio.
- **La capa `modelProviders[].generationConfig` es impermeable:** si un modelo está
  declarado ahí, los valores de `model.generationConfig` de nivel superior **se ignoran**
  por completo para ese modelo. Pon todo lo específico dentro de su entrada.
- **`samplingParams` es atómico y descarta `reasoning`:** si defines
  `generationConfig.samplingParams` en un proveedor OpenAI-compatible, el campo
  `reasoning` configurado **se pierde silenciosamente**. Si necesitas `temperature`,
  el knob de razonamiento va dentro de `samplingParams.reasoning_effort`.
- **Deduplicación por `id` + `baseUrl`:** dos entradas con el mismo `id` y el mismo
  `baseUrl` colisionan (gana la primera). Ids distintos con el mismo `baseUrl` conviven
  sin problema.
- **`low`/`medium` se reescriben a `high`** y `xhigh` a `max` en `api.deepseek.com`;
  una sobreescritura plana de `reasoning_effort` se envía sin normalizar.

---

## 10. Limitaciones de este documento

- La página oficial de precios de DeepSeek **no afirma explícitamente** que el
  razonamiento se facture como salida. En esta máquina, el registro de consumo muestra
  `totalTokens` = entrada + salida exactamente, con los tokens de pensamiento reportados
  aparte, lo que es coherente con esa facturación. Trátalo como muy probable, no como
  garantía contractual.
- La documentación de DeepSeek **no especifica** si el modo pensamiento es compatible con
  la entrada de imágenes. No se ha probado.
- Los precios y la disponibilidad de modelos cambian. Reverifica contra
  <https://api-docs.deepseek.com/quick_start/pricing> antes de sacar conclusiones de costo.
