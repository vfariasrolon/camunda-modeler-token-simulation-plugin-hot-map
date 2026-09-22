/**
 * LA AYUDA DEL EDITOR DE DATOS: el contenido y los «?».
 *
 * QUE ES ESTE MODULO: los textos que explican cada columna y cada pestaña, y la logica de abrir y
 * cerrar los desplegables. Son tres piezas que ya existian separadas en el archivo -`AYUDA_PESTANA`,
 * `AYUDA_COLUMNAS` y cinco metodos de bind y toggle- y que aqui quedan juntas porque son la misma
 * cosa: lo que el usuario lee cuando no sabe que poner.
 *
 * POR QUE MERECE UN MODULO: la ayuda es la unica parte del plugin que puede MENTIR sin que nada se
 * rompa. Un texto que describe un campo que ya no existe, o que dice «en minutos» cuando el motor lee
 * milisegundos, no da ningun error: da un diagrama mal configurado y un usuario convencido de haber
 * hecho lo correcto. Sacarla aparte permite comprobar los textos programaticamente -que cada columna
 * con ayuda tenga columna, que cada campo con ayuda exista-, que es lo que hace el arnes
 * `11-textos-sin-mentir` con el resto de la interfaz.
 *
 * NO TOCA bpmn-js NI EL MOTOR: son textos y clases CSS.
 *
 * LA REGLA DE REDACCCION, que se respeta en TODOS los textos: cada cosa se explica en TRES partes y
 * en este orden.
 *
 *   1. `campos`: que se declara aqui, para saber que se puede rellenar.
 *   2. `mide`: que se puede MEDIR con esos datos, que es la pregunta real del analista.
 *   3. `ojo`: la trampa que mas cara sale si se ignora, y siempre con la CONSECUENCIA.
 *
 * Decir solo «que campos hay» no ayuda: el usuario no quiere la lista de campos, quiere saber para
 * que le sirven. Por eso `mide` va antes que `ojo`, y `ojo` explica siempre lo que pasa, no la regla.
 */

/**
 * Ayuda de cada pestaña. `campos` es `[titulo, texto][]` y `mide`/`ojo` son listas de frases.
 */
