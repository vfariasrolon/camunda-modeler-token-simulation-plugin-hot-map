// Comparativa de los DOS planes (normal y horas extra): deltas, series
// acumuladas, techo comun y las notas prediseñadas de eficiencia.
//
// Codigo REAL del plugin (client/simulation/ComparativaPlanes.js), copiado por
// build.mjs. No se reimplementa nada: lo que puede estar mal aqui son los deltas y
// el techo compartido, y eso se comprueba con numeros.
import {
  COLOR_PLAN, UMBRAL_PCT, compararPlanes, notasDeEficiencia, fechasUnidas,
  serieAcumulada, techoComun, techoRedondo, etiquetaDeFecha, deltaPct, svgAcumulada,
  ESCENARIOS_EXTRA, compararEscenarios, cumpleLaLey, notaDelTopeLegal
} from './ComparativaPlanes.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

/** Informe de prueba. `dias` es [fecha, piezas] y se convierte en el Map real. */
const informe = ({ piezas = 100, coste = 1000, espera = 100, prima = 0, dias = [], diasNaturales = 1, laborables = 1 }) => ({
  completedInstances: piezas,
  totalCost: coste,
  diasNaturales,
  totalWorkingDays: laborables,
  dailyCompletions: new Map(dias),
  results: [
    { totalCost: coste, totalWaitTimeCost: espera, totalDoubleOvertimeCost: prima, totalTripleOvertimeCost: 0, totalOvertime: prima > 0 ? 3600000 : 0 }
  ]
});

console.log('\n== 1. Las dos mitades se calculan siempre ==');
{
  // El caso base: con extras se paga mas y se entrega antes. Es el caso que el
  // usuario describio, y el resumen tiene que decir LAS DOS cosas.
  const normal = informe({ coste: 1000, espera: 100, dias: [ [ '2026-09-15', 40 ], [ '2026-09-16', 40 ], [ '2026-09-17', 20 ] ], diasNaturales: 3, laborables: 3 });
  const extra = informe({ coste: 1200, espera: 60, prima: 240, dias: [ [ '2026-09-15', 60 ], [ '2026-09-16', 40 ] ], diasNaturales: 2, laborables: 2 });

  const cmp = compararPlanes(normal, extra);

  ok(cmp.coste.normal === 1000 && cmp.coste.extra === 1200, 'los dos costes salen del informe',
    `${cmp.coste.normal} / ${cmp.coste.extra}`);
  ok(cmp.coste.delta === 200, 'y la diferencia absoluta', String(cmp.coste.delta));
  ok(Math.abs(cmp.coste.deltaPct - 20) < 1e-9, 'y la relativa (+20 %)', cmp.coste.deltaPct.toFixed(2));
  ok(cmp.plazo.deltaDias === -1 && cmp.plazo.adelanta === true,
    'el plazo adelanta (delta de dias negativo)', `${cmp.plazo.deltaDias}`);
  // El ahorro se mide sobre el plan que MAS tarda (3 dias): 1 de 3 = 33,3 %.
  // Medido sobre el corto daria 50 %, que es otra cosa y exagera.
  ok(Math.abs(cmp.plazo.ahorroPct - 33.333333) < 0.01,
    'y el % de plazo se calcula sobre el plan que MAS tarda, no sobre el corto',
    cmp.plazo.ahorroPct.toFixed(2) + ' %');
  ok(cmp.piezas.iguales === true, 'las piezas son las mismas, asi que los totales se pueden comparar');
  ok(cmp.primas.extra === 240 && cmp.primas.normal === 0, 'las primas se leen del informe');
  ok(cmp.espera.extra === 60 && cmp.espera.normal === 100, 'y la espera tambien (que puede BAJAR)');
  ok(Math.abs(cmp.porPieza.normal - 10) < 1e-9 && Math.abs(cmp.porPieza.extra - 12) < 1e-9,
    'el coste por pieza se calcula con las piezas de cada plan',
    `${cmp.porPieza.normal} / ${cmp.porPieza.extra}`);
}

