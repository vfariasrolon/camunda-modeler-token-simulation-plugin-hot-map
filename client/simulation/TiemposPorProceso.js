/**
 * TIEMPOS POR PROCESO: cuando pasa cada token y cuanto se espera en cada paso.
 *
 * QUE RESPONDE ESTE MODULO: «¿esta operacion tiene esperas escondidas?». El informe da el tiempo
 * de ciclo y la espera total, pero no dice EN QUE PASO se pierde el tiempo. Aqui se abre: para cada
 * proceso, cuanto espero el token antes de que le tocara, y cuando paso.
 *
 * DOS LECTURAS DEL TIEMPO ENTRE PROCESOS, y no significan lo mismo:
 *
 *   - ESPERA PROPIA: el rato que el token estuvo en la cola de ESE proceso. Dice si el puesto no
 *     da abasto. Es lo que se puede arreglar poniendo otra persona o bajando el tiempo de ciclo.
 *   - TRANSITO: los minutos de reloj desde que el token TERMINO el paso anterior hasta que llego a
 *     este. Incluye el transporte y la espera de este paso. Dice cuanto tarda la pieza en moverse
 *     por la planta, que es lo que se ve en el cronometro de campo.
 *
 * ESTE MODULO ES PURO: recibe la traza de cada token -ya extraida del motor- y la resume. No toca
 * bpmn-js, ni el DOM, ni el reloj. Asi las dos lecturas se pueden comprobar con casos escritos a
 * mano en vez de esperando a que una corrida produzca el caso que interesa.
 */

/**
 * Redondeo a dos decimales, para que los minutos no lleven quince cifras.
 */
const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Los percentiles de una lista de numeros, por interpolacion lineal.
 *
 * POR QUE NO SOLO LA MEDIA: la media de la espera esconde el problema. Con 9 tokens que pasan
 * directos y 1 que espera 40 minutos, la media sale 4 y parece que no pasa nada; el p90 sale 40 y
 * dice la verdad. Y en planta lo que se sufre es el p90, no la media.
 */
export const percentil = (valores, p) => {
  if (!valores.length) return null;
  const orden = valores.slice().sort((a, b) => a - b);
  if (orden.length === 1) return orden[0];
  const pos = (orden.length - 1) * p;
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (bajo === alto) return orden[bajo];
  return orden[bajo] + (orden[alto] - orden[bajo]) * (pos - bajo);
};

/**
 * Resume la traza de todos los tokens, proceso a proceso.
 *
 * `trazas` es `[{ instanceId, pasos: [{ procesoId, nombre, llegoEn, empezoEn, terminoEn }] }]`, con
 * los tiempos en milisegundos de RELOJ SIMULADO. Se recibe la traza entera -y no un acumulador del
 * motor- porque asi el resumen se puede recalcular con otras reglas sin volver a simular.
 *
 * Devuelve `[{ procesoId, nombre, tokens, esperaMin, esperaP50, esperaP90, esperaMax, transitoMin,
 * transitoP50, transitoMax, esperaron, primeraLlegadaMin, ultimaLlegadaMin, cadenciaMin }]`.
 */
