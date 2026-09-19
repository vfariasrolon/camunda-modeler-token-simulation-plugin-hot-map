// LA RUTA DOMINANTE y la CUOTA DE RAMA (DominantRoute).
//
// Codigo REAL del plugin, copiado por build.mjs. Lo que se prueba es la ARITMETICA del
// recorrido: una ruta mal recorrida se pinta igual de bonita que una correcta, asi que el fallo
// no se ve mirando el diagrama. Tiene que fallar aqui.
//
// EL CASO PRINCIPAL ES EL DIAGRAMA REAL DEL USUARIO (`camunda/ejemplo.bpmn`), copiado con sus
// numeros exactos: 7000 casos, compuerta 80/20. Con el se reprodujo el reporte «deberia verse en
// rojo el camino mas usado pero se ve un poco mas diferente».
import {
  normalizarFlujos, cuotasDeRama, entradasDe, rutaDominante, formatearCuota
} from './DominantRoute.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

console.log('\n== 1. El diagrama real: 7000 casos, compuerta 80/20 ==');
{
  // Las 7 conexiones de `camunda/ejemplo.bpmn`, con los valores que produce el motor.
  // El tronco lleva los 7000 (el 100 %); la rama «si» el 80 % (5600); la «no» el 20 % (1400).
  const flujos = [
    { id: 'F_tr1', source: { id: 'inicio' }, target: { id: 'apertura' } },
    { id: 'F_tr2', source: { id: 'apertura' }, target: { id: 'compuerta' } },
    { id: 'F_si', source: { id: 'compuerta' }, target: { id: 'valida' } },
    { id: 'F_no', source: { id: 'compuerta' }, target: { id: 'solicita' } },
    { id: 'F_no2', source: { id: 'solicita' }, target: { id: 'fin_no' } },
    { id: 'F_si2', source: { id: 'valida' }, target: { id: 'escanea' } },
    { id: 'F_si3', source: { id: 'escanea' }, target: { id: 'fin_si' } }
  ];
  const valores = new Map([
    [ 'F_tr1', 7000 ], [ 'F_tr2', 7000 ],
    [ 'F_si', 5600 ], [ 'F_no', 1400 ], [ 'F_no2', 1400 ],
    [ 'F_si2', 5600 ], [ 'F_si3', 5600 ]
  ]);
  const valorDe = (id) => valores.get(id) || 0;

  const flujosPlanos = normalizarFlujos(flujos);
  ok(flujosPlanos.length === 7, 'las 7 conexiones se normalizan', String(flujosPlanos.length));
  ok(flujosPlanos.every((f) => f.desde && f.hasta), 'y todas con origen y destino');

  console.log('\n  CUOTAS DE RAMA (lo que ahora dice el color):');
  const cuotas = cuotasDeRama(flujosPlanos, valorDe);
  flujosPlanos.forEach((f) => {
    console.log(`    ${String(valores.get(f.id)).padStart(5)} tokens  ${formatearCuota(cuotas.get(f.id)).padStart(7)}  ${f.desde} -> ${f.hasta}`);
  });

  // LA CUOTA DEL TRONCO ES 100 %, y eso es correcto y es el punto: por ahi pasa todo. Lo que la
  // cuota arregla es que la rama deje de competir en volumen con el tronco y pase a decir su
  // probabilidad, que es lo que el consultor enuncia.
  ok(cuotas.get('F_tr1') === 1, 'el tronco lleva el 100 % de lo que sale del inicio',
    formatearCuota(cuotas.get('F_tr1')));
  ok(Math.abs(cuotas.get('F_si') - 0.8) < 1e-9, 'la rama «si» es el 80 % de la compuerta',
    formatearCuota(cuotas.get('F_si')));
  ok(Math.abs(cuotas.get('F_no') - 0.2) < 1e-9, 'y la «no» el 20 %', formatearCuota(cuotas.get('F_no')));
  // Las dos ramas suman 1: si no, el reparto de la compuerta esta mal y el mapa mentiria.
  ok(Math.abs(cuotas.get('F_si') + cuotas.get('F_no') - 1) < 1e-9,
    'y las dos ramas suman el 100 %, que es lo que hace fiable la lectura');

  console.log('\n  RUTA DOMINANTE (lo que se resalta con el halo):');
  const ruta = rutaDominante(flujosPlanos, valorDe);
  ruta.pasos.forEach((f, i) => console.log(`    ${i + 1}. ${f.desde} -> ${f.hasta}`));

  // LA PROPIEDAD QUE ARREGLA EL REPORTE: la ruta es la del 80 %, no la del tronco a secas. Pasa
  // por la rama «si» y NO por la «no».
  ok(ruta.ids.has('F_tr1') && ruta.ids.has('F_tr2'), 'la ruta incluye el tronco (es parte del camino)');
  ok(ruta.ids.has('F_si') && ruta.ids.has('F_si2') && ruta.ids.has('F_si3'),
    'y baja por la rama «si», que es la mas usada');
  ok(!ruta.ids.has('F_no') && !ruta.ids.has('F_no2'),
    'y NO pasa por la rama «no», que es la de menos trafico',
    `ids: ${[...ruta.ids].join(', ')}`);
  ok(ruta.pasos.length === 5, 'la ruta tiene 5 conexiones, de punta a punta', String(ruta.pasos.length));
  ok(ruta.desde === 'inicio' && ruta.hasta === 'fin_si',
    'y va del inicio a un fin, sin quedarse a medias', `${ruta.desde} -> ${ruta.hasta}`);

  // EL VALOR DE LA RUTA ES EL MINIMO, no la suma ni el maximo: es lo que atraviesa el camino
  // ENTERO. El maximo seria 7000 (el tronco) y exageraria el caudal de la ruta.
  ok(ruta.valor === 5600, 'y su caudal es el minimo del camino (5600), no el del tronco',
    String(ruta.valor));

  // LA ENTRADA se detecta sin que nadie la diga: `inicio` es origen y no destino de nada.
  ok(entradasDe(flujosPlanos).join(',') === 'inicio',
    'la entrada del proceso se deduce del grafo', entradasDe(flujosPlanos).join(', '));
}