console.log('\n== 2. Las notas dicen las DOS mitades ==');
{
  const normal = informe({ coste: 1000, dias: [ [ '2026-09-15', 40 ], [ '2026-09-16', 40 ], [ '2026-09-17', 20 ] ], diasNaturales: 3 });
  const extra = informe({ coste: 1200, prima: 240, dias: [ [ '2026-09-15', 60 ], [ '2026-09-16', 40 ] ], diasNaturales: 2 });

  const notas = notasDeEficiencia(compararPlanes(normal, extra));
  const texto = notas.map((n) => n.texto).join(' | ');

  ok(/pagas 20\.0 % más/.test(texto), 'la nota principal dice cuanto MAS se paga', texto.slice(0, 90));
  ok(/adelantas 33\.3 % del plazo/.test(texto), 'y cuanto se adelanta');
  // Los dos plazos CON PALABRA y con tilde: «3 dias» con el resto del texto acentuado
  // canta, y el «día(s)» de antes se leía como un formulario sin rellenar.
  ok(/\(1 día\): 3 días frente a 2 días\./.test(texto),
    'con los dos plazos en días y bien escritos', texto.slice(0, 120));
  ok(!/día\(s\)|\d dias/.test(texto), 'y sin el «día(s)» ni «dias» sin tilde');

  // La mitad que se olvida: el plan barato es el que tarda.
  ok(/Sin horas extra el coste es 20\.0 % menor/.test(texto),
    'y la otra cara: el plan barato es el que tarda');
  // El signo sobrante: «BAJA +14 %» se lee como si subiera.
  ok(!/BAJA \+|BAJA −/.test(texto), 'nunca se escribe «BAJA ±x %» con signo redundante');
  // Los importes con separador de miles: un «31200» suelto no se lee.
  ok(/\$\d[\d,]*\.\d\d → \$\d[\d,]*\.\d\d|Primas de horas extra: \$/.test(texto),
    'los importes van con moneda y separador de miles', texto.slice(-120));

  ok(notas.some((n) => n.nivel === 'aviso'), 'el hallazgo principal va marcado como aviso');
}

console.log('\n== 2b. El cuadrante que se cuela: mas barato Y mas rapido ==');
{
  // Este caso se escapo en la primera version: la nota «sin horas extra el coste es un
  // X % menor» se escribia SIEMPRE que el plazo adelantaba, asi que cuando el plan con
  // extras era el mas BARATO decia exactamente lo contrario de lo que pasa.
  const normal = informe({ coste: 1000, espera: 700, dias: [ [ '2026-09-15', 50 ], [ '2026-09-16', 50 ] ], diasNaturales: 10 });
  const extra = informe({ coste: 800, espera: 60, prima: 60, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 6 });

  const cmp = compararPlanes(normal, extra);
  const texto = notasDeEficiencia(cmp).map((n) => n.texto).join(' | ');

  ok(cmp.coste.deltaPct < 0 && cmp.plazo.adelanta,
    'el plan con extras es mas barato Y mas rapido', `${cmp.coste.deltaPct.toFixed(1)} % / ${cmp.plazo.ahorroPct.toFixed(1)} %`);
  ok(/gana en las dos/.test(texto), 'la nota dice que ese plan gana en las dos', texto.slice(0, 110));
  // Y lo que NO puede decir: que el plan sin extras es mas barato, porque no lo es.
  ok(!/Sin horas extra el coste es/.test(texto),
    'y NO afirma que el plan sin extras sea mas barato', texto);
  ok(!/el coste es \d+ % menor/.test(texto), 'ni ninguna otra forma de decir lo mismo');
  ok(notasDeEficiencia(cmp).some((n) => n.nivel === 'ok'),
    'se marca como buena noticia, no como aviso');

  // El otro subcuadrante: mas barato y MISMO plazo.
  const igualPlazo = informe({ coste: 800, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 10 });
  const texto2 = notasDeEficiencia(compararPlanes(normal, igualPlazo)).map((n) => n.texto).join(' | ');
  ok(/sin mover el plazo/.test(texto2), 'y si el plazo no cambia, tambien se dice', texto2.slice(0, 100));
}

