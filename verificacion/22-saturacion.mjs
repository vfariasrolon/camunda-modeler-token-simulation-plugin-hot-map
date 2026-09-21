// DIAGNOSTICO DE SATURACION (CapacityGuard).
//
// Codigo REAL del plugin, copiado por build.mjs. Lo que se prueba son los UMBRALES y el TEXTO de
// la consecuencia, que es donde un criterio se cuela sin que nadie lo note: un aviso que dijera
// «va justo» sobre un rho de 1,4 seria peor que no avisar, porque el lector se lo cree.
//
// EL CASO PRINCIPAL ES REAL: el diagrama `bob_retrabajo.bpmn` del usuario, con lotes de 6 piezas,
// 25 tareas de segundos y piscinas de 1 unidad, dio rho = 1,4 y esperas de cientos de dias en un
// proceso que deberia tardar 15. El reporte fue «no me hace match», y era el resultado correcto de
// un modelo que no cierra.
import {
  diagnosticarCapacidad, avisosPorSaturacion,
  UMBRAL_SATURADO, UMBRAL_AL_LIMITE, UMBRAL_HOLGURA_JUSTA
} from './CapacityGuard.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

/** Utilizacion con la forma que le pasa el motor. */
const util = (name, rho, quantity = 1) => ({ name, utilization: rho, quantity });

console.log('\n== 1. El caso real de `bob`: rho = 1,4 y esperas de cientos de dias ==');
{
  const d = diagnosticarCapacidad([
    util('desempaque', 1.4),
    util('acomodo linea', 0.62),
    util('sistemas', 0.31)
  ]);

  ok(d.nivel === 'saturado', 'se detecta la saturacion', d.nivel);
  ok(/POR ENCIMA del 100/.test(d.titulo), 'y el titulo lo dice sin ambiguedad', d.titulo);
  ok(d.criticos.length === 1 && d.criticos[0].name === 'desempaque',
    'nombrando el recurso saturado', JSON.stringify(d.criticos));

  // LA CONSECUENCIA ES LO QUE HACE UTIL EL AVISO. No basta decir «saturado»: hay que decir que
  // los numeros dejan de significar algo, y POR QUE.
  ok(/no son representativos|NO son representativos/i.test(d.consecuencia),
    'y la consecuencia dice que los numeros no son representativos',
    d.consecuencia.slice(0, 90));
  ok(/dependen de CUÁNTO DURA|duran la corrida|dura la corrida/i.test(d.consecuencia),
    'explicando POR QUE: la cola crece y el resultado depende de la duracion',
    d.consecuencia.slice(60, 160));
  ok(Boolean(d.accion) && /capacidad|tasa de llegada|lote/i.test(d.accion),
    'y da una accion concreta, no solo el diagnostico', d.accion.slice(0, 80));
}

console.log('\n== 2. Los umbrales estan donde dicen ==');
{
  // El limite teorico: rho = 1 es la frontera. Justo por debajo siguen valiendo los numeros.
  ok(diagnosticarCapacidad([ util('x', 1.0001) ]).nivel === 'saturado',
    'un pelo por encima de 1 ya es saturado');
  ok(diagnosticarCapacidad([ util('x', UMBRAL_SATURADO) ]).nivel === 'saturado',
    'y exactamente 1 tambien: la cola ya no se estabiliza', String(UMBRAL_SATURADO));
  ok(diagnosticarCapacidad([ util('x', 0.999) ]).nivel === 'al-limite',
    'justo por debajo es «al limite», no «saturado»');
  ok(diagnosticarCapacidad([ util('x', 0.9) ]).nivel === 'al-limite',
    'y el corte del limite esta en 0,90', String(UMBRAL_AL_LIMITE));
  ok(diagnosticarCapacidad([ util('x', 0.85) ]).nivel === 'justo',
    'entre 0,80 y 0,90 es holgura justa', String(UMBRAL_HOLGURA_JUSTA));
  ok(diagnosticarCapacidad([ util('x', 0.5) ]).nivel === 'holgado',
    'y por debajo de 0,80 hay holgura');

  // LOS NUMEROS VALIDOS SE DICEN VALIDOS. Un aviso que dijera «riesgo» a rho = 0,5 ensenaria a
  // ignorar todos los avisos.
  ok(/válidos/.test(diagnosticarCapacidad([ util('x', 0.5) ]).consecuencia),
    'y cuando los numeros SI valen, se dice explicitamente');
  ok(diagnosticarCapacidad([ util('x', 0.5) ]).accion === null,
    'sin accion que dar cuando no hay nada que arreglar');
}

console.log('\n== 3. Varios recursos saturados: hay que nombrarlos TODOS ==');
{
  // Es el caso facil de equivocar: nombrar solo el peor deja al lector arreglando uno y volviendo
  // a simular para descubrir el siguiente.
  const d = diagnosticarCapacidad([
    util('desempaque', 2.1),
    util('acomodo linea', 1.3),
    util('sistemas', 0.4)
  ]);
  ok(d.nivel === 'saturado', 'con dos recursos por encima del 100 %', d.nivel);
  ok(d.criticos.length === 2, 'el diagnostico nombra los DOS saturados, no solo el peor',
    d.criticos.map((c) => c.name).join(', '));
  ok(/2 recurso/.test(d.titulo), 'y el titulo lo dice en plural', d.titulo);
  ok(!d.criticos.some((c) => c.name === 'sistemas'),
    'dejando fuera el que tiene holgura: no es un critico');
}

