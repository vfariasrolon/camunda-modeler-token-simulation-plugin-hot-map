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
 * Cuanto se reparte la masa de una figura, en PX DE DIAGRAMA.
 *
 * EN PIXELES Y NO EN CELDAS, y ese es el arreglo de un fallo real: con el radio contado
 * en celdas, su tamano en el diagrama cambiaba al cambiar la resolucion. Al bajar la
 * celda a 12 px y subir el radio a 6 celdas «para compensar», la mancha pasaba a
 * desbordarse 72 px por cada lado de una figura que mide 100x80: en un diagrama apretado
 * el mapa se veia flotando en el VACIO, con celdas encendidas donde no hay nada.
 *
 * En px el reparto significa lo mismo con cualquier resolucion, y se puede ajustar al
 * tamano de la figura: el radio sale de la MITAD del lado mayor, acotado entre estos dos
 * limites. Una figura grande recibe una mancha grande y una pequena, una pequena -una
 * compuerta de 50x50 no puede recibir una mancha de 100 px-.
 */
export const RADIO_MINIMO = 24;
export const RADIO_MAXIMO = 90;

/**
 * Radio del reparto para una figura, en px de diagrama.
 *
 * Se toma la mitad del lado mayor para que el borde difuminado LLEGUE al borde de la
 * figura y no mas: asi la mancha cubre la figura y no invade a la vecina ni el espacio
 * vacio de al lado. Acotado por arriba y por abajo, porque una figura diminuta merece
 * algo visible y una enorme no debe tapar el diagrama entero.
 */
export const radioDe = (element) => {
  const lado = Math.max(Number(element && element.width) || 0, Number(element && element.height) || 0);
  if (!(lado > 0)) return RADIO_MINIMO;
  return Math.min(RADIO_MAXIMO, Math.max(RADIO_MINIMO, lado / 2));
};

/**
 * ¿La celda cae DENTRO del circulo del reparto?
 *
 * Parece redundante con `pesoPorDistancia` -que ya devuelve 0 fuera-, pero no lo es, y
 * este es el fallo que se veia como mancha flotando en el vacio: el bucle recorre el
 * CUADRO de celdas del radio y el peso es CIRCULAR, asi que las esquinas del cuadro
 * quedaban con peso bajo pero distinto de cero. Eran celdas encendidas 18 px por encima
 * de una tarea, donde no hay nada. El filtro por el centro de la celda corta las esquinas.
 */
const dentroDelCirculo = (cx, cy, cx0, cy0, radioCeldas) => {
  const dx = (cx - cx0) + 0.5;
  const dy = (cy - cy0) + 0.5;
  return Math.sqrt(dx * dx + dy * dy) <= radioCeldas + 0.5;
};

/** Peso de una celda segun su distancia al centro (en celdas). */
const pesoPorDistancia = (dx, dy, radioCeldas) => {
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > radioCeldas) return 0;
  // 1 en el centro, 0 en el borde, y siempre positivo dentro: un peso negativo haria
  // que una zona RESTARA trabajo a otra, que no significa nada.
  return 1 - (d / (radioCeldas + 1));
};

/** Clave de una celda. Enteros, para que dos figuras cercanas caigan en la misma. */
const clave = (cx, cy) => `${cx}|${cy}`;

/**
 * ¿El elemento tiene una CAJA de verdad?
 *
 * Una CONEXION de bpmn-js NO tiene `width`/`height`: su `x`/`y` son los de su caja
 * envolvente, y si el elemento llega sin geometria -lo normal fuera de un diagrama
 * pintado- valen 0. Tratarla como una figura la mandaba al origen (0,0) con toda su masa,
 * y ahi pasaban dos cosas feas: aparecia una mancha ROJA en una esquina donde no hay
 * ninguna figura, y como la escala es RELATIVA AL MAXIMO, todo el diagrama de verdad salia
 * AZUL. El reporte lo describia asi: «se pintan las demas secciones pero en azul, lo unico
 * rojo es 0,0».
 *
 * Una conexion sin caja no aporta: su masa va por su trazo, y sin trazo no hay donde
 * ponerla. Mejor no pintarla que pintarla en un sitio inventado.
 */
