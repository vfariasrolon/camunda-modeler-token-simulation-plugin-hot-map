// PROCESO POR CUPO: N piezas a la vez, y salen las N juntas.
//
// Codigo REAL del plugin, copiado por build.mjs. Se prueba aqui porque son decisiones de politica
// -cuando arranca un cupo- y aritmetica de tiempos, y las dos se pueden fijar con casos escritos a
// mano. La consecuencia que hay que entender -el cupo mejora el throughput y EMPEORA la latencia-
// solo se ve mirando los dos numeros juntos, que es lo que este arnes hace.
import {
  decidirArranqueDeCupo, cicloPorPieza, esperaDeFormacion, problemasDeCupo,
  ARRANCA_AL_LLENAR, ARRANCA_CON_LO_QUE_HAYA
} from './ProcesoPorCupo.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

console.log('\n== 1. Arrancar al llenar: el carro que espera a llenarse ==');
{
  // El caso del USUARIO: «en un carro de transporte a veces necesitamos llenarlo para moverlo».
  const base = { politica: ARRANCA_AL_LLENAR, cupo: 20 };

  ok(decidirArranqueDeCupo({ ...base, enEspera: 0 }).arranca === false,
    'sin piezas no arranca');
  ok(decidirArranqueDeCupo({ ...base, enEspera: 7 }).arranca === false,
    'con 7 de 20 NO arranca: mueve a medio cargar es tirar un viaje');
  ok(/7 de 20/.test(decidirArranqueDeCupo({ ...base, enEspera: 7 }).motivo),
    'y el motivo dice cuantas faltan, no solo que espera',
    decidirArranqueDeCupo({ ...base, enEspera: 7 }).motivo);
  ok(decidirArranqueDeCupo({ ...base, enEspera: 19 }).arranca === false,
    'con 19 de 20 tampoco');
  ok(decidirArranqueDeCupo({ ...base, enEspera: 20 }).arranca === true,
    'al llegar a 20 SI arranca');
  ok(decidirArranqueDeCupo({ ...base, enEspera: 20 }).tanda === 20,
    'y la tanda es de 20', String(decidirArranqueDeCupo({ ...base, enEspera: 20 }).tanda));
  ok(decidirArranqueDeCupo({ ...base, enEspera: 34 }).tanda === 20,
    'con 34 en espera arranca una tanda de 20 y deja 14 para la siguiente',
    String(decidirArranqueDeCupo({ ...base, enEspera: 34 }).tanda));
}

console.log('\n== 2. Arrancar con lo que haya: el horno que no puede quedarse sin carga ==');
{
  const base = { politica: ARRANCA_CON_LO_QUE_HAYA, cupo: 20 };

  ok(decidirArranqueDeCupo({ ...base, enEspera: 1 }).arranca === true,
    'con UNA pieza arranca: no se queda encendido sin carga');
  ok(decidirArranqueDeCupo({ ...base, enEspera: 1 }).tanda === 1,
    'y la tanda es de 1', String(decidirArranqueDeCupo({ ...base, enEspera: 1 }).tanda));
  ok(decidirArranqueDeCupo({ ...base, enEspera: 7 }).tanda === 7,
    'con 7 procesa las 7, no espera a 20', String(decidirArranqueDeCupo({ ...base, enEspera: 7 }).tanda));
  ok(decidirArranqueDeCupo({ ...base, enEspera: 25 }).tanda === 20,
    'y con 25 no se pasa del cupo: la tanda es 20 y quedan 5',
    String(decidirArranqueDeCupo({ ...base, enEspera: 25 }).tanda));
  ok(decidirArranqueDeCupo({ ...base, enEspera: 0 }).arranca === false,
    'sin piezas tampoco arranca un horno');
}

console.log('\n== 3. La ULTIMA tanda no espera a llenar, y sin esto se atasca ==');
{
  // ESTE ES EL CASO QUE CAZA EL BUG MUERTO. Un carro que espera 20 piezas con un pedido de 15:
  // si la ultima tanda esperara a llenar, NO ARRANCARIA NUNCA y la corrida terminaria con 15
  // piezas sin mover. El motor no tendria de donde sacar las 5 que faltan.
  const d = decidirArranqueDeCupo({
    politica: ARRANCA_AL_LLENAR, cupo: 20, enEspera: 15, esUltimaTanda: true
  });
  ok(d.arranca === true,
    'la ultima tanda arranca con 15 de 20 (si no, quedaria atascada para siempre)');
  ok(d.tanda === 15, 'y la tanda es de 15', String(d.tanda));
  ok(/no hay más piezas/.test(d.motivo),
    'el motivo dice que ya no van a llegar mas', d.motivo);

  // Y con politica inmediata, la ultima tanda tambien funciona: no se rompe lo que ya iba bien.
  const e = decidirArranqueDeCupo({
    politica: ARRANCA_CON_LO_QUE_HAYA, cupo: 20, enEspera: 3, esUltimaTanda: true
  });
  ok(e.arranca === true && e.tanda === 3, 'y con politica inmediata, tambien',
    String(e.tanda));
}

