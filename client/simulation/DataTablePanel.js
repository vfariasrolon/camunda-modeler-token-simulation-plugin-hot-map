import { domify, event as domEvent, classes as domClasses } from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, setSimulationData, isLabel } from './util';
import { WARMUP_SHAPES, WARMUP_DEFAULTS, curvePoints, describeWarmup } from './WarmupCurve';
import { TURNOS, LABOR_DEFAULTS } from './LaborRules';
import { miembrosDePiscina, habilidadesDisponibles, avisosDeDesignacion } from './MemberAssignment.js';
import { filasDePestana, importar as importarCsv, toCsv, download, NOMBRE_DE_PESTANA } from './CsvTareas.js';
import {
  numero, datosDeFilaDeTarea, datosDeRecursos, datosDeFlujos, datosGlobales, setByPath, getByPath
} from './validacion.js';
import { generarDatosDePrueba } from './DatosDePrueba.js';
import {
  AYUDA_COLUMNAS, enlazarAyudaDeColumnas, alternarAyudaDeColumna, marcarAyudaDeColumna,
  enlazarAyudaPorCampo, htmlDeAyuda
} from './Ayuda.js';
import './data-table.css';

const PANEL_CLS = 'sim-data-table-panel';
const OPEN_CLS = 'open';
const TAB_ACTIVE_CLS = 'active';

const BARRIER_DEFAULTS = () => ({
  availableProbability: 0.7,
  waitMin: 10,
  waitMode: 20,
  waitMax: 60,
  toleranceMinutes: 15
});

const TASK_DEFAULTS = () => ({
  processingTime: { distribution: 'fixed', value: 10, unit: 'minutes' },
  failureRate: 0,
  reworkTime: { distribution: 'fixed', value: 20, unit: 'minutes' },
  frequency: 'token',
  barrier: BARRIER_DEFAULTS(),
  // Carga fisica y habilidad: vacias por defecto. Se dejan SIN declarar para que
  // el motor las ignore (una masa de 0 kg declarada es distinta de no declararla:
  // la primera dice «no mueve peso», la segunda «no lo sabemos»).
  carga: { masaCargadaKg: null, masaArrastradaKg: null, distanciaM: null },
  habilidad: ''
});

const FLOW_DEFAULTS = () => ({ branchingProbability: 0.5 });

// ---------------------------------------------------------------------------
// Campos de la configuracion global (StartEvent raiz). Se describen por ruta
// para poder leerlos y escribirlos de forma generica.
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

/**
 * Ayuda de cada COLUMNA de la tabla de Tareas.
 *
 * Va en la CABECERA y no en cada celda: son 23 columnas por tarea, o sea cientos de
 * botones repitiendo el mismo texto. En una tabla ancha el «?» pertenece a la columna,
 * no al dato de una fila.
 *
 * Los textos dicen QUE VALOR ESPERA la columna, que es justo lo que no se deduce del
 * encabezado: que la unidad va en plural, que «moda» es el mas probable y no la media,
 * o que la carga se aplica segun la frecuencia.
 */

/**
 * Los campos de la configuracion global, agrupados por FAMILIA.
 *
 * POR QUE POR FAMILIAS: antes eran 30 campos en UNA tabla plana, y cada familia
 * quedaba PARTIDA en dos sitios: los valores de la jornada arriba y sus descansos
 * veinte filas mas abajo; los del arranque en la tabla y su curva al final. Poner la
 * jornada con sus pausas, o el lote con su tabla de tamaños, no es estetica: es no
 * tener que buscar.
 *
 * `lista` es la tabla propia de la familia (descansos, curva, tamaño empirico,
 * vigencias) y viaja DENTRO de su seccion.
 *
 * EL ORDEN IMPORTA EN UN SITIO: las vigencias laborales dicen «lo que digan los
 * valores de arriba», asi que los campos que esas vigencias sobrescriben tienen que
 * estar de verdad ENCIMA de su tabla. Por eso `overtime` y `labor` van en la MISMA
 * seccion: la tabla de vigencias pisa a los dos (prima doble y triple son de
 * `overtime`; dominical, festivo, tope al dia y dias por semana, de `labor`).
 */
const TASK_UNITS = ['minutes', 'hours', 'seconds'];
const RATE_UNITS = ['minute', 'hour', 'second'];
const LOT_SIZE_MODES = ['fixed', 'triangular', 'empirical'];
const TASK_FREQUENCIES = ['token', 'lot'];

// Nombres de los dias para las casillas de «dias laborables». El indice es el valor que espera el
// motor: 0 = domingo.
const DIAS = [ 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb' ];

const GLOBAL_SECCIONES = [
  {
    clave: 'simulacion',
    titulo: 'Simulación',
    campos: [
      { key: 'startDate', label: 'Fecha de inicio de la simulación', kind: 'text', path: [ 'startDate' ], ayuda: 'Formato AAAA-MM-DD. Es la fecha desde la que corre el reloj: de ella dependen los festivos, las vigencias laborales y en qué día de la semana cae cada jornada.' },
      { key: 'simulationConfig.runValue', label: 'Instancias a simular', kind: 'number', path: [ 'simulationConfig', 'runValue' ], min: 1, ayuda: 'Un número entero: cuántos casos se simulan. Más instancias dan resultados más estables y tardan más.' },
      { key: 'arrivalRate.value', label: 'Tasa de llegada: cuántas llegadas por unidad', kind: 'number', path: [ 'arrivalRate', 'value' ], min: 0, ayuda: 'Cuántas llegadas POR unidad de tiempo. Es una TASA, no un intervalo: con unidad hour, 1 es «una llegada cada hora»; con minute, 60 es «una por SEGUNDO», y las 1000 instancias entran en la primera jornada.' },
      { key: 'arrivalRate.unit', label: 'Tasa de llegada: unidad de tiempo', kind: 'select', options: RATE_UNITS, path: [ 'arrivalRate', 'unit' ], ayuda: 'La unidad de la tasa: minute, hour o second. Va en SINGULAR, al revés que las unidades de tiempo de las tareas, que van en plural (minutes).' },
      { key: 'seed', label: 'Semilla (vacío = al azar, se guarda la usada)', kind: 'number', path: [ 'seed' ], min: 1, optional: true, ayuda: 'Déjala vacía para que se sortee una (y quede guardada en la corrida). Pon un número entero para repetir exactamente el mismo resultado.' }
    ],
    nota: `
      <strong>La tasa de llegada es una tasa, no un intervalo.</strong>
      Con valor <code>60</code> y unidad <code>minute</code> no significa «una cada 60 minutos»:
      significa <strong>60 llegadas por minuto, o sea una cada segundo</strong>, y las 1000 instancias
      entrarían en la primera jornada. Para una llegada cada 60 minutos pon <code>1</code> con unidad
      <code>hour</code>. El informe de la consola imprime la tasa ya resuelta («una cada 1.0 s»).
      <br><br>
      La <strong>semilla</strong> es lo que hace repetible una corrida: vacía se sortea una y se guarda
      la que se usó; con un número, la misma corrida da el mismo resultado.
    `
  },

  {
    clave: 'jornada',
    titulo: 'Jornada y descansos',
    campos: [
      { key: 'calendar.workingDays', label: 'Días laborables (0=Dom … 6=Sáb)', kind: 'days', path: [ 'calendar', 'workingDays' ], ayuda: 'Marca los días en que la planta abre. Un festivo que caiga en un día NO laborable no cierra nada: ya estaba cerrado, así que no cuenta como festivo trabajado.' },
      { key: 'calendar.workingHours.start', label: 'Hora de entrada', kind: 'time', path: [ 'calendar', 'workingHours', 'start' ], ayuda: 'Hora del reloj (HH:MM) a la que empieza la jornada. Tiene que ser anterior a la hora de salida.' },
      { key: 'calendar.workingHours.end', label: 'Hora de salida', kind: 'time', path: [ 'calendar', 'workingHours', 'end' ], ayuda: 'Hora del reloj (HH:MM) a la que termina la jornada. Lo que se trabaje después de esta hora se cuenta como tiempo extra.' }
    ],
    lista: 'descansos',
    nota: `
      Marca los días laborables y ajusta las horas. La hora de entrada debe ser anterior a la de salida.
    `
  },

  {
    clave: 'arranque',
    titulo: 'Arranque de la jornada',
    // Se DECLARA, no se mide. La vista previa existe porque un parametro abstracto no
    // se puede discutir y una curva si: se mueve el valor, se ve la forma, y se decide
    // si se parece a la planta.
    campos: [
      { key: 'warmup.shape', label: 'Arranque: forma', kind: 'select', options: WARMUP_SHAPES, path: [ 'warmup', 'shape' ], ayuda: 'Forma de la recuperación del ritmo: exponential, logarithmic o linear. Dice CÓMO se vuelve al 100 %, no cuánto se tarda.' },
      { key: 'warmup.initialEfficiency', label: 'Arranque: eficiencia inicial (0,05-1)', kind: 'number', path: [ 'warmup', 'initialEfficiency' ], min: 0.05, max: 1, ayuda: 'Entre 0,05 y 1. Eficiencia del primer minuto: 0,6 significa que arranca al 60 % del ritmo normal.' },
      { key: 'warmup.recoveryMinutes', label: 'Arranque: minutos de recuperación', kind: 'number', path: [ 'warmup', 'recoveryMinutes' ], min: 1, ayuda: 'Minutos que tarda en llegarse al 100 %. Con 45, a los 45 minutos la planta ya rinde como en régimen.' },
      { key: 'warmup.onShiftStart', label: 'Arranque al inicio de la jornada', kind: 'checkbox', path: [ 'warmup', 'onShiftStart' ], ayuda: 'Marcado: el arranque lento también ocurre al empezar la jornada de cada día.' },
      { key: 'warmup.onBreakReturn', label: 'Arranque al volver del descanso', kind: 'checkbox', path: [ 'warmup', 'onBreakReturn' ], ayuda: 'Marcado: el arranque lento también ocurre al volver de cada descanso.' }
    ],
    lista: 'curva',
    nota: `
      El arranque lento <strong>no se mide, se declara</strong>, y con una curva es más realista que
      con un porcentaje fijo: el porcentaje plano repartiría la pérdida por <em>toda</em> la jornada,
      incluida la tarde, donde no ocurre. Ajusta los valores y mira la forma: si no se parece a tu
      planta, la curva está mal puesta.
    `
  },

  {
    clave: 'lotes',
    titulo: 'Lotes',
    // En modo lote las instancias llegan en GRUPOS y los grupos van en serie (uno
    // detras de otro): no hay dos lotes a la vez.
    campos: [
      { key: 'lots.enabled', label: 'Llegadas por LOTES (en serie)', kind: 'checkbox', path: [ 'lots', 'enabled' ], ayuda: 'Con esto activo, las instancias llegan en grupos y los grupos van EN SERIE (uno detrás de otro), no solapados: no hay dos lotes a la vez.' },
      { key: 'lots.sizeMode', label: 'Tamaño de lote: modo', kind: 'select', options: LOT_SIZE_MODES, path: [ 'lots', 'sizeMode' ], ayuda: 'fixed (siempre el mismo tamaño), triangular (mín/moda/máx) o empirical (tu propia tabla de frecuencias, más abajo).' },
      { key: 'lots.size', label: 'Tamaño de lote: fijo', kind: 'number', path: [ 'lots', 'size' ], min: 1, ayuda: 'Tamaño de cada lote. Solo se lee con el modo fixed.' },
      { key: 'lots.min', label: 'Tamaño de lote: mínimo (triangular)', kind: 'number', path: [ 'lots', 'min' ], min: 1, ayuda: 'Solo con el modo triangular. Tiene que cumplirse mínimo ≤ moda ≤ máximo, o el guardado lo rechaza.' },
      { key: 'lots.mode', label: 'Tamaño de lote: moda (triangular)', kind: 'number', path: [ 'lots', 'mode' ], min: 1, ayuda: 'Solo con el modo triangular. Es el tamaño más probable, no la media.' },
      { key: 'lots.max', label: 'Tamaño de lote: máximo (triangular)', kind: 'number', path: [ 'lots', 'max' ], min: 1, ayuda: 'Solo con el modo triangular. El tamaño mayor que se ha visto.' },
      { key: 'lots.stopMinutes', label: 'Parón de cambio entre lotes (min)', kind: 'number', path: [ 'lots', 'stopMinutes' ], min: 0, ayuda: 'Parón de cambio: minutos que se pierden al cerrar un lote y preparar el siguiente.' }
    ],
    lista: 'loteEmpirico'
  },

  {
    clave: 'laboral',
    titulo: 'Tiempo extra y reglas laborales (LFT)',
    // Los tres primeros son los arts. 66 y 68 y ya existian como `overtime`; se quedan
    // para no migrar nada, pero van en la MISMA seccion que `labor` porque la tabla de
    // vigencias los pisa a los dos.
    campos: [
      { key: 'overtime.limitHours', label: 'Límite de horas antes de recargo', kind: 'number', path: [ 'overtime', 'limitHours' ], min: 0, ayuda: 'Horas de jornada antes de que empiece el recargo. Con una jornada de 09:00 a 17:00, aquí va 8.' },
      { key: 'overtime.payMultiplier', label: 'Multiplicador de hora extra (x)', kind: 'number', path: [ 'overtime', 'payMultiplier' ], min: 1, ayuda: 'Cuánto se paga la hora extra, en veces. 2 = al doble. Es la columna «prima doble» de la tabla de vigencias.' },
      { key: 'overtime.excessPayMultiplier', label: 'Multiplicador de exceso (x)', kind: 'number', path: [ 'overtime', 'excessPayMultiplier' ], min: 1, ayuda: 'Cuánto se paga lo que pasa del tope legal, en veces. 3 = al triple. Es la columna «prima triple».' },
      { key: 'labor.shiftType', label: 'Tipo de jornada (LFT art. 61)', kind: 'select', options: TURNOS, path: [ 'labor', 'shiftType' ], ayuda: 'Turno declarado (LFT art. 61): diurna, mixta o nocturna. De aquí sale la jornada base ANTES de contar tiempo extra.' },
      { key: 'labor.dailyOvertimeLimitHours', label: 'Tope de horas extra al día (art. 65)', kind: 'number', path: [ 'labor', 'dailyOvertimeLimitHours' ], min: 0, ayuda: 'Tope de horas extra AL DÍA (LFT art. 65). No cambia lo que se paga: marca a partir de cuándo el plan es ilegal.' },
      { key: 'labor.maxOvertimeDaysPerWeek', label: 'Máximo de días con extra por semana (art. 65)', kind: 'number', path: [ 'labor', 'maxOvertimeDaysPerWeek' ], min: 0, ayuda: 'Cuántos días por semana pueden llevar tiempo extra (art. 65). Igual que el anterior: es de legalidad, no de pago.' },
      { key: 'labor.sundayPremiumPercent', label: 'Prima dominical en % (art. 73)', kind: 'number', path: [ 'labor', 'sundayPremiumPercent' ], min: 0, ayuda: 'Porcentaje extra sobre el salario del domingo (art. 73). Pon 0 si en tu planta esa prima no se paga.' },
      { key: 'labor.holidayPremiumPercent', label: 'Prima de día festivo en % (art. 74, 0 = no se paga)', kind: 'number', path: [ 'labor', 'holidayPremiumPercent' ], min: 0, ayuda: 'Porcentaje extra por trabajar un día festivo (art. 74). 0 = no se paga, y el informe lo deja dicho.' }
    ],
    lista: 'vigencias',
    nota: `
      Alcance: esto es una <strong>tabla de tasas y umbrales para costear el proceso</strong>, no una
      nómina. No se calculan IMSS, ISR, aguinaldo, prima vacacional ni finiquitos.
    `
  },

  {
    clave: 'costo',
    titulo: 'Costo',
    campos: [
      { key: 'cost.baseRatePerHour', label: 'Tarifa base por hora', kind: 'number', path: [ 'cost', 'baseRatePerHour' ], min: 0, ayuda: 'Lo que cuesta una hora de trabajo en régimen normal. Es la base de todo el coste del proceso.' },
      { key: 'cost.waitCostPerHour', label: 'Costo de espera por hora', kind: 'number', path: [ 'cost', 'waitCostPerHour' ], min: 0, ayuda: 'Lo que cuesta una hora de una unidad parada esperando. Pon 0 si la espera no se costea.' }
    ]
  }
];

/**
 * Todos los campos globales, APLANADOS.
 *
 * Se DERIVA de las secciones en vez de escribirse aparte, para que no puedan divergir.
 * Lo que recorre los campos sin importarle las familias -guardar, exportar el CSV,
 * importarlo- sigue usando esta lista y no necesita saber que hay secciones.
 */
const GLOBAL_FIELDS = GLOBAL_SECCIONES.reduce((todos, s) => todos.concat(s.campos), []);

/**
 * Los campos de una vigencia de reglas laborales, con su etiqueta.
 *
 * VIVE AQUI Y NO DENTRO DEL CSV, y ese es el arreglo: la lista estaba escrita DOS veces -una en la
 * exportacion y otra en la importacion- con los mismos ocho nombres. Dos listas que tienen que
 * coincidir acaban divergiendo, y entonces un CSV exportado deja de importarse y el sintoma es
 * «faltan datos», no «las listas no coinciden».
 *
 * El orden importa: es el orden de las filas del CSV.
 */
const CAMPOS_DE_REGLA = [
  { key: 'limitHours', label: 'cupo semanal (h)' },
  { key: 'payMultiplier', label: 'prima doble (x)' },
  { key: 'excessPayMultiplier', label: 'prima triple (x)' },
  { key: 'dailyOvertimeLimitHours', label: 'tope al día (h)' },
  { key: 'maxOvertimeDaysPerWeek', label: 'días por semana' },
  { key: 'sundayPremiumPercent', label: 'dominical (%)' },
  { key: 'holidayPremiumPercent', label: 'festivo (%)' }
];

const DEFAULT_GLOBAL = () => ({
  startDate: '',
  // CORREGIDO: antes era `{ value: 60, unit: 'minute' }`, que NO significa «una
  // llegada cada 60 minutos» sino 60 llegadas por minuto, o sea una por SEGUNDO:
  // las 1000 instancias entraban en la primera jornada y el cupo semanal de
  // horas extra se agotaba de una vez. Es una tasa, y el valor por defecto debe
  // ser una tasa razonable: una llegada por minuto.
  arrivalRate: { value: 1, unit: 'minute' },
  simulationConfig: { runValue: 1000 },
  isRoot: true,
  calendar: {
    workingDays: [ 1, 2, 3, 4, 5 ],
    workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } },
    // Sin descansos por defecto: son propios de cada sitio, y ponerlos en
    // silencio cambiaria los resultados sin que nadie lo haya pedido.
    breaks: []
  },
  // La curva de arranque SI trae valores por defecto: se declara, no se mide, y
  // un valor de partida razonable es mejor que ninguno. Todo ajustable.
  warmup: { ...WARMUP_DEFAULTS },
  // Los lotes vienen DESACTIVADOS: activarlos cambia el modelo de llegadas por
  // completo, y eso no debe pasar sin que nadie lo pida.
  lots: {
    enabled: false,
    sizeMode: 'fixed',
    size: 20,
    min: 10,
    mode: 20,
    max: 30,
    stopMinutes: 0,
    table: []
  },
  seed: '',
  cost: { baseRatePerHour: 50, waitCostPerHour: 0 },
  overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
  // Reglas laborales (LFT). Los valores por defecto YA SON la ley que hay en los
  // `overtime` de arriba, así que un diagrama existente se comporta igual hasta
  // que alguien los cambie. `rules` empieza vacía: sin vigencias declaradas
  // mandan estos valores y el informe lo dice tal cual.
  labor: { ...LABOR_DEFAULTS(), rules: [] }
});

