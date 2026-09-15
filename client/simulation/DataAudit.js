/**
 * Diagnostico de datos: que se puede medir con lo que hay y que falta para medir
 * lo que aun no se puede.
 *
 * Para que sirve: la pregunta del analista es «quiero medir ESTO, ¿que data
 * necesito?». El programa sabe responderla porque conoce, capacidad por capacidad,
 * cual es el dato minimo que la hace funcionar. Sin esto, la unica forma de
 * descubrir que falta el peso de una tarea es simular y encontrar un cero.
 *
 * Tres reglas de presentacion, y las tres importan:
 *
 *   1. Un dato que FALTA se dice con su consecuencia («sin distancia no hay
 *      kg·m»). Un aviso sin consecuencia no se lee dos veces.
 *   2. El estado es LISTO / PARCIAL / FALTA, no «si/no»: «tienes carga en 2 de 5
 *      tareas» es informacion, y «no» no lo seria.
 *   3. Nada de esto evalua riesgo: cuenta datos. Que 12 t arrastradas sea mucho o
 *      poco lo decide el analista, con los umbrales que el mismo declaro.
 */

export const ESTADOS = [ 'listo', 'parcial', 'falta' ];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const texto = (v) => String(v == null ? '' : v).trim();

/**
 * Una capacidad medible y lo que exige.
 *
 * `requisitos` es una lista de { dato, campo, minimo, opcional, consecuencia }.
 * `campo` es una ruta dentro del inventario (ver `inventarioDe`), y `minimo` es
 * cuantas unidades tienen que cumplirlo para darlo por bueno.
 */