console.log('\n== 4. El tiempo del CUPO no es el tiempo de la PIEZA ==');
{
  // El error que hace parecer que un horno es 20 veces mas lento de lo que es: 100 minutos para
  // 20 piezas son 5 minutos POR PIEZA.
  ok(cicloPorPieza(100, 20) === 5, '100 min para 20 piezas son 5 min por pieza',
    String(cicloPorPieza(100, 20)));
  ok(cicloPorPieza(100, 1) === 100, 'con cupo de 1, el ciclo por pieza es el tiempo entero');
  ok(cicloPorPieza(100, 0) === null, 'sin piezas no hay ciclo que calcular',
    String(cicloPorPieza(100, 0)));
  ok(cicloPorPieza(0, 20) === 0, 'un tiempo de cero da ciclo cero');

  // LA CONSECUENCIA: el cupo mejora el throughput y EMPEORA la latencia. Las dos cifras tienen que
  // poder mirarse juntas o el lector optimizara la equivocada.
  const porPiezaSuelto = 5;
  const porPiezaEnCupo = cicloPorPieza(100, 20);
  ok(porPiezaEnCupo === porPiezaSuelto,
    'el ciclo por pieza en cupo iguala al proceso suelto de 5 min: mismo throughput',
    `${porPiezaEnCupo} vs ${porPiezaSuelto}`);
}

console.log('\n== 5. La espera de formacion: el precio del cupo ==');
{
  // Una pieza que llega justo despues de que el cupo arranco espera el cupo ENTERO. Es invisible si
  // solo se informa el tiempo de ciclo, y es la razon de que la primera pieza de una tina pueda
  // esperar una hora aunque el ciclo por pieza sea de dos minutos.
  ok(esperaDeFormacion(0, 100) === 100, 'una pieza que llega al principio espera el cupo entero',
    String(esperaDeFormacion(0, 100)));
  ok(esperaDeFormacion(95, 100) === 5, 'y la que llega al final, solo el resto',
    String(esperaDeFormacion(95, 100)));
  ok(esperaDeFormacion(100, 100) === 0, 'la que llega justo al arrancar no espera',
    String(esperaDeFormacion(100, 100)));
  // Nunca negativa: si la pieza llega despues del arranque, no hay espera que imputar.
  ok(esperaDeFormacion(120, 100) === 0, 'una llegada posterior al arranque da cero, no negativo',
    String(esperaDeFormacion(120, 100)));
  ok(esperaDeFormacion(undefined, 100) === null, 'sin datos no se inventa una espera',
    String(esperaDeFormacion(undefined, 100)));
}

console.log('\n== 6. Validacion: un cupo mal puesto no da error, da un proceso distinto ==');
{
  ok(problemasDeCupo({ cupo: 20, politica: ARRANCA_AL_LLENAR, tiempoDelCupo: 100 }).length === 0,
    'una configuracion correcta no da problemas');
  // Cupo de 1 se ACEPTA a proposito: es «una pieza a la vez», el comportamiento de siempre.
  ok(problemasDeCupo({ cupo: 1, politica: ARRANCA_CON_LO_QUE_HAYA, tiempoDelCupo: 5 }).length === 0,
    'un cupo de 1 es valido: es una pieza a la vez');

  const noEntero = problemasDeCupo({ cupo: 2.5, politica: ARRANCA_AL_LLENAR, tiempoDelCupo: 100 });
  ok(noEntero.length === 1 && /entero/.test(noEntero[0]),
    'un cupo fraccionario se rechaza', noEntero[0]);
  const cero = problemasDeCupo({ cupo: 0, politica: ARRANCA_AL_LLENAR, tiempoDelCupo: 100 });
  ok(cero.length === 1 && /entero ≥ 1/.test(cero[0]),
    'un cupo de cero se rechaza nombrando el minimo', cero[0]);
  const politica = problemasDeCupo({ cupo: 10, politica: 'cuando-sea', tiempoDelCupo: 100 });
  ok(politica.length === 1 && /política/.test(politica[0]),
    'una politica desconocida se rechaza diciendo las validas', politica[0]);
  const tiempo = problemasDeCupo({ cupo: 10, politica: ARRANCA_AL_LLENAR, tiempoDelCupo: 0 });
  ok(tiempo.length === 1 && /mayor que 0/.test(tiempo[0]),
    'un tiempo de cero se rechaza', tiempo[0]);

  // Los problemas se ACUMULAN: no se para en el primero, para que el usuario arregle todo de una vez.
  const varios = problemasDeCupo({ cupo: -1, politica: 'x', tiempoDelCupo: -5 });
  ok(varios.length === 3, 'los tres problemas salen juntos, no de uno en uno',
    String(varios.length));
}

console.log('\n== 7. Una pieza a la vez es el caso de siempre ==');
{
  // La compatibilidad: un diagrama que no declara cupo no puede cambiar de comportamiento. El cupo
  // de 1 con politica inmediata es exactamente «procesa esta pieza y liberala», que es lo que el
  // motor hacia antes de que existiera esto.
  const d = decidirArranqueDeCupo({
    politica: ARRANCA_CON_LO_QUE_HAYA, cupo: 1, enEspera: 1
  });
  ok(d.arranca === true && d.tanda === 1, 'cupo 1 e inmediato: arranca con la pieza que llega',
    `${d.arranca}, tanda ${d.tanda}`);
  ok(cicloPorPieza(30, 1) === 30, 'y el ciclo es el tiempo entero, como antes');

  // Con politica de llenado y cupo 1 tambien arranca siempre: una pieza llena un cupo de una.
  const e = decidirArranqueDeCupo({ politica: ARRANCA_AL_LLENAR, cupo: 1, enEspera: 1 });
  ok(e.arranca === true, 'y cupo 1 con llenado tambien arranca: una pieza ya llena el cupo');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
