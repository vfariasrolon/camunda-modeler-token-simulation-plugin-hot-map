/**
 * Arnes de la app de campo (Code.gs).
 *
 * Por que existe: `Code.gs` no se puede ejecutar fuera de Google, asi que sus
 * funciones se extraen y se prueban con los servicios de Apps Script SIMULADOS.
 * No reimplementa nada: lee las funciones REALES del archivo y las ejercita.
 *
 * Cubre las dos cosas que, si estan mal, fallan EN SILENCIO:
 *   - La estadistica (n requerido): una tarea con coeficiente de variacion
 *     conocido TIENE que dar un n calculable a mano. Si la formula esta mal, el
 *     operario ve un numero y no sabe que es mentira.
 *   - El candado: dos sesiones sobre la misma tarea. Si falla, dos personas miden
 *     lo mismo y nadie se entera.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUENTE = readFileSync(join(RAIZ, 'app-tiempos', 'Code.gs'), 'utf8');

// ---------------------------------------------------------------------------
// Simulacion de los servicios de Apps Script
// ---------------------------------------------------------------------------

/**
 * Una hoja de calculo en memoria, con la misma API que se usa en Code.gs.
 *
 * OJO: `getLastRow()` cuenta la ultima fila CON CONTENIDO, no el largo del array.
 * Es la semantica real de Sheets y la primera version de este doble la tenia mal:
 * devolvia 0 despues de escribir los encabezados con `setValues`, asi que
 * `appendRow` escribia en la fila 1 ENCIMA de ellos. El arnes fallaba por su
 * propio doble, no por el codigo: un doble infiel hace perder el tiempo persiguiendo
 * un bug que no existe.
 */
class HojaFalsa {
  constructor(nombre) {
    this.nombre = nombre;
    this.datos = [];
    this.congeladas = 0;
  }

  getLastRow() {
    let ultima = 0;
    this.datos.forEach((fila, i) => {
      if (fila.some((c) => c !== '' && c !== null && c !== undefined)) ultima = i + 1;
    });
    return ultima;
  }

  getLastColumn() { return this.datos.reduce((m, f) => Math.max(m, f.length), 0); }

  escribir(fila, col, valor) {
    while (this.datos.length < fila) this.datos.push([]);
    while (this.datos[fila - 1].length < col) this.datos[fila - 1].push('');
    this.datos[fila - 1][col - 1] = valor;
  }

  getRange(fila, col, alto = 1, ancho = 1) {
    const hoja = this;
    return {
      getValues() {
        const out = [];
        for (let f = 0; f < alto; f++) {
          const filaDatos = hoja.datos[fila - 1 + f] || [];
          const filaOut = [];
          for (let c = 0; c < ancho; c++) {
            const v = filaDatos[col - 1 + c];
            filaOut.push(v === undefined ? '' : v);
          }
          out.push(filaOut);
        }
        return out;
      },
      setValues(valores) {
        valores.forEach((filaV, i) => filaV.forEach((v, j) => hoja.escribir(fila + i, col + j, v)));
        return this;
      },
      setValue(v) { hoja.escribir(fila, col, v); return this; },
      setFontWeight() { return this; }
    };
  }

  // Como Sheets: despues de la ultima fila con contenido.
  appendRow(fila) {
    const r = this.getLastRow() + 1;
    fila.forEach((v, j) => this.escribir(r, j + 1, v));
  }

  deleteRow(n) { this.datos.splice(n - 1, 1); }

  clear() { this.datos = []; return this; }

  setFrozenRows(n) { this.congeladas = n; return this; }
}

class LibroFalso {
  constructor() { this.hojas = new Map(); }
  getSheetByName(n) { return this.hojas.get(n) || null; }
  insertSheet(n) { const h = new HojaFalsa(n); this.hojas.set(n, h); return h; }
}

