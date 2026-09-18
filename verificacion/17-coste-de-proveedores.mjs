// Coste del recurso EXTERNO (proveedores): cobro por hora y por pieza, y las dos
// cosas que un proveedor no tiene (primas de la LFT y cupo semanal de horas extra).
// Motor REAL, sin copias a mano.
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const MANANA = { hour: 9, minute: 0 };
const TARDE = { hour: 17, minute: 0 };
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

/**
 * Corre un caso y devuelve el motor y los resultados.
 *
 * `tareas` acepta `pool` y `frequency`; `piscinas` es la lista declarada en el
 * proceso, que es de donde el motor las lee.
 */
function correr({ runValue = 10, tareas, piscinas = [], overtime, seed = 42, labor, lots, useOvertime = false,
  startDate = '2026-01-05', workingDays = [ 1, 2, 3, 4, 5 ] }) {
  const guardar = { log: console.log, table: console.table, group: console.group, groupEnd: console.groupEnd, warn: console.warn };
  console.log = console.table = console.group = console.groupEnd = console.warn = () => {};

  try {
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: {
        isRoot: true,
        arrivalRate: { value: 60, unit: 'hour' },
        simulationConfig: { runValue },
        startDate,
        calendar: { workingDays, workingHours: { start: MANANA, end: TARDE }, breaks: [] },
        cost: { baseRatePerHour: 100, waitCostPerHour: 0 },
        overtime: overtime || { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        ...(labor ? { labor } : {}),
        ...(lots ? { lots } : {}),
        seed
      }
    };

    const proceso = {
      id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' }, outgoing: [],
      _datos: { resourcePools: piscinas }
    };

    const nodos = tareas.map((t) => ({
      id: t.id, $type: 'bpmn:Task', businessObject: { name: t.id }, outgoing: [],
      _datos: {
        processingTime: { distribution: 'fixed', value: t.minutos, unit: 'minutes' },
        failureRate: t.falla || 0,
        reworkTime: { value: t.retrabajo || 0, unit: 'minutes' },
        ...(t.frequency ? { frequency: t.frequency } : {}),
        ...(t.pool ? { resources: { pool: t.pool, quantityRequired: t.cantidad || 1 } } : {})
      }
    }));

    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    const cadena = [ inicio, ...nodos, fin ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = { id: `F${i + 1}`, $type: 'bpmn:SequenceFlow', businessObject: {}, source: cadena[i], target: cadena[i + 1] };
      flujos.push(f);
      cadena[i].outgoing = [ f ];
    }

    const elementos = [ ...cadena, proceso, ...flujos ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    const motor = new SimulationEngine(registro);
    const resultados = motor.run({ useOvertime });

    return { motor, resultados, r: (id) => resultados.get(id) || {} };
  } finally {
    Object.assign(console, guardar);
  }
}

console.log('\n== 1. Sin declarar nada, TODO se comporta como antes ==');
{
  // La garantia hacia atras: una piscina sin origen es propia, y una piscina
  // propia no cambia NINGUN numero. Es lo que permite meter esto sin tocar los
  // diagramas que ya existen.
  const base = { tareas: [ { id: 'T1', minutos: 60, pool: 'Equipo' } ], piscinas: [ { name: 'Equipo', quantity: 1 } ] };
  const { r } = correr(base);

  // 1 hora a 100/hora de planta = 100 por ejecucion, 10 ejecuciones = 1000.
  ok(cerca(r('T1').totalOperationCost, 1000), 'la piscina sin origen cobra por hora de planta',
    r('T1').totalOperationCost);
  ok(r('T1').totalExternalCost === 0, 'y NADA de ese coste es factura de proveedor');
  ok(cerca(r('T1').totalCost, 1000), 'el total cuadra con la operacion', r('T1').totalCost);

  // Y con el origen dicho EXPLICITAMENTE como propia, lo mismo: no es un campo que
  // haya que rellenar para que funcione.
  const explicita = correr({ ...base, piscinas: [ { name: 'Equipo', quantity: 1, origen: 'propia', cobro: 'pieza', precioPieza: 999 } ] });
  ok(cerca(explicita.r('T1').totalOperationCost, 1000),
    'una piscina propia que diga «por pieza» sigue cobrando por hora (a la plantilla se le paga el tiempo)',
    explicita.r('T1').totalOperationCost);
}

console.log('\n== 2. Proveedor que cobra POR HORA ==');
{
  // Con tarifa propia y sin declararla: el segundo caso es el interesante, porque
  // un proveedor por hora SIN tarifa caeria en la de la planta, que no es su
  // contrato. Se comprueba que la suya manda.
  const conTarifa = correr({
    tareas: [ { id: 'T1', minutos: 60, pool: 'Taller' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'hora', tarifaHora: 250 } ]
  });
  ok(cerca(conTarifa.r('T1').totalOperationCost, 2500), 'el proveedor por hora usa SU tarifa (250 x 10 h)',
    conTarifa.r('T1').totalOperationCost);
  ok(conTarifa.r('T1').totalExternalCost === 2500, 'y todo su coste se marca como factura',
    conTarifa.r('T1').totalExternalCost);

  // La tarifa propia NO se mezcla con la de la planta: el mismo caso con la
  // tarifa de planta daria 1000. Que de 2500 es que la sustituye.
  ok(!cerca(conTarifa.r('T1').totalOperationCost, 1000), 'y NO la de la planta');

  // Una piscina externa sin tarifa declarada cae en la de planta. Es deliberado:
  // un cero silencioso es peor que un numero aproximado y visible.
  const sinTarifa = correr({
    tareas: [ { id: 'T1', minutos: 60, pool: 'Taller' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'hora' } ]
  });
  ok(cerca(sinTarifa.r('T1').totalOperationCost, 1000),
    'un proveedor por hora sin tarifa cae en la de planta (mejor visible que en 0)',
    sinTarifa.r('T1').totalOperationCost);
}

console.log('\n== 3. Proveedor que cobra POR PIEZA, tarea por token ==');
{
  // Por pieza el coste NO depende del reloj: es precio x piezas. Con 10 casos y
  // 45 la pieza, 450. Lo que hay que ver es que el tiempo no lo mueve.
  const corta = correr({
    tareas: [ { id: 'T1', minutos: 5, pool: 'Taller' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'pieza', precioPieza: 45 } ]
  });
  const larga = correr({
    tareas: [ { id: 'T1', minutos: 120, pool: 'Taller' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'pieza', precioPieza: 45 } ]
  });

  ok(cerca(corta.r('T1').totalOperationCost, 450), 'por pieza: precio x casos (45 x 10)',
    corta.r('T1').totalOperationCost);
  ok(cerca(larga.r('T1').totalOperationCost, 450),
    'y el MISMO importe con una tarea 24 veces mas larga: el reloj no entra',
    larga.r('T1').totalOperationCost);
  ok(cerca(corta.r('T1').totalOperationCost, larga.r('T1').totalOperationCost),
    'ese es el sentido de subcontratar por pieza: el tiempo de tu planta deja de costarte');

  ok(corta.r('T1').totalBilledPieces === 10, 'y se cuentan las piezas facturadas (10)', corta.r('T1').totalBilledPieces);
  ok(corta.r('T1').totalExternalCost === 450, 'marcado como factura');

  // Un cero de precio NO es «gratis»: se factura 0 pero las piezas se cuentan, asi
  // que el informe puede ver que falta el precio.
  const sinPrecio = correr({
    tareas: [ { id: 'T1', minutos: 5, pool: 'Taller' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'pieza' } ]
  });
  ok(sinPrecio.r('T1').totalOperationCost === 0 && sinPrecio.r('T1').totalBilledPieces === 10,
    'sin precio declarado factura 0 pero deja las 10 piezas contadas (se puede detectar)',
    `${sinPrecio.r('T1').totalOperationCost} / ${sinPrecio.r('T1').totalBilledPieces}`);
}

console.log('\n== 3b. El RETRABAJO: por hora se paga, por pieza no ==');
{
  // El motor NO modela el retrabajo como una segunda ejecucion: lo suma como MAS
  // DURACION de la misma tarea. Eso deja una consecuencia que conviene tener dicha:
  //
  //   por HORA   el retrabajo se paga, porque se paga el tiempo.
  //   por PIEZA  la pieza se factura UNA vez, con su retrabajo dentro.
  //
  // No es un descuido: es exactamente el riesgo que se traslada al subcontratar por
  // pieza. Y va en la direccion buena para ti, asi que hay que saberlo antes de
  // decidir, no despues.
  const comun = {
    runValue: 20,
    tareas: [ { id: 'T1', minutos: 10, pool: 'X', falla: 0.5, retrabajo: 30 } ]
  };
  const porHora = correr({ ...comun, piscinas: [ { name: 'X', quantity: 1, origen: 'externa', cobro: 'hora', tarifaHora: 120 } ] });
  const porPieza = correr({ ...comun, piscinas: [ { name: 'X', quantity: 1, origen: 'externa', cobro: 'pieza', precioPieza: 20 } ] });

  ok(porHora.r('T1').totalReworkTime > 0, 'CONTROL: la corrida SI produjo retrabajo (hay fallos)',
    String(porHora.r('T1').totalReworkTime));
  ok(porHora.r('T1').totalOperationCost > 20 * (10 / 60) * 120,
    'por HORA el retrabajo se paga (el coste pasa del de solo procesar)',
    String(porHora.r('T1').totalOperationCost));
  ok(porPieza.r('T1').totalOperationCost === 20 * 20,
    'por PIEZA la factura NO cambia por el retrabajo: 20 piezas x 20 = 400',
    String(porPieza.r('T1').totalOperationCost));
}

console.log('\n== 4. Proveedor por pieza con tarea POR LOTE: factura el lote entero ==');
{
  // La tarea por lote se ejecuta UNA vez para todo el lote, asi que facturar «una
  // pieza por ejecucion» cobraria 1 cuando el proveedor factura 25.
  const { motor, r } = correr({
    runValue: 100,
    lots: { enabled: true, sizeMode: 'fixed', size: 25, stopMinutes: 0 },
    tareas: [ { id: 'T1', minutos: 10, pool: 'Taller', frequency: 'lot' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'pieza', precioPieza: 10 } ]
  });

  ok(motor.lots.length === 4, 'se formaron 4 lotes de 25', String(motor.lots.length));
  ok(r('T1').executionCount === 4, 'y la tarea por lote se ejecuto una vez por lote (4)', String(r('T1').executionCount));
  // 100 piezas x 10 = 1000, repartidas en 4 facturas de 250.
  ok(cerca(r('T1').totalOperationCost, 1000),
    'el importe es precio x TODO el lote (100 piezas x 10 = 1000)', r('T1').totalOperationCost);
  ok(r('T1').totalBilledPieces === 100, 'y las piezas facturadas son las 100 del estudio', String(r('T1').totalBilledPieces));
  ok(!cerca(r('T1').totalOperationCost, 40), 'NO 40 (que es lo que daria facturar una pieza por ejecucion)');

  // Y el ULTIMO lote puede ser mas corto: facturarle el tamaño nominal seria
  // cobrarle piezas que no existen. Con 90 piezas y lotes de 25 -> 25,25,25,15.
  const corto = correr({
    runValue: 90,
    lots: { enabled: true, sizeMode: 'fixed', size: 25, stopMinutes: 0 },
    tareas: [ { id: 'T1', minutos: 10, pool: 'Taller', frequency: 'lot' } ],
    piscinas: [ { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'pieza', precioPieza: 10 } ]
  });
  ok(corto.r('T1').totalBilledPieces === 90,
    'con un ultimo lote corto se facturan las piezas REALES (90, no 100)',
    String(corto.r('T1').totalBilledPieces));
  ok(cerca(corto.r('T1').totalOperationCost, 900), 'y el importe lo refleja (900)', corto.r('T1').totalOperationCost);
}

console.log('\n== 5. A un proveedor NO le aplican las primas de la LFT ==');
{
  // Se trabaja EN domingo (2026-01-11) con prima dominical del 25 %. Para que haya
  // trabajo que primar el domingo tiene que ser LABORABLE; si no, la corrida se
  // salta el dia y la prueba no probaria nada.
  const labor = { shiftType: 'diurna', sundayPremiumPercent: 25, holidayPremiumPercent: 50 };
  const info = {
    runValue: 1,
    tareas: [ { id: 'T1', minutos: 240, pool: 'X' } ],
    labor,
    startDate: '2026-01-11',
    workingDays: [ 0, 1, 2, 3, 4, 5, 6 ]
  };

  const propia = correr({ ...info, piscinas: [ { name: 'X', quantity: 1, origen: 'propia' } ] });
  const externa = correr({ ...info, piscinas: [ { name: 'X', quantity: 1, origen: 'externa', cobro: 'hora', tarifaHora: 100 } ] });

  // El CONTROL primero: sin el, un cero en el proveedor no probaria nada, porque
  // podria ser que la corrida no llegara al domingo. (Antes esta comprobacion era
  // `> 0 || true`, que pasa siempre y no comprueba nada.)
  ok(propia.r('T1').totalDayPremiumCost > 0,
    'CONTROL: la plantilla SI cobra la prima del dia trabajado', String(propia.r('T1').totalDayPremiumCost));
  ok(externa.r('T1').totalDayPremiumCost === 0,
    'el proveedor NO cobra prima del dia (su factura es su precio)',
    String(externa.r('T1').totalDayPremiumCost));

  // Y el tiempo del proveedor en dia especial NO engorda la base imponible de la
  // plantilla: si engordara, el informe pediria una prima que no existe.
  ok(propia.motor.premiumStats.imponible > 0, 'CONTROL: la plantilla tiene base imponible',
    String(propia.motor.premiumStats.imponible));
  ok(externa.motor.premiumStats.imponible === 0,
    'y su tiempo en dia especial no entra en la base imponible de la plantilla',
    String(externa.motor.premiumStats.imponible));

  ok(externa.motor.premiumStats.externoEnDiaEspecialMs > 0,
    'aunque el tiempo SI se cuenta, para poder informarlo',
    String(externa.motor.premiumStats.externoEnDiaEspecialMs));
}

console.log('\n== 6. Las horas extra del proveedor no son TUYAS ==');
{
  // Para que exista hora extra la jornada tiene que ALARGARSE (el cupo semanal se
  // reparte entre los dias laborables) y el trabajo tiene que pasar de la jornada
  // base: 10 tareas de 1 h llenan el lunes y lo desbordan.
  const overtime = { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 };
  const info = {
    runValue: 10,
    tareas: [ { id: 'T1', minutos: 60, pool: 'X' } ],
    overtime,
    useOvertime: true
  };

  const propia = correr({ ...info, piscinas: [ { name: 'X', quantity: 1 } ] });
  const externa = correr({ ...info, piscinas: [ { name: 'X', quantity: 1, origen: 'externa', cobro: 'hora', tarifaHora: 100 } ] });

  ok(propia.r('T1').totalDoubleOvertimeCost > 0,
    'CONTROL: la plantilla SI genera prima de horas extra', String(propia.r('T1').totalDoubleOvertimeCost));
  ok(externa.r('T1').totalDoubleOvertimeCost === 0 && externa.r('T1').totalTripleOvertimeCost === 0,
    'el proveedor NO genera ninguna prima de horas extra',
    `${externa.r('T1').totalDoubleOvertimeCost} / ${externa.r('T1').totalTripleOvertimeCost}`);

  const semanasPropias = [ ...propia.motor.weeklyStats.values() ].reduce((a, b) => a + b, 0);
  const semanasExternas = [ ...externa.motor.weeklyStats.values() ].reduce((a, b) => a + b, 0);
  ok(semanasPropias > 0, 'CONTROL: la plantilla acumula horas extra en su cupo semanal', String(semanasPropias));
  ok(semanasExternas === 0,
    'y el proveedor NO acumula nada en el cupo: no puede disparar tu aviso legal', String(semanasExternas));

  ok(externa.motor.premiumStats.externoFueraDeJornadaMs > 0,
    'aunque sus horas fuera de jornada se cuentan para el informe',
    String(externa.motor.premiumStats.externoFueraDeJornadaMs));
}

console.log('\n== 7. El cuadre del coste sigue cerrando ==');
{
  // La propiedad que no se puede romper: totalCost = operacion + primas + dia +
  // espera. Con proveedores hay MAS piezas en el desglose, no otras.
  const { r } = correr({
    runValue: 20,
    tareas: [
      { id: 'T1', minutos: 30, pool: 'Equipo' },
      { id: 'T2', minutos: 30, pool: 'Taller' }
    ],
    piscinas: [
      { name: 'Equipo', quantity: 1 },
      { name: 'Taller', quantity: 1, origen: 'externa', cobro: 'pieza', precioPieza: 20 }
    ]
  });

  const r1 = r('T1'), r2 = r('T2');
  const suma1 = r1.totalOperationCost + r1.totalDoubleOvertimeCost + r1.totalTripleOvertimeCost + r1.totalDayPremiumCost;
  ok(cerca(r1.totalCost, suma1), 'la tarea de plantilla cuadra', `${r1.totalCost} / ${suma1}`);
  const suma2 = r2.totalOperationCost + r2.totalDoubleOvertimeCost + r2.totalTripleOvertimeCost + r2.totalDayPremiumCost;
  ok(cerca(r2.totalCost, suma2), 'y la del proveedor tambien', `${r2.totalCost} / ${suma2}`);

  ok(cerca(r2.totalOperationCost, 400) && r2.totalExternalCost === 400,
    'la factura del proveedor esta entera en los dos sitios (operacion y externo)',
    `${r2.totalOperationCost} / ${r2.totalExternalCost}`);
  ok(r1.totalExternalCost === 0 && r2.totalExternalCost > 0,
    'y se distingue quien es quien sin sumar nada raro');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
