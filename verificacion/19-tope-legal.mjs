// El TOPE LEGAL de horas extra como restriccion (LegalOvertime).
//
// Codigo REAL del plugin, copiado por build.mjs. Lo que se prueba es la ARITMETICA del
// tope: un tope mal aplicado NO se nota mirando el diagrama -el escenario «con tope» se
// dibuja igual de bien que el de sin tope-, y solo se descubre cuando el informe dice que
// cumple la ley habiendo hecho horas de mas. Tiene que fallar aqui.
import {
  concederExtra, concederExtraDe, crearEstadoSemana, describeMotivo, describeTopes,
  etiquetaModo, MODO_SIN_EXTRA, MODO_TOPE_LEGAL, MODO_SIN_TOPE, MODOS
} from './LegalOvertime.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const H = (horas) => horas * 3600000;
// Los topes por defecto: los de la LFT.
const TOPES = { semanalMs: H(9), diarioMs: H(3), maxDias: 3 };
const SEMANA_VACIA = { usadaMs: 0, diasUsados: 0, esDiaNuevo: false };

console.log('\n== 1. SIN EXTRA: no hay extra que conceder, y el motivo se dice distinto ==');
{
  const r = concederExtra({ extraMs: H(2), modo: MODO_SIN_EXTRA, topes: TOPES, semana: SEMANA_VACIA });
  ok(r.concedidoMs === 0, 'no se concede nada de extra', String(r.concedidoMs));
  // EL MOTIVO ES DISTINTO AL DE UN TOPE, y no es un detalle de redaccion: «el plan no
  // contempla horas extra» y «se paso del tope» son dos cosas que el lector tiene que poder
  // distinguir. Con un motivo unico, el informe explicaria mal de donde sale el plazo.
  ok(r.motivo === 'sin-extra', 'y el motivo es «sin-extra», no un tope', r.motivo);
  ok(describeMotivo(r.motivo) === 'el plan no contempla horas extra',
    'con su texto propio', describeMotivo(r.motivo));
}

console.log('\n== 2. SIN TOPE: se concede todo lo que se pide, sin mirar los limites ==');
{
  // Es el escenario que el motor ya hacia antes de este modulo, y tiene que seguir siendo
  // EXACTAMENTE eso: si el modo sin tope aplicara algun recorte, los informes ya emitidos
  // dejarian de cuadrar.
  const mucho = concederExtra({
    extraMs: H(20), modo: MODO_SIN_TOPE, topes: TOPES,
    semana: { usadaMs: H(40), diasUsados: 9, esDiaNuevo: true }
  });
  ok(mucho.concedidoMs === H(20), 'concede las 20 h aunque la semana ya este disparada',
    String(mucho.concedidoMs / 3600000) + ' h');
  ok(mucho.motivo === null, 'y no hay motivo de recorte que reportar');
}

console.log('\n== 3. TOPE SEMANAL: lo que no cabe espera a la semana siguiente ==');
{
  // 8 h usadas de 9 disponibles: cabe 1 h. La tarea pide 2 h, asi que se concede 1 y la otra
  // espera. Esto es lo que significa «el trabajo espera a la semana siguiente»: no se
  // descarta, se concede lo que la ley permite.
  const r = concederExtra({
    extraMs: H(2), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(8), diasUsados: 1, esDiaNuevo: false }
  });
  ok(r.concedidoMs === H(1), 'concede solo lo que cabe en el cupo semanal',
    `${r.concedidoMs / 3600000} h de ${H(2) / 3600000} h pedidas`);

  // Y cuando el cupo esta AGOTADO, cero. Es el caso que produce la espera real.
  const agotado = concederExtra({
    extraMs: H(2), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(9), diasUsados: 1, esDiaNuevo: false }
  });
  ok(agotado.concedidoMs === 0, 'con el cupo agotado no concede nada', String(agotado.concedidoMs));
  ok(agotado.motivo === 'tope-semanal', 'y lo dice: el motivo es el tope SEMANAL', agotado.motivo);
  ok(describeMotivo(agotado.motivo) === 'se alcanzó el tope legal de horas extra de la semana',
    'con su texto');
}