export const AYUDA_PESTANA = {
  tasks: {
    titulo: 'Tareas: ritmo, calidad y carga física de cada paso',
    campos: [
      [ 'Distribución', 'fija (un valor) o triangular (mín/moda/máx). Decide qué columnas se leen.' ],
      [ 'Tiempo y unidad', 'la duración base. Con triangular, el campo «Tiempo» se IGNORA.' ],
      [ 'Tasa de fallo y retrabajo', 'probabilidad de fallo por ejecución y el tiempo que se añade al repetir.' ],
      [ 'Recurso y Cant.', 'la piscina que consume y cuántas unidades toma a la vez.' ],
      [ 'Frecuencia', 'por token (una vez por pieza) o por lote (una vez por lote).' ],
      [ 'Barrera', 'quien firma: probabilidad de atender, espera si no atiende, y tolerancia.' ],
      [ 'Carga física', 'masa cargada (la que soporta), masa arrastrada (la que desliza) y distancia.' ],
      [ 'Habilidad', 'la que exige la tarea (una etiqueta; varias, separadas por comas).' ]
    ],
    mide: [
      'Con tiempo y unidad: <strong>coste, tiempo de ciclo y sus percentiles</strong> (p50/p95).',
      'Añadiendo recurso: <strong>esperas en cola, utilización (ρ) y cuello de botella</strong>.',
      'Añadiendo fallo y retrabajo: <strong>calidad y su impacto en el ciclo</strong>.',
      'Con frecuencia y barrera: <strong>ciclo de lote, parones y esperas de firma</strong>.',
      'Con masa y distancia: <strong>toneladas movidas y kg·m</strong>, separando lo cargado de lo arrastrado.',
      'Con habilidad y piscinas con nombres: <strong>bloqueo por habilidad</strong> y quién podría absorber la tarea.'
    ],
    ojo: [
      'La <strong>unidad</strong> se escribe en plural (<code>minutes</code>): un <code>minute</code> se interpretaría como milisegundos, un factor de 60 000, y sin ningún aviso.',
      'La masa se aplica según la <strong>frecuencia</strong>: una tarea «por lote» mueve su peso <em>una vez por lote</em>. Si no fuera así, 12 kg por pieza en un lote de 20 darían 240 kg cuando en planta se hizo un solo viaje.',
      '<strong>Deja la carga vacía</strong> si no aplica. Un 0 dice «no mueve peso»; vacío dice «no lo sabemos», y el diagnóstico los distingue.'
    ]
  },
  flows: {
    titulo: 'Flujos: el reparto de cada compuerta',
    campos: [
      [ 'Probabilidad (%)', 'el reparto de las salidas de una compuerta <strong>exclusiva</strong>.' ]
    ],
    mide: [
      'La <strong>mezcla de caminos</strong>: cuántos casos van por cada rama, y con eso el volumen y el coste por camino.'
    ],
    ojo: [
      'El reparto de cada compuerta <strong>debe sumar 100 %</strong>: el motor acumula y manda todo el sobrante a la última rama sin avisar. El guardado lo bloquea.',
      'Al cambiar una salida, <strong>las demás se ajustan solas</strong> (a partes iguales si estaban iguales, en proporción si no).',
      'Una compuerta de <strong>una sola salida</strong> aparece fija al 100 %: el motor siempre la toma y no lee su probabilidad.'
    ]
  },
  resources: {
    titulo: 'Recursos: las piscinas de unidades equivalentes',
    campos: [
      [ 'Nombre', 'el de la piscina. Debe ser único.' ],
      [ 'Cantidad', 'cuántas unidades idénticas hay (personas, máquinas, vehículos).' ],
      [ 'Miembros (A5)', 'opcional: nombres con tarifa, habilidades y carga máxima dentro de la piscina.' ]
    ],
    mide: [
      'Con la cantidad: <strong>utilización (ρ), colas y cuello de botella</strong>, que es lo que dice si el plan cabe en la plantilla.',
      'Con miembros con nombre (A5): <strong>quién trabaja, cuánto tiempo y qué carga movió</strong>, más el <strong>bloqueo por habilidad</strong> y el diagnóstico de absorción.'
    ],
    ojo: [
      'La cantidad es <strong>capacidad</strong>: los miembros con nombre no la cambian, solo dan identidad y tarifa.',
      'Una tarea que apunta a una piscina que no existe <strong>ignora el recurso en silencio</strong>. Por eso la columna «Recurso» de Tareas es un desplegable y no texto libre.'
    ]
  },
  global: {
    titulo: 'Global: el reloj, el coste y las reglas',
    campos: [
      [ 'Tasa de llegada', 'llegadas por unidad de tiempo. Es una TASA, no un intervalo.' ],
      [ 'Tarifa y coste de espera', 'lo que cuesta la hora trabajada y la hora en cola.' ],
      [ 'Jornada, descansos y arranque', 'el reloj real: tramos, pausas y arranque lento.' ],
      [ 'Horas extra', 'el cupo semanal y sus multiplicadores (LFT arts. 66 y 68).' ],
      [ 'Lotes y semilla', 'llegadas en serie y reproducibilidad de la corrida.' ],
      [ 'Reglas laborales (A2)', 'turno, topes del art. 65, primas de domingo y festivo, y sus vigencias.' ]
    ],
    mide: [
      'Con la jornada y los descansos: <strong>capacidad real</strong>, sin inflarla (una jornada de 8 h no son 8 h de trabajo).',
      'Con el cupo y las primas: <strong>coste real con horas extra</strong> y su reparto doble/triple.',
      'Con las reglas laborales: <strong>cumplimiento de la LFT</strong> — cuántas semanas se pasaron del tope, y por cuánto.',
      'Con la semilla: <strong>reproducibilidad y comparación limpia</strong> entre planes (mismo azar para los dos).'
    ],
    ojo: [
      'La tasa de llegada es <strong>una tasa</strong>: <code>60</code> por <code>minute</code> es una llegada por <em>segundo</em>, no una cada 60 minutos.',
      'Sin <strong>evento raíz</strong> la simulación no arranca, aunque todo lo demás esté relleno.'
    ]
  }
};