console.log('\n== 2. Un bucle no cuelga el recorrido ==');
{
  // En un proceso con reproceso, el nodo con mas tokens puede volver a si mismo. Sin corte, el
  // recorrido no terminaria y la app se quedaria colgada pintando.
  const flujos = normalizarFlujos([
    { id: 'A', source: { id: 'n1' }, target: { id: 'n2' } },
    { id: 'B', source: { id: 'n2' }, target: { id: 'n3' } },
    { id: 'V', source: { id: 'n3' }, target: { id: 'n2' } },   // ← vuelve atras
    { id: 'C', source: { id: 'n3' }, target: { id: 'n4' } }
  ]);
  const valores = new Map([ [ 'A', 100 ], [ 'B', 90 ], [ 'V', 70 ], [ 'C', 20 ] ]);
  const ruta = rutaDominante(flujos, (id) => valores.get(id) || 0);

  ok(ruta.pasos.length <= 4, 'la ruta no da mas vueltas que conexiones hay',
    `${ruta.pasos.length} pasos`);
  // Con el bucle, en n2 la salida mas usada es A... no: A sale de n1. En n2 salen B (90) y
  // ninguna mas; la vuelta V entra a n2. En n3 salen V (70) y C (20): gana V, que vuelve a n2,
  // ya visitado → se corta. La ruta es n1→n2→n3 y para.
  ok(ruta.ids.has('A') && ruta.ids.has('B') && ruta.ids.has('V'),
    'y sigue la rama mas usada aunque sea la que vuelve', `ids: ${[...ruta.ids].join(',')}`);
  ok(!ruta.ids.has('C'), 'dejando fuera la rama con menos trafico');
}

console.log('\n== 3. Con empate el resultado es ESTABLE ==');
{
  // Un 50/50 simetrico. Si el empate se resolviera al azar, el halo parpadearia entre repintados
  // y un parpadeo se lee como un fallo de la app.
  const flujos = normalizarFlujos([
    { id: 'E1', source: { id: 'ini' }, target: { id: 'x' } },
    { id: 'E2', source: { id: 'ini' }, target: { id: 'y' } }
  ]);
  const igual = () => 50;
  const a = rutaDominante(flujos, igual);
  const b = rutaDominante(flujos, igual);
  const c = rutaDominante(flujos, igual);
  ok([ ...a.ids ].join(',') === [ ...b.ids ].join(',') && [ ...b.ids ].join(',') === [ ...c.ids ].join(','),
    'tres recorridos seguidos dan la MISMA ruta', [ ...a.ids ].join(','));
  ok(a.pasos.length === 1, 'y elige una sola de las dos ramas', String(a.pasos.length));
}

