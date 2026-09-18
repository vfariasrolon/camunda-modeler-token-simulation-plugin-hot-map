import { domify, event as domEvent, classes as domClasses } from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, setSimulationData, isLabel } from './util';
import { WARMUP_SHAPES, WARMUP_DEFAULTS, curvePoints, describeWarmup } from './WarmupCurve';
import { TURNOS, LABOR_DEFAULTS } from './LaborRules';
import './data-table.css';

const PANEL_CLS = 'sim-data-table-panel';
const OPEN_CLS = 'open';
const TAB_ACTIVE_CLS = 'active';

// ---------------------------------------------------------------------------
// Ayuda por pestana.
//
// Cada pestana explica TRES cosas, y en este orden a proposito:
//   1. `campos`: que se declara aqui (para saber que se puede rellenar).
//   2. `mide`: que se puede MEDIR con esos datos (la pregunta real del analista).
//   3. `ojo`: la trampa que mas cara sale si se ignora.
//
// Decir solo «que campos hay» no ayuda: el usuario no quiere la lista de campos,
// quiere saber para que le sirven. Por eso `mide` va antes que `ojo`, y `ojo`
// explica siempre la CONSECUENCIA, no la regla.
// ---------------------------------------------------------------------------
const AYUDA_PESTANA = {
  tasks: {
    titulo: 'Tareas: ritmo, calidad y carga física de cada paso',
    campos: [
      [ 'Distribución', 'fija (un valor) o triangular (mín/moda/máx). Decide qué columnas se leen.' ],
      [ 'Tiempo y unidad', 'la duración base. Con triangular, el campo «Tiempo» se IGNORA.' ],
      [ 'Tasa de fallo y retrabajo', 'probabilidad de fallo por ejecución y el tiempo que se añade al repetir.' ],
      [ 'Recurso y Cant.', 'la piscina que consume y cuántas unidades toma a la vez.' ],
      [ 'Frecuencia', 'por token (una vez por pieza) o por lote (una vez por lote).' ],
      [ 'Barrera', 'quien firma: probabilidad de atender, espera si no atiende, y tolerancia.' ],
      [ 'Carga física', 'masa cargada (la que soporta), masa arrastrada (la que desliza) y distancia.' ],
      [ 'Habilidad', 'la que exige la tarea (una etiqueta; varias, separadas por comas).' ]
    ],
    mide: [
      'Con tiempo y unidad: <strong>coste, tiempo de ciclo y sus percentiles</strong> (p50/p95).',
      'Añadiendo recurso: <strong>esperas en cola, utilización (ρ) y cuello de botella</strong>.',
      'Añadiendo fallo y retrabajo: <strong>calidad y su impacto en el ciclo</strong>.',
      'Con frecuencia y barrera: <strong>ciclo de lote, parones y esperas de firma</strong>.',
      'Con masa y distancia: <strong>toneladas movidas y kg·m</strong>, separando lo cargado de lo arrastrado.',
      'Con habilidad y piscinas con nombres: <strong>bloqueo por habilidad</strong> y quién podría absorber la tarea.'
    ],
    ojo: [
      'La <strong>unidad</strong> se escribe en plural (<code>minutes</code>): un <code>minute</code> se interpretaría como milisegundos, un factor de 60 000, y sin ningún aviso.',
      'La masa se aplica según la <strong>frecuencia</strong>: una tarea «por lote» mueve su peso <em>una vez por lote</em>. Si no fuera así, 12 kg por pieza en un lote de 20 darían 240 kg cuando en planta se hizo un solo viaje.',
      '<strong>Deja la carga vacía</strong> si no aplica. Un 0 dice «no mueve peso»; vacío dice «no lo sabemos», y el diagnóstico los distingue.'
    ]
  },
  flows: {
    titulo: 'Flujos: el reparto de cada compuerta',
    campos: [
      [ 'Probabilidad (%)', 'el reparto de las salidas de una compuerta <strong>exclusiva</strong>.' ]
    ],
    mide: [
      'La <strong>mezcla de caminos</strong>: cuántos casos van por cada rama, y con eso el volumen y el coste por camino.'
    ],
    ojo: [
      'El reparto de cada compuerta <strong>debe sumar 100 %</strong>: el motor acumula y manda todo el sobrante a la última rama sin avisar. El guardado lo bloquea.',
      'Al cambiar una salida, <strong>las demás se ajustan solas</strong> (a partes iguales si estaban iguales, en proporción si no).',
      'Una compuerta de <strong>una sola salida</strong> aparece fija al 100 %: el motor siempre la toma y no lee su probabilidad.'
    ]
  },
  resources: {
    titulo: 'Recursos: las piscinas de unidades equivalentes',
    campos: [
      [ 'Nombre', 'el de la piscina. Debe ser único.' ],
      [ 'Cantidad', 'cuántas unidades idénticas hay (personas, máquinas, vehículos).' ],
      [ 'Miembros (A5)', 'opcional: nombres con tarifa, habilidades y carga máxima dentro de la piscina.' ]
    ],
    mide: [
      'Con la cantidad: <strong>utilización (ρ), colas y cuello de botella</strong>, que es lo que dice si el plan cabe en la plantilla.',
      'Con miembros con nombre (A5): <strong>quién trabaja, cuánto tiempo y qué carga movió</strong>, más el <strong>bloqueo por habilidad</strong> y el diagnóstico de absorción.'
    ],
    ojo: [
      'La cantidad es <strong>capacidad</strong>: los miembros con nombre no la cambian, solo dan identidad y tarifa.',
      'Una tarea que apunta a una piscina que no existe <strong>ignora el recurso en silencio</strong>. Por eso la columna «Recurso» de Tareas es un desplegable y no texto libre.'
    ]
  },
  global: {
    titulo: 'Global: el reloj, el coste y las reglas',
    campos: [
      [ 'Tasa de llegada', 'llegadas por unidad de tiempo. Es una TASA, no un intervalo.' ],
      [ 'Tarifa y coste de espera', 'lo que cuesta la hora trabajada y la hora en cola.' ],
      [ 'Jornada, descansos y arranque', 'el reloj real: tramos, pausas y arranque lento.' ],
      [ 'Horas extra', 'el cupo semanal y sus multiplicadores (LFT arts. 66 y 68).' ],
      [ 'Lotes y semilla', 'llegadas en serie y reproducibilidad de la corrida.' ],
      [ 'Reglas laborales (A2)', 'turno, topes del art. 65, primas de domingo y festivo, y sus vigencias.' ]
    ],
    mide: [
      'Con la jornada y los descansos: <strong>capacidad real</strong>, sin inflarla (una jornada de 8 h no son 8 h de trabajo).',
      'Con el cupo y las primas: <strong>coste real con horas extra</strong> y su reparto doble/triple.',
      'Con las reglas laborales: <strong>cumplimiento de la LFT</strong> — cuántas semanas se pasaron del tope, y por cuánto.',
      'Con la semilla: <strong>reproducibilidad y comparación limpia</strong> entre planes (mismo azar para los dos).'
    ],
    ojo: [
      'La tasa de llegada es <strong>una tasa</strong>: <code>60</code> por <code>minute</code> es una llegada por <em>segundo</em>, no una cada 60 minutos.',
      'Sin <strong>evento raíz</strong> la simulación no arranca, aunque todo lo demás esté relleno.'
    ]
  }
};

// ---------------------------------------------------------------------------
// Unidades. NO unificar en una sola lista: el motor usa DOS convenciones
// distintas y confundirlas produce errores silenciosos.
//
//   - Tareas (processingTime / reworkTime): PLURAL -> lo lee
//     timeToMilliseconds() en SimulationEngine.js. Cualquier otro valor cae al
//     fallback y se interpreta como MILISEGUNDOS (factor 60.000 de error).
//   - arrivalRate: SINGULAR -> lo lee el bloque de arrivalRate en
//     SimulationEngine.js. Cualquier otro valor se trata como minutos.
// ---------------------------------------------------------------------------
const TASK_UNITS = ['minutes', 'hours', 'seconds'];
const RATE_UNITS = ['minute', 'hour', 'second'];
const LOT_SIZE_MODES = ['fixed', 'triangular', 'empirical'];
const TASK_FREQUENCIES = ['token', 'lot'];

