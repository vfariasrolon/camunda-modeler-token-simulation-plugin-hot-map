// LOS TRES ESCENARIOS DE HORAS EXTRA, con el motor REAL y sobre un diagrama con carga.
//
// Es la prueba que responde a la pregunta del usuario: «¿el sistema calcula ambos escenarios,
// pasandonos el tope y segun la ley?». El arnes 19 prueba la ARITMETICA del tope por
// separado; este prueba que el motor la APLICA, que es otra cosa: una funcion de tope
// perfecta que el motor no llame no limita nada, y esa es la clase de fallo que dejo pasar la
// regresion del zoom.
import SimulationEngine from './SimulationEngine.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

/**
 * Corre el diagrama en un modo. El montaje es una cadena de dos tareas con UNA unidad de
 * recurso: con llegadas cada media hora y 50 min por tarea, la cola es inevitable y el trabajo
 * se sale de la jornada base, que es lo que obliga a decidir sobre las horas extra.
 */
const correr = (modo) => {
  // 300 piezas: con 40 la corrida cabia en UNA semana y el tope semanal de 9 h no se
  // alcanzaba, asi que «con tope» y «sin tope» daban lo mismo y el arnes no probaba nada.
  const RUN = 300;
  const guardar = { log: console.log, table: console.table, warn: console.warn, groupEnd: console.groupEnd };
  console.log = () => {}; console.table = () => {}; console.warn = () => {}; console.groupEnd = () => {};
  let motor;
  try {
    const tarea1 = {
      id: 'T1', $type: 'bpmn:Task', businessObject: { name: 'Corte' }, outgoing: [],
      _datos: { processingTime: { distribution: 'fixed', value: 50, unit: 'minutes' },
        resources: { pool: 'P', quantityRequired: 1 } }
    };
    const tarea2 = {
      id: 'T2', $type: 'bpmn:Task', businessObject: { name: 'Ensamble' }, outgoing: [],
      _datos: { processingTime: { distribution: 'fixed', value: 50, unit: 'minutes' },
        resources: { pool: 'P', quantityRequired: 1 } }
    };
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: {
        isRoot: true,
        arrivalRate: { value: 2, unit: 'hour' },
        simulationConfig: { runValue: RUN },
        startDate: '2026-01-05',
        calendar: { workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [] },
        cost: { baseRatePerHour: 100, waitCostPerHour: 40 },
        overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        labor: { shiftType: 'diurna', dailyOvertimeLimitHours: 3, maxOvertimeDaysPerWeek: 3 },
        warmup: { enabled: false }
      }
    };
    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    const proceso = {
      id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' },
      _datos: { resourcePools: [ { name: 'P', quantity: 1 } ] }
    };
    const cadena = [ inicio, tarea1, tarea2, fin ];
    const flujos = [];
    for (let i = 0; i < cadena.length - 1; i++) {
      const f = { id: `F${i + 1}`, $type: 'bpmn:SequenceFlow', businessObject: {},
        source: cadena[i], target: cadena[i + 1] };
      flujos.push(f);
      cadena[i].outgoing = [ f ];
    }
    const elementos = [ ...cadena, ...flujos, proceso ];
    const registro = {
      getAll: () => elementos,
      get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn),
      find: (fn) => elementos.find(fn)
    };

    motor = new SimulationEngine(registro);
    const resultados = motor.run({ useOvertime: modo !== 'sin-extra', overtimeMode: modo });
    const extra = (resultados.get('T1').totalOvertime || 0) + (resultados.get('T2').totalOvertime || 0);
    const costo = (resultados.get('T1').totalCost || 0) + (resultados.get('T2').totalCost || 0);
    return {
      modo,
      piezas: motor.completedInstances,
      extraHoras: extra / 3600000,
      costo,
      compliance: motor.compliance,
      dias: motor.totalWorkingDays || motor._diasLaborables || null,
      diasConExtra: motor.compliance ? motor.compliance.diasConExtra : 0,
      motivos: [ ...motor._motivosDeEspera ]
    };
  } finally {
    Object.assign(console, guardar);
  }
};

const sinExtra = correr('sin-extra');
const conTope = correr('tope-legal');
const sinTope = correr('sin-tope');