export const CAPACIDADES = [
  {
    id: 'coste',
    titulo: 'Coste del proceso (operación, primas y espera)',
    porque: 'Es lo que se paga por producir. La base de cualquier comparación de planes.',
    requisitos: [
      { dato: 'Tarifa por hora', consecuencia: 'sin tarifa no hay ningún importe',
        campo: 'global.tarifa', minimo: 1 },
      { dato: 'Tiempo de proceso por tarea', consecuencia: 'sin duración no hay horas que costear',
        campo: 'tarea.processingTime', minimo: 1 }
    ]
  },
  {
    id: 'ciclo',
    titulo: 'Tiempo de ciclo y sus percentiles (p50/p90/p95/p99)',
    porque: 'La media esconde la cola; el p95 es lo que rompe un plazo.',
    requisitos: [
      { dato: 'Tiempo de proceso por tarea', consecuencia: 'sin duración no hay ciclo',
        campo: 'tarea.processingTime', minimo: 1 }
    ]
  },
  {
    id: 'capacidad',
    titulo: 'Capacidad, utilización (ρ) y cuello de botella',
    porque: 'Dice si el plan cabe en la plantilla o si la cola crece sin límite.',
    requisitos: [
      { dato: 'Piscinas de recursos con su cantidad', consecuencia: 'sin piscinas no hay ρ que calcular',
        campo: 'piscina.conCantidad', minimo: 1 },
      { dato: 'Tiempo de proceso por tarea', consecuencia: 'ρ necesita el tiempo que ocupa la tarea',
        campo: 'tarea.processingTime', minimo: 1 }
    ]
  },
  {
    id: 'colas',
    titulo: 'Colas y tiempo de espera por recurso',
    porque: 'La espera es el coste oculto de ir justo de gente.',
    requisitos: [
      { dato: 'Piscinas de recursos', consecuencia: 'sin piscinas no hay a quién esperar',
        campo: 'piscina.conCantidad', minimo: 1 },
      { dato: 'Tareas asignadas a una piscina', consecuencia: 'una tarea sin piscina nunca espera',
        campo: 'tarea.recurso', minimo: 1 }
    ]
  },
  {
    id: 'lotes',
    titulo: 'Producción por lotes: ciclo de lote, parones y firmas',
    porque: 'Con lotes, la muestra efectiva son los lotes, no las piezas.',
    requisitos: [
      { dato: 'Llegadas por lotes activadas', consecuencia: 'sin lotes las llegadas van una a una',
        campo: 'global.lots', minimo: 1 }
    ]
  },
  {
    id: 'laboral',
    titulo: 'Cumplimiento de la LFT (topes de extra y primas)',
    porque: 'Pasarse de un tope no solo cuesta más: es ilegal.',
    requisitos: [
      { dato: 'Reglas laborales declaradas', consecuencia: 'sin reglas solo se puede costear, no dictaminar',
        campo: 'global.labor', minimo: 1 }
    ]
  },
  {
    id: 'calendario',
    titulo: 'Jornada real: tramos, descansos y arranque lento',
    porque: 'Una jornada de 8 h no son 8 h de trabajo; sin esto la capacidad sale inflada.',
    requisitos: [
      { dato: 'Horario de la jornada', consecuencia: 'sin horario el reloj no sabe cuándo se trabaja',
        campo: 'global.calendario', minimo: 1 },
      { dato: 'Descansos declarados', consecuencia: 'sin descansos la capacidad sale inflada',
        campo: 'global.descansos', minimo: 1, opcional: true },
      { dato: 'Curva de arranque', consecuencia: 'sin curva el arranque lento no se modela',
        campo: 'global.arranque', minimo: 1, opcional: true }
    ]
  },
  {
    id: 'calidad',
    titulo: 'Calidad: fallos y retrabajo',
    porque: 'El retrabajo suma tiempo al ciclo y coste al proceso.',
    requisitos: [
      { dato: 'Tasa de fallo en alguna tarea', consecuencia: 'con todo a 0 el modelo es determinista',
        campo: 'tarea.fallo', minimo: 1, opcional: true }
    ]
  },
  {
    id: 'carga',
    titulo: 'Carga física: masa cargada, masa arrastrada y kg·m',
    porque: 'Es el dato que dice «moverás 12 t a 8 m durante 6 h». El sistema no valora el riesgo.',
    requisitos: [
      { dato: 'Masa (cargada o arrastrada) en alguna tarea', consecuencia: 'sin masa no hay toneladas que reportar',
        campo: 'tarea.carga', minimo: 1 },
      { dato: 'Distancia declarada en esas tareas', consecuencia: 'sin distancia no hay kg·m, solo kg',
        campo: 'tarea.distancia', minimo: 1, opcional: true }
    ]
  },
  {
    id: 'personas',
    titulo: 'Colaboradores con nombre: quién trabaja y cuánto',
    porque: 'Sin nombres solo se sabe que la piscina trabajó, no quién.',
    requisitos: [
      { dato: 'Piscinas declaradas', consecuencia: 'los nombres viven dentro de una piscina',
        campo: 'piscina.conCantidad', minimo: 1 },
      { dato: 'Miembros con nombre en alguna piscina', consecuencia: 'sin nombres el informe va por piscina',
        campo: 'miembro.total', minimo: 1 }
    ]
  },
  {
    id: 'habilidades',
    titulo: 'Bloqueo por habilidad y diagnóstico de absorción',
    porque: 'Dice qué tareas se atascan porque nadie sabe hacerlas, y quién podría absorber qué.',
    requisitos: [
      { dato: 'Miembros con nombre', consecuencia: 'una habilidad necesita una persona que la tenga',
        campo: 'miembro.total', minimo: 1 },
      { dato: 'Habilidades declaradas en alguna persona', consecuencia: 'sin habilidades no hay elegibilidad que calcular',
        campo: 'miembro.habilidades', minimo: 1, opcional: true },
      { dato: 'Habilidades exigidas en alguna tarea', consecuencia: 'sin exigencia no hay bloqueo que detectar',
        campo: 'tarea.habilidad', minimo: 1, opcional: true }
    ]
  },
  {
    id: 'operatividad',
    titulo: 'Tiempo activo y muerto por persona, y coste por persona',
    porque: 'Muestra quién tiene holgura y quién está parado, sin asignar a nadie solo.',
    requisitos: [
      { dato: 'Miembros con nombre', consecuencia: 'sin nombres no hay a quién atribuir el tiempo',
        campo: 'miembro.total', minimo: 1 },
      { dato: 'Tarifa por persona', consecuencia: 'sin tarifa propia se usa la de la planta para todos',
        campo: 'miembro.tarifa', minimo: 1, opcional: true },
      { dato: 'Carga máxima declarada', consecuencia: 'sin ella no se puede marcar un exceso por persona',
        campo: 'miembro.cargaMaxima', minimo: 1, opcional: true }
    ]
  },
  {
    id: 'reparto',
    titulo: 'Reparto por caminos (probabilidad de cada salida)',
    porque: 'Con un reparto mal puesto, el motor manda el sobrante a la última rama sin avisar.',
    requisitos: [
      { dato: 'Compuertas exclusivas en el diagrama', consecuencia: 'el reparto solo aplica a compuertas exclusivas',
        campo: 'compuerta.total', minimo: 1 }
    ]
  }
];