console.log('\n== 4. Sin recursos no se inventa un diagnostico ==');
{
  // Un modelo sin piscinas no puede tener cuello de botella de recursos: las esperas son cero. Es
  // una situacion distinta -y el texto tiene que ser distinto- de «este recurso esta saturado».
  const d = diagnosticarCapacidad([]);
  ok(d.nivel === 'sin-recursos', 'sin utilizacion el nivel es «sin-recursos»', d.nivel);
  ok(/no declara recursos/.test(d.titulo), 'y se dice que el modelo no los declara', d.titulo);
  ok(/esperas serán cero/.test(d.consecuencia),
    'explicando la consecuencia: sin recursos no hay cola que medir');
  ok(d.criticos.length === 0, 'y no hay criticos que nombrar');
  ok(diagnosticarCapacidad(null).nivel === 'sin-recursos', 'con null tampoco revienta');
  ok(diagnosticarCapacidad(undefined).nivel === 'sin-recursos', 'ni con undefined');
  // Filtra filas basura: un rho NaN no puede elegirse como «el peor» y salir impreso como «NaN».
  ok(diagnosticarCapacidad([ util('x', NaN), util('y', 0.5) ]).nivel === 'holgado',
    'y una fila con rho NaN no se toma por un recurso saturado');
}

console.log('\n== 5. El aviso cambia lo que dicen las OTRAS secciones ==');
{
  // Es la parte que convierte el aviso en algo util: no basta avisar arriba; cada afirmacion del
  // informe que deja de ser cierta tiene que decirlo en su propio sitio.
  const saturado = diagnosticarCapacidad([ util('desempaque', 1.4) ]);
  const avisos = avisosPorSaturacion(saturado);

  ok(avisos.ciclo && /plazo/.test(avisos.ciclo),
    'los percentiles de ciclo avisan de que no sirven como plazo', avisos.ciclo.slice(0, 80));
  ok(avisos.espera && /CUÁNTO|cuanto/.test(avisos.espera),
    'el Pareto de esperas dice que senala DONDE pero no CUANTO', avisos.espera.slice(0, 80));
  ok(avisos.planes && /ORDEN/.test(avisos.planes),
    'y la comparacion de planes vale como orden pero no como magnitud',
    avisos.planes.slice(0, 80));

  // EL CUMPLIMIENTO LEGAL SI VALE, y decirlo es tan importante como los otros avisos: el lector
  // que descarte TODO el informe por la saturacion perderia un hallazgo valido.
  ok(avisos.legal && /SÍ es válido|semanas reales/.test(avisos.legal),
    'y se aclara que el cumplimiento legal SI sigue valiendo', avisos.legal.slice(0, 80));

  // Cuando NO hay saturacion no se avisa de nada: un aviso permanente es ruido.
  const holgado = diagnosticarCapacidad([ util('x', 0.5) ]);
  const sinAvisos = avisosPorSaturacion(holgado);
  ok(!sinAvisos.ciclo && !sinAvisos.espera && !sinAvisos.planes,
    'sin saturacion no hay avisos que dar (nada de ruido permanente)');
  ok(!avisosPorSaturacion(null).ciclo, 'y sin diagnostico tampoco');
}

console.log('\n== 6. El caso de «al limite» NO invalida los numeros ==');
{
  // La distincion que no se puede perder: con rho = 0,95 la cola se estabiliza -los numeros
  // valen- pero la espera crece de forma no lineal. Decir «saturado» ahi seria mentir y asustar.
  const d = diagnosticarCapacidad([ util('x', 0.95) ]);
  ok(d.nivel === 'al-limite', 'rho = 0,95 es «al limite»', d.nivel);
  ok(/válidos/.test(d.consecuencia), 'y los numeros se declaran VÁLIDOS', d.consecuencia.slice(0, 60));
  ok(/no lineal/.test(d.consecuencia),
    'explicando lo que si pasa: la espera crece de forma no lineal');
  const avisos = avisosPorSaturacion(d);
  ok(!avisos.ciclo, 'y NO se invalida el resto del informe');
}

console.log('\n== 7. El texto del aviso, tal como se imprime ==');
{
  // El diagnostico es puro; el TEXTO que se pone en el informe se comprueba aqui porque es lo que
  // lee el usuario. Si el aviso no dijera POR QUE los numeros no valen, seria una etiqueta.
  const d = diagnosticarCapacidad([ util('desempaque', 1.4), util('acomodo', 0.6) ]);

  // El titulo lleva el numero de recursos, para que se vea de un vistazo si es uno o son cinco.
  ok(/^Hay 1 recurso/.test(d.titulo), 'el titulo dice cuantos recursos estan pasados', d.titulo);
  // La consecuencia nombra el mecanismo -la cola crece- y no solo el sintoma.
  ok(/cola crece sin límite/.test(d.consecuencia),
    'la consecuencia nombra el mecanismo, no solo el sintoma');
  // Y dice QUE hacer, que es lo que separa un aviso de una queja.
  ok(/Añada capacidad|reduzca la tasa|suba el tamaño de lote/.test(d.accion),
    'y ofrece las tres salidas posibles', d.accion.slice(0, 70));

  // Los criticos llevan su rho y sus unidades, para que el lector pueda ir a mirar ese recurso.
  ok(d.criticos[0].utilization === 1.4 && d.criticos[0].quantity === 1,
    'cada recurso critico lleva su rho y sus unidades',
    JSON.stringify(d.criticos[0]));
  ok(d.criticos.length === 1, 'y solo los que estan por encima del umbral',
    d.criticos.map((c) => c.name).join(', '));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
