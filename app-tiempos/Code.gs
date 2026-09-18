/**
 * Toma de tiempos · backend (Apps Script)
 *
 * Coexiste con el exportador del plugin de Camunda: el plugin genera el
 * `configurador.json` (id del diagrama, ID visible, nombre, supuesto y carga) y
 * esta app recoge las mediciones reales y las devuelve como `mediciones.json`.
 *
 * PATRON copiado del repo `cotizador_fmm` para que las herramientas se sientan
 * iguales: respuestas `{ success, data, message }`, llamadas por
 * `google.script.run`, pestanas creadas con `insertSheet` si no existen.
 *
 * DECISION QUE GOBIERNA TODO: **la hoja es la verdad y la cache es un acelerador.**
 * `CacheService` no garantiza el TTL (una entrada puede desalojarse antes de
 * tiempo), asi que un candado que viviera solo en cache haria que dos operarios
 * midieran la misma tarea SIN ENTERARSE. La cache se puede perder en cualquier
 * momento y el sistema sigue siendo correcto; eso es lo que la hace segura.
 */

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------

/**
 * ID de la hoja de calculo.
 *
 * Se lee de las PROPIEDADES DEL SCRIPT y no se escribe aqui: asi se puede tener
 * una hoja de pruebas y otra de produccion sin dos ramas de codigo, y el repo no
 * lleva dentro un identificador de cuenta.
 *
 * Se configura una vez con:
 *   Archivo > Configuracion del proyecto > Propiedades del script
 *   Nombre: ID_HOJA   Valor: <el id de tu hoja>
 */
const NOMBRE_PROP_ID_HOJA = 'ID_HOJA';

const PESTANAS = {
  config: '_config',
  muestras: 'bd',
  apartados: '_apartados',
  proyectos: 'proyectos',
  tareas: 'tareas'
};

/**
 * Version del esquema de las pestanas.
 *
 * Se sube cuando cambian las columnas. El arranque compara esta constante con la
 * que hay guardada en `_config` y avisa (no migra solo): una migracion automatica
 * que adivina es peor que una que se niega.
 */
const ESQUEMA_VERSION = 1;

/** Columnas de cada pestana. El orden importa solo al CREAR; luego se lee por nombre. */
const COLUMNAS = {
  config: [ 'clave', 'valor' ],
  // Una fila por MUESTRA, nunca por tarea: guardar solo la media impide recalcular,
  // y el intervalo de confianza, el n requerido y la concordancia dependen de las muestras.
  muestras: [
    'muestraId', 'proyectoId', 'id', 'idCorto', 'nombre',
    'sesion', 'usuario', 'tiempo_s', 'tipo', 'nota', 'creadoEn'
  ],
  apartados: [
    'proyectoId', 'id', 'estado', 'sesion', 'usuario',
    'apartadoEn', 'latidoEn', 'liberadoEn', 'liberadoPor', 'motivo'
  ],
  proyectos: [ 'proyectoId', 'nombre', 'archivo', 'importadoEn', 'importadoPor', 'tareas', 'configurador' ],
  tareas: [
    'proyectoId', 'id', 'idCorto', 'nombre', 'unidad',
    'n', 'media_s', 'desv_s', 'min_s', 'max_s', 'margen_s', 'requeridas', 'actualizadoEn'
  ]
};

/**
 * De NOMBRE DE PESTANA a clave de COLUMNAS.
 *
 * Hace falta porque las funciones reciben el nombre de la pestana (`'_apartados'`,
 * `'bd'`) y las columnas estan indexadas por clave (`apartados`, `muestras`).
 * Sin este puente, `COLUMNAS[nombre]` devolvia `undefined` y NINGUNA pestana
 * recibia encabezados: el backend entero quedaba mudo y sin un solo error a la
 * vista. Es el tipo de fallo que solo se ve si algo comprueba el resultado.
 */
const CLAVE_DE_PESTANA = {};
Object.keys(PESTANAS).forEach(function(k) { CLAVE_DE_PESTANA[PESTANAS[k]] = k; });

/** Columnas de una pestana, por su nombre de hoja. */
function columnasDe_(nombre) {
  return COLUMNAS[CLAVE_DE_PESTANA[nombre] || nombre] || [];
}

/** Estados de un apartado. Tres, no dos: ver `marcarHuerfanas_`. */
const ESTADOS = {
  libre: 'LIBRE',
  activa: 'ACTIVA',
  huerfana: 'HUERFANA'
};

// Intervalo del latido del cliente (segundos) y cuantos intervalos sin latido
// convierten una sesion en huerfana. El umbral se IMPRIME en la interfaz: una
// tolerancia sin su valor a la vista es una cifra con autoridad falsa.
const LATIDO_SEGUNDOS = 90;
const INTERVALOS_PARA_HUERFANA = 3;

// ---------------------------------------------------------------------------
// Infraestructura: hoja, pestanas y encabezados
// ---------------------------------------------------------------------------

/**
 * Id de la hoja, leido de las propiedades del script.
 *
 * SI FALTA, EL ERROR TIENE QUE EXPLICARLO SIN HACER PENSAR: el mensaje original
 * decia «falta la propiedad X» nombrando lo que SI habia, y con el id de la hoja
 * puesto en la columna equivocada el texto acusaba al id en vez de al nombre. Aqui
 * se LISTAN las propiedades que existen, que es lo que permite ver el fallo (el id
 * en la columna del nombre) en dos segundos y sin deducirlo.
 */
function idHoja_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(NOMBRE_PROP_ID_HOJA);

  if (!id) {
    const claves = props.getKeys();

    let pista = 'No hay ninguna propiedad definida.';
    if (claves.length) {
      pista = 'Las propiedades que hay ahora son: [' + claves.join(', ') + ']. ' +
        'Si ves ahi el id de la hoja, esta puesto como NOMBRE y tiene que ir como VALOR.';
    }

    throw new Error(
      'Falta la propiedad del script llamada «' + NOMBRE_PROP_ID_HOJA + '». ' + pista + ' ' +
      'Se configura en: icono de engranaje (Configuracion del proyecto) > Propiedades del script > ' +
      'Editar propiedades del script. Debe quedar  Propiedad: ' + NOMBRE_PROP_ID_HOJA + '  |  ' +
      'Valor: <el id de la hoja, el que sale en su URL entre /d/ y /edit>.'
    );
  }

  return id;
}

function libro_() {
  return SpreadsheetApp.openById(idHoja_());
}

function ok_(data, message) {
  return { success: true, data: data, message: message || 'OK' };
}

function error_(e) {
  const mensaje = e && e.message ? e.message : String(e);
  Logger.log('Error: ' + mensaje);
  return { success: false, data: null, message: mensaje };
}