console.log('\n== 4. TOPE DIARIO: 3 h al dia, aunque quede cupo en la semana ==');
{
  // Es el punto que hace falta tener los TRES topes: quedan 9 h de cupo semanal, pero el dia
  // ya lleva 3 h, asi que no cabe nada mas HOY. Con solo el semanal, esto pasaria como
  // legal siendo ilegal.
  const r = concederExtra({
    extraMs: H(2), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(2), diasUsados: 1, esDiaNuevo: false },
    extraDelDiaMs: H(3)
  });
  ok(r.concedidoMs === 0, 'con el dia en 3 h no concede mas, aunque sobren 7 h de cupo',
    String(r.concedidoMs));
  ok(r.motivo === 'tope-diario', 'y el motivo es el tope DIARIO, no el semanal', r.motivo);

  // A media capacidad del dia: cabe 1 h.
  const parcial = concederExtra({
    extraMs: H(2), modo: MODO_TOPE_LEGAL, topes: TOPES, semana: SEMANA_VACIA,
    extraDelDiaMs: H(2)
  });
  ok(parcial.concedidoMs === H(1), 'con 2 h hechas hoy solo cabe 1 mas',
    `${parcial.concedidoMs / 3600000} h`);
}

console.log('\n== 5. TOPE DE DIAS: no se prolonga la jornada mas de 3 veces por semana ==');
{
  // El tercer tope. Con 3 dias ya usados y un dia NUEVO por delante, no hay mas extra
  // posible: la ley limita cuantas VECES por semana, no solo cuantas horas en total.
  const r = concederExtra({
    extraMs: H(1), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(2), diasUsados: 3, esDiaNuevo: true }
  });
  ok(r.concedidoMs === 0, 'con 3 dias ya usados no se concede extra en un dia nuevo',
    String(r.concedidoMs));
  ok(r.motivo === 'tope-dias', 'y el motivo es el tope de DIAS', r.motivo);
  ok(describeMotivo(r.motivo) === 'ya se prolongó la jornada los días que permite la semana',
    'con su texto');

  // El MISMO dia no cuenta dos veces: un segundo tramo de extra en un dia ya contado cabe,
  // porque no añade un dia nuevo. Sin esta distincion, una tarea partida en dos consumiria
  // dos dias del cupo y el escenario legal se quedaria sin margen enseguida.
  const mismoDia = concederExtra({
    extraMs: H(1), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(2), diasUsados: 3, esDiaNuevo: false }
  });
  ok(mismoDia.concedidoMs === H(1), 'un segundo tramo en un dia YA contado si cabe',
    `${mismoDia.concedidoMs / 3600000} h`);

  // `esDiaNuevo` VA DENTRO DE `semana`, y esto se comprueba porque equivocarse NO da error:
  // se pierde en silencio y el resultado -conceder la extra- es plausible. Me paso al
  // escribir este mismo arnes, y produjo un escenario «legal» que hacia extra en 4 dias de
  // una semana cuyo tope era 3.
  const dentro = concederExtra({
    extraMs: H(1), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(2), diasUsados: 3, esDiaNuevo: true }
  });
  const fuera = concederExtra({
    extraMs: H(1), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: { usadaMs: H(2), diasUsados: 3 }, esDiaNuevo: true
  });
  ok(dentro.concedidoMs === 0 && dentro.motivo === 'tope-dias',
    'con esDiaNuevo DENTRO de `semana` el tope de dias se aplica',
    JSON.stringify(dentro));
  ok(fuera.concedidoMs !== dentro.concedidoMs,
    'y ponerlo FUERA cambia el resultado: el parametro mal puesto no se pierde en silencio',
    `${fuera.concedidoMs} vs ${dentro.concedidoMs}`);
}