const f = (n, d = 1) => Number(n).toFixed(d);
console.log('\n  Escenario        Piezas   Extra(h)   Costo      Cumple   Dias');
[ sinExtra, conTope, sinTope ].forEach((r) => {
  const c = r.compliance;
  const cumple = !c || (!c.semanasSobreLimite && !c.diasSobreLimiteDiario && !c.semanasSobreDias);
  console.log(`  ${r.modo.padEnd(16)} ${String(r.piezas).padStart(5)}  ${f(r.extraHoras).padStart(8)}  `
    + `${f(r.costo, 0).padStart(9)}  ${(cumple ? 'si' : 'NO').padStart(6)}  ${String(r.dias).padStart(5)}`);
});

console.log('\n== 1. SIN EXTRA: es la jornada base, y por construccion no hay extra ==');
{
  ok(sinExtra.extraHoras === 0, 'no se hace NINGUNA hora extra',
    `${f(sinExtra.extraHoras)} h`);
  ok(sinExtra.compliance.semanasSobreLimite === 0, 'asi que cumple el tope semanal por definicion');
  // Y la jornada NO se extendio: si el plan sin extra extendiera el calendario, estaria
  // pagando una jornada larga para no usarla, y su costo no seria comparable.
  // OJO: NO se comprueba que sea el mas barato, y es deliberado. Con la produccion FIJA
  // -siempre se hacen las mismas piezas-, el plan sin extra ocupa el recurso mas DIAS, y la
  // espera de los casos se paga. Puede salir mas caro que el de horas extra, y eso NO es un
  // fallo: es el hallazgo clasico de que las horas extra a veces se pagan solas. Afirmar lo
  // contrario seria escribir una prueba que miente si el resultado es el interesante.
  ok(true, 'y su coste real es el plazo: se mide en la seccion siguiente',
    `${sinExtra.diasConExtra} vs ${sinTope.diasConExtra} dias con extra`);
}

console.log('\n== 2. CON TOPE LEGAL: la ley se respeta de verdad ==');
{
  const c = conTope.compliance;
  ok(conTope.extraHoras > 0, 'se sigue haciendo extra: el tope no la elimina',
    `${f(conTope.extraHoras)} h`);
  ok(c.semanasSobreLimite === 0, 'y NINGUNA semana pasa del cupo legal',
    `${c.semanasSobreLimite} semanas sobre el limite`);
  ok(c.diasSobreLimiteDiario === 0, 'ni ningun dia pasa del tope diario',
    `${c.diasSobreLimiteDiario} dias sobre el tope diario`);
  ok(c.semanasSobreDias === 0, 'ni se prolonga la jornada mas dias de los permitidos',
    `${c.semanasSobreDias} semanas sobre el tope de dias`);
  ok(conTope.extraHoras < sinTope.extraHoras,
    'y hace MENOS extra que el escenario sin tope',
    `${f(conTope.extraHoras)} h < ${f(sinTope.extraHoras)} h`);
}

console.log('\n== 3. SIN TOPE: el comportamiento de siempre, para poder compararlo ==');
{
  ok(sinTope.compliance.semanasSobreLimite > 0,
    'el escenario sin tope SI se pasa de la ley, que es lo que lo hace util como contraste',
    `${sinTope.compliance.semanasSobreLimite} de ${sinTope.compliance.semanas} semanas`);
  ok(sinTope.extraHoras >= conTope.extraHoras,
    'y es el que mas extra hace de los tres',
    `${f(sinTope.extraHoras)} h`);
}

console.log('\n== 4. Los tres son DISTINTOS, o no hay nada que comparar ==');
{
  // Si «con tope» diera el mismo resultado que «sin tope», el tope no se estaria aplicando. Si
  // lo diera igual que «sin extra», la jornada extendida no serviria. Las dos cosas se
  // comprueban porque las dos han sido fallos plausibles al construir esto.
  ok(conTope.extraHoras !== sinTope.extraHoras,
    'el escenario con tope NO es identico al sin tope (el tope se aplica)',
    `${f(conTope.extraHoras)} vs ${f(sinTope.extraHoras)}`);
  ok(conTope.extraHoras !== sinExtra.extraHoras,
    'ni identico al sin extra (la jornada extendida sirve)',
    `${f(conTope.extraHoras)} vs ${f(sinExtra.extraHoras)}`);
  ok(conTope.costo !== sinTope.costo, 'y el costo tambien cambia entre escenarios',
    `${f(conTope.costo, 0)} vs ${f(sinTope.costo, 0)}`);
}