/**
 * Inventario de datos del modelo, contado.
 *
 * Se construye UNA vez por apertura del panel: el diagnostico no simula nada y no
 * debe tocar el motor, porque tiene que poder decir «falta esto» ANTES de correr.
 */
export const inventarioDe = ({ tareas = [], flujos = [], pools = [], root = null }) => {
  const inv = {
    tarea: {
      total: tareas.length,
      processingTime: 0,
      fallo: 0,
      recurso: 0,
      carga: 0,
      distancia: 0,
      habilidad: 0,
      porLote: 0,
      barrier: 0
    },
    piscina: { total: pools.length, conCantidad: 0 },
    miembro: { total: 0, tarifa: 0, habilidades: 0, cargaMaxima: 0 },
    compuerta: { total: 0, conReparto: 0 },
    global: {
      calendario: 0,
      descansos: 0,
      arranque: 0,
      lots: 0,
      labor: 0,
      tarifa: 0,
      semilla: 0
    }
  };

  tareas.forEach((t) => {
    const d = t && t.datos ? t.datos : {};

    if (d.processingTime && num(d.processingTime.value) != null) inv.tarea.processingTime++;
    else if (d.processingTime && num(d.processingTime.min) != null) inv.tarea.processingTime++;

    if (num(d.failureRate) > 0) inv.tarea.fallo++;
    if (d.resources && texto(d.resources.pool)) inv.tarea.recurso++;

    const carga = d.carga || {};
    if (num(carga.masaCargadaKg) > 0 || num(carga.masaArrastradaKg) > 0) inv.tarea.carga++;
    if (num(carga.distanciaM) > 0) inv.tarea.distancia++;

    if (texto(d.habilidad) || (Array.isArray(d.habilidades) && d.habilidades.length)) inv.tarea.habilidad++;
    if (texto(d.frequency) === 'lot') {
      inv.tarea.porLote++;
      if (d.barrier) inv.tarea.barrier++;
    }
  });

  pools.forEach((p) => {
    if (num(p && p.quantity) >= 1) inv.piscina.conCantidad++;
    const miembros = Array.isArray(p && p.members) ? p.members : [];
    miembros.forEach((m) => {
      if (!m || !texto(m.nombre)) return;
      inv.miembro.total++;
      if (num(m.tarifaHora) != null) inv.miembro.tarifa++;
      if (Array.isArray(m.habilidades) && m.habilidades.length) inv.miembro.habilidades++;
      if (num(m.cargaMaximaKg) != null) inv.miembro.cargaMaxima++;
    });
  });

  flujos.forEach((f) => {
    inv.compuerta.total++;
    if (num(f && f.datos && f.datos.branchingProbability) != null) inv.compuerta.conReparto++;
  });

  const cal = (root && root.calendar) || null;
  if (cal && cal.workingHours && cal.workingHours.start) inv.global.calendario = 1;
  if (cal && Array.isArray(cal.breaks) && cal.breaks.length) inv.global.descansos = cal.breaks.length;
  if (root && root.warmup && root.warmup.shape && root.warmup.shape !== 'none') inv.global.arranque = 1;
  if (root && root.lots && root.lots.enabled) inv.global.lots = 1;
  if (root && root.labor) inv.global.labor = 1;
  if (root && root.cost && num(root.cost.baseRatePerHour) > 0) inv.global.tarifa = 1;
  if (root && num(root.seed) != null) inv.global.semilla = 1;

  return inv;
};