// `getByPath`/`setByPath` viven en `validacion.js`: se importan en vez de copiarlos aqui, para que
// «path es una lista de claves» sea una sola afirmacion en todo el plugin y no dos que puedan
// divergir.

// Los nombres de elementos vienen del archivo .bpmn del usuario y pueden
// contener comillas o angulos. Sin escapar, romperian el markup de la tabla.
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// ---------------------------------------------------------------------------
// Reparto de compuertas.
//
// El motor guarda `branchingProbability` como FRACCION (0-1), pero nadie piensa
// en fracciones: se piensa en porcentajes. La interfaz muestra y edita en %, y
// convierte al guardar.
//
// Se redondea a 2 decimales de porcentaje (0,01 %) y la ULTIMA salida de cada
// compuerta se calcula por RESTA, no por redondeo. Sin eso la suma se queda en
// 99,99 % y el motor, que acumula probabilidades, mandaria ese resto a la ultima
// rama: un reparto "casi" correcto que descuadra en silencio.
// ---------------------------------------------------------------------------
const redondear2 = (n) => Math.round(n * 100) / 100;

/**
 * Holgura admitida al comprobar que el reparto suma 100 %.
 *
 * 0,5 puntos porcentuales. El reparto automatico cuadra al centesimo, pero un
 * BPMN editado a mano o un CSV pueden traer polvo de redondeo (33,33 x 3 =
 * 99,99). Se usa la MISMA tolerancia en el indicador y en la validacion para que
 * el color no contradiga a lo que se puede guardar.
 */
const TOLERANCIA_REPARTO_PCT = 0.5;

/**
 * Dos salidas se consideran «iguales» si difieren menos que esto (puntos
 * porcentuales).
 *
 * Existe por estetica y por coherencia: un reparto equitativo previo queda
 * guardado como 33,33 / 33,34 por el redondeo. Al reajustar, un reparto
 * ESTRICTAMENTE proporcional de esos dos valores da 39,99 / 40,01, que parece un
 * error aunque sume 100. Con esta holgura se reparten a partes iguales y sale
 * 40 / 40. Es lo bastante estrecha para no igualar un reparto de verdad distinto.
 */
const IGUALDAD_REPARTO_PCT = 0.05;

/** Fraccion 0-1 -> texto de porcentaje ("0.2" -> "20", "0.3333" -> "33.33"). */
const pctATexto = (p) => String(redondear2((Number(p) || 0) * 100));

/**
 * Identificador listo para un selector de atributo.
 *
 * Los ids de BPMN suelen ser seguros, pero un diagrama importado puede traer
 * cualquiera. Sin escapar, un id con comilla romperia la consulta.
 */
