/**
 * LA RUTA DOMINANTE y LA CUOTA DE CADA RAMA.
 *
 * EL PROBLEMA QUE RESUELVE, con un caso real medido: un diagrama con una compuerta 80/20 y 7000
 * casos. El tronco lleva 7000 tokens (el 100 %) y cada rama lleva 5600 y 1400. Al colorear por
 * VOLUMEN, la banda mas caliente se la lleva el tronco -que no decide nada- y la rama que de
 * verdad elige el trafico se queda en el segundo color. El reporte del usuario fue exacto:
 * «deberia verse en rojo el camino mas usado pero se sigue viendo un poco mas diferente».
 *
 * Y no es casualidad de ese diagrama: en una conexion SECUENCIAL el valor es igual al de la
 * anterior, asi que el tronco TIENE el maximo por construccion. El rojo se lo lleva siempre la
 * parte que no decide nada. Ese es el fallo de fondo, y aqui se arregla por dos vias:
 *
 *   1. `cuotasDeRama`: el color pasa a decir QUE PORCENTAJE de los tokens que llegaban a ese
 *      punto tomaron esta salida. En una compuerta es la probabilidad de la rama («80 % por
 *      aqui, 20 % por alla»), que es lo que un consultor enuncia en voz alta. En una conexion
 *      secuencial es el 100 %, y eso es correcto: por ahi paso todo.
 *
 *   2. `rutaDominante`: el CAMINO mas usado, recorrido de punta a punta eligiendo en cada
 *      compuerta la salida con mas tokens. Eso es lo que se resalta con un halo, porque un
 *      color por si solo no dice «estas conexiones forman UN camino».
 *
 * ESTE MODULO ES PURO: recibe flujos ya normalizados a `{ id, desde, hasta }` y una funcion de
 * valor, y devuelve ids y numeros. No toca bpmn-js ni el DOM, asi que el arnes comprueba el
 * RECORRIDO -que es donde un fallo no se ve mirando el dibujo: una ruta mal recorrida se pinta
 * igual de bonita que una correcta- sin navegador.
 */

/**
 * Normaliza los flujos de bpmn-js a la forma plana que usa este modulo.
 *
 * Se trabaja con IDS y no con los objetos del elemento: asi el modulo no depende de la forma de
 * bpmn-js -donde `source` es un elemento entero, no un id- y el arnes puede montar sus flujos a
 * mano sin fabricar medio diagrama.
 */
export const normalizarFlujos = (flujos) => (flujos || [])
  .map((f) => ({
    id: f && f.id,
    desde: f && f.source ? f.source.id : null,
    hasta: f && f.target ? f.target.id : null
  }))
  .filter((f) => f.id && f.desde && f.hasta);

/**
 * Cuota de cada conexion: que fraccion de los tokens que SALIERON de su nodo de origen tomaron
 * esta salida.
 *
 * POR QUE SE MIDE CONTRA LA SALIDA DEL NODO y no contra el total del proceso: porque la pregunta
 * es «en este punto, por donde se fue el trabajo». Dividir por el total haria que una compuerta
 * con poco trafico pareciera poco importante aunque el 100 % de lo que llega tome una sola
 * rama, que es justo el hallazgo a ver.
 *
 * Un nodo cuyas salidas suman 0 no tiene cuota: devuelve `null`, y quien pinta decide (las
 * conexiones sin trafico van en gris aparte, no en la escala).
 */
export const cuotasDeRama = (flujos, valorDe) => {
  const cuotas = new Map();
  const salidaPorNodo = new Map();

  flujos.forEach((f) => {
    if (!salidaPorNodo.has(f.desde)) salidaPorNodo.set(f.desde, []);
    salidaPorNodo.get(f.desde).push(f);
  });

  salidaPorNodo.forEach((salidas) => {
    const total = salidas.reduce((a, f) => a + Math.max(0, valorDe(f.id) || 0), 0);
    salidas.forEach((f) => {
      const valor = Math.max(0, valorDe(f.id) || 0);
      // Sin trafico en ninguna salida no hay cuota que repartir: `null` y no 0, porque 0
      // afirmaria «paso el 0 % de los tokens» cuando lo cierto es «no paso nada por aqui».
      cuotas.set(f.id, total > 0 ? valor / total : null);
    });
  });

  return cuotas;
};

/**
 * Los nodos por los que se ENTRA al proceso: los que son origen de alguna conexion y destino de
 * ninguna. Es mas robusto que buscar un `bpmn:StartEvent`, porque un diagrama puede tener el
 * inicio dentro de un subproceso o varios inicios a la vez.
 */
export const entradasDe = (flujos) => {
  const destinos = new Set(flujos.map((f) => f.hasta));
  const entradas = [];
  const vistos = new Set();
  flujos.forEach((f) => {
    if (destinos.has(f.desde)) return;
    if (vistos.has(f.desde)) return;
    vistos.add(f.desde);
    entradas.push(f.desde);
  });
  return entradas;
};

