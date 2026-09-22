/**
 * DATOS DE PRUEBA: rellenar la tabla con un escenario plausible para poder ver algo.
 *
 * QUE ES ESTE MODULO: el boton «generar datos de prueba». Escribe en las CELDAS de la tabla -no en el
 * diagrama- un escenario con las convenciones habituales de simulacion de procesos: tiempo de proceso
 * entre 5 y 45 min, fallo entre 1 y 30 %, retrabajo entre 5 y 30 min.
 *
 * POR QUE ESCRIBE EN LAS CELDAS Y NO EN EL BPMN: es la diferencia entre «proponer» y «sobrescribir».
 * Si escribiera en el diagrama, un clic accidental destruiria lo que el usuario tuviera sin
 * posibilidad de revisarlo antes. Escribiendo en las celdas, los valores quedan a la vista, se
 * corrigen a mano y solo entran al pulsar «Guardar todo»; y mientras tanto no se ha guardado nada.
 *
 * POR QUE ES UN MODULO Y NO UN METODO DEL PANEL: es la pieza con MAS trampas silenciosas de todo el
 * panel, y las dos son de las que no se ven mirando la pantalla:
 *
 *   - En FLUJOS, el reparto tiene que sumar 100 % EXACTO. El motor acumula las probabilidades, asi
 *     que una suma de 110 % manda el sobrante a la ultima rama: una salida configurada al 30 % acaba
 *     recibiendo el 70 %, y el usuario ve un resultado que no cuadra con lo que relleno el boton.
 *   - En TAREAS, la distribucion se fuerza a «fixed». Si quedara «triangular», el motor ignoraria el
 *     tiempo y tomaria min/moda/max, con lo que el valor generado no seria el que se usa.
 *
 * Ninguna de las dos cosas da error: dan una corrida plausible con el escenario equivocado. Por eso
 * el modulo devuelve un RESUMEN de lo que hizo -cuantas tareas, cuantas compuertas, que piscina- y no
 * un booleano: el mensaje que lee el usuario sale de aqui, y asi se prueba junto con la logica.
 */

/** Aleatorio entero en [min, max], ambos incluidos. */
export const azar = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Rellena la pestaña activa con un escenario de prueba.
 *
 * Devuelve un resumen para que el panel componga su aviso:
 * `{ aplica, motivo, filas, compuertas, pool }`. Con `aplica: false`, `motivo` explica por que no.
 *
 * `ctx` necesita: `tab`, `pools()`, `getElement(id)`, `refrescarSumas()`.
 */
export const generarDatosDePrueba = (contenedor, ctx) => {
  // Global y Recursos no tienen generador: en Global se declara la jornada y la tarifa -inventarlas
  // seria inventar el turno del cliente- y en Recursos la capacidad real de la planta.
  if (ctx.tab === 'global' || ctx.tab === 'resources') {
    return {
      aplica: false,
      motivo: 'Los datos de prueba aplican a Tareas y Flujos. '
        + 'En Global y Recursos define tu propio escenario.'
    };
  }

  // Solo las filas de la tabla principal: en Recursos hay subfilas de miembros que no tienen
  // `data-field`.
  const filas = Array.from(contenedor.querySelectorAll('tbody tr[data-el-id]'));
  if (!filas.length) {
    return { aplica: false, motivo: 'No hay filas que rellenar en esta pestaña.' };
  }

  if (ctx.tab === 'tasks') return rellenarTareas(filas, ctx);
  return rellenarFlujos(filas, contenedor, ctx);
};

function rellenarTareas(filas, ctx) {
  // Si hay piscinas dadas de alta, se asigna la primera a cada tarea con cantidad 1. Es lo que hace
  // que la simulacion EJERCITE el codigo de recursos -cola, espera, costo de espera-, que de otro
  // modo nunca se ejecuta porque nada escribia el campo `resources`.
  const pools = ctx.pools() || [];
  const pool = pools.length ? pools[0].name : null;

  filas.forEach((tr) => {
    const poner = (campo, valor) => {
      const el = tr.querySelector(`[data-field="${campo}"]`);
      if (el) el.value = valor;
    };

    // La distribucion se fija a «fixed» para que el valor generado sea el que se use: si quedara
    // «triangular», el motor ignoraria el tiempo y tomaria min/moda/max, y el usuario veria
    // resultados que no cuadran con lo que relleno el boton.
    poner('processingTime.distribution', 'fixed');
    poner('processingTime.value', azar(5, 45));
    poner('processingTime.unit', 'minutes');
    poner('failureRate', azar(1, 30));
    poner('reworkTime.value', azar(5, 30));
    poner('reworkTime.unit', 'minutes');

    // Carga de prueba: una tarea pesada y otra de arrastre, para que el informe tenga algo que
    // separar. Es lo que hace visible que las dos series NO se suman.
    const tirando = Math.random() < 0.5;
    poner('carga.masaCargadaKg', tirando ? azar(5, 25) : '');
    poner('carga.masaArrastradaKg', tirando ? '' : azar(40, 200));
    poner('carga.distanciaM', azar(2, 20));

    const selPool = tr.querySelector('[data-field="resources.pool"]');
    if (selPool && pool) {
      selPool.value = pool;
      const cant = tr.querySelector('[data-field="resources.quantityRequired"]');
      if (cant) {
        cant.disabled = false;
        cant.value = 1;
      }
    }
  });

  return { aplica: true, filas: filas.length, pool };
}

function rellenarFlujos(filas, contenedor, ctx) {
  // El reparto se reparte por COMPUERTA en porcentajes ENTEROS que suman 100 exactos. Generarlos
  // sueltos seria peor que no generarlos, por lo dicho arriba: el motor acumula y el sobrante va a
  // la ultima rama.
  const porCompuerta = new Map();
  filas.forEach((tr) => {
    const el = ctx.getElement(tr.dataset.elId);
    if (!el || !el.source) return;
    const lista = porCompuerta.get(el.source.id) || [];
    lista.push(tr);
    porCompuerta.set(el.source.id, lista);
  });

  let compuertas = 0;

  porCompuerta.forEach((lista) => {
    // Solo las filas editables: una compuerta de una sola salida esta fija al 100 % y no participa.
    const campos = lista
      .map((tr) => tr.querySelector('[data-field="branchingProbability"]'))
      .filter((campo) => campo && !campo.disabled);
    if (!campos.length) return;
    compuertas++;

    let resto = 100;
    campos.forEach((campo, i) => {
      const restantes = campos.length - 1 - i;
      let p;

      if (restantes === 0) {
        // El ultimo absorbe el resto: asi la suma es exacta SIEMPRE, que es la razon de repartir en
        // orden en vez de sortear cada valor por su cuenta.
        p = resto;
      } else {
        // Se reserva al menos 1 % para cada salida que queda, para no crear ramas muertas (al 0 %
        // nunca se toman).
        const tope = Math.max(1, resto - restantes);
        p = Math.min(tope, Math.max(1, Math.round(Math.random() * tope * 0.7)));
      }

      resto -= p;
      campo.value = String(p);
    });
  });

  ctx.refrescarSumas();

  return { aplica: true, filas: filas.length, compuertas };
}
