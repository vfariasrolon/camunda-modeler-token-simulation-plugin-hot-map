/**
 * Comparativa de los DOS planes: el normal y el de horas extra.
 *
 * Para que sirve: en planta las dos preguntas van juntas y a menudo se contestan por
 * separado. «Si abro horas extra, entrego antes» es cierto; «y me cuesta mas» tambien.
 * Ensenar solo una de las dos empuja a decidir a medias, asi que aqui se calculan las
 * dos y se redactan juntas.
 *
 * TRES REGLAS DE DISENO, y las tres importan:
 *
 *   1. LOS DOS INFORMES YA EXISTEN. El controlador los corre en la misma corrida
 *      -misma semilla, numeros aleatorios comunes-, asi que la diferencia entre ellos
 *      se debe AL PLAN y no a la suerte. Esto solo compara: no simula nada.
 *
 *   2. LOS DOS GRAFICOS COMPARTEN ESCALA Y FECHAS, y eso no es estetica. Dos graficos
 *      con el eje ajustado a sus propios datos se ven iguales aunque uno tarde el
 *      doble: la escala miente sin que se note. Por eso el techo y las fechas se
 *      calculan UNA vez para los dos (`fechasUnidas`, `techoComun`).
 *
 *   3. LAS NOTAS SON PREDISENADAS, y por eso llevan umbrales. Una diferencia de 0,2 %
 *      es redondeo, no un hallazgo: sin umbral la nota diria «las horas extra suben el
 *      coste un 0,0 %», que es ruido presentado como conclusion.
 *
 * Este modulo es PURO (no toca el DOM ni Chart.js) para que el arnes lo pueda probar:
 * lo que se puede equivocar aqui son los deltas y el techo comun, y eso se comprueba
 * con numeros, no mirando un dibujo.
 */

import { formatCurrency } from './util';

/**
 * Los dos colores de los planes.
 *
 * Salen de la paleta categorica validada por contraste y por daltonismo (el par que
 * usaba la comparativa de produccion -azul claro y naranja claro- NO pasaba: el naranja
 * se quedaba en 2,04:1 y se perdia con el rojo-verde, que es el daltonismo comun).
 */
export const COLOR_PLAN = {
  normal: '#1d4ed8',
  extra: '#b45309',
  // El tercer escenario: extra CON los topes de la LFT. Verde oscuro, que no compite con el
  // azul del plan base ni con el naranja del plan libre, y mantiene la separacion por
  // luminancia que hace legible el grafico en escala de grises.
  legal: '#15803d'
};

/**
 * A partir de que diferencia una nota deja de ser ruido (en %).
 *
 * 1 %: por debajo de eso, la diferencia entre planes es redondeo de la simulacion, y
 * una nota que dijera «sube un 0,3 %» ensenaria a desconfiar de todas las demas.
 */
export const UMBRAL_PCT = 1;

// Utilidades numericas. Van ARRIBA y no junto a su primer uso: `const` no tiene hoisting, y
// aunque estas funciones se llamen despues -asi que en runtime funciona-, dejar la
// definicion mas abajo invita a mover la funcion que las usa y romperlo sin que se note.
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const redondear = (v, dec = 1) => {
  const f = Math.pow(10, dec);
  return Math.round(v * f) / f;
};

/**
 * Los tres escenarios de horas extra, con su etiqueta y su explicacion.
 *
 * POR QUE TRES Y NO DOS: el informe decia «no cumple el tope legal» y ahi se acababa. El
 * cliente lee el diagnostico y pregunta lo unico que le importa: «¿y si lo cumpliera?». Con
 * los tres escenarios corridos sobre la MISMA semilla, la respuesta es una tabla.
 *
 * El escenario legal es el unico que hace lo que manda la ley: lo que no cabe en los topes
 * espera a la semana siguiente. Por eso su produccion puede ser menor -o igual- que la del
 * plan libre, y por eso su costo tambien.
 */