console.log('\n== 3. El caso contraintuitivo: trabajar fuera de jornada sale MAS BARATO ==');
{
  // Si la espera cuesta mas que la prima, el plan con extras baja de precio. Callarlo
  // seria esconder el unico caso en el que la intuicion normal esta al reves.
  const normal = informe({ coste: 1000, espera: 800, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 20 });
  const extra = informe({ coste: 900, espera: 100, prima: 50, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 12 });

  const cmp = compararPlanes(normal, extra);
  const notas = notasDeEficiencia(cmp);
  const texto = notas.map((n) => n.texto).join(' | ');

  ok(cmp.coste.deltaPct < -UMBRAL_PCT, 'el coste BAJA con horas extra', cmp.coste.deltaPct.toFixed(1) + ' %');
  ok(/coste BAJA/.test(texto), 'y la nota lo dice en lugar de callarlo', texto.slice(0, 100));
  ok(/la intuición falla/.test(texto), 'explicando que es el caso en el que la intuicion falla');
  ok(notas.some((n) => n.nivel === 'ok'), 'y se marca como buena noticia, no como aviso');

  // Y el desglose tiene que explicar POR QUE baja: la espera baja mas que la prima.
  ok(/la espera baja/.test(texto), 'el desglose explica de donde sale la bajada', texto.slice(-160));
}

console.log('\n== 4. Cuando las horas extra no sirven para nada ==');
{
  // Coste arriba y plazo igual: es el caso que justifica decidir NO abrirlas, y hay
  // que decirlo claro. Sin umbral, un 0,3 % se colaria como «hallazgo».
  const normal = informe({ coste: 1000, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 5 });
  const extra = informe({ coste: 1100, prima: 100, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 5 });

  const notas = notasDeEficiencia(compararPlanes(normal, extra));
  const texto = notas.map((n) => n.texto).join(' | ');

  ok(/el plazo NO cambia/.test(texto), 'se dice que el plazo no cambia');
  ok(/solo añade factura/.test(texto), 'y que abrirlas solo anade factura');
  ok(notas.some((n) => n.nivel === 'mal'), 'marcado como malo (es una decision a evitar)');

  // Por debajo del umbral, no hay hallazgo: es redondeo.
  const casi = informe({ coste: 1000.5, dias: [ [ '2026-09-15', 100 ] ], diasNaturales: 5 });
  const textoCasi = notasDeEficiencia(compararPlanes(normal, casi)).map((n) => n.texto).join(' | ');
  ok(/coinciden en coste y plazo/.test(textoCasi),
    `una diferencia por debajo del ${UMBRAL_PCT} % no es un hallazgo`, textoCasi.slice(0, 70));
  ok(!/pagas/.test(textoCasi), 'y no se redacta como si lo fuera');
}

