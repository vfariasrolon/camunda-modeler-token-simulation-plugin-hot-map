/**
 * CSV DE LA TABLA DE DATOS: exportar e importar las cuatro pestanas.
 *
 * QUE ES ESTE MODULO: el texto de ida y vuelta de la tabla de datos -Tareas, Compuertas,
 * Recursos y Global- y el parseo/serializacion de CSV. Se extrajo de `DataTablePanel.js`, que
 * tenia 3.800 lineas y estas dos operaciones se llevaban 686 de ellas.
 *
 * POR QUE SE PUEDE EXTRAER LIMPIAMENTE: es la parte del panel que NO toca el DOM ni bpmn-js. El
 * panel le pasa funciones de lectura (`_taskData`, `_getPools`...) y este modulo devuelve filas o
 * una lista de cambios `{ element, data }`. Asi la ida y vuelta del CSV se puede probar sola, sin
 * montar un diagrama ni un DOM.
 *
 * LO QUE **NO** HACE, y conviene saberlo: no escribe en el diagrama. `importar` decide QUE cambia
 * -compara con lo que hay y devuelve solo lo distinto-, pero aplicar los cambios es del panel,
 * porque eso ya necesita `modeling` y puede fallar por modo de solo lectura.
 */

// ---------------------------------------------------------------------------
// Parseo y serializacion
// ---------------------------------------------------------------------------

// Las unidades se escriben en PLURAL. No es una preferencia de estilo: `minute` se leeria como
// milisegundos -factor 60.000- y la corrida daria numeros absurdos sin ningun aviso, asi que el
// importador rechaza lo que no este en esta lista en vez de aceptarlo en silencio.
const TASK_UNITS = ['minutes', 'hours', 'seconds'];