export const ESCENARIOS_EXTRA = [
  {
    clave: 'normal',
    etiqueta: 'Sin horas extra',
    color: COLOR_PLAN.normal,
    detalle: 'Jornada base. Cumple la ley por definición, y es el plazo más largo.'
  },
  {
    clave: 'legal',
    etiqueta: 'Extra con tope legal',
    color: COLOR_PLAN.legal,
    detalle: 'Lo que no cabe en los topes de la LFT espera a la semana siguiente.'
  },
  {
    clave: 'extra',
    etiqueta: 'Extra sin tope',
    color: COLOR_PLAN.extra,
    detalle: 'La extra termina cuando termina el trabajo. Es el más rápido y el que incumple.'
  }
];

/**
 * Compara los TRES escenarios y redacta la lectura.
 *
 * `informes` es `{ normal, legal, extra }`, y cualquiera puede faltar (un modelo sin tarifas
 * de horas extra no tiene los tres). Se devuelve `null` si falta el plan base, porque sin el
 * no hay contra que comparar.
 */
export const compararEscenarios = (informes) => {
  const { normal, legal, extra } = informes || {};
  if (!normal) return null;

  const fila = (clave, informe, escenario) => {
    if (!informe) return null;
    const piezas = num(informe.completedInstances);
    const dias = num(informe.totalWorkingDays) || num(informe.dias);
    const costo = num(informe.totalCost);
    return {
      clave,
      etiqueta: escenario.etiqueta,
      color: escenario.color,
      detalle: escenario.detalle,
      piezas,
      dias,
      costo,
      costoPorPieza: piezas > 0 ? costo / piezas : null,
      cumple: cumpleLaLey(informe)
    };
  };

  const filas = ESCENARIOS_EXTRA
    .map((e) => fila(e.clave, informes[e.clave], e))
    .filter(Boolean);

  return {
    filas,
    // Referencia del plan base: los deltas se calculan contra el, que es el unico que existe
    // siempre y el que el cliente ya conoce.
    base: filas.find((f) => f.clave === 'normal') || filas[0]
  };
};

/** ¿Ese informe cumple los topes de la LFT? Se lee del propio cumplimiento del motor. */
export const cumpleLaLey = (informe) => {
  const c = informe && (informe.compliance || informe.cumplimiento);
  if (!c) return null;
  return !(c.semanasSobreLimite > 0 || c.diasSobreLimiteDiario > 0 || c.semanasSobreDias > 0);
};

/**
 * La nota que responde «¿cuanto me cuesta cumplir la ley?».
 *
 * Es la unica frase que el cliente necesita de todo el analisis, y hay tres desenlaces
 * posibles, todos informativos:
 *
 *   - El plan legal produce LO MISMO y cuesta MENOS: la extra libre se estaba tirando.
 *   - El plan legal produce MENOS: la ley tiene un coste de oportunidad, y hay que decidir.
 *   - El plan legal produce LO MISMO y cuesta MAS: la extra no compra produccion, y el
 *     cuello esta en otra parte (tipicamente un recurso, no el reloj).
 */
export const notaDelTopeLegal = (comparativa) => {
  if (!comparativa || !comparativa.filas.length) return null;
  const legal = comparativa.filas.find((f) => f.clave === 'legal');
  const libre = comparativa.filas.find((f) => f.clave === 'extra');
  if (!legal || !libre) return null;

  const dPiezas = libre.piezas > 0 ? ((legal.piezas - libre.piezas) / libre.piezas) * 100 : 0;
  const dCosto = libre.costo > 0 ? ((legal.costo - libre.costo) / libre.costo) * 100 : 0;

  const pct = (v) => `${Math.abs(redondear(v, 1))} %`;

  // SIN DIFERENCIA DE PRODUCCION: es el hallazgo mas util y el mas facil de pasar por alto.
  if (Math.abs(dPiezas) < UMBRAL_PCT) {
    if (dCosto <= -UMBRAL_PCT) {
      return `Cumplir la ley produce <strong>las mismas piezas</strong> y cuesta ${pct(dCosto)} menos. `
        + 'La horas extra libres no estaban comprando producción: se estaban pagando sin mover el resultado.';
    }
    if (dCosto >= UMBRAL_PCT) {
      return `Cumplir la ley produce <strong>las mismas piezas</strong> y cuesta ${pct(dCosto)} más. `
        + 'La extra no compra producción, así que el límite del proceso no es el reloj sino otra cosa '
        + '(recursos, colas o reprocesos).';
    }
    return 'Cumplir la ley no cambia ni la producción ni el costo en el margen de la simulación.';
  }

  // CON DIFERENCIA: la ley tiene un coste de oportunidad que hay que poner en numeros.
  const signo = dCosto >= 0 ? 'más' : 'menos';
  return `Cumplir la ley produce ${pct(dPiezas)} menos piezas y cuesta ${pct(dCosto)} ${signo}. `
    + 'Ese es el precio de la legalidad, y la decisión es si se cubre con capacidad (más gente o turno) '
    + 'o se asume el plazo.';
};

