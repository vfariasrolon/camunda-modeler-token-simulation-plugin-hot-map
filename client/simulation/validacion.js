/**
 * LECTURA Y VALIDACION DE LA TABLA DE DATOS: del DOM al dato del diagrama.
 *
 * QUE ES ESTE MODULO: la parte del panel de datos que convierte lo que hay escrito en las casillas
 * en el objeto que se guarda en `simulationData`. Se extrajo de `DataTablePanel.js`, que tenia
 * 3.100 lineas y esta validacion se llevaba casi 600 de ellas.
 *
 * POR QUE IMPORTA QUE ESTE SEPARADO: aqui es donde viven las reglas que impiden guardar un diagrama
 * incoherente -un minimo mayor que la moda, una cantidad de recurso de cero, una piscina que no
 * existe-. Son las quejas que el usuario ve al pulsar «Guardar todo», asi que tienen que poder
 * probarse sin montar el panel entero, y tienen que fallar con un mensaje que diga QUE fila y QUE
 * campo, no «valor no numérico».
 *
 * QUE **NO** HACE: no escribe en el diagrama. Devuelve `[{ element, data }]` y el panel decide que
 * hacer con eso. Tampoco toca `this._body`: recibe el nodo de la fila o el contenedor, asi que se
 * puede llamar con un DOM de verdad o con uno de prueba.
 *
 * FORMATO DE LOS ERRORES: todos son `Error` con el nombre del elemento delante («Cortar: ...»),
 * porque en una tabla de veinte filas un mensaje sin nombre obliga a buscar a mano cual falla.
 */

/**
 * Un numero escrito por una persona.
 *
 * Se acepta la COMA decimal porque el usuario escribe en español y Excel exporta con coma: sin
 * esto, un «12,5» en la casilla se leeria como 12 y el error seria invisible. Lo que no es numero
 * se rechaza con el texto original entre comillas, que es lo unico que permite ver el espacio o la
 * letra que sobra.
 */
export const numero = (raw, etiqueta) => {
  const texto = String(raw == null ? '' : raw).trim();
  const n = Number(texto.replace(',', '.'));
  if (texto === '' || Number.isNaN(n)) {
    throw new Error(`${etiqueta}: valor no numérico («${raw}»)`);
  }
  return n;
};

/**
 * Lee UNA fila de la tabla de Tareas y devuelve `{ element, data }`, o `null` si la fila no tiene
 * elemento.
 *
 * POR QUE ESTA SEPARADO DE LA VALIDACION DE LA PESTAÑA: por el AUTOGUARDADO. Leer la pestaña entera
 * y lanzar al primer problema significa que una fila a medio escribir -una casilla vacia mientras se
 * teclea- bloquearia el guardado de otra fila que si esta bien. Aqui cada fila se lee y se valida
 * por su cuenta, y es lo que permite que el autoguardado escriba solo la fila que se toco.
 *
 * `ctx` necesita: `getElement(id)`, `label(el)`, `taskData(el)`, `getPools()`.
 */