console.log('\n== 5. Series acumuladas y techo COMPARTIDO ==');
{
  const normal = informe({ dias: [ [ '2026-09-15', 40 ], [ '2026-09-16', 40 ], [ '2026-09-17', 20 ] ] });
  const extra = informe({ dias: [ [ '2026-09-15', 60 ], [ '2026-09-16', 40 ] ] });

  const fechas = fechasUnidas(normal, extra);
  ok(fechas.length === 3, 'las fechas son la UNION de los dos planes', fechas.join(','));
  ok(fechas[0] === '2026-09-15' && fechas[2] === '2026-09-17', 'y van ordenadas por fecha real');

  const sn = serieAcumulada(normal, fechas);
  const se = serieAcumulada(extra, fechas);
  ok(JSON.stringify(sn) === JSON.stringify([ 40, 80, 100 ]), 'la serie normal ACUMULA', JSON.stringify(sn));
  // El dia que el plan con extras no trabajo cuenta 0 y mantiene el acumulado: es lo
  // que hace que la curva se pueda superponer con la del otro plan.
  ok(JSON.stringify(se) === JSON.stringify([ 60, 100, 100 ]),
    'y la del plan con extras mantiene el acumulado en los dias que no trabajo', JSON.stringify(se));

  // EL PUNTO DE TODO ESTO: un techo para los dos. Con uno por grafico, el plan lento
  // se dibujaria igual de alto que el rapido.
  const techo = techoComun(sn, se);
  ok(techo === 100, 'el techo comun cubre las DOS series', String(techo));
  ok(techo >= Math.max(...sn, ...se), 'y no recorta ninguna');

  // Y el caso que distingue de verdad un techo COMPARTIDO de uno por serie: series con
  // maximos distintos. Con los dos acabando en 100, mirar solo la primera daria el mismo
  // resultado y la comprobacion no probaria nada (es el fallo que tenia antes).
  ok(techoComun([ 10, 20 ], [ 15, 45 ]) === 50,
    'el techo sale de la serie MAS ALTA, no de la primera', String(techoComun([ 10, 20 ], [ 15, 45 ])));
  ok(techoComun([ 15, 45 ], [ 10, 20 ]) === techoComun([ 10, 20 ], [ 15, 45 ]),
    'y da lo mismo el orden en que se pasen las series');

  // Techo con numeros redondos: las lineas de referencia caen en cifras legibles.
  ok(techoRedondo(87) === 100, 'el techo se redondea a un numero legible (87 -> 100)', String(techoRedondo(87)));
  ok(techoRedondo(101) === 150, 'y por encima del escalon pasa al siguiente (101 -> 150)', String(techoRedondo(101)));
  ok(techoRedondo(0) === 1 && techoRedondo(-5) === 1, 'sin datos el techo es 1 (no 0: dividiria por cero)');
  ok(techoComun([ 0 ], [ 0 ]) === 1, 'y con todo a cero tambien');

  // Un informe sin dailyCompletions (modelo raro) no puede reventar el resumen.
  ok(JSON.stringify(serieAcumulada({}, fechas)) === JSON.stringify([ 0, 0, 0 ]),
    'un informe sin datos diarios da ceros en vez de lanzar');
  ok(fechasUnidas({}, {}).length === 0, 'y no inventa fechas');
}

console.log('\n== 6. Las fechas se leen sin corrimiento de huso ==');
{
  // `new Date('2026-09-15')` se interpreta como UTC, y en Mexico eso adelanta el dia:
  // el 15 se dibujaria como 14. Por eso las partes se parten a mano.
  ok(etiquetaDeFecha('2026-09-15') === '15 sep', 'el dia no se corre', etiquetaDeFecha('2026-09-15'));
  ok(etiquetaDeFecha('2026-01-01') === '1 ene', 'y el año nuevo tampoco', etiquetaDeFecha('2026-01-01'));
  ok(etiquetaDeFecha('2026-12-31') === '31 dic', 'ni el ultimo dia del año');
  ok(etiquetaDeFecha('raro') === 'raro', 'una fecha con otro formato se devuelve tal cual');
}

console.log('\n== 7. El grafico es SVG y lleva sus numeros ==');
{
  const normal = informe({ dias: [ [ '2026-09-15', 40 ], [ '2026-09-16', 40 ], [ '2026-09-17', 20 ] ] });
  const fechas = fechasUnidas(normal);
  const serie = serieAcumulada(normal, fechas);
  const svg = svgAcumulada({
    titulo: 'Plan normal — 100 piezas en 3 días', series: serie, fechas,
    techo: 100, color: COLOR_PLAN.normal
  });

  ok(/^[\s]*<svg[\s\S]*<\/svg>[\s\S]*$/.test(svg), 'devuelve un SVG');
  ok(!/<script/i.test(svg), 'y SIN script (dentro de innerHTML no se ejecutaria nunca)');
  ok(/viewBox="0 0 640 200"/.test(svg), 'con viewBox, para que escale sin deformarse');
  ok(/role="img"/.test(svg) && /aria-label="Plan normal/.test(svg),
    'y con role y aria-label, que es lo que lo hace legible por lector de pantalla');
  ok(/Plan normal — 100 piezas en 3 días/.test(svg), 'el titulo va DENTRO del grafico (se lee al imprimir)');
  ok(/>100<\/text>/.test(svg), 'y el total aparece como etiqueta directa, sin leyenda');

  // Los dos graficos tienen que hablar el mismo idioma visual: mismo numero de
  // referencias y mismo eje. Se comprueba que las 5 referencias esten.
  const referencias = (svg.match(/stroke="#e6e8eb"/g) || []).length;
  ok(referencias === 5, 'la rejilla tiene 5 referencias (menos lineas que datos)', String(referencias));
  ok((svg.match(/text-anchor="middle"/g) || []).length <= 6,
    'y las etiquetas del eje X se espacian en vez de amontonarse');

  // Un solo dia: no puede dividir por cero ni salir sin punto.
  const unDia = svgAcumulada({ titulo: 'x', series: [ 5 ], fechas: [ '2026-09-15' ], techo: 10, color: '#000' });
  ok(/<polyline/.test(unDia) && /<circle/.test(unDia), 'con un solo dia dibuja el punto igual');
  ok(!/NaN/.test(unDia), 'y sin NaN en las coordenadas');

  const vacio = svgAcumulada({ titulo: 'x', series: [], fechas: [], techo: 10, color: '#000' });
  ok(!/NaN/.test(vacio), 'sin datos tampoco hay NaN');
}