/** Diferencia relativa en % de `valor` frente a `base`. 0 si la base no es util. */
export const deltaPct = (valor, base) => (base > 0 ? ((valor - base) / base) * 100 : 0);

/** Total de un campo del informe sumando sus resultados por elemento. */
const totalDe = (report, campo) => {
  if (!report || !Array.isArray(report.results)) return 0;
  return report.results.reduce((acc, r) => acc + num(r && r[campo]), 0);
};

// ---------------------------------------------------------------------------
// Series para los graficos
// ---------------------------------------------------------------------------

/** Las fechas con produccion de un informe, sin ordenar. */
export const fechasDe = (report) =>
  (report && report.dailyCompletions && typeof report.dailyCompletions.keys === 'function')
    ? Array.from(report.dailyCompletions.keys())
    : [];

/**
 * Las fechas de los DOS planes juntas y ordenadas.
 *
 * La union y no la de uno: si el plan normal tarda mas dias, su ultimo dia no existe
 * en el otro, y con un eje por plan los dos graficos no se podrian superponer al
 * mirarlos. Se ordena por la fecha real y no por el texto, para que un cambio de mes
 * no altere el orden.
 */
export const fechasUnidas = (...reports) =>
  [ ...new Set(reports.reduce((todas, r) => todas.concat(fechasDe(r)), [])) ]
    .sort((a, b) => new Date(a) - new Date(b));

/**
 * Produccion ACUMULADA por fecha: la curva que dice cuando se entrega.
 *
 * Acumulada y no diaria porque la pregunta es de plazo («cuando termino»), y una
 * barra diaria no contesta eso: obliga a sumar mentalmente para saber la fecha.
 */
export const serieAcumulada = (report, fechas) => {
  let acumulado = 0;
  const mapa = (report && report.dailyCompletions) || new Map();
  return fechas.map((f) => {
    acumulado += num(mapa.get ? mapa.get(f) : 0);
    return acumulado;
  });
};

/**
 * Techo redondo para un eje, para que las lineas de referencia caigan en numeros
 * legibles (100, 150, 200...) y no en 87 o 213.
 */
export const techoRedondo = (v) => {
  if (!(v > 0)) return 1;
  const magnitud = Math.pow(10, Math.floor(Math.log10(v)));
  const pasos = [ 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10 ];
  const paso = pasos.find((p) => p * magnitud >= v);
  return magnitud * (paso === undefined ? 10 : paso);
};

/**
 * El techo COMUN de los dos graficos.
 *
 * Es la mitad de la regla 2 del encabezado: con un techo por grafico, el plan que tarda
 * mas se dibuja igual de alto que el que tarda menos, y la comparacion visual miente.
 */
export const techoComun = (...series) =>
  techoRedondo(Math.max(1, ...series.reduce((todas, s) => todas.concat(s || []), [ 0 ])));