const csvEscape = (value) => {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

/**
 * Parser tolerante: comillas dobles escapadas, campos multilinea y separador coma o punto y coma.
 *
 * El separador se DETECTA en la primera linea porque Excel en espanol exporta con ';'. Mirar solo
 * la coma partiria las filas de un CSV guardado desde Excel, y el sintoma -columnas desplazadas-
 * no dice que el problema es el separador.
 */
export const parseCsv = (text) => {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
};

/** Dispara la descarga de un archivo de texto. Es lo unico que toca el navegador. */
export const download = (filename, text, mime = 'text/csv;charset=utf-8;') => {
  const blob = new Blob([ '\uFEFF' + text ], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const NOMBRE_DE_PESTANA = { tasks: 'tareas', flows: 'flujos', resources: 'recursos', global: 'global' };

// ---------------------------------------------------------------------------
// Utilidades de campos
// ---------------------------------------------------------------------------

const redondear2 = (n) => Math.round(n * 100) / 100;
const pctATexto = (p) => String(redondear2((Number(p) || 0) * 100));
const pad = (n) => String(n).padStart(2, '0');
// `path` es una LISTA de claves, no un "a.b.c": asi lo declaran GLOBAL_FIELDS y los campos de
// regla laboral. Partirlo por puntos devolvia una ruta de una sola clave imposible de encontrar y
// el mapa global salia vacio.
const getByPath = (o, path) => path.reduce((a, k) => (a == null ? a : a[k]), o);
const esSi = (v) => String(v || '').trim().toLowerCase() === 'si' || String(v || '').trim() === '1';

// ---------------------------------------------------------------------------
// EXPORTAR
// ---------------------------------------------------------------------------

/**
 * Las filas del CSV de la pestana activa, con su cabecera en la primera.
 *
 * `ctx` trae las funciones de lectura del panel. Se pasan y no se importan porque son las que
 * saben de bpmn-js: este modulo no debe conocerlo.
 */
export const filasDePestana = (pestana, ctx) => {
  if (pestana === 'tasks') return filasDeTareas(ctx);
  if (pestana === 'flows') return filasDeFlujos(ctx);
  if (pestana === 'resources') return filasDeRecursos(ctx);
  return filasDeGlobal(ctx);
};

function filasDeTareas(ctx) {
  // Se exportan TAMBIEN las columnas de la triangular y las de recurso: antes el CSV solo llevaba
  // el tiempo fijo, asi que una tarea triangular salia con `tiempo_proceso` vacio y sus min/moda/max
  // se perdian de vista.
  //
  // La tasa de fallo se exporta en % (0-100) y con la columna renombrada a `tasa_fallo_pct`, igual
  // que el reparto de las compuertas: es lo que se ve en la tabla, y en Excel una columna rotulada
  // «tasa_fallo» con 0,05 se lee como si fuera medio por ciento. Un CSV exportado ANTES de este
  // cambio trae `tasa_fallo` en fraccion y se sigue importando (ver `importar`).
  const rows = [ [
    'id', 'nombre', 'distribucion',
    'tiempo_proceso', 'unidad_proceso', 'min', 'moda', 'max',
    'tasa_fallo_pct', 'retrabajo', 'unidad_retrabajo',
    'recurso', 'cant_recurso',
    'frecuencia', 'barrera_disp', 'barrera_min', 'barrera_moda', 'barrera_max', 'barrera_tol',
    'carga_kg', 'arrastre_kg', 'distancia_m', 'habilidad'
  ] ];

  ctx.getTasks().forEach((el) => {
    const d = ctx.taskData(el);
    const tri = d.processingTime.distribution === 'triangular';
    // La barrera solo se exporta con «por lote»: en una tarea por token el motor no la lee, y
    // sacarla rellena daria a entender que si.
    const esLote = d.frequency === 'lot';
    const b = d.barrier || {};
    const c = d.carga || {};
    const hab = Array.isArray(d.habilidades) ? d.habilidades.join(' ') : (d.habilidad || '');

    rows.push([
      el.id,
      ctx.label(el),
      d.processingTime.distribution || 'fixed',
      tri ? '' : d.processingTime.value,
      d.processingTime.unit,
      tri ? d.processingTime.min : '',
      tri ? d.processingTime.mode : '',
      tri ? d.processingTime.max : '',
      pctATexto(d.failureRate),
      d.reworkTime.value,
      d.reworkTime.unit,
      (d.resources && d.resources.pool) || '',
      (d.resources && d.resources.quantityRequired) || '',
      esLote ? 'lot' : 'token',
      esLote ? b.availableProbability : '',
      esLote ? b.waitMin : '',
      esLote ? b.waitMode : '',
      esLote ? b.waitMax : '',
      esLote ? b.toleranceMinutes : '',
      c.masaCargadaKg == null ? '' : c.masaCargadaKg,
      c.masaArrastradaKg == null ? '' : c.masaArrastradaKg,
      c.distanciaM == null ? '' : c.distanciaM,
      hab
    ]);
  });

  return rows;
}

function filasDeFlujos(ctx) {
  // La columna se llama `probabilidad_pct` y va en % (0-100), no en fraccion: es lo que muestra y
  // edita la tabla. Un CSV exportado antes de este cambio trae `probabilidad` en 0-1 y se sigue
  // importando.
  const rows = [ [ 'id', 'compuerta', 'hacia', 'probabilidad_pct' ] ];
  ctx.getFlows().forEach((el) => {
    const d = ctx.flowData(el);
    rows.push([
      el.id,
      ctx.label(el.source),
      el.target ? ctx.label(el.target) : '',
      ctx.salidaUnica(el.source) ? '100' : pctATexto(d.branchingProbability)
    ]);
  });
  return rows;
}

function filasDeRecursos(ctx) {
  // Los miembros van DENTRO de una celda con `|` entre campos y `;` entre personas, para que el
  // CSV siga teniendo una fila por piscina y se pueda editar en Excel.
  const rows = [ [ 'nombre', 'cantidad', 'miembros', 'origen', 'cobro', 'tarifa_hora', 'precio_pieza' ] ];
  ctx.getPools().forEach((p) => {
    const miembros = (p.members || []).map((m) => {
      const partes = [ m.nombre ];
      partes.push(m.tarifaHora != null ? m.tarifaHora : '');
      partes.push(m.cargaMaximaKg != null ? m.cargaMaximaKg : '');
      partes.push((m.habilidades || []).join(' '));
      return partes.join('|');
    }).join(';');
    const externa = p.origen === 'externa';
    rows.push([
      p.name,
      p.quantity,
      miembros,
      externa ? 'externa' : '',
      externa ? (p.cobro || 'hora') : '',
      externa && p.cobro !== 'pieza' && p.tarifaHora != null ? p.tarifaHora : '',
      externa && p.cobro === 'pieza' && p.precioPieza != null ? p.precioPieza : ''
    ]);
  });
  return rows;
}

function filasDeGlobal(ctx) {
  const info = ctx.globalData();
  if (!info) throw new Error('No hay evento raíz configurado');

  const rows = [ [ 'campo', 'etiqueta', 'valor' ] ];
  ctx.globalFields.forEach((f) => {
    const v = getByPath(info.data, f.path);
    let text;
    if (f.kind === 'days') text = Array.isArray(v) ? v.join(',') : '';
    else if (f.kind === 'time') text = v && typeof v === 'object' ? `${pad(v.hour)}:${pad(v.minute)}` : '';
    else if (f.kind === 'checkbox') text = v === false ? 'no' : 'si';
    else text = v == null ? '' : v;
    rows.push([ f.key, f.label, text ]);
  });

  // Los descansos son una lista: una fila por dato, con clave `descanso.N.campo`. Asi sigue siendo
  // editable en Excel y vuelve entera al importar.
  const hhmm = (t) => (t && Number.isFinite(t.hour) ? `${pad(t.hour)}:${pad(t.minute)}` : '');
  ((info.data.calendar && info.data.calendar.breaks) || []).forEach((b, i) => {
    const n = i + 1;
    rows.push([ `descanso.${n}.inicio`, `Descanso ${n}: desde`, hhmm(b.start) ]);
    rows.push([ `descanso.${n}.fin`, `Descanso ${n}: hasta`, hhmm(b.end) ]);
    rows.push([ `descanso.${n}.cuentaComoJornada`, `Descanso ${n}: ¿cuenta como jornada?`, b.cuentaComoJornada ? 'si' : 'no' ]);
    rows.push([ `descanso.${n}.existeEnExtra`, `Descanso ${n}: ¿también en horas extra?`, b.existeEnExtra === false ? 'no' : 'si' ]);
  });

  // La tabla de tamanos de lote es otra lista: mismo criterio que los descansos.
  ((info.data.lots && info.data.lots.table) || []).forEach((f, i) => {
    const n = i + 1;
    rows.push([ `lote.${n}.tamano`, `Tamaño de lote ${n}: tamaño`, f.size ]);
    rows.push([ `lote.${n}.peso`, `Tamaño de lote ${n}: peso`, f.weight ]);
  });

  // Vigencias de las reglas laborales. Se exportan TODAS las columnas, aunque la celda este vacia:
  // en la ida y vuelta una columna ausente y una vacia no son lo mismo (vacio = «lo de arriba»,
  // ausente = columna que no existia).
  //
  // `desde` NO esta en `laborRuleFields`, que son solo los valores de la regla. Se emite aparte
  // porque el importador lo lee como la clave de la fila: sin el, la vigencia llega sin fecha y el
  // importador la rechaza -o la descarta- aunque las demas columnas vengan bien.
  ((info.data.labor && info.data.labor.rules) || []).forEach((r, i) => {
    const n = i + 1;
    rows.push([ `regla.${n}.desde`, `Regla ${n}: desde`, r.desde == null ? '' : r.desde ]);
    ctx.laborRuleFields.forEach((f) => {
      rows.push([ `regla.${n}.${f.key}`, `Regla ${n}: ${f.label}`, r[f.key] == null ? '' : r[f.key] ]);
    });
  });

  return rows;
}

// ---------------------------------------------------------------------------
// IMPORTAR
// ---------------------------------------------------------------------------

/**
 * Los cambios que aplica un CSV, SIN escribirlos.
 *
 * Devuelve `[{ element, data }]`: para cada elemento, como quedaria su `simulationData`. El panel
 * los compara con lo que hay y aplica solo los distintos.
 *
 * VALIDA TODO ANTES DE DEVOLVER NADA: si hay un solo error lanza, y el llamador no aplica ningun
 * cambio. Un CSV a medias que escribiera las filas buenas y descartara las malas en silencio es
 * peor que uno que no escribe nada.
 */
export const importar = (pestana, text, ctx) => {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('El archivo está vacío');

  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const body = rows.slice(1);
  const idx = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`Falta la columna «${name}» en el CSV`);
    return i;
  };

  if (pestana === 'tasks') return importarTareas(header, body, idx, ctx);
  if (pestana === 'flows') return importarFlujos(header, body, idx, ctx);
  if (pestana === 'resources') return importarRecursos(header, body, idx, ctx);
  return importarGlobal(body, ctx);
};

function importarTareas(header, body, idx, ctx) {
  const updates = [];
  const iId = idx('id');
  const iU = idx('unidad_proceso');
  const iR = idx('retrabajo');
  const iRU = idx('unidad_retrabajo');

  // La unidad se valida contra la lista y se rechaza en singular: `minute` se leeria como
  // milisegundos -factor 60.000- y la corrida daria numeros absurdos sin ningun aviso.
  const unidad = (valor) => String(valor || '').trim();
  const exigirUnidad = (v) => {
    if (!TASK_UNITS.includes(v)) {
      throw new Error(`La unidad «${v}» no es válida (usa ${TASK_UNITS.join('/')}, en plural)`);
    }
    return v;
  };

  // Formato nuevo: `tasa_fallo_pct` en % (0-100). Formato heredado: `tasa_fallo` en fraccion (0-1).
  // Se aceptan los dos para no romper un CSV exportado antes del cambio. El formato se detecta por
  // el NOMBRE de la columna, no por el valor: adivinar por magnitud convertiria un 1 % legitimo en
  // otra cosa sin avisar.
  const iFPct = header.indexOf('tasa_fallo_pct');
  const iFrac = header.indexOf('tasa_fallo');
  if (iFPct === -1 && iFrac === -1) throw new Error('Falta la columna «tasa_fallo_pct» en el CSV');
  const iF = iFPct !== -1 ? iFPct : iFrac;
  const falloEnPct = iFPct !== -1;

  const iDist = header.indexOf('distribucion');
  const iVal = header.indexOf('tiempo_proceso');
  const iMin = header.indexOf('min');
  const iModa = header.indexOf('moda');
  const iMax = header.indexOf('max');
  const iRec = header.indexOf('recurso');
  const iCant = header.indexOf('cant_recurso');
  const iMiembro = header.indexOf('miembro');
  const iFrec = header.indexOf('frecuencia');
  const iHab = header.indexOf('habilidad');

  /**
   * Lee una columna de la barrera POR NOMBRE y exige que exista y que la fila la traiga.
   *
   * La fila recortada -columnas de barrera borradas a mano en Excel- merece este aviso y no un
   * «no numérico»: el usuario tiene que poder saber que le falta una columna, no adivinar por qué
   * el valor no le cuadra.
   */
  const leerBarrera = (name, fila) => {
    const i = header.indexOf(name);
    if (i === -1) {
      throw new Error(`Falta la columna «${name}» en el CSV: es necesaria para las tareas «por lote»`);
    }
    if (fila[i] === undefined) {
      throw new Error(`La fila ${fila.__linea}: está incompleta, falta el valor de «${name}»`);
    }
    return fila[i];
  };

  body.forEach((r, n) => {
    const id = String(r[iId] || '').trim();
    if (!id) return;
    r.__linea = n + 2;
    const el = ctx.getElement(id);
    if (!el) throw new Error(`La fila ${n + 2}: no existe el elemento «${id}»`);

    const current = ctx.taskData(el);
    const dist = iDist !== -1 && String(r[iDist] || '').trim() === 'triangular' ? 'triangular' : 'fixed';
    const unit = exigirUnidad(unidad(r[iU]) || current.processingTime.unit);

    let processingTime;
    if (dist === 'triangular') {
      processingTime = {
        distribution: 'triangular',
        min: ctx.num(r[iMin], 'min'),
        mode: ctx.num(r[iModa], 'moda'),
        max: ctx.num(r[iMax], 'max'),
        unit
      };
    } else {
      processingTime = { distribution: 'fixed', value: ctx.num(r[iVal], 'tiempo'), unit };
    }

    const bruto = ctx.num(r[iF], 'tasa de fallo');
    let failureRate;
    if (falloEnPct) {
      if (bruto < 0 || bruto > 100) {
        throw new Error(`La fila ${n + 2}: la tasa de fallo debe estar entre 0 y 100 % (vale ${bruto})`);
      }
      failureRate = bruto / 100;
    } else {
      // El aviso dice «fracción» a proposito: un 1,5 puesto en la columna heredada casi siempre
      // es un porcentaje escrito en el sitio equivocado, y el mensaje tiene que nombrar la unidad
      // esperada para que el arreglo sea evidente.
      if (bruto < 0 || bruto > 1) {
        throw new Error(`La fila ${n + 2}: «tasa_fallo» va en fracción (0-1) pero vale ${bruto}`);
      }
      failureRate = bruto;
    }

    const rework = { ...current.reworkTime, value: ctx.num(r[iR], 'retrabajo') };
    rework.unit = exigirUnidad(iRU !== -1 && unidad(r[iRU]) ? unidad(r[iRU]) : rework.unit);

    const datos = { ...current, processingTime, failureRate, reworkTime: rework };

    // Recurso: '(ninguno)' o vacio deja el campo sin recurso, que es lo que el motor lee como
    // «sin restriccion».
    const pool = iRec !== -1 ? String(r[iRec] || '').trim() : '';
    if (pool) {
      const cantTexto = iCant !== -1 ? String(r[iCant] || '').trim() : '';
      const cantidad = cantTexto === '' ? 1 : ctx.num(cantTexto, 'cantidad de recurso');
      if (!(cantidad >= 1)) throw new Error(`La fila ${n + 2}: la cantidad de recurso debe ser ≥ 1`);
      if (!ctx.getPools().some((p) => p.name === pool)) {
        throw new Error(`La fila ${n + 2}: la piscina «${pool}» no está dada de alta`);
      }
      const miembro = iMiembro !== -1 ? String(r[iMiembro] || '').trim() : '';
      if (miembro) {
        const poolDatos = ctx.getPools().find((p) => p.name === pool);
        const suyo = ((poolDatos && poolDatos.members) || []).find((m) => m && m.nombre === miembro);
        if (!suyo) throw new Error(`La fila ${n + 2}: «${miembro}» no está en la piscina «${pool}»`);
      }
      datos.resources = { pool, quantityRequired: cantidad, ...(miembro ? { miembro } : {}) };
    } else {
      delete datos.resources;
    }

    // La frecuencia se limpia cuando el CSV NO la trae: un archivo antiguo -o una columna que
    // alguien borro a mano- significa «por token», no «dejalo como estaba». Sin esto, una tarea que
    // venia con barrera conservaba `frequency: 'lot'` y su barrera tras importar un CSV que no las
    // declaraba, y el usuario no tenia forma de saber de donde salian.
    if (iFrec === -1) {
      delete datos.frequency;
      delete datos.barrier;
    } else {
      const crudo = String(r[iFrec] || '').trim().toLowerCase();
      if (!crudo || crudo === 'token') {
        // Por token es el caso por defecto: la tarea se queda sin frecuencia ni barrera. Hay que
        // BORRARLAS, porque `current` trae los valores por defecto para poder pintarlos y si no la
        // tarea arrastraria una barrera huerfana que el usuario no ha declarado.
        delete datos.frequency;
        delete datos.barrier;
      } else if (crudo === 'lot' || crudo === 'lote') {
        const disp = ctx.num(leerBarrera('barrera_disp', r), 'disponibilidad de la barrera');
        if (disp < 0 || disp > 1) {
          throw new Error(`La fila ${n + 2}: la disponibilidad de la barrera debe estar entre 0 y 1`);
        }
        const eMin = ctx.num(leerBarrera('barrera_min', r), 'espera mínima');
        const eModa = ctx.num(leerBarrera('barrera_moda', r), 'espera modal');
        const eMax = ctx.num(leerBarrera('barrera_max', r), 'espera máxima');
        if (!(eMin <= eModa && eModa <= eMax)) {
          throw new Error(`La fila ${n + 2}: en la espera de la barrera debe cumplirse mínimo ≤ moda ≤ máximo`);
        }
        const tol = ctx.num(leerBarrera('barrera_tol', r), 'tolerancia');
        if (tol < 0) throw new Error(`La fila ${n + 2}: la tolerancia no puede ser negativa`);

        datos.frequency = 'lot';
        datos.barrier = {
          availableProbability: disp,
          waitMin: eMin,
          waitMode: eModa,
          waitMax: eMax,
          toleranceMinutes: tol
        };
      } else {
        // Antes esto caia en «token» en silencio, asi que un `raro` escrito a mano se importaba
        // como si fuera una tarea por pieza y la simulacion salia sin la frecuencia pedida.
        throw new Error(`La fila ${n + 2}: frecuencia «${crudo}» inválida (usa token o lot)`);
      }
    }

    if (iHab !== -1) {
      const hab = String(r[iHab] || '').trim();
      // Se guarda en la forma CANONICA: una sola se guarda en singular (`habilidad`) y varias como
      // lista (`habilidades`). El motor lee las dos, pero la ida y vuelta tiene que ser estable o
      // dos exportaciones seguidas darian archivos distintos.
      delete datos.habilidad;
      delete datos.habilidades;
      if (hab) {
        const partes = hab.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
        if (partes.length === 1) datos.habilidad = partes[0];
        else if (partes.length > 1) datos.habilidades = partes;
      }
    } else {
      // Mismo criterio que la frecuencia: si el CSV no trae la columna, la carga y la habilidad se
      // LIMPIAN. Un CSV antiguo no las declara, y dejarlas puestas haria que la tarea conservara
      // una carga fisica que ese archivo nunca pidio.
      delete datos.carga;
      delete datos.habilidad;
      delete datos.habilidades;
    }

    updates.push({ element: el, data: datos });
  });

  return updates;
}

function importarFlujos(header, body, idx, ctx) {
  const updates = [];
  const iId = idx('id');
  const iPct = header.indexOf('probabilidad_pct');
  const iProb = header.indexOf('probabilidad');
  if (iPct === -1 && iProb === -1) throw new Error('Falta la columna «probabilidad_pct» en el CSV');
  const i = iPct !== -1 ? iPct : iProb;
  const enPct = iPct !== -1;

  body.forEach((r, n) => {
    const id = String(r[iId] || '').trim();
    if (!id) return;
    const el = ctx.getElement(id);
    if (!el) throw new Error(`La fila ${n + 2}: no existe el elemento «${id}»`);

    const bruto = ctx.num(r[i], 'probabilidad');
    const valor = enPct ? bruto / 100 : bruto;
    if (!(valor >= 0 && valor <= 1)) {
      throw new Error(`La fila ${n + 2}: la probabilidad tiene que estar entre 0 y 100 %`);
    }
    const current = ctx.flowData(el);
    updates.push({ element: el, data: { ...current, branchingProbability: valor } });
  });

  return updates;
}

function importarRecursos(header, body, idx, ctx) {
  const updates = [];
  const iNombre = idx('nombre');
  const iCant = idx('cantidad');

  body.forEach((r, n) => {
    const nombre = String(r[iNombre] || '').trim();
    if (!nombre) return;

    // `miembros` es OPCIONAL, como la frecuencia o la carga: un CSV exportado antes de que
    // existieran los colaboradores no la trae. Exigirla con idx() hacia que ese archivo no se
    // pudiera importar, y ademas con un error de columna que no dice que la columna sobra.
    const iMiembros = header.indexOf('miembros');
    const miembros = iMiembros === -1 ? '' : String(r[iMiembros] || '').trim();
    const lista = miembros === '' ? [] : miembros.split(';').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [ nombreM, tarifa, carga, habs ] = s.split('|');
      const m = { nombre: String(nombreM || '').trim() };
      if (String(tarifa || '').trim() !== '') m.tarifaHora = ctx.num(tarifa, 'tarifa');
      if (String(carga || '').trim() !== '') m.cargaMaximaKg = ctx.num(carga, 'carga');
      const habilidades = String(habs || '').split(/[, ]+/).map((x) => x.trim()).filter(Boolean);
      if (habilidades.length) m.habilidades = habilidades;
      return m;
    }).filter((m) => m.nombre);

    const pool = { name: nombre, quantity: ctx.num(r[iCant], 'cantidad') };
    if (lista.length) pool.members = lista;

    // Toda la parte del proveedor externo es OPCIONAL: un CSV exportado antes de que existiera no
    // trae ninguna de estas columnas y tiene que seguir entrando. Se leen por nombre y la ausencia
    // vale vacio, en vez de exigirlas con idx() -que ademas daba un error de «columna que falta»
    // sin decir que la columna simplemente es nueva-.
    const opcional = (nombre) => {
      const i = header.indexOf(nombre);
      return i === -1 ? '' : String(r[i] || '').trim();
    };

    if (opcional('origen').toLowerCase() === 'externa') {
      pool.origen = 'externa';
      pool.cobro = opcional('cobro').toLowerCase() === 'pieza' ? 'pieza' : 'hora';
      if (pool.cobro === 'pieza') {
        // Un cobro POR PIEZA sin precio no se puede costear: el motor no tendria con que
        // multiplicar. Se rechaza en vez de ignorarlo, porque una piscina que entra sin precio y
        // sin error se lee como «este proveedor es gratis», que es lo contrario de lo declarado.
        const p = opcional('precio_pieza');
        if (p === '') {
          throw new Error(
            `La fila ${n + 2}: «${nombre}» cobra POR PIEZA y falta el precio (columna «precio_pieza»)`
          );
        }
        pool.precioPieza = ctx.num(p, 'precio por pieza');
      } else {
        const t = opcional('tarifa_hora');
        if (t !== '') pool.tarifaHora = ctx.num(t, 'tarifa por hora');
      }
    }

    updates.push({ pool });
  });

  return updates;
}

