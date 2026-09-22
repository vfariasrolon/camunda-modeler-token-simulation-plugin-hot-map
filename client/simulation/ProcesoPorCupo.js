/**
 * PROCESO POR CUPO: N piezas a la vez, y salen las N juntas.
 *
 * ===========================================================================
 * ESTADO: CONECTADO AL MOTOR Y FUNCIONANDO.
 * ===========================================================================
 *
 * Este modulo decide CUANDO arranca un cupo y CON CUANTAS piezas; el motor lo usa
 * desde `SimulationEngine._acumularEnCupo`. Se edita en la pestana Tareas -columnas
 * «Cupo» y «Arranque del cupo»- y viaja en el CSV como `cupo` y `arranque_cupo`.
 *
 * COMO ESTA CONECTADO, porque el mecanismo importa: la tanda es una COLA.
 *
 *   1. Cada pieza que llega a la tarea se acumula en una lista de espera.
 *   2. Cuando la politica dice que arranca, sale la PRIMERA como LIDER y el resto se
 *      APARCA.
 *   3. La lider se procesa normal: pide el recurso, paga el tiempo y el coste.
 *   4. Al terminar, suelta a las aparcadas: cada una cierra su instancia EN ESE
 *      INSTANTE, sin volver a trabajar ni a costear, y sigue su camino. La tarea
 *      siguiente las despacha de una en una, que es lo que el motor ya sabia hacer.
 *
 * NO HAY NINGUN `for` NI `while` EN ESTA INTEGRACION, y es a proposito: en un motor
 * de eventos discretos el tiempo avanza por SALTOS, no por iteraciones. La tanda no
 * «recorre» sus piezas: programa UN evento al final del cupo y el reloj salta hasta
 * el. Un bucle que disparara N eventos a la vez rompe esa invariante -cada evento se
 * procesa solo- y es exactamente lo que produjo los tres bugs silenciosos del primer
 * intento, que se revirtio.
 *
 * EL BUG QUE COSTO MAS CARO, para no repetirlo: la lista de acompanantes tiene que
 * sobrevivir TRES SALTOS -el marcador de la cola del recurso, el re-arranque que hace
 * `release()`, y el evento de fin-. Si se pierde en cualquiera, las acompanantes se
 * quedan aparcadas para siempre y la corrida termina con menos piezas que instancias
 * SIN NINGUN ERROR. La comprobacion que lo caza es `completadas === runValue`.
 *
 * ===========================================================================
 *
 * QUE ES, Y EN QUE SE DIFERENCIA DE LO QUE YA HABIA:
 *
 *   - `quantityRequired` es «esta tarea consume N unidades del recurso para UNA pieza»: una
 *     maquina que necesita dos operarios. Mas recursos para el mismo trabajo.
 *   - Los LOTES agrupan N piezas y las procesan EN SECUENCIA, una tras otra.
 *   - ESTO es N piezas procesadas SIMULTANEAMENTE y liberadas a la vez: un horno que mete 20
 *     tabletas y las saca todas juntas, una tina de galvanizado, un carro de transporte que se
 *     llena antes de moverse.
 *
 * EL TIEMPO ES EL DEL LOTE COMPLETO, no el de una pieza. Un horno que tarda 100 minutos en
 * procesar 20 piezas NO tarda 2 000: tarda 100, y las 20 salen al mismo tiempo. Eso da un tiempo
 * de ciclo POR PIEZA de 100/20 = 5 minutos, que es lo que hace que el proceso sea barato -y la
 * razon de que existan los hornos-.
 *
 * LA CONSECUENCIA QUE HAY QUE ENTENDER, y por la que esto no es solo «dividir»: una pieza
 * individual puede esperar hasta el tiempo entero del lote. Si llega justo despues de que el horno
 * arranco, espera los 100 minutos completos. Su tiempo de CICLO es 5 min de media, pero su ESPERA
 * no: el cupo mejora el throughput y empeora la latencia, y las dos cosas se informan.
 *
 * ESTE MODULO ES PURO: decide si un cupo arranca y cuanto dura. No toca el motor ni el reloj, asi
 * que el arnes comprueba las tres politicas de arranque sin simular nada.
 */

/** Las dos politicas de arranque que puede declarar una tarea. */
export const ARRANCA_AL_LLENAR = 'lleno';
export const ARRANCA_CON_LO_QUE_HAYA = 'inmediato';

/**
 * ¿Arranca ya el cupo, o hay que esperar a mas piezas?
 *
 * LAS DOS POLITICAS SON CASOS REALES, y por eso las elige la TAREA y no el motor:
 *
 *   - `lleno` (esperar a llenar): un CARRO DE TRANSPORTE. Moverlo a medio cargar es tirar un
 *     viaje: se espera a tener el cupo. Genera una espera de formacion de lote, que aparece en el
 *     informe como espera propia de la tarea.
 *   - `inmediato` (arrancar con lo que haya): un HORNO que no puede quedarse encendido sin carga.
 *     Si hay 7 piezas y el cupo es 20, se procesan las 7.
 *
 * Devuelve `{ arranca, motivo }`: `motivo` es para el informe, porque «esperando a llenar» y
 * «esperando un recurso» son dos diagnósticos distintos que hoy se verian igual.
 */