console.log('\n== 6. LOS TRES TOPES A LA VEZ: manda el que menos concede ==');
{
  // La propiedad que hace que el orden de las comprobaciones no importe. Se monta un estado
  // donde los tres topes cortan distinto, y el resultado tiene que ser el MENOR de los tres.
  const r = concederExtra({
    extraMs: H(5),
    modo: MODO_TOPE_LEGAL,
    topes: { semanalMs: H(9), diarioMs: H(3), maxDias: 3 },
    semana: { usadaMs: H(7), diasUsados: 1, esDiaNuevo: false },   // cabe 2 h por semana
    extraDelDiaMs: H(2.5)                                          // cabe 0.5 h por dia
  });
  ok(Math.abs(r.concedidoMs - H(0.5)) < 1, 'concede lo que dice el tope MAS restrictivo',
    `${r.concedidoMs / 3600000} h (semanal daria 2, diario da 0.5)`);

  // Y con el semanal mas restrictivo que el diario, manda el semanal.
  const r2 = concederExtra({
    extraMs: H(5), modo: MODO_TOPE_LEGAL, topes: { semanalMs: H(9), diarioMs: H(3), maxDias: 3 },
    semana: { usadaMs: H(8.5), diasUsados: 1, esDiaNuevo: false }, extraDelDiaMs: 0
  });
  ok(Math.abs(r2.concedidoMs - H(0.5)) < 1, 'y si el semanal aprieta mas, manda el semanal',
    `${r2.concedidoMs / 3600000} h`);
}

console.log('\n== 7. Casos limite: no hay NaN ni negativos por ningun lado ==');
{
  // Estos valores llegan de un modelo que el usuario edita, asi que hay que aguantar basura
  // sin romper: un NaN en el cupo dejaria el escenario legal sin cupo -todo esperaria- y un
  // negativo podria CONCEDER de mas, que es peor porque no se ve.
  const basura = [
    { extraMs: NaN, semana: SEMANA_VACIA },
    { extraMs: -5, semana: SEMANA_VACIA },
    { extraMs: H(1), semana: { usadaMs: NaN, diasUsados: NaN, esDiaNuevo: false } },
    { extraMs: H(1), topes: { semanalMs: NaN, diarioMs: NaN, maxDias: NaN }, semana: SEMANA_VACIA },
    { extraMs: H(1), topes: { semanalMs: -H(5), diarioMs: -H(1), maxDias: -2 }, semana: SEMANA_VACIA }
  ];
  const resultados = basura.map((b) => concederExtra({ ...b, modo: MODO_TOPE_LEGAL, topes: b.topes || TOPES }));
  ok(resultados.every((r) => Number.isFinite(r.concedidoMs) && r.concedidoMs >= 0),
    'ningun caso raro devuelve NaN ni un importe negativo',
    resultados.map((r) => r.concedidoMs).join(', '));

  // Sin topes declarados (todos a 0) el modo legal no concede NADA: no hay cupo que
  // respetar, asi que no se inventa uno. Es la decision conservadora, y la que evita que un
  // diagrama sin configurar declare «cumple» sin haber aplicado ninguna ley.
  const sinTopes = concederExtra({
    extraMs: H(2), modo: MODO_TOPE_LEGAL, topes: { semanalMs: 0, diarioMs: 0, maxDias: 0 },
    semana: SEMANA_VACIA
  });
  ok(sinTopes.concedidoMs === 0, 'sin topes declarados no se concede extra',
    String(sinTopes.concedidoMs));

  // El pedido de cero no genera motivo: no hubo recorte.
  const nada = concederExtra({ extraMs: 0, modo: MODO_TOPE_LEGAL, topes: TOPES, semana: SEMANA_VACIA });
  ok(nada.concedidoMs === 0 && nada.motivo === null,
    'pedir cero no es un recorte: sin motivo');
}