/**
 * Rellena los encabezados que FALTAN en una pestana, sin tocar los datos.
 *
 * POR QUE HACE FALTA: `pestana_()` solo escribe los encabezados al CREAR la hoja. Si
 * una pestana quedo creada sin ellos (por una version anterior del codigo, o porque
 * alguien la creo a mano), se queda asi PARA SIEMPRE: `leerFilas_` no encuentra las
 * columnas y las muestras se guardan en una hoja que despues no se puede leer. La app
 * parece funcionar y los datos no aparecen.
 *
 * Es idempotente y conservador: solo escribe si la pestana esta VACIA de datos o si su
 * primera fila no coincide con lo esperado. Nunca borra ni reordena nada.
 */
function repararEncabezados() {
  const libro = libro_();
  const informe = {};

  Object.keys(PESTANAS).forEach(function(k) {
    const nombre = PESTANAS[k];
    const esperadas = columnasDe_(nombre);
    const hoja = libro.getSheetByName(nombre);

    if (!hoja) { informe[nombre] = 'no existe'; return; }
    if (!esperadas.length) { informe[nombre] = 'sin columnas declaradas'; return; }

    const actuales = hoja.getLastColumn()
      ? hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), esperadas.length)).getValues()[0].filter(String)
      : [];

    if (JSON.stringify(actuales) === JSON.stringify(esperadas)) {
      informe[nombre] = 'ya estaba bien';
      return;
    }

    // Solo se repara si NO hay datos debajo. Escribir encabezados encima de filas
    // existentes las convertiria en encabezados y perderia esos datos.
    const filasConDatos = Math.max(0, hoja.getLastRow() - (actuales.length ? 1 : 0));
    if (filasConDatos > 0) {
      informe[nombre] = 'TIENE ' + filasConDatos + ' fila(s) de datos sin encabezado: no se toca, revisar a mano';
      return;
    }

    hoja.getRange(1, 1, 1, esperadas.length).setValues([ esperadas ]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    informe[nombre] = 'encabezados escritos';
  });

  return ok_(informe, 'Encabezados revisados');
}

/**
 * Devuelve una pestana lista para escribir, creandola la PRIMERA vez.
 *
 * El encabezado se escribe SOLO al crear la pestana, nunca «si la fila 1 esta
 * vacia»: el dia que alguien inserte una fila arriba, esa heuristica reescribiria
 * encabezados encima de los datos.
 *
 * La creacion va con LockService porque si es leer-modificar-escribir: dos
 * peticiones simultaneas podrian crear la pestana dos veces o dejar el encabezado
 * a medias. El candado se libera SIEMPRE (finally), para no dejarlo huerfano.
 */