export const decidirArranqueDeCupo = ({ politica, enEspera, cupo, esUltimaTanda }) => {
  const n = Math.max(0, Number(enEspera) || 0);
  const tam = Math.max(1, Number(cupo) || 1);

  if (n <= 0) return { arranca: false, motivo: 'sin piezas en espera', tanda: 0 };

  // LA ULTIMA TANDA NO ESPERA A LLENAR. Sin esta regla, un carro que espera 20 piezas con un
  // pedido de 15 NO ARRANCA NUNCA y la corrida termina con 15 piezas sin mover: el motor no
  // tendria de donde sacar las 5 que faltan y el trabajo quedaria atascado para siempre.
  //
  // Y TAMBIEN SE RECORTA AL CUPO: la ultima tanda sigue siendo una tanda, asi que no puede
  // procesar mas piezas de las que caben. Sin el `min`, un pedido de 25 con cupo 20 metia 25 en
  // el horno de una vez.
  if (esUltimaTanda) return { arranca: true, motivo: 'última tanda: no hay más piezas por llegar', tanda: Math.min(n, tam) };

  if (politica === ARRANCA_CON_LO_QUE_HAYA) {
    // El cupo es el TECHO, no solo el objetivo: un horno de 20 piezas no puede meter 25. Se
    // recorta igual que en la politica de llenado, y el resto queda para la siguiente tanda.
    return { arranca: true, motivo: 'arranca con lo que haya', tanda: Math.min(n, tam) };
  }

  // Politica `lleno`: solo arranca al alcanzar el cupo.
  if (n >= tam) return { arranca: true, motivo: 'cupo completo', tanda: tam };

  return { arranca: false, motivo: `esperando a llenar el cupo (${n} de ${tam})`, tanda: 0 };
};

/**
 * El tiempo de ciclo POR PIEZA de un cupo, que no es el tiempo del cupo.
 *
 * ES LA CIFRA QUE EXPLICA POR QUE EXISTE EL PROCESO POR CUPO: 100 minutos para 20 piezas son 5
 * minutos por pieza. Pero se calcula y se informa APARTE del tiempo del cupo, porque confundirlos
 * es el error que hace parecer que un horno es 20 veces mas lento de lo que es.
 */
export const cicloPorPieza = (tiempoDelCupo, tamanoDeLaTanda) => {
  const t = Number(tiempoDelCupo) || 0;
  const n = Number(tamanoDeLaTanda) || 0;
  if (n <= 0) return null;
  return t / n;
};

/**
 * La espera de formacion de lote: lo que una pieza aguanta hasta que el cupo arranca.
 *
 * POR QUE HAY QUE MEDIRLA Y NO DEJARLA IMPLICITA: es el precio del cupo, y es invisible si solo se
 * informa el tiempo de ciclo. Una tina que espera a 30 piezas puede dar un ciclo por pieza
 * excelente y tener a la primera pieza esperando una hora. El informe tiene que poder enseñar las
 * dos caras o el lector optimizara la equivocada.
 */
export const esperaDeFormacion = (llegoEn, arrancoEn) => {
  const a = Number(llegoEn);
  const b = Number(arrancoEn);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, b - a);
};

/**
 * Valida la configuracion de un cupo declarada en la tarea.
 *
 * Devuelve la lista de problemas -vacia si esta bien-. Se valida ANTES de simular porque un cupo
 * mal puesto no da error: da una corrida plausible con el proceso equivocado. Un cupo de 1 es
 * «una pieza a la vez», que es el comportamiento de siempre, y se acepta a proposito.
 */
export const problemasDeCupo = ({ cupo, politica, tiempoDelCupo }) => {
  const problemas = [];
  const n = Number(cupo);

  if (!Number.isFinite(n)) {
    problemas.push('el cupo tiene que ser un número');
  } else if (!Number.isInteger(n) || n < 1) {
    problemas.push(`el cupo debe ser un entero ≥ 1 (has puesto ${cupo})`);
  }

  if (politica !== ARRANCA_AL_LLENAR && politica !== ARRANCA_CON_LO_QUE_HAYA) {
    problemas.push(`la política de arranque debe ser «${ARRANCA_AL_LLENAR}» o `
      + `«${ARRANCA_CON_LO_QUE_HAYA}» (has puesto ${politica})`);
  }

  const t = Number(tiempoDelCupo);
  if (!Number.isFinite(t) || t <= 0) {
    problemas.push('el tiempo del cupo tiene que ser mayor que 0');
  }

  return problemas;
};
