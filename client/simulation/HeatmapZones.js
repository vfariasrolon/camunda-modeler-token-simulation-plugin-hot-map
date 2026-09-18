/**
 * Mapa de ZONAS: reparte el trabajo que pasa por el diagrama en celdas, para pintar
 * una mancha continua en lugar de un circulo por figura.
 *
 * POR QUE NO BASTABA EL MAPA POR TAREAS: un circulo esta centrado en su figura, asi
 * que por construccion no puede enseñar una mancha: dice «esta tarea es cara», no «por
 * aqui pasa el trabajo». La zona contesta lo otro, y para eso hay que sumar la masa de
 * varias figuras cercanas en un mismo trozo de diagrama.
 *
 * ESTE MODULO ES PURO: recibe elementos y valores, y devuelve celdas. No toca el DOM
 * ni bpmn-js, asi que el arnes comprueba la ARITMETICA -que es donde se puede mentir
 * sin que se note: una celda mal sumada pinta una zona que no existe- sin navegador.
 */

/**
 * Lado de la celda, en px de diagrama.
 *
 * RESOLUCION A 5: 60 px dejaba el mapa tosco. Con 12 px la mancha tiene detalle de
 * verdad (una tarea estandar de 100x80 cae en unas 60 celdas) y sigue sin llenar el DOM
 * en un diagrama normal: 12 px es un quinto de lo que habia, o sea 25 veces mas celdas,
 * asi que el tope de `MAX_CELDAS` y su ajuste automatico pasan a ser la red que evita
 * que un diagrama grande cuelgue el navegador.
 *
 * El limite de lo util: por debajo de ~10 px la celda es mas pequena que el borde de una
 * figura y la mancha empieza a parecer ruido en vez de zona. Si algun dia se quiere mas
 * detalle, el camino es el mapa difuminado, no bajar mas la celda.
 */
export const LADO_CELDA = 12;

/**
 * Cuanto se reparte la masa de una figura alrededor de su centro, en celdas.
 *
 * CON CELDAS PEQUENAS ESTO IMPORTA MAS, no menos: con 60 px, radio 2 cubria 120 px de
 * diagrama (mas ancho que una tarea) y las celdas se solapaban solas. Con 12 px, radio 2
 * cubriria 24 px -menos que una tarea-, la mancha saldria con el centro marcado y los
 * bordes de la figura vacios, y se volveria al problema del principio: un punto por
 * figura en vez de una zona.
 *
 * 6 celdas dan 72 px de radio: cubre una tarea estandar con su borde difuminado y hace
 * que dos tareas contiguas se unan sin escalon. Se queda por debajo del maximo util
 * (radio mayor que media figura no aporta nada: solo engorda el difuminado).
 */
export const RADIO_MANCHA = 6;

/** Peso de una celda segun su distancia al centro (en celdas). */
const pesoPorDistancia = (dx, dy) => {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > RADIO_MANCHA) return 0;
  // 1 en el centro, 0 en el borde, y siempre positivo dentro: un peso negativo haria
  // que una zona RESTARA trabajo a otra, que no significa nada.
  return 1 - (d / (RADIO_MANCHA + 1));
};

/** Clave de una celda. Enteros, para que dos figuras cercanas caigan en la misma. */
const clave = (cx, cy) => `${cx}|${cy}`;

/**
 * Centro de una figura en px de diagrama.
 *
 * Se usa la caja de la figura, no su `x`/`y`: una conexion viene con coordenadas de
 * su caja envolvente y una tarea con su esquina, y mezclarlos desplazaria las zonas
 * medio ancho de figura.
 */
export const centroDe = (element) => {
  const ancho = Number(element && element.width) || 0;
  const alto = Number(element && element.height) || 0;
  const x = Number(element && element.x) || 0;
  const y = Number(element && element.y) || 0;
  return { x: x + ancho / 2, y: y + alto / 2 };
};

/**
 * Reparte `masa` desde un punto por las celdas de alrededor.
 *
 * EL REPARTO CONSERVA LA MASA: lo que sale sumado es exactamente la masa que entra.
 * Sin normalizar por la suma de pesos, una figura suelta metia 7 veces su trabajo en
 * el mapa, y una conexion repartida por 30 puntos lo multiplicaba por decenas: el rojo
 * se iba a las lineas y las tareas se veian azules, justo al reves de lo que hay que
 * mirar. Ademas hacia que el numero de la leyenda no fuese «minutos de trabajo», que
 * es lo unico que lo vuelve una medicion y no un adorno.
 *
 * Devuelve pares `[clave, aporte, cx, cy]` en vez de escribir en un acumulador: asi la
 * funcion no tiene estado y el arnes la puede probar sola.
 */