console.log('\n== 4. Con varias entradas gana la que mas mueve ==');
{
  // Un diagrama con dos inicios -uno real y uno de prueba- no puede resaltar el que no se usa.
  const flujos = normalizarFlujos([
    { id: 'P1', source: { id: 'prueba' }, target: { id: 'x' } },
    { id: 'R1', source: { id: 'real' }, target: { id: 'y' } },
    { id: 'R2', source: { id: 'y' }, target: { id: 'z' } }
  ]);
  const valores = new Map([ [ 'P1', 3 ], [ 'R1', 900 ], [ 'R2', 900 ] ]);
  const ruta = rutaDominante(flujos, (id) => valores.get(id) || 0);
  ok(ruta.desde === 'real', 'resalta la ruta del inicio que de verdad se usa', ruta.desde);
  ok(!ruta.ids.has('P1'), 'y deja fuera la del inicio de prueba');
}

console.log('\n== 5. Sin trafico no hay ruta que resaltar ==');
{
  // Resaltar un camino por el que no pasa nada afirmaria un uso que no existe. Mejor no pintar
  // halo, y que el aviso de «ramas sin trafico» haga su trabajo.
  const flujos = normalizarFlujos([
    { id: 'A', source: { id: 'n1' }, target: { id: 'n2' } },
    { id: 'B', source: { id: 'n2' }, target: { id: 'n3' } }
  ]);
  const cero = rutaDominante(flujos, () => 0);
  ok(cero.pasos.length === 0, 'sin trafico en ninguna conexion no hay ruta',
    String(cero.pasos.length));
  ok(cero.ids.size === 0 && cero.valor === 0, 'y no se inventa valor');

  // Basura por entrada: ni NaN ni excepciones.
  ok(rutaDominante(null, () => 1).pasos.length === 0, 'sin flujos no revienta');
  ok(rutaDominante([], () => 1).pasos.length === 0, 'ni con lista vacia');
  ok(rutaDominante(flujos, () => NaN).pasos.length === 0, 'un valor NaN no produce una ruta falsa');
  ok(rutaDominante(normalizarFlujos([ { id: 'X' } ]), () => 5).pasos.length === 0,
    'y un flujo sin origen ni destino se descarta al normalizar');

  // Pedir una entrada que no existe no rompe: devuelve una ruta vacia.
  ok(rutaDominante(flujos, () => 5, 'no-existe').pasos.length === 0,
    'una entrada inexistente devuelve ruta vacia');
}

console.log('\n== 6. La cuota se lee como la diria un consultor ==');
{
  // El redondeo importa: un «100 %» que en realidad es 99,6 % afirma una certeza que el dato no
  // tiene, y un «0 %» para algo que si paso es peor todavia.
  ok(formatearCuota(1) === '100 %', 'la certeza se dice entera', formatearCuota(1));
  ok(formatearCuota(0.996) === '100 %', 'y el 99,6 % tambien: partir 99,6 y 100 en dos textos no aporta',
    formatearCuota(0.996));
  ok(formatearCuota(0.8) === '80 %', 'una rama clara, sin decimales', formatearCuota(0.8));
  ok(formatearCuota(0.2) === '20 %', 'y la complementaria tambien', formatearCuota(0.2));
  ok(formatearCuota(0.043) === '4.3 %', 'una rama rara conserva un decimal, que es lo que la distingue de 0',
    formatearCuota(0.043));
  ok(formatearCuota(null) === '—' && formatearCuota(NaN) === '—',
    'y sin dato se dice «—», no un «0 %» que seria falso');

  // Las cuotas de un nodo sin trafico son `null` y no 0: «no paso nada» y «paso el 0 %» no son
  // lo mismo, y el 0 en la escala pintaria la conexion en el extremo frio como si fuera poco
  // trafico, cuando lo que hay es ninguno.
  const flujos = normalizarFlujos([
    { id: 'A', source: { id: 'n1' }, target: { id: 'n2' } },
    { id: 'B', source: { id: 'n1' }, target: { id: 'n3' } }
  ]);
  const cuotas = cuotasDeRama(flujos, () => 0);
  ok(cuotas.get('A') === null && cuotas.get('B') === null,
    'sin trafico la cuota es null, no 0', `${cuotas.get('A')} / ${cuotas.get('B')}`);
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