export const datosDeFilaDeTarea = (tr, ctx) => {
  const el = ctx.getElement(tr.dataset.elId);
  if (!el) return null;

  const name = ctx.label(el);
  const val = (f) => {
    const input = tr.querySelector(`[data-field="${f}"]`);
    return input ? input.value : '';
  };
  const num = (f, etiqueta) => numero(val(f), `${name} · ${etiqueta}`);

  const distribucion = val('processingTime.distribution') || 'fixed';
  const unit = val('processingTime.unit');
  const unitRetrabajo = val('reworkTime.unit');

  // La casilla esta en % (0-100) pero el motor guarda la FRACCION (0-1). La conversion vive en el
  // unico sitio que lee la casilla, para que no haya dos verdades sobre que significa el numero
  // que hay escrito.
  const failurePct = num('failureRate', 'tasa de fallo (%)');
  if (failurePct < 0 || failurePct > 100) {
    throw new Error(
      `${name}: la tasa de fallo debe estar entre 0 y 100 % (has puesto ${failurePct})`
    );
  }
  const failure = failurePct / 100;

  // El tiempo de proceso se lee SEGUN la distribucion elegida: con triangular mandan min/moda/max y
  // el campo «Tiempo» no se lee en absoluto. Leer los dos seria peor que no leer ninguno: se
  // guardaria un valor que el motor va a ignorar.
  let processingTime;
  if (distribucion === 'triangular') {
    const min = num('processingTime.min', 'mínimo');
    const mode = num('processingTime.mode', 'moda');
    const max = num('processingTime.max', 'máximo');

    if (!(min <= mode && mode <= max)) {
      throw new Error(
        `${name}: en la distribución triangular debe cumplirse mínimo ≤ moda ≤ máximo `
        + `(has puesto ${min}, ${mode}, ${max})`
      );
    }
    processingTime = { distribution: 'triangular', min, mode, max, unit };
  } else {
    const value = num('processingTime.value', 'tiempo de proceso');
    if (value < 0) throw new Error(`${name}: el tiempo de proceso no puede ser negativo`);
    processingTime = { distribution: 'fixed', value, unit };
  }

  const reworkValue = num('reworkTime.value', 'retrabajo');
  if (reworkValue < 0) throw new Error(`${name}: el retrabajo no puede ser negativo`);

  // Recurso: '(ninguno)' deja el campo vacio, que es lo que el motor lee como «sin restriccion de
  // recursos».
  const pool = val('resources.pool');
  const cantRaw = val('resources.quantityRequired');
  let recurso = null;
  if (pool) {
    const cantidad = cantRaw === '' ? 1 : numero(cantRaw, `${name} · cantidad de recurso`);
    if (!(cantidad >= 1)) {
      throw new Error(`${name}: la cantidad de recurso debe ser un número mayor o igual que 1`);
    }
    if (!ctx.getPools().some((p) => p.name === pool)) {
      throw new Error(
        `${name}: la piscina «${pool}» no está dada de alta. `
        + 'Créala en la pestaña Recursos antes de asignarla.'
      );
    }
    recurso = { pool, quantityRequired: cantidad };

    // EL MIEMBRO DESIGNADO, si lo hay. Se valida AQUI y no solo al simular, porque un nombre mal
    // escrito atasca la tarea en cada caso y el sintoma -«la corrida se queda corta»- no dice cual
    // es el problema. Es la misma validacion que usa el aviso previo al informe.
    const miembro = val('resources.miembro');
    if (miembro) {
      const poolDatos = ctx.getPools().find((p) => p.name === pool);
      const suyo = ((poolDatos && poolDatos.members) || []).find((m) => m && m.nombre === miembro);
      if (!suyo) {
        const disponibles = ((poolDatos && poolDatos.members) || [])
          .map((m) => m && m.nombre).filter(Boolean);
        throw new Error(
          `${name}: «${miembro}» no está en la piscina «${pool}». `
          + (disponibles.length
            ? `Los miembros son: ${disponibles.join(', ')}.`
            : 'Esa piscina no tiene miembros.')
        );
      }
      recurso.miembro = miembro;
    }
  }

  const current = ctx.taskData(el);
  const datos = {
    ...current,
    processingTime,
    // Se conserva la distribucion del retrabajo que hubiera: la tabla todavia no la edita, y
    // forzarla a «fixed» destruiria un triangular configurado. Mismo error que tenia el modal del
    // lapiz.
    reworkTime: { ...current.reworkTime, value: reworkValue, unit: unitRetrabajo },
    failureRate: failure
  };
  // delete y no null: el motor comprueba `data.resources && data.resources.pool`, asi que un objeto
  // con pool vacio pasaria el primer filtro. Ademas el JSON no arrastra claves muertas.
  if (recurso) datos.resources = recurso;
  else delete datos.resources;

  // Frecuencia y barrera. `ctx.taskData` devuelve los valores por defecto para poder pintarlos, asi
  // que hay que BORRARLOS del resultado: si no, cada tarea guardada arrastraria un
  // `frequency: "token"` y una barrera que nunca se pidio, y el XML engordaria en cada guardado.
  const frecuencia = val('frequency') === 'lot' ? 'lot' : 'token';

  if (frecuencia === 'lot') {
    const disp = num('barrier.availableProbability', 'disponibilidad de la barrera');
    if (disp < 0 || disp > 1) {
      throw new Error(`${name}: la disponibilidad de la barrera debe estar entre 0 y 1`);
    }
    const esperaMin = num('barrier.waitMin', 'espera mínima de la barrera');
    const esperaModa = num('barrier.waitMode', 'espera modal de la barrera');
    const esperaMax = num('barrier.waitMax', 'espera máxima de la barrera');
    if (!(esperaMin <= esperaModa && esperaModa <= esperaMax)) {
      throw new Error(
        `${name}: en la espera de la barrera debe cumplirse mínimo ≤ moda ≤ máximo `
        + `(has puesto ${esperaMin}, ${esperaModa}, ${esperaMax})`
      );
    }
    const tolerancia = num('barrier.toleranceMinutes', 'tolerancia de la barrera');
    if (tolerancia < 0) throw new Error(`${name}: la tolerancia no puede ser negativa`);

    datos.frequency = 'lot';
    datos.barrier = {
      availableProbability: disp,
      waitMin: esperaMin,
      waitMode: esperaModa,
      waitMax: esperaMax,
      toleranceMinutes: tolerancia
    };
  } else {
    // Una tarea por token no tiene barrera: el motor ni la lee.
    delete datos.frequency;
    delete datos.barrier;
  }

  // CARGA FISICA. Una casilla vacia se guarda como AUSENTE, no como 0: un 0 dice «esta tarea no
  // mueve peso» y el vacio dice «no lo sabemos», y el diagnostico de datos los distingue. Las
  // claves vacias se OMITEN en vez de guardarse como `null`: un JSON con nulls es mas dificil de
  // leer a mano y el motor los trataria igual, pero ensucia el XML.
  const cargaOpcional = (campo, etiqueta) => {
    const bruto = val(`carga.${campo}`);
    if (String(bruto).trim() === '') return undefined;
    const n = numero(bruto, `${name} · ${etiqueta}`);
    if (n < 0) throw new Error(`${name}: ${etiqueta} no puede ser negativo`);
    return n;
  };
  const carga = {};
  const masa = cargaOpcional('masaCargadaKg', 'masa cargada');
  const arrastre = cargaOpcional('masaArrastradaKg', 'masa arrastrada');
  const distancia = cargaOpcional('distanciaM', 'distancia');
  if (masa !== undefined) carga.masaCargadaKg = masa;
  if (arrastre !== undefined) carga.masaArrastradaKg = arrastre;
  if (distancia !== undefined) carga.distanciaM = distancia;

  delete datos.carga;
  if (Object.keys(carga).length) datos.carga = carga;

  // HABILIDAD exigida. Se admite una o varias separadas por comas, y se guarda `habilidad`
  // (singular) cuando es una sola porque es el caso comun y asi el XML queda legible.
  const habilidadBruta = String(val('habilidad') == null ? '' : val('habilidad')).trim();
  delete datos.habilidad;
  delete datos.habilidades;
  if (habilidadBruta) {
    const lista = habilidadBruta.split(',').map((h) => h.trim()).filter(Boolean);
    if (lista.length === 1) datos.habilidad = lista[0];
    else if (lista.length > 1) datos.habilidades = lista;
  }

  return { element: el, data: datos };
};