// Nombres de los dias para las casillas de "dias laborables". El indice es el
// valor que espera el motor: 0 = domingo.
const DIAS = [ 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb' ];

// Cada cuanto se ejecuta una tarea y, si es por lote, quien tiene que firmarla.
// `token` = una vez por token (el comportamiento de siempre); `lot` = una sola
// vez por lote, la primera vez que el flujo pasa por ahi.
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
const AYUDA_COLUMNAS = {
  tarea: 'El nombre de la tarea en el diagrama. Es solo lectura: se cambia en el diagrama, no aqui.',
  distribucion: 'fija (un solo valor) o triangular (min/moda/max). Decide que columnas de tiempo se leen: con triangular, la columna «Tiempo» se IGNORA.',
  tiempo: 'La duracion base. Con distribucion «fija» es el valor unico; con triangular no se lee.',
  unidad: 'minutes, hours o seconds, siempre en PLURAL. Un «minute» en singular se interpretaria como milisegundos: un error de 60 000 veces y sin ningun aviso.',
  tiempoMin: 'Solo con triangular: el tiempo mas corto observado. Tiene que ser menor o igual que la moda.',
  tiempoModa: 'Solo con triangular: el tiempo MAS PROBABLE, no la media. Tiene que quedar entre el minimo y el maximo.',
  tiempoMax: 'Solo con triangular: el tiempo mas largo observado. Tiene que ser mayor o igual que la moda.',
  tasaFallo: 'Probabilidad de fallo por ejecucion, en PORCENTAJE: 5 significa que falla 5 de cada 100. El motor lo guarda como 0,05.',
  retrabajo: 'Lo que se tarda en rehacer una pieza que fallo. Se suma al tiempo de ciclo.',
  unidadRetrabajo: 'La unidad del retrabajo, en plural. Puede ser distinta de la del proceso.',
  recurso: 'La piscina que consume la tarea. Tiene que existir en la pestaña Recursos: un nombre que no exista hace que el recurso se ignore EN SILENCIO.',
  cant: 'Cuantas unidades de la piscina toma la tarea a la vez. Con 2, ocupa dos personas mientras dura.',
  frecuencia: 'por token (una vez por pieza) o por lote (una sola vez por lote). Decide si el tiempo y la carga se aplican por pieza o por lote.',
  barrera: 'Solo con «por lote»: quien firma el lote. disp. es la probabilidad de que atiendan; si no atienden, se espera una triangular min/moda/max; tol. es cuanto se tolera antes de marcarlo.',
  carga: 'Opcional. Cargada es la masa que SOPORTA la persona; arrastrada, la que desliza. Se aplican segun la frecuencia: por pieza o una vez por lote.',
  habilidad: 'La etiqueta que exige la tarea (por ejemplo soldadura). Si ningun miembro de la piscina la tiene, la tarea queda BLOQUEADA y el informe lo dice. Para varias, separadas por comas.'
};

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

const getByPath = (obj, path) => path.reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
const setByPath = (obj, path, value) => {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] == null || typeof cur[path[i]] !== 'object') cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
};

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
// CSV
// ---------------------------------------------------------------------------
const csvEscape = (value) => {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (rows) => rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');

// Parser tolerante: soporta comillas dobles escapadas, campos multilinea y
// separador coma o punto y coma (Excel en español exporta con ';').
const parseCsv = (text) => {
  const clean = text.replace(/^\uFEFF/, '');
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

const download = (filename, text) => {
  const blob = new Blob([ '\uFEFF' + text ], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

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

  close() {
    if (this._panel) domClasses(this._panel).remove(OPEN_CLS);
    this._focusId = null;
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
        // Los objetos anidados se mezclan uno a uno: con `...raw` a secas, un
        // modelo que solo tenga `labor.shiftType` perdería los demás valores por
        // defecto y las casillas saldrían vacías.
        labor: { ...d.labor, ...(raw.labor || {}) },
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
   * Ayuda de la pestana activa: campos, qué se mide con ellos y la trampa.
   *
   * Se redibuja en cada llamada porque el contenido depende de la PESTANA, y la
   * pestana puede haber cambiado desde la ultima vez. Se mantiene abierta/cerrada
   * con una clase para que el usuario no tenga que reabrirla al cambiar de tab.
   */
  _toggleAyuda() {
    if (!this._ayuda) return;
    const a = AYUDA_PESTANA[this._activeTab];
    if (!a) return;

    const listas = (items, clase) => `<ul class="${clase}">${items.map((i) => (
      Array.isArray(i) ? `<li><strong>${i[0]}</strong>: ${i[1]}</li>` : `<li>${i}</li>`
    )).join('')}</ul>`;

    this._ayuda.innerHTML = `
      <h4>${a.titulo}</h4>
      <div class="columnas">
        <div>
          <h5>Qué se declara aquí</h5>
          ${listas(a.campos, 'campos')}
        </div>
        <div>
          <h5>Qué se puede medir con estos datos</h5>
          ${listas(a.mide, 'mide')}
        </div>
      </div>
      <h5 class="ojo-titulo">Lo que hay que tener presente</h5>
      ${listas(a.ojo, 'ojo')}
    `;

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
            ${th('Cant.', 'cant')}
            ${th('Frecuencia', 'frecuencia')}
            ${th('Barrera (solo «por lote»): disp. · espera mín/moda/máx · tolerancia', 'barrera', ' colspan="5" class="col-barrera"')}
            ${th('Carga física (opcional): cargada kg · arrastrada kg · distancia m', 'carga', ' colspan="3" class="col-carga"')}
            ${th('Habilidad', 'habilidad')}
          </tr>
          <!-- Fila COMPARTIDA para la ayuda de columna. No se expande la celda de la
               cabecera: eso descuadraria el ancho de esa columna y moveria toda la
               tabla. Aqui el texto sale siempre en el mismo sitio y el ancho no cambia. -->
          <tr class="fila-ayuda-col hidden">
            <td colspan="22" class="ayuda-campo"></td>
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
                  <input type="number" step="any" min="0" max="100" class="cell"
                    data-field="failureRate" value="${pctATexto(d.failureRate)}">
                  <span class="pct-signo">%</span>
                </span></td>
                <td><input type="number" step="any" min="0" class="cell" data-field="reworkTime.value" value="${d.reworkTime.value}"></td>
                <td><select class="cell" data-field="reworkTime.unit">${units(d.reworkTime.unit)}</select></td>
                <td><select class="cell" data-field="resources.pool">${selectPool}</select></td>
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
                <td><input type="text" class="cell mini" data-field="habilidad"
                  value="${esc(habilidad)}" placeholder="p. ej. soldadura"></td>
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
  }

  /** Enlaza los «?» de la cabecera de Tareas con su ayuda. */
  _bindAyudaDeColumnas() {
    this._body.querySelectorAll('.btn-ayuda-col').forEach((btn) => {
      domEvent.bind(btn, 'click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        this._mostrarAyudaColumna(btn.dataset.ayudaCol);
      });
    });
  }

  /**
   * Pinta la ayuda de una columna en la fila compartida bajo la cabecera.
   *
   * Volver a pulsar el MISMO «?» la repliega, para que se pueda cerrar sin buscar otra
   * columna. Pulsar otro la cambia, que es lo que se espera al ir comparando columnas.
   */
  _mostrarAyudaColumna(clave) {
    const fila = this._body.querySelector('.fila-ayuda-col');
    if (!fila) return;

    const celda = fila.querySelector('td');
    const texto = AYUDA_COLUMNAS[clave] || '';
    const yaVisible = !domClasses(fila).has('hidden');

    if (yaVisible && celda.textContent === texto) {
      domClasses(fila).add('hidden');
      this._marcarAyudaColumna(null);
      return;
    }

    celda.textContent = texto;
    domClasses(fila).remove('hidden');
    this._marcarAyudaColumna(clave);
  }

  /** Deja marcado el «?» de la columna cuya ayuda esta a la vista. */
  _marcarAyudaColumna(clave) {
    this._body.querySelectorAll('.btn-ayuda-col').forEach((b) => {
      if (b.dataset.ayudaCol === clave) domClasses(b).add('activo');
      else domClasses(b).remove('activo');
    });
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
          <tr><th>Nombre de la piscina</th><th>Cantidad</th><th>Miembros con nombre (opcional)</th><th></th></tr>
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
      });
    }

    // Delegacion: un unico manejador en el tbody cubre las filas que se añadan
    // despues, y evita re-vincular los botones que ya existian. Cubre las dos
    // acciones: quitar una piscina y quitar un miembro.
    const tbody = this._body.querySelector('.filas-pool');
    if (tbody) {
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

  _filaPool(p) {
    const nombre = p && p.name;
    const cantidad = p && p.quantity;
    const miembros = (p && Array.isArray(p.members) ? p.members : []);
    const valor = cantidad == null || cantidad === '' ? 1 : cantidad;
    return `
      <tr>
        <td><input type="text" class="cell" data-field="pool.name"
          value="${esc(nombre == null ? '' : nombre)}" placeholder="p. ej. Analistas"></td>
        <td><input type="number" step="1" min="1" class="cell mini" data-field="pool.quantity" value="${valor}"></td>
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
   * POR QUE AL LADO DEL CAMPO Y NO UN TEXTO FIJO: con 30 campos, un parrafo por campo
   * llena la pantalla y se acaba ignorando. El «?» se pulsa en el momento de la duda,
   * que es exactamente cuando se lee. Y va con clic y no con `data-tip` (que es hover)
   * porque en un desplegable o en una casilla el hover no llega.
   *
   * El texto se saca del propio campo (`f.ayuda`), no de una lista aparte: anadir un
   * campo sin ayuda es posible, pero no puede quedar desincronizada una ayuda de su
   * campo.
   */
  _bindAyudaPorCampo(alcance) {
    alcance.querySelectorAll('.btn-ayuda-campo').forEach((btn) => {
      domEvent.bind(btn, 'click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const caja = alcance.querySelector(`[data-ayuda-de="${btn.dataset.ayuda}"]`);
        if (!caja) return;

        if (domClasses(caja).has('hidden')) {
          domClasses(caja).remove('hidden');
          domClasses(btn).add('activo');
        } else {
          domClasses(caja).add('hidden');
          domClasses(btn).remove('activo');
        }
      });
    });
  }

  // -- guardar --------------------------------------------------------------

  _num(raw, label, row) {
    const n = Number(String(raw).trim().replace(',', '.'));
    if (String(raw).trim() === '' || Number.isNaN(n)) {
      throw new Error(`${label}: valor no numérico («${raw}»)`);
    }
    return n;
  }

  /**
   * Reune los cambios de la pestaña activa. Lanza Error con el primer problema
   * encontrado para no escribir datos a medias.
   */
  _collect() {
    const writes = [];

    if (this._activeTab === 'tasks') {
      this._body.querySelectorAll('tbody tr[data-el-id]').forEach((tr) => {
        const el = this._elementRegistry.get(tr.dataset.elId);
        if (!el) return;

        const name = this._label(el);
        const val = (f) => {
          const input = tr.querySelector(`[data-field="${f}"]`);
          return input ? input.value : '';
        };
        const num = (f, etiqueta) => this._num(val(f), `${name} · ${etiqueta}`);

        const distribucion = val('processingTime.distribution') || 'fixed';
        const unit = val('processingTime.unit');
        const unitRetrabajo = val('reworkTime.unit');

        // La casilla esta en % (0-100) pero el motor guarda la FRACCION (0-1). La
        // conversion vive en el unico sitio que lee la casilla, para que no haya dos
        // verdades sobre que significa el numero que hay escrito.
        const failurePct = num('failureRate', 'tasa de fallo (%)');
        if (failurePct < 0 || failurePct > 100) {
          throw new Error(
            `${name}: la tasa de fallo debe estar entre 0 y 100 % (has puesto ${failurePct})`
          );
        }
        const failure = failurePct / 100;

        // El tiempo de proceso se lee SEGUN la distribucion elegida: con
        // triangular mandan min/moda/max y el campo "Tiempo" no se lee en
        // absoluto. Leer los dos seria peor que no leer ninguno: se guardaria
        // un valor que el motor va a ignorar.
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

        // Recurso: '(ninguno)' deja el campo vacio, que es lo que el motor lee
        // como "sin restriccion de recursos".
        const pool = val('resources.pool');
        const cantRaw = val('resources.quantityRequired');
        let recurso = null;
        if (pool) {
          const cantidad = cantRaw === '' ? 1 : this._num(cantRaw, `${name} · cantidad de recurso`);
          if (!(cantidad >= 1)) {
            throw new Error(`${name}: la cantidad de recurso debe ser un número mayor o igual que 1`);
          }
          if (!this._getPools().some((p) => p.name === pool)) {
            throw new Error(
              `${name}: la piscina «${pool}» no está dada de alta. Créala en la pestaña Recursos antes de asignarla.`
            );
          }
          recurso = { pool, quantityRequired: cantidad };
        }

        const current = this._taskData(el);
        const datos = {
          ...current,
          processingTime,
          // Se conserva la distribucion del retrabajo que hubiera: la tabla
          // todavia no la edita, y forzarla a "fixed" destruiria un triangular
          // configurado. Mismo error que tenia el modal del lapiz.
          reworkTime: { ...current.reworkTime, value: reworkValue, unit: unitRetrabajo },
          failureRate: failure
        };
        // delete y no null: el motor comprueba `data.resources && data.resources.pool`,
        // asi que un objeto con pool vacio pasaria el primer filtro. Ademas el
        // JSON no arrastra claves muertas.
        if (recurso) datos.resources = recurso;
        else delete datos.resources;

        // Frecuencia y barrera. `_taskData` devuelve los valores por defecto para
        // poder pintarlos, asi que hay que BORRARLOS del resultado: si no, cada
        // tarea guardada arrastraria un `frequency: "token"` y una barrera que
        // nunca se pidio, y el XML engordaria en cada guardado.
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

        // CARGA FISICA. Una casilla vacia se guarda como AUSENTE, no como 0: un 0
        // dice «esta tarea no mueve peso» y el vacio dice «no lo sabemos», y el
        // diagnostico de datos los distingue. Las claves vacias se OMITEN en vez de
        // guardarse como `null` (un JSON con nulls es mas dificil de leer a mano y
        // el motor los trataria igual, pero ensucia el XML).
        const cargaOpcional = (campo, etiqueta) => {
          const bruto = val(`carga.${campo}`);
          if (String(bruto).trim() === '') return undefined;
          const n = this._num(bruto, `${name} · ${etiqueta}`);
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

        // HABILIDAD exigida. Se admite una o varias separadas por comas, y se
        // guarda `habilidad` (singular) cuando es una sola porque es el caso
        // comun y asi el XML queda legible.
        const habilidadBruta = String(val('habilidad') == null ? '' : val('habilidad')).trim();
        delete datos.habilidad;
        delete datos.habilidades;
        if (habilidadBruta) {
          const lista = habilidadBruta.split(',').map((h) => h.trim()).filter(Boolean);
          if (lista.length === 1) datos.habilidad = lista[0];
          else if (lista.length > 1) datos.habilidades = lista;
        }

        writes.push({ element: el, data: datos });
      });
      return writes;
    }

    if (this._activeTab === 'resources') {
      const root = this._getProcessRoot();
      if (!root) throw new Error('El diagrama no tiene ningún proceso donde guardar los recursos');

      const pools = [];
      const vistos = new Set();

      // `.filas-pool > tr` y no `.filas-pool tr`: dentro de cada piscina hay una
      // tabla de MIEMBROS, cuyas filas tambien son `tr`. Sin el hijo directo, cada
      // miembro se leería como una piscina sin nombre.
      this._body.querySelectorAll('.filas-pool > tr').forEach((tr, i) => {
        const nombre = String(tr.querySelector('[data-field="pool.name"]').value || '').trim();
        const cantRaw = String(tr.querySelector('[data-field="pool.quantity"]').value || '').trim();

        // Fila totalmente vacia: se ignora en vez de dar error, para que la fila
        // que se acaba de añadir y no se ha rellenado no bloquee el guardado.
        if (nombre === '' && cantRaw === '') return;

        if (!nombre) throw new Error(`Piscina ${i + 1}: falta el nombre`);
        if (vistos.has(nombre)) throw new Error(`Piscina «${nombre}»: el nombre está repetido`);
        vistos.add(nombre);

        const cantidad = this._num(cantRaw, `Piscina «${nombre}» · cantidad`);
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
            const t = this._num(tarifa, `Piscina «${nombre}» · ${nombreM} · tarifa`);
            if (t < 0) throw new Error(`Piscina «${nombre}» · ${nombreM}: la tarifa no puede ser negativa`);
            miembro.tarifaHora = t;
          }
          if (cargaMax !== '') {
            const c = this._num(cargaMax, `Piscina «${nombre}» · ${nombreM} · carga máxima`);
            if (c < 0) throw new Error(`Piscina «${nombre}» · ${nombreM}: la carga máxima no puede ser negativa`);
            miembro.cargaMaximaKg = c;
          }
          if (habs !== '') {
            miembro.habilidades = habs.split(',').map((h) => h.trim()).filter(Boolean);
          }
          members.push(miembro);
        });

        const pool = { name: nombre, quantity: cantidad };
        // `members` solo se guarda si hay alguno: una lista vacia en el XML es
        // ruido, y el motor trata «sin miembros» y «lista vacia» igual.
        if (members.length) pool.members = members;
        pools.push(pool);
      });

      writes.push({
        element: root,
        data: { ...(getSimulationData(root) || {}), resourcePools: pools }
      });
      return writes;
    }

    if (this._activeTab === 'flows') {
      // Se agrupa por compuerta: el reparto se valida POR COMPUERTA, no fila a
      // fila, porque el motor elige exactamente una salida por caso. Validar
      // solo el rango 0-100 permitia guardar un reparto que sumaba 150 % y el
      // motor, que acumula, mandaba todo lo sobrante a la ultima rama.
      const porCompuerta = new Map();

      this._body.querySelectorAll('tbody tr[data-el-id]').forEach((tr) => {
        const el = this._elementRegistry.get(tr.dataset.elId);
        if (!el || !el.source) return;

        // Compuerta de una sola salida: el motor siempre la toma y no lee su
        // reparto, asi que ni se valida ni se escribe.
        if (this._salidaUnica(el.source)) return;

        const etiqueta = `${this._label(el.source)} → ${el.target ? this._label(el.target) : '?'}`;
        const pct = this._num(this._valorPct(tr), `${etiqueta} · reparto (%)`);
        if (pct < 0 || pct > 100) {
          throw new Error(`${etiqueta}: el reparto debe estar entre 0 y 100 % (has puesto ${pct})`);
        }

        const grupo = porCompuerta.get(el.source.id) || { gateway: el.source, filas: [] };
        grupo.filas.push({ el, pct });
        porCompuerta.set(el.source.id, grupo);
      });

      porCompuerta.forEach(({ gateway, filas }) => {
        const total = redondear2(filas.reduce((acc, f) => acc + f.pct, 0));
        if (Math.abs(total - 100) > TOLERANCIA_REPARTO_PCT) {
          throw new Error(
            `«${this._label(gateway)}»: el reparto de sus ${filas.length} salidas suma ${total} % `
            + 'y debe sumar 100 %'
          );
        }
        filas.forEach(({ el, pct }) => {
          writes.push({
            element: el,
            data: { ...this._flowData(el), branchingProbability: Math.round(pct * 100) / 10000 }
          });
        });
      });

      return writes;
    }

    const info = this._globalData();
    if (!info) throw new Error('No hay evento raíz configurado');

    const data = JSON.parse(JSON.stringify(info.data));

    // Se recorre la lista de campos en vez de los inputs del DOM: los dias son
    // VARIAS casillas por campo (una por dia), asi que no encajan en el patron
    // "un input por campo" que usan las demas pestañas.
    GLOBAL_FIELDS.forEach((field) => {
      if (field.kind === 'days') {
        const marcados = Array.from(this._body.querySelectorAll(`[data-days="${field.key}"]:checked`))
          .map((c) => Number(c.value));
        if (!marcados.length) {
          throw new Error(`${field.label}: marca al menos un día`);
        }
        setByPath(data, field.path, marcados.sort((a, b) => a - b));
        return;
      }

      const input = this._body.querySelector(`[data-field="${field.key}"]`);
      if (!input) return;
      const raw = input.value;

      if (field.kind === 'number') {
        // Campo opcional (la semilla): vacio es «no declarado», que el motor
        // interpreta como «sacarla al azar» y luego guardarla.
        if (field.optional && String(raw).trim() === '') {
          setByPath(data, field.path, '');
          return;
        }
        const n = this._num(raw, field.label);
        if (field.min != null && n < field.min) throw new Error(`${field.label}: debe ser ≥ ${field.min}`);
        if (field.max != null && n > field.max) throw new Error(`${field.label}: debe ser ≤ ${field.max}`);
        setByPath(data, field.path, n);
      } else if (field.kind === 'checkbox') {
        setByPath(data, field.path, Boolean(input.checked));
      } else if (field.kind === 'time') {
        // <input type="time"> ya entrega HH:MM, pero puede quedar vacio si el
        // usuario borra el campo, asi que se valida igualmente.
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

    // Coherencia del horario: si la entrada es posterior a la salida, el motor
    // no calcula nada util y el usuario no recibe ningun aviso.
    const entrada = getByPath(data, [ 'calendar', 'workingHours', 'start' ]);
    const salida = getByPath(data, [ 'calendar', 'workingHours', 'end' ]);
    if (entrada && salida && (entrada.hour * 60 + entrada.minute) >= (salida.hour * 60 + salida.minute)) {
      throw new Error('La hora de entrada debe ser anterior a la de salida');
    }

    // Descansos: es una LISTA, no un campo escalar, asi que se recoge aparte de
    // GLOBAL_FIELDS (mismo motivo que las piscinas de recursos).
    const descansos = [];
    const minutosDe = (t) => t.hour * 60 + t.minute;

    this._body.querySelectorAll('.filas-descanso tr').forEach((tr, i) => {
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
      // Un descanso FUERA de la jornada es casi siempre una errata, y el motor lo
      // ignoraria en silencio (no parte ningun tramo). Mejor decirlo.
      if (entrada && salida) {
        const dentroDeLaJornada = minutosDe(fin) > minutosDe(entrada) && minutosDe(inicio) < minutosDe(salida);
        if (!dentroDeLaJornada) {
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
    this._body.querySelectorAll('.filas-lote tr').forEach((tr, i) => {
      const leer = (campo) => {
        const el = tr.querySelector(`[data-lote="${campo}"]`);
        return el ? String(el.value).trim() : '';
      };
      const tam = leer('size');
      const peso = leer('weight');
      if (!tam && !peso) return; // fila vacia: se ignora

      const size = this._num(tam, `Tamaño de lote ${i + 1}: tamaño`);
      if (!Number.isInteger(size) || size < 1) {
        throw new Error(`Tamaño de lote ${i + 1}: debe ser un entero mayor o igual que 1`);
      }
      const weight = this._num(peso, `Tamaño de lote ${i + 1}: peso`);
      if (!(weight > 0)) throw new Error(`Tamaño de lote ${i + 1}: el peso debe ser mayor que 0`);

      tablaLotes.push({ size, weight });
    });
    setByPath(data, [ 'lots', 'table' ], tablaLotes);

    // Coherencia de los lotes: sin esto, el motor caeria en silencio al tamaño
    // fijo (empirical sin tabla) o recortaria la triangular sin avisar.
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
          throw new Error(`En el tamaño de lote triangular debe cumplirse mínimo ≤ moda ≤ máximo `
            + `(has puesto ${min}, ${moda}, ${max})`);
        }
      }
    }

    // Vigencias de las reglas laborales: otra lista. Una celda vacia significa
    // «lo que digan los valores de arriba», asi que solo se escribe lo declarado.
    const reglas = [];
    const vistosDesde = new Set();

    this._body.querySelectorAll('.filas-regla tr').forEach((tr, i) => {
      const leer = (campo) => {
        const el = tr.querySelector(`[data-regla="${campo}"]`);
        return el ? String(el.value).trim() : '';
      };
      const campos = [ 'limitHours', 'payMultiplier', 'excessPayMultiplier',
        'dailyOvertimeLimitHours', 'maxOvertimeDaysPerWeek', 'sundayPremiumPercent', 'holidayPremiumPercent' ];
      const desde = leer('desde');
      const algunValor = campos.some((c) => leer(c) !== '');

      // Fila totalmente vacia: se ignora, para que la recien anadida no bloquee.
      if (!desde && !algunValor) return;
      if (!desde) throw new Error(`Vigencia ${i + 1}: falta la fecha desde la que rige`);

      const m = desde.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) throw new Error(`Vigencia ${i + 1}: «${desde}» no es una fecha válida`);
      if (vistosDesde.has(desde)) throw new Error(`Vigencia ${desde}: hay dos filas con la misma fecha`);
      vistosDesde.add(desde);

      const regla = { desde };
      campos.forEach((c) => {
        const bruto = leer(c);
        if (bruto === '') return;
        const n = this._num(bruto, `Vigencia ${desde} · ${c}`);
        if (n < 0) throw new Error(`Vigencia ${desde}: ningún valor de la regla puede ser negativo`);
        regla[c] = n;
      });

      // El reparto doble/triple tiene que ser coherente: si la prima de exceso
      // fuera menor que la normal, el motor pagaria MENOS por trabajar mas.
      const normal = regla.payMultiplier != null ? regla.payMultiplier : getByPath(data, [ 'overtime', 'payMultiplier' ]);
      const exceso = regla.excessPayMultiplier != null ? regla.excessPayMultiplier : getByPath(data, [ 'overtime', 'excessPayMultiplier' ]);
      if (normal != null && exceso != null && exceso < normal) {
        throw new Error(`Vigencia ${desde}: la prima del exceso (${exceso}×) no puede ser menor que la normal (${normal}×)`);
      }

      reglas.push(regla);
    });
    setByPath(data, [ 'labor', 'rules' ], reglas);

    writes.push({ element: info.element, data });
    return writes;
  }

  /**
   * Rellena la pestaña activa con datos de prueba.
   *
   * IMPORTANTE: escribe en las CELDAS de la tabla, no en el diagrama. El boton
   * del menu de la aplicacion escribia directamente en el BPMN, sobrescribiendo
   * lo que hubiera sin posibilidad de revisarlo. Aqui los valores quedan a la
   * vista, se pueden corregir a mano y solo se aplican al pulsar "Guardar todo".
   * Ademas, como no se guarda nada, un clic accidental solo cuesta los cambios
   * que hubiera sin guardar en la tabla.
   *
   * Los rangos son deliberadamente amplios y siguen la convencion habitual en
   * simulacion de procesos: tiempo de proceso 5-45 min, fallo 1-30%, retrabajo
   * 5-30 min. Lo que importa es que se VEAN en la tabla y se puedan corregir.
   */
  generarDatosDePrueba() {
    if (this._activeTab === 'global' || this._activeTab === 'resources') {
      this._setStatus(
        'Los datos de prueba aplican a Tareas y Flujos. En Global y Recursos define tu propio escenario.',
        'info'
      );
      return;
    }

    // Solo las filas de la tabla principal: en Recursos hay subfilas de miembros
    // que no tienen `data-field`.
    const filas = Array.from(this._body.querySelectorAll('tbody tr[data-el-id]'));
    if (!filas.length) {
      this._setStatus('No hay filas que rellenar en esta pestaña.', 'info');
      return;
    }

    if (this._activeTab === 'tasks') {
      // Si hay piscinas dadas de alta, se asigna la primera a cada tarea con
      // cantidad 1. Es lo que hace que la simulacion EJERCITE el codigo de
      // recursos (cola, espera, costo de espera), que de otro modo nunca se
      // ejecuta porque nada escribia el campo `resources`.
      const pools = this._getPools();
      const primeraPool = pools.length ? pools[0].name : null;

      filas.forEach((tr) => {
        const poner = (campo, valor) => {
          const el = tr.querySelector(`[data-field="${campo}"]`);
          if (el) el.value = valor;
        };

        // La distribucion se fija a "fixed" para que el valor generado sea el
        // que se use: si quedara "triangular", el motor ignoraria el tiempo y
        // tomaria min/moda/max, y el usuario veria resultados que no cuadran con
        // lo que relleno el boton.
        poner('processingTime.distribution', 'fixed');
        poner('processingTime.value', this._azar(5, 45));
        poner('processingTime.unit', 'minutes');
        poner('failureRate', this._azar(1, 30));
        poner('reworkTime.value', this._azar(5, 30));
        poner('reworkTime.unit', 'minutes');

        // Carga de prueba: una tarea pesada y otra de arrastre, para que el
        // informe tenga algo que separar. Es lo que hace visible que las dos
        // series NO se suman.
        const tirando = Math.random() < 0.5;
        poner('carga.masaCargadaKg', tirando ? this._azar(5, 25) : '');
        poner('carga.masaArrastradaKg', tirando ? '' : this._azar(40, 200));
        poner('carga.distanciaM', this._azar(2, 20));

        const selPool = tr.querySelector('[data-field="resources.pool"]');
        if (selPool && primeraPool) {
          selPool.value = primeraPool;
          const cant = tr.querySelector('[data-field="resources.quantityRequired"]');
          if (cant) {
            cant.disabled = false;
            cant.value = 1;
          }
        }
      });

      const extra = primeraPool
        ? ` Asignadas a la piscina «${primeraPool}» (x1) para que se simule la espera por recursos.`
        : '';
      this._setStatus(
        `${filas.length} tarea(s) rellenadas con datos de prueba.${extra} Revisa y pulsa «Guardar todo».`,
        'ok'
      );
      return;
    }

    // Flujos: el reparto se reparte por COMPUERTA en porcentajes ENTEROS que
    // suman 100 exactos. Generarlos sueltos seria peor que no generarlos: el
    // motor acumula las probabilidades, asi que una suma distinta de 100 manda
    // todo el sobrante a la ultima rama, y una salida configurada al 30 % puede
    // acabar recibiendo el 70 %.
    const porCompuerta = new Map();
    filas.forEach((tr) => {
      const el = this._elementRegistry.get(tr.dataset.elId);
      if (!el || !el.source) return;
      const lista = porCompuerta.get(el.source.id) || [];
      lista.push(tr);
      porCompuerta.set(el.source.id, lista);
    });

    let compuertas = 0;

    porCompuerta.forEach((lista) => {
      // Solo las filas editables: una compuerta de una sola salida esta fija al
      // 100 % y no participa en el reparto.
      const campos = lista
        .map((tr) => tr.querySelector('[data-field="branchingProbability"]'))
        .filter((campo) => campo && !campo.disabled);
      if (!campos.length) return;
      compuertas++;

      let resto = 100;
      campos.forEach((campo, i) => {
        const restantes = campos.length - 1 - i;
        let p;

        if (restantes === 0) {
          p = resto; // el ultimo absorbe el resto: suma exacta
        } else {
          // Se reserva al menos 1 % para cada salida que queda, para no crear
          // ramas muertas (al 0 % nunca se toman).
          const tope = Math.max(1, resto - restantes);
          p = Math.min(tope, Math.max(1, Math.round(Math.random() * tope * 0.7)));
        }

        resto -= p;
        campo.value = String(p);
      });
    });

    this._refrescarSumas();

    this._setStatus(
      `${filas.length} flujo(s) rellenados en ${compuertas} compuerta(s); cada una suma 100 %. `
      + 'Revisa y pulsa «Guardar todo».',
      'ok'
    );
  }

  _azar(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

  _csvForActiveTab() {
    if (this._activeTab === 'tasks') {
      // Se exportan TAMBIEN las columnas de la triangular y las de recurso: antes
      // el CSV solo llevaba el tiempo fijo, asi que una tarea triangular salia
      // con `tiempo_proceso` vacio y sus min/moda/max se perdian de vista.
      // La tasa de fallo se exporta en % (0-100) y con la columna renombrada a
      // `tasa_fallo_pct`, igual que el reparto de las compuertas: es lo que se ve
      // en la tabla, y en Excel una columna rotulada «tasa_fallo» con 0,05 se lee
      // como si fuera medio por ciento. Un CSV exportado ANTES de este cambio trae
      // `tasa_fallo` en fraccion y se sigue importando (ver _applyCsv).
      const rows = [ [
        'id', 'nombre', 'distribucion',
        'tiempo_proceso', 'unidad_proceso', 'min', 'moda', 'max',
        'tasa_fallo_pct', 'retrabajo', 'unidad_retrabajo',
        'recurso', 'cant_recurso',
        'frecuencia', 'barrera_disp', 'barrera_min', 'barrera_moda', 'barrera_max', 'barrera_tol',
        'carga_kg', 'arrastre_kg', 'distancia_m', 'habilidad'
      ] ];
      this._getTasks().forEach((el) => {
        const d = this._taskData(el);
        const tri = d.processingTime.distribution === 'triangular';
        // La barrera solo se exporta con «por lote»: en una tarea por token el
        // motor no la lee, y sacarla rellena daria a entender que si.
        const esLote = d.frequency === 'lot';
        const b = d.barrier || {};
        rows.push([
          el.id,
          this._label(el),
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
          // La carga se exporta tal como esta declarada: vacio es «no lo sabemos»
          // y 0 es «no mueve peso». Convertir uno en otro al pasar por Excel
          // borraria esa diferencia, que es justo la que distingue un dato que
          // falta de un dato declarado.
          (d.carga && d.carga.masaCargadaKg != null) ? d.carga.masaCargadaKg : '',
          (d.carga && d.carga.masaArrastradaKg != null) ? d.carga.masaArrastradaKg : '',
          (d.carga && d.carga.distanciaM != null) ? d.carga.distanciaM : '',
          Array.isArray(d.habilidades) ? d.habilidades.join(' ') : (d.habilidad || '')
        ]);
      });
      return rows;
    }

    if (this._activeTab === 'resources') {
      // Una fila por PISCINA, y los miembros en columnas aparte. Se aplana en vez
      // de sacar una fila por miembro porque en Excel una piscina con nombres es
      // mas facil de leer asi, y al importar se reconstruye igual.
      const rows = [ [ 'nombre', 'cantidad', 'miembros' ] ];
      this._getPools().forEach((p) => {
        const miembros = (p.members || []).map((m) => {
          const partes = [ m.nombre ];
          partes.push(m.tarifaHora != null ? m.tarifaHora : '');
          partes.push(m.cargaMaximaKg != null ? m.cargaMaximaKg : '');
          partes.push((m.habilidades || []).join(' '));
          return partes.join('|');
        }).join(';');
        rows.push([ p.name, p.quantity, miembros ]);
      });
      return rows;
    }

    if (this._activeTab === 'flows') {
      // La columna se llama `probabilidad_pct` y va en % (0-100), no en fraccion:
      // es lo que muestra y edita la tabla. Un CSV exportado antes de este cambio
      // trae `probabilidad` en 0-1 y se sigue importando (ver _applyCsv).
      const rows = [ [ 'id', 'compuerta', 'hacia', 'probabilidad_pct' ] ];
      this._getFlows().forEach((el) => {
        const d = this._flowData(el);
        rows.push([
          el.id,
          this._label(el.source),
          el.target ? this._label(el.target) : '',
          this._salidaUnica(el.source) ? '100' : pctATexto(d.branchingProbability)
        ]);
      });
      return rows;
    }

    const info = this._globalData();
    if (!info) throw new Error('No hay evento raíz configurado');

    const rows = [ [ 'campo', 'etiqueta', 'valor' ] ];
    GLOBAL_FIELDS.forEach((f) => {
      const v = getByPath(info.data, f.path);
      let text;
      if (f.kind === 'days') text = Array.isArray(v) ? v.join(',') : '';
      else if (f.kind === 'time') text = v && typeof v === 'object' ? `${pad(v.hour)}:${pad(v.minute)}` : '';
      else if (f.kind === 'checkbox') text = v === false ? 'no' : 'si';
      else text = v == null ? '' : v;
      rows.push([ f.key, f.label, text ]);
    });

    // Los descansos son una lista: una fila por dato, con clave `descanso.N.campo`.
    // Asi sigue siendo editable en Excel y vuelve entera al importar.
    const hhmm = (t) => (t && Number.isFinite(t.hour) ? `${pad(t.hour)}:${pad(t.minute)}` : '');
    ((info.data.calendar && info.data.calendar.breaks) || []).forEach((b, i) => {
      const n = i + 1;
      rows.push([ `descanso.${n}.inicio`, `Descanso ${n}: desde`, hhmm(b.start) ]);
      rows.push([ `descanso.${n}.fin`, `Descanso ${n}: hasta`, hhmm(b.end) ]);
      rows.push([ `descanso.${n}.cuentaComoJornada`, `Descanso ${n}: ¿cuenta como jornada?`, b.cuentaComoJornada ? 'si' : 'no' ]);
      rows.push([ `descanso.${n}.existeEnExtra`, `Descanso ${n}: ¿también en horas extra?`, b.existeEnExtra === false ? 'no' : 'si' ]);
    });

    // La tabla de tamaños de lote es otra lista: mismo criterio que los descansos.
    ((info.data.lots && info.data.lots.table) || []).forEach((f, i) => {
      const n = i + 1;
      rows.push([ `lote.${n}.tamano`, `Tamaño de lote ${n}: tamaño`, f.size ]);
      rows.push([ `lote.${n}.peso`, `Tamaño de lote ${n}: peso`, f.weight ]);
    });

    // Vigencias de las reglas laborales. Se exportan TODAS las columnas, aunque
    // la celda esté vacía: en la ida y vuelta una columna ausente y una vacía no
    // son lo mismo (vacío = «lo de arriba», ausente = columna que no existía).
    ((info.data.labor && info.data.labor.rules) || []).forEach((r, i) => {
      const n = i + 1;
      rows.push([ `regla.${n}.desde`, `Vigencia ${n}: desde`, r.desde || '' ]);
      [
        [ 'limitHours', 'cupo semanal (h)' ],
        [ 'payMultiplier', 'prima doble (x)' ],
        [ 'excessPayMultiplier', 'prima triple (x)' ],
        [ 'dailyOvertimeLimitHours', 'tope al día (h)' ],
        [ 'maxOvertimeDaysPerWeek', 'días por semana' ],
        [ 'sundayPremiumPercent', 'dominical (%)' ],
        [ 'holidayPremiumPercent', 'festivo (%)' ]
      ].forEach(([ campo, etiqueta ]) => {
        rows.push([ `regla.${n}.${campo}`, `Vigencia ${n}: ${etiqueta}`, r[campo] == null ? '' : r[campo] ]);
      });
    });

    return rows;
  }

  exportCsv() {
    try {
      const rows = this._csvForActiveTab();
      const name = { tasks: 'tareas', flows: 'flujos', resources: 'recursos', global: 'global' }[this._activeTab];
      download(`simulacion-${name}.csv`, toCsv(rows));
      this._setStatus(`CSV exportado (${rows.length - 1} fila(s)).`, 'ok');
    } catch (err) {
      this._setStatus(err.message, 'error');
    }
  }

  /**
   * Aplica un CSV a la pestaña activa. Valida TODO antes de escribir: si hay un
   * solo error no se modifica el diagrama.
   */
  _applyCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) throw new Error('El archivo está vacío');

    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const body = rows.slice(1);
    const idx = (name) => {
      const i = header.indexOf(name);
      if (i === -1) throw new Error(`Falta la columna «${name}» en el CSV`);
      return i;
    };

    const updates = [];

    if (this._activeTab === 'tasks') {
      const iId = idx('id');
      const iU = idx('unidad_proceso');
      const iR = idx('retrabajo');
      const iRU = idx('unidad_retrabajo');

      // Formato nuevo: `tasa_fallo_pct` en % (0-100). Formato heredado:
      // `tasa_fallo` en fraccion (0-1). Se aceptan los dos para no romper un CSV
      // exportado antes del cambio. El formato se detecta por el NOMBRE de la
      // columna, no por el valor: adivinar por magnitud convertiria un 1 %
      // legitimo (o un 0,5 %) en otra cosa sin avisar.
      const iFPct = header.indexOf('tasa_fallo_pct');
      const iFHeredado = header.indexOf('tasa_fallo');
      if (iFPct === -1 && iFHeredado === -1) {
        throw new Error('Falta la columna «tasa_fallo_pct» en el CSV');
      }

      // Columnas OPCIONALES: un CSV exportado por una version anterior (sin
      // distribucion, sin triangular y sin recurso) sigue importandose, y en ese
      // caso se conserva lo que tuviera el elemento en vez de destruirlo.
      const iDist = header.indexOf('distribucion');
      const iT = header.indexOf('tiempo_proceso');
      const iMin = header.indexOf('min');
      const iModa = header.indexOf('moda');
      const iMax = header.indexOf('max');
      const iRec = header.indexOf('recurso');
      const iCant = header.indexOf('cant_recurso');

      body.forEach((r, n) => {
        const line = n + 2;
        const el = this._elementRegistry.get(String(r[iId]).trim());
        if (!el) throw new Error(`Línea ${line}: no existe el elemento «${r[iId]}»`);

        const unit = String(r[iU]).trim();
        const unitR = String(r[iRU]).trim();
        if (!TASK_UNITS.includes(unit)) throw new Error(`Línea ${line}: unidad «${unit}» inválida (usa ${TASK_UNITS.join('/')}, en plural)`);
        if (!TASK_UNITS.includes(unitR)) throw new Error(`Línea ${line}: unidad «${unitR}» inválida (usa ${TASK_UNITS.join('/')}, en plural)`);

        const bruto = this._num(r[iFPct !== -1 ? iFPct : iFHeredado], `Línea ${line}: tasa de fallo`);
        let failure;
        if (iFPct === -1) {
          if (bruto < 0 || bruto > 1) {
            throw new Error(`Línea ${line}: «tasa_fallo» va en fracción (0-1) pero vale ${bruto}`);
          }
          failure = bruto;
        } else {
          if (bruto < 0 || bruto > 100) {
            throw new Error(`Línea ${line}: la tasa de fallo debe estar entre 0 y 100 % (vale ${bruto})`);
          }
          failure = bruto / 100;
        }

        const cur = this._taskData(el);

        const dist = (iDist !== -1 && String(r[iDist]).trim())
          ? String(r[iDist]).trim()
          : (cur.processingTime.distribution || 'fixed');
        if (dist !== 'fixed' && dist !== 'triangular') {
          throw new Error(`Línea ${line}: distribución «${dist}» inválida (usa fixed o triangular)`);
        }

        let processingTime;
        if (dist === 'triangular') {
          const min = this._num(r[iMin], `Línea ${line}: mínimo`);
          const mode = this._num(r[iModa], `Línea ${line}: moda`);
          const max = this._num(r[iMax], `Línea ${line}: máximo`);
          if (!(min <= mode && mode <= max)) {
            throw new Error(`Línea ${line}: en la triangular debe cumplirse mínimo ≤ moda ≤ máximo`);
          }
          processingTime = { distribution: 'triangular', min, mode, max, unit };
        } else {
          const value = iT !== -1
            ? this._num(r[iT], `Línea ${line}: tiempo de proceso`)
            : (cur.processingTime.value || 0);
          processingTime = { distribution: 'fixed', value, unit };
        }

        const data = {
          ...cur,
          processingTime,
          reworkTime: { ...cur.reworkTime, value: this._num(r[iR], `Línea ${line}: retrabajo`), unit: unitR },
          failureRate: failure
        };

        const recurso = iRec !== -1 ? String(r[iRec]).trim() : ((cur.resources && cur.resources.pool) || '');
        if (recurso) {
          const cantRaw = iCant !== -1 ? String(r[iCant]).trim() : '';
          const cantidad = cantRaw === '' ? 1 : this._num(cantRaw, `Línea ${line}: cantidad de recurso`);
          if (!(cantidad >= 1)) throw new Error(`Línea ${line}: la cantidad de recurso debe ser ≥ 1`);
          if (!this._getPools().some((p) => p.name === recurso)) {
            throw new Error(`Línea ${line}: la piscina «${recurso}» no está dada de alta (créala en la pestaña Recursos)`);
          }
          data.resources = { pool: recurso, quantityRequired: cantidad };
        } else {
          delete data.resources;
        }

        // Frecuencia y barrera, tambien opcionales: un CSV antiguo no las trae y
        // la tarea se queda como estaba (por token, sin barrera). `cur` trae los
        // valores por defecto para poder pintarlos, asi que hay que borrarlos.
        const iFreq = header.indexOf('frecuencia');
        const freqRaw = iFreq !== -1 ? String(r[iFreq]).trim().toLowerCase() : '';
        if (!freqRaw || freqRaw === 'token') {
          delete data.frequency;
          delete data.barrier;
        } else if (freqRaw === 'lot' || freqRaw === 'lote') {
          // Se lee por nombre y no por posicion: el usuario puede reordenar las
          // columnas en Excel, y una fila recortada (columnas de barrera
          // borradas a mano) merece un aviso claro y no un «no numérico».
          const leer = (name) => {
            const i = header.indexOf(name);
            if (i === -1) {
              throw new Error(
                `Falta la columna «${name}» en el CSV: es necesaria para las tareas «por lote»`
              );
            }
            if (r[i] === undefined) {
              throw new Error(`Línea ${line}: la fila está incompleta, falta el valor de «${name}»`);
            }
            return r[i];
          };
          const disp = this._num(leer('barrera_disp'), `Línea ${line}: disponibilidad de la barrera`);
          if (disp < 0 || disp > 1) {
            throw new Error(`Línea ${line}: la disponibilidad de la barrera debe estar entre 0 y 1`);
          }
          const eMin = this._num(leer('barrera_min'), `Línea ${line}: espera mínima`);
          const eModa = this._num(leer('barrera_moda'), `Línea ${line}: espera modal`);
          const eMax = this._num(leer('barrera_max'), `Línea ${line}: espera máxima`);
          if (!(eMin <= eModa && eModa <= eMax)) {
            throw new Error(`Línea ${line}: en la espera de la barrera debe cumplirse mínimo ≤ moda ≤ máximo`);
          }
          const tol = this._num(leer('barrera_tol'), `Línea ${line}: tolerancia`);
          if (tol < 0) throw new Error(`Línea ${line}: la tolerancia no puede ser negativa`);

          data.frequency = 'lot';
          data.barrier = {
            availableProbability: disp,
            waitMin: eMin,
            waitMode: eModa,
            waitMax: eMax,
            toleranceMinutes: tol
          };
        } else {
          throw new Error(`Línea ${line}: frecuencia «${freqRaw}» inválida (usa token o lot)`);
        }

        // Carga fisica y habilidad: columnas OPCIONALES, como la frecuencia. Una
        // celda vacia se guarda como AUSENTE (no como 0): «no lo sabemos» y «no
        // mueve peso» son cosas distintas, y el diagnostico las separa.
        const opcional = (nombre) => {
          const i = header.indexOf(nombre);
          if (i === -1 || r[i] === undefined) return null;
          const bruto = String(r[i]).trim();
          if (bruto === '') return null;
          const v = this._num(bruto, `Línea ${line}: ${nombre}`);
          if (v < 0) throw new Error(`Línea ${line}: «${nombre}» no puede ser negativo`);
          return v;
        };
        const cargaImp = {
          masaCargadaKg: opcional('carga_kg'),
          masaArrastradaKg: opcional('arrastre_kg'),
          distanciaM: opcional('distancia_m')
        };
        delete data.carga;
        if (Object.values(cargaImp).some((v) => v != null)) data.carga = cargaImp;

        const iHab = header.indexOf('habilidad');
        delete data.habilidad;
        delete data.habilidades;
        if (iHab !== -1 && r[iHab] !== undefined) {
          const lista = String(r[iHab]).split(/[,\s]+/).map((h) => h.trim()).filter(Boolean);
          if (lista.length === 1) data.habilidad = lista[0];
          else if (lista.length > 1) data.habilidades = lista;
        }

        updates.push({ element: el, data });
      });
      return updates;
    }

    if (this._activeTab === 'resources') {
      const root = this._getProcessRoot();
      if (!root) throw new Error('El diagrama no tiene ningún proceso donde guardar los recursos');

      const iN = idx('nombre');
      const iC = idx('cantidad');
      // Columna OPCIONAL: un CSV exportado antes de A5 no la trae, y en ese caso
      // la piscina se queda sin miembros en vez de reventar.
      const iM = header.indexOf('miembros');

      const pools = [];
      const vistos = new Set();

      body.forEach((r, n) => {
        const line = n + 2;
        const nombre = String(r[iN]).trim();
        if (!nombre) throw new Error(`Línea ${line}: falta el nombre de la piscina`);
        if (vistos.has(nombre)) throw new Error(`Línea ${line}: la piscina «${nombre}» está repetida`);
        vistos.add(nombre);

        const cantidad = this._num(r[iC], `Línea ${line}: cantidad`);
        if (!Number.isInteger(cantidad) || cantidad < 1) {
          throw new Error(`Línea ${line}: la cantidad debe ser un entero mayor o igual que 1`);
        }

        const pool = { name: nombre, quantity: cantidad };

        const crudoMiembros = iM !== -1 ? String(r[iM] == null ? '' : r[iM]).trim() : '';
        if (crudoMiembros) {
          const members = [];
          const nombresVistos = new Set();
          // Formato: `nombre|tarifa|cargaMax|habilidad1 habilidad2` y los miembros
          // separados por `;`. Los campos posicionales vacios se omiten.
          crudoMiembros.split(';').forEach((trozo, j) => {
            const partes = trozo.split('|').map((x) => x.trim());
            const nombreM = partes[0] || '';
            if (!nombreM) throw new Error(`Línea ${line}: el miembro ${j + 1} de «${nombre}» no tiene nombre`);
            if (nombresVistos.has(nombreM)) {
              throw new Error(`Línea ${line}: el miembro «${nombreM}» está repetido en «${nombre}»`);
            }
            nombresVistos.add(nombreM);

            const miembro = { nombre: nombreM };
            if (partes[1]) {
              miembro.tarifaHora = this._num(partes[1], `Línea ${line}: tarifa de ${nombreM}`);
            }
            if (partes[2]) {
              miembro.cargaMaximaKg = this._num(partes[2], `Línea ${line}: carga máxima de ${nombreM}`);
            }
            if (partes[3]) miembro.habilidades = partes[3].split(/\s+/).filter(Boolean);
            members.push(miembro);
          });
          if (members.length) pool.members = members;
        }

        pools.push(pool);
      });

      updates.push({ element: root, data: { ...(getSimulationData(root) || {}), resourcePools: pools } });
      return updates;
    }

    if (this._activeTab === 'flows') {
      const iId = idx('id');

      // Formato nuevo: `probabilidad_pct` en % (0-100). Formato heredado:
      // `probabilidad` en fraccion (0-1). Se aceptan los dos para no romper un
      // CSV exportado antes del cambio.
      const iPct = header.indexOf('probabilidad_pct');
      const iHeredado = header.indexOf('probabilidad');
      if (iPct === -1 && iHeredado === -1) {
        throw new Error('Falta la columna «probabilidad_pct» en el CSV');
      }
      const iValor = iPct !== -1 ? iPct : iHeredado;

      // Igual que al guardar: se agrupa por compuerta para validar que cada una
      // sume 100 %.
      const porCompuerta = new Map();

      body.forEach((r, n) => {
        const line = n + 2;
        const el = this._elementRegistry.get(String(r[iId]).trim());
        if (!el) throw new Error(`Línea ${line}: no existe el elemento «${r[iId]}»`);
        if (!el.source) throw new Error(`Línea ${line}: el flujo no tiene compuerta de origen`);

        if (this._salidaUnica(el.source)) return; // su reparto no se lee

        const bruto = this._num(r[iValor], `Línea ${line}: reparto`);

        // El formato heredado se detecta por el NOMBRE de la columna, no por el
        // valor: adivinar por magnitud convertiria un 1 % legitimo en 100 %.
        let pct;
        if (iPct === -1) {
          if (bruto < 0 || bruto > 1) {
            throw new Error(`Línea ${line}: «probabilidad» va en fracción (0-1) pero vale ${bruto}`);
          }
          pct = redondear2(bruto * 100);
        } else {
          if (bruto < 0 || bruto > 100) {
            throw new Error(`Línea ${line}: el reparto debe estar entre 0 y 100 % (vale ${bruto})`);
          }
          pct = redondear2(bruto);
        }

        const grupo = porCompuerta.get(el.source.id) || { gateway: el.source, filas: [] };
        grupo.filas.push({ el, pct });
        porCompuerta.set(el.source.id, grupo);
      });

      porCompuerta.forEach(({ gateway, filas }) => {
        const total = redondear2(filas.reduce((acc, f) => acc + f.pct, 0));
        if (Math.abs(total - 100) > TOLERANCIA_REPARTO_PCT) {
          throw new Error(
            `El reparto de las salidas de «${this._label(gateway)}» suma ${total} % y debe sumar 100 %`
          );
        }
        filas.forEach(({ el, pct }) => {
          updates.push({
            element: el,
            data: { ...this._flowData(el), branchingProbability: Math.round(pct * 100) / 10000 }
          });
        });
      });

      return updates;
    }

    const info = this._globalData();
    if (!info) throw new Error('No hay evento raíz configurado');

    const iKey = idx('campo');
    const iVal = header.indexOf('valor') !== -1 ? header.indexOf('valor') : null;
    if (iVal === null) throw new Error('Falta la columna «valor» en el CSV');

    const data = JSON.parse(JSON.stringify(info.data));

    // Los descansos y la tabla de lotes se leen primero y se QUITAN de la lista
    // de campos: si no, caerian en el bucle de abajo y saltaria «campo
    // desconocido».
    const filasDescanso = new Map();
    const filasLote = new Map();
    const filasRegla = new Map();
    const filasCampos = [];

    body.forEach((r) => {
      const clave = String(r[iKey]).trim();

      const m = clave.match(/^descanso\.(\d+)\.(inicio|fin|cuentaComoJornada|existeEnExtra)$/);
      if (m) {
        const i = Number(m[1]);
        if (!filasDescanso.has(i)) filasDescanso.set(i, {});
        filasDescanso.get(i)[m[2]] = String(r[iVal]).trim();
        return;
      }

      const ml = clave.match(/^lote\.(\d+)\.(tamano|peso)$/);
      if (ml) {
        const i = Number(ml[1]);
        if (!filasLote.has(i)) filasLote.set(i, {});
        filasLote.get(i)[ml[2]] = String(r[iVal]).trim();
        return;
      }

      const mr = clave.match(/^regla\.(\d+)\.(desde|limitHours|payMultiplier|excessPayMultiplier|dailyOvertimeLimitHours|maxOvertimeDaysPerWeek|sundayPremiumPercent|holidayPremiumPercent)$/);
      if (mr) {
        const i = Number(mr[1]);
        if (!filasRegla.has(i)) filasRegla.set(i, {});
        filasRegla.get(i)[mr[2]] = String(r[iVal]).trim();
        return;
      }

      filasCampos.push(r);
    });

    filasCampos.forEach((r, n) => {
      const line = n + 2;
      const field = GLOBAL_FIELDS.find((f) => f.key === String(r[iKey]).trim());
      if (!field) throw new Error(`Línea ${line}: campo desconocido «${r[iKey]}»`);
      const raw = r[iVal];

      if (field.kind === 'number') {
        // Campo opcional (la semilla): vacio es «no declarado». Sin esta rama,
        // exportar e importar la pestaña Global fallaba en la semilla vacia: la
        // ida y vuelta del CSV se rompia sola con los valores por defecto.
        if (field.optional && String(raw).trim() === '') {
          setByPath(data, field.path, '');
        } else {
          const num = this._num(raw, `Línea ${line}: ${field.label}`);
          if (field.min != null && num < field.min) throw new Error(`Línea ${line}: ${field.label} debe ser ≥ ${field.min}`);
          if (field.max != null && num > field.max) throw new Error(`Línea ${line}: ${field.label} debe ser ≤ ${field.max}`);
          setByPath(data, field.path, num);
        }
      } else if (field.kind === 'select') {
        const v = String(raw).trim();
        if (!field.options.includes(v)) throw new Error(`Línea ${line}: valor «${v}» inválido (usa ${field.options.join('/')})`);
        setByPath(data, field.path, v);
      } else if (field.kind === 'days') {
        const days = String(raw).split(',').map((s) => s.trim()).filter((s) => s !== '').map((s) => {
          const num = Number(s);
          if (!Number.isInteger(num) || num < 0 || num > 6) throw new Error(`Línea ${line}: día «${s}» inválido (0-6)`);
          return num;
        });
        setByPath(data, field.path, days);
      } else if (field.kind === 'time') {
        const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!m) throw new Error(`Línea ${line}: ${field.label} debe ser HH:MM («${raw}»)`);
        setByPath(data, field.path, { hour: Number(m[1]), minute: Number(m[2]) });
      } else if (field.kind === 'checkbox') {
        // Se acepta «si/sí/s/true/1» y cualquier otra cosa es «no», para no
        // pelearse con la hoja de calculo.
        const texto = String(raw).trim().toLowerCase();
        setByPath(data, field.path, /^(s|sí|si|true|1|x)/.test(texto));
      } else {
        setByPath(data, field.path, String(raw));
      }
    });

    // Descansos: si el CSV trae alguno, se reconstruye la lista ENTERA con ellos.
    // Si no trae ninguno, se dejan los que ya tuviera el modelo.
    if (filasDescanso.size) {
      const descansos = [];

      Array.from(filasDescanso.keys()).sort((a, b) => a - b).forEach((idx) => {
        const f = filasDescanso.get(idx);
        const hora = (texto, cual) => {
          const m = String(texto || '').trim().match(/^(\d{1,2}):(\d{2})$/);
          if (!m) throw new Error(`Descanso ${idx}: ${cual} «${texto}» no es HH:MM`);
          return { hour: Number(m[1]), minute: Number(m[2]) };
        };
        const esSi = (v) => /^(s|sí|si|true|1|x)/.test(String(v || '').trim().toLowerCase());

        const start = hora(f.inicio, 'desde');
        const end = hora(f.fin, 'hasta');
        if (end.hour * 60 + end.minute <= start.hour * 60 + start.minute) {
          throw new Error(`Descanso ${idx}: el fin debe ser posterior al inicio`);
        }

        descansos.push({
          start,
          end,
          cuentaComoJornada: esSi(f.cuentaComoJornada),
          // Ausente = se toma tambien en horas extra, que es lo normal.
          existeEnExtra: f.existeEnExtra === undefined ? true : esSi(f.existeEnExtra)
        });
      });

      setByPath(data, [ 'calendar', 'breaks' ], descansos);
    }

    // Tabla de tamaños de lote: mismo criterio que los descansos, se reconstruye
    // ENTERA solo si el CSV trae alguna fila.
    if (filasLote.size) {
      const tabla = [];
      Array.from(filasLote.keys()).sort((a, b) => a - b).forEach((idx) => {
        const f = filasLote.get(idx);
        const size = this._num(f.tamano, `Línea del lote ${idx}: tamaño`);
        if (!Number.isInteger(size) || size < 1) {
          throw new Error(`Línea del lote ${idx}: el tamaño debe ser un entero mayor o igual que 1`);
        }
        const weight = this._num(f.peso, `Línea del lote ${idx}: peso`);
        if (!(weight > 0)) throw new Error(`Línea del lote ${idx}: el peso debe ser mayor que 0`);
        tabla.push({ size, weight });
      });
      setByPath(data, [ 'lots', 'table' ], tabla);
    }

    // Vigencias de las reglas laborales: mismo criterio, se reconstruye ENTERA
    // solo si el CSV trae alguna. Una celda vacía es «lo de arriba».
    if (filasRegla.size) {
      const reglas = [];
      const vistos = new Set();
      Array.from(filasRegla.keys()).sort((a, b) => a - b).forEach((idx) => {
        const f = filasRegla.get(idx);
        const desde = String(f.desde || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
          throw new Error(`Línea de la vigencia ${idx}: «${desde}» no es una fecha AAAA-MM-DD`);
        }
        if (vistos.has(desde)) throw new Error(`Línea de la vigencia ${idx}: la fecha ${desde} está repetida`);
        vistos.add(desde);

        const regla = { desde };
        [ 'limitHours', 'payMultiplier', 'excessPayMultiplier',
          'dailyOvertimeLimitHours', 'maxOvertimeDaysPerWeek',
          'sundayPremiumPercent', 'holidayPremiumPercent' ].forEach((c) => {
          const bruto = String(f[c] == null ? '' : f[c]).trim();
          if (bruto === '') return;
          const n = this._num(bruto, `Línea de la vigencia ${desde}: ${c}`);
          if (n < 0) throw new Error(`Línea de la vigencia ${desde}: ${c} no puede ser negativo`);
          regla[c] = n;
        });
        reglas.push(regla);
      });
      setByPath(data, [ 'labor', 'rules' ], reglas);
    }

    updates.push({ element: info.element, data });
    return updates;
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
        updates = this._applyCsv(text);
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