const selectorSeguro = (id) => (typeof CSS !== 'undefined' && CSS.escape
  ? CSS.escape(String(id))
  : String(id).replace(/["\\]/g, '\\$&'));

// ---------------------------------------------------------------------------
// El parseo y la serializacion del CSV viven en `CsvTareas.js`. No se dejan aqui «por comodidad»:
// una copia local vuelve a divergir del modulo probado en cuanto se toque el separador o el BOM.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Nota: los elementos del registro incluyen las ETIQUETAS (los textos). Se
// descartan con isLabel() de util.js antes de comprobar el tipo; si no, la tabla
// mostraria una fila por figura MAS una por su texto.
// ---------------------------------------------------------------------------

const TableIcon = '<path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 4H4V5h16v2zm-10 4h3v3h-3v-3zm0 5h3v3h-3v-3zm-5-5h3v3H5v-3zm0 5h3v3H5v-3zm11-5h3v3h-3v-3zm0 5h3v3h-3v-3z"/>';
// Estrella de cuatro puntas: "generar datos de prueba".
const TestDataIcon = '<path d="M12 2l1.8 5.6L19 9l-5.2 1.4L12 16l-1.8-5.6L5 9l5.2-1.4L12 2z"/>';
const ExportIcon = '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>';
const ImportIcon = '<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>';
const CloseIcon = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';

// El mismo icono de ayuda que usa el panel de graficos, para que «ayuda» se
// reconozca igual en los dos sitios.
const HelpIcon = '<path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>';
// Lapiz del acceso directo sobre la figura seleccionada.
const EditIcon = '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>';

const svg = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;

export default class DataTablePanel {

  constructor(canvas, eventBus, elementRegistry, modeling, bpmnFactory, notifications, editorActions, overlays, selection) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._modeling = modeling;
    this._bpmnFactory = bpmnFactory;
    this._notifications = notifications;
    // Sirve para disparar 'toggleTokenSimulation' (esta en la lista blanca de
    // DisableModeling, asi que funciona con el modo activo) y resolver el
    // bloqueo de solo lectura sin mandar al usuario al menu.
    this._editorActions = editorActions;
    // El acceso directo por elemento (el lapiz) vive aqui y no en un modulo
    // aparte: abre ESTA tabla, asi que mantenerlo separado solo servia para
    // duplicar la logica de guardado (y para perderla: el modal antiguo forzaba
    // `distribution: "fixed"` y destruia un triangular configurado).
    this._overlays = overlays;
    this._selection = selection;

    this._panel = null;
    this._activeTab = 'tasks';
    this._focusId = null;
    this._btnDesactivar = null;
    this._overlayId = null;

    this._eventBus.on('canvas.init', () => this._init());
    this._eventBus.on('diagram.destroy', () => this.destroy());

    // El otro extremo del atajo del diagnostico: alli se pulsa «falta X» y aqui se
    // abre la tabla en el campo. Por EVENTO y no inyectando el panel de diagnostico:
    // se registra despues que este, asi que la dependencia seria circular.
    this._eventBus.on('simulation.dataTable.ir', (e) => this._irADestino(e.destino));

    // Lapiz sobre la figura seleccionada, para llegar a su fila de un clic.
    this._eventBus.on('selection.changed', ({ newSelection }) => {
      this._quitarLapiz();
      if (newSelection.length === 1 && this._esEditable(newSelection[0])) {
        this._ponerLapiz(newSelection[0]);
      }
    });
  }

  /**
   * Indica si la tabla tiene algo que editar para ese elemento.
   *
   * Evita poner el lapiz sobre figuras que no aparecen en ninguna pestaña: al
   * pulsarlo no habria a donde llevar al usuario.
   */
  _esEditable(element) {
    if (!element || isLabel(element)) return false;
    if (is(element, 'bpmn:Task')) return true;
    if (is(element, 'bpmn:StartEvent')) return true;
    if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant')) return true;
    return is(element, 'bpmn:SequenceFlow')
      && Boolean(element.source && is(element.source, 'bpmn:ExclusiveGateway'));
  }

  _ponerLapiz(element) {
    const nodo = domify(
      `<div class="sim-data-table-overlay" title="Editar los datos de simulación de este elemento"`
      + ` data-tip="Editar en la tabla de datos">${svg(EditIcon)}</div>`
    );
    domEvent.bind(nodo, 'click', () => this.openFor(element));
    this._overlayId = this._overlays.add(element, 'sim-data-table', {
      position: { top: -12, left: -12 },
      html: nodo
    });
  }

  _quitarLapiz() {
    if (this._overlayId) {
      this._overlays.remove(this._overlayId);
      this._overlayId = null;
    }
  }

  // -- infraestructura ------------------------------------------------------

  _init() {
    if (this._panel) return;

    const panel = this._panel = domify(`
      <div class="${PANEL_CLS}">
        <div class="panel-header">
          <span class="panel-title">${svg(TableIcon)} Datos de simulación por tabla</span>
          <div class="panel-actions">
            <button class="btn-ayuda" title="Ayuda de esta pestaña" data-tip="Qué datos hay aquí y qué se puede medir con ellos">${svg(HelpIcon)}</button>
            <button class="btn-test" title="Datos de prueba" data-tip="Rellena la pestaña con datos de prueba, para revisarlos antes de guardar">${svg(TestDataIcon)}</button>
            <button class="btn-export" title="Exportar CSV" data-tip="Exportar la pestaña actual a CSV (para Excel)">${svg(ExportIcon)}</button>
            <button class="btn-import" title="Importar CSV" data-tip="Importar un CSV exportado, editado en Excel">${svg(ImportIcon)}</button>
            <button class="btn-close" title="Cerrar" data-tip="Cerrar la tabla" data-tip-pos="left">${svg(CloseIcon)}</button>
          </div>
        </div>
        <div class="panel-tabs">
          <button data-tab="tasks" class="${TAB_ACTIVE_CLS}">Tareas</button>
          <button data-tab="flows">Flujos</button>
          <button data-tab="resources">Recursos</button>
          <button data-tab="global">Global</button>
        </div>
        <div class="panel-ayuda hidden"></div>
        <div class="panel-body"></div>
        <div class="panel-footer">
          <span class="status"></span>
          <button class="btn-save">Guardar todo</button>
        </div>
        <input type="file" class="csv-input" accept=".csv,text/csv" hidden>
      </div>
    `);

    this._canvas.getContainer().appendChild(panel);

    this._body = panel.querySelector('.panel-body');
    this._ayuda = panel.querySelector('.panel-ayuda');
    this._status = panel.querySelector('.status');
    this._fileInput = panel.querySelector('.csv-input');

    domEvent.bind(panel.querySelector('.btn-ayuda'), 'click', () => this._toggleAyuda());
    domEvent.bind(panel.querySelector('.btn-close'), 'click', () => this.close());
    domEvent.bind(panel.querySelector('.btn-save'), 'click', () => this.save());
    domEvent.bind(panel.querySelector('.btn-test'), 'click', () => this.generarDatosDePrueba());
    domEvent.bind(panel.querySelector('.btn-export'), 'click', () => this.exportCsv());
    domEvent.bind(panel.querySelector('.btn-import'), 'click', () => this._fileInput.click());
    domEvent.bind(this._fileInput, 'change', (e) => this.importCsv(e));

    panel.querySelectorAll('.panel-tabs button').forEach((btn) => {
      domEvent.bind(btn, 'click', () => {
        this._activeTab = btn.dataset.tab;
        panel.querySelectorAll('.panel-tabs button').forEach((b) => domClasses(b).toggle(TAB_ACTIVE_CLS, b === btn));
        // Si la ayuda esta abierta, se RECARGA con la pestana nueva: si no, al
        // cambiar de pestana seguiria explicando la anterior, que es peor que no
        // tener ayuda porque el usuario lee la respuesta equivocada.
        if (this._ayuda && !domClasses(this._ayuda).has('hidden')) {
          domClasses(this._ayuda).add('hidden');
          this._toggleAyuda();
        }
        this._render();
      });
    });
  }

  isOpen() { return this._panel && domClasses(this._panel).has(OPEN_CLS); }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() {
    if (!this._panel) this._init();
    domClasses(this._panel).add(OPEN_CLS);
    this._render();
  }

  /**
   * Abre la tabla centrada en un elemento concreto.
   *
   * Sustituye al modal del lapiz: en vez de mantener un formulario aparte que
   * solo editaba un elemento a la vez (y que forzaba `distribution: "fixed"` al
   * guardar, destruyendo un triangular configurado), lleva al panel de tabla
   * —la unica fuente de verdad— a la pestaña que corresponde al elemento y
   * marca su fila para que se vea cual se va a editar.
   */
  openFor(element) {
    if (!element) return this.open();

    if (is(element, 'bpmn:Task')) this._activeTab = 'tasks';
    else if (is(element, 'bpmn:SequenceFlow')) this._activeTab = 'flows';
    else if (is(element, 'bpmn:StartEvent')) this._activeTab = 'global';
    else if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant')) this._activeTab = 'resources';
    else this._activeTab = 'tasks';

    this._focusId = element.id;
    this.open();

    // _render() reconstruye las pestañas sin conservar cual estaba activa, asi
    // que se marca aqui.
    this._panel.querySelectorAll('.panel-tabs button').forEach((b) =>
      domClasses(b).toggle(TAB_ACTIVE_CLS, b.dataset.tab === this._activeTab));

    const fila = this._panel.querySelector(`tbody tr[data-el-id="${element.id}"]`);
    if (fila) {
      domClasses(fila).add('fila-foco');
      if (fila.scrollIntoView) fila.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  /**
   * Atiende el atajo del diagnostico: abre la tabla en el campo y lo resalta.
   *
   * Si NO hay viaje (el dato lo calcula el diagrama, como el reparto de las
   * compuertas) se DICE en la barra de estado en vez de no hacer nada: un boton que no
   * responde se lee como que el programa esta roto. La lista del diagnostico ya no
   * marca esos como pulsables, asi que este camino solo se recorre si algo cambia.
   */
  _irADestino(destino) {
    if (!destino) return;

    if (destino.espacio === 'solo-aviso' || !this.irA(destino)) {
      this._setStatus(
        destino.espacio === 'solo-aviso'
          ? 'Ese dato no se escribe a mano: lo calcula el diagrama o el reparto de las compuertas.'
          : 'No se encontró el campo de ese dato en la tabla.',
        'info'
      );
      return;
    }

    this._setStatus('Ve a la casilla resaltada para rellenar el dato que falta.', 'ok');
  }

  /**
   * Lleva la tabla al sitio donde se rellena un dato que falta.
   *
   * Es el otro extremo del atajo del diagnostico: alli se dice QUE falta, aqui se
   * ensena DONDE se escribe. Va aparte de `openFor(element)` porque este ultimo
   * trabaja sobre un elemento del diagrama -una tarea concreta- y un pendiente del
   * diagnostico es un DATO que puede vivir en varias tareas a la vez.
   *
   * `objetivo` es un destino de DataAudit.DESTINOS:
   *   { espacio: 'tabla',  tab, campos: [] }   -> resalta esos campos en la tabla
   *   { espacio: 'tabla',  tab, columna }      -> resalta esa columna en todas las filas
   *   { espacio: 'lista',  tab, lista }        -> lleva a una lista anidada
   *   { espacio: 'proceso',tab, campo }        -> lleva a la fila del proceso
   *   { espacio: 'solo-aviso' }                -> NO se mueve: no hay control que lo escriba
   *
   * Devuelve SI se movio, para que quien llama pueda decir «esto se calcula solo» en
   * vez de dejar al usuario mirando una pantalla que no cambio.
   */
  irA(objetivo) {
    if (!objetivo || objetivo.espacio === 'solo-aviso') return false;

    this._activeTab = objetivo.tab || 'tasks';
    this.open();
    this._panel.querySelectorAll('.panel-tabs button').forEach((b) =>
      domClasses(b).toggle(TAB_ACTIVE_CLS, b.dataset.tab === this._activeTab));

    // Despues de abrir y RENDERIZAR: el resaltado trabaja sobre nodos que hasta
    // ahora no existian.
    return this._resaltarDestino(objetivo);
  }

  /**
   * Pinta el resaltado del destino y lo apaga solo.
   *
   * Se apaga por tiempo y no al pulsar en otro sitio: el resaltado marca un viaje
   * recien hecho, y dejarlo pegado terminaria pareciendo un estado mas del modelo.
   * Cuatro segundos dan para llegar con la vista; mas tiempo y ya molesta.
   */
  _resaltarDestino(objetivo) {
    const objetivos = [];

    if (objetivo.columna) {
      // Toda la COLUMNA, no una celda: el dato falta en varias tareas y senalar solo
      // la primera seria mentir sobre donde hay que escribir.
      objetivos.push(...this._body.querySelectorAll(`[data-field="${objetivo.columna}"]`));
    }

    (objetivo.campos || []).forEach((c) => {
      const nodo = this._body.querySelector(`[data-field="${c}"]`);
      if (nodo) objetivos.push(nodo);
    });

    if (objetivo.campo) {
      const nodo = this._body.querySelector(`[data-field="${objetivo.campo}"]`);
      if (nodo) objetivos.push(nodo);
    }

    if (!objetivos.length) return false;

    // Se apaga lo anterior antes de pintar lo nuevo: dos resaltados a la vez dirian que
    // hay que rellenar dos sitios cuando el viaje fue a uno.
    this._limpiarDestino();

    this._destinoResaltado = objetivos;
    objetivos.forEach((nodo) => domClasses(nodo).add('destino-resaltado'));
    if (objetivos[0].scrollIntoView) objetivos[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    if (objetivos[0].focus && objetivos[0].focus.call) objetivos[0].focus();

    // Y se apaga solo: el resaltado marca un viaje recien hecho, y dejarlo pegado
    // terminaria pareciendo un estado mas del modelo. Cuatro segundos dan para llegar
    // con la vista; mas tiempo y ya molesta.
    this._temporizadorDestino = setTimeout(() => this._limpiarDestino(), 4000);

    return true;
  }

  /**
   * Quita el resaltado del destino y cancela su caducidad.
   *
   * Va en su propio metodo por dos motivos: al viajar a otro sitio hay que apagar el
   * anterior -dos resaltados a la vez dirian que hay que rellenar dos sitios-, y el
   * temporizador NO se puede probar desde un arnes que solo mira el DOM una vez.
   * Llamandolo, el apagado se comprueba de verdad en vez de por fe.
   */
  _limpiarDestino() {
    clearTimeout(this._temporizadorDestino);
    (this._destinoResaltado || []).forEach((nodo) => domClasses(nodo).remove('destino-resaltado'));
    this._destinoResaltado = null;
  }

  close() {
    if (this._panel) domClasses(this._panel).remove(OPEN_CLS);
    this._focusId = null;
    // El resaltado del atajo no sobrevive al cierre: al volver a abrir, la tabla tiene
    // que verse limpia y no con la marca de un viaje de hace media hora.
    this._limpiarDestino();
    this._quitarOferta();
  }
  destroy() {
    this._quitarLapiz();
    this._quitarOferta();
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
      this._panel = null;
    }
  }

  _setStatus(text, kind) {
    if (!this._status) return;
    this._status.textContent = text || '';
    this._status.className = 'status' + (kind ? ' ' + kind : '');
  }

  /**
   * Ofrece desactivar el modo Token Simulation y reintentar la operacion.
   *
   * Antes solo se mostraba un aviso y el usuario tenia que ir al menu, pulsar
   * «Toggle Token Simulation» y volver a empezar. Peor: el aviso venia seguido de
   * un `_render()` que reconstruia la tabla desde el diagrama, asi que TODO lo
   * que el usuario acababa de teclear se perdia — justo el escenario donde mas
   * molesta. Aqui no se re-renderiza (los valores siguen en pantalla) y se
   * ofrece un boton que dispara 'toggleTokenSimulation' y reintenta tal cual.
   *
   * `toggleTokenSimulation` esta en la lista blanca de DisableModeling, asi que
   * funciona aunque el modo este activo (es su proposito).
   *
   * @param {string}   mensaje      texto del estado (el motivo del bloqueo)
   * @param {Function} alReintentar accion a repetir tras desactivar el modo
   */
  _ofrecerDesactivarModo(mensaje, alReintentar) {
    this._quitarOferta();
    if (!this._panel) return;

    const boton = this._btnDesactivar = domify(
      '<button class="btn-desactivar" type="button">Desactivar modo y reintentar</button>'
    );

    domEvent.bind(boton, 'click', () => {
      this._quitarOferta();
      try {
        this._editorActions.trigger('toggleTokenSimulation');
      } catch (err) {
        this._setStatus(`No se pudo desactivar el modo Token Simulation: ${err.message || err}`, 'error');
        return;
      }
      alReintentar();
    });

    const footer = this._panel.querySelector('.panel-footer');
    footer.insertBefore(boton, footer.querySelector('.btn-save'));
    this._setStatus(mensaje, 'error');
  }

  _quitarOferta() {
    if (this._btnDesactivar && this._btnDesactivar.parentNode) {
      this._btnDesactivar.parentNode.removeChild(this._btnDesactivar);
    }
    this._btnDesactivar = null;
  }

  // -- acceso a datos -------------------------------------------------------

  _getTasks() {
    return this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task'));
  }

  _getFlows() {
    return this._elementRegistry.filter(
      (el) => !isLabel(el) && is(el, 'bpmn:SequenceFlow') && el.source && is(el.source, 'bpmn:ExclusiveGateway')
    );
  }

  _getRootStartEvent() {
    const starts = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:StartEvent'));
    return starts.find((el) => {
      const d = getSimulationData(el);
      return d && d.isRoot;
    }) || null;
  }

  /**
   * Elemento que guarda las piscinas de recursos: el proceso o el participante.
   *
   * Se replica el MISMO criterio que usa el motor (`_elementRegistry.find(...)`)
   * para que lo que se edita aqui sea exactamente lo que el motor lee. En un
   * diagrama con varios participantes el motor toma el primero; si eso cambia
   * algun dia, tiene que cambiar en los dos sitios a la vez.
   */
  _getProcessRoot() {
    return this._elementRegistry.find((el) => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant')) || null;
  }

  /** Piscinas de recursos declaradas en el proceso. */
  _getPools() {
    const root = this._getProcessRoot();
    if (!root) return [];
    const d = getSimulationData(root) || {};
    return Array.isArray(d.resourcePools) ? d.resourcePools : [];
  }

  _label(element) {
    const bo = element.businessObject;
    return bo.name || element.id;
  }

  _taskData(element) {
    const raw = getSimulationData(element) || {};
    const d = TASK_DEFAULTS();
    return {
      ...d,
      ...raw,
      processingTime: { ...d.processingTime, ...(raw.processingTime || {}) },
      reworkTime: { ...d.reworkTime, ...(raw.reworkTime || {}) },
      barrier: { ...d.barrier, ...(raw.barrier || {}) },
      // La carga se mezcla campo a campo, igual que la barrera: si el modelo solo
      // declarara la distancia, las otras dos casillas tienen que salir vacias y
      // no `undefined` (que se pintaria como la cadena «undefined»).
      carga: { ...d.carga, ...(raw.carga || {}) }
    };
  }

  _flowData(element) {
    const raw = getSimulationData(element) || {};
    return { ...FLOW_DEFAULTS(), ...raw };
  }

  _globalData() {
    const root = this._getRootStartEvent();
    if (!root) return null;
    const raw = getSimulationData(root) || {};
    const d = DEFAULT_GLOBAL();
    return {
      element: root,
      data: {
        ...d,
        ...raw,
        isRoot: true,
        // Las vigencias se toman TAL CUAL del modelo, sin pasarlas por `normalizeLabor`.
        // Por que: esa funcion DESCARTA en silencio las reglas con fecha invalida, y aqui eso rompe
        // dos cosas. La tabla de vigencias se pintaria vacia aunque el diagrama las tenga -reabrir
        // el panel pareceria perder el trabajo-, y el importador del CSV no podria rechazar una
        // fecha mala porque ya no llegaria a verla: el error se habria comido la fila antes.
        // El motor sigue normalizando por su cuenta al simular, que es donde toca.
        labor: { ...d.labor, ...(raw.labor || {}) },
        // Los objetos anidados se mezclan uno a uno: con `...raw` a secas, un
        // modelo que solo tenga `labor.shiftType` perdería los demás valores por
        // defecto y las casillas saldrían vacías.
        warmup: { ...d.warmup, ...(raw.warmup || {}) },
        lots: { ...d.lots, ...(raw.lots || {}) }
      }
    };
  }

  // -- render ---------------------------------------------------------------

  _render() {
    if (!this._panel) return;
    this._setStatus('');
    this._quitarOferta();

    if (this._activeTab === 'tasks') this._renderTasks();
    else if (this._activeTab === 'flows') this._renderFlows();
    else if (this._activeTab === 'resources') this._renderResources();
    else this._renderGlobal();

    this._avisarSinRaiz();
  }

  /**
   * Ayuda de la pestana activa: campos, que se mide con ellos y la trampa.
   *
   * El contenido vive en `Ayuda.js`; aqui solo se pinta y se abre o se cierra. Se redibuja en cada
   * llamada porque depende de la PESTANA, y se mantiene abierta con una clase para que el usuario no
   * tenga que reabrirla al cambiar de tab.
   */
  _toggleAyuda() {
    if (!this._ayuda) return;
    const html = htmlDeAyuda(this._activeTab);
    if (!html) return;
    this._ayuda.innerHTML = html;
    domClasses(this._ayuda).toggle('hidden');
  }

  /**
   * Aviso en Tareas y Flujos cuando no hay evento raiz.
   *
   * Sin esto se puede rellenar y guardar toda la tabla y descubrir al simular
   * que el motor se niega a arrancar ("No root start event found"), sin ninguna
   * pista de donde esta el problema: la causa esta en otra pestaña.
   */
  _avisarSinRaiz() {
    if (this._activeTab === 'global') return;
    if (this._getRootStartEvent()) return;
    if (!this._body) return;

    const aviso = domify(
      '<p class="aviso-raiz">Sin evento raíz configurado la simulación no se ejecutará. '
      + 'Ve a la pestaña <strong>Global</strong> para crearlo.</p>'
    );
    this._body.insertBefore(aviso, this._body.firstChild);
  }

  _renderTasks() {
    const tasks = this._getTasks();

    if (!tasks.length) {
      this._body.innerHTML = '<p class="empty">No hay tareas en el diagrama.</p>';
      return;
    }

    const nombresPool = this._getPools().map((p) => p.name).filter(Boolean);

    // La ayuda de columna va en la CABECERA. Con 23 columnas por tarea, un «?» en cada
    // celda serian cientos de botones repitiendo el mismo texto.
    const th = (texto, clave, extra) => `<th${extra || ''}>${texto}${AYUDA_COLUMNAS[clave]
      ? ` <button class="btn-ayuda-col" type="button" data-ayuda-col="${clave}"
           title="Qué valor espera esta columna">?</button>` : ''}</th>`;

    this._body.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            ${th('Tarea', 'tarea', ' class="col-name"')}
            ${th('Distribución', 'distribucion')}
            ${th('Tiempo', 'tiempo')}
            ${th('Unidad', 'unidad')}
            ${th('mín', 'tiempoMin')}
            ${th('moda', 'tiempoModa')}
            ${th('máx', 'tiempoMax')}
            ${th('Tasa de fallo', 'tasaFallo')}
            ${th('Retrabajo', 'retrabajo')}
            ${th('Unidad', 'unidadRetrabajo')}
            ${th('Recurso', 'recurso')}
            ${th('Miembro (opcional)', 'miembro')}
            ${th('Cant.', 'cant')}
            ${th('Frecuencia', 'frecuencia')}
            ${th('Barrera (solo «por lote»): disp. · espera mín/moda/máx · tolerancia', 'barrera', ' colspan="5" class="col-barrera"')}
            ${th('Carga física (opcional): cargada kg · arrastrada kg · distancia m', 'carga', ' colspan="3" class="col-carga"')}
            ${th('Habilidad', 'habilidad')}
            ${th('Cupo', 'cupo')}
            ${th('Arranque del cupo', 'arranqueCupo')}
          </tr>
          <!-- Fila COMPARTIDA para la ayuda de columna. No se expande la celda de la
               cabecera: eso descuadraria el ancho de esa columna y moveria toda la
               tabla. Aqui el texto sale siempre en el mismo sitio y el ancho no cambia. -->
          <tr class="fila-ayuda-col hidden">
            <td colspan="25" class="ayuda-campo"></td>
          </tr>
        </thead>
        <tbody>
          ${tasks.map((el) => {
            const d = this._taskData(el);
            const units = (selected) => TASK_UNITS
              .map((u) => `<option value="${u}" ${selected === u ? 'selected' : ''}>${u}</option>`).join('');
            const dist = d.processingTime.distribution || 'fixed';
            const tri = dist === 'triangular';
            // Los campos de min/moda/max solo se leen cuando la distribucion es
            // triangular; con "fija" se ignora lo que haya en ellos.
            const p = (campo, valor, marcador) =>
              `<input type="number" step="any" min="0" class="cell mini" `
              + `data-field="${campo}" value="${valor == null ? '' : valor}" placeholder="${marcador}">`;

            // Selector en vez de texto libre: el motor busca la piscina por
            // nombre exacto y, si no la encuentra, IGNORA el recurso en silencio.
            // Una errata desactivaria la restriccion sin avisar.
            const actual = (d.resources && d.resources.pool) || '';
            const opciones = [ '' ].concat(nombresPool);
            // Si la tarea apunta a una piscina que ya no existe, se conserva
            // como opcion para no borrarla sin querer al guardar.
            if (actual && !nombresPool.includes(actual)) opciones.push(actual);
            const selectPool = opciones.map((n) =>
              `<option value="${esc(n)}" ${actual === n ? 'selected' : ''}>${n === '' ? '(ninguno)' : esc(n)}</option>`
            ).join('');

            // EL MIEMBRO CONCRETO, opcional. Se puebla con los de la piscina elegida: un
            // desplegable con TODOS los nombres del modelo permitiria designar a alguien de otra
            // piscina, que es el error que la validacion tiene que atrapar despues. Ofreciendo solo
            // los suyos, no se puede cometer.
            // LAS HABILIDADES SON UN DESPLEGABLE DE LAS QUE EXISTEN, no una caja de texto.
            //
            // POR QUE: una habilidad que la tarea exige y que NADIE tiene BLOQUEA la tarea, y es el
            // peor fallo posible porque es silencioso -la corrida termina con trabajo sin hacer y
            // sin ningun error-. Con las habilidades dadas de alta en los recursos, ese error deja
            // de poder cometerse por una errata. Se conserva el valor guardado aunque ya no exista,
            // para no borrarlo sin querer.
            const habActual = Array.isArray(d.habilidades) ? d.habilidades.join(', ') : (d.habilidad || '');
            const habs = habilidadesDisponibles(this._getPools());
            const opcionesHab = [ '' ].concat(habs)
              .concat(habActual && !habs.includes(habActual) ? [ habActual ] : []);
            const selectHabilidad = `<select class="cell mini" data-field="habilidad">
              ${opcionesHab.map((n) => `<option value="${esc(n)}" ${habActual === n ? 'selected' : ''}>${
                n === '' ? '(ninguna)' : esc(n)}</option>`).join('')}
            </select>`;

            // CUPO: N piezas a la vez. Solo se considera declarado con size > 1: un 1 es «una pieza
            // a la vez», que es lo de siempre, y dejarlo vacio en la tabla evita que parezca que
            // todas las tareas usan cupo.
            const cupo = d.cupo && Number(d.cupo.size) > 1 ? d.cupo : null;

            const miembroActual = (d.resources && d.resources.miembro) || '';
            const miembros = miembrosDePiscina(this._getPools(), actual);
            const selectMiembro = [ '' ].concat(miembros)
              // Si designa a alguien que ya no esta en la piscina se conserva como opcion, para no
              // borrar la designacion sin querer al abrir la pestana.
              .concat(miembroActual && !miembros.includes(miembroActual) ? [ miembroActual ] : [])
              .map((n) => `<option value="${esc(n)}" ${miembroActual === n ? 'selected' : ''}>${
                n === '' ? '(el que esté libre)' : esc(n)}</option>`).join('');

            // Frecuencia y barrera. La barrera SOLO tiene sentido con «por
            // lote» (es lo que hace esperar al lote entero), asi que con «por
            // token» sus casillas se deshabilitan y se dice por que: dejarlas
            // editables guardaria un valor que el motor ignoraria.
            const esLote = (d.frequency || 'token') === 'lot';
            const b = d.barrier;
            const celdaBarrera = (campo, valor, marcador, atributos) =>
              `<td><input type="number" ${atributos} class="cell mini"`
              + ` data-field="barrier.${campo}" value="${valor == null ? '' : valor}"`
              + ` placeholder="${marcador}"${esLote ? '' : ' disabled title="Solo para tareas «por lote»"'}></td>`;

            // Carga fisica. `carga` va vacia por defecto en TASK_DEFAULTS, asi que
            // una tarea sin carga declarada muestra las casillas en blanco (y no
            // un 0, que se confundiria con «pesa cero»).
            const c = d.carga || {};
            const celdaCarga = (campo, valor, marcador, atributos) =>
              `<td><input type="number" ${atributos} class="cell mini"`
              + ` data-field="carga.${campo}" value="${valor == null ? '' : valor}" placeholder="${marcador}"></td>`;

            // Habilidad exigida: UNA sola etiqueta, no una lista. El caso comun es
            // «esta tarea necesita soldadura», y para varias se escribe separado
            // por comas (el motor acepta las dos formas).
            const habilidad = Array.isArray(d.habilidades) ? d.habilidades.join(', ') : (d.habilidad || '');

            return `
              <tr data-el-id="${el.id}">
                <td class="col-name" title="${esc(this._label(el))}">${esc(this._label(el))}</td>
                <td><select class="cell" data-field="processingTime.distribution">
                  <option value="fixed" ${!tri ? 'selected' : ''}>fija</option>
                  <option value="triangular" ${tri ? 'selected' : ''}>triangular</option>
                </select></td>
                <td><input type="number" step="any" min="0" class="cell" data-field="processingTime.value" value="${d.processingTime.value}"></td>
                <td><select class="cell" data-field="processingTime.unit">${units(d.processingTime.unit)}</select></td>
                <td>${p('processingTime.min', d.processingTime.min, 'mín')}</td>
                <td>${p('processingTime.mode', d.processingTime.mode, 'moda')}</td>
                <td>${p('processingTime.max', d.processingTime.max, 'máx')}</td>
                <td><span class="pct">
                  <input type="number" step="any" min="0" max="100" class="cell mini"
                    data-field="failureRate" value="${pctATexto(d.failureRate)}">
                  <span class="pct-signo">%</span>
                </span></td>
                <td><input type="number" step="any" min="0" class="cell" data-field="reworkTime.value" value="${d.reworkTime.value}"></td>
                <td><select class="cell" data-field="reworkTime.unit">${units(d.reworkTime.unit)}</select></td>
                <td><select class="cell" data-field="resources.pool">${selectPool}</select></td>
                <td><select class="cell" data-field="resources.miembro" ${actual ? '' : 'disabled title="Elige primero una piscina"'}>
                  ${selectMiembro}
                </select></td>
                <td><input type="number" step="1" min="1" class="cell mini" data-field="resources.quantityRequired"
                  value="${(d.resources && d.resources.quantityRequired) || 1}"
                  ${actual ? '' : 'disabled title="Elige primero una piscina"'}>
                </td>
                <td class="col-freq"><select class="cell" data-field="frequency">
                  <option value="token" ${esLote ? '' : 'selected'}>por token</option>
                  <option value="lot" ${esLote ? 'selected' : ''}>por lote</option>
                </select></td>
                ${celdaBarrera('availableProbability', b.availableProbability, 'disp.', 'step="0.01" min="0" max="1"')}
                ${celdaBarrera('waitMin', b.waitMin, 'mín', 'step="any" min="0"')}
                ${celdaBarrera('waitMode', b.waitMode, 'moda', 'step="any" min="0"')}
                ${celdaBarrera('waitMax', b.waitMax, 'máx', 'step="any" min="0"')}
                ${celdaBarrera('toleranceMinutes', b.toleranceMinutes, 'tol.', 'step="any" min="0"')}
                ${celdaCarga('masaCargadaKg', c.masaCargadaKg, 'kg', 'step="any" min="0"')}
                ${celdaCarga('masaArrastradaKg', c.masaArrastradaKg, 'kg', 'step="any" min="0"')}
                ${celdaCarga('distanciaM', c.distanciaM, 'm', 'step="any" min="0"')}
                <td>${selectHabilidad}</td>
                <td><input type="number" step="1" min="1" class="cell mini" data-field="cupo.size"
                  value="${cupo ? cupo.size : ''}" placeholder="—"
                  title="N piezas procesadas A LA VEZ y liberadas juntas. Vacío o 1 = una pieza a la vez. El «Tiempo» es el del cupo completo, no el de una pieza.">
                  <div class="aviso-cupo"></div></td>
                <td><select class="cell" data-field="cupo.arranque" ${cupo ? '' : 'disabled title="Pon primero un cupo mayor que 1"'}>
                  <option value="lleno" ${cupo && cupo.arranque === 'lleno' ? 'selected' : ''}>esperar a llenar</option>
                  <option value="inmediato" ${cupo && cupo.arranque === 'inmediato' ? 'selected' : ''}>arrancar con lo que haya</option>
                </select></td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
      <p class="hint">
        El tiempo se interpreta de una forma u otra según la <strong>distribución</strong>:
        con <em>fija</em> se usa el valor de «Tiempo»; con <em>triangular</em> se usan
        <strong>mín</strong>, <strong>moda</strong> y <strong>máx</strong>, y el valor de «Tiempo» se ignora.
        Con la distribución fija la simulación es determinista.
      </p>
      <p class="hint">
        <strong>Recurso</strong>: la tarea toma esa cantidad de la piscina antes de empezar y la devuelve al
        terminar. Si no hay unidades libres, <em>espera en cola</em>: esa espera se ve en el
        «Tiempo de espera» del mapa de calor y, si defines un costo de espera, en el «Costo de tiempos muertos».
        Las piscinas se definen en la pestaña <strong>Recursos</strong>; sin ninguna dada de alta, esta columna
        no tiene nada que ofrecer.
      </p>
      <p class="hint">
        <strong>Frecuencia</strong>: <em>por token</em> es lo de siempre (una vez por caso);
        <em>por lote</em> se ejecuta <strong>una sola vez por lote</strong>, la primera vez que el flujo pasa
        por aquí. Es el «hay que rellenar el documento» de cada lote: el resto de tokens del lote
        <em>esperan</em> a que se haga.
      </p>
      <p class="hint">
        <strong>Barrera</strong> (tareas «por lote»): quien firma no está dedicado a esta área, así que no se
        modela como una persona —se modela por su efecto—. <strong>disp.</strong> es la probabilidad de que
        atiendan a la primera; si no atienden, el lote espera una cantidad con forma
        <strong>mín / moda / máx</strong>. La <strong>tol.</strong> es cuánta espera cuenta como parón
        reportable: sin umbral, cada espera de tres minutos ensucia el informe y al final nadie lo lee.
        Con <strong>disp.</strong> a 1 no hay ninguna espera.
      </p>
    `;

    this._bindBarrera();
    this._bindAyudaDeColumnas();
    this._bindAutoguardado();
  }

  /**
   * Los «?» de la cabecera y la fila compartida que muestra su texto.
   *
   * Volver a pulsar el MISMO «?» repliega la ayuda, para cerrarla sin buscar otra columna; pulsar
   * otro la cambia, que es lo que se espera al ir comparando. La logica vive en `Ayuda.js` y aqui se
   * sincroniza el boton marcado.
   */
  _bindAyudaDeColumnas() {
    enlazarAyudaDeColumnas(this._body, (clave) => {
      this._marcarAyudaColumna(alternarAyudaDeColumna(this._body, clave));
    });
  }

  _marcarAyudaColumna(clave) {
    marcarAyudaDeColumna(this._body, clave);
  }

  /**
   * Habilita/deshabilita la barrera segun la frecuencia de cada tarea.
   *
   * Sin esto, cambiar «por token» a «por lote» dejaria las casillas muertas hasta
   * reabrir el panel, y al reves: se podrian rellenar y guardar valores de
   * barrera en tareas por token, que el motor ignora.
   */
  _bindBarrera() {
    this._body.querySelectorAll('tr[data-el-id]').forEach((tr) => {
      const select = tr.querySelector('[data-field="frequency"]');
      if (!select) return;

      const barreras = tr.querySelectorAll('[data-field^="barrier."]');
      const sincronizar = () => {
        const esLote = select.value === 'lot';
        barreras.forEach((input) => {
          input.disabled = !esLote;
          input.title = esLote ? '' : 'Solo para tareas «por lote»';
        });
      };

      domEvent.bind(select, 'change', sincronizar);
      sincronizar();
    });

    this._bindCupo();
  }

  /**
   * El CUPO: habilita su arranque al escribirlo y avisa si no da abasto.
   *
   * TRES COSAS, y las tres salen de un caso real que costo tiempo entender:
   *
   *   1. EL ARRANQUE SE HABILITA AL ESCRIBIR EL CUPO. Antes solo se miraba al pintar la tabla, asi
   *      que recien escrito el cupo el desplegable seguia muerto y parecia que no funcionaba: habia
   *      que re-renderizar para poder elegir la politica. Ahora se escucha el campo y se sincroniza.
   *
   *   2. SE AVISA DE LA CAPACIDAD CONTRA LAS LLEGADAS. Un cupo de 24 con 10 minutos da 2,4
   *      piezas/minuto; si la raiz declara MAS llegadas que eso, la cola crece sin limite y el
   *      tiempo total del informe deja de significar nada. Es el error mas facil de cometer -se
   *      declara el cupo y las llegadas por separado- y no lo avisaba nadie: se veian «142 dias»
   *      sin saber por que.
   *
   *   3. Se dice EN UNIDADES COMPARABLES: piezas por minuto de un lado y del otro. Comparar «24 por
   *      tanda» con «3 por minuto» a ojo es justo lo que se hace mal.
   */
  _bindCupo() {
    // Las llegadas de la raiz, en piezas por minuto, una vez para toda la tabla.
    const llegadasPorMinuto = this._llegadasPorMinuto();

    this._body.querySelectorAll('tbody tr[data-el-id]').forEach((tr) => {
      const campoCupo = tr.querySelector('[data-field="cupo.size"]');
      const selectArranque = tr.querySelector('[data-field="cupo.arranque"]');
      if (!campoCupo || !selectArranque) return;

      const sincronizar = () => {
        const tamano = Number(campoCupo.value);
        const hayCupo = Number.isFinite(tamano) && tamano > 1;
        selectArranque.disabled = !hayCupo;
        selectArranque.title = hayCupo ? '' : 'Pon primero un cupo mayor que 1';
        this._avisarCapacidadDeCupo(tr, tamano, llegadasPorMinuto);
      };

      domEvent.bind(campoCupo, 'input', sincronizar);
      domEvent.bind(campoCupo, 'change', sincronizar);
      sincronizar();
    });
  }

  /** Las llegadas declaradas en la raiz, en piezas por minuto. `null` si no hay. */
  _llegadasPorMinuto() {
    const raiz = this._getRootStartEvent();
    if (!raiz) return null;
    const info = this._globalData();
    const tasa = info && info.data && info.data.arrivalRate;
    if (!tasa || !(Number(tasa.value) > 0)) return null;
    const porHora = tasa.unit === 'hour' ? Number(tasa.value)
      : tasa.unit === 'second' ? Number(tasa.value) * 3600 : Number(tasa.value) * 60;
    return porHora / 60;
  }

  /**
   * Avisa si el cupo no da abasto a las llegadas declaradas.
   *
   * La comparacion es CAPACIDAD contra LLEGADAS, las dos en piezas por minuto:
   *
   *     capacidad = cupo / minutos de la tarea
   *     llegadas  = lo que declara la raiz
   *
   * Con capacidad >= llegadas, la cola se vacia y los tiempos del informe valen. Con capacidad <
   * llegadas, la cola CRECE: el tiempo total pasa a medir cuanto dura la corrida y no el proceso,
   * asi que un «142 dias» no significa que la pieza tarde eso.
   */
  _avisarCapacidadDeCupo(tr, tamano, llegadasPorMinuto) {
    const aviso = tr.querySelector('.aviso-cupo');
    if (!aviso) return;

    aviso.textContent = '';
    aviso.removeAttribute('title');
    domClasses(aviso).remove('mal', 'bien');

    const esCupo = Number.isFinite(tamano) && tamano > 1;
    if (!esCupo || llegadasPorMinuto == null) return;

    // Los minutos de la tarea: con distribucion triangular se usa la moda, que es su valor tipico.
    const unidad = tr.querySelector('[data-field="processingTime.unit"]');
    const minutos = this._minutosDeLaTarea(tr, unidad ? unidad.value : 'minutes');
    if (!(minutos > 0)) return;

    const capacidad = tamano / minutos;
    const razon = capacidad / llegadasPorMinuto;

    const fmt = (n) => (n < 1 ? n.toFixed(2) : n.toFixed(1));
    if (razon >= 1) {
      domClasses(aviso).add('bien');
      aviso.textContent = `capacidad ${fmt(capacidad)}/min ≥ ${fmt(llegadasPorMinuto)} que llegan`;
      return;
    }

    // No da abasto. Se dice la consecuencia, no solo el numero: es la diferencia entre «falta
    // capacidad» y «tu informe de 142 dias no significa lo que crees».
    domClasses(aviso).add('mal');
    aviso.textContent = `capacidad ${fmt(capacidad)}/min < ${fmt(llegadasPorMinuto)} que llegan — la cola crece`;
    aviso.title = `El cupo procesa ${fmt(capacidad)} piezas por minuto y llegan ${fmt(llegadasPorMinuto)}. `
      + `Faltan ${fmt(llegadasPorMinuto - capacidad)} por minuto, asi que la cola crece sin limite y el `
      + 'tiempo total de la simulacion mide cuanto dura la corrida, no lo que tarda una pieza. '
      + `Sube el cupo a ${Math.ceil(llegadasPorMinuto * minutos)} o baja las llegadas para que cuadre.`;
  }

  /** Los minutos que declara una tarea, leyendo su casilla segun la distribucion. */
  _minutosDeLaTarea(tr, unidad) {
    const leer = (campo) => {
      const el = tr.querySelector(`[data-field="${campo}"]`);
      return el ? Number(String(el.value).replace(',', '.')) : NaN;
    };
    const distribucion = tr.querySelector('[data-field="processingTime.distribution"]');
    const esTri = distribucion && distribucion.value === 'triangular';
    const valor = esTri ? leer('processingTime.mode') : leer('processingTime.value');
    if (!Number.isFinite(valor) || valor <= 0) return null;
    const factor = unidad === 'hours' ? 60 : unidad === 'seconds' ? 1 / 60 : 1;
    return valor * factor;
  }

  /**
   * Enlaza el AUTOGUARDADO de la pestaña Tareas: al salir de un campo se guarda su
   * tarea, sin pasar por «Guardar todo».
   *
   * Por que `change` y no `input`: en una caja de texto `change` salta al SALIR del
   * campo, que es justo lo que se pidio (no guardar en cada tecla, cuando el valor
   * esta a medias y es invalido), y en un desplegable o una casilla salta al elegir,
   * sin esperar a nada.
   *
   * Por que SOLO en Tareas: una fila de esta tabla se valida sola -sus campos no
   * dependen de las demas-, y eso es lo que permite guardarla mientras otra fila esta
   * a medio escribir. En Flujos, en cambio, el reparto tiene que sumar 100 % ENTRE
   * VARIAS filas: guardar una sola dejaria el descuadre a proposito. En Piscinas los
   * nombres no se pueden repetir. Esas dos siguen con «Guardar todo».
   */
  _bindAutoguardado() {
    this._body.querySelectorAll('tbody tr[data-el-id]').forEach((tr) => {
      // Elegir piscina habilita la cantidad. Antes eso solo se veia al guardar y
      // re-renderizar; el autoguardado NO re-renderiza (si lo hiciera perderia el
      // foco y lo que se este tecleando), asi que sin esto la cantidad se quedaria
      // muerta para siempre.
      const selPool = tr.querySelector('[data-field="resources.pool"]');
      if (selPool) {
        domEvent.bind(selPool, 'change', () => {
          const cant = tr.querySelector('[data-field="resources.quantityRequired"]');
          if (!cant) return;
          cant.disabled = selPool.value === '';
          cant.title = cant.disabled ? 'Elige primero una piscina' : '';
        });
      }

      tr.querySelectorAll('[data-field]').forEach((campo) => {
        domEvent.bind(campo, 'change', () => this._autoguardarFila(tr, campo));
      });
    });
  }

  /**
   * Guarda UNA fila de Tareas y pinta la casilla con el resultado del intento.
   *
   * El color es el aviso, y sin el el autoguardado seria peor que no tenerlo: no se
   * sabria si lo escrito llego al diagrama o se quedo solo en pantalla.
   *   amarillo -> se esta comprobando
   *   verde    -> el valor esta ya en el diagrama
   *   rojo     -> NO se guardo, y el motivo sale en la barra de estado
   * El amarillo se ve de verdad cuando el guardado NO puede terminar (modo Token
   * Simulation activo): al guardar bien dura un instante, porque lectura y escritura
   * son la misma tarea del navegador y no se llega a pintar.
   *
   * El verde se queda: mientras no se vuelva a tocar el campo significa «esto que se ve
   * aqui es lo que hay guardado». Vuelve a amarillo en cuanto se edita otra vez.
   */
  _autoguardarFila(tr, campo) {
    domClasses(campo).remove('invalido');
    domClasses(campo).remove('guardado');
    domClasses(campo).add('guardando');

    let fila;
    try {
      fila = this._datosDeFila(tr);
    } catch (err) {
      // Se queda en rojo y SIN guardar, y el texto del usuario no se toca para que
      // pueda corregirlo. Una fila invalida no bloquea a las demas.
      domClasses(campo).remove('guardando');
      domClasses(campo).add('invalido');
      this._setStatus(err.message, 'error');
      return;
    }

    if (!fila) {
      domClasses(campo).remove('guardando');
      return;
    }

    try {
      setSimulationData(fila.element, fila.data, {
        modeling: this._modeling,
        bpmnFactory: this._bpmnFactory
      });
    } catch (err) {
      const soloLectura = /read-only/i.test(String(err && err.message));

      if (soloLectura) {
        // Amarillo: NO esta guardado y hace falta una accion. El boton desactiva el
        // modo y reintenta ESTA fila, que se vuelve a leer entonces (por si mientras
        // tanto se escribio algo mas). Sin notificacion: saltaria en cada campo.
        this._ofrecerDesactivarModo(
          'El diagrama está en solo lectura porque el modo Token Simulation está activo.'
          + ' Desactívalo y lo que has escrito se guardará tal cual.',
          () => this._autoguardarFila(tr, campo)
        );
        return;
      }

      domClasses(campo).remove('guardando');
      domClasses(campo).add('invalido');
      this._setStatus(`No se pudo guardar: ${err.message || err}`, 'error');
      return;
    }

    domClasses(campo).remove('guardando');
    domClasses(campo).add('guardado');
    this._setStatus(`Guardado: ${this._label(fila.element)}.`, 'ok');
  }

  /**
   * Pestaña de piscinas de recursos.
   *
   * Faltaba: el motor lee `resourcePools` del proceso, la metrica "Cantidad de
   * Recursos" existe en la paleta y las tareas ya podian consumir recursos...
   * pero no habia NINGUNA forma de declarar una piscina desde el plugin. Solo el
   * generador aleatorio (ya retirado) las creaba.
   */
  _renderResources() {
    const root = this._getProcessRoot();

    if (!root) {
      this._body.innerHTML = '<p class="empty">El diagrama no tiene ningún proceso donde guardar los recursos.</p>';
      return;
    }

    const pools = this._getPools();

    this._body.innerHTML = `
      <p class="hint">
        Piscinas de recursos del proceso: <strong>${esc(this._label(root))}</strong>.
        Cada piscina es un grupo de unidades equivalentes (personas, máquinas, vehículos).
      </p>
      <table class="data-table">
        <thead>
          <tr><th>Nombre de la piscina</th><th>Cantidad</th><th>Origen y cobro</th><th>Miembros con nombre (opcional)</th><th></th></tr>
        </thead>
        <tbody class="filas-pool">
          ${pools.map((p) => this._filaPool(p)).join('')}
        </tbody>
      </table>
      <p class="hint">
        Los nombres deben ser <strong>únicos</strong> y las cantidades enteros ≥ 1.
        Después podrás asignarlas en la pestaña <strong>Tareas</strong>.
      </p>
      <p class="hint">
        <strong>Propia o proveedor</strong>: a tu personal le pagas <em>las horas</em> (tarifa de la persona, o la
        de planta si no la declaras). A un <strong>proveedor</strong> le puedes pagar las horas o <strong>las
        piezas</strong>, y no es lo mismo: cobrando por pieza, el tiempo que tú pierdas esperando o arrancando
        <em>no te cuesta más</em>; cobrando por hora, sí. Al proveedor <strong>no le aplican las primas de la
        LFT</strong> (dominical, festivo, doble y triple) ni sus horas cuentan para tu tope semanal: eso es de tu
        plantilla, y el informe lo separa.
      </p>
      <p class="hint">
        <strong>Miembros</strong>: si los declaras, cada unidad pasa a ser <em>una persona concreta</em> con su
        tarifa, sus habilidades y su carga máxima. Entonces el informe puede decir <strong>quién</strong> trabajó,
        cuánto y qué movió, y una tarea cuya habilidad no tenga nadie <strong>se bloquea</strong>.
        La <strong>cantidad sigue mandando la capacidad</strong>: los nombres solo dan identidad.
        Sin miembros, todo se comporta como siempre.
      </p>
      <button class="btn-anadir-fila" type="button">+ Añadir piscina</button>
    `;

    const boton = this._body.querySelector('.btn-anadir-fila');
    if (boton) {
      domEvent.bind(boton, 'click', () => {
        const tbody = this._body.querySelector('.filas-pool');
        // insertAdjacentHTML y no domify(): un <tr> suelto no sobrevive al
        // parseo de un contenedor que no sea <table>/<tbody>.
        tbody.insertAdjacentHTML('beforeend', this._filaPool(null));
        // Solo la fila nueva: volver a enlazar todas duplicaria los manejadores
        // de las que ya estaban.
        this._bindCobroDeFila(tbody.lastElementChild);
      });
    }

    // Delegacion: un unico manejador en el tbody cubre las filas que se añadan
    // despues, y evita re-vincular los botones que ya existian. Cubre las dos
    // acciones: quitar una piscina y quitar un miembro.
    const tbody = this._body.querySelector('.filas-pool');
    if (tbody) {
      // Cambiar de propia a proveedor (o de hora a pieza) ensena u oculta sus
      // campos EN EL SITIO: sin esto, la unica forma de ver el campo de precio
      // seria guardar y reabrir, que es justo lo que el usuario no hace.
      this._bindCobro(tbody);

      domEvent.bind(tbody, 'click', (e) => {
        const objetivo = e.target;
        if (!objetivo || !objetivo.closest) return;

        const quitarMiembro = objetivo.closest('.btn-quitar-miembro');
        if (quitarMiembro) {
          const tr = quitarMiembro.closest('tr');
          if (tr) tr.remove();
          return;
        }

        const quitarPool = objetivo.closest('.btn-quitar-pool');
        if (quitarPool) {
          const tr = quitarPool.closest('tr');
          if (tr) tr.remove();
          return;
        }

        const anadir = objetivo.closest('.btn-anadir-miembro');
        if (anadir) {
          const lista = anadir.closest('td').querySelector('.filas-miembro');
          lista.insertAdjacentHTML('beforeend', this._filaMiembro(null));
        }
      });
    }
  }

  /**
   * Una fila de miembro con nombre.
   *
   * `habilidades` se escribe separadas por comas (una sola caja) en vez de una
   * lista aparte: en planta la gente tiene una o dos etiquetas, y una rejilla de
   * casillas por habilidad obligaria a conocer de antemano todas las del proceso.
   */
  _filaMiembro(m) {
    const hab = Array.isArray(m && m.habilidades) ? m.habilidades.join(', ') : '';
    const v = (x) => (x == null || x === '' ? '' : x);
    return `
      <tr class="fila-miembro">
        <td><input type="text" class="cell mini" data-miembro="nombre"
          value="${esc(v(m && m.nombre))}" placeholder="nombre"></td>
        <td><input type="number" step="any" min="0" class="cell mini" data-miembro="tarifaHora"
          value="${esc(v(m && m.tarifaHora))}" placeholder="$/h"></td>
        <td><input type="number" step="any" min="0" class="cell mini" data-miembro="cargaMaximaKg"
          value="${esc(v(m && m.cargaMaximaKg))}" placeholder="kg"></td>
        <td><input type="text" class="cell mini" data-miembro="habilidades"
          value="${esc(hab)}" placeholder="soldadura, pintura"></td>
        <td><button class="btn-quitar-miembro" type="button" title="Quitar este miembro" data-tip="Quitar esta fila">×</button></td>
      </tr>`;
  }

  /**
   * Enlaza los desplegables de origen y cobro de cada piscina.
   *
   * La visibilidad la decide el VALOR del desplegable, no lo que hubiera guardado:
   * asi el usuario ve lo que acaba de elegir aunque no haya guardado todavia, que
   * es lo unico que hace usable un formulario condicional.
   */
  _bindCobro(alcance) {
    (alcance || this._body).querySelectorAll('.filas-pool > tr')
      .forEach((tr) => this._bindCobroDeFila(tr));
  }

  _bindCobroDeFila(tr) {
    const origen = tr.querySelector('[data-field="pool.origen"]');
    const cobro = tr.querySelector('[data-field="pool.cobro"]');
    const campos = tr.querySelector('.cobro-campos');
    const tarifa = tr.querySelector('.cobro-tarifa');
    const pieza = tr.querySelector('.cobro-pieza');
    if (!origen || !cobro) return;

    const sincronizar = () => {
      const esExterna = origen.value === 'externa';
      const porPieza = cobro.value === 'pieza';
      if (campos) campos.hidden = !esExterna;
      if (tarifa) tarifa.hidden = porPieza;
      if (pieza) pieza.hidden = !porPieza;
    };

    domEvent.bind(origen, 'change', sincronizar);
    domEvent.bind(cobro, 'change', sincronizar);
    sincronizar();
  }

  _filaPool(p) {
    const nombre = p && p.name;
    const cantidad = p && p.quantity;
    const miembros = (p && Array.isArray(p.members) ? p.members : []);
    const valor = cantidad == null || cantidad === '' ? 1 : cantidad;

    // ORIGEN Y COBRO. Solo se pintan los campos que aplican, pero se pintan
    // SIEMPRE en el DOM (ocultos) y no solo cuando toca: al cambiar el
    // desplegable hay que poder ensenar el campo sin re-renderizar la tabla, y
    // re-renderizar se llevaria por delante lo que se este escribiendo.
    const externa = (p && p.origen) === 'externa';
    const porPieza = (p && p.cobro) === 'pieza';
    const num = (v) => (v == null || v === '' ? '' : esc(v));

    return `
      <tr>
        <td><input type="text" class="cell" data-field="pool.name"
          value="${esc(nombre == null ? '' : nombre)}" placeholder="p. ej. Analistas"></td>
        <td><input type="number" step="1" min="1" class="cell mini" data-field="pool.quantity" value="${valor}"></td>
        <td class="celda-cobro">
          <select class="cell" data-field="pool.origen">
            <option value="propia" ${externa ? '' : 'selected'}>Propia (nómina)</option>
            <option value="externa" ${externa ? 'selected' : ''}>Proveedor externo</option>
          </select>
          <div class="cobro-campos" ${externa ? '' : 'hidden'}>
            <select class="cell" data-field="pool.cobro">
              <option value="hora" ${porPieza ? '' : 'selected'}>Me factura por hora</option>
              <option value="pieza" ${porPieza ? 'selected' : ''}>Me factura por pieza</option>
            </select>
            <div class="cobro-tarifa" ${porPieza ? 'hidden' : ''}>
              <input type="number" step="any" min="0" class="cell mini" data-field="pool.tarifaHora"
                value="${num(p && p.tarifaHora)}" placeholder="$/h">
              <span class="cobro-unidad">$/hora</span>
            </div>
            <div class="cobro-pieza" ${porPieza ? '' : 'hidden'}>
              <input type="number" step="any" min="0" class="cell mini" data-field="pool.precioPieza"
                value="${num(p && p.precioPieza)}" placeholder="$/pieza">
              <span class="cobro-unidad">$/pieza</span>
            </div>
          </div>
        </td>
        <td class="celda-miembros">
          <table class="tabla-miembros">
            <thead>
              <tr><th>Nombre</th><th>Tarifa $/h</th><th>Carga máx. kg</th><th>Habilidades</th><th></th></tr>
            </thead>
            <tbody class="filas-miembro">
              ${miembros.map((m) => this._filaMiembro(m)).join('')}
            </tbody>
          </table>
          <button class="btn-anadir-miembro" type="button">+ Añadir miembro</button>
        </td>
        <td><button class="btn-quitar-pool" type="button" title="Quitar esta piscina" data-tip="Quitar esta fila">×</button></td>
      </tr>`;
  }

  /**
   * Compuertas exclusivas con sus salidas, agrupadas.
   *
   * Agrupar es imprescindible porque el reparto se valida POR COMPUERTA: cada
   * compuerta reparte su propio 100 %.
   */
  _gruposDeFlujos() {
    const grupos = new Map();
    this._getFlows().forEach((el) => {
      const gw = el.source;
      if (!gw) return;
      if (!grupos.has(gw.id)) grupos.set(gw.id, { gateway: gw, flows: [] });
      grupos.get(gw.id).flows.push(el);
    });
    return grupos;
  }

  /** Una compuerta de una sola salida siempre se toma: su reparto no se lee. */
  _salidaUnica(gateway) {
    return Boolean(gateway) && (gateway.outgoing || []).length <= 1;
  }

  _renderFlows() {
    const grupos = this._gruposDeFlujos();

    if (!grupos.size) {
      this._body.innerHTML = '<p class="empty">No hay flujos salientes de compuertas exclusivas.</p>';
      return;
    }

    const filas = [];

    grupos.forEach(({ gateway, flows }) => {
      const unica = this._salidaUnica(gateway);

      flows.forEach((el, i) => {
        const primera = i === 0;
        const guardado = getSimulationData(el) || {};
        // Sin dato guardado se muestra el reparto que usaria el MOTOR
        // (1 / numero de salidas). Asi lo que se ve es lo que va a pasar.
        const p = typeof guardado.branchingProbability === 'number'
          ? guardado.branchingProbability
          : 1 / flows.length;

        const destino = el.target ? this._label(el.target) : '(sin destino)';

        filas.push(`
          <tr data-el-id="${el.id}" data-gw="${esc(gateway.id)}"${primera ? ' class="grupo-inicio"' : ''}>
            <td class="col-gw">${primera
              ? `<span class="gw-nombre" title="${esc(this._label(gateway))}">${esc(this._label(gateway))}</span>`
                + (unica
                  ? '<span class="suma ok" title="Esta compuerta solo tiene una salida: siempre se toma.">única salida · 100 %</span>'
                  : `<span class="suma" data-suma="${esc(gateway.id)}">—</span>`)
              : '<span class="continuacion" title="Otra salida de la compuerta de arriba">↳</span>'}</td>
            <td title="${esc(el.target ? this._label(el.target) : '')}">${esc(destino)}</td>
            <td><span class="pct">
              <input type="number" step="any" min="0" max="100" class="cell mini"
                data-field="branchingProbability" value="${unica ? '100' : pctATexto(p)}"
                ${unica ? 'disabled title="La compuerta tiene una sola salida: siempre se toma, su reparto es 100 %."' : ''}>
              <span class="pct-signo">%</span>
            </span></td>
          </tr>`);
      });
    });

    this._body.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-gw">Compuerta</th>
            <th>Hacia</th>
            <th>Reparto</th>
          </tr>
        </thead>
        <tbody>${filas.join('')}</tbody>
      </table>
      <p class="hint">
        El reparto se mide en <strong>%</strong> y debe <strong>sumar 100 en cada compuerta</strong>:
        el motor elige <em>exactamente una</em> salida por caso, así que no existe un porcentaje que
        «se pierda». Al cambiar una salida, <strong>el resto se ajusta solo</strong> para mantener el 100 %.
      </p>
      <p class="hint">
        Solo se configuran las compuertas <strong>exclusivas</strong>. En las demás (inclusivas, por
        evento) el motor toma siempre la primera salida, así que no hay reparto que ajustar.
      </p>
    `;

    this._bindReparto();
  }

  /** Conecta las casillas del reparto y pinta la suma inicial de cada compuerta. */
  _bindReparto() {
    this._body.querySelectorAll('[data-field="branchingProbability"]').forEach((input) => {
      if (input.disabled) return;

      domEvent.bind(input, 'input', () => {
        this._equilibrar(input);
        this._refrescarSumas();
      });

      // Al salir del campo se sanea el valor: vacio o ilegible -> 0, y fuera de
      // rango -> al limite. Sin esto el campo podia quedarse en -10 y el
      // indicador decia "100 %" (la suma los recortaba) mientras el guardado lo
      // bloqueaba: indicador y validacion se contradecian.
      domEvent.bind(input, 'change', () => {
        const crudo = String(input.value).replace(',', '.');
        const n = Number(crudo);
        if (crudo.trim() === '' || Number.isNaN(n)) input.value = '0';
        else if (n < 0) input.value = '0';
        else if (n > 100) input.value = '100';
        this._equilibrar(input);
        this._refrescarSumas();
      });
    });

    this._refrescarSumas();
  }

  /** Filas (salidas) de una compuerta, en el orden de la tabla. */
  _filasDeCompuerta(gwId) {
    return Array.from(this._body.querySelectorAll(`tr[data-gw="${selectorSeguro(gwId)}"]`));
  }

  _valorPct(fila) {
    const campo = fila && fila.querySelector('[data-field="branchingProbability"]');
    if (!campo) return 0;
    const n = Number(String(campo.value).replace(',', '.'));
    return Number.isNaN(n) ? 0 : n;
  }

  /**
   * Reparte el 100 % entre las salidas de la compuerta del campo editado.
   *
   * Es lo que hace intuitivo el panel: se escribe el porcentaje de UNA salida y
   * el resto se acomoda. La ULTIMA salida se calcula por RESTA para que la suma
   * sea exactamente 100.
   *
   * Si las demas salidas estaban todas iguales (incluido el caso de estar todas
   * a cero) se reparte a partes iguales. Eso ademas evita el feo 39,99 / 40,01:
   * el reparto proporcional de 33,33 y 33,34 da ese redondeo, mientras que a
   * partes iguales da 40 y 40.
   */
  _equilibrar(input) {
    const tr = input.closest('tr');
    if (!tr) return;

    const otras = this._filasDeCompuerta(tr.dataset.gw).filter((fila) => fila !== tr);
    if (!otras.length) return;

    const crudo = Number(String(input.value).replace(',', '.'));
    const propio = Number.isNaN(crudo) ? 0 : Math.min(100, Math.max(0, crudo));
    const restante = redondear2(100 - propio);

    const previos = otras.map((fila) => Math.max(0, this._valorPct(fila)));
    const totalPrevio = previos.reduce((a, b) => a + b, 0);
    const iguales = previos.every((v) => Math.abs(v - previos[0]) <= IGUALDAD_REPARTO_PCT);

    let asignado = 0;

    otras.forEach((fila, i) => {
      const campo = fila.querySelector('[data-field="branchingProbability"]');
      if (!campo) return;

      let valor;
      if (i === otras.length - 1) {
        valor = redondear2(restante - asignado); // absorbe el redondeo
      } else if (iguales) {
        valor = redondear2(restante / otras.length);
      } else {
        valor = redondear2(restante * (previos[i] / totalPrevio));
      }

      if (valor < 0) valor = 0;
      campo.value = String(valor);
      asignado = redondear2(asignado + valor);
    });
  }

  /**
   * Actualiza el indicador de suma de cada compuerta.
   *
   * Solo informa: mantener el 100 % ya lo hace _equilibrar(). Sirve para que se
   * vea de un vistazo cuando la suma no da 100 (p. ej. tras importar un CSV o
   * abrir un BPMN editado a mano), y usa LA MISMA tolerancia que la validación
   * para que el color no contradiga a lo que se puede guardar.
   *
   * La suma NO recorta los valores: un -10 tiene que hacer bajar el total y
   * pintar el aviso en rojo, igual que lo rechazaria la validacion al guardar.
   */
  _refrescarSumas() {
    this._body.querySelectorAll('[data-suma]').forEach((chip) => {
      const filas = this._filasDeCompuerta(chip.dataset.suma);
      const suma = redondear2(filas.reduce((acc, fila) => acc + this._valorPct(fila), 0));
      const cuadra = Math.abs(suma - 100) <= TOLERANCIA_REPARTO_PCT;

      chip.textContent = `${suma} %`;
      chip.className = 'suma ' + (cuadra ? 'ok' : 'mal');
      chip.title = cuadra
        ? 'Las salidas de esta compuerta suman 100 %.'
        : `Las salidas de esta compuerta suman ${suma} %: deben sumar 100 %.`;
    });
  }

  _renderGlobal() {
    const info = this._globalData();

    if (!info) {
      // Hueco que tenia la tabla: la pestaña Global solo EDITABA un evento raiz
      // que ya existiera, pero no habia forma de crearlo desde aqui. El usuario
      // rellenaba las tareas, guardaba, y al simular recibia "No root start
      // event found" sin saber que le faltaba. Ahora se puede crear desde aqui.
      const inicios = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:StartEvent'));

      if (!inicios.length) {
        this._body.innerHTML = `
          <p class="empty">
            El diagrama no tiene ningún <strong>evento de inicio</strong>.<br>
            Añade uno al diagrama para poder configurar la simulación.
          </p>`;
        return;
      }

      this._body.innerHTML = `
        <p class="empty">
          Ningún evento de inicio está marcado como <strong>configuración raíz</strong>.<br>
          Sin él la simulación no se ejecuta: no hay jornada, ni tarifa, ni número de instancias.
        </p>
        <div class="raices">
          ${inicios.map((el) => `
            <button class="btn-raiz" data-el-id="${el.id}">
              Usar <strong>${esc(this._label(el))}</strong> como configuración raíz
            </button>`).join('')}
        </div>
        <p class="hint">
          Se crearán los valores por defecto: 1000 instancias, <strong>una llegada por minuto</strong>
          (tasa 1 por <code>minute</code>), jornada 09:00-17:00 de lunes a viernes y 50 por hora.
          Podrás ajustarlos aquí mismo.
        </p>
      `;

      this._body.querySelectorAll('.btn-raiz').forEach((btn) => {
        domEvent.bind(btn, 'click', () => this.marcarRaiz(btn.dataset.elId));
      });
      return;
    }

    const { element, data } = info;

    const cell = (field) => {
      const value = getByPath(data, field.path);

      if (field.kind === 'select') {
        return `<select class="cell" data-field="${field.key}">${field.options
          .map((o) => `<option value="${o}" ${value === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
      }
      // Dias laborables con CASILLAS, no texto libre: era una regresion respecto
      // al editor elemento a elemento. Un "1,2,3,4,5" escrito a mano puede
      // quedar invalido por una errata sin que nada avise; con casillas no hay
      // forma de equivocarse. El CSV los sigue tratando como lista de numeros.
      if (field.kind === 'days') {
        const activos = Array.isArray(value) ? value : [];
        return `<span class="dias">${DIAS.map((nombre, i) =>
          `<label><input type="checkbox" data-days="${field.key}" value="${i}"`
          + `${activos.includes(i) ? ' checked' : ''}> ${nombre}</label>`
        ).join('')}</span>`;
      }
      // Casilla booleana (los interruptores de la curva de arranque).
      if (field.kind === 'checkbox') {
        return `<label class="casilla"><input type="checkbox" data-field="${field.key}"`
          + `${value === false ? '' : ' checked'}> activado</label>`;
      }
      // Selector de hora nativo: mismo motivo, y evita el formato invalido.
      if (field.kind === 'time') {
        const text = value && typeof value === 'object' ? `${pad(value.hour)}:${pad(value.minute)}` : '';
        return `<input type="time" class="cell" data-field="${field.key}" value="${esc(text)}">`;
      }
      return `<input type="text" class="cell" data-field="${field.key}" value="${esc(value == null ? '' : value)}">`;
    };

    // Cada familia es una SECCION con su titulo, sus campos y SU tabla. Las listas
    // viajaban todas al final de la pestaña, lejos de los valores que gobiernan: la
    // jornada arriba y sus descansos veinte filas mas abajo. Eso es lo que hacia que
    // la pestaña pareciera revuelta.
    const seccion = (s) => `
      <h4 class="subtitulo">${esc(s.titulo)}</h4>
      <table class="data-table">
        <thead>
          <tr><th class="col-campo">Campo</th><th>Valor</th></tr>
        </thead>
        <tbody>
          ${s.campos.map((f) => `
            <tr data-el-id="${element.id}">
              <td class="col-campo" title="${esc(f.key)}">
                <span class="campo-nombre">${esc(f.label)}</span>${f.ayuda
                  ? ` <button class="btn-ayuda-campo" type="button" data-ayuda="${esc(f.key)}"
                       title="Qué valor espera este campo">?</button>` : ''}
                ${f.ayuda ? `<div class="ayuda-campo hidden" data-ayuda-de="${esc(f.key)}">${f.ayuda}</div>` : ''}
              </td>
              <td>${cell(f)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      ${s.nota ? `<p class="hint">${s.nota}</p>` : ''}
      ${s.lista ? this._listaDeSeccion(s.lista, data) : ''}
    `;

    this._body.innerHTML = `
      <p class="hint">Configuración global del evento raíz: <strong>${esc(this._label(element))}</strong> (${esc(element.id)})</p>
      ${GLOBAL_SECCIONES.map(seccion).join('')}
    `;

    this._bindGlobalExtras();
  }

  /**
   * La tabla propia de una familia, dibujada DENTRO de su seccion.
   *
   * Las cuatro (descansos, curva, tamaño empirico y vigencias) vivian al final de la
   * pestaña, cada una en su bloque, separadas de los campos que gobiernan. Ahora cada
   * una va pegada a los suyos.
   *
   * Se devuelve HTML y no se manipula el DOM porque el llamador lo mete en un
   * `innerHTML` completo: crear nodos sueltos obligaria a insertarlos despues.
   */
  _listaDeSeccion(nombre, data) {
    if (nombre === 'descansos') {
      return `
        <p class="hint">
          Un descanso <strong>parte la jornada en tramos</strong>: la tarea que lo pilla a medias
          se pausa y se retoma al volver. Un descanso <strong>nunca es tiempo productivo</strong> (baja la
          capacidad y sube ρ), y sus dos casillas dicen dos cosas distintas:
          <em>¿cuenta como jornada?</em> afecta al umbral de horas extra (la ley lo exige cuando
          <strong>no</strong> se puede salir del centro), y <em>¿también en horas extra?</em> decide si el
          descanso se toma cuando la jornada se alarga.
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Desde</th><th>Hasta</th>
              <th>¿Cuenta como jornada?</th><th>¿También en horas extra?</th><th></th>
            </tr>
          </thead>
          <tbody class="filas-descanso">
            ${(data.calendar && Array.isArray(data.calendar.breaks) ? data.calendar.breaks : [])
              .map((b) => this._filaDescanso(b)).join('')}
          </tbody>
        </table>
        <button class="btn-anadir-fila" type="button" data-accion="anadir-descanso">+ Añadir descanso</button>
      `;
    }

    if (nombre === 'curva') {
      return `
        <div class="caja-curva">${this._svgArranque(data.warmup)}</div>
        <p class="hint" data-resumen-arranque>${esc(describeWarmup(data.warmup))}</p>
      `;
    }

    if (nombre === 'loteEmpirico') {
      return `
        <p class="hint">
          Solo se usa con el modo <strong>empirical</strong>: una tabla de tamaños con sus frecuencias,
          que es como llegan los pedidos de verdad («de 10, el 30 % de las veces; de 20, el 50 %…»).
          El <em>peso</em> es una frecuencia relativa: no hace falta que sume 100.
        </p>
        <table class="data-table">
          <thead><tr><th>Tamaño del lote</th><th>Peso (frecuencia)</th><th></th></tr></thead>
          <tbody class="filas-lote">
            ${((data.lots && data.lots.table) || []).map((f) => this._filaLote(f)).join('')}
          </tbody>
        </table>
        <button class="btn-anadir-fila" type="button" data-accion="anadir-lote">+ Añadir tamaño</button>
      `;
    }

    if (nombre === 'vigencias') {
      return `
        <p class="hint">
          Aquí se declara <strong>desde cuándo rige cada regla</strong>, y no un número en una casilla.
          La diferencia importa: si el cupo semanal de horas extra se guardara suelto y mañana cambiara la
          ley, <em>todos</em> los informes ya emitidos se recalcularían con la ley nueva y dejarían de ser
          auditables. Con vigencias, se <strong>añade una fila</strong> y cada corrida guarda qué versión
          usó. Deja la tabla vacía para usar los valores de arriba tal cual.
        </p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Desde</th><th>Cupo semanal (h)</th><th>Prima doble (×)</th><th>Prima triple (×)</th>
              <th>Tope al día (h)</th><th>Días/semana</th><th>Dominical (%)</th><th>Festivo (%)</th><th></th>
            </tr>
          </thead>
          <tbody class="filas-regla">
            ${((data.labor && data.labor.rules) || []).map((r) => this._filaRegla(r)).join('')}
          </tbody>
        </table>
        <button class="btn-anadir-fila" type="button" data-accion="anadir-regla">+ Añadir vigencia</button>
        <p class="hint">
          Una celda vacía significa <strong>«lo que digan los valores de arriba»</strong>: así solo hay que
          rellenar lo que cambia. Se resuelven por la <strong>fecha de arranque</strong> de la simulación, no
          por la de hoy, y si ninguna rige todavía se usa lo de arriba y el informe lo dice.
        </p>
      `;
    }

    return '';
  }

  /** Una fila de la tabla de vigencias de las reglas laborales. */
  _filaRegla(r) {
    const v = (campo, paso) => {
      const valor = r && r[campo] != null && r[campo] !== '' ? r[campo] : '';
      return `<td><input type="number" step="${paso}" min="0" class="cell mini" data-regla="${campo}"
        value="${valor}" placeholder="—"></td>`;
    };
    return `
      <tr>
        <td><input type="date" class="cell" data-regla="desde"
          value="${esc(r && r.desde ? r.desde : '')}"></td>
        ${v('limitHours', 'any')}
        ${v('payMultiplier', '0.1')}
        ${v('excessPayMultiplier', '0.1')}
        ${v('dailyOvertimeLimitHours', 'any')}
        ${v('maxOvertimeDaysPerWeek', '1')}
        ${v('sundayPremiumPercent', 'any')}
        ${v('holidayPremiumPercent', 'any')}
        <td><button class="btn-quitar-pool" type="button" title="Quitar esta vigencia" data-tip="Quitar esta fila">×</button></td>
      </tr>`;
  }

  /** Una fila de la tabla de tamaños de lote empíricos. */
  _filaLote(f) {
    return `
      <tr>
        <td><input type="number" step="1" min="1" class="cell mini" data-lote="size"
          value="${f && f.size != null ? f.size : ''}" placeholder="20"></td>
        <td><input type="number" step="any" min="0" class="cell mini" data-lote="weight"
          value="${f && f.weight != null ? f.weight : ''}" placeholder="1"></td>
        <td><button class="btn-quitar-pool" type="button" title="Quitar este tamaño" data-tip="Quitar esta fila">×</button></td>
      </tr>`;
  }

  /**
   * Una fila del editor de descansos.
   *
   * `existeEnExtra` va marcado por defecto: lo normal es que el descanso se tome
   * tambien cuando la jornada se alarga, y desmarcarlo es la excepcion.
   */
  _filaDescanso(b) {
    const hora = (t) => (t && Number.isFinite(t.hour) ? `${pad(t.hour)}:${pad(t.minute)}` : '');
    return `
      <tr>
        <td><input type="time" class="cell" data-descanso="start" value="${esc(hora(b && b.start))}"></td>
        <td><input type="time" class="cell" data-descanso="end" value="${esc(hora(b && b.end))}"></td>
        <td class="centro"><input type="checkbox" data-descanso="cuentaComoJornada"
          ${b && b.cuentaComoJornada ? 'checked' : ''}></td>
        <td class="centro"><input type="checkbox" data-descanso="existeEnExtra"
          ${!(b && b.existeEnExtra === false) ? 'checked' : ''}></td>
        <td><button class="btn-quitar-pool" type="button" title="Quitar este descanso" data-tip="Quitar esta fila">×</button></td>
      </tr>`;
  }

  /**
   * Dibuja la curva de arranque declarada. SVG en linea: no necesita ninguna
   * libreria de graficos y se imprime igual de bien que en pantalla.
   */
  _svgArranque(cfg) {
    const ancho = 320;
    const alto = 110;
    const margen = 10;
    const puntos = curvePoints(cfg, undefined, 40);
    const tMax = Math.max(1, puntos[puntos.length - 1].t);

    const x = (t) => margen + (t / tMax) * (ancho - margen * 2);
    const y = (e) => alto - margen - e * (alto - margen * 2);
    const trazo = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.efficiency).toFixed(1)}`).join(' ');

    return `
      <svg viewBox="0 0 ${ancho} ${alto}" class="curva-arranque" role="img"
           aria-label="Curva de arranque declarada">
        <line x1="${margen}" y1="${alto - margen}" x2="${ancho - margen}" y2="${alto - margen}" class="eje"></line>
        <line x1="${margen}" y1="${margen}" x2="${margen}" y2="${alto - margen}" class="eje"></line>
        <line x1="${margen}" y1="${y(1)}" x2="${ancho - margen}" y2="${y(1)}" class="referencia"></line>
        <path d="${trazo}" class="linea"></path>
        <text x="${ancho - margen}" y="${y(1) - 3}" text-anchor="end" class="rotulo">100 %</text>
        <text x="${margen + 2}" y="${alto - margen - 2}" class="rotulo">0 min</text>
        <text x="${ancho - margen}" y="${alto - margen - 2}" text-anchor="end" class="rotulo">${Math.round(tMax)} min</text>
      </svg>`;
  }

  /** Lee la curva de arranque del DOM (para la vista previa en vivo). */
  _leerArranqueDelDom() {
    const valor = (clave) => {
      const campo = this._body.querySelector(`[data-field="${clave}"]`);
      return campo ? campo.value : undefined;
    };
    const marcado = (clave) => {
      const campo = this._body.querySelector(`[data-field="${clave}"]`);
      return campo ? campo.checked : false;
    };

    return {
      shape: valor('warmup.shape') || 'none',
      initialEfficiency: Number(String(valor('warmup.initialEfficiency')).replace(',', '.')),
      recoveryMinutes: Number(String(valor('warmup.recoveryMinutes')).replace(',', '.')),
      onShiftStart: marcado('warmup.onShiftStart'),
      onBreakReturn: marcado('warmup.onBreakReturn')
    };
  }

  /** Redibuja la curva con lo que hay AHORA en pantalla, aunque no se haya guardado. */
  _refrescarCurvaArranque() {
    const caja = this._body.querySelector('.caja-curva');
    if (caja) caja.innerHTML = this._svgArranque(this._leerArranqueDelDom());

    const resumen = this._body.querySelector('[data-resumen-arranque]');
    if (resumen) resumen.textContent = describeWarmup(this._leerArranqueDelDom());
  }

  /** Conecta las listas de la pestaña Global y la vista previa de la curva. */
  _bindGlobalExtras() {
    // Las tres listas (descansos, tamaños de lote y vigencias de las reglas
    // laborales) usan el mismo patrón: un botón para añadir y delegación en el
    // cuerpo para quitar.
    const listas = [
      { accion: 'anadir-descanso', tbody: '.filas-descanso', fila: () => this._filaDescanso(null) },
      { accion: 'anadir-lote', tbody: '.filas-lote', fila: () => this._filaLote(null) },
      { accion: 'anadir-regla', tbody: '.filas-regla', fila: () => this._filaRegla(null) }
    ];

    listas.forEach(({ accion, tbody, fila }) => {
      const boton = this._body.querySelector(`[data-accion="${accion}"]`);
      if (boton) {
        domEvent.bind(boton, 'click', () => {
          const cuerpo = this._body.querySelector(tbody);
          // insertAdjacentHTML y no domify(): un <tr> suelto no sobrevive al
          // parseo de un contenedor que no sea <table>/<tbody>.
          if (cuerpo) cuerpo.insertAdjacentHTML('beforeend', fila());
        });
      }

      const cuerpo = this._body.querySelector(tbody);
      if (cuerpo) {
        domEvent.bind(cuerpo, 'click', (e) => {
          const btn = e.target.closest ? e.target.closest('.btn-quitar-pool') : null;
          if (!btn) return;
          const tr = btn.closest('tr');
          if (tr) tr.remove();
        });
      }
    });

    GLOBAL_FIELDS.forEach((f) => {
      if (!f.key.startsWith('warmup.')) return;
      const campo = this._body.querySelector(`[data-field="${f.key}"]`);
      if (!campo) return;
      domEvent.bind(campo, 'input', () => this._refrescarCurvaArranque());
      domEvent.bind(campo, 'change', () => this._refrescarCurvaArranque());
    });

    this._bindAyudaPorCampo(this._body);
  }

  /**
   * El boton «?» que va al lado de cada campo.
   *
   * Al lado y no un texto fijo: con 30 campos, un parrafo por campo llena la pantalla y se acaba
   * ignorando. Se pulsa en el momento de la duda, que es cuando se lee. El texto sale del propio
   * campo (`f.ayuda`) y no de una lista aparte, asi que una ayuda no puede quedar desincronizada de
   * su campo.
   */
  _bindAyudaPorCampo(alcance) {
    enlazarAyudaPorCampo(alcance);
  }

  // -- guardar --------------------------------------------------------------

  /** Un numero de una casilla. Delega en `validacion.js`: la formula vive en un solo sitio. */
  _num(raw, label) {
    return numero(raw, label);
  }

  /** La lectura de una fila de tareas vive en `validacion.js`. Se deja el nombre por el autoguardado. */
  _datosDeFila(tr) {
    return datosDeFilaDeTarea(tr, {
      getElement: (id) => this._elementRegistry.get(id),
      label: (el) => this._label(el),
      taskData: (el) => this._taskData(el),
      getPools: () => this._getPools()
    });
  }

  /**
   * Reune los cambios de la pestaña activa. Lanza Error con el primer problema
   * encontrado para no escribir datos a medias.
   *
   * La lectura y la validacion viven en `validacion.js`: aqui solo se le pasa el contenedor y las
   * funciones que saben de bpmn-js. Se delega asi porque «que dice cada casilla» y «que hay que
   * rechazar» es la parte que hay que poder probar sin montar el panel entero, y es la que produce
   * los mensajes que el usuario lee al pulsar Guardar.
   */
  _collect() {
    const ctx = {
      getElement: (id) => this._elementRegistry.get(id),
      label: (el) => this._label(el),
      taskData: (el) => this._taskData(el),
      flowData: (el) => this._flowData(el),
      getPools: () => this._getPools(),
      processRoot: () => this._getProcessRoot(),
      procesoData: () => getSimulationData(this._getProcessRoot()) || {},
      globalData: () => this._globalData(),
      salidaUnica: (gw) => this._salidaUnica(gw),
      valorPct: (tr) => this._valorPct(tr),
      toleranciaReparto: () => TOLERANCIA_REPARTO_PCT
    };
    const ayudas = {
      globalFields: GLOBAL_FIELDS,
      laborRuleFields: CAMPOS_DE_REGLA,
      setByPath,
      getByPath,
      pad
    };

    if (this._activeTab === 'tasks') {
      const writes = [];
      this._body.querySelectorAll('tbody tr[data-el-id]').forEach((tr) => {
        const fila = datosDeFilaDeTarea(tr, ctx);
        if (fila) writes.push(fila);
      });
      return writes;
    }

    if (this._activeTab === 'resources') return datosDeRecursos(this._body, ctx);
    if (this._activeTab === 'flows') return datosDeFlujos(this._body, ctx);
    return datosGlobales(this._body, ctx, ayudas);
  }

  /**
   * Rellena la pestaña activa con datos de prueba.
   *
   * Escribe en las CELDAS, no en el diagrama: los valores quedan a la vista, se corrigen a mano y
   * solo entran al pulsar «Guardar todo». Un clic accidental no cuesta nada.
   *
   * La logica vive en `DatosDePrueba.js` porque tiene dos trampas que no dan error sino un escenario
   * equivocado: el reparto de una compuerta tiene que sumar 100 % exacto -el motor acumula y manda el
   * sobrante a la ultima rama-, y la distribucion se fuerza a «fixed» -con «triangular» el motor
   * ignoraria el tiempo generado-. Aqui solo se compone el aviso.
   */
  generarDatosDePrueba() {
    const r = generarDatosDePrueba(this._body, {
      tab: this._activeTab,
      pools: () => this._getPools(),
      getElement: (id) => this._elementRegistry.get(id),
      refrescarSumas: () => this._refrescarSumas()
    });

    if (!r.aplica) {
      this._setStatus(r.motivo, 'info');
      return;
    }

    if (this._activeTab === 'tasks') {
      const extra = r.pool
        ? ` Asignadas a la piscina «${r.pool}» (x1) para que se simule la espera por recursos.`
        : '';
      this._setStatus(
        `${r.filas} tarea(s) rellenadas con datos de prueba.${extra} Revisa y pulsa «Guardar todo».`,
        'ok'
      );
      return;
    }

    this._setStatus(
      `${r.filas} flujo(s) rellenados en ${r.compuertas} compuerta(s); cada una suma 100 %. `
      + 'Revisa y pulsa «Guardar todo».',
      'ok'
    );
  }

  /**
   * Marca un evento de inicio como configuracion raiz, creando los valores por
   * defecto. Se escribe de inmediato porque el resto del panel depende de que
   * exista la raiz (es lo que leen getRootStartEvent() y el motor).
   */
  marcarRaiz(elId) {
    const el = this._elementRegistry.get(elId);
    if (!el) return;

    try {
      setSimulationData(el, DEFAULT_GLOBAL(), { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
    } catch (err) {
      const soloLectura = /read-only/i.test(String(err && err.message));
      const texto = soloLectura
        ? 'No se pudo crear la configuración raíz: el diagrama está en solo lectura porque el modo '
          + 'Token Simulation está activo.'
        : `No se pudo crear la configuración raíz: ${err.message || err}`;

      this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });

      if (soloLectura) this._ofrecerDesactivarModo(texto, () => this.marcarRaiz(elId));
      else this._setStatus(texto, 'error');
      return;
    }

    this._notifications.showNotification({
      text: `«${this._label(el)}» es ahora la configuración raíz. Ya puedes simular.`,
      type: 'info',
      duration: 4000
    });
    this._render();
  }

  save() {
    let writes;
    try {
      writes = this._collect();
    } catch (err) {
      this._setStatus(err.message, 'error');
      this._notifications.showNotification({ text: `No se guardó nada. ${err.message}`, type: 'error', duration: 6000 });
      return;
    }

    // Solo se escriben los elementos cuyo contenido cambia de verdad: asi no se
    // generan comandos de edicion innecesarios ni ruido en el historial.
    const changed = writes.filter(({ element, data }) => {
      const before = JSON.stringify(getSimulationData(element) || {});
      const after = JSON.stringify(data);
      return before !== after;
    });

    if (!changed.length) {
      this._setStatus('Sin cambios que guardar.', 'info');
      return;
    }

    // El modo Token Simulation deja el diagrama en SOLO LECTURA: su feature
    // DisableModeling intercepta los metodos de modeling y lanza
    // "model is read-only" (DisableModeling.js:51). Se captura aqui para
    // explicar la causa en lugar de dejar un error criptico. Como el guardado
    // es elemento a elemento, se informa tambien de cuantos quedaron escritos:
    // un fallo a mitad deja el diagrama a medias.
    let escritos = 0;
    try {
      changed.forEach(({ element, data }) => {
        setSimulationData(element, data, { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
        escritos++;
      });
    } catch (err) {
      const soloLectura = /read-only/i.test(String(err && err.message));

      if (soloLectura) {
        // NO se re-renderiza: los valores que el usuario acaba de escribir siguen
        // en la tabla, y el reintento los vuelve a recoger tal cual.
        const texto = 'El diagrama está en solo lectura porque el modo Token Simulation está activo.'
          + (escritos ? ` Se guardaron ${escritos} de ${changed.length} elementos antes de fallar.` : '')
          + ' Se puede desactivar y reintentar sin perder lo escrito.';
        this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });
        this._ofrecerDesactivarModo(texto, () => this.save());
        return;
      }

      const texto = `No se pudieron guardar los datos: ${err.message || err}`;
      this._setStatus(texto, 'error');
      this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });
      this._render();
      return;
    }

    this._setStatus(`${changed.length} elemento(s) actualizado(s).`, 'ok');
    this._notifications.showNotification({
      text: `Datos de simulación guardados en ${changed.length} elemento(s).`,
      type: 'info',
      duration: 3000
    });
    this._render();
  }

  // -- CSV ------------------------------------------------------------------

  exportCsv() {
    try {
      // La ida y vuelta del CSV vive en `CsvTareas.js`. Aqui solo se le pasan las funciones que
      // saben de bpmn-js, para que ese modulo no tenga que conocerlo.
      const rows = filasDePestana(this._activeTab, this._contextoCsv());
      download(`simulacion-${NOMBRE_DE_PESTANA[this._activeTab] || this._activeTab}.csv`, toCsv(rows));
      this._setStatus(`CSV exportado (${rows.length - 1} fila(s)).`, 'ok');
    } catch (err) {
      this._setStatus(err.message, 'error');
    }
  }

  /**
   * Las funciones que necesita `CsvTareas.js` para leer y escribir sin conocer bpmn-js.
   *
   * Se pasa un objeto explícito y no `this`: asi el módulo no puede llamar a nada del panel que no
   * esté declarado aquí, y se ve de un vistazo qué depende del diagrama y qué no.
   */
  _contextoCsv() {
    return {
      getTasks: () => this._getTasks(),
      getFlows: () => this._getFlows(),
      getPools: () => this._getPools(),
      getElement: (id) => this._elementRegistry.get(id),
      label: (el) => this._label(el),
      taskData: (el) => this._taskData(el),
      flowData: (el) => this._flowData(el),
      globalData: () => this._globalData(),
      salidaUnica: (gw) => this._salidaUnica(gw),
      num: (raw, label, row) => this._num(raw, label, row),
      globalFields: GLOBAL_FIELDS,
      laborRuleFields: CAMPOS_DE_REGLA
    };
  }

  importCsv(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      let updates;
      try {
        updates = importarCsv(this._activeTab, text, this._contextoCsv());
      } catch (err) {
        this._setStatus(err.message, 'error');
        this._notifications.showNotification({ text: `Importación cancelada. ${err.message}`, type: 'error', duration: 8000 });
        return;
      }

      const changed = updates.filter(({ element, data }) => JSON.stringify(getSimulationData(element) || {}) !== JSON.stringify(data));

      // Mismo tratamiento que en save(): la importacion tambien escribe en el
      // diagrama y tambien choca con el modo de solo lectura. Aqui si se
      // re-renderiza tras desactivar, porque el CSV es la fuente de verdad.
      try {
        changed.forEach(({ element, data }) => {
          setSimulationData(element, data, { modeling: this._modeling, bpmnFactory: this._bpmnFactory });
        });
      } catch (err) {
        const soloLectura = /read-only/i.test(String(err && err.message));
        const texto = soloLectura
          ? 'No se pudo importar: el diagrama está en solo lectura porque el modo Token Simulation está activo.'
          : `No se pudo importar el CSV: ${err.message || err}`;

        this._notifications.showNotification({ text: texto, type: 'error', duration: 10000 });

        if (soloLectura) this._ofrecerDesactivarModo(texto, () => this.importCsv(event));
        else this._setStatus(texto, 'error');
        return;
      }

      this._setStatus(`Importado: ${changed.length} de ${updates.length} fila(s) con cambios.`, 'ok');
      this._notifications.showNotification({
        text: `CSV importado: ${changed.length} elemento(s) actualizado(s).`,
        type: 'info',
        duration: 4000
      });
      this._render();
    };
    reader.readAsText(file, 'utf-8');
  }
}

DataTablePanel.$inject = [
  'canvas',
  'eventBus',
  'elementRegistry',
  'modeling',
  'bpmnFactory',
  'notifications',
  'editorActions',
  'overlays',
  'selection'
];