function pestana_(nombre) {
  const libro = libro_();
  let hoja = libro.getSheetByName(nombre);

  if (hoja) return hoja;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    // Se vuelve a comprobar DENTRO del candado: otra peticion pudo crearla
    // mientras se esperaba.
    hoja = libro.getSheetByName(nombre);
    if (hoja) return hoja;

    hoja = libro.insertSheet(nombre);
    const columnas = columnasDe_(nombre);
    if (columnas.length) {
      hoja.getRange(1, 1, 1, columnas.length).setValues([ columnas ]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }

    return hoja;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Lee una pestana como objetos, mapeando POR NOMBRE de columna.
 *
 * Por nombre y no por posicion: asi anadir una columna nueva no corrompe lo viejo
 * ni desplaza los datos existentes.
 */
function leerFilas_(nombre, filtro) {
  const hoja = pestana_(nombre);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return [];

  const ancho = hoja.getLastColumn();
  const cabecera = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  const filas = hoja.getRange(2, 1, ultima - 1, ancho).getValues();

  // `__fila` es el numero de fila REAL en la hoja: reimportar un proyecto tiene que
  // ACTUALIZAR su fila, no anadir otra. Sin ese dato habria que rebuscar la fila
  // por contenido, que es fragil.
  const objetos = filas.map(function(fila, i) {
    const o = { __fila: i + 2 };
    cabecera.forEach(function(col, j) { o[col] = fila[j]; });
    return o;
  });

  return filtro ? objetos.filter(filtro) : objetos;
}

/** Fila en el orden de COLUMNAS (no en el de la hoja): append ordenado. */
function aFila_(nombre, obj) {
  return columnasDe_(nombre).map(function(col) {
    const v = obj[col];
    return v === undefined || v === null ? '' : v;
  });
}

function appendFila_(nombre, obj) {
  pestana_(nombre).appendRow(aFila_(nombre, obj));
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * Sirve la aplicacion, y atiende las acciones de DIAGNOSTICO por parametro.
 *
 * PATRON SIMPLE para la interfaz, igual que la herramienta de cotizacion:
 * `createHtmlOutputFromFile`.
 *
 * POR QUE NO SE USA UNA PLANTILLA: se probo `createTemplateFromFile` + un punto de
 * inyeccion para partir el HTML en dos archivos, y NO funciona. La composicion ocurre
 * DENTRO del literal de JavaScript con el que Apps Script sirve el panel, asi que el
 * resultado queda doblemente escapado y el navegador recibe etiquetas y llaves que no
 * puede interpretar: `SyntaxError: Invalid or unexpected token`.
 *
 * OJO CON LA CONCLUSION FACIL: el panel SIEMPRE llega escapado, tambien en una app que
 * funciona: eso es normal y el navegador lo desescapa al evaluarlo. Lo que rompe no es
 * el escapado, es la SEGUNDA capa que mete la plantilla.
 *
 * LAS ACCIONES DE DIAGNOSTICO (?accion=...) devuelven JSON y existen para poder
 * comprobar que el sistema esta bien SIN ver datos de planta. Ver `diagnostico_()`.
 */
function doGet(e) {
  const accion = e && e.parameter ? e.parameter.accion : null;

  if (accion) return respuestaJson_(accion);

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Toma de tiempos · Estudio de procesos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Envuelve una respuesta en JSON, con CORS abierto para poder consultarla desde fuera. */
function respuestaJson_(accion) {
  let cuerpo;

  try {
    cuerpo = diagnostico_(accion);
  } catch (e) {
    cuerpo = { success: false, message: e && e.message ? e.message : String(e) };
  }

  return ContentService
    .createTextOutput(JSON.stringify(cuerpo))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Las acciones de diagnostico.
 *
 * QUE DEVUELVEN Y QUE NO: estructura y conteos, NUNCA tiempos de produccion. La app
 * esta desplegada con acceso de «cualquier persona», asi que cualquiera con la URL
 * puede llamar a estas acciones: si devolvieran los tiempos, el enlace bastaria para
 * leer el estudio entero. Con estructura, lo maximo que se ve es «3 estudios, 12
 * tareas, 84 muestras», que no dice nada del proceso.
 *
 * Acciones:
 *   ping     -> que el script responde, version del esquema y umbrales
 *   esquema  -> las pestanas, sus columnas y si coinciden con las esperadas
 *   estudios -> la lista de estudios con sus conteos (sin tiempos)
 *   muestras -> conteo de muestras por tarea y por operario (sin tiempos)
 */
function diagnostico_(accion) {
  switch (accion) {
    case 'ping':
      return ping();

    case 'esquema':
      return esquema();

    case 'estudios':
      return listarProyectos();

    case 'muestras':
      return conteosDeMuestras();

    default:
      return {
        success: false,
        message: 'Accion desconocida: «' + accion + '». Usa ping, esquema, estudios o muestras.',
        acciones: [ 'ping', 'esquema', 'estudios', 'muestras' ]
      };
  }
}

/**
 * Conteo de muestras por estudio, tarea y operario. NUNCA los tiempos.
 *
 * Es lo que permite comprobar que el guardado funciona (que las muestras llegan y se
 * reparten bien) sin ver cuanto tardo nadie.
 */
function conteosDeMuestras() {
  try {
    const muestras = leerFilas_(PESTANAS.muestras);
    const apartados = leerFilas_(PESTANAS.apartados);

    const porEstudio = {};
    const porTarea = {};
    const porOperario = {};
    const porTipo = {};

    muestras.forEach(function(m) {
      const estudio = String(m.proyectoId);
      const tarea = String(m.id);
      const operario = String(m.usuario || '(sin usuario)');
      const tipo = String(m.tipo || 'normal');

      porEstudio[estudio] = (porEstudio[estudio] || 0) + 1;
      porTarea[estudio + '/' + tarea] = (porTarea[estudio + '/' + tarea] || 0) + 1;
      porOperario[estudio + '/' + operario] = (porOperario[estudio + '/' + operario] || 0) + 1;
      porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    });

    // El estado de los apartados SI se puede dar: dice quien esta midiendo, no cuanto.
    const estados = {};
    apartados.forEach(function(a) {
      if (a.estado === 'CERRADA' || a.estado === ESTADOS.libre) return;
      estados[String(a.proyectoId) + '/' + String(a.id)] = {
        estado: a.estado,
        usuario: a.usuario,
        sesion: a.sesion
      };
    });

    return ok_({
      totalMuestras: muestras.length,
      porEstudio: porEstudio,
      porTarea: porTarea,
      porOperario: porOperario,
      porTipo: porTipo,
      apartados: estados
    }, 'Conteos (sin tiempos)');
  } catch (e) {
    return error_(e);
  }
}

/**
 * Prepara la hoja y devuelve lo que la app necesita para arrancar.
 *
 * Crea las pestanas que falten y registra el esquema. Se llama una vez al abrir.
 */
function prepararHoja() {
  try {
    Object.keys(PESTANAS).forEach(function(k) {
      pestana_(PESTANAS[k]);
    });

    // Se reparan los encabezados que falten. Hace falta porque una pestana creada mal
    // (por una version anterior del codigo) se queda sin encabezados PARA SIEMPRE, y
    // entonces las muestras se guardan en una hoja que despues no se puede leer: la
    // app parece funcionar y los datos no aparecen.
    const reparacion = repararEncabezados();

    const config = leerConfig_();
    config.esquemaVersion = ESQUEMA_VERSION;
    config.latidoSegundos = LATIDO_SEGUNDOS;
    config.umbralHuerfanaMin = Math.round(LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA / 60);
    guardarConfig_(config);

    return ok_({
      esquemaVersion: ESQUEMA_VERSION,
      pestanas: Object.keys(PESTANAS).map(function(k) { return PESTANAS[k]; }),
      latidoSegundos: LATIDO_SEGUNDOS,
      umbralHuerfanaMin: Math.round(LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA / 60),
      // El detalle de la reparacion viaja en la respuesta: si hubo que escribir algo,
      // queda visible en vez de pasar en silencio.
      encabezados: reparacion.data
    }, 'Hoja preparada');
  } catch (e) {
    return error_(e);
  }
}

function leerConfig_() {
  const filas = leerFilas_(PESTANAS.config);
  const config = {};
  filas.forEach(function(f) {
    if (!f.clave) return;
    let valor = f.valor;
    // Google Sheets devuelve los numeros como numeros; los objetos se guardaron
    // como JSON, asi que se intenta parsear sin romper los textos.
    if (typeof valor === 'string' && /^[\[{]/.test(valor.trim())) {
      try { valor = JSON.parse(valor); } catch (e) { /* se deja el texto */ }
    }
    config[f.clave] = valor;
  });
  return config;
}

/** Guarda la config sobrescribiendo la pestana entera: es pequena y de control. */
function guardarConfig_(config) {
  const hoja = pestana_(PESTANAS.config);
  const filas = [ COLUMNAS.config ];

  Object.keys(config).forEach(function(clave) {
    const valor = config[clave];
    filas.push([ clave, typeof valor === 'object' ? JSON.stringify(valor) : valor ]);
  });

  hoja.clear();

  // OJO: `clear()` borra TAMBIEN los encabezados, asi que hay que reponerlos y
  // re-congelar la fila. Sin esto, `_config` se quedaba sin cabecera y `leerFilas_`
  // no encontraba la columna `clave`: la config parecia vacia en cada arranque.
  hoja.getRange(1, 1, filas.length, 2).setValues(filas);
  hoja.getRange(1, 1, 1, 2).setFontWeight('bold');
  hoja.setFrozenRows(1);
}

// ---------------------------------------------------------------------------
// Proyectos: el configurador.json que exporta el plugin de Camunda
// ---------------------------------------------------------------------------

/**
 * Importa un `configurador.json`.
 *
 * CADA IMPORTACION ES UN PROYECTO NUEVO, con la fecha en el id. Antes se
 * actualizaba el existente cuando el nombre coincidia, y eso mezclaba las muestras
 * de la version vieja del diagrama con la nueva: si entre las dos versiones se
 * anadio o se borro una tarea, los `idCorto` se reasignan y las mediciones quedan
 * atribuidas a la tarea equivocada. Con un proyecto por importacion eso no puede
 * pasar, y ademas se pueden medir las dos versiones y compararlas.
 *
 * El `proyectoId` lleva la fecha y, si hiciera falta, un sufijo para que sea unico.
 */
function importarProyecto(configurador) {
  try {
    if (!configurador || configurador.tipo !== 'configurador-tiempos') {
      return { success: false, data: null, message: 'El archivo no es un configurador de tiempos.' };
    }
    if (!Array.isArray(configurador.tareas) || !configurador.tareas.length) {
      return { success: false, data: null, message: 'El configurador no trae tareas que medir.' };
    }

    const proyectoId = proyectoIdUnico_(configurador);
    const proyecto = configurador.proyecto || {};

    appendFila_(PESTANAS.proyectos, {
      proyectoId: proyectoId,
      nombre: proyecto.nombre || '(sin nombre)',
      archivo: proyecto.archivo || '',
      importadoEn: new Date(),
      importadoPor: proyecto.elaboradoPor || '',
      tareas: configurador.tareas.length,
      configurador: JSON.stringify(configurador)
    });

    // Las tareas del proyecto se indexan para poder mostrar el catalogo sin volver a
    // parsear el configurador en cada llamada.
    const cabecera = COLUMNAS.tareas;
    const hojaT = pestana_(PESTANAS.tareas);

    const filas = configurador.tareas.map(function(t) {
      const valores = {
        proyectoId: proyectoId,
        id: t.id,
        idCorto: t.idCorto,
        nombre: t.nombre || '',
        unidad: t.unidad || 'minutes',
        n: 0, media_s: '', desv_s: '', min_s: '', max_s: '',
        margen_s: '', requeridas: '', actualizadoEn: ''
      };
      return cabecera.map(function(col) {
        return valores[col] === undefined ? '' : valores[col];
      });
    });

    if (filas.length) {
      hojaT.getRange(hojaT.getLastRow() + 1, 1, filas.length, cabecera.length).setValues(filas);
    }

    recalcularProyecto(proyectoId);

    return ok_({ proyectoId: proyectoId, tareas: configurador.tareas.length }, 'Proyecto importado');
  } catch (e) {
    return error_(e);
  }
}

/**
 * Id del proyecto: nombre del archivo + fecha, y un sufijo si ya existe.
 *
 * La fecha va en el id para que dos importaciones del MISMO diagrama en dias
 * distintos no se pisen, que es justo lo que hay que evitar.
 */
function proyectoIdUnico_(configurador) {
  const p = configurador.proyecto || {};
  const base = (p.archivo || p.nombre || 'proyecto').toString()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .toLowerCase() || 'proyecto';

  const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const raiz = base + '-' + hoy;

  const existentes = {};
  leerFilas_(PESTANAS.proyectos).forEach(function(f) { existentes[String(f.proyectoId)] = true; });

  if (!existentes[raiz]) return raiz;

  let n = 2;
  while (existentes[raiz + '-' + n]) n++;
  return raiz + '-' + n;
}

/**
 * Borra las filas de un proyecto en una pestana.
 *
 * Se hace de abajo arriba: borrar de arriba abajo desplaza los indices y deja
 * filas sin borrar (un clasico).
 */
function borrarFilasDeProyecto_(nombre, proyectoId) {
  const hoja = pestana_(nombre);
  const ultima = hoja.getLastRow();
  if (ultima < 2) return;

  const ancho = hoja.getLastColumn();
  const cabecera = hoja.getRange(1, 1, 1, ancho).getValues()[0];
  const idx = cabecera.indexOf('proyectoId');
  if (idx === -1) return;

  const valores = hoja.getRange(2, 1, ultima - 1, ancho).getValues();

  for (let i = valores.length - 1; i >= 0; i--) {
    if (String(valores[i][idx]) === String(proyectoId)) {
      hoja.deleteRow(i + 2);
    }
  }
}

function listarProyectos() {
  try {
    // Todas las muestras de una vez, y no una consulta por proyecto: con 20
    // proyectos eso serian 20 lecturas completas de la hoja y Apps Script corta a
    // los 6 minutos.
    const muestras = leerFilas_(PESTANAS.muestras);
    const conteo = {};
    const ultima = {};

    muestras.forEach(function(m) {
      const p = String(m.proyectoId);
      conteo[p] = (conteo[p] || 0) + 1;
      const t = m.creadoEn instanceof Date ? m.creadoEn.getTime() : new Date(m.creadoEn).getTime();
      if (isFinite(t) && (!ultima[p] || t > ultima[p])) ultima[p] = t;
    });

    const apartados = leerFilas_(PESTANAS.apartados);
    const enUso = {};
    apartados.forEach(function(a) {
      if (a.estado === ESTADOS.activa || a.estado === ESTADOS.huerfana) {
        enUso[String(a.proyectoId)] = (enUso[String(a.proyectoId)] || 0) + 1;
      }
    });

    const proyectos = leerFilas_(PESTANAS.proyectos).map(function(p) {
      const id = String(p.proyectoId);
      return {
        proyectoId: id,
        nombre: p.nombre,
        archivo: p.archivo,
        tareas: p.tareas,
        importadoEn: aIso_(p.importadoEn),
        muestras: conteo[id] || 0,
        ultimaMuestra: ultima[id] ? new Date(ultima[id]).toISOString() : '',
        tareasEnUso: enUso[id] || 0,
        // La fila es el desempate: dos importaciones en el mismo segundo comparten
        // `importadoEn` al segundo, y sin esto el orden saldria indefinido.
        __fila: p.__fila
      };
    });

    // El mas reciente primero: es el que se va a seguir midiendo casi siempre.
    proyectos.sort(function(a, b) {
      const porFecha = String(b.importadoEn).localeCompare(String(a.importadoEn));
      return porFecha !== 0 ? porFecha : b.__fila - a.__fila;
    });

    return ok_(proyectos);
  } catch (e) {
    return error_(e);
  }
}

/** Borra un proyecto entero: sus tareas, sus muestras y sus apartados. */
function borrarProyecto(proyectoId) {
  try {
    if (!proyectoId) return { success: false, data: null, message: 'Falta el proyecto.' };

    // No se borra a la ligera: si hay mediciones, se exige que vengan con la
    // confirmacion desde la interfaz para que no se pierda trabajo por un clic.
    const muestras = leerFilas_(PESTANAS.muestras, function(f) {
      return String(f.proyectoId) === String(proyectoId);
    });

    [ PESTANAS.tareas, PESTANAS.muestras, PESTANAS.apartados ].forEach(function(p) {
      borrarFilasDeProyecto_(p, proyectoId);
    });

    const hoja = pestana_(PESTANAS.proyectos);
    const filas = leerFilas_(PESTANAS.proyectos, function(f) {
      return String(f.proyectoId) === String(proyectoId);
    });
    filas.forEach(function(f) { hoja.deleteRow(f.__fila); });

    return ok_({ muestrasBorradas: muestras.length }, 'Proyecto borrado');
  } catch (e) {
    return error_(e);
  }
}

/** Devuelve el configurador guardado de un proyecto, con el avance de cada tarea. */
function obtenerProyecto(proyectoId) {
  try {
    const filas = leerFilas_(PESTANAS.proyectos, function(f) { return f.proyectoId === proyectoId; });
    if (!filas.length) return { success: false, data: null, message: 'Proyecto no encontrado.' };

    const configurador = JSON.parse(filas[0].configurador || '{}');
    const metricas = metricasDe_(proyectoId);

    return ok_({
      proyecto: configurador.proyecto || {},
      tareas: (configurador.tareas || []).map(function(t) {
        const m = metricas[t.id] || {};
        return {
          id: t.id,
          idCorto: t.idCorto,
          nombre: t.nombre,
          unidad: t.unidad,
          supuesto: t.supuesto,
          carga: t.carga,
          metrica: m
        };
      })
    });
  } catch (e) {
    return error_(e);
  }
}

// ---------------------------------------------------------------------------
// Apartados: quien esta midiendo que
//
// La hoja `_apartados` es LA VERDAD y la cache solo acelera. `CacheService` no
// garantiza el TTL (puede desalojar una entrada antes de tiempo), asi que si el
// candado viviera solo en cache, dos operarios medirian la misma tarea SIN
// ENTERARSE: un fallo silencioso, que es lo que hay que evitar.
// ---------------------------------------------------------------------------

function apartadoDe_(proyectoId, id) {
  const filas = leerFilas_(PESTANAS.apartados, function(f) {
    // Se compara como TEXTO por los dos lados: Sheets devuelve numeros como
    // numeros (`1`) y el id puede llegar como cadena (`'1'`). Con `===` crudo, una
    // tarea con id numerico no se encontraba y el candado no bloqueaba nada.
    return String(f.proyectoId) === String(proyectoId) && String(f.id) === String(id);
  });

  // Si hay historial, la vigente es la ultima fila del bloque.
  return filas.length ? filas[filas.length - 1] : null;
}

/**
 * Estado normalizado del apartado vigente.
 *
 * Devuelve SIEMPRE uno de los tres estados. Un apartado cerrado se trata como
 * LIBRE: la fila se conserva por historial (al año dice cuanto se tardo en medir
 * cada tarea), pero no bloquea nada.
 */
function estadoDeApartado_(proyectoId, id) {
  const a = apartadoDe_(proyectoId, id);
  if (!a) return ESTADOS.libre;
  if (a.estado === 'CERRADA' || a.estado === ESTADOS.libre) return ESTADOS.libre;
  return estadoReal_(a);
}

/**
 * Estado REAL de un apartado, teniendo en cuenta el latido.
 *
 * El estado guardado puede decir ACTIVA y aun asi estar huerfano: nadie escribe
 * «se me cerro el navegador». Por eso el estado se DERIVA del latido al leer, y lo
 * que guarda el cron es solo la marca para no recalcularlo siempre.
 */
function estadoReal_(apartado) {
  if (!apartado) return ESTADOS.libre;
  if (apartado.estado === ESTADOS.libre || apartado.estado === 'CERRADA') return apartado.estado;

  const latido = apartado.latidoEn instanceof Date ? apartado.latidoEn : new Date(apartado.latidoEn);
  if (isNaN(latido.getTime())) return ESTADOS.huerfana;

  const segundos = (Date.now() - latido.getTime()) / 1000;
  return segundos > (LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA) ? ESTADOS.huerfana : ESTADOS.activa;
}

/**
 * Aparta una tarea para esta sesion.
 *
 * `forzar = true` recupera un apartado de otra sesion, y es lo que hace el boton
 * «liberar» tras la confirmacion. Se exige que el apartado este HUERFANO: recuperar
 * uno ACTIVO seria pisar a alguien que esta midiendo ahora mismo, y eso no se
 * permite ni con confirmacion.
 */
function apartarTarea(proyectoId, id, sesion, usuario, forzar) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const actual = apartadoDe_(proyectoId, id);
    const estado = estadoDeApartado_(proyectoId, id);
    const esMia = actual && String(actual.sesion) === String(sesion) && estado !== ESTADOS.libre;

    if (estado === ESTADOS.activa && !esMia) {
      return {
        success: false,
        data: {
          estado: ESTADOS.activa,
          sesion: actual.sesion,
          usuario: actual.usuario,
          apartadoEn: aIso_(actual.apartadoEn),
          latidoEn: aIso_(actual.latidoEn)
        },
        message: 'La tarea la esta midiendo ' + (actual.usuario || actual.sesion) + '.'
      };
    }

    if (estado === ESTADOS.huerfana && !esMia && !forzar) {
      return {
        success: false,
        data: {
          estado: ESTADOS.huerfana,
          sesion: actual.sesion,
          usuario: actual.usuario,
          apartadoEn: aIso_(actual.apartadoEn),
          latidoEn: aIso_(actual.latidoEn),
          minSinSenal: Math.round((Date.now() - new Date(actual.latidoEn).getTime()) / 60000),
          umbralMin: Math.round(LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA / 60)
        },
        message: 'La tarea quedo apartada por ' + (actual.usuario || actual.sesion) + ' y no da senales. Se puede liberar.'
      };
    }

    // Recuperar la propia: no hace falta ensuciar el historial con otra fila. Se
    // refresca el latido y ya.
    if (esMia && !forzar) {
      pestana_(PESTANAS.apartados)
        .getRange(actual.__fila, COLUMNAS.apartados.indexOf('latidoEn') + 1).setValue(new Date());
      return ok_({ estado: ESTADOS.activa, sesion: sesion, latidoSegundos: LATIDO_SEGUNDOS }, 'Tarea apartada');
    }

    const ahora = new Date();
    appendFila_(PESTANAS.apartados, {
      proyectoId: proyectoId,
      id: id,
      estado: ESTADOS.activa,
      sesion: sesion,
      usuario: usuario || '',
      apartadoEn: ahora,
      latidoEn: ahora,
      liberadoEn: '',
      liberadoPor: forzar && actual ? (usuario || sesion) : '',
      motivo: forzar && actual ? ('recuperada de ' + (actual.usuario || actual.sesion)) : ''
    });

    return ok_({ estado: ESTADOS.activa, sesion: sesion, latidoSegundos: LATIDO_SEGUNDOS }, 'Tarea apartada');
  } catch (e) {
    return error_(e);
  } finally {
    lock.releaseLock();
  }
}

/** Latido de la sesion: el cliente se declara vivo, el servidor no pregunta nada. */
function latir(proyectoId, id, sesion) {
  try {
    const actual = apartadoDe_(proyectoId, id);

    if (!actual || String(actual.sesion) !== String(sesion) || estadoDeApartado_(proyectoId, id) !== ESTADOS.activa) {
      return { success: false, data: { estado: ESTADOS.libre }, message: 'La sesion ya no tiene el apartado.' };
    }

    pestana_(PESTANAS.apartados).getRange(actual.__fila, COLUMNAS.apartados.indexOf('latidoEn') + 1).setValue(new Date());
    return ok_({ estado: ESTADOS.activa });
  } catch (e) {
    return error_(e);
  }
}

function liberarApartado(proyectoId, id, sesion, usuario) {
  try {
    return escribirCierre_(proyectoId, id, sesion, usuario, 'liberada');
  } catch (e) {
    return error_(e);
  }
}

function escribirCierre_(proyectoId, id, sesion, usuario, motivo) {
  const actual = apartadoDe_(proyectoId, id);
  if (!actual) return ok_({ estado: ESTADOS.libre }, 'No habia apartado');

  const hoja = pestana_(PESTANAS.apartados);
  const cols = COLUMNAS.apartados;
  hoja.getRange(actual.__fila, cols.indexOf('estado') + 1).setValue('CERRADA');
  hoja.getRange(actual.__fila, cols.indexOf('liberadoEn') + 1).setValue(new Date());
  hoja.getRange(actual.__fila, cols.indexOf('liberadoPor') + 1).setValue(usuario || sesion || '');
  hoja.getRange(actual.__fila, cols.indexOf('motivo') + 1).setValue(motivo || '');

  return ok_({ estado: 'CERRADA' }, 'Apartado cerrado');
}

/**
 * El cron: marca HUERFANA lo que lleva sin latido. NO cierra nada.
 *
 * Marcar es reversible; cerrar no lo es. Si este proceso cerrara la sesion de
 * alguien que estaba midiendo 40 tomas, le borraria el trabajo en curso. Marcando,
 * la sesion viva sigue midiendo y lo unico que pasa es que a los demas les aparece
 * el aviso con la opcion de liberar.
 */
function marcarHuerfanas() {
  try {
    const segundos = LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA;
    const activos = leerFilas_(PESTANAS.apartados, function(f) {
      return f.estado === ESTADOS.activa;
    });

    const hoja = pestana_(PESTANAS.apartados);
    let marcadas = 0;

    activos.forEach(function(f) {
      const latido = f.latidoEn instanceof Date ? f.latidoEn : new Date(f.latidoEn);
      if (isNaN(latido.getTime())) return;

      if ((Date.now() - latido.getTime()) / 1000 > segundos) {
        hoja.getRange(f.__fila, COLUMNAS.apartados.indexOf('estado') + 1).setValue(ESTADOS.huerfana);
        marcadas++;
      }
    });

    return ok_({ marcadas: marcadas, revisadas: activos.length, umbralMin: Math.round(segundos / 60) });
  } catch (e) {
    return error_(e);
  }
}

function estadoApartados(proyectoId) {
  try {
    const filas = leerFilas_(PESTANAS.apartados, function(f) {
      return String(f.proyectoId) === String(proyectoId);
    });

    const vigentes = {};
    filas.forEach(function(f) {
      // La ultima fila del bloque manda.
      if (f.estado === 'CERRADA' || f.estado === ESTADOS.libre) {
        delete vigentes[f.id];
      } else {
        vigentes[f.id] = {
          estado: estadoReal_(f),
          sesion: f.sesion,
          usuario: f.usuario,
          apartadoEn: aIso_(f.apartadoEn),
          latidoEn: aIso_(f.latidoEn),
          minSinSenal: f.latidoEn ? Math.round((Date.now() - new Date(f.latidoEn).getTime()) / 60000) : null
        };
      }
    });

    return ok_({ apartados: vigentes, latidoSegundos: LATIDO_SEGUNDOS, umbralMin: Math.round(LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA / 60) });
  } catch (e) {
    return error_(e);
  }
}

function aIso_(valor) {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(valor);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// ---------------------------------------------------------------------------
// Muestras: captura sin bloqueo
//
// Un `append` no sobrescribe nada, asi que nadie tiene que esperar: el candado de
// `_apartados` es para no medir DOS la misma tarea, no para escribir. Lo que si
// hace falta es IDEMPOTENCIA, porque en planta se cae la red y el reintento no
// puede duplicar la muestra.
// ---------------------------------------------------------------------------

/**
 * Guarda un lote de muestras.
 *
 * Recibe un LOTE y no una muestra suelta para que el cliente pueda encolar lo que
 * no pudo enviar y mandarlo todo junto al recuperar la senal. Cada muestra lleva su
 * `muestraId`, asi que reenviar el mismo lote no duplica nada.
 */
function guardarMuestras(proyectoId, id, sesion, usuario, muestras) {
  try {
    if (!Array.isArray(muestras) || !muestras.length) {
      return { success: false, data: null, message: 'No hay muestras que guardar.' };
    }

    // La sesion tiene que tener el apartado: es lo que impide que dos midan la
    // misma tarea. Si lo perdio (la liberaron), se avisa en vez de escribir.
    const actual = apartadoDe_(proyectoId, id);
    const estado = estadoDeApartado_(proyectoId, id);
    const esMia = actual && String(actual.sesion) === String(sesion) && estado !== ESTADOS.libre;

    if (!esMia) {
      return {
        success: false,
        data: { estado: estado },
        message: 'La tarea ya no esta apartada por esta sesion. Vuelve a abrirla.'
      };
    }

    const hoja = pestana_(PESTANAS.muestras);
    const cabecera = COLUMNAS.muestras;
    const idxMuestraId = cabecera.indexOf('muestraId');

    // Los ids ya guardados se leen de una vez (no uno por uno: 200 lecturas a la
    // hoja tardan y el limite de tiempo de Apps Script es de 6 minutos).
    const existentes = {};
    const ultima = hoja.getLastRow();
    if (ultima >= 2) {
      const col = hoja.getRange(2, idxMuestraId + 1, ultima - 1, 1).getValues();
      col.forEach(function(f) { existentes[String(f[0])] = true; });
    }

    const aEscribir = [];
    let duplicadas = 0;

    muestras.forEach(function(m) {
      if (!m || m.tiempo_s === undefined || m.tiempo_s === null) return;
      if (m.muestraId && existentes[String(m.muestraId)]) { duplicadas++; return; }
      if (m.muestraId) existentes[String(m.muestraId)] = true;

      aEscribir.push(aFila_(PESTANAS.muestras, {
        muestraId: m.muestraId || nuevoId_(),
        proyectoId: proyectoId,
        id: id,
        idCorto: m.idCorto || '',
        nombre: m.nombre || '',
        sesion: sesion,
        usuario: usuario || '',
        tiempo_s: Number(m.tiempo_s),
        tipo: m.tipo || 'normal',
        nota: m.nota || '',
        creadoEn: m.creadoEn ? new Date(m.creadoEn) : new Date()
      }));
    });

    if (aEscribir.length) {
      // Se escribe de una sola vez: es MUCHO mas rapido que `appendRow` en bucle.
      hoja.getRange(hoja.getLastRow() + 1, 1, aEscribir.length, cabecera.length).setValues(aEscribir);
    }

    // El latido se actualiza al guardar: guardar es la mejor senal de estar vivo.
    if (actual && actual.sesion === sesion) {
      pestana_(PESTANAS.apartados).getRange(actual.__fila, COLUMNAS.apartados.indexOf('latidoEn') + 1).setValue(new Date());
    }

    recalcularTarea_(proyectoId, id);

    return ok_({
      guardadas: aEscribir.length,
      duplicadas: duplicadas,
      metrica: metricaDeTarea_(proyectoId, id)
    }, aEscribir.length + ' muestra(s) guardada(s)');
  } catch (e) {
    return error_(e);
  }
}

function nuevoId_() {
  return Utilities.getUuid();
}

// ---------------------------------------------------------------------------
// Estadistica
//
// TODO SE CALCULA DE LAS MUESTRAS, nunca se guarda un contador que pueda
// desincronizarse. Es lo que permite recalcular y auditar.
// ---------------------------------------------------------------------------

/** Valores t de Student para los niveles habituales (dos colas). */
const T_ESTUDENT = {
  0.80: { 5: 1.476, 10: 1.372, 15: 1.341, 20: 1.325, 30: 1.310, 60: 1.296, 120: 1.289, 9999: 1.282 },
  0.90: { 5: 2.015, 10: 1.812, 15: 1.753, 20: 1.725, 30: 1.697, 60: 1.671, 120: 1.658, 9999: 1.645 },
  0.95: { 5: 2.571, 10: 2.228, 15: 2.131, 20: 2.086, 30: 2.042, 60: 2.000, 120: 1.980, 9999: 1.960 },
  0.99: { 5: 4.032, 10: 3.169, 15: 2.947, 20: 2.845, 30: 2.750, 60: 2.660, 120: 2.617, 9999: 2.576 }
};

/**
 * t de Student para el nivel pedido y los grados de libertad dados.
 *
 * Se usa t y NO z porque con pocas muestras la normal subestima el margen. Es el
 * mismo criterio que se decidio para las replicas del simulador (A6), y aqui
 * aplica igual.
 */
function tDe_(confianza, grados) {
  const tabla = T_ESTUDENT[confianza] || T_ESTUDENT[0.95];
  const claves = Object.keys(tabla).map(Number).sort(function(a, b) { return a - b; });
  for (let i = 0; i < claves.length; i++) {
    if (grados <= claves[i]) return tabla[claves[i]];
  }
  return tabla[9999];
}

/**
 * Metricas de una tarea, calculadas de sus muestras.
 *
 * MINIMO DE MUESTRAS PARA ESTIMAR: con 3 muestras la desviacion es RUIDO. La
 * formula `n = (t·s / (p·x̄))²` puede decir «faltan 12» con 4 muestras y «faltan 60»
 * con 20. Por eso por debajo del minimo NO se da un numero: se dice que aun no es
 * estimable, que es informativo y evita el falso confort de un «faltan 3» que
 * despues se multiplica por diez.
 */
const MINIMO_PARA_ESTIMAR = 8;

function metricasDe_(proyectoId, filtroSesion) {
  const muestras = leerFilas_(PESTANAS.muestras, function(f) {
    if (String(f.proyectoId) !== String(proyectoId)) return false;
    if (filtroSesion && f.sesion !== filtroSesion) return false;
    return true;
  });

  const porTarea = {};
  muestras.forEach(function(m) {
    const clave = m.id;
    if (!porTarea[clave]) porTarea[clave] = [];
    porTarea[clave].push(m);
  });

  const resultado = {};
  Object.keys(porTarea).forEach(function(id) {
    resultado[id] = estadistica_(porTarea[id]);
  });

  return resultado;
}

function metricaDeTarea_(proyectoId, id) {
  const muestras = leerFilas_(PESTANAS.muestras, function(f) {
    return String(f.proyectoId) === String(proyectoId) && String(f.id) === String(id);
  });
  return estadistica_(muestras);
}

/**
 * Estadistica de un conjunto de muestras.
 *
 * Se excluyen las marcadas como atipica y como calentamiento del CALCULO DE LA
 * MEDIA, pero SE INFORMAN: un descarte que no se ve es un dato escondido. Las de
 * calentamiento son las primeras de una sesion, que son sistematicamente mas lentas.
 */
function estadistica_(muestras) {
  const normales = muestras.filter(function(m) { return (m.tipo || 'normal') === 'normal'; });
  const valores = normales
    .map(function(m) { return Number(m.tiempo_s); })
    .filter(function(v) { return isFinite(v) && v > 0; })
    .sort(function(a, b) { return a - b; });

  const n = valores.length;
  const excluidas = muestras.length - normales.length;

  if (!n) {
    return { n: 0, excluidas: excluidas, estimable: false };
  }

  const suma = valores.reduce(function(a, b) { return a + b; }, 0);
  const media = suma / n;

  const varianza = n > 1
    ? valores.reduce(function(a, b) { return a + Math.pow(b - media, 2); }, 0) / (n - 1)
    : 0;
  const desv = Math.sqrt(varianza);

  const confianza = 0.95;
  const t = tDe_(confianza, n - 1);
  const margen = n > 1 ? t * (desv / Math.sqrt(n)) : 0;

  // n requerido: (t·s / (precision·media))². Depende del COEFICIENTE DE VARIACION
  // (s/media), no de s sola: una tarea de 3 s con ±0.3 y otra de 300 s con ±30
  // necesitan LO MISMO, porque tienen el mismo CV.
  const precision = 0.05;
  let requeridas = null;
  if (n >= MINIMO_PARA_ESTIMAR && media > 0 && desv > 0) {
    requeridas = Math.ceil(Math.pow((t * desv) / (precision * media), 2));
  }

  return {
    n: n,
    excluidas: excluidas,
    media_s: redondear_(media, 3),
    desv_s: n > 1 ? redondear_(desv, 3) : null,
    cv: media > 0 ? redondear_(desv / media, 4) : null,
    min_s: redondear_(valores[0], 3),
    // La moda: el valor mas repetido. Con datos continuos casi nunca se repite, asi
    // que se cae a la media, que es lo que el motor usa como «moda» del triangular
    // cuando no hay una evidente.
    moda_s: modaDe_(valores) || redondear_(media, 3),
    mediana_s: redondear_(mediana_(valores), 3),
    max_s: redondear_(valores[n - 1], 3),
    confianza: confianza,
    margen_s: redondear_(margen, 3),
    inferior_s: redondear_(media - margen, 3),
    superior_s: redondear_(media + margen, 3),
    precision: precision,
    estimable: requeridas !== null,
    requeridas: requeridas,
    minimoParaEstimar: MINIMO_PARA_ESTIMAR,
    // La interpretacion se calcula AQUI y no en la interfaz, para que la app y el
    // informe digan exactamente lo mismo.
    interpretacion: interpretar_(n, requeridas)
  };
}

function interpretar_(n, requeridas) {
  if (n === 0) return 'Sin muestras todavia.';
  if (n < MINIMO_PARA_ESTIMAR) {
    return 'Faltan muestras para estimar cuantas hacen falta: con ' + n +
      ', la desviacion todavia es ruido. Toma al menos ' + MINIMO_PARA_ESTIMAR + '.';
  }
  if (requeridas === null) return 'Todos los tiempos salieron iguales: no hace falta mas.';
  if (n >= requeridas) {
    return 'Suficiente: con ' + n + ' muestras el margen ya esta por debajo del ' +
      Math.round(0.05 * 100) + ' % pedido.';
  }
  return 'Faltan ' + (requeridas - n) + ' muestras (' + n + ' de ' + requeridas + ').';
}

function modaDe_(valores) {
  const cuenta = {};
  let mejor = null;
  let mejorN = 1;
  valores.forEach(function(v) {
    const k = String(v);
    cuenta[k] = (cuenta[k] || 0) + 1;
    if (cuenta[k] > mejorN) { mejorN = cuenta[k]; mejor = v; }
  });
  return mejorN > 1 ? redondear_(mejor, 3) : null;
}

function mediana_(valores) {
  const n = valores.length;
  if (!n) return 0;
  const medio = Math.floor(n / 2);
  return n % 2 ? valores[medio] : (valores[medio - 1] + valores[medio]) / 2;
}

function redondear_(v, dec) {
  const f = Math.pow(10, dec);
  return Math.round(v * f) / f;
}

/** Reescribe la fila de agregados de una tarea. */
function recalcularTarea_(proyectoId, id) {
  const m = metricaDeTarea_(proyectoId, id);
  const filas = leerFilas_(PESTANAS.tareas, function(f) {
    return String(f.proyectoId) === String(proyectoId) && String(f.id) === String(id);
  });
  if (!filas.length) return;

  const hoja = pestana_(PESTANAS.tareas);
  const cols = COLUMNAS.tareas;
  const f = filas[0];

  const set = function(col, valor) {
    hoja.getRange(f.__fila, cols.indexOf(col) + 1).setValue(valor === null || valor === undefined ? '' : valor);
  };

  set('n', m.n || 0);
  set('media_s', m.media_s || '');
  set('desv_s', m.desv_s === null || m.desv_s === undefined ? '' : m.desv_s);
  set('min_s', m.min_s || '');
  set('max_s', m.max_s || '');
  set('margen_s', m.margen_s || '');
  set('requeridas', m.requeridas === null || m.requeridas === undefined ? '' : m.requeridas);
  set('actualizadoEn', new Date());
}

function recalcularProyecto(proyectoId) {
  try {
    const filas = leerFilas_(PESTANAS.tareas, function(f) { return String(f.proyectoId) === String(proyectoId); });
    filas.forEach(function(f) { recalcularTarea_(proyectoId, f.id); });
    return ok_({ tareas: filas.length });
  } catch (e) {
    return error_(e);
  }
}

/** Devuelve las muestras crudas para exportar `mediciones.json`. */
function obtenerMediciones(proyectoId) {
  try {
    const filas = leerFilas_(PESTANAS.muestras, function(f) { return String(f.proyectoId) === String(proyectoId); });
    const metricas = metricasDe_(proyectoId);

    // Por operario: la concordancia entre analistas es lo que da valor pericial, y
    // mezclar a dos personas en un solo intervalo esconde que miden distinto.
    const porUsuario = {};
    filas.forEach(function(f) {
      const u = f.usuario || '(sin usuario)';
      if (!porUsuario[u]) porUsuario[u] = {};
      if (!porUsuario[u][f.id]) porUsuario[u][f.id] = [];
      porUsuario[u][f.id].push(Number(f.tiempo_s));
    });

    const porOperario = {};
    Object.keys(porUsuario).forEach(function(u) {
      porOperario[u] = {};
      Object.keys(porUsuario[u]).forEach(function(id) {
        porOperario[u][id] = estadistica_(porUsuario[u][id].map(function(t) { return { tiempo_s: t, tipo: 'normal' }; }));
      });
    });

    return ok_({
      tipo: 'mediciones-tiempos',
      version: 1,
      proyectoId: proyectoId,
      metricas: metricas,
      porOperario: porOperario,
      totalMuestras: filas.length
    });
  } catch (e) {
    return error_(e);
  }
}

// ---------------------------------------------------------------------------
// Diagnostico
//
// Estas acciones existen para poder COMPROBAR que el sistema esta bien sin ver ni
// un dato de planta: devuelven estructura y conteos, nunca tiempos reales.
// ---------------------------------------------------------------------------

function ping() {
  try {
    return ok_({
      vivo: true,
      esquemaVersion: ESQUEMA_VERSION,
      pestanas: Object.keys(PESTANAS).map(function(k) { return PESTANAS[k]; }),
      latidoSegundos: LATIDO_SEGUNDOS,
      umbralHuerfanaMin: Math.round(LATIDO_SEGUNDOS * INTERVALOS_PARA_HUERFANA / 60),
      minimoParaEstimar: MINIMO_PARA_ESTIMAR
    }, 'Vivo');
  } catch (e) {
    return error_(e);
  }
}

/** Estructura real de las pestanas: nombres de columna y cuantas filas hay. */
function esquema() {
  try {
    const libro = libro_();
    const estructura = {};

    Object.keys(PESTANAS).forEach(function(k) {
      const nombre = PESTANAS[k];
      const hoja = libro.getSheetByName(nombre);

      if (!hoja) {
        estructura[nombre] = { existe: false };
        return;
      }

      const ancho = hoja.getLastColumn();
      estructura[nombre] = {
        existe: true,
        filas: Math.max(0, hoja.getLastRow() - 1),
        columnas: ancho ? hoja.getRange(1, 1, 1, ancho).getValues()[0] : [],
        columnasEsperadas: columnasDe_(nombre),
        // Se comprueba la COINCIDENCIA: si alguien renombro una columna, aqui se ve.
        coincide: JSON.stringify(
          (ancho ? hoja.getRange(1, 1, 1, ancho).getValues()[0] : []).filter(String)
        ) === JSON.stringify(columnasDe_(nombre))
      };
    });

    const config = leerConfig_();

    return ok_({
      esquemaVersion: ESQUEMA_VERSION,
      esquemaEnHoja: config.esquemaVersion || null,
      alDia: Number(config.esquemaVersion) === ESQUEMA_VERSION,
      pestanas: estructura
    });
  } catch (e) {
    return error_(e);
  }
}

/** Conteos por proyecto: cuantas tareas y cuantas muestras, SIN los tiempos. */
function ultimasMuestras(proyectoId, limite) {
  try {
    const filas = leerFilas_(PESTANAS.muestras, function(f) {
      return !proyectoId || String(f.proyectoId) === String(proyectoId);
    });

    const porTarea = {};
    filas.forEach(function(f) {
      const clave = f.proyectoId + '/' + f.id;
      porTarea[clave] = (porTarea[clave] || 0) + 1;
    });

    return ok_({
      total: filas.length,
      porTarea: porTarea,
      // A proposito NO se devuelven los tiempos: es diagnostico de estructura.
      ultimas: filas.slice(-Math.min(limite || 5, filas.length)).map(function(f) {
        return {
          proyectoId: f.proyectoId,
          id: f.id,
          idCorto: f.idCorto,
          tipo: f.tipo,
          usuario: f.usuario,
          creadoEn: aIso_(f.creadoEn)
        };
      })
    });
  } catch (e) {
    return error_(e);
  }
}

/**
 * Instala el cron que marca huerfanas.
 *
 * Se instala a mano una vez (no se puede crear un disparador desde el propio codigo
 * sin permiso explicito). Se ejecuta cada 5 minutos y solo MARCA: nunca cierra.
 */
function instalarCron() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'marcarHuerfanas') ScriptApp.deleteTrigger(t);
    });

    ScriptApp.newTrigger('marcarHuerfanas').timeBased().everyMinutes(5).create();

    return ok_({ cadaMinutos: 5 }, 'Cron instalado');
  } catch (e) {
    return error_(e);
  }
}

function quitarCron() {
  try {
    let quitados = 0;
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'marcarHuerfanas') {
        ScriptApp.deleteTrigger(t);
        quitados++;
      }
    });
    return ok_({ quitados: quitados });
  } catch (e) {
    return error_(e);
  }
}
