// EL INFORME PDF: los tres escenarios de horas extra y los escenarios de costo.
//
// POR QUE EXISTE ESTE ARNES, y es una deuda que venia de antes: `ReportPanel.js` es el
// archivo que produce el ENTREGABLE -lo que se lleva el cliente- y no tenia ni una
// comprobacion. Lo que se prueba aqui es lo que se puede probar sin abrir el PDF: que el
// contexto se construya con los tres informes, que las secciones aparezcan, y que los
// numeros que se imprimen sean los mismos que calcula el motor.
//
// Lo que NO se prueba, dicho en vez de disimulado: el ASPECTO (que se vea bien en papel,
// que no se corten las tablas). Eso no se puede comprobar sin ojos, y por eso el CSS lleva
// `break-inside: avoid` en los bloques que no deben partirse.
import ReportPanel from '@plugin/simulation/ReportPanel.js';

// DIAGNOSTICO: si el modulo carga, esta linea sale. Si el arnes muere antes, no.
console.log('  OK     el modulo ReportPanel carga: ' + (typeof ReportPanel));

// El arnes envuelve TODO en try/catch para que un error de carga no se pierda como
// «Script error» sin linea: sin esto, un import roto o un metodo que no existe deja el
// arnes en 0 comprobaciones y sin decir por que.
window.addEventListener('error', (e) => {
  console.log('  FALLO  ERROR DE CARGA: ' + (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
});

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

/** Un informe de motor, con lo minimo que lee el panel. */
const informe = ({ completadas, costo, dias, cumple, porDia }) => ({
  completedInstances: completadas,
  totalWorkingDays: dias,
  calendarDuration: dias * 8 * 60 * 60 * 1000,
  inicio: new Date('2026-01-05T09:00:00'),
  diasNaturales: dias,
  results: new Map(),
  dailyCompletions: new Map(Object.entries(porDia || {})),
  utilization: new Map(),
  instanceCosts: [ 100, 200, 300 ],
  cycleTimes: [ 10, 20, 30 ],
  compliance: {
    semanas: 4, semanasSobreLimite: cumple ? 0 : 3, semanasSobreDias: 0,
    diasSobreLimiteDiario: 0, diasConExtra: cumple ? 2 : 8,
    limiteSemanalHoras: 9, limiteDiarioHoras: 3, maxDiasConExtraPorSemana: 3,
    excesoTotalHoras: cumple ? 0 : 20, excesoMedioSemanasSobreLimite: cumple ? 0 : 6.7,
    maxExtraDiaHoras: 3, detalleSemanas: [], detalleDias: []
  },
  labor: { shiftType: 'diurna', baseDailyHours: 8, limitHours: 9, payMultiplier: 2,
    excessPayMultiplier: 3, dailyOvertimeLimitHours: 3, maxOvertimeDaysPerWeek: 3,
    sundayPremiumPercent: 25, holidayPremiumPercent: 0 },
  laborDescripcion: 'turno diurna (base 8 h/día)',
  config: { cost: { baseRatePerHour: 100 } },
  semilla: 'abc123'
});

const datos = {
  normal: informe({ completadas: 80, costo: 9000, dias: 25, cumple: true,
    porDia: { '2026-01-05': 40, '2026-01-06': 40 } }),
  legal: informe({ completadas: 95, costo: 11000, dias: 22, cumple: true,
    porDia: { '2026-01-05': 60, '2026-01-06': 35 } }),
  overtime: informe({ completadas: 100, costo: 13000, dias: 20, cumple: false,
    porDia: { '2026-01-05': 70, '2026-01-06': 30 } }),
  tareas: [],
  flujos: []
};

const panel = new ReportPanel(
  { getContainer: () => document.createElement('div') },
  { on: () => {}, fire: () => {} },
  { filter: () => [], getAll: () => [] },
  { showNotification: () => {} },
  { getReportData: () => datos }
);

console.log('\n== 1. El contexto lleva los TRES informes ==');
{
  const ctx = panel._contexto(datos);
  ok(ctx.escenariosTres != null, 'el contexto construye la comparativa de tres');
  ok(ctx.escenariosTres && ctx.escenariosTres.filas.length === 3,
    'y con las tres filas', String(ctx.escenariosTres && ctx.escenariosTres.filas.length));
  ok(ctx.escenariosTres.filas.map((f) => f.clave).join(',') === 'normal,legal,extra',
    'una por escenario, en orden');
  // Cada fila trae la serie, que es lo que dibuja el grafico del PDF.
  ok(ctx.escenariosTres.filas.every((f) => Array.isArray(f.serie) && f.serie.length > 0),
    'y cada una con su serie acumulada para el grafico');
  ok(ctx.escenariosTres.techo >= 100, 'con el techo calculado sobre las tres',
    String(ctx.escenariosTres.techo));
}

console.log('\n== 2. Sin el informe legal el informe NO revienta ==');
{
  // Es el caso de una corrida vieja o de un modelo sin tarifas de horas extra: la seccion
  // tiene que decir que no hay escenarios, no romper el documento entero.
  const sinLegal = panel._contexto({ ...datos, legal: null });
  ok(sinLegal.escenariosTres === null, 'sin informe legal no hay comparativa (null)');
  const html = panel._escenariosExtra({ escenarios: sinLegal.escenariosTres });
  ok(/No hay escenarios/.test(html), 'y la seccion lo dice en vez de dejar un hueco',
    html.slice(0, 80));
}

console.log('\n== 3. La seccion imprime los tres escenarios con sus numeros ==');
{
  const ctx = panel._contexto(datos);
  const html = panel._escenariosExtra({ escenarios: ctx.escenariosTres });

  ok(/Sin horas extra/.test(html), 'nombra el escenario base');
  ok(/Extra con tope legal/.test(html), 'el del tope legal');
  ok(/Extra sin tope/.test(html), 'y el libre');
  // Los numeros del motor tienen que aparecer TAL CUAL: si la seccion recalculara sus
  // propios totales, el PDF diria una cifra y la tabla de al lado otra.
  ok(html.includes('80') && html.includes('95') && html.includes('100'),
    'y las piezas de los tres', '80 / 95 / 100');
  ok(html.includes('cumple'), 'marca quien cumple la ley');
  ok(html.includes('NO cumple'), 'y quien no');
  // El grafico, con sus tres trazos y la leyenda impresa.
  ok((html.match(/<polyline/g) || []).length === 3,
    'el grafico del PDF dibuja los tres trazos',
    String((html.match(/<polyline/g) || []).length));
  ok(/leyenda-escenarios/.test(html),
    'y lleva leyenda impresa: en papel no se pasa el raton por encima de las curvas');
}

console.log('\n== 4. La nota del tope legal sale en el documento ==');
{
  const ctx = panel._contexto(datos);
  const html = panel._escenariosExtra({ escenarios: ctx.escenariosTres });
  // Con 95 frente a 100 piezas y 11000 frente a 13000, el desenlace es «menos piezas»: la
  // ley tiene un coste de oportunidad y hay que cuantificarlo.
  ok(/Cumplir la ley/.test(html), 'la nota del tope legal esta en la seccion', html.slice(0, 60));
  ok(/precio de la legalidad|mismas piezas/.test(html),
    'y dice cual de los desenlaces es, no una frase generica');
}

console.log('\n== 5. La seccion del cumplimiento incluye los escenarios ==');
{
  // El encadenado: `_laboral` tiene que insertar los escenarios. Si se calculan pero no se
  // insertan, el trabajo no llega al documento -que es el fallo que dejo pasar la regresion
  // del zoom en su dia: una funcion correcta que nadie llama.
  const ctx = panel._contexto(datos);
  const html = panel._laboral(ctx);
  ok(/Cumplimiento de los topes/.test(html), 'la seccion de cumplimiento esta');
  ok(/Escenarios de horas extra/.test(html),
    'y lleva dentro los escenarios (no se calculan para tirarlos)');
  ok(html.indexOf('Cumplimiento de los topes') < html.indexOf('Escenarios de horas extra'),
    'despues del veredicto, que es donde nace la pregunta «¿y si lo cumpliera?»');
}

console.log('\n== 6. El contexto sigue funcionando sin los informes de extra ==');
{
  // Robustez: el panel se construye con lo que haya. Un informe a medias no puede reventar
  // la generacion del documento entero.
  const vacio = panel._contexto({ normal: datos.normal, overtime: null, tareas: [], flujos: [] });
  ok(vacio.escenariosTres === null, 'sin informe de extra no hay escenarios');
  const html = panel._escenariosExtra({ escenarios: null });
  ok(typeof html === 'string' && html.length > 0, 'y la seccion devuelve texto, no undefined');
  ok(/No hay escenarios/.test(html), 'diciendo que no los hay');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