function importarGlobal(body, ctx) {
  const info = ctx.globalData();
  if (!info) throw new Error('No hay evento raíz configurado');

  // `path` es una lista de claves. Se recorre con esto y no con `getByPath` porque ademas hay que
  // CREAR los niveles que falten: un modelo sin `calendar` tiene que poder recibir sus descansos.
  const setByPath = (o, path, valor) => {
    let actual = o;
    for (let i = 0; i < path.length - 1; i++) {
      if (actual[path[i]] == null || typeof actual[path[i]] !== 'object') actual[path[i]] = {};
      actual = actual[path[i]];
    }
    actual[path[path.length - 1]] = valor;
  };

  const data = JSON.parse(JSON.stringify(info.data));

  // Los descansos, la tabla de lotes y las vigencias se leen primero y se QUITAN de la lista de
  // campos: si no, caerian en el bucle de abajo y saltaria «campo desconocido».
  const filasDescanso = new Map();
  const filasLote = new Map();
  const filasRegla = new Map();
  const filasCampos = [];

  body.forEach((r) => {
    const clave = String(r[0] || '').trim();
    const valor = r[2];

    const md = clave.match(/^descanso\.(\d+)\.(inicio|fin|cuentaComoJornada|existeEnExtra)$/);
    if (md) {
      const i = Number(md[1]);
      if (!filasDescanso.has(i)) filasDescanso.set(i, {});
      filasDescanso.get(i)[md[2]] = String(valor).trim();
      return;
    }

    const ml = clave.match(/^lote\.(\d+)\.(tamano|peso)$/);
    if (ml) {
      const i = Number(ml[1]);
      if (!filasLote.has(i)) filasLote.set(i, {});
      filasLote.get(i)[ml[2]] = String(valor).trim();
      return;
    }

    const mr = clave.match(/^regla\.(\d+)\.desde$|^regla\.(\d+)\.(\w+)$/);
    if (mr) {
      const i = Number(mr[1] || mr[2]);
      if (!filasRegla.has(i)) filasRegla.set(i, {});
      filasRegla.get(i)[mr[1] ? 'desde' : mr[3]] = String(valor).trim();
      return;
    }

    filasCampos.push(r);
  });

  const siONo = (v) => /^(s|sí|si|true|1|x)/.test(String(v || '').trim().toLowerCase());

  filasCampos.forEach((r, n) => {
    const linea = n + 2;
    const field = ctx.globalFields.find((f) => f.key === String(r[0] || '').trim());
    if (!field) throw new Error(`La fila ${linea}: campo desconocido «${r[0]}»`);
    const raw = r[2];

    if (field.kind === 'number') {
      // Campo opcional (la semilla): vacio es «no declarado». Sin esta rama, exportar e importar la
      // pestaña Global fallaba con la semilla vacia y la ida y vuelta se rompia sola.
      if (field.optional && String(raw).trim() === '') setByPath(data, field.path, '');
      else {
        const num = ctx.num(raw, `La fila ${linea}: ${field.label}`);
        if (field.min != null && num < field.min) {
          throw new Error(`La fila ${linea}: ${field.label} debe ser ≥ ${field.min}`);
        }
        if (field.max != null && num > field.max) {
          throw new Error(`La fila ${linea}: ${field.label} debe ser ≤ ${field.max}`);
        }
        setByPath(data, field.path, num);
      }
    } else if (field.kind === 'select') {
      const v = String(raw).trim();
      if (!field.options.includes(v)) {
        throw new Error(`La fila ${linea}: valor «${v}» inválido (usa ${field.options.join('/')})`);
      }
      setByPath(data, field.path, v);
    } else if (field.kind === 'days') {
      const dias = String(raw).split(',').map((s) => s.trim()).filter((s) => s !== '').map((s) => {
        const num = Number(s);
        if (!Number.isInteger(num) || num < 0 || num > 6) {
          throw new Error(`La fila ${linea}: día «${s}» inválido (0-6)`);
        }
        return num;
      });
      setByPath(data, field.path, dias);
    } else if (field.kind === 'time') {
      const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) throw new Error(`La fila ${linea}: ${field.label} debe ser HH:MM («${raw}»)`);
      setByPath(data, field.path, { hour: Number(m[1]), minute: Number(m[2]) });
    } else if (field.kind === 'checkbox') {
      setByPath(data, field.path, siONo(raw));
    } else {
      setByPath(data, field.path, String(raw));
    }
  });

  // Descansos: si el CSV trae alguno, se reconstruye la lista ENTERA con ellos. Si no trae
  // ninguno, se dejan los que ya tuviera el modelo.
  if (filasDescanso.size) {
    const descansos = [];
    Array.from(filasDescanso.keys()).sort((a, b) => a - b).forEach((idx) => {
      const f = filasDescanso.get(idx);
      const hora = (texto, cual) => {
        const m = String(texto || '').trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) throw new Error(`Descanso ${idx}: ${cual} «${texto}» no es HH:MM`);
        return { hour: Number(m[1]), minute: Number(m[2]) };
      };
      const start = hora(f.inicio, 'desde');
      const end = hora(f.fin, 'hasta');
      if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
        throw new Error(`Descanso ${idx}: el fin debe ser posterior al inicio`);
      }
      descansos.push({
        start,
        end,
        cuentaComoJornada: siONo(f.cuentaComoJornada),
        // Ausente = se toma tambien en horas extra, que es lo normal.
        existeEnExtra: f.existeEnExtra === undefined ? true : siONo(f.existeEnExtra)
      });
    });
    setByPath(data, [ 'calendar', 'breaks' ], descansos);
  }

  // Tabla de tamaños de lote: mismo criterio, se reconstruye ENTERA solo si el CSV trae alguna fila.
  if (filasLote.size) {
    const tabla = [];
    Array.from(filasLote.keys()).sort((a, b) => a - b).forEach((idx) => {
      const f = filasLote.get(idx);
      const size = ctx.num(f.tamano, `Línea del lote ${idx}: tamaño`);
      if (!Number.isInteger(size) || size < 1) {
        throw new Error(`Línea del lote ${idx}: el tamaño debe ser un entero mayor o igual que 1`);
      }
      const weight = ctx.num(f.peso, `Línea del lote ${idx}: peso`);
      if (!(weight > 0)) throw new Error(`Línea del lote ${idx}: el peso debe ser mayor que 0`);
      tabla.push({ size, weight });
    });
    setByPath(data, [ 'lots', 'table' ], tabla);
  }

  // Vigencias de las reglas laborales: se reconstruye ENTERA solo si el CSV trae alguna. Una celda
  // vacia es «lo de arriba», que es como se declara una regla que no cambia ese campo.
  if (filasRegla.size) {
    const reglas = [];
    const vistos = new Set();
    Array.from(filasRegla.keys()).sort((a, b) => a - b).forEach((idx) => {
      const f = filasRegla.get(idx);
      const desde = String(f.desde || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        throw new Error(`Línea de la vigencia ${idx}: «${desde}» no es una fecha AAAA-MM-DD`);
      }
      // Una fecha repetida es una regla que se pisa a si misma: la segunda ganaria en silencio.
      if (vistos.has(desde)) throw new Error(`Línea de la vigencia ${idx}: la fecha ${desde} está repetida`);
      vistos.add(desde);

      const regla = { desde };
      ctx.laborRuleFields.forEach((campo) => {
        const bruto = String(f[campo.key] == null ? '' : f[campo.key]).trim();
        if (bruto === '') return;
        const num = ctx.num(bruto, `Línea de la vigencia ${desde}: ${campo.key}`);
        if (num < 0) throw new Error(`Línea de la vigencia ${desde}: ${campo.key} no puede ser negativo`);
        regla[campo.key] = num;
      });
      reglas.push(regla);
    });
    setByPath(data, [ 'labor', 'rules' ], reglas);
  }

  return [ { element: info.element, data } ];
}

export { pctATexto };
