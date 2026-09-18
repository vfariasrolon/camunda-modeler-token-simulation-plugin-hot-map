/**
 * El ID visible de cada tarea: un numero corto (1, 2, 3...) para medir en planta.
 *
 * Por qué existe: el `id` tecnico del BPMN (`Activity_1a2b3`) identifica sin
 * ambiguedad, pero nadie lo va a escribir en un papel ni en un cronometro. Y el
 * `nombre` tampoco sirve como clave: dos operarios escriben «Inspeccion» e
 * «Inspección» y la fusion de mediciones une lo que no debe.
 *
 * Se mantienen TRES cosas, con papeles distintos:
 *   - `id`      -> el del XML. Inmutable, es la clave de fusion.
 *   - `idCorto` -> etiqueta visible. SE DERIVA; no se teclea nunca.
 *   - `nombre`  -> para leer en pantalla.
 *
 * El orden es el del FLUJO (desde el evento de inicio), no el de la pantalla:
 * mover una figura no puede renumerar el proceso, y asi el numero coincide con
 * el orden en que se recorre el proceso midiendo.
 *
 * El recorrido esta protegido contra ciclos y contra nodos sin salida: un
 * diagrama real tiene bucles de retrabajo, y una cola sin procesar dejaria
 * tareas sin numerar.
 */

/** Tipos que reciben numero. Solo tareas: los eventos y compuertas no se miden. */
const ES_TAREA = (element) => Boolean(element) && element.$type === 'bpmn:Task';

/**
 * Recorrido en anchura desde las tareas de inicio, para que el numero siga el
 * orden de ejecucion.
 *
 * Se empieza por TODAS las tareas sin entrantes (no solo por el evento de
 * inicio): un subproceso o un fragmento sin evento de inicio tambien tiene que
 * numerarse, y si no, se quedaria fuera en silencio.
 */
function ordenDeFlujo(tareas) {
  const porId = new Map(tareas.map((t) => [ t.id, t ]));
  const salidas = new Map(tareas.map((t) => [ t.id, [] ]));

  for (const t of tareas) {
    for (const flujo of (t.outgoing || [])) {
      const destino = flujo.target;
      if (destino && porId.has(destino.id)) salidas.get(t.id).push(destino.id);
    }
  }

  const entrantes = new Map(tareas.map((t) => [ t.id, 0 ]));
  for (const t of tareas) {
    for (const flujo of (t.incoming || [])) {
      const origen = flujo.source;
      if (origen && porId.has(origen.id)) entrantes.set(t.id, entrantes.get(t.id) + 1);
    }
  }

  const orden = [];
  const visitados = new Set();
  const cola = tareas.filter((t) => entrantes.get(t.id) === 0).map((t) => t.id);

  // Si NADA es raiz (un ciclo cerrado sin entradas), se arranca por el primer
  // elemento para no devolver una lista vacia.
  if (!cola.length && tareas.length) cola.push(tareas[0].id);

  while (cola.length) {
    const id = cola.shift();
    if (visitados.has(id)) continue;
    visitados.add(id);
    orden.push(id);

    const siguientes = salidas.get(id) || [];
    for (const s of siguientes) {
      if (!visitados.has(s)) cola.push(s);
    }

    // Los nodos que se quedaron sin arranque propio (dentro de un ciclo) entran
    // en cuanto se visita su primero, y los que no, al final.
    if (!cola.length) {
      const pendiente = tareas.find((t) => !visitados.has(t.id));
      if (pendiente) cola.push(pendiente.id);
    }
  }

  return orden;
}

/**
 * Numera las tareas por orden de flujo.
 *
 * @param {Array} tareas elementos de bpmn-js (con `id`, `incoming`, `outgoing`)
 * @returns {Map<string, number>} id tecnico -> numero corto (1..n)
 */
export function numerarTareas(tareas) {
  const numeros = new Map();
  const validas = (tareas || []).filter(ES_TAREA);
  ordenDeFlujo(validas).forEach((id, i) => numeros.set(id, i + 1));
  return numeros;
}

/** Numero corto de una tarea, o null si no es una tarea numerable. */
export function idCortoDe(tareas, idTecnico) {
  const numeros = numerarTareas(tareas);
  return numeros.has(idTecnico) ? numeros.get(idTecnico) : null;
}

/**
 * Etiqueta legible de una tarea: «1 · Cortar».
 *
 * Cae al nombre y, si tampoco hay, al id tecnico: una etiqueta vacia seria peor
 * que el id crudo, porque pareceria que la tarea no tiene identidad.
 */
export function etiquetaDe(tarea, numero) {
  const nombre = (tarea && ((tarea.businessObject && tarea.businessObject.name) || tarea.name)) || null;
  const n = numero == null ? null : String(numero);

  if (n && nombre) return `${n} · ${nombre}`;
  if (n) return n;
  return nombre || (tarea && tarea.id) || '?';
}
