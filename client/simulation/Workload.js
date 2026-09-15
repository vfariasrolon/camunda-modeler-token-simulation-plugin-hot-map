/**
 * Personas y carga fisica: quien trabaja, cuanto levanta y cuanto arrastra.
 *
 * Tres ideas mandan en este modulo, y las tres son decisiones cerradas (no
 * preferencias de estilo). Si se rompen, el resultado es incorrecto aunque el
 * programa funcione:
 *
 *   1. MASA CARGADA y MASA ARRASTRADA son dos series que NUNCA se suman. Cargar
 *      (soportar el peso) y arrastrar (deslizarlo) no son la misma magnitud, y
 *      un total unico las mezcla. Cualquier equivalencia la declara el analista.
 *   2. El peso se aplica segun la FRECUENCIA de la tarea: una tarea `lot` mueve
 *      su masa UNA vez por lote, no una por pieza. Sin esto, mover 12 kg por
 *      pieza en un lote de 20 daria 240 kg cuando en planta fue un solo viaje.
 *   3. El sistema REPORTA Y MARCA, no decide. La carga maxima recomendada no
 *      altera los tiempos ni rechaza tareas: es un aviso con su umbral al lado.
 */

// Umbrales de referencia. NO son del programa: son un punto de partida editable,
// y el informe SIEMPRE imprime el corte que aplico. Se separan por escala porque
// una tarea de 20 kg repetida 500 veces no es lo mismo que una sola vez.
export const UMBRALES_CARGA = {
  // Por LEVANTAMIENTO: lo que pesa una pieza de una vez. La banda de referencia
  // mas citada en ergonomia para levantamiento repetido ronda los 25 kg.
  tareaKg: { bajo: 10, medio: 25 },
  // ACUMULADO por persona: toneladas movidas en la jornada simulada.
  personaToneladas: { bajo: 5, medio: 15 },
  // ACUMULADO por area (proceso completo).
  areaToneladas: { bajo: 20, medio: 60 }
};

export const BANDAS = [ 'baja', 'media', 'alta' ];

/** Banda de un valor segun dos cortes. `bajo <= v < medio` es «baja». */
export const bandaDe = (valor, cortes) => {
  const v = Number(valor) || 0;
  if (!cortes) return 'baja';
  if (v < (Number(cortes.bajo) || 0)) return 'baja';
  if (v < (Number(cortes.medio) || 0)) return 'media';
  return 'alta';
};

const num = (v, alt = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : alt;
};

const lista = (v) => (Array.isArray(v) ? v : [])
  .map((s) => String(s == null ? '' : s).trim())
  .filter(Boolean);

/** Normaliza la carga declarada en una tarea. Sin carga, todo queda a 0. */
export const normalizeCarga = (cfg) => {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  return {
    masaCargadaKg: num(c.masaCargadaKg),
    masaArrastradaKg: num(c.masaArrastradaKg),
    distanciaM: num(c.distanciaM)
  };
};

export const hayCarga = (c) => Boolean(c) && (c.masaCargadaKg > 0 || c.masaArrastradaKg > 0);

/**
 * Normaliza los miembros de una piscina.
 *
 * `quantity` NO se toca: sigue mandando la CAPACIDAD (cuantas unidades hay). Los
 * miembros solo dan identidad, tarifa, habilidades y carga maxima. Con menos
 * miembros que `quantity` hay puestos sin nombre, y eso es legitimo: una piscina
 * de 3 puestos con 2 nombres conocidos sigue teniendo 3 puestos.
 */
export const normalizeMembers = (members) => {
  if (!Array.isArray(members)) return [];
  const conDatos = members.filter((m) => m && typeof m === 'object');
  return conDatos.map((m, i) => ({
    nombre: String(m.nombre || '').trim() || `Puesto ${i + 1}`,
    tarifaHora: Number.isFinite(Number(m.tarifaHora)) ? Number(m.tarifaHora) : null,
    habilidades: lista(m.habilidades),
    cargaMaximaKg: Number.isFinite(Number(m.cargaMaximaKg)) ? Number(m.cargaMaximaKg) : null
  }));
};

/**
 * Habilidades que una tarea EXIGE.
 *
 * Se aceptan dos formas para no obligar a elegir: `habilidades: [...]` (lista) o
 * `habilidad: "soldadura"` (una sola, que es el caso comun). Normalizar aqui evita
 * que el motor tenga que mirar las dos.
 */
export const habilidadesRequeridas = (data) => {
  const d = data && typeof data === 'object' ? data : {};
  if (Array.isArray(d.habilidades)) return lista(d.habilidades);
  if (d.habilidad) return lista([ d.habilidad ]);
  return [];
};

/**
 * ¿Esta persona puede hacer esta tarea?
 *
 * Regla CONSERVADORA y decidida: si no hay ninguna unidad en la piscina con las
 * habilidades que la tarea exige, la tarea queda BLOQUEADA. Un dato que falta
 * bloquea, no acelera. Es, ademas, lo unico que puede producir la categoria de
 * tiempo muerto «bloqueado por habilidad».
 */