/**
 * Lee la tabla de piscinas de recursos y devuelve `[{ element, data }]` con el proceso y su
 * `resourcePools`.
 *
 * Devuelve UN solo escrito -el del proceso entero- y no uno por piscina, porque las piscinas no son
 * elementos del diagrama: viven todas juntas en la configuracion del proceso, asi que se reemplaza
 * la lista completa.
 *
 * `ctx` necesita: `getElement(id)`, `getPools()`, `processRoot()`, `procesoData()`.
 */
export const datosDeRecursos = (contenedor, ctx) => {
  const root = ctx.processRoot();
  if (!root) throw new Error('El diagrama no tiene ningún proceso donde guardar los recursos');

  const pools = [];
  const vistos = new Set();

  // `.filas-pool > tr` y no `.filas-pool tr`: dentro de cada piscina hay una tabla de MIEMBROS,
  // cuyas filas tambien son `tr`. Sin el hijo directo, cada miembro se leeria como una piscina sin
  // nombre.
  contenedor.querySelectorAll('.filas-pool > tr').forEach((tr, i) => {
    const nombre = String(tr.querySelector('[data-field="pool.name"]').value || '').trim();
    const cantRaw = String(tr.querySelector('[data-field="pool.quantity"]').value || '').trim();

    // Fila totalmente vacia: se ignora en vez de dar error, para que la fila que se acaba de añadir
    // y no se ha rellenado no bloquee el guardado.
    if (nombre === '' && cantRaw === '') return;

    if (!nombre) throw new Error(`Piscina ${i + 1}: falta el nombre`);
    if (vistos.has(nombre)) throw new Error(`Piscina «${nombre}»: el nombre está repetido`);
    vistos.add(nombre);

    const cantidad = numero(cantRaw, `Piscina «${nombre}» · cantidad`);
    if (!Number.isInteger(cantidad) || cantidad < 1) {
      throw new Error(`Piscina «${nombre}»: la cantidad debe ser un entero mayor o igual que 1`);
    }

    // Miembros con nombre: opcionales. Se leen del sublistado de ESTA fila.
    const members = [];
    const nombresVistos = new Set();
    tr.querySelectorAll('.filas-miembro tr').forEach((filaM, j) => {
      const valor = (campo) => {
        const el = filaM.querySelector(`[data-miembro="${campo}"]`);
        return el ? String(el.value).trim() : '';
      };
      const nombreM = valor('nombre');
      const tarifa = valor('tarifaHora');
      const cargaMax = valor('cargaMaximaKg');
      const habs = valor('habilidades');

      // Fila vacia: se ignora, para que la recien anadida no bloquee.
      if (!nombreM && !tarifa && !cargaMax && !habs) return;
      if (!nombreM) throw new Error(`Piscina «${nombre}» · miembro ${j + 1}: falta el nombre`);
      if (nombresVistos.has(nombreM)) {
        throw new Error(`Piscina «${nombre}»: el miembro «${nombreM}» está repetido`);
      }
      nombresVistos.add(nombreM);

      const miembro = { nombre: nombreM };
      if (tarifa !== '') {
        const t = numero(tarifa, `Piscina «${nombre}» · ${nombreM} · tarifa`);
        if (t < 0) throw new Error(`Piscina «${nombre}» · ${nombreM}: la tarifa no puede ser negativa`);
        miembro.tarifaHora = t;
      }
      if (cargaMax !== '') {
        const c = numero(cargaMax, `Piscina «${nombre}» · ${nombreM} · carga máxima`);
        if (c < 0) {
          throw new Error(`Piscina «${nombre}» · ${nombreM}: la carga máxima no puede ser negativa`);
        }
        miembro.cargaMaximaKg = c;
      }
      if (habs !== '') {
        miembro.habilidades = habs.split(',').map((h) => h.trim()).filter(Boolean);
      }
      members.push(miembro);
    });

    const pool = { name: nombre, quantity: cantidad };

    // ORIGEN Y COBRO. Una piscina PROPIA no escribe nada: el XML de los diagramas que ya existen no
    // puede engordar por una funcion que no usan, y el motor trata la ausencia como «propia» (que
    // es el defecto).
    const origen = String((tr.querySelector('[data-field="pool.origen"]') || {}).value || 'propia');
    if (origen === 'externa') {
      const cobro = String((tr.querySelector('[data-field="pool.cobro"]') || {}).value || 'hora');
      const leer = (campo) => String((tr.querySelector(`[data-field="${campo}"]`) || {}).value || '').trim();

      pool.origen = 'externa';
      pool.cobro = cobro === 'pieza' ? 'pieza' : 'hora';

      if (pool.cobro === 'pieza') {
        const precio = leer('pool.precioPieza');
        // Se EXIGE el precio: un proveedor por pieza sin precio factura 0 y el informe enseñaria un
        // coste mas barato que el real. Un cero silencioso es peor que no dejar guardar.
        if (precio === '') {
          throw new Error(
            `Piscina «${nombre}»: es un proveedor que cobra POR PIEZA y le falta el precio. `
            + 'Sin él, el coste saldría 0 y el informe mentiría.'
          );
        }
        const valor = numero(precio, `Piscina «${nombre}» · precio por pieza`);
        if (!(valor > 0)) {
          throw new Error(`Piscina «${nombre}»: el precio por pieza debe ser mayor que 0`);
        }
        pool.precioPieza = valor;
      } else {
        const tarifa = leer('pool.tarifaHora');
        // La tarifa por hora si puede faltar: el motor cae en la de planta, que es un numero
        // visible y plausible. Se avisa en el hint, no se bloquea.
        if (tarifa !== '') {
          const valor = numero(tarifa, `Piscina «${nombre}» · tarifa por hora`);
          if (valor < 0) {
            throw new Error(`Piscina «${nombre}»: la tarifa por hora no puede ser negativa`);
          }
          pool.tarifaHora = valor;
        }
      }
    }

    // `members` solo se guarda si hay alguno: una lista vacia en el XML es ruido, y el motor trata
    // «sin miembros» y «lista vacia» igual.
    if (members.length) pool.members = members;
    pools.push(pool);
  });

  return [ {
    element: root,
    data: { ...ctx.procesoData(), resourcePools: pools }
  } ];
};

