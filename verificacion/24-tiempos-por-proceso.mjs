// TIEMPOS POR PROCESO: cuando pasa cada token y cuanto se espera en cada paso.
//
// Codigo REAL del plugin, copiado por build.mjs. Se prueba aqui porque el modulo es ARITMETICA
// sobre una traza: con casos escritos a mano se puede forzar exactamente el patron que interesa
// -9 tokens que pasan directos y 1 que espera 40 minutos-, cosa que con una corrida real no se
// puede pedir. La media y el p90 de ese caso son el ejemplo que justifica los dos numeros.
import { resumenPorProceso, percentil, cuelloPorEspera, peorTransito } from './TiemposPorProceso.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const min = (n) => n * 60000;

console.log('\n== 1. percentil: interpolado y sin sorpresas ==');
{
  ok(percentil([], 0.5) === null, 'una lista vacia no tiene percentiles', String(percentil([], 0.5)));
  ok(percentil([7], 0.9) === 7, 'un solo valor es todos sus percentiles', String(percentil([7], 0.9)));
  ok(percentil([1, 2, 3, 4, 5], 0.5) === 3, 'la mediana de cinco valores es el de enmedio');
  ok(percentil([10, 0, 20], 0.5) === 10, 'y no depende del ORDEN de entrada', String(percentil([10, 0, 20], 0.5)));
  // El extremo: p90 de 10 valores ordenados 0..9 por interpolacion lineal.
  ok(Math.abs(percentil([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0.9) - 8.1) < 1e-9,
    'p90 interpola entre los dos vecinos', String(percentil([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0.9)));
}

console.log('\n== 2. La espera propia: de que llega a que empieza ==');
{
  const trazas = [
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'Cortar', llegoEn: min(0), empezoEn: min(0), terminoEn: min(10) }
    ] }
  ];
  const r = resumenPorProceso(trazas);
  ok(r.length === 1, 'un proceso, una fila', String(r.length));
  ok(r[0].esperaMin === 0, 'si empezo al llegar, la espera es CERO', String(r[0].esperaMin));
  ok(r[0].tokens === 1, 'y se cuenta un token', String(r[0].tokens));
  ok(r[0].porcentajeQueEspero === 0, 'y el 0 % espero', String(r[0].porcentajeQueEspero));

  // Ahora el token llega en 0 y empieza en 5: espero 5 minutos.
  const conEspera = resumenPorProceso([
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'Cortar', llegoEn: min(0), empezoEn: min(5), terminoEn: min(15) }
    ] }
  ]);
  ok(conEspera[0].esperaMin === 5, 'llego en 0 y empezo en 5: espero 5 min',
    String(conEspera[0].esperaMin));
  ok(conEspera[0].porcentajeQueEspero === 100, 'y el 100 % de los tokens espero');
}

console.log('\n== 3. El transito: desde que termino el paso ANTERIOR ==');
{
  // A termina en 10, B recibe al token en 25: 15 minutos de transito, y B empieza en 30
  // -5 de espera propia-. Las dos lecturas son distintas y las dos importan.
  const r = resumenPorProceso([
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'Cortar', llegoEn: min(0), empezoEn: min(0), terminoEn: min(10) },
      { procesoId: 'B', nombre: 'Soldar', llegoEn: min(25), empezoEn: min(30), terminoEn: min(60) }
    ] }
  ]);
  const b = r.find((f) => f.procesoId === 'B');
  ok(b.esperaMin === 5, 'la espera PROPIA de B son 5 min (llego 25, empezo 30)',
    String(b.esperaMin));
  ok(b.transitoMin === 15, 'y el TRANSITO son 15 min (A termino en 10, llego en 25)',
    String(b.transitoMin));

  // El PRIMER paso no tiene transito: no hay de donde venir. Poner 0 falsearia la media.
  const a = r.find((f) => f.procesoId === 'A');
  ok(a.transitoMin === null, 'el primer paso no tiene transito (no viene de ningun sitio)',
    String(a.transitoMin));
}