console.log('\n== 8. Los colores de los dos planes estan declarados ==');
{
  // Salen de la paleta validada por contraste y daltonismo. El par anterior (azul
  // claro y naranja claro) NO pasaba: 2,04:1 y se perdia con el rojo-verde.
  ok(COLOR_PLAN.normal === '#1d4ed8' && COLOR_PLAN.extra === '#b45309',
    'los dos planes tienen color propio', `${COLOR_PLAN.normal} / ${COLOR_PLAN.extra}`);
  ok(COLOR_PLAN.normal !== COLOR_PLAN.extra, 'y son distintos entre si');
  ok(deltaPct(100, 0) === 0, 'un delta sobre base no divide por cero');
}

console.log('\n== 15. Los TRES escenarios de horas extra ==');
{
  // El informe decia «no cumple el tope legal» y ahi se acababa. El cliente pregunta lo unico
  // que le importa -«¿y si lo cumpliera?»- y la respuesta es una tabla de tres escenarios.
  ok(ESCENARIOS_EXTRA.length === 3, 'hay tres escenarios, no dos',
    ESCENARIOS_EXTRA.map((e) => e.etiqueta).join(' | '));
  ok(ESCENARIOS_EXTRA.map((e) => e.clave).join(',') === 'normal,legal,extra',
    'y en el orden del mas lento al mas rapido, para que la tabla se lea como una escala');
  // Los tres colores DISTINTOS: dos escenarios con el mismo color en el grafico de tres curvas
  // serian indistinguibles, que es justo lo que la comparacion viene a evitar.
  const colores = [ COLOR_PLAN.normal, COLOR_PLAN.legal, COLOR_PLAN.extra ];
  ok(new Set(colores).size === 3, 'y cada uno con su color', colores.join(' / '));
  ok(ESCENARIOS_EXTRA.every((e) => e.detalle && e.detalle.length > 20),
    'los tres explican QUE son, no solo como se llaman');
}

