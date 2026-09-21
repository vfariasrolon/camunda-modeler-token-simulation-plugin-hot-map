/**
 * VALIDACION DE LA DESIGNACION DE MIEMBRO: avisar antes de simular, no despues.
 *
 * QUE ES UNA DESIGNACION: una tarea puede nombrar al miembro concreto que la hace («solo lizz
 * monta esto»). Si lo nombra, el motor ESPERA a esa persona en vez de tomar a cualquiera de la
 * piscina. Es una habilitacion nominal, que en planta es lo normal para una maquina o una
 * certificacion.
 *
 * POR QUE HACE FALTA VALIDARLA: la designacion es una restriccion, asi que puede ATASCAR el
 * proceso sin que el usuario se entere hasta ver resultados raros:
 *
 *   - El miembro no esta en la piscina: la tarea se bloquea siempre. La corrida termina con
 *     trabajo sin hacer y sin ningun error visible.
 *   - El miembro no tiene la habilidad que la tarea exige: lo mismo.
 *   - La tarea no tiene piscina: el miembro designado no se puede usar, porque sin piscina no hay
 *     a quien pedirle.
 *
 * Y el sintoma de los tres es el MISMO desde fuera -«la simulacion se queda corta»- asi que el
 * mensaje tiene que decir cual de los tres es y en que tarea.
 *
 * ESTE MODULO ES PURO: recibe las tareas y las piscinas ya normalizadas y devuelve avisos. No
 * toca bpmn-js ni el DOM, asi que el arnes lo comprueba sin navegador.
 */

/**
 * Avisos de designacion del modelo entero.
 *
 * `tareas` es `[{ id, nombre, pool, miembro, habilidades }]` y `piscinas` es
 * `[{ name, members: [{ nombre, habilidades }] }]`. Se recibe la lista ya plana -y no los
 * elementos de bpmn-js- para que el modulo no dependa de la forma del diagrama.
 *
 * Devuelve `{ errores, avisos }`: los errores BLOQUEAN la tarea entera, y los avisos solo la
 * dejan sin el reparto que el usuario cree haber declarado.
 */
export const avisosDeDesignacion = (tareas, piscinas) => {
  const errores = [];
  const avisos = [];
  const porNombre = new Map((piscinas || []).map((p) => [ p.name, p ]));

  (tareas || []).forEach((t) => {
    const miembro = t && t.miembro;
    if (!miembro) return;   // sin designacion no hay nada que validar (el caso normal)

    const etiqueta = (t.nombre || t.id || '(sin nombre)');

    // SIN PISCINA: el miembro no se puede usar. Se avisa distinto de «no esta en la piscina»
    // porque el arreglo es otro -elegir una piscina, no cambiar el nombre-.
    if (!t.pool) {
      errores.push({
        tarea: t.id,
        etiqueta,
        motivo: 'sin-piscina',
        texto: `La tarea «${etiqueta}» designa a «${miembro}» pero no tiene piscina asignada. `
          + 'Sin piscina no hay a quién pedirle el recurso, así que la designación no se aplica.'
      });
      return;
    }

    const pool = porNombre.get(t.pool);
    if (!pool) {
      errores.push({
        tarea: t.id,
        etiqueta,
        motivo: 'piscina-desconocida',
        texto: `La tarea «${etiqueta}» designa a «${miembro}» pero su piscina «${t.pool}» no existe. `
          + 'La tarea se quedará sin recurso.'
      });
      return;
    }

    const suyo = (pool.members || []).find((m) => m && m.nombre === miembro);
    if (!suyo) {
      // SE NOMBRAN LOS MIEMBROS DISPONIBLES: es la diferencia entre «hay un error» y «escribe
      // uno de estos». Un aviso que no dice las alternativas obliga a ir a mirar la otra pestaña.
      const disponibles = (pool.members || []).map((m) => m && m.nombre).filter(Boolean);
      errores.push({
        tarea: t.id,
        etiqueta,
        motivo: 'miembro-ausente',
        texto: `La tarea «${etiqueta}» designa a «${miembro}», que no está en la piscina «${t.pool}». `
          + (disponibles.length
            ? `Los miembros de esa piscina son: ${disponibles.join(', ')}.`
            : 'Esa piscina no tiene ningún miembro dado de alta.')
      });
      return;
    }

    // La habilidad: si la piscina tiene nombres, la designacion tiene que poder hacer la tarea.
    const requeridas = Array.isArray(t.habilidades) ? t.habilidades.filter(Boolean) : [];
    if (requeridas.length) {
      const tiene = Array.isArray(suyo.habilidades) ? suyo.habilidades : [];
      const faltan = requeridas.filter((h) => !tiene.includes(h));
      if (faltan.length) {
        // SI HAY OTRO MIEMBRO QUE SI PUEDE, se dice: el arreglo más rápido es designar a ese, y
        // el usuario no tiene por qué saberse las habilidades de memoria.
        const alternativas = (pool.members || [])
          .filter((m) => m && m.nombre !== miembro && requeridas.every((h) => (m.habilidades || []).includes(h)))
          .map((m) => m.nombre);
        avisos.push({
          tarea: t.id,
          etiqueta,
          motivo: 'sin-habilidad',
          texto: `La tarea «${etiqueta}» designa a «${miembro}», que no tiene `
            + `${faltan.length === 1 ? 'la habilidad' : 'las habilidades'} `
            + `${faltan.join(', ')}, y la tarea ${requeridas.length === 1 ? 'la exige' : 'las exige'}. `
            + 'La tarea se quedará bloqueada en cada caso.'
            + (alternativas.length ? ` Sí puede(n): ${alternativas.join(', ')}.` : '')
        });
      }
    }
  });

  return { errores, avisos };
};

/**
 * Los miembros disponibles en una piscina, para poblar el desplegable de la tarea.
 *
 * Se ordena alfabeticamente porque un desplegable en orden de aparicion obliga a buscarlo a ojo, y
 * el mismo miembro puede estar en dos piscinas.
 */
export const miembrosDePiscina = (piscinas, nombrePiscina) => {
  const pool = (piscinas || []).find((p) => p && p.name === nombrePiscina);
  if (!pool) return [];
  return (pool.members || [])
    .map((m) => m && m.nombre)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es'));
};

/**
 * TODAS las habilidades dadas de alta en los recursos del modelo.
 *
 * POR QUE NO SE ESCRIBEN A MANO: una habilidad que la tarea exige y que nadie tiene BLOQUEA la
 * tarea, y ese es el peor fallo posible porque es silencioso -la corrida termina con trabajo sin
 * hacer y sin ningun error-. Ofreciendo solo las que existen, el error deja de poder cometerse.
 *
 * Sin duplicados y ordenadas: el mismo miembro puede estar en dos piscinas y la misma habilidad en
 * cinco personas.
 */
export const habilidadesDisponibles = (piscinas) => {
  const todas = new Set();
  (piscinas || []).forEach((p) => {
    (p && p.members ? p.members : []).forEach((m) => {
      (m && Array.isArray(m.habilidades) ? m.habilidades : []).forEach((h) => {
        if (h) todas.add(String(h).trim());
      });
    });
  });
  return [ ...todas ].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
};