/** Lee un valor del inventario por la ruta anotada en el requisito. */
const leer = (inv, campo) => {
  const partes = String(campo).split('.');
  let v = inv;
  for (const p of partes) {
    if (v == null) return 0;
    v = v[p];
  }
  return num(v) || 0;
};

/**
 * Evalua una capacidad contra el inventario.
 *
 * LISTO: todos los requisitos obligatorios se cumplen.
 * PARCIAL: se cumple alguno, o solo faltan los OPCIONALES (se puede medir, pero
 *          con menos detalle, y se dice cuál).
 * FALTA: no se cumple ningún obligatorio.
 */
export const evaluarCapacidad = (capacidad, inv) => {
  const obligatorios = capacidad.requisitos.filter((r) => !r.opcional);
  const opcionales = capacidad.requisitos.filter((r) => r.opcional);

  const detalle = capacidad.requisitos.map((r) => {
    const tiene = leer(inv, r.campo);
    return { ...r, tiene, cumple: tiene >= (r.minimo || 1) };
  });

  const faltanObligatorios = detalle.filter((d) => !d.opcional && !d.cumple);
  const faltanOpcionales = detalle.filter((d) => d.opcional && !d.cumple);
  const algunObligatorio = detalle.some((d) => !d.opcional && d.cumple);

  let estado;
  if (!obligatorios.length || !faltanObligatorios.length) {
    estado = faltanOpcionales.length ? 'parcial' : 'listo';
  } else if (algunObligatorio) {
    estado = 'parcial';
  } else {
    estado = 'falta';
  }

  return {
    id: capacidad.id,
    titulo: capacidad.titulo,
    porque: capacidad.porque,
    estado,
    detalle,
    // Solo lo que FALTA, con su consecuencia: es lo que el usuario tiene que leer.
    pendientes: [ ...faltanObligatorios, ...faltanOpcionales ].map((d) => ({
      dato: d.dato,
      consecuencia: d.consecuencia,
      opcional: Boolean(d.opcional)
    }))
  };
};

/** Diagnostico completo, con el recuento de cabecera. */
export const diagnosticar = (inv) => {
  const capacidades = CAPACIDADES.map((c) => evaluarCapacidad(c, inv));
  return {
    inventario: inv,
    capacidades,
    recuento: {
      listo: capacidades.filter((c) => c.estado === 'listo').length,
      parcial: capacidades.filter((c) => c.estado === 'parcial').length,
      falta: capacidades.filter((c) => c.estado === 'falta').length,
      total: capacidades.length
    }
  };
};

/** Las capacidades que se pueden medir ya (para el resumen corto). */
export const disponibles = (diag) => diag.capacidades.filter((c) => c.estado !== 'falta');

/** Lo que falta, agrupado por dato: un dato puede desbloquear varias capacidades. */
export const pendientesPorDato = (diag) => {
  const mapa = new Map();
  diag.capacidades.forEach((c) => {
    if (c.estado === 'listo') return;
    c.pendientes.forEach((p) => {
      const clave = p.dato;
      if (!mapa.has(clave)) mapa.set(clave, { dato: p.dato, consecuencia: p.consecuencia, desbloquea: [] });
      mapa.get(clave).desbloquea.push(c.titulo);
    });
  });
  return Array.from(mapa.values()).sort((a, b) => b.desbloquea.length - a.desbloquea.length);
};