export const tieneCaja = (element) => {
  const ancho = Number(element && element.width) || 0;
  const alto = Number(element && element.height) || 0;
  return ancho > 0 || alto > 0;
};

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
 * ¿La celda TOCA la caja de la figura?
 *
 * El reparto circular no cabe en un rectangulo: por las esquinas se sale por mas de 20 px
 * aunque el radio sea la mitad del lado. Esas esquinas eran las celdas encendidas donde no
 * hay nada. Recortar por la caja hace que la mancha sea la figura, no una nube alrededor.
 */
const toquenLaFigura = (cx, cy, element, lado) => {
  const x = cx * lado;
  const y = cy * lado;
  const ancho = Number(element && element.width) || 0;
  const alto = Number(element && element.height) || 0;
  const fx = Number(element && element.x) || 0;
  const fy = Number(element && element.y) || 0;
  // Se solapa: una celda de 1 px de holgura cuenta como que toca.
  return x + lado >= fx - 1 && x <= fx + ancho + 1 && y + lado >= fy - 1 && y <= fy + alto + 1;
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
export const repartirMasa = (x, y, masa, lado = LADO_CELDA, radioPx = RADIO_MINIMO) => {
  const aportes = [];
  if (!(masa > 0)) return aportes;

  const cx0 = Math.floor(x / lado);
  const cy0 = Math.floor(y / lado);

  // El radio viene en PX DE DIAGRAMA y aqui se pasa a celdas: es lo que hace que la
  // mancha signifique lo mismo con cualquier resolucion (ver RADIO_MINIMO).
  const radioCeldas = Math.max(1, Math.round(radioPx / lado));

  // Primero los pesos y su suma; despues el reparto. La suma se calcula aqui y no se
  // asume constante porque depende del radio.
  const puntos = [];
  let sumaPesos = 0;
  for (let dx = -radioCeldas; dx <= radioCeldas; dx++) {
    for (let dy = -radioCeldas; dy <= radioCeldas; dy++) {
      // Se recorre el CUADRO pero solo se acepta el CIRCULO: sin esto, las esquinas
      // del cuadro quedan encendidas fuera de la figura (ver `dentroDelCirculo`).
      if (!dentroDelCirculo(cx0 + dx, cy0 + dy, cx0, cy0, radioCeldas)) continue;
      const peso = pesoPorDistancia(dx, dy, radioCeldas);
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
export const calcularZonas = (elementos, { lado = LADO_CELDA, radio, puntosDeFlujo } = {}) => {
  const acumulado = new Map();

  (elementos || []).forEach(({ element, masa }) => {
    if (!element || !(masa > 0)) return;

    // Una conexion aporta a lo largo de su trazo: los puntos vienen de fuera porque
    // leer un `path` del SVG no es cosa de un modulo puro.
    const puntos = puntosDeFlujo && puntosDeFlujo(element);

    // SIN CAJA Y SIN TRAZO NO APORTA NADA. Es el arreglo del reporte: una conexion de
    // bpmn-js no tiene width/height, asi que `centroDe` daba (0,0) y su masa entera caia
    // en el origen. Ademas de la mancha roja en una esquina vacia, se llevaba el MAXIMO de
    // la escala y todo el diagrama real salia azul.
    if (!tieneCaja(element) && !(puntos && puntos.length)) return;

    if (puntos && puntos.length) {
      // Se reparte entre los puntos, no entero en cada uno: si no, una linea larga
      // sumaria su masa tantas veces como puntos tenga y se comeria la escala.
      const porPunto = masa / puntos.length;
      // Una conexion no tiene caja: su radio es el de una figura pequena, porque su
      // masa se reparte a lo largo del trazo y no alrededor de un centro.
      const radioFlujo = radio == null ? RADIO_MINIMO : radio;
      puntos.forEach((p) => {
        repartirMasa(p.x, p.y, porPunto, lado, radioFlujo).forEach(([k, aporte]) => {
          acumulado.set(k, (acumulado.get(k) || 0) + aporte);
        });
      });
      return;
    }

    const c = centroDe(element);
    // El radio se AJUSTA A LA FIGURA: una compuerta de 50x50 no puede recibir la misma
    // mancha que una tarea de 200x160, o la mancha se sale de la figura y aparece
    // flotando donde no hay nada.
    const radioFigura = radio == null ? radioDe(element) : radio;

    // Y se RECORTA A LA CAJA de la figura. El reparto circular no cabe en un rectangulo:
    // por las esquinas se sale mas de 20 px aunque el radio sea la mitad del lado, y esas
    // esquinas eran las celdas encendidas donde no hay nada.
    //
    // CONSECUENCIA, y hay que decirla en vez de esconderla: recortar DESCARTA la parte de
    // la masa que caia fuera, asi que el total del mapa queda algo por debajo de la suma de
    // las masas (del orden del 0,5 %: solo se pierden esquinas). La alternativa -renormalizar
    // lo que queda- conservaria el total pero SUBIRIA el valor de las celdas del borde para
    // compensar lo que se tiro, y eso es peor: el numero de una celda dejaria de ser «lo que
    // paso por aqui». Se prefiere perder el 0,5 % y que cada celda diga la verdad.
    const aportes = repartirMasa(c.x, c.y, masa, lado, radioFigura)
      .filter(([, , cx, cy]) => toquenLaFigura(cx, cy, element, lado));

    if (!aportes.length) {
      // Una figura sin ninguna celda dentro (mas pequena que la celda) al menos marca su
      // centro: sin esto, una tarea diminuta no apareceria en el mapa.
      repartirMasa(c.x, c.y, masa, lado, radioFigura).slice(0, 1).forEach(([k, aporte]) => {
        acumulado.set(k, (acumulado.get(k) || 0) + aporte);
      });
      return;
    }

    aportes.forEach(([k, aporte]) => {
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
    // Un elemento sin caja (una conexion) no ocupa celdas: contarlo estiraba el area
    // hasta el origen y disparaba el ajuste de resolucion sin motivo.
    if (!tieneCaja(element)) return;
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
 * SUBIDO DE 6000 A 12000. El valor viejo estaba mal calibrado y se notaba en los diagramas
 * grandes: 6000 celdas de 12 px cubren solo 930x930 px de diagrama, asi que un diagrama de
 * 5000x3000 pedia 104.918 celdas y el ajuste automatico lo mandaba al PRIMER salto, 72 px,
 * perdiendo toda la resolucion. El usuario lo vio tal cual: «pusiste 72».
 *
 * 12000 rects SVG son unos 0,5 s de creacion y ~12 MB: se pinta sin que se note, y duplica
 * el area que cabe a resolucion completa (de 930x930 a 1300x1300 px). Por encima se sigue
 * subiendo el tamaño de celda, que es la unica salida que conserva el mapa entero: recortar
 * zonas mentiria sobre donde se trabajo.
 */
export const MAX_CELDAS = 12000;

/**
 * Lado de celda que deja el mapa dentro del tope.
 *
 * SUBE EN ESCALONES PROPORCIONALES, NO DE 60 EN 60, y ese es el arreglo de «pusiste 72»:
 * con saltos de 60, el primero iba de 12 a 72 -SEIS VECES la resolucion de golpe- porque 12
 * y 72 son multiplos de 60. Un diagrama grande perdia todo el detalle en un solo salto en
 * vez de degradarse.
 *
 * Ahora cada escalon multiplica el lado por 1,25: 12 -> 15 -> 18,75 -> 23,4... Asi el
 * diagrama mas grande posible se sigue degradando, pero poco a poco y de forma predecible,
 * y un diagrama mediano conserva una resolucion mucho mejor que 72 px.
 */
export const FACTOR_ESCALON = 1.25;

export const ladoQueCabe = (elementos, lado = LADO_CELDA) => {
  let actual = lado;
  // El tope de 2000 px evita un bucle infinito si `celdasQueOcupa` devolviera algo raro:
  // con celdas de 2000 px cualquier diagrama cabe.
  while (celdasQueOcupa(elementos, actual) > MAX_CELDAS && actual < 2000) {
    actual = Math.round(actual * FACTOR_ESCALON * 100) / 100;
  }
  return actual;
};