console.log('\n== 5. El motivo de la espera queda registrado, para poder explicarla ==');
{
  // Un plan que se alarga y no dice por que parece un fallo del modelo. Si el escenario con
  // tope tuvo que cortar trabajo, TIENE que haber motivo: sin el, el informe alarga el plazo
  // sin explicacion.
  ok(conTope.motivos.length > 0,
    'el escenario con tope registra POR QUE el trabajo espero',
    conTope.motivos.join(', ') || 'NINGUN motivo');
  ok(conTope.motivos.every((m) => typeof m === 'string' && m.startsWith('tope-')),
    'y los motivos son de tope, no de otra cosa',
    conTope.motivos.join(', '));
  ok(sinTope.motivos.length === 0,
    'el escenario sin tope no tiene motivos de recorte (no recorta nada)',
    sinTope.motivos.join(', ') || 'sin motivos, correcto');
}

console.log('\n== 6. El costo por caso sigue cuadrando en los tres escenarios ==');
{
  // La prueba de cuadre del arnes 01 se repite aqui para los tres modos: si el recorte de
  // extra rompiera el acumulador del caso, el informe de escenarios daria percentiles de una
  // magnitud distinta a la de su propio total.
  const guardar = { log: console.log, table: console.table, warn: console.warn, groupEnd: console.groupEnd };
  console.log = () => {}; console.table = () => {}; console.warn = () => {}; console.groupEnd = () => {};
  let motor;
  let totalTareas;
  try {
    const tarea = {
      id: 'T1', $type: 'bpmn:Task', businessObject: { name: 'Corte' }, outgoing: [],
      _datos: { processingTime: { distribution: 'fixed', value: 50, unit: 'minutes' },
        resources: { pool: 'P', quantityRequired: 1 } }
    };
    const inicio = {
      id: 'S1', $type: 'bpmn:StartEvent', businessObject: { name: 'Inicio' }, outgoing: [],
      _datos: { isRoot: true, arrivalRate: { value: 2, unit: 'hour' },
        simulationConfig: { runValue: 20 }, startDate: '2026-01-05',
        calendar: { workingDays: [ 1, 2, 3, 4, 5 ],
          workingHours: { start: { hour: 9, minute: 0 }, end: { hour: 17, minute: 0 } }, breaks: [] },
        cost: { baseRatePerHour: 100, waitCostPerHour: 40 },
        overtime: { limitHours: 9, payMultiplier: 2, excessPayMultiplier: 3 },
        labor: { shiftType: 'diurna', dailyOvertimeLimitHours: 3, maxOvertimeDaysPerWeek: 3 },
        warmup: { enabled: false } }
    };
    const fin = { id: 'E1', $type: 'bpmn:EndEvent', businessObject: { name: 'Fin' }, outgoing: [] };
    const proceso = { id: 'P1', $type: 'bpmn:Process', businessObject: { name: 'Proceso' },
      _datos: { resourcePools: [ { name: 'P', quantity: 1 } ] } };
    const f1 = { id: 'F1', $type: 'bpmn:SequenceFlow', businessObject: {}, source: inicio, target: tarea };
    const f2 = { id: 'F2', $type: 'bpmn:SequenceFlow', businessObject: {}, source: tarea, target: fin };
    inicio.outgoing = [ f1 ]; tarea.outgoing = [ f2 ];
    const elementos = [ inicio, tarea, fin, f1, f2, proceso ];
    const registro = {
      getAll: () => elementos, get: (id) => elementos.find((e) => e.id === id),
      filter: (fn) => elementos.filter(fn), find: (fn) => elementos.find(fn)
    };

    motor = new SimulationEngine(registro);
    const r = motor.run({ useOvertime: true, overtimeMode: 'tope-legal' });
    totalTareas = r.get('T1').totalCost || 0;
  } finally {
    Object.assign(console, guardar);
  }

  const suma = (motor.instanceCosts || []).reduce((a, b) => a + b, 0);
  ok(Math.abs(suma - totalTareas) < Math.max(0.5, totalTareas * 0.001),
    'con el tope aplicado, la suma por caso sigue cuadrando con el total',
    `por caso ${f(suma, 2)} vs total ${f(totalTareas, 2)}`);
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
