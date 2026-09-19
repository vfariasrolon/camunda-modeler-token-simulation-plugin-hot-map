/**
 * EL TOPE LEGAL DE HORAS EXTRA COMO RESTRICCION, no como veredicto.
 *
 * QUE CAMBIA ESTE MODULO, y por que hacia falta: hasta ahora la ley se usaba para
 * JUZGAR DESPUES. El motor simulaba libremente, contaba las horas extra que habian salido,
 * y al final `_calcularCumplimiento` decia «no cumple: 4 de 4 semanas sobre el limite».
 * Eso es un diagnostico, no una respuesta: el cliente lee «te pasas» y la pregunta natural
 * -«¿y si no me pasara?»- quedaba sin contestar.
 *
 * Aqui se convierte el tope en una RESTRICCION que el motor aplica MIENTRAS simula. Con eso
 * se pueden correr los tres escenarios que pide una decision de verdad:
 *
 *   1. SIN EXTRA      el trabajo sale en jornada base. Produccion minima, plazo mas largo.
 *   2. TOPE LEGAL     el trabajo se hace dentro de los tres topes de la LFT. Lo que no cabe
 *                     ESPERA a la semana siguiente, que es lo que obliga la ley: no puedes
 *                     hacer la hora 10, el pedido espera.
 *   3. SIN TOPE       lo que ya hacia el motor: la extra termina cuando termina el trabajo.
 *
 * LOS TRES TOPES DE LA LFT, y son tres porque uno solo no basta:
 *
 *   - SEMANAL (art. 66): 9 h de extra por semana.
 *   - DIARIO (art. 65): 3 h de extra por dia.
 *   - DIAS CON EXTRA (art. 65): la jornada se puede prolongar como maximo 3 veces por semana.
 *
 * Sin los tres, un escenario podria declararse «cumple» mientras hace 6 h de extra en un
 * solo dia, que es ilegal. El veredicto tiene que ser de los tres o no significa nada.
 *
 * ESTE MODULO ES PURO: recibe la peticion de extra y el estado de la semana, y devuelve
 * cuanto se concede. No toca el motor ni el calendario, asi que el arnes comprueba la
 * ARITMETICA -que es donde un tope mal aplicado no se nota mirando el dibujo- sin navegador.
 */

/** Los tres modos, tal como los nombra el informe. */
export const MODO_SIN_EXTRA = 'sin-extra';
export const MODO_TOPE_LEGAL = 'tope-legal';
export const MODO_SIN_TOPE = 'sin-tope';

export const MODOS = [ MODO_SIN_EXTRA, MODO_TOPE_LEGAL, MODO_SIN_TOPE ];

/**
 * Cuanto tiempo extra se CONCEDE de lo que se pide, segun el modo y el estado de la semana.
 *
 * Devuelve `{ concedidoMs, motivo }`. El motivo importa tanto como el numero: es lo que
 * permite al informe decir POR QUE el trabajo espero, en vez de que el plazo se alargue sin
 * explicacion. Un plan que se alarga y no dice por que parece un fallo del modelo.
 *
 * El estado de la semana lo lleva quien llama -el motor-, porque es el unico que sabe en que
 * semana cae cada tarea. Aqui solo se decide con lo que se recibe.
 *
 * @param {Object} peticion
 * @param {number} peticion.extraMs        extra que la tarea necesita, en ms
 * @param {string} peticion.modo           uno de MODO_*
 * @param {Object} peticion.topes          { semanalMs, diarioMs, maxDias }
 * @param {Object} peticion.semana         { usadaMs, diasUsados, esDiaNuevo }
 * @param {number} peticion.extraDelDiaMs  extra ya hecha ESE dia (sin contar esta tarea)
 *
 * OJO CON `esDiaNuevo`: va DENTRO de `semana`, y no es un capricho de estilo. En la primera
 * version del arnes se llamo con `esDiaNuevo` como propiedad de primer nivel, y como la
 * funcion desestructura `semana` el valor se perdia EN SILENCIO: el tope de dias no se
 * aplicaba y el resultado -conceder la extra- era perfectamente plausible. Un parametro en
 * el sitio equivocado que no da error es peor que uno que revienta, asi que ademas de
 * documentarlo se comprueba en el arnes con las DOS formas de llamar.
 */