/**
 * Lee la tabla de flujos y devuelve un escrito por compuerta.
 *
 * Se agrupa por compuerta porque el reparto se valida POR COMPUERTA y no fila a fila: el motor
 * elige exactamente una salida por caso. Validar solo el rango 0-100 permitia guardar un reparto
 * que sumaba 150 % y el motor, que acumula, mandaba todo lo sobrante a la ultima rama.
 *
 * `ctx` necesita: `getElement(id)`, `flowData(el)`, `label(el)`, `salidaUnica(gw)`, `valorPct(tr)`.
 */
export const datosDeFlujos = (contenedor, ctx) => {
  const writes = [];
  const porCompuerta = new Map();

  contenedor.querySelectorAll('tbody tr[data-el-id]').forEach((tr) => {
    const el = ctx.getElement(tr.dataset.elId);
    if (!el || !el.source) return;

    // Compuerta de una sola salida: el motor siempre la toma y no lee su reparto, asi que ni se
    // valida ni se escribe.
    if (ctx.salidaUnica(el.source)) return;

    const etiqueta = `${ctx.label(el.source)} → ${el.target ? ctx.label(el.target) : '?'}`;
    const pct = numero(ctx.valorPct(tr), `${etiqueta} · reparto (%)`);
    if (pct < 0 || pct > 100) {
      throw new Error(`${etiqueta}: el reparto debe estar entre 0 y 100 % (has puesto ${pct})`);
    }

    const grupo = porCompuerta.get(el.source.id) || { gateway: el.source, filas: [] };
    grupo.filas.push({ el, pct });
    porCompuerta.set(el.source.id, grupo);
  });

  porCompuerta.forEach(({ gateway, filas }) => {
    const total = redondear2(filas.reduce((acc, f) => acc + f.pct, 0));
    if (Math.abs(total - 100) > ctx.toleranciaReparto()) {
      throw new Error(
        `«${ctx.label(gateway)}»: el reparto de sus ${filas.length} salidas suma ${total} % `
        + 'y debe sumar 100 %'
      );
    }
    filas.forEach(({ el, pct }) => {
      writes.push({
        element: el,
        data: { ...ctx.flowData(el), branchingProbability: Math.round(pct * 100) / 10000 }
      });
    });
  });

  return writes;
};