export const resumenPorProceso = (trazas) => {
  const porProceso = new Map();

  (trazas || []).forEach((traza) => {
    const pasos = (traza.pasos || []).slice().sort((a, b) => a.llegoEn - b.llegoEn);
    pasos.forEach((paso, i) => {
      const fila = porProceso.get(paso.procesoId) || {
        procesoId: paso.procesoId,
        nombre: paso.nombre || paso.procesoId,
        esperas: [],
        transitosp: [],
        llegadas: []
      };

      // ESPERA PROPIA: de que llego a que empezo de verdad. Es el rato en cola.
      const espera = Math.max(0, (paso.empezoEn - paso.llegoEn) / 60000);
      fila.esperas.push(espera);

      // TRANSITO: desde que termino el paso ANTERIOR de este token. Solo cuando hay anterior: el
      // primer paso no tiene de donde venir, y meterlo como 0 falsearia la media hacia abajo.
      const anterior = pasos[i - 1];
      if (anterior && anterior.terminoEn != null) {
        fila.transitosp.push(Math.max(0, (paso.llegoEn - anterior.terminoEn) / 60000));
      }

      fila.llegadas.push(paso.llegoEn);
      porProceso.set(paso.procesoId, fila);
    });
  });

  const filas = [];
  porProceso.forEach((f) => {
    const n = f.esperas.length;
    const huboEspera = f.esperas.filter((e) => e > 0.01).length;
    // La CADENCIA es la mediana del tiempo entre llegadas consecutivas: dice cada cuanto pasa un
    // token por aqui. Se usa la mediana y no la media porque una llegada tardia -un paron- mueve
    // la media y no la cadencia real.
    const intervalos = [];
    const ordenadas = f.llegadas.slice().sort((a, b) => a - b);
    for (let i = 1; i < ordenadas.length; i++) intervalos.push((ordenadas[i] - ordenadas[i - 1]) / 60000);

    filas.push({
      procesoId: f.procesoId,
      nombre: f.nombre,
      tokens: n,
      // Espera propia.
      esperaMin: r2(f.esperas.reduce((a, b) => a + b, 0) / (n || 1)),
      esperaTotalMin: r2(f.esperas.reduce((a, b) => a + b, 0)),
      esperaP50: r2(percentil(f.esperas, 0.5) || 0),
      esperaP90: r2(percentil(f.esperas, 0.9) || 0),
      esperaMax: r2(Math.max(...f.esperas, 0)),
      esperaron: huboEspera,
      porcentajeQueEspero: n ? r2((huboEspera / n) * 100) : 0,
      // Transito desde el paso anterior.
      transitoMin: f.transitosp.length
        ? r2(f.transitosp.reduce((a, b) => a + b, 0) / f.transitosp.length) : null,
      transitoP50: f.transitosp.length ? r2(percentil(f.transitosp, 0.5)) : null,
      transitoMax: f.transitosp.length ? r2(Math.max(...f.transitosp)) : null,
      // Cuando y cada cuanto.
      primeraLlegadaMin: ordenadas.length ? r2(ordenadas[0] / 60000) : null,
      ultimaLlegadaMin: ordenadas.length ? r2(ordenadas[ordenadas.length - 1] / 60000) : null,
      cadenciaMin: intervalos.length ? r2(percentil(intervalos, 0.5)) : null
    });
  });

  // Se ordena por ESPERA TOTAL, no por espera media: un proceso por el que pasan 500 tokens con 1
  // minuto de espera cada uno cuesta 500 minutos, mas que uno con 3 tokens y 40 minutos. El orden
  // tiene que poner arriba lo que mas tiempo roba al proceso entero.
  filas.sort((a, b) => b.esperaTotalMin - a.esperaTotalMin);
  return filas;
};

/**
 * El cuello de botella segun las esperas: el proceso con mas tiempo de espera acumulado.
 *
 * Se devuelve el PROCESO y no un `rho`, porque ρ es una media por unidad y esto es el tiempo total
 * que se lleva la cola: en una planta con tres puestos, el que mas espera acumula suele ser el que
 * hay que atacar, aunque su utilizacion no llegue a 1.
 */
export const cuelloPorEspera = (filas) => {
  const conEspera = (filas || []).filter((f) => f.esperaTotalMin > 0);
  if (!conEspera.length) return null;
  return conEspera.reduce((peor, f) => (f.esperaTotalMin > peor.esperaTotalMin ? f : peor));
};

/**
 * El proceso por el que se tarda mas en llegar, mirando el TRANSITO.
 *
 * Es una pregunta distinta de la anterior y por eso son dos funciones: un proceso puede no tener
 * cola y estar lejisimos del anterior, en cuyo caso el problema es la distancia y no la capacidad.
 */
export const peorTransito = (filas) => {
  const conTransito = (filas || []).filter((f) => f.transitoMin != null && f.transitoMin > 0);
  if (!conTransito.length) return null;
  return conTransito.reduce((peor, f) => (f.transitoMin > peor.transitoMin ? f : peor));
};