console.log('\n== 4. La media esconde el problema; el p90 lo dice ==');
{
  // 9 tokens pasan directos y 1 espera 40 minutos. Esto es el caso que justifica informar los dos
  // numeros: la media dice 4 y parece que no pasa nada; el p90 dice 40 y es la verdad de planta.
  const trazas = [];
  for (let i = 0; i < 9; i++) {
    trazas.push({ instanceId: i, pasos: [
      { procesoId: 'A', nombre: 'Cortar', llegoEn: min(i * 60), empezoEn: min(i * 60), terminoEn: min(i * 60 + 10) }
    ] });
  }
  trazas.push({ instanceId: 99, pasos: [
    { procesoId: 'A', nombre: 'Cortar', llegoEn: min(600), empezoEn: min(640), terminoEn: min(650) }
  ] });

  const a = resumenPorProceso(trazas)[0];
  ok(a.tokens === 10, 'diez tokens', String(a.tokens));
  ok(a.esperaMin === 4, 'la media es 4 min: parece que no pasa nada', String(a.esperaMin));
  // OJO CON ESTO, que es lo que enseña el caso: con 10 valores y UNO alto, el p90 por
  // interpolacion da 4 -la posicion 8,1 cae casi toda dentro de los ceros-. El p90 NO basta para
  // ver un caso aislado; hace falta el MAXIMO. Por eso el informe lleva los dos, y por eso esta
  // comprobacion fija el comportamiento real en vez del que uno esperaria.
  ok(a.esperaP90 === 4, 'el p90 interpolado es 4: con un caso aislado no basta', String(a.esperaP90));
  ok(a.esperaMax === 40, 'y el MAXIMO es 40: es el que delata el caso aislado', String(a.esperaMax));
  ok(a.esperaron === 1, 'solo uno espero', String(a.esperaron));
  ok(a.porcentajeQueEspero === 10, 'el 10 % de los tokens', String(a.porcentajeQueEspero));
  // La espera ACUMULADA es la que dice cuanto le cuesta al proceso entero.
  ok(a.esperaTotalMin === 40, 'y el total acumulado es 40 min', String(a.esperaTotalMin));
}

console.log('\n== 5. Se ordena por espera ACUMULADA, no por media ==');
{
  // Un proceso con 3 tokens y 40 min de espera cada uno cuesta 120 min; otro con 500 tokens y 1
  // min cuesta 500. El orden tiene que poner arriba lo que mas tiempo roba al proceso entero.
  const trazas = [];
  for (let i = 0; i < 3; i++) {
    trazas.push({ instanceId: i, pasos: [
      { procesoId: 'LENTO', nombre: 'Lento', llegoEn: min(0), empezoEn: min(40), terminoEn: min(45) }
    ] });
  }
  for (let i = 0; i < 500; i++) {
    trazas.push({ instanceId: 1000 + i, pasos: [
      { procesoId: 'MUCHOS', nombre: 'Muchos', llegoEn: min(i), empezoEn: min(i * 1 + 1), terminoEn: min(i + 5) }
    ] });
  }

  const r = resumenPorProceso(trazas);
  ok(r[0].procesoId === 'MUCHOS',
    'primero el de mas espera ACUMULADA (500 min), no el de mas espera media',
    `${r[0].procesoId} total=${r[0].esperaTotalMin} media=${r[0].esperaMin}`);
  const lento = r.find((f) => f.procesoId === 'LENTO');
  ok(lento.esperaMin === 40 && lento.esperaTotalMin === 120,
    'el de espera media alta sale despues pero con su media a la vista',
    `total=${lento.esperaTotalMin} media=${lento.esperaMin}`);
}

console.log('\n== 6. La cadencia: cada cuanto pasa un token ==');
{
  // Llegadas cada 30 minutos exactos. La cadencia es la MEDIANA de los intervalos, y con una
  // llegada tardia la mediana aguanta mientras la media se mueve.
  const trazas = [ 0, 30, 60, 90, 300 ].map((m, i) => ({ instanceId: i, pasos: [
    { procesoId: 'A', nombre: 'Cortar', llegoEn: min(m), empezoEn: min(m), terminoEn: min(m + 5) }
  ] }));

  const a = resumenPorProceso(trazas)[0];
  ok(a.tokens === 5, 'cinco tokens', String(a.tokens));
  ok(a.cadenciaMin === 30, 'la cadencia es 30 min', String(a.cadenciaMin));
  ok(a.primeraLlegadaMin === 0, 'la primera llegada', String(a.primeraLlegadaMin));
  ok(a.ultimaLlegadaMin === 300, 'y la ultima', String(a.ultimaLlegadaMin));

  // Un solo token no tiene cadencia: con un dato no se mide un intervalo.
  const uno = resumenPorProceso([ { instanceId: 1, pasos: [
    { procesoId: 'A', nombre: 'A', llegoEn: min(0), empezoEn: min(0), terminoEn: min(5) }
  ] } ]);
  ok(uno[0].cadenciaMin === null, 'con un solo token no hay cadencia', String(uno[0].cadenciaMin));
}