export const puedeHacerla = (miembro, requeridas) => {
  if (!requeridas || !requeridas.length) return true;
  if (!miembro) return false;
  return requeridas.every((h) => miembro.habilidades.includes(h));
};

/** ¿Alguna unidad de la piscina puede hacer la tarea? */
export const poolPuedeHacerla = (pool, requeridas) => {
  if (!requeridas || !requeridas.length) return true;
  if (!pool || !pool.members || !pool.members.length) return true; // sin nombres no hay a quien filtrar
  return pool.members.some((m) => puedeHacerla(m, requeridas));
};

/**
 * Elige la persona que toma la unidad, EN RONDA.
 *
 * En ronda y no «la primera libre» por un motivo concreto: con dos personas
 * equivalentes, «la primera» concentraria todo el trabajo en una y dejaria a la
 * otra ociosa, y el informe diria que una esta saturada y la otra sin hacer
 * nada. Con ronda reparten, que es lo que pasaria en la planta.
 */
export const elegirPorRonda = (miembros, ultimoIndice) => {
  if (!miembros || !miembros.length) return { miembro: null, indice: -1 };
  const n = miembros.length;
  const siguiente = ((Number(ultimoIndice) || 0) + 1) % n;
  return { miembro: miembros[siguiente], indice: siguiente };
};

/**
 * Acumula la carga de UNA ejecucion de una tarea.
 *
 * Devuelve los incrementos para no obligar a quien llama a conocer la forma del
 * acumulador. `veces` es el numero de repeticiones de esa ejecucion, que sale de
 * la FRECUENCIA de la tarea (1 por lote, 1 por pieza), no de los tokens.
 */
export const cargaDeUnaEjecucion = (carga, veces = 1) => {
  const c = normalizeCarga(carga);
  const n = Math.max(0, Number(veces) || 0);
  return {
    cargadaKg: c.masaCargadaKg * n,
    arrastradaKg: c.masaArrastradaKg * n,
    cargadaKgM: c.masaCargadaKg * n * c.distanciaM,
    arrastradaKgM: c.masaArrastradaKg * n * c.distanciaM,
    distanciaM: c.distanciaM * n
  };
};

/** Acumulador de carga vacio. */
export const cargaVacia = () => ({
  cargadaKg: 0,
  arrastradaKg: 0,
  cargadaKgM: 0,
  arrastradaKgM: 0,
  distanciaM: 0,
  ejecuciones: 0
});

export const acumularCarga = (acc, inc) => {
  const a = acc || cargaVacia();
  return {
    cargadaKg: a.cargadaKg + inc.cargadaKg,
    arrastradaKg: a.arrastradaKg + inc.arrastradaKg,
    cargadaKgM: a.cargadaKgM + inc.cargadaKgM,
    arrastradaKgM: a.arrastradaKgM + inc.arrastradaKgM,
    distanciaM: a.distanciaM + inc.distanciaM,
    ejecuciones: a.ejecuciones + (inc.veces == null ? 1 : inc.veces)
  };
};

export const toneladas = (kg) => (Number(kg) || 0) / 1000;

/**
 * Avisos ergonomicos de una persona, CON SU UMBRAL AL LADO.
 *
 * Un aviso sin el corte que lo dispara es una cifra con autoridad falsa, asi que
 * cada uno lleva `umbral` y `banda`, y el informe los imprime. El programa no
 * valora el riesgo: dice «12 t arrastradas, banda alta (> 10 t)» y el analista
 * decide.
 */
export const avisosDeCarga = (carga, umbrales = UMBRALES_CARGA) => {
  const c = carga || cargaVacia();
  const avisos = [];

  const tCargada = toneladas(c.cargadaKg);
  const tArrastrada = toneladas(c.arrastradaKg);

  if (c.cargadaKg > 0) {
    avisos.push({
      serie: 'cargada',
      kg: c.cargadaKg,
      toneladas: tCargada,
      banda: bandaDe(tCargada, umbrales.personaToneladas),
      umbral: umbrales.personaToneladas,
      texto: `${tCargada.toFixed(2)} t cargadas`
    });
  }

  if (c.arrastradaKg > 0) {
    avisos.push({
      serie: 'arrastrada',
      kg: c.arrastradaKg,
      toneladas: tArrastrada,
      banda: bandaDe(tArrastrada, umbrales.personaToneladas),
      umbral: umbrales.personaToneladas,
      texto: `${tArrastrada.toFixed(2)} t arrastradas`
    });
  }

  return avisos;
};

/** Carga maxima mas restrictiva del conjunto (la de la persona que la declaro). */
export const cargaMaximaDe = (miembros) => {
  const valores = (miembros || [])
    .map((m) => (m && Number.isFinite(m.cargaMaximaKg) ? m.cargaMaximaKg : null))
    .filter((v) => v != null);
  return valores.length ? Math.min(...valores) : null;
};

/** Redaccion de los avisos, para el informe. */
export const describirAvisos = (avisos) => {
  if (!avisos || !avisos.length) return 'sin carga registrada';
  return avisos.map((a) => `${a.texto} (banda ${a.banda}, corte ${a.umbral.bajo}/${a.umbral.medio} t)`).join(' · ');
};