export const repartirMasa = (x, y, masa, lado = LADO_CELDA, radio = RADIO_MANCHA) => {
  const aportes = [];
  if (!(masa > 0)) return aportes;

  const cx0 = Math.floor(x / lado);
  const cy0 = Math.floor(y / lado);

  // Primero los pesos y su suma; despues el reparto. La suma se calcula aqui y no se
  // asume constante porque depende del radio.
  const puntos = [];
  let sumaPesos = 0;
  for (let dx = -radio; dx <= radio; dx++) {
    for (let dy = -radio; dy <= radio; dy++) {
      const peso = pesoPorDistancia(dx, dy);
      if (peso <= 0) continue;
      puntos.push([ cx0 + dx, cy0 + dy, peso ]);
      sumaPesos += peso;
    }
  }
  if (!(sumaPesos > 0)) return aportes;

  puntos.forEach(([cx, cy, peso]) => {
    aportes.push([ clave(cx, cy), masa * (peso / sumaPesos), cx, cy ]);
  });

  return aportes;
};

/**
 * Las celdas del mapa de zonas, a partir de las figuras y conexiones con su masa.
 *
 * `elementos` es `[{ element, masa }]`. Una conexion no tiene caja util (su `x`/`y` es
 * la de la caja envolvente, que en una linea diagonal cae en el aire), asi que se
 * reparte su masa por SU TRAZO: los puntos medios que se le pasen. Si no se le pasan,
 * se cae a su centro, que es lo unico que se puede hacer sin geometria.
 *
 * Devuelve `{ celdas, max, min, n, lado }` con las celdas ya sumadas.
 */
export const calcularZonas = (elementos, { lado = LADO_CELDA, radio = RADIO_MANCHA, puntosDeFlujo } = {}) => {
  const acumulado = new Map();

  (elementos || []).forEach(({ element, masa }) => {
    if (!element || !(masa > 0)) return;

    // Una conexion aporta a lo largo de su trazo: los puntos vienen de fuera porque
    // leer un `path` del SVG no es cosa de un modulo puro.
    const puntos = puntosDeFlujo && puntosDeFlujo(element);

    if (puntos && puntos.length) {
      // Se reparte entre los puntos, no entero en cada uno: si no, una linea larga
      // sumaria su masa tantas veces como puntos tenga y se comeria la escala.
      const porPunto = masa / puntos.length;
      puntos.forEach((p) => {
        repartirMasa(p.x, p.y, porPunto, lado, radio).forEach(([k, aporte]) => {
          acumulado.set(k, (acumulado.get(k) || 0) + aporte);
        });
      });
      return;
    }

    const c = centroDe(element);
    repartirMasa(c.x, c.y, masa, lado, radio).forEach(([k, aporte]) => {
      acumulado.set(k, (acumulado.get(k) || 0) + aporte);
    });
  });

  const celdas = [];
  let max = 0;
  let min = Infinity;
  acumulado.forEach((valor, k) => {
    const [cx, cy] = k.split('|').map(Number);
    celdas.push({ cx, cy, x: cx * lado, y: cy * lado, valor });
    if (valor > max) max = valor;
    if (valor < min) min = valor;
  });

  return {
    celdas,
    max,
    min: celdas.length ? min : 0,
    n: celdas.length,
    lado
  };
};

/**
 * Cuantos cuadros del diagrama ocupa una rejilla.
 *
 * Existe para poder AVISAR antes de pintar: un diagrama de 20000x20000 con celdas de
 * 60 px son 111.000 celdas, y meterlas todas en el DOM cuelga el Modeler. Es mejor
 * decirlo que descubrirlo.
 */
export const celdasQueOcupa = (elementos, lado = LADO_CELDA) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  (elementos || []).forEach(({ element }) => {
    if (!element) return;
    const x = Number(element.x) || 0;
    const y = Number(element.y) || 0;
    const w = Number(element.width) || 0;
    const h = Number(element.height) || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  });

  if (!Number.isFinite(minX)) return 0;

  const columnas = Math.ceil((maxX - minX) / lado) + 1;
  const filas = Math.ceil((maxY - minY) / lado) + 1;
  return columnas * filas;
};

/**
 * Techo de celdas a pintar, para que un diagrama enorme no cuelgue el navegador.
 *
 * 6000 nodos SVG se pintan sin que se note. Por encima se AVISA y se sube el tamaño
 * de celda, que es la unica salida que conserva el mapa: recortar zonas seria mentir
 * sobre donde se trabajo.
 */
export const MAX_CELDAS = 6000;

/** Lado de celda que deja el mapa dentro del tope. Sube de 60 en 60 hasta que quepa. */
export const ladoQueCabe = (elementos, lado = LADO_CELDA) => {
  let actual = lado;
  while (celdasQueOcupa(elementos, actual) > MAX_CELDAS && actual < 1200) {
    actual += 60;
  }
  return actual;
};