/**
 * Ayuda de cada columna de la tabla de Tareas y de la de Flujos.
 *
 * La clave es la misma que la del `data-ayuda-col` de la cabecera. El arnes comprueba que cada clave
 * de aqui exista como columna y al reves, que es lo que impide que un texto quede huerfano al
 * renombrar una columna.
 */
export const AYUDA_COLUMNAS = {
  tarea: 'El nombre de la tarea en el diagrama. Es solo lectura: se cambia en el diagrama, no aqui.',
  distribucion: 'fija (un solo valor) o triangular (min/moda/max). Decide que columnas de tiempo se leen: con triangular, la columna «Tiempo» se IGNORA.',
  tiempo: 'La duracion base. Con distribucion «fija» es el valor unico; con triangular no se lee.',
  unidad: 'minutes, hours o seconds, siempre en PLURAL. Un «minute» en singular se interpretaria como milisegundos: un error de 60 000 veces y sin ningun aviso.',
  tiempoMin: 'Solo con triangular: el tiempo mas corto observado. Tiene que ser menor o igual que la moda.',
  tiempoModa: 'Solo con triangular: el tiempo MAS PROBABLE, no la media. Tiene que quedar entre el minimo y el maximo.',
  tiempoMax: 'Solo con triangular: el tiempo mas largo observado. Tiene que ser mayor o igual que la moda.',
  tasaFallo: 'Probabilidad de fallo por ejecucion, en PORCENTAJE: 5 significa que falla 5 de cada 100. El motor lo guarda como 0,05.',
  retrabajo: 'Lo que se tarda en rehacer una pieza que fallo. Se suma al tiempo de ciclo.',
  unidadRetrabajo: 'La unidad del retrabajo, en plural. Puede ser distinta de la del proceso.',
  recurso: 'La piscina que consume la tarea. Tiene que existir en la pestaña Recursos: un nombre que no exista hace que el recurso se ignore EN SILENCIO.',
  cant: 'Cuantas unidades de la piscina toma la tarea a la vez. Con 2, ocupa dos personas mientras dura.',
  frecuencia: 'por token (una vez por pieza) o por lote (una sola vez por lote). Decide si el tiempo y la carga se aplican por pieza o por lote.',
  barrera: 'Solo con «por lote»: quien firma el lote. disp. es la probabilidad de que atiendan; si no atienden, se espera una triangular min/moda/max; tol. es cuanto se tolera antes de marcarlo.',
  carga: 'Opcional. Cargada es la masa que SOPORTA la persona; arrastrada, la que desliza. Se aplican segun la frecuencia: por pieza o una vez por lote.',
  habilidad: 'La etiqueta que exige la tarea (por ejemplo soldadura). Si ningun miembro de la piscina la tiene, la tarea queda BLOQUEADA y el informe lo dice. Solo se ofrecen las que estan dadas de alta en los recursos, para que no se pueda exigir una que nadie tiene.',
  miembro: 'El miembro CONCRETO que hace esta tarea, si solo la puede hacer esa persona. Con un nombre, la tarea ESPERA a ese miembro aunque otro esté libre (es una restricción, no una preferencia). Sin nombre, el motor elige de la piscina por turnos, que es el comportamiento de siempre. Solo se ofrecen los miembros de la piscina elegida.',
  cupo: 'Cuantas piezas procesa la tarea A LA VEZ, liberadas juntas: un horno que mete 20 tabletas y las saca todas de golpe. El «Tiempo» es el del CUPO COMPLETO y no el de una pieza: 100 minutos para 20 piezas son 5 minutos de ciclo por pieza, no 2000 minutos. Vacío o 1 significa «una pieza a la vez», que es lo de siempre. NO confundir con «Cant.»: allí son N recursos para UNA pieza (una máquina con dos operarios); aquí es UNA plaza que retiene N piezas.',
  arranqueCupo: 'Cuándo arranca el cupo. «Esperar a llenar» es el carro de transporte: moverlo a medio cargar es tirar un viaje, así que se espera. «Arrancar con lo que haya» es el horno que no puede quedarse encendido sin carga: si hay 7 piezas y el cupo es 20, procesa las 7. La última tanda arranca siempre, aunque no se llene: si esperara, las piezas se quedarían sin procesar para siempre.'
};