console.log('\n== 7. Los dos cuellos: por espera y por transito ==');
{
  // A tiene cola (mucha espera), B no tiene cola pero esta lejisimos (mucho transito). Son dos
  // problemas distintos y por eso hay dos funciones: uno se arregla con capacidad y el otro con
  // distancia.
  const trazas = [
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'Cola', llegoEn: min(0), empezoEn: min(50), terminoEn: min(60) },
      { procesoId: 'B', nombre: 'Lejos', llegoEn: min(200), empezoEn: min(200), terminoEn: min(210) }
    ] }
  ];
  const r = resumenPorProceso(trazas);

  const c = cuelloPorEspera(r);
  ok(c.procesoId === 'A', 'el cuello por ESPERA es el que tiene cola', c.procesoId);

  const t = peorTransito(r);
  ok(t.procesoId === 'B', 'el peor por TRANSITO es el que esta lejos', t.procesoId);

  // Y sin datos no revienta: devolver null es la respuesta honesta.
  ok(cuelloPorEspera([]) === null, 'sin filas no hay cuello por espera');
  ok(peorTransito([]) === null, 'ni por transito');
  ok(cuelloPorEspera(resumenPorProceso([
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'A', llegoEn: min(0), empezoEn: min(0), terminoEn: min(5) }
    ] }
  ])) === null, 'y sin ninguna espera tampoco: no hay cuello que señalar');
}

console.log('\n== 8. Datos sucios: la traza no puede reventar el informe ==');
{
  ok(resumenPorProceso(null).length === 0, 'sin trazas devuelve lista vacia');
  ok(resumenPorProceso([]).length === 0, 'y con lista vacia tambien');
  ok(resumenPorProceso([ {} ]).length === 0, 'un token sin pasos no aporta proceso');
  ok(resumenPorProceso([ { instanceId: 1, pasos: [] } ]).length === 0, 'y con pasos vacios tampoco');

  // Un paso sin `terminoEn` -el token se quedo a medias al acabar la corrida- no puede dar un
  // transito negativo ni NaN en la siguiente tarea.
  const r = resumenPorProceso([
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'A', llegoEn: min(0), empezoEn: min(0) },
      { procesoId: 'B', nombre: 'B', llegoEn: min(10), empezoEn: min(10), terminoEn: min(20) }
    ] }
  ]);
  const b = r.find((f) => f.procesoId === 'B');
  ok(b.transitoMin === null,
    'un paso anterior sin fin no inventa un transito', String(b.transitoMin));
  ok(b.esperaMin === 0, 'y su propia espera se mide igual', String(b.esperaMin));

  // Tiempos hacia atras: se recortan a cero en vez de dar negativos, que no significan nada.
  const haciaAtras = resumenPorProceso([
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'A', llegoEn: min(10), empezoEn: min(5), terminoEn: min(15) }
    ] }
  ]);
  ok(haciaAtras[0].esperaMin === 0, 'una espera negativa se recorta a cero',
    String(haciaAtras[0].esperaMin));
}

console.log('\n== 9. Varios tokens: el resumen los junta ==');
{
  const trazas = [
    { instanceId: 1, pasos: [
      { procesoId: 'A', nombre: 'Cortar', llegoEn: min(0), empezoEn: min(0), terminoEn: min(10) },
      { procesoId: 'B', nombre: 'Soldar', llegoEn: min(10), empezoEn: min(20), terminoEn: min(40) }
    ] },
    { instanceId: 2, pasos: [
      { procesoId: 'A', nombre: 'Cortar', llegoEn: min(30), empezoEn: min(30), terminoEn: min(40) },
      { procesoId: 'B', nombre: 'Soldar', llegoEn: min(40), empezoEn: min(40), terminoEn: min(60) }
    ] }
  ];
  const r = resumenPorProceso(trazas);
  ok(r.length === 2, 'dos procesos', String(r.length));

  const b = r.find((f) => f.procesoId === 'B');
  ok(b.tokens === 2, 'B recibio dos tokens', String(b.tokens));
  // Esperas de B: 10 y 0 -> media 5.
  ok(b.esperaMin === 5, 'con esperas 10 y 0, la media es 5', String(b.esperaMin));
  ok(b.esperaron === 1, 'y solo uno espero', String(b.esperaron));
  ok(b.porcentajeQueEspero === 50, 'el 50 %', String(b.porcentajeQueEspero));
  // Transitos de B: 0 y 0.
  ok(b.transitoMin === 0, 'los dos llegan justo al terminar A: transito cero', String(b.transitoMin));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