/** Etiqueta corta de una fecha `AAAA-MM-DD` («18 sep») sin pasar por el huso horario. */
export const etiquetaDeFecha = (iso) => {
  const MESES = [ 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic' ];
  // Se parten las partes a mano y NO se hace `new Date(iso)`: una fecha sin hora se
  // interpreta como UTC, y en Mexico eso adelanta el dia (el 18 se dibuja como 17).
  const partes = String(iso).split('-');
  if (partes.length !== 3) return String(iso);
  const mes = MESES[Number(partes[1]) - 1] || partes[1];
  return `${Number(partes[2])} ${mes}`;
};

// ---------------------------------------------------------------------------
// Los numeros de la comparacion
// ---------------------------------------------------------------------------

/**
 * Los dos planes con sus diferencias.
 *
 * El coste se desglosa en las tres componentes que el motor SI escribe (operacion,
 * primas y espera) para que la diferencia se pueda explicar: con horas extra suben las
 * primas, pero la espera puede BAJAR, y si baja mas de lo que suben las primas el plan
 * con extras sale mas barato. Ese caso existe y es contraintuitivo, asi que se calcula.
 */
export const compararPlanes = (normal, extra) => {
  const piezas = {
    normal: num(normal && normal.completedInstances),
    extra: num(extra && extra.completedInstances)
  };
  piezas.iguales = piezas.normal === piezas.extra;

  const coste = {
    normal: num(normal && normal.totalCost),
    extra: num(extra && extra.totalCost)
  };
  coste.delta = coste.extra - coste.normal;
  coste.deltaPct = deltaPct(coste.extra, coste.normal);

  const espera = { normal: totalDe(normal, 'totalWaitTimeCost'), extra: totalDe(extra, 'totalWaitTimeCost') };
  espera.delta = espera.extra - espera.normal;

  const primas = {
    normal: totalDe(normal, 'totalDoubleOvertimeCost') + totalDe(normal, 'totalTripleOvertimeCost'),
    extra: totalDe(extra, 'totalDoubleOvertimeCost') + totalDe(extra, 'totalTripleOvertimeCost')
  };
  primas.delta = primas.extra - primas.normal;

  const plazo = {
    normalDias: num(normal && normal.diasNaturales),
    extraDias: num(extra && extra.diasNaturales),
    normalLaborables: num(normal && normal.totalWorkingDays),
    extraLaborables: num(extra && extra.totalWorkingDays)
  };
  plazo.deltaDias = plazo.extraDias - plazo.normalDias;
  // El plazo se mide sobre el plan que MAS tarda (el normal, casi siempre): «con horas
  // extra adelantas un X % de lo que tardarias sin ellas» es la frase util. Calculado
  // al reves -sobre el plan corto- el porcentaje saldria mayor y diria otra cosa.
  plazo.baseDias = Math.max(plazo.normalDias, plazo.extraDias);
  plazo.ahorroPct = plazo.baseDias > 0
    ? ((plazo.baseDias - Math.min(plazo.normalDias, plazo.extraDias)) / plazo.baseDias) * 100
    : 0;
  plazo.adelanta = plazo.deltaDias < 0;

  const horasExtraMs = { normal: totalDe(normal, 'totalOvertime'), extra: totalDe(extra, 'totalOvertime') };

  const porPieza = {
    normal: piezas.normal > 0 ? coste.normal / piezas.normal : 0,
    extra: piezas.extra > 0 ? coste.extra / piezas.extra : 0
  };
  porPieza.deltaPct = deltaPct(porPieza.extra, porPieza.normal);

  return { piezas, coste, espera, primas, plazo, horasExtraMs, porPieza };
};

/** El signo explicito: un delta de 0 sin signo se lee como «no hay dato». */

/** Importe con separador de miles y moneda: un «31200» suelto no se lee. */
const importe = (v) => formatCurrency(num(v), 'MXN');

/**
 * Porcentaje con UN decimal, siempre igual.
 *
 * Existe porque mezclar formatos en la misma frase se lee mal: «pagas 20 % más y
 * adelantas 33.3 % del plazo» parece que una cifra es mas precisa que la otra.
 */
export const enPorcentaje = (v) => `${redondear(num(v), 1).toFixed(1)} %`;

/** «3 dias» / «1 dia»: el «dia(s)» de antes se leia como un formulario sin rellenar. */
const enDias = (n) => `${num(n)} ${num(n) === 1 ? 'día' : 'días'}`;

/**
 * Las NOTAS prediseñadas de eficiencia.
 *
 * Una lista de frases ya escritas, elegidas segun lo que digan los numeros. El sentido
 * de tenerlas preescritas es que la conclusion no dependa de como la redacte quien
 * ejecuta: el programa dice lo mismo siempre ante los mismos datos, y no puede
 * «olvidarse» de decir que el plan barato tarda mas.
 *
 * LOS CUATRO CUADRANTES ESTAN CUBIERTOS, y no es lo mismo que cubrir dos:
 *
 *   extra mas caro  + mas rapido   -> la disyuntiva de siempre (pagar o esperar)
 *   extra mas caro  + plazo igual  -> no hay nada que ganar: solo factura
 *   extra mas barato + mas rapido  -> gana en las dos (la espera ahorrada manda)
 *   extra mas barato + plazo igual -> sale mas barato sin mover el plazo
 *
 * El cuadrante «mas barato» es el que se cuela: cuando la nota de «sin extras es mas
 * barato» se escribia SIEMPRE que el plazo adelantaba, en ese caso decia exactamente lo
 * contrario de lo que pasa.
 *
 * `nivel` no es decoracion: 'aviso' y 'mal' pintan la nota de otro color, y lo que se
 * pinta es lo que se lee primero.
 */
export const notasDeEficiencia = (cmp) => {
  const notas = [];
  const { coste, plazo, piezas, primas, espera } = cmp;

  const subeCoste = coste.deltaPct > UMBRAL_PCT;
  const bajaCoste = coste.deltaPct < -UMBRAL_PCT;
  const adelanta = plazo.ahorroPct > UMBRAL_PCT;
  const mismoPlazo = !adelanta;

  // Sin signo: el verbo de la frase ya dice la direccion, y «BAJA +14,1 %» se lee mal
  // porque parece que sube.
  const costePct = enPorcentaje(Math.abs(coste.deltaPct));
  const plazoPct = enPorcentaje(Math.abs(plazo.ahorroPct));

  if (bajaCoste) {
    // Contraintuitivo pero real: si la espera cuesta mas que la prima, trabajar fuera
    // de jornada sale mas barato. Callarlo seria esconder el unico caso en el que la
    // intuicion normal esta al reves.
    notas.push({ nivel: 'ok', texto: adelanta
      ? `Con horas extra el coste BAJA ${costePct} Y se entrega ${plazoPct} antes: `
        + 'aquí no hay disyuntiva, el plan con extras gana en las dos. Es el caso en el que la '
        + 'intuición falla, porque la espera que se ahorra cuesta más que la prima.'
      : `Con horas extra el coste BAJA ${costePct} sin mover el plazo: abrirlas sale más barato. `
        + 'Es el caso en el que la intuición falla.' });
  } else if (subeCoste && mismoPlazo) {
    notas.push({ nivel: 'mal',
      texto: `Con horas extra el coste sube ${costePct} y el plazo NO cambia: `
        + 'el trabajo cabe en la jornada. Abrirlas solo añade factura.' });
  } else if (subeCoste && adelanta) {
    notas.push({ nivel: 'aviso',
      texto: `Con horas extra pagas ${costePct} más y adelantas ${plazoPct} del plazo `
        + `(${enDias(Math.abs(plazo.deltaDias))}): ${enDias(plazo.normalDias)} frente a ${enDias(plazo.extraDias)}.` });
  } else {
    notas.push({ nivel: 'ok',
      texto: 'Los dos planes coinciden en coste y plazo: el trabajo cabe en la jornada '
        + 'y las horas extra no cambian nada. Esta corrida no justifica ninguna de las dos.' });
  }

  // La otra cara, SOLO cuando de verdad es la otra cara: si el plan barato tambien es
  // el rapido, ya lo dijo la nota de arriba y repetirlo al reves seria mentir.
  if (adelanta && subeCoste) {
    notas.push({ nivel: 'info',
      texto: `Sin horas extra el coste es ${costePct} menor `
        + `(${importe(Math.abs(coste.delta))} menos) pero tardas ${plazoPct} más.` });
  }

  // Que produzcan lo mismo no es un detalle: es lo que hace que comparar los totales
  // sea legítimo en vez de una trampa.
  if (piezas.iguales && piezas.normal > 0) {
    notas.push({
      nivel: 'info',
      texto: `Los dos planes entregan las mismas ${piezas.normal} piezas: la diferencia `
        + 'es de plazo y de dinero, no de producción, así que los totales se pueden comparar directamente.'
    });
  } else if (!piezas.iguales) {
    notas.push({
      nivel: 'mal',
      texto: `Los planes NO entregan lo mismo (${piezas.normal} frente a ${piezas.extra}): `
        + 'comparar el coste total sería engañoso. Usa el coste por pieza.'
    });
  }

  // El desglose de la prima solo cuando hay prima: si el plan extra no abrio ninguna,
  // este dato no aporta nada.
  if (primas.delta > 0) {
    const parte = espera.delta < 0
      ? ` De ese aumento, la prima doble y triple son ${redondear(primas.delta)}, y la espera baja ${redondear(Math.abs(espera.delta))}.`
      : '';
    notas.push({ nivel: 'info', texto: `Primas de horas extra: ${importe(primas.normal)} → ${importe(primas.extra)}.${parte}` });
  }

  return notas;
};

// ---------------------------------------------------------------------------
// El grafico, en SVG
// ---------------------------------------------------------------------------

/**
 * Curva de produccion acumulada, en SVG.
 *
 * SVG y no un lienzo de Chart.js por tres motivos concretos: el resumen se INYECTA como
 * HTML (y un <script> dentro de innerHTML no se ejecuta, asi que un grafico de Chart.js
 * no llegaria a dibujarse), se imprime (y un SVG sale nitido en papel), y se puede
 * comprobar en un arnes de Node, porque el SVG es texto.
 *
 * `techo` y `fechas` llegan de fuera y son LOS MISMOS para los dos planes: es lo que
 * hace que los dos graficos se puedan comparar de un vistazo.
 */
export const svgAcumulada = ({ titulo, series, fechas, techo, color, alto = 200 }) => {
  const ancho = 640;
  const izq = 52, der = ancho - 18, arriba = 34, abajo = alto - 26;
  const n = fechas.length;

  const x = (i) => (n <= 1 ? (izq + der) / 2 : izq + (i / (n - 1)) * (der - izq));
  const y = (v) => abajo - (Math.min(v, techo) / techo) * (abajo - arriba);

  // Lineas de referencia: cuatro tramos, siempre menos lineas que datos (una rejilla
  // mas tupida que los datos tapa lo que se quiere leer).
  const rejilla = [ 0, 0.25, 0.5, 0.75, 1 ].map((f) => {
    const valor = techo * f;
    return `<line x1="${izq}" y1="${y(valor)}" x2="${der}" y2="${y(valor)}" stroke="#e6e8eb" stroke-width="1"></line>`
      + `<text x="${izq - 6}" y="${y(valor) + 3.5}" text-anchor="end" font-size="10" fill="#6b7280">${Math.round(valor)}</text>`;
  }).join('');

  // Etiquetas del eje X: la primera, la ultima y unas pocas en medio. Con 30 dias,
  // ponerlas todas las convierte en una mancha gris.
  const salto = Math.max(1, Math.ceil(n / 5));
  const etiquetasX = fechas.map((f, i) => (
    (i === 0 || i === n - 1 || i % salto === 0)
      ? `<text x="${x(i)}" y="${abajo + 14}" text-anchor="middle" font-size="10" fill="#6b7280">${etiquetaDeFecha(f)}</text>`
      : ''
  )).join('');

  const puntos = series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const area = `${izq},${abajo} ${puntos} ${x(n - 1)},${abajo}`;
  const ultimo = series.length ? series[series.length - 1] : 0;

  return `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" height="${alto}" role="img"
         aria-label="${titulo}. Producción acumulada por día, hasta ${ultimo} piezas.">
      <text x="${izq}" y="16" font-size="12.5" font-weight="600" fill="#334155">${titulo}</text>
      <text x="${izq}" y="29" font-size="10.5" fill="#6b7280">Misma escala y mismas fechas que el otro plan</text>
      ${rejilla}
      <polygon points="${area}" fill="${color}" opacity="0.10"></polygon>
      <polyline points="${puntos}" fill="none" stroke="${color}" stroke-width="2.2"
        stroke-linejoin="round" stroke-linecap="round"></polyline>
      ${n ? `<circle cx="${x(n - 1)}" cy="${y(ultimo)}" r="3.4" fill="${color}"></circle>` : ''}
      <text x="${der}" y="${y(ultimo) - 8}" text-anchor="end" font-size="11.5" font-weight="700" fill="${color}">${ultimo}</text>
      ${etiquetasX}
    </svg>`;
};