export const concederExtra = ({
  extraMs,
  modo = MODO_SIN_TOPE,
  topes = {},
  semana = {},
  extraDelDiaMs = 0
}) => {
  const pedido = Math.max(0, Number(extraMs) || 0);
  if (pedido <= 0) return { concedidoMs: 0, motivo: null };

  // ESCENARIO SIN EXTRA: la jornada base es todo lo que hay. No es «aplicar un tope de
  // cero»: es declarar que este plan no contempla trabajar fuera de jornada, y por eso el
  // motivo se dice distinto («el plan no contempla horas extra»), que es mas honesto que
  // «se paso del tope» cuando no hay tope que pasar.
  if (modo === MODO_SIN_EXTRA) {
    return { concedidoMs: 0, motivo: 'sin-extra' };
  }

  if (modo === MODO_SIN_TOPE) {
    return { concedidoMs: pedido, motivo: null };
  }

  // --- A PARTIR DE AQUI, MODO_TOPE_LEGAL: se aplican LOS TRES TOPES ---
  const semanalMs = Math.max(0, Number(topes.semanalMs) || 0);
  const diarioMs = Math.max(0, Number(topes.diarioMs) || 0);
  const maxDias = Math.max(0, Number(topes.maxDias) || 0);

  const usadaMs = Math.max(0, Number(semana.usadaMs) || 0);
  const diasUsados = Math.max(0, Number(semana.diasUsados) || 0);
  const esDiaNuevo = Boolean(semana.esDiaNuevo);

  // EL TOPE DE DIAS VA PRIMERO, y el orden no es casual: es el unico que puede conceder
  // CERO de golpe aunque quede cupo semanal. Si se comprobara despues, una tarea recibiria
  // «concedido» y luego se descubriria que su dia no estaba permitido, y el motor tendria
  // que deshacer trabajo ya programado.
  const diasQueOcuparia = diasUsados + (esDiaNuevo ? 1 : 0);
  if (maxDias > 0 && diasQueOcuparia > maxDias) {
    return { concedidoMs: 0, motivo: 'tope-dias' };
  }

  // Cuanto cabe por cada tope, por separado. Se calculan los tres y se toma el MENOR: es la
  // forma de no equivocarse con el orden, porque si el semanal sobra pero el diario no,
  // concede el diario; y al reves.
  const cabeSemanal = Math.max(0, semanalMs - usadaMs);
  const cabeDiario = Math.max(0, diarioMs - (Number(extraDelDiaMs) || 0));

  const concedidoMs = Math.min(pedido, cabeSemanal, cabeDiario);

  if (concedidoMs <= 0) {
    // Se dice CUAL tope corto, para que el informe pueda explicar la espera. Si cortaran los
    // dos a la vez, manda el diario: es el que se agota primero en la practica y el que el
    // lector puede comprobar mirando un solo dia.
    const motivo = cabeDiario <= 0 ? 'tope-diario' : 'tope-semanal';
    return { concedidoMs: 0, motivo };
  }

  // Concedido en parte: la tarea hara lo que quepa y el resto esperara. No se devuelve
  // motivo porque SI se concedio algo, y marcar la tarea como «recortada» a medias llenaria
  // el informe de avisos sin decir nada util; la espera se ve en el plazo.
  return { concedidoMs, motivo: concedidoMs < pedido ? null : null };
};

/**
 * Estado de la semana de extra. Lo lleva el MOTOR, una instancia por corrida.
 *
 * POR QUE ES UN OBJETO CON METODOS Y NO TRES NUMEROS SUELTOS: en la primera version esta
 * funcion recibia `{ usadaMs, diasUsados, esDiaNuevo }` y confiaba en que quien llamaba
 * llevara bien las tres cuentas. Al probarla con una semana entera se vio el fallo: el
 * contador de DIAS del llamante se desincronizaba del que veia la funcion, y ademas el
 * `extraDelDiaMs` habia que resetearlo en cada dia nuevo -fuera de la funcion-. Un dato que
 * se lleva a mano en dos sitios se desincroniza: aqui no hay dos sitios.
 *
 * La clave del dia es lo unico que hay que pasar, y el estado deduce el resto.
 */
export const crearEstadoSemana = () => ({
  // Por semana ISO: { usadaMs, dias: Set(clavesDedía), extraPorDia: Map }
  porSemana: new Map(),

  /** Lo que ya se hizo en una semana, tal como lo necesita `concederExtraDe`. */
  de(semana) {
    const s = this.porSemana.get(semana);
    if (!s) return { usadaMs: 0, diasUsados: 0, maxDias: 0 };
    return { usadaMs: s.usadaMs, diasUsados: s.dias.size, maxDias: s.dias.size };
  },

  /** Lo que se lleva hecho ESE dia, para el tope diario. */
  delDia(semana, dia) {
    const s = this.porSemana.get(semana);
    return (s && s.extraPorDia.get(dia)) || 0;
  },

  /**
   * Anota lo concedido. Es lo que hace que el estado no se pueda desincronizar: la misma
   * llamada que suma las horas suma el dia, asi que no hay forma de contar uno y no el otro.
   */
  anotar(semana, dia, concedidoMs) {
    if (!(concedidoMs > 0)) return;
    if (!this.porSemana.has(semana)) {
      this.porSemana.set(semana, { usadaMs: 0, dias: new Set(), extraPorDia: new Map() });
    }
    const s = this.porSemana.get(semana);
    s.usadaMs += concedidoMs;
    s.dias.add(dia);
    s.extraPorDia.set(dia, (s.extraPorDia.get(dia) || 0) + concedidoMs);
  }
});