/** Carga Code.gs con los servicios simulados y devuelve sus funciones. */
function cargar() {
  const libro = new LibroFalso();

  const servicios = {
    SpreadsheetApp: { openById: () => libro },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k === 'ID_HOJA' ? 'hoja-de-prueba' : null),
        setProperty: () => {}
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
    },
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 10),
      // La usa el id del proyecto, que lleva la fecha. Se fija una para que el id
      // sea predecible en las comprobaciones.
      formatDate: (fecha, zona, patron) => {
        const d = fecha instanceof Date ? fecha : new Date(fecha);
        const p = (n) => String(n).padStart(2, '0');
        return patron === 'yyyy-MM-dd'
          ? `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
          : d.toISOString();
      }
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }),
      deleteTrigger: () => {}
    },
    CacheService: {
      getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} })
    },
    HtmlService: {},
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } })
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => '' }),
      getScriptTimeZone: () => 'America/Mexico_City'
    }
  };

  // Se ejecuta el codigo REAL en un contexto con los servicios simulados.
  const fabrica = new Function(
    ...Object.keys(servicios),
    FUENTE + '\nreturn { estadistica_, tDe_, interpretar_, marcarHuerfanas, apartarTarea, ' +
    'latir, liberarApartado, guardarMuestras, estadoApartados, prepararHoja, ' +
    'importarProyecto, obtenerProyecto, obtenerMediciones, listarProyectos, ' +
    'ping, esquema, ultimasMuestras, estadoDeApartado_, recalcularTarea_, ' +
    'diagnostico_, conteosDeMuestras, repararEncabezados, ' +
    'MINIMO_PARA_ESTIMAR, LATIDO_SEGUNDOS, INTERVALOS_PARA_HUERFANA, ESTADOS, PESTANAS, COLUMNAS };'
  );

  return {
    libro,
    api: fabrica(...Object.values(servicios)),
    hoja: (n) => libro.getSheetByName(n),
    fila: (n, i) => (libro.getSheetByName(n) || { datos: [] }).datos[i]
  };
}

// ---------------------------------------------------------------------------

console.log('\n== 1. La t formula de Student y la tabla ==');
{
  const { api } = cargar();

  // Con infinitos grados de libertad, t = z: 1.96 al 95 %.
  ok(api.tDe_(0.95, 9999) === 1.96, 'con infinitos grados t tiende a z', String(api.tDe_(0.95, 9999)));
  // Con pocos grados tiene que ser MAYOR: si fuera menor, el intervalo seria
  // demasiado estrecho y mentiria.
  ok(api.tDe_(0.95, 5) > api.tDe_(0.95, 30), 'con pocos grados t es mayor (mas margen)',
    `${api.tDe_(0.95, 5)} > ${api.tDe_(0.95, 30)}`);
  ok(api.tDe_(0.99, 10) > api.tDe_(0.95, 10), 'al 99 % el margen es mayor que al 95 %');
}

console.log('\n== 2. El n requerido depende del CV, no de la desviacion sola ==');
{
  const { api } = cargar();

  // DOS tareas con el MISMO coeficiente de variacion (s/media = 0.1) pero escalas
  // muy distintas TIENEN que dar el MISMO n requerido. Es la propiedad que hace
  // util el indicador; si no se cumple, la formula esta mal.
  const pequena = [];
  const grande = [];
  // media 10 s, s ~1 s  |  media 300 s, s ~30 s
  const patron = [-1.5, -1, -0.5, 0, 0, 0.5, 1, 1.5];

  for (let i = 0; i < 20; i++) {
    const k = patron[i % patron.length];
    pequena.push({ tiempo_s: 10 + k * 1.0, tipo: 'normal' });
    grande.push({ tiempo_s: 300 + k * 30, tipo: 'normal' });
  }

  const a = api.estadistica_(pequena);
  const b = api.estadistica_(grande);

  ok(Math.abs(a.cv - b.cv) < 0.02, 'las dos tareas tienen el mismo CV', `${a.cv} vs ${b.cv}`);

  // Se calculan a mano: n = (t*s/(p*media))^2
  const esperadoA = Math.ceil(Math.pow((api.tDe_(0.95, a.n - 1) * a.desv_s) / (0.05 * a.media_s), 2));

  ok(a.requeridas === esperadoA, 'el n requerido coincide con la formula calculada a mano',
    `${a.requeridas} vs ${esperadoA}`);
  ok(Math.abs(a.requeridas - b.requeridas) <= Math.ceil(a.requeridas * 0.1) + 1,
    'y las dos escalas piden un n parecido (mismo CV, misma n)',
    `${a.requeridas} vs ${b.requeridas}`);
}

console.log('\n== 3. Con pocas muestras NO se inventa un n (el falso confort) ==');
{
  const { api, ...resto } = cargar();
  void resto;

  const pocas = [ 9.1, 10.2, 8.8 ];
  const m = api.estadistica_(pocas.map((t) => ({ tiempo_s: t, tipo: 'normal' })));

  ok(m.n === 3, 'cuenta 3 muestras', String(m.n));
  ok(m.estimable === false, 'NO se declara estimable con 3 muestras');
  ok(m.requeridas === null, 'y no da un n requerido (seria ruido)', String(m.requeridas));
  ok(/ruido/.test(m.interpretacion) && /8/.test(m.interpretacion),
    'la interpretacion lo dice y nombra el minimo', m.interpretacion);
  ok(/todavia es ruido/.test(m.interpretacion), 'sin prometer un numero que no puede cumplir');

  // Con el minimo SI estima.
  const suficientes = [ 10, 10.5, 9.5, 10.1, 9.9, 10.2, 9.8, 10.0 ];
  const m2 = api.estadistica_(suficientes.map((t) => ({ tiempo_s: t, tipo: 'normal' })));
  ok(m2.estimable === true, 'con el minimo de muestras ya estima', String(m2.n));
  ok(typeof m2.requeridas === 'number' && m2.requeridas > 0, 'y da un numero', String(m2.requeridas));
}

console.log('\n== 4. Estadistica: los numeros cuadran a mano ==');
{
  const { api } = cargar();
  const valores = [ 10, 12, 14, 16, 18 ];
  const m = api.estadistica_(valores.map((t) => ({ tiempo_s: t, tipo: 'normal' })));

  ok(m.n === 5, 'n = 5', String(m.n));
  ok(m.media_s === 14, 'la media es 14', String(m.media_s));
  ok(m.min_s === 10 && m.max_s === 18, 'min y max', `${m.min_s}/${m.max_s}`);
  ok(m.mediana_s === 14, 'la mediana tambien es 14', String(m.mediana_s));
  // Desviacion muestral de [10,12,14,16,18]: raiz(40/4) = raiz(10) = 3.162
  ok(Math.abs(m.desv_s - 3.162) < 0.001, 'la desviacion es raiz(10) = 3.162', String(m.desv_s));
  // Margen = t(0.95, n-1) * s/raiz(n) = 2.571 * 3.1623/raiz(5) = 3.636
  // OJO con el t: con n=5 los grados son 4, y la tabla da 2.571 (2.776 es de 5
  // grados: usar el de mas grados daria un margen MENOR y mentiria a la baja).
  const esperado = 2.571 * (3.162 / Math.sqrt(5));
  ok(Math.abs(m.margen_s - esperado) < 0.01, 'el margen usa t y raiz(n)', `${m.margen_s} vs ${esperado.toFixed(3)}`);
  ok(m.margen_s > 3.6 && m.margen_s < 3.7, 'y el valor es el de la tabla para 4 grados', String(m.margen_s));
  ok(m.inferior_s < m.media_s && m.superior_s > m.media_s, 'el intervalo rodea la media');
}

console.log('\n== 5. Las muestras atipicas y de calentamiento se excluyen PERO se informan ==');
{
  const { api } = cargar();
  const mezcla = [
    { tiempo_s: 10, tipo: 'normal' },
    { tiempo_s: 10.2, tipo: 'normal' },
    { tiempo_s: 9.8, tipo: 'normal' },
    { tiempo_s: 99, tipo: 'atipica' },      // una interrupcion
    { tiempo_s: 25, tipo: 'calentamiento' } // la primera, mas lenta
  ];

  const m = api.estadistica_(mezcla);
  ok(m.n === 3, 'solo cuenta las normales', String(m.n));
  ok(m.excluidas === 2, 'y DICE cuantas excluyo (un descarte invisible es un dato escondido)', String(m.excluidas));
  ok(m.media_s < 11, 'la atipica de 99 no arrastra la media', String(m.media_s));
}

console.log('\n== 6. El candado: dos sesiones sobre la MISMA tarea ==');
{
  const { libro, api } = cargar();
  libro.insertSheet(api.PESTANAS.apartados);
  libro.insertSheet(api.PESTANAS.config);
  libro.getSheetByName(api.PESTANAS.apartados)
    .getRange(1, 1, 1, api.COLUMNAS.apartados.length).setValues([ api.COLUMNAS.apartados ]);

  // La sesion A aparta.
  const a = api.apartarTarea('demo', 'Task_1', 'sesion-A', 'Ana', false);
  ok(a.success === true, 'la primera sesion aparta sin problema', a.message);

  // La sesion B NO puede, y ademas el mensaje dice quien.
  const b = api.apartarTarea('demo', 'Task_1', 'sesion-B', 'Luis', false);
  ok(b.success === false, 'la segunda NO puede apartar la misma tarea');
  ok(b.data && b.data.estado === api.ESTADOS.activa, 'y sabe que esta ACTIVA', String(b.data && b.data.estado));
  ok(/Ana/.test(b.message), 'el mensaje dice quien la tiene (no un error generico)', b.message);

  // La misma sesion si puede volver a entrar (idempotente).
  const a2 = api.apartarTarea('demo', 'Task_1', 'sesion-A', 'Ana', false);
  ok(a2.success === true, 'la MISMA sesion puede volver a entrar', a2.message);
}

console.log('\n== 7. El cron MARCA huerfana, no cierra ==');
{
  const { libro, api } = cargar();
  libro.insertSheet(api.PESTANAS.apartados);
  libro.getSheetByName(api.PESTANAS.apartados)
    .getRange(1, 1, 1, api.COLUMNAS.apartados.length).setValues([ api.COLUMNAS.apartados ]);

  api.apartarTarea('demo', 'Task_1', 'sesion-A', 'Ana', false);

  // Se envejece el latido MAS alla del umbral.
  const hoja = libro.getSheetByName(api.PESTANAS.apartados);
  const idxLatido = api.COLUMNAS.apartados.indexOf('latidoEn');
  // Se escribe con la API de la hoja: el apartado vive en la fila 2 (la 1 son los
  // encabezados), y depender del indice del array interno seria fragil.
  hoja.getRange(2, idxLatido + 1).setValue(
    new Date(Date.now() - (api.LATIDO_SEGUNDOS * api.INTERVALOS_PARA_HUERFANA + 60) * 1000));

  const marcado = api.marcarHuerfanas();
  ok(marcado.success === true, 'el cron corre', marcado.message);
  ok(marcado.data.marcadas === 1, 'marca una', String(marcado.data.marcadas));

  // Y NO la cerro: la fila sigue existiendo con estado HUERFANA.
  const idxEstado = api.COLUMNAS.apartados.indexOf('estado');
  const estadoGuardado = hoja.getRange(2, idxEstado + 1).getValues()[0][0];
  ok(estadoGuardado === api.ESTADOS.huerfana,
    'el estado quedo HUERFANA (no CERRADA)', String(estadoGuardado));
  ok(hoja.getLastRow() === 2, 'no se borro ninguna fila', String(hoja.getLastRow()));

  // Otra sesion la ve como huerfana y se le pide confirmar.
  const b = api.apartarTarea('demo', 'Task_1', 'sesion-B', 'Luis', false);
  ok(b.success === false && b.data.estado === api.ESTADOS.huerfana,
    'la segunda sesion ve HUERFANA y no entra sola', String(b.data && b.data.estado));
  ok(/no da senales/.test(b.message), 'el mensaje explica que se puede liberar', b.message);
  ok(typeof b.data.minSinSenal === 'number', 'y dice hace cuantos minutos', String(b.data.minSinSenal));
  ok(typeof b.data.umbralMin === 'number', 'con el umbral a la vista (no escondido)', String(b.data.umbralMin));

  // Con la confirmacion (forzar) SI entra.
  const forzado = api.apartarTarea('demo', 'Task_1', 'sesion-B', 'Luis', true);
  ok(forzado.success === true, 'con confirmacion, la segunda entra', forzado.message);

  // Y no se puede forzar sobre una ACTIVA.
  api.apartarTarea('demo', 'Task_2', 'sesion-C', 'Eva', false);
  const sobreActiva = api.apartarTarea('demo', 'Task_2', 'sesion-D', 'Raul', true);
  ok(sobreActiva.success === false,
    'forzar NO sirve sobre una sesion ACTIVA (no se pisa a quien esta midiendo)');
}

console.log('\n== 8. Guardado idempotente: el reintento no duplica ==');
{
  const { libro, api } = cargar();
  [ api.PESTANAS.apartados, api.PESTANAS.muestras, api.PESTANAS.tareas, api.PESTANAS.config ]
    .forEach((n) => libro.insertSheet(n));
  libro.getSheetByName(api.PESTANAS.apartados)
    .getRange(1, 1, 1, api.COLUMNAS.apartados.length).setValues([ api.COLUMNAS.apartados ]);
  libro.getSheetByName(api.PESTANAS.muestras)
    .getRange(1, 1, 1, api.COLUMNAS.muestras.length).setValues([ api.COLUMNAS.muestras ]);
  libro.getSheetByName(api.PESTANAS.tareas)
    .getRange(1, 1, 1, api.COLUMNAS.tareas.length).setValues([ api.COLUMNAS.tareas ]);

  api.apartarTarea('demo', 'Task_1', 'sesion-A', 'Ana', false);

  const lote = [
    { muestraId: 'm1', tiempo_s: 10.0 },
    { muestraId: 'm2', tiempo_s: 10.5 },
    { muestraId: 'm3', tiempo_s: 10.2 }
  ];

  const primera = api.guardarMuestras('demo', 'Task_1', 'sesion-A', 'Ana', lote);
  ok(primera.success === true, 'el primer envio guarda', primera.message);
  ok(primera.data.guardadas === 3, 'guarda las 3', String(primera.data.guardadas));
  ok(primera.data.duplicadas === 0, 'sin duplicados', String(primera.data.duplicadas));

  // El MISMO lote otra vez: es el reintento tras un fallo de red.
  const segunda = api.guardarMuestras('demo', 'Task_1', 'sesion-A', 'Ana', lote);
  ok(segunda.success === true, 'el reintento no falla', segunda.message);
  ok(segunda.data.guardadas === 0, 'no guarda nada nuevo', String(segunda.data.guardadas));
  ok(segunda.data.duplicadas === 3, 'y dice que las 3 ya estaban', String(segunda.data.duplicadas));

  const filas = libro.getSheetByName(api.PESTANAS.muestras).datos.length - 1;
  ok(filas === 3, 'la hoja tiene 3 muestras, no 6 (esto es lo que evita el bloqueo)', String(filas));

  // Una sesion que YA NO tiene el apartado no puede escribir.
  api.liberarApartado('demo', 'Task_1', 'sesion-A', 'Ana');
  api.apartarTarea('demo', 'Task_1', 'sesion-B', 'Luis', false);
  const intruso = api.guardarMuestras('demo', 'Task_1', 'sesion-A', 'Ana', [ { muestraId: 'm9', tiempo_s: 5 } ]);
  ok(intruso.success === false,
    'una sesion sin el apartado NO puede guardar (el candado se respeta al escribir)');
  ok(/Vuelve a abrirla/.test(intruso.message), 'y se le dice que hacer', intruso.message);
}

console.log('\n== 9. La hoja se prepara sola y el encabezado NO se reescribe ==');
{
  const { libro, api } = cargar();

  const prep = api.prepararHoja();
  ok(prep.success === true, 'prepararHoja funciona', prep.message);
  ok(prep.data.esquemaVersion === 1, 'deja el esquema en la version 1', String(prep.data.esquemaVersion));

  Object.values(api.PESTANAS).forEach((n) => {
    const h = libro.getSheetByName(n);
    ok(Boolean(h), `se creo la pestana «${n}»`);
  });

  const bd = libro.getSheetByName(api.PESTANAS.muestras);
  const cabeceraBd = bd.getRange(1, 1, 1, api.COLUMNAS.muestras.length).getValues()[0];
  ok(cabeceraBd.join(',') === api.COLUMNAS.muestras.join(','), 'con sus encabezados en orden');

  // El encabezado que FALTA se repone (ver la seccion 15), pero NUNCA encima de datos:
  // si debajo hay filas, se avisa y no se toca. Aqui la pestana esta vacia, asi que
  // reponerlo es correcto y seguro.
  bd.getRange(1, 1, 1, api.COLUMNAS.muestras.length).setValues([ api.COLUMNAS.muestras.map(() => '') ]);
  api.prepararHoja();

  const cabeceraDespues = bd.getRange(1, 1, 1, 3).getValues()[0];
  ok(cabeceraDespues.join(',') === 'muestraId,proyectoId,id',
    'un encabezado borrado se repone al arrancar (la pestana esta vacia)',
    JSON.stringify(cabeceraDespues));
}

console.log('\n== 10. Importar el configurador del plugin ==');
{
  const { libro, api } = cargar();
  api.prepararHoja();

  const configurador = {
    tipo: 'configurador-tiempos',
    version: 1,
    proyecto: { nombre: 'demo', archivo: 'demo.bpmn', fecha: '2026-09-18', semilla: 's-1' },
    tareas: [
      { id: 'Task_1', idCorto: 1, nombre: 'Cortar', tipo: 'bpmn:UserTask', unidad: 'minutes',
        supuesto: { distribucion: 'triangular', min: 5, moda: 10, max: 20, unidad: 'minutes' },
        tiempoPorLote: false, carga: { masaCargadaKg: 12, masaArrastradaKg: null, distanciaM: null } },
      { id: 'Task_2', idCorto: 2, nombre: 'Soldar', tipo: 'bpmn:ServiceTask', unidad: 'seconds',
        supuesto: { distribucion: 'fixed', valor: 30, unidad: 'seconds' },
        tiempoPorLote: true, carga: { masaCargadaKg: null, masaArrastradaKg: null, distanciaM: null } }
    ]
  };

  const r = api.importarProyecto(configurador);
  ok(r.success === true, 'importa sin errores', r.message);
  // El id lleva la FECHA: dos importaciones del mismo diagrama en dias distintos no
  // pueden pisarse. Es lo que evita mezclar las muestras de dos versiones.
  ok(/^demo-\d{4}-\d{2}-\d{2}$/.test(r.data.proyectoId),
    'el proyectoId lleva el nombre y la fecha', r.data.proyectoId);
  ok(r.data.tareas === 2, 'registra las 2 tareas', String(r.data.tareas));

  const proyectoId1 = r.data.proyectoId;
  const tareas = libro.getSheetByName(api.PESTANAS.tareas);
  ok(tareas.getLastRow() === 3, 'la pestana tareas tiene encabezado + 2', String(tareas.getLastRow()));

  const idxIdCorto = api.COLUMNAS.tareas.indexOf('idCorto');
  const cortos = tareas.getRange(2, idxIdCorto + 1, 2, 1).getValues().map((f) => Number(f[0]));
  ok(cortos[0] === 1 && cortos[1] === 2,
    'con el idCorto derivado del diagrama', JSON.stringify(cortos));

  // --- CADA IMPORTACION ES UN PROYECTO NUEVO (la decision que evita mezclar) ---
  const r2 = api.importarProyecto(configurador);
  ok(r2.success === true, 'reimportar funciona', r2.message);
  ok(r2.data.proyectoId !== proyectoId1,
    'y crea un proyecto DISTINTO (no actualiza el anterior)',
    `${proyectoId1} → ${r2.data.proyectoId}`);
  ok(libro.getSheetByName(api.PESTANAS.proyectos).getLastRow() === 3,
    'quedan los dos proyectos en la hoja',
    String(libro.getSheetByName(api.PESTANAS.proyectos).getLastRow()));

  // Las tareas de los dos proyectos conviven separadas.
  const tareas2 = libro.getSheetByName(api.PESTANAS.tareas);
  ok(tareas2.getLastRow() === 5, 'y sus tareas tambien (2 + 2)', String(tareas2.getLastRow()));

  // El motivo de fondo: si el diagrama cambia, los idCorto se reasignan, asi que las
  // mediciones de cada version TIENEN que quedar en su propio proyecto.
  const proyectos = api.listarProyectos();
  ok(proyectos.success === true && proyectos.data.length === 2, 'listarProyectos devuelve los 2');
  ok(proyectos.data[0].proyectoId === r2.data.proyectoId,
    'y el mas reciente va primero (es el que se va a medir)',
    proyectos.data[0].proyectoId);

  // Un archivo que no es un configurador se rechaza.
  const malo = api.importarProyecto({ tipo: 'otra-cosa' });
  ok(malo.success === false, 'un archivo que no es un configurador se rechaza');
  ok(/no es un configurador/.test(malo.message), 'con un mensaje que lo explica', malo.message);

  // Y el proyecto se puede leer de vuelta CON las metricas.
  const leido = api.obtenerProyecto(proyectoId1);
  ok(leido.success === true, 'se lee de vuelta', leido.message);
  ok(leido.data.tareas.length === 2, 'con sus 2 tareas');
}

console.log('\n== 11. Dos versiones del MISMO diagrama no se mezclan ==');
{
  const { libro, api } = cargar();
  api.prepararHoja();

  const base = {
    tipo: 'configurador-tiempos', version: 1,
    proyecto: { nombre: 'demo', archivo: 'demo.bpmn' },
    tareas: [ { id: 'Task_1', idCorto: 1, nombre: 'Cortar', unidad: 'minutes', supuesto: {} } ]
  };

  // Version 1: se mide la tarea 1.
  const v1 = api.importarProyecto(base).data.proyectoId;
  api.apartarTarea(v1, 'Task_1', 'sesion-A', 'Ana', false);
  api.guardarMuestras(v1, 'Task_1', 'sesion-A', 'Ana',
    [ 10, 10.5, 9.8, 10.2, 10.1, 9.9, 10.3, 10.0 ].map((t, i) => ({ muestraId: 'x' + i, tiempo_s: t })));

  // Lee el `n` de la fila de una tarea, por proyecto. Se usa la API de la hoja, no
  // el array interno: lo que importa es lo que queda ESCRITO.
  const filaDe = (proyectoId, id) => {
    const t = libro.getSheetByName(api.PESTANAS.tareas);
    const cols = api.COLUMNAS.tareas;
    const filas = t.getRange(1, 1, t.getLastRow(), cols.length).getValues();
    return filas.find((f) =>
      String(f[cols.indexOf('proyectoId')]) === String(proyectoId) &&
      String(f[cols.indexOf('id')]) === String(id));
  };
  const nDe = (proyectoId, id) => {
    const f = filaDe(proyectoId, id);
    return f ? Number(f[api.COLUMNAS.tareas.indexOf('n')]) : 0;
  };

  ok(nDe(v1, 'Task_1') === 8, 'la version 1 quedo con 8 muestras', String(nDe(v1, 'Task_1')));

  // El analista cambia el diagrama (anade una tarea ANTES: los idCorto se reasignan)
  // y vuelve a importar el mismo archivo.
  const base2 = JSON.parse(JSON.stringify(base));
  base2.tareas = [
    { id: 'Task_0', idCorto: 1, nombre: 'Preparar', unidad: 'minutes', supuesto: {} },
    { id: 'Task_1', idCorto: 2, nombre: 'Cortar', unidad: 'minutes', supuesto: {} }
  ];
  const v2 = api.importarProyecto(base2).data.proyectoId;

  ok(v2 !== v1, 'la segunda version es un proyecto DISTINTO', v2);
  ok(nDe(v1, 'Task_1') === 8, 'y la version 1 CONSERVA sus 8 muestras intactas', String(nDe(v1, 'Task_1')));
  ok(nDe(v2, 'Task_1') === 0, 'mientras la version 2 empieza de cero', String(nDe(v2, 'Task_1')));

  // ESTE es el motivo de todo: en la v2 la tarea «Cortar» paso de idCorto 1 a 2.
  // Si se hubieran fusionado, las 8 muestras de Cortar aparecerian bajo el idCorto 1,
  // que en la version nueva es OTRA tarea.
  const idxC = api.COLUMNAS.tareas.indexOf('idCorto');
  const cortarV1 = filaDe(v1, 'Task_1');
  const cortarV2 = filaDe(v2, 'Task_1');
  ok(Number(cortarV1[idxC]) === 1 && Number(cortarV2[idxC]) === 2,
    'el idCorto de la MISMA tarea cambio entre versiones (1 → 2), que es el peligro real',
    `${cortarV1[idxC]} → ${cortarV2[idxC]}`);

  // Y los apartados tambien van separados por proyecto.
  const est1 = api.estadoApartados(v1);
  ok(est1.success === true, 'los apartados se consultan por proyecto');
}

console.log('\n== 12b. Si falta la propiedad del script, el error ENSENA lo que hay ==');
{
  // El fallo real: el id de la hoja puesto en el NOMBRE de la propiedad. El mensaje
  // antiguo decia «falta la propiedad <el id>», que acusa al id en vez de al nombre
  // y obliga a deducir que el problema es la columna. El nuevo LISTA lo que hay.
  const fabrica = new Function(
    'PropertiesService', 'Logger',
    FUENTE + '\nreturn { idHoja_ };'
  );

  // Caso 1: no hay ninguna propiedad.
  const vacio = fabrica(
    { getScriptProperties: () => ({ getProperty: () => null, getKeys: () => [] }) },
    { log: () => {} }
  );

  let m1 = '';
  try { vacio.idHoja_(); } catch (e) { m1 = e.message; }
  ok(/ID_HOJA/.test(m1), 'nombra la propiedad que falta', m1.slice(0, 70) + '…');
  ok(/No hay ninguna propiedad/.test(m1), 'y distingue el caso de no tener ninguna');

  // Caso 2: el id mal puesto como nombre (el error que ocurrio de verdad).
  const malPuesto = fabrica(
    {
      getScriptProperties: () => ({
        getProperty: () => null,
        getKeys: () => [ '11mzQyoozZaPYZZqyAZR8OVNkloKKfgbp--PzdT8-GVw' ]
      })
    },
    { log: () => {} }
  );

  let m2 = '';
  try { malPuesto.idHoja_(); } catch (e) { m2 = e.message; }
  ok(/11mzQyoo/.test(m2), 'LISTA las propiedades que existen (el id mal puesto se ve)', 'sí aparece');
  ok(/como NOMBRE y tiene que ir como VALOR/.test(m2),
    'y dice exactamente cual es el error de columnas');
  ok(/Propiedad: ID_HOJA/.test(m2) && /Valor:/.test(m2),
    'ademas dice como tiene que quedar');
}

console.log('\n== 12. El diagnostico no filtra los tiempos ==');
{
  const { libro, api } = cargar();
  api.prepararHoja();
  api.importarProyecto({
    tipo: 'configurador-tiempos', version: 1,
    proyecto: { archivo: 'demo.bpmn' },
    tareas: [ { id: 'Task_1', idCorto: 1, nombre: 'Cortar', unidad: 'minutes' } ]
  });
  api.apartarTarea('demo', 'Task_1', 'sesion-A', 'Ana', false);
  api.guardarMuestras('demo', 'Task_1', 'sesion-A', 'Ana', [ { muestraId: 'm1', tiempo_s: 12.34 } ]);

  const p = api.ping();
  ok(p.success === true && p.data.vivo === true, 'ping responde', p.message);
  ok(p.data.latidoSegundos === api.LATIDO_SEGUNDOS, 'y publica el intervalo del latido');

  const e = api.esquema();
  ok(e.success === true, 'esquema responde');
  ok(e.data.alDia === true, 'y dice que el esquema esta al dia');
  ok(e.data.pestanas[api.PESTANAS.muestras].filas === 1, 'con el conteo de filas');

  const texto = JSON.stringify(e) + JSON.stringify(p);
  ok(!texto.includes('12.34'), 'el diagnostico NO incluye ningun tiempo real de planta');

  const u = api.ultimasMuestras('demo', 5);
  ok(u.success === true && u.data.total === 1, 'ultimasMuestras cuenta', String(u.data.total));
  ok(!JSON.stringify(u).includes('12.34'), 'y tampoco filtra el tiempo (solo estructura)');
}

console.log('\n== 13. La interfaz: pantalla de estudios, cronometro unico y celular ==');
{
  // La interfaz esta en DOS archivos: el marcado y el JavaScript, que doGet() inyecta
  // con una plantilla. Se leen juntos porque lo que se comprueba es el conjunto.
  //
  // La lectura es TOLERANTE a proposito: si el archivo no existe (renombrado, movido
  // o con la extension equivocada) un `readFileSync` a secas LANZA y el arnes muere
  // sin decir por que. Un arnes que falla mal es peor que uno que no existe, porque
  // parece que paso cuando en realidad no llego a comprobar nada.
  const carpetaApp = join(RAIZ, 'app-tiempos');

  const leerSiExiste = (nombre) => {
    try { return readFileSync(join(carpetaApp, nombre), 'utf8'); }
    catch (e) { return ''; }
  };

  // El marcado y el JavaScript viven en el MISMO archivo: partirlos con una plantilla
  // de Apps Script NO funciona (el panel de usuario se serializa escapado). Ver la
  // seccion de plantillas, mas abajo.
  const html = leerSiExiste('index.html');
  const gs = leerSiExiste('Code.gs');
  const archivosApp = readdirSync(carpetaApp);
  const js = html;
  const todo = html;

  ok(html.length > 0, 'existe la interfaz (index.html)');
  ok(gs.length > 0, 'existe el backend (Code.gs)');
  ok(/<script>[\s\S]*function arrancar[\s\S]*<\/script>/.test(html),
    'y el JavaScript vive DENTRO de index.html, en su propia etiqueta');

  // --- La entrada: SIEMPRE la lista de estudios ---
  ok(/id="vista-estudios"/.test(html), 'hay una vista de estudios (la entrada)');
  ok(/cambiarVista\('estudios'\)/.test(js) && /function cargarEstudios/.test(js),
    'y el arranque entra por ella (no carga un proyecto a ciegas)');
  ok(!/APP\.proyectoId\) cargarEstudios|if \(APP\.proyectoId\) cargarProyecto/.test(js),
    'y NO carga el ultimo proyecto directamente (era lo que mezclaba diagramas)');
  ok(/id="btn-volver"/.test(html) && /function volverAEstudios/.test(js),
    'hay boton de volver a estudios');
  ok(/id="lista-estudios"/.test(html) && /muestras: conteo\[id\]/.test(gs),
    'cada estudio muestra sus muestras (viene del backend)');

  // --- El boton unico: la accion la decide el estado ---
  ok(/id="btn-medir"/.test(html), 'existe el boton unico de medicion');
  ok(!/id="btn-vuelta"|id="btn-iniciar"|id="btn-detener"/.test(html),
    'y NO quedan los botones viejos de iniciar/detener/lap');
  ok(/Cerrar y empezar la siguiente/.test(js),
    'el boton dice que va a cerrar y arrancar la siguiente');
  ok(/function botonMedirPulsado/.test(js) && /crono\.corriendo\) cronoCerrarYseguir/.test(js),
    'un solo pulsador que cierra y reabre');

  // --- DOS relojes: intervalo (grande) y total (chico) ---
  ok(/id="crono-total"/.test(html) && /totalAcumulado/.test(js),
    'hay un segundo contador con el total de la sesion');
  ok(/Intervalo \(lo que se registra\)/.test(html),
    'el grande se declara como el INTERVALO (no como el total)');

  // --- rAF en vez de setInterval ---
  // Se comprueba la LINEA del bucle, no que la palabra aparezca en algun sitio: la
  // version floja de esta comprobacion daba OK con un setInterval reintroducido.
  ok(/APP\.crono\.raf = requestAnimationFrame\(cronoBucle\)/.test(js),
    'el BUCLE se reprograma con requestAnimationFrame');
  ok(!/APP\.crono\.raf = setInterval/.test(js),
    'y NO con setInterval (se congela con la pantalla apagada)');

  // --- Persistencia del borrador ---
  ok(/localStorage\.setItem\(claveSesion\(\)/.test(js),
    'las muestras se guardan en localStorage al registrarlas');
  ok(/function recuperarSesionLocal/.test(js) && /recuperarSesionLocal\(\)/.test(js),
    'y se recuperan al reabrir la tarea');
  ok(/borrarSesionLocal\(\)/.test(js),
    'el borrador se borra al guardar en la hoja (si no, se contarian dobles)');

  // --- Liberar al salir SIN antes de tiempo ---
  ok(/^\s*document\.addEventListener\('visibilitychange'/m.test(js),
    'se libera con visibilitychange (beforeunload NO se dispara en celular)');
  ok(/visibilityState === 'hidden'/.test(js) && /liberarAlSalir\(\)/.test(js),
    'y se libera al ocultarse de verdad');
  ok(/window\.addEventListener\('pagehide', liberarAlSalir\)/.test(js),
    'pagehide tambien lo llama (mas fiable que beforeunload)');

  // --- Deshacer y descarte del toque accidental ---
  ok(/function deshacerUltima/.test(js) && /id="btn-deshacer"/.test(html), 'hay deshacer ultima');
  ok(/Menos de medio segundo: se descarta/.test(js),
    'un toque de menos de medio segundo se descarta y SE AVISA');

  // --- Boton grande y sin doble disparo ---
  ok(/min-height:\s*72px/.test(todo), 'el boton de medir es grande (se pulsa con guantes)');
  ok(/addEventListener\('click', botonMedirPulsado\)/.test(js), 'se enlaza solo con click');
  ok(!/addEventListener\('touchstart', botonMedirPulsado\)/.test(js),
    'y NO con touchstart ademas de click: en iOS guardaria DOS mediciones por toque');

  // --- Adaptativo ---
  ok(/@media \(max-width: 640px\)/.test(todo), 'hay media query para celular');
  ok(/\.boton-medir\s*\{[\s\S]{0,200}position:\s*sticky/.test(todo),
    'el boton se queda pegado abajo en el celular');
  ok(/font-size:\s*16px\s*!important/.test(todo),
    'los campos suben a 16 px (por debajo, iOS hace zoom al enfocar)');

  // --- El tema del cotizador ---
  ok(/cdn\.tailwindcss\.com/.test(html),
    'usa Tailwind, el mismo stack que la herramienta de cotizacion');
  ok(/family=Inter/.test(html), 'con la tipografia Inter del cotizador');
  ok(/bg-gray-50 text-gray-800/.test(html), 'y el mismo fondo y color de texto');
  ok(/rounded-xl shadow-lg/.test(html), 'y las tarjetas blancas con la misma sombra');

  // --- SIN plantillas de Apps Script ---
  //
  // ESTE es el fallo que costo TRES intentos. Se probo a partir el HTML en dos
  // archivos con `createTemplateFromFile` + un punto de inyeccion, y no funciona: el
  // panel de codigo de usuario se serializa ESCAPANDO todo su contenido, asi que el
  // navegador recibe «\x3cscript\x3e var APP \x3d \x7b...» y revienta con
  // SyntaxError. El patron que si funciona -y el que ya usaba la herramienta de
  // cotizacion- es `createHtmlOutputFromFile` con todo en un archivo.
  ok(!/<\?/.test(html), 'index.html no tiene NINGUNA plantilla de Apps Script');
  // Se quitan los COMENTARIOS antes de buscar: el codigo menciona `evaluate()` al
  // explicar por que no se usa, y buscar en crudo daria un falso positivo.
  const gsSinComentarios = gs
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  ok(!/createTemplateFromFile|\.evaluate\s*\(/.test(gsSinComentarios),
    'y doGet() no evalua plantillas (serializa el panel escapado)');
  ok(/HtmlService\.createHtmlOutputFromFile\('index'\)/.test(gs),
    'sirve la interfaz con el patron simple, igual que el cotizador');

  // Y ningun archivo de interfaz suelto: todo va en index.html.
  const sobrantes = archivosApp.filter((f) => /^(app|index)\.(js|gs)$/.test(f));
  ok(sobrantes.length === 0,
    'no hay archivos de interfaz con extension de servidor',
    sobrantes.length ? 'PELIGRO: ' + sobrantes.join(', ') : 'ok');

  // --- NINGUNA etiqueta de script dentro de un comentario HTML ---
  const comentariosHtml = [ ...html.matchAll(/<!--[\s\S]*?-->/g) ].map((m) => m[0]);
  const conEtiqueta = comentariosHtml.filter((c) => /<script/i.test(c));
  ok(conEtiqueta.length === 0,
    'ningun comentario HTML contiene la etiqueta de un script',
    conEtiqueta.length
      ? 'PELIGRO: ' + conEtiqueta[0].slice(0, 70).replace(/\n/g, ' ')
      : `${comentariosHtml.length} comentarios`);

  // --- Coherencia de identificadores: el error que rompe la app en silencio ---
  const definidos = new Set([ ...html.matchAll(/\bid="([a-zA-Z][\w-]*)"/g) ].map((m) => m[1]));
  const usados = new Set([ ...js.matchAll(/\$\('([a-zA-Z][\w-]*)'\)/g) ].map((m) => m[1]));

  const huerfanos = [ ...usados ].filter((id) => !definidos.has(id));
  ok(huerfanos.length === 0,
    'todos los ids que usa el JS existen en el marcado',
    huerfanos.length ? 'HUERFANOS: ' + huerfanos.join(', ') : usados.size + ' usados');

  // --- Y que la interfaz no llame a funciones del backend que no existen ---
  const backend = new Set([ ...gs.matchAll(/^function ([A-Za-z][A-Za-z0-9_]*)\s*\(/gm) ].map((m) => m[1]));
  const llamadas = new Set([ ...js.matchAll(/\.withFailureHandler\(function[\s\S]{0,400}?\)\s*\.\s*([a-zA-Z][A-Za-z0-9_]*)\s*\(/g) ].map((m) => m[1]));

  const sinBackend = [ ...llamadas ].filter((f) => !backend.has(f));
  ok(sinBackend.length === 0,
    'y todas las llamadas al servidor existen en Code.gs',
    sinBackend.length ? 'NO EXISTEN: ' + sinBackend.join(', ') : llamadas.size + ' llamadas');
}

console.log('\n== 14. El endpoint de diagnostico (y lo que NO puede devolver) ==');
{
  const { api } = cargar();
  api.prepararHoja();

  // Se monta un estudio real con mediciones de verdad: tiempos imposibles de confundir.
  api.importarProyecto({
    tipo: 'configurador-tiempos', version: 1,
    proyecto: { archivo: 'secreto.bpmn' },
    tareas: [
      { id: 'Task_1', idCorto: 1, nombre: 'Cortar', unidad: 'minutes' },
      { id: 'Task_2', idCorto: 2, nombre: 'Soldar', unidad: 'minutes' }
    ]
  });

  const proyectoId = api.listarProyectos().data[0].proyectoId;

  api.apartarTarea(proyectoId, 'Task_1', 'sA', 'Ana', false);
  api.guardarMuestras(proyectoId, 'Task_1', 'sA', 'Ana', [
    { muestraId: 'a1', tiempo_s: 11.111 },
    { muestraId: 'a2', tiempo_s: 22.222 },
    { muestraId: 'a3', tiempo_s: 33.333 }
  ]);
  api.apartarTarea(proyectoId, 'Task_2', 'sB', 'Luis', false);
  api.guardarMuestras(proyectoId, 'Task_2', 'sB', 'Luis', [ { muestraId: 'b1', tiempo_s: 44.444 } ]);

  // Las acciones existen y responden.
  [ 'ping', 'esquema', 'estudios', 'muestras' ].forEach(function(a) {
    const r = api.diagnostico_(a);
    ok(r && r.success === true, `la accion «${a}» responde`, r ? r.message : 'sin respuesta');
  });

  // Una accion desconocida NO revienta: dice cuales hay.
  const mala = api.diagnostico_('inventada');
  ok(mala.success === false, 'una accion desconocida se rechaza');
  ok(Array.isArray(mala.acciones) && mala.acciones.length >= 4,
    'y LISTA las acciones validas', JSON.stringify(mala.acciones));

  // --- LO QUE SI DEVUELVE ---
  const m = api.diagnostico_('muestras');
  ok(m.data.totalMuestras === 4, 'el conteo total de muestras es correcto', String(m.data.totalMuestras));
  ok(m.data.porTarea[proyectoId + '/Task_1'] === 3,
    'con el desglose por tarea', String(m.data.porTarea[proyectoId + '/Task_1']));
  ok(m.data.porOperario[proyectoId + '/Ana'] === 3 && m.data.porOperario[proyectoId + '/Luis'] === 1,
    'y por operario (que es lo que permite ver quien midio)');
  ok(Boolean(m.data.apartados[proyectoId + '/Task_2']),
    'y el estado de los apartados (quien esta midiendo)');

  // --- LO QUE NO PUEDE DEVOLVER NUNCA ---
  //
  // ESTA es la comprobacion que importa. La app esta desplegada con acceso de
  // «cualquier persona»: si el diagnostico devolviera los tiempos, cualquiera con la
  // URL leeria el estudio entero. Los valores de arriba son imposibles de confundir
  // con un conteo, asi que aparecer cualquiera de ellos es un fallo grave.
  const tiemposSembrados = [ '11.111', '22.222', '33.333', '44.444' ];

  [ 'ping', 'esquema', 'estudios', 'muestras' ].forEach(function(a) {
    const texto = JSON.stringify(api.diagnostico_(a));
    const filtrado = tiemposSembrados.filter(function(t) { return texto.indexOf(t) !== -1; });

    ok(filtrado.length === 0,
      `«${a}» NO filtra ningun tiempo medido`,
      filtrado.length ? 'FUGA: ' + filtrado.join(', ') : 'sin tiempos');

    // Y tampoco VALORES en los campos del proceso. Ojo: `esquema` SI nombra la
    // columna `tiempo_s`, y eso es correcto -es el nombre de una columna, no un dato-.
    // Lo que no puede haber es un campo con un VALOR numerico de tiempo.
    const conValor = /"(media_s|desv_s|margen_s|min_s|max_s)":\s*[\d.]/.test(texto);
    ok(!conValor, `«${a}» no expone valores de tiempo`, conValor ? 'FUGA' : 'ok');
  });

  // --- El doGet enruta bien ---
  const gs = readFileSync(join(RAIZ, 'app-tiempos', 'Code.gs'), 'utf8');
  ok(/function doGet\(e\)/.test(gs), 'doGet recibe el evento (para leer ?accion=)');
  ok(/e\.parameter\.accion/.test(gs), 'y lee el parametro accion');
  ok(/ContentService[\s\S]{0,300}MimeType\.JSON/.test(gs), 'y responde JSON cuando hay accion');
  ok(/HtmlService\.createHtmlOutputFromFile\('index'\)/.test(gs),
    'y sigue sirviendo la interfaz cuando no la hay');
}

console.log('\n== 15. Los encabezados que faltan se reparan solos ==');
{
  const { libro, api } = cargar();

  // Se simula el caso real: la pestana `bd` creada SIN encabezados por una version
  // anterior del codigo. `pestana_()` solo los escribe al crear, asi que se quedaba
  // asi para siempre y las muestras se guardaban en una hoja ilegible.
  api.prepararHoja();

  const bd = libro.getSheetByName(api.PESTANAS.muestras);
  bd.datos = [];

  ok(bd.getLastRow() === 0, 'la pestana bd quedo vacia (sin encabezados)');

  // El arranque de la app tiene que repararlo.
  const r = api.prepararHoja();
  ok(r.success === true, 'prepararHoja vuelve a correr', r.message);
  ok(r.data.encabezados && r.data.encabezados[api.PESTANAS.muestras] === 'encabezados escritos',
    'y REPARA los encabezados que faltaban', JSON.stringify(r.data.encabezados));

  const cabecera = bd.getRange(1, 1, 1, api.COLUMNAS.muestras.length).getValues()[0];
  ok(cabecera.join(',') === api.COLUMNAS.muestras.join(','),
    'con las columnas correctas', cabecera.slice(0, 4).join(',') + '…');

  // Y es IDEMPOTENTE: correrlo otra vez no cambia nada.
  const r2 = api.prepararHoja();
  ok(r2.data.encabezados[api.PESTANAS.muestras] === 'ya estaba bien',
    'volver a correrlo no hace nada (idempotente)', r2.data.encabezados[api.PESTANAS.muestras]);

  // Y despues de reparar, las muestras se guardan y se LEEN.
  api.importarProyecto({
    tipo: 'configurador-tiempos', version: 1,
    proyecto: { archivo: 'demo.bpmn' },
    tareas: [ { id: 'Task_1', idCorto: 1, nombre: 'Cortar', unidad: 'minutes' } ]
  });
  const proyectoId = api.listarProyectos().data[0].proyectoId;

  api.apartarTarea(proyectoId, 'Task_1', 'sA', 'Ana', false);
  const g = api.guardarMuestras(proyectoId, 'Task_1', 'sA', 'Ana', [ { muestraId: 'm1', tiempo_s: 10 } ]);

  ok(g.success === true, 'y ahora SI se puede guardar', g.message);
  ok(g.data.metrica.n === 1, 'y la muestra se LEE (n=1)', String(g.data.metrica.n));
}

console.log('\n== 16. NO se repara encima de datos (no se pierde nada) ==');
{
  const { libro, api } = cargar();
  api.prepararHoja();

  // Caso peligroso: la pestana tiene datos pero SIN encabezado. Escribir el encabezado
  // encima convertiria la primera fila de datos en cabecera y se perderia.
  const bd = libro.getSheetByName(api.PESTANAS.muestras);
  bd.datos = [ [ 'dato1', 'dato2' ], [ 'dato3', 'dato4' ] ];

  const r = api.prepararHoja();
  ok(/revisar a mano/.test(r.data.encabezados[api.PESTANAS.muestras]),
    'con datos dentro NO se toca y se avisa', r.data.encabezados[api.PESTANAS.muestras]);

  ok(bd.getRange(1, 1, 1, 2).getValues()[0].join(',') === 'dato1,dato2',
    'y los datos siguen intactos');
  ok(bd.getLastRow() === 2, 'sin perder ninguna fila', String(bd.getLastRow()));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