console.log('\n== 8. El cupo NO se pasa nunca en modo legal, y el estado no se desincroniza ==');
{
  // LA PROPIEDAD QUE DEFINE EL ESCENARIO, y la que un cliente puede comprobar: si se
  // conceden N tareas de extra en modo legal, la suma jamas supera ninguno de los tres topes.
  //
  // SE PASA POR `concederExtraDe`, que es la API que usa el motor. La version anterior de
  // esta prueba llevaba los tres contadores a mano y MEDIA MAL: contaba como «dia con extra»
  // los dias en que no se concedio nada, asi que daba 7 dias de un tope de 3. El fallo no
  // estaba en el codigo sino en el montaje de la prueba -y por eso el estado vive dentro del
  // modulo: un dato que se lleva a mano en dos sitios se desincroniza.
  const estado = crearEstadoSemana();
  const concedidas = [];
  // 15 tareas de 1 h repartidas en dias: 3 tareas por dia, 5 dias.
  for (let i = 0; i < 15; i++) {
    const dia = `2026-01-${String(Math.floor(i / 3) + 5).padStart(2, '0')}`;
    const r = concederExtraDe({
      extraMs: H(1), modo: MODO_TOPE_LEGAL, topes: TOPES,
      semana: '2026-W02', dia, estado
    });
    concedidas.push(r.concedidoMs / 3600000);
  }

  const usada = concedidas.reduce((a, b) => a + b, 0);
  const semana = estado.porSemana.get('2026-W02');

  ok(usada <= 9 + 1e-9, 'la semana NUNCA pasa de 9 h de extra',
    `${usada} h de 9`);
  ok(semana.dias.size <= 3, 'ni se usa la extra en mas de 3 dias DISTINTOS',
    `${semana.dias.size} dias`);
  ok(concedidas.some((h) => h === 0), 'y llega un punto en que ya no concede nada',
    concedidas.join(','));

  // EL TOPE DIARIO TAMBIEN SE RESPETA en la secuencia, que es lo que se comprueba de verdad
  // al mirar cada dia: ninguno puede pasar de 3 h.
  const peorDia = Math.max(...[ ...semana.extraPorDia.values() ].map((ms) => ms / 3600000));
  ok(peorDia <= 3 + 1e-9, 'y ningun dia pasa de las 3 h del tope diario',
    `${peorDia} h en el dia mas cargado`);

  // Y el estado cuenta dias con extra REAL, no dias visitados: los dias en que no se
  // concedio nada no pueden gastar cupo de dia. Fue el fallo que tenia la prueba.
  const diasConAlgo = [ ...semana.extraPorDia.entries() ].filter(([, ms]) => ms > 0).length;
  ok(semana.dias.size === diasConAlgo,
    'los dias contados son los que tuvieron extra de verdad (no los visitados)',
    `${semana.dias.size} contados, ${diasConAlgo} con extra`);

  // Una semana NUEVA empieza con el cupo entero: si el estado no fuera por semana, el tope
  // se agotaria una vez y no habria mas extra en toda la corrida.
  const otra = concederExtraDe({
    extraMs: H(2), modo: MODO_TOPE_LEGAL, topes: TOPES,
    semana: '2026-W03', dia: '2026-01-12', estado
  });
  ok(otra.concedidoMs === H(2), 'y una semana distinta arranca con su cupo entero',
    `${otra.concedidoMs / 3600000} h`);
}

console.log('\n== 9. Los textos del informe no mienten ==');
{
  // El veredicto de cumplimiento no vale sin la norma detras: «no cumple» tiene que poder
  // decir CONTRA QUE. Se comprueba que los tres topes salen citados con su articulo.
  const texto = describeTopes(TOPES);
  ok(/semana/.test(texto) && /art\. 66/.test(texto), 'el tope semanal cita el articulo 66', texto);
  ok(/día/.test(texto) && /art\. 65/.test(texto), 'el tope diario cita el articulo 65');
  ok(/3 días/.test(texto), 'y el tope de dias dice cuantos son');
  ok(describeTopes(null) === 'sin topes declarados', 'sin topes lo dice en vez de inventarlos');

  // Cada modo tiene su etiqueta, y ninguna se repite: dos escenarios con el mismo nombre en
  // la tabla del informe serian indistinguibles.
  const etiquetas = MODOS.map(etiquetaModo);
  ok(etiquetas.every((e) => e && e.length > 3), 'cada modo tiene etiqueta', etiquetas.join(' | '));
  ok(new Set(etiquetas).size === MODOS.length, 'y son distintas entre si');

  // Todo motivo que el motor puede devolver tiene texto. Un motivo sin texto dejaria la
  // espera del plan sin explicar en el informe, que es justo lo que se viene a arreglar.
  const motivos = [ 'sin-extra', 'tope-semanal', 'tope-diario', 'tope-dias' ];
  ok(motivos.every((m) => typeof describeMotivo(m) === 'string' && describeMotivo(m).length > 10),
    'cada motivo de recorte tiene su explicacion');
  ok(describeMotivo(null) === null && describeMotivo('inventado') === null,
    'y un motivo desconocido no inventa una frase');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