/**
 * El CAMINO mas usado, de la entrada a la salida.
 *
 * SE RECORRE ELIGIENDO LA SALIDA CON MAS TOKENS en cada nodo. Es la definicion que el usuario
 * pidio con sus palabras -«la ruta mas usada, que es donde mas token pasan»- y la unica que da un
 * camino CONTIGUO: sumar conexiones sueltas no produce una ruta, produce un ranking, y un ranking
 * no se puede resaltar como un trazo continuo.
 *
 * TRES DECISIONES QUE CONVIENE TENER ESCRITAS:
 *
 *   - CON EMPATE GANA LA PRIMERA, en el orden en que llegan los flujos. Sin esto el resaltado
 *     bailaria entre repintados con un diagrama simetrico 50/50, y un parpadeo se lee como un
 *     fallo. El orden de `flujos` es estable porque sale del registro de elementos.
 *
 *   - LOS CICLOS NO CUELGAN. Se lleva un conjunto de nodos visitados: en un proceso con un bucle,
 *     el nodo con mas tokens puede volver a si mismo, y sin el corte el recorrido no terminaria.
 *     Se corta en el primero que repite, que es la ruta simple.
 *
 *   - SI HAY VARIAS ENTRADAS se recorren todas y se devuelve la que MAS TOKENS MUEVE (la suma de
 *     los valores de sus conexiones). Elegir la primera seria arbitrario y en un proceso con dos
 *     inicios -uno de prueba y uno real- resaltaria el que no se usa.
 *
 * Devuelve `{ pasos, ids, desde, hasta, valor }`: los flujos en orden, su conjunto de ids para
 * buscar rapido, y el total que mueve la ruta (que la leyenda necesita para poder decir cuanto).
 */
export const rutaDominante = (flujos, valorDe, inicioId = null) => {
  const vacia = { pasos: [], ids: new Set(), desde: null, hasta: null, valor: 0 };
  if (!flujos || !flujos.length) return vacia;

  // Quien sigue a cada flujo: se indexa por nodo de origen para no recorrer el array entero en
  // cada paso -un diagrama grande tiene muchos nodos y esto se llama una vez por pintado-.
  const porOrigen = new Map();
  flujos.forEach((f) => {
    if (!porOrigen.has(f.desde)) porOrigen.set(f.desde, []);
    porOrigen.get(f.desde).push(f);
  });

  const caminar = (entrada) => {
    const pasos = [];
    const visitados = new Set();
    let nodo = entrada;

    while (nodo && !visitados.has(nodo)) {
      visitados.add(nodo);
      const salidas = porOrigen.get(nodo) || [];
      if (!salidas.length) break;

      // La salida con mas tokens. Con empate, la primera: hace falta que dos repintados den el
      // mismo resultado, o el halo parpadearia.
      let mejor = salidas[0];
      for (const f of salidas) {
        if ((valorDe(f.id) || 0) > (valorDe(mejor.id) || 0)) mejor = f;
      }
      // Una salida sin trafico ninguna no se recorre: resaltar un camino que no se usa seria
      // afirmar un uso que no existe.
      if (!((valorDe(mejor.id) || 0) > 0)) break;

      pasos.push(mejor);
      nodo = mejor.hasta;
    }

    return pasos;
  };

  const entradas = inicioId ? [ inicioId ] : entradasDe(flujos);
  if (!entradas.length) return vacia;

  let mejorRuta = [];
  let mejorTotal = -1;
  entradas.forEach((entrada) => {
    const pasos = caminar(entrada);
    const total = pasos.reduce((a, f) => a + (valorDe(f.id) || 0), 0);
    if (total > mejorTotal) {
      mejorTotal = total;
      mejorRuta = pasos;
    }
  });

  if (!mejorRuta.length) return vacia;

  return {
    pasos: mejorRuta,
    ids: new Set(mejorRuta.map((f) => f.id)),
    desde: mejorRuta[0].desde,
    hasta: mejorRuta[mejorRuta.length - 1].hasta,
    // El total NO es «lo que mueve la ruta» en el sentido de la masa: en un camino con cuello de
    // botella las conexiones llevan valores distintos. Se devuelve el MINIMO, que es lo que de
    // verdad atraviesa TODA la ruta de punta a punta -el caudal del camino, en el sentido de
    // redes de flujo-. El maximo seria el del tronco y exageraria.
    valor: mejorRuta.reduce((a, f) => Math.min(a, valorDe(f.id) || 0), Infinity)
  };
};

/**
 * El resumen de una rama para la leyenda: «80 %» y cuantos tokens.
 *
 * Se separa del calculo porque el texto tiene que ser el MISMO en la app y en el informe, y
 * porque asi el arnes puede comprobar el redondeo: un «100 %» que en realidad es 99,6 % afirma
 * una certeza que el dato no tiene.
 */
export const formatearCuota = (cuota) => {
  if (cuota == null || !Number.isFinite(cuota)) return '—';
  const pct = cuota * 100;
  // A partir de 99,5 % se redondea a 100, y entonces se dice «100 %» sin decimales: partir el
  // 99,6 y el 100 en dos textos distintos no aporta y ensucia la leyenda.
  if (pct >= 99.5) return '100 %';
  if (pct >= 10) return `${Math.round(pct)} %`;
  return `${pct.toFixed(1)} %`;
};