// ---------------------------------------------------------------------------
// Los «?»: abrir y cerrar
// ---------------------------------------------------------------------------

/**
 * Enlaza los «?» de la cabecera de la tabla.
 *
 * `mostrar(clave)` se llama con la clave de la columna pulsada. El resaltado del boton lo decide el
 * panel: es el unico que sabe si el «?» es de una columna o de un campo, y el toggle necesita saber
 * cual quedo visible.
 */
export const enlazarAyudaDeColumnas = (contenedor, mostrar) => {
  contenedor.querySelectorAll('.btn-ayuda-col').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      mostrar(btn.dataset.ayudaCol);
    });
  });
};

/**
 * Muestra la ayuda de una columna en la fila compartida bajo la cabecera.
 *
 * Volver a pulsar el MISMO «?» la repliega, para poder cerrarla sin buscar otra columna. Pulsar otro
 * la cambia, que es lo que se espera al ir comparando columnas. Devuelve la clave que quedo visible,
 * o `null` si se replego: el panel lo usa para marcar el boton.
 */
export const alternarAyudaDeColumna = (contenedor, clave) => {
  const fila = contenedor.querySelector('.fila-ayuda-col');
  if (!fila) return null;

  const celda = fila.querySelector('td');
  const texto = AYUDA_COLUMNAS[clave] || '';
  const yaVisible = !fila.classList.contains('hidden');

  if (yaVisible && celda.textContent === texto) {
    fila.classList.add('hidden');
    return null;
  }

  celda.textContent = texto;
  fila.classList.remove('hidden');
  return clave;
};

/** Deja marcado el «?» de la columna cuya ayuda esta a la vista. */
export const marcarAyudaDeColumna = (contenedor, clave) => {
  contenedor.querySelectorAll('.btn-ayuda-col').forEach((b) => {
    if (b.dataset.ayudaCol === clave) b.classList.add('activo');
    else b.classList.remove('activo');
  });
};

/**
 * Enlaza los «?» que van al lado de cada campo del formulario global.
 *
 * POR QUE AL LADO DEL CAMPO Y NO UN TEXTO FIJO: con 30 campos, un parrafo por campo llena la
 * pantalla y se acaba ignorando. El «?» se pulsa en el momento de la duda, que es exactamente cuando
 * se lee. Y va con clic y no con `data-tip` (que es hover) porque en un desplegable o en una casilla
 * el hover no llega.
 */
export const enlazarAyudaPorCampo = (alcance) => {
  alcance.querySelectorAll('.btn-ayuda-campo').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e && e.preventDefault) e.preventDefault();
      const caja = alcance.querySelector(`[data-ayuda-de="${btn.dataset.ayuda}"]`);
      if (!caja) return;

      if (caja.classList.contains('hidden')) {
        caja.classList.remove('hidden');
        btn.classList.add('activo');
      } else {
        caja.classList.add('hidden');
        btn.classList.remove('activo');
      }
    });
  });
};

/**
 * Pinta el cuerpo de la ayuda de una pestaña.
 *
 * Se redibuja en cada llamada porque el contenido depende de la PESTANA, y la pestana puede haber
 * cambiado desde la ultima vez. Quien la abre y la cierra con una clase es el panel, para que el
 * usuario no tenga que reabrirla al cambiar de tab.
 *
 * Devuelve el HTML, o `''` si la pestaña no tiene ayuda declarada.
 */
export const htmlDeAyuda = (tab) => {
  const a = AYUDA_PESTANA[tab];
  if (!a) return '';

  const listas = (items, clase) => `<ul class="${clase}">${items.map((i) => (
    Array.isArray(i) ? `<li><strong>${i[0]}</strong>: ${i[1]}</li>` : `<li>${i}</li>`
  )).join('')}</ul>`;

  return `
    <h4>${a.titulo}</h4>
    <div class="columnas">
      <div>
        <h5>Qué se declara aquí</h5>
        ${listas(a.campos, 'campos')}
      </div>
      <div>
        <h5>Qué se puede medir con estos datos</h5>
        ${listas(a.mide, 'mide')}
      </div>
    </div>
    <h5 class="ojo-titulo">Lo que hay que tener presente</h5>
    ${listas(a.ojo, 'ojo')}
  `;
};