/**
 * Version de `concederExtra` que trabaja con el ESTADO, para que no haya que pasar los tres
 * contadores a mano. Es la que usa el motor; `concederExtra` sigue existiendo aparte porque
 * es la que se puede probar con valores sueltos sin montar el estado.
 */
export const concederExtraDe = ({ extraMs, modo, topes, semana, dia, estado }) => {
  // SIN EXTRA Y SIN TOPE no consultan el estado, asi que no hay nada que leer ni que anotar.
  if (modo === MODO_SIN_EXTRA || modo === MODO_SIN_TOPE) {
    return concederExtra({ extraMs, modo, topes });
  }

  const acumulado = estado.porSemana.get(semana);

  const r = concederExtra({
    extraMs,
    modo,
    topes,
    // `esDiaNuevo` VA DENTRO DE `semana`, y este fue un fallo REAL que costo varias vueltas:
    // estaba puesto como propiedad de primer nivel, asi que `concederExtra` -que lee
    // `semana.esDiaNuevo`- lo veia siempre `undefined` -> `false`. Con eso, el tope de DIAS
    // no se aplicaba nunca desde el motor: el escenario «con tope legal» hacia extra en 4
    // dias de una semana cuyo tope era 3, y lo hacia sin dar ningun error. El sintoma que lo
    // delato fue que el propio verificador de cumplimiento marcaba «no cumple» en el
    // escenario que se supone que cumple.
    //
    // Para que no pueda repetirse, se lee el estado UNA vez, aqui, y se construye el objeto
    // completo: al no haber dos formas de llamar, no hay forma de equivocarse.
    semana: {
      usadaMs: acumulado ? acumulado.usadaMs : 0,
      diasUsados: acumulado ? acumulado.dias.size : 0,
      esDiaNuevo: !acumulado || !acumulado.dias.has(dia)
    },
    extraDelDiaMs: estado.delDia(semana, dia)
  });

  estado.anotar(semana, dia, r.concedidoMs);
  return r;
};

/**
 * Texto del motivo, para el informe. Vive aqui y no en la plantilla del PDF para que el
 * vocabulario sea el mismo en la app y en el documento, y para que el arnes lo pueda
 * comprobar: un motivo sin texto dejaria la espera sin explicar.
 */
export const describeMotivo = (motivo) => {
  switch (motivo) {
    case 'sin-extra':
      return 'el plan no contempla horas extra';
    case 'tope-semanal':
      return 'se alcanzó el tope legal de horas extra de la semana';
    case 'tope-diario':
      return 'se alcanzó el tope legal de horas extra del día';
    case 'tope-dias':
      return 'ya se prolongó la jornada los días que permite la semana';
    default:
      return null;
  }
};

/**
 * Resumen del escenario para el informe: los tres topes en palabras, con su articulo.
 *
 * Se citan los articulos porque el cliente que lee «no cumple» necesita saber QUE ley, y el
 * que lee «cumple» necesita saber contra que se le compara. Un veredicto sin la norma detras
 * no es auditable.
 */
export const describeTopes = (topes) => {
  if (!topes) return 'sin topes declarados';
  const h = (ms) => {
    const n = (Number(ms) || 0) / 3600000;
    return `${n.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')} h`;
  };
  const partes = [];
  if (topes.semanalMs > 0) partes.push(`máximo ${h(topes.semanalMs)} por semana (LFT art. 66)`);
  if (topes.diarioMs > 0) partes.push(`máximo ${h(topes.diarioMs)} al día (LFT art. 65)`);
  if (topes.maxDias > 0) partes.push(`hasta ${topes.maxDias} días con extra por semana (LFT art. 65)`);
  return partes.length ? partes.join(' · ') : 'sin topes declarados';
};

/** Etiqueta corta del modo, para encabezados de tabla y leyendas de grafico. */
export const etiquetaModo = (modo) => {
  switch (modo) {
    case MODO_SIN_EXTRA: return 'Sin horas extra';
    case MODO_TOPE_LEGAL: return 'Extra con tope legal';
    case MODO_SIN_TOPE: return 'Extra sin tope';
    default: return String(modo || '');
  }
};