console.log('\n== 16. Cumplir la ley: la tabla y la nota ==');
{
  // El escenario «legal» cumple por construccion; el «sin tope» no. Es la unica afirmacion
  // que el cliente va a querer comprobar, asi que se lee del cumplimiento del motor.
  const informe = (completadas, costo, dias, cumple) => ({
    completedInstances: completadas, totalCost: costo, totalWorkingDays: dias,
    compliance: { semanasSobreLimite: cumple ? 0 : 3, diasSobreLimiteDiario: 0, semanasSobreDias: 0 }
  });

  const base = informe(100, 10000, 20, true);
  ok(cumpleLaLey(base) === true, 'un informe sin excesos cumple');
  ok(cumpleLaLey(informe(100, 10000, 20, false)) === false, 'y uno con semanas sobre el limite no');
  ok(cumpleLaLey(null) === null, 'sin informe no se afirma nada (null, no false)');
  ok(cumpleLaLey({}) === null, 'ni sin datos de cumplimiento');

  const cmp = compararEscenarios({
    normal: informe(80, 9000, 25, true),
    legal: informe(95, 11000, 22, true),
    extra: informe(100, 12000, 20, false)
  });
  ok(cmp.filas.length === 3, 'la comparativa trae las tres filas', String(cmp.filas.length));
  ok(cmp.base.clave === 'normal', 'y la referencia es el plan sin extra');
  ok(cmp.filas[1].costoPorPieza != null, 'cada fila lleva su costo por pieza',
    cmp.filas.map((f) => f.costoPorPieza && f.costoPorPieza.toFixed(2)).join(' / '));
  ok(cmp.filas.every((f) => typeof f.cumple === 'boolean'),
    'y si cumple o no la ley', cmp.filas.map((f) => `${f.etiqueta}:${f.cumple}`).join(' '));

  // La nota: con MENOS produccion, el precio de la legalidad en numeros.
  const nota = notaDelTopeLegal(cmp);
  ok(/menos piezas/.test(nota), 'con menos produccion la nota dice cuanto se pierde', nota);
  ok(/Cumplir la ley/.test(nota), 'y empieza nombrando la decision');
}

console.log('\n== 17. La nota del tope legal distingue los tres desenlaces ==');
{
  const inf = (completadas, costo, cumple) => ({
    completedInstances: completadas, totalCost: costo, totalWorkingDays: 20,
    compliance: { semanasSobreLimite: cumple ? 0 : 2, diasSobreLimiteDiario: 0, semanasSobreDias: 0 }
  });

  // DESENLACE 1: misma produccion y MENOS costo. Es el hallazgo que justifica el analisis:
  // las horas extra libres no estaban comprando nada.
  const mismoYMasBarato = compararEscenarios({
    normal: inf(100, 9000, true), legal: inf(100, 9500, true), extra: inf(100, 12000, false)
  });
  const n1 = notaDelTopeLegal(mismoYMasBarato);
  ok(/mismas piezas/.test(n1) && /menos/.test(n1),
    'misma produccion y menos costo: la extra libre se estaba tirando', n1);

  // DESENLACE 2: misma produccion y MAS costo. El cuello NO es el reloj.
  const mismoYMasCaro = compararEscenarios({
    normal: inf(100, 9000, true), legal: inf(100, 13000, true), extra: inf(100, 12000, false)
  });
  const n2 = notaDelTopeLegal(mismoYMasCaro);
  ok(/mismas piezas/.test(n2) && /más/.test(n2),
    'misma produccion y mas costo: el limite no es el reloj', n2);
  ok(/recursos|colas|reprocesos/.test(n2),
    'y la nota dice donde mirar en vez de dejarlo en el aire');

  // DESENLACE 3: la ley cuesta oportunidad, y se pone en cifra.
  const pierdeProduccion = compararEscenarios({
    normal: inf(80, 8000, true), legal: inf(90, 10000, true), extra: inf(100, 12000, false)
  });
  const n3 = notaDelTopeLegal(pierdeProduccion);
  ok(/precio de la legalidad/.test(n3), 'con menos produccion, la nota habla del precio',
    n3);

  // Sin diferencia apreciable, la nota NO inventa un hallazgo: una nota que dijera «sube un
  // 0,4 %» ensenaria a desconfiar de todas las demas.
  const iguales = compararEscenarios({
    normal: inf(100, 10000, true), legal: inf(100, 10020, true), extra: inf(100, 10010, false)
  });
  const n4 = notaDelTopeLegal(iguales);
  ok(/no cambia/.test(n4), 'sin diferencia apreciable lo dice, en vez de exagerarla', n4);

  // Sin los tres informes no hay comparativa, y no revienta.
  ok(compararEscenarios(null) === null, 'sin informes no hay comparativa');
  ok(compararEscenarios({}) === null, 'ni sin el plan base, que es la referencia');
  ok(compararEscenarios({ legal: inf(1, 1, true) }) === null,
    'y sin plan normal tampoco: no habria contra que comparar');
  ok(notaDelTopeLegal(null) === null, 'y la nota sin comparativa es null');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