/** Redondeo a dos decimales, el mismo que usa el reparto para comparar la suma. */
export const redondear2 = (n) => Math.round(n * 100) / 100;

/**
 * Lee la pestaña Global entera y devuelve `[{ element, data }]`.
 *
 * ES LA MAS LARGA DE LAS CUATRO, y no por casualidad: la pestaña Global tiene tres LISTAS -descansos,
 * tabla de tamaños de lote y vigencias de las reglas laborales- que no encajan en el patron «un input
 * por campo», mas la coherencia entre ellas (el horario, el modo de lote y el reparto doble/triple).
 *
 * `setByPath` es local y no se importa de ningun sitio: aqui ademas de escribir hay que CREAR los
 * niveles que falten -un modelo sin `calendar` tiene que poder recibir sus descansos-.
 *
 * `ctx` necesita: `globalData()`, `globalFields`, `pctATexto?`, `pad`, `getByPath?`.
 */
export const datosGlobales = (contenedor, ctx, ayudas) => {
  const { globalFields, setByPath, getByPath, pad } = ayudas;

  const info = ctx.globalData();
  if (!info) throw new Error('No hay evento raíz configurado');

  const data = JSON.parse(JSON.stringify(info.data));

  // Se recorre la lista de campos en vez de los inputs del DOM: los dias son VARIAS casillas por
  // campo (una por dia), asi que no encajan en el patron «un input por campo» que usan las demas
  // pestañas.
  globalFields.forEach((field) => {
    if (field.kind === 'days') {
      const marcados = Array.from(contenedor.querySelectorAll(`[data-days="${field.key}"]:checked`))
        .map((c) => Number(c.value));
      // Sin ningun dia marcado la planta no abre nunca y la corrida no produce nada: es un error de
      // configuracion, no un caso valido.
      if (!marcados.length) {
        throw new Error(`${field.label}: marca al menos un día`);
      }
      setByPath(data, field.path, marcados.sort((a, b) => a - b));
      return;
    }

    const input = contenedor.querySelector(`[data-field="${field.key}"]`);
    if (!input) return;
    const raw = input.value;

    if (field.kind === 'number') {
      // Campo opcional (la semilla): vacio es «no declarado», que el motor interpreta como «sacarla
      // al azar» y luego guardarla.
      if (field.optional && String(raw).trim() === '') {
        setByPath(data, field.path, '');
        return;
      }
      const n = numero(raw, field.label);
      if (field.min != null && n < field.min) throw new Error(`${field.label}: debe ser ≥ ${field.min}`);
      if (field.max != null && n > field.max) throw new Error(`${field.label}: debe ser ≤ ${field.max}`);
      setByPath(data, field.path, n);
    } else if (field.kind === 'checkbox') {
      setByPath(data, field.path, Boolean(input.checked));
    } else if (field.kind === 'time') {
      // <input type="time"> ya entrega HH:MM, pero puede quedar vacio si el usuario borra el campo,
      // asi que se valida igualmente.
      const m = String(raw).match(/^(\d{2}):(\d{2})$/);
      if (!m) throw new Error(`${field.label}: hora no válida («${raw}»)`);
      const hour = Number(m[1]);
      const minute = Number(m[2]);
      if (hour > 23 || minute > 59) throw new Error(`${field.label}: hora fuera de rango («${raw}»)`);
      setByPath(data, field.path, { hour, minute });
    } else {
      setByPath(data, field.path, raw);
    }
  });

  // Coherencia del horario: si la entrada es posterior a la salida, el motor no calcula nada util y
  // el usuario no recibe ningun aviso.
  const entrada = getByPath(data, [ 'calendar', 'workingHours', 'start' ]);
  const salida = getByPath(data, [ 'calendar', 'workingHours', 'end' ]);
  if (entrada && salida && (entrada.hour * 60 + entrada.minute) >= (salida.hour * 60 + salida.minute)) {
    throw new Error('La hora de entrada debe ser anterior a la de salida');
  }

  // Descansos: es una LISTA, no un campo escalar, asi que se recoge aparte de globalFields (mismo
  // motivo que las piscinas de recursos).
  const descansos = [];
  const minutosDe = (t) => t.hour * 60 + t.minute;

  contenedor.querySelectorAll('.filas-descanso tr').forEach((tr, i) => {
    const valor = (campo) => {
      const el = tr.querySelector(`[data-descanso="${campo}"]`);
      return el ? String(el.value).trim() : '';
    };
    const marcado = (campo) => {
      const el = tr.querySelector(`[data-descanso="${campo}"]`);
      return Boolean(el && el.checked);
    };

    const desde = valor('start');
    const hasta = valor('end');
    // Fila sin horas: se ignora, para que una fila recien anadida no bloquee.
    if (!desde && !hasta) return;

    const mDesde = desde.match(/^(\d{1,2}):(\d{2})$/);
    const mHasta = hasta.match(/^(\d{1,2}):(\d{2})$/);
    if (!mDesde) throw new Error(`Descanso ${i + 1}: hora de inicio no válida («${desde}»)`);
    if (!mHasta) throw new Error(`Descanso ${i + 1}: hora de fin no válida («${hasta}»)`);

    const inicio = { hour: Number(mDesde[1]), minute: Number(mDesde[2]) };
    const fin = { hour: Number(mHasta[1]), minute: Number(mHasta[2]) };

    if (minutosDe(fin) <= minutosDe(inicio)) {
      throw new Error(`Descanso ${i + 1}: el fin debe ser posterior al inicio (${desde} → ${hasta})`);
    }
    // Un descanso FUERA de la jornada es casi siempre una errata, y el motor lo ignoraria en
    // silencio (no parte ningun tramo). Mejor decirlo.
    if (entrada && salida) {
      const dentro = minutosDe(fin) > minutosDe(entrada) && minutosDe(inicio) < minutosDe(salida);
      if (!dentro) {
        throw new Error(
          `Descanso ${i + 1} (${desde} → ${hasta}): queda fuera de la jornada `
          + `(${pad(entrada.hour)}:${pad(entrada.minute)} - ${pad(salida.hour)}:${pad(salida.minute)}), `
          + 'así que no partiría ningún tramo'
        );
      }
    }

    descansos.push({
      start: inicio,
      end: fin,
      cuentaComoJornada: marcado('cuentaComoJornada'),
      existeEnExtra: marcado('existeEnExtra')
    });
  });

  setByPath(data, [ 'calendar', 'breaks' ], descansos);

  // Tabla de tamaños de lote empíricos.
  const tablaLotes = [];
  contenedor.querySelectorAll('.filas-lote tr').forEach((tr, i) => {
    const leer = (campo) => {
      const el = tr.querySelector(`[data-lote="${campo}"]`);
      return el ? String(el.value).trim() : '';
    };
    const tam = leer('size');
    const peso = leer('weight');
    if (!tam && !peso) return; // fila vacia: se ignora

    const size = numero(tam, `Tamaño de lote ${i + 1}: tamaño`);
    if (!Number.isInteger(size) || size < 1) {
      throw new Error(`Tamaño de lote ${i + 1}: debe ser un entero mayor o igual que 1`);
    }
    const weight = numero(peso, `Tamaño de lote ${i + 1}: peso`);
    if (!(weight > 0)) throw new Error(`Tamaño de lote ${i + 1}: el peso debe ser mayor que 0`);

    tablaLotes.push({ size, weight });
  });
  setByPath(data, [ 'lots', 'table' ], tablaLotes);

  // Coherencia de los lotes: sin esto, el motor caeria en silencio al tamaño fijo (empirical sin
  // tabla) o recortaria la triangular sin avisar.
  const modoLote = getByPath(data, [ 'lots', 'sizeMode' ]);
  if (getByPath(data, [ 'lots', 'enabled' ])) {
    if (modoLote === 'empirical' && !tablaLotes.length) {
      throw new Error('El tamaño de lote es «empirical» pero la tabla está vacía: añade al menos un tamaño');
    }
    if (modoLote === 'triangular') {
      const min = getByPath(data, [ 'lots', 'min' ]);
      const moda = getByPath(data, [ 'lots', 'mode' ]);
      const max = getByPath(data, [ 'lots', 'max' ]);
      if (!(min <= moda && moda <= max)) {
        throw new Error('En el tamaño de lote triangular debe cumplirse mínimo ≤ moda ≤ máximo '
          + `(has puesto ${min}, ${moda}, ${max})`);
      }
    }
  }

  // Vigencias de las reglas laborales: otra lista. Una celda vacia significa «lo que digan los
  // valores de arriba», asi que solo se escribe lo declarado.
  const reglas = [];
  const vistosDesde = new Set();
  const camposRegla = ayudas.laborRuleFields || [];

  contenedor.querySelectorAll('.filas-regla tr').forEach((tr, i) => {
    const leer = (campo) => {
      const el = tr.querySelector(`[data-regla="${campo}"]`);
      return el ? String(el.value).trim() : '';
    };
    const desde = leer('desde');
    const algunValor = camposRegla.some((c) => leer(c.key) !== '');

    // Fila totalmente vacia: se ignora, para que la recien anadida no bloquee.
    if (!desde && !algunValor) return;
    if (!desde) throw new Error(`Vigencia ${i + 1}: falta la fecha desde la que rige`);

    const m = desde.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error(`Vigencia ${i + 1}: «${desde}» no es una fecha válida`);
    if (vistosDesde.has(desde)) throw new Error(`Vigencia ${desde}: hay dos filas con la misma fecha`);
    vistosDesde.add(desde);

    const regla = { desde };
    camposRegla.forEach((c) => {
      const bruto = leer(c.key);
      if (bruto === '') return;
      const n = numero(bruto, `Vigencia ${desde} · ${c.key}`);
      if (n < 0) throw new Error(`Vigencia ${desde}: ningún valor de la regla puede ser negativo`);
      regla[c.key] = n;
    });

    // El reparto doble/triple tiene que ser coherente: si la prima de exceso fuera menor que la
    // normal, el motor pagaria MENOS por trabajar mas.
    const normal = regla.payMultiplier != null
      ? regla.payMultiplier : getByPath(data, [ 'overtime', 'payMultiplier' ]);
    const exceso = regla.excessPayMultiplier != null
      ? regla.excessPayMultiplier : getByPath(data, [ 'overtime', 'excessPayMultiplier' ]);
    if (normal != null && exceso != null && exceso < normal) {
      throw new Error(
        `Vigencia ${desde}: la prima del exceso (${exceso}×) no puede ser menor que la normal (${normal}×)`
      );
    }

    reglas.push(regla);
  });
  setByPath(data, [ 'labor', 'rules' ], reglas);

  return [ { element: info.element, data } ];
};

/**
 * Escribe en un objeto anidado creando los niveles que falten.
 *
 * POR QUE NO ES `getByPath` AL REVES: `path` es una LISTA de claves, y un modelo que todavia no
 * tenga `calendar` o `labor` tiene que poder recibirlos. Recorrer sin crear dejaria los descansos
 * sin sitio donde ir.
 */
export const setByPath = (o, path, valor) => {
  let actual = o;
  for (let i = 0; i < path.length - 1; i++) {
    if (actual[path[i]] == null || typeof actual[path[i]] !== 'object') actual[path[i]] = {};
    actual = actual[path[i]];
  }
  actual[path[path.length - 1]] = valor;
};

/** Lee un valor anidado. `path` es una LISTA de claves, no un «a.b.c». */
export const getByPath = (o, path) => path.reduce((a, k) => (a == null ? a : a[k]), o);
