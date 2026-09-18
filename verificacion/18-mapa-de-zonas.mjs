// Mapa de ZONAS: reparto del trabajo en celdas del diagrama (HeatmapZones).
//
// Codigo REAL del plugin, copiado por build.mjs. Lo que se prueba es la ARITMETICA:
// una celda mal sumada pinta una zona donde no se trabajo, y eso no se ve mirando el
// dibujo (se ve bonito igual), asi que tiene que fallar aqui.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LADO_CELDA, RADIO_MINIMO, RADIO_MAXIMO, radioDe, MAX_CELDAS,
  centroDe, repartirMasa, calcularZonas, celdasQueOcupa, ladoQueCabe
} from './HeatmapZones.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

/** Figura de prueba: 100x80 como una tarea estandar de bpmn-js. */
const figura = (id, x, y, w = 100, h = 80) => ({ id, x, y, width: w, height: h });

const suma = (celdas) => celdas.reduce((a, c) => a + c.valor, 0);

console.log('\n== 1. El centro de una figura es su centro, no su esquina ==');
{
  // Mezclar la esquina con el centro desplaza las zonas medio ancho de figura, y las
  // manchas de dos tareas vecinas se solaparian donde no toca.
  const c = centroDe(figura('T', 100, 50, 100, 80));
  ok(c.x === 150 && c.y === 90, 'el centro es esquina + mitad de la caja', `(${c.x}, ${c.y})`);

  // Un elemento sin caja (una conexion a la que no se le pasa trazo) no puede dar NaN.
  const sinCaja = centroDe({ id: 'X' });
  ok(sinCaja.x === 0 && sinCaja.y === 0, 'y un elemento sin caja no da NaN', JSON.stringify(sinCaja));
}

console.log('\n== 2. Reparto de la masa: el centro pesa mas que el borde ==');
{
  const aportes = repartirMasa(150, 90, 100);
  ok(aportes.length > 1, 'la masa se reparte en varias celdas', String(aportes.length));

  const centro = aportes.find(([k, , cx, cy]) => k === `${Math.floor(150 / LADO_CELDA)}|${Math.floor(90 / LADO_CELDA)}`);
  ok(Boolean(centro), 'y la celda del centro recibe su parte');

  const otras = aportes.filter(([k]) => k !== centro[0]);
  ok(otras.every(([, v]) => v > 0 && v < centro[1]),
    'y las de alrededor reciben menos que el centro, pero algo',
    otras.map(([, v]) => v.toFixed(1)).join(','));

  // LA PROPIEDAD QUE IMPORTA: el reparto CONSERVA la masa. Sin normalizar, una figura
  // metia 7 veces su trabajo y una conexion repartida por 30 puntos lo multiplicaba por
  // decenas: el rojo se iba a las lineas y las tareas salian azules. Ademas es lo que
  // hace que el numero de la leyenda sea «minutos de trabajo» y no un adorno.
  const total = suma(aportes.map(([, v]) => ({ valor: v })));
  ok(Math.abs(total - 100) < 0.01,
    'el reparto CONSERVA la masa: suma exactamente lo que entra',
    `${total.toFixed(2)} de 100`);

  // Masa cero o negativa no aporta nada: no se pinta una zona «de trabajo negativo».
  ok(repartirMasa(150, 90, 0).length === 0, 'masa 0 no aporta celdas');
  ok(repartirMasa(150, 90, -5).length === 0, 'y masa negativa tampoco');
}

console.log('\n== 3. Dos figuras cercanas SUMAN en las celdas que comparten ==');
{
  // Es la razon de existir de la vista: si no sumaran, seguiriamos teniendo un cuadro
  // por figura, que es lo que ya hacian los circulos.
  //
  // Se colocan de forma que compartan la celda central: con celdas de 60 px, los dos
  // centros tienen que caer dentro del mismo cuadro (por eso el desplazamiento de 10 y
  // no de 40 como parecia natural: dos centros a 40 px caen en celdas CONTIGUAS, y la
  // prueba pasaria por casualidad sin comprobar la suma).
  const a = figura('A', 100, 100, 100, 80);   // centro (150, 140)
  const b = figura('B', 110, 105, 100, 80);   // centro (160, 145), a 10 px del de A

  // El indice de celda se DERIVA del lado, no se escribe a mano: al subir la resolucion
  // (celdas mas chicas) los indices cambian, y una prueba con el numero fijo se rompe
  // por el cambio de constante y no por un fallo del codigo, que es confundir al que lee.
  const celdaDe = (punto) => ({ cx: Math.floor(punto / LADO_CELDA), cy: Math.floor(punto / LADO_CELDA) });
  const centroA = centroDe(a);
  const compartidaEsperada = celdaDe(centroA.x);

  const zonas = calcularZonas([ { element: a, masa: 10 } ]);
  const soloUna = zonas.celdas.find((c) => c.cx === compartidaEsperada.cx && c.cy === compartidaEsperada.cy).valor;

  const dos = calcularZonas([ { element: a, masa: 10 }, { element: b, masa: 10 } ]);
  const compartida = dos.celdas.find((c) => c.cx === compartidaEsperada.cx && c.cy === compartidaEsperada.cy);
  ok(Boolean(compartida), 'hay una celda donde caen las dos',
    `centro de A en la celda ${compartidaEsperada.cx},${compartidaEsperada.cy}`);

  // La suma se ve: esa celda vale MAS que la de una sola figura.
  ok(compartida.valor > soloUna,
    'y su valor es mayor que el de una sola figura (las dos suman)',
    `${soloUna.toFixed(2)} -> ${compartida.valor.toFixed(2)}`);

  // Y lo que NO puede pasar: que sumar las dos genere masa DE LA NADA. El total del mapa
  // tiene que ser la suma de las figuras, MENOS lo que se recorta al ceñir la mancha a la
  // caja de cada figura (las esquinas del circulo, que se salian al vacio). Es una perdida
  // pequena y conocida, no una invencion: se tolera hasta un 2 % y se comprueba que NUNCA
  // supere la masa de entrada, que es el error grave (masa de la nada).
  const total = suma(dos.celdas);
  ok(total <= 20 + 0.01,
    'el mapa NUNCA suma mas masa de la que entro (nada de masa de la nada)',
    `${total.toFixed(3)} de 20`);
  ok(total >= 20 * 0.98,
    'y conserva casi toda: solo se pierden las esquinas que salian de la figura',
    `${total.toFixed(3)} de 20 (${(100 * total / 20).toFixed(1)} %)`);

  // El maximo del mapa cae en la zona mas cargada, que es donde debe ir el rojo.
  ok(dos.max >= compartida.valor, 'el maximo es el de la zona mas cargada');
}

console.log('\n== 4. Una conexion reparte su masa POR SU TRAZO, no en un punto ==');
{
  // Una conexion con `x`/`y` de su caja envolvente cae en el aire si se usa el centro:
  // la mancha apareceria separada del trazo. Con sus puntos, sigue la linea.
  const linea = { id: 'F1', x: 0, y: 0, width: 600, height: 0 };

  const puntos = [ { x: 100, y: 10 }, { x: 300, y: 10 }, { x: 500, y: 10 } ];
  const zonas = calcularZonas([ { element: linea, masa: 90 } ], {
    puntosDeFlujo: () => puntos
  });

  // Las tres zonas de la linea: la mancha se extiende a lo largo, no en un punto.
  const columnas = new Set(zonas.celdas.map((c) => c.cx));
  ok(columnas.size >= 3, 'la masa se reparte a lo largo de la conexion', `${columnas.size} columnas`);

  // Y NO se multiplica: si cada punto recibiera la masa entera, una linea larga se
  // comeria la escala y todo lo demas saldria azul.
  const total = suma(zonas.celdas);
  ok(Math.abs(total - 90) < 0.01,
    'la masa de la conexion se reparte, no se multiplica por el numero de puntos',
    `${total.toFixed(2)} de 90`);

  // Sin puntos (no se le paso el trazo) cae al centro, que es lo unico honesto.
  const sinPuntos = calcularZonas([ { element: linea, masa: 90 } ]);
  ok(sinPuntos.n > 0, 'sin trazo conocido cae a su centro en vez de no pintar nada');
}

console.log('\n== 5. El caso uniforme y el vacio no rompen la escala ==');
{
  const a = figura('A', 0, 0);
  const b = figura('B', 5000, 5000);

  const zonas = calcularZonas([ { element: a, masa: 7 }, { element: b, masa: 7 } ]);
  // OJO: el rango NO es plano aunque las dos masas sean iguales. Cada figura reparte
  // desde su celda, asi que tiene un centro (mas) y un borde (menos): el maximo del
  // mapa es el centro de una figura y el minimo su borde. Lo que SI es cierto es que
  // las dos figuras pesan lo mismo, y eso es lo que se comprueba: comparando los
  // MAXIMOS de cada una, que es la unica lectura «por figura» del mapa de zonas.
  const maxPorFigura = [ a, b ].map((f) => {
    const suyas = calcularZonas([ { element: f, masa: 7 } ]);
    return suyas.max;
  });
  ok(maxPorFigura[0] === maxPorFigura[1],
    'dos figuras con la misma masa dan el mismo peso (ninguna sale «mas caliente»)',
    `${maxPorFigura[0].toFixed(2)} = ${maxPorFigura[1].toFixed(2)}`);
  // Y el mapa NO es uniforme: centro y borde se distinguen, que es lo que permite que
  // la mancha tenga forma en vez de ser un bloque plano.
  ok(zonas.min < zonas.max,
    'y el mapa tiene contraste (el centro de una figura pesa mas que su borde)',
    `${zonas.min.toFixed(2)} -> ${zonas.max.toFixed(2)}`);

  const vacio = calcularZonas([]);
  ok(vacio.n === 0 && vacio.max === 0, 'sin elementos no hay celdas ni maximo');
  ok(calcularZonas(null).n === 0, 'y con null tampoco revienta');

  // Elementos sin masa (una tarea que no se ejecuto) no generan zona: no paso trabajo.
  const sinMasa = calcularZonas([ { element: a, masa: 0 }, { element: b } ]);
  ok(sinMasa.n === 0, 'una figura sin masa no pinta zona', String(sinMasa.n));
}

console.log('\n== 6. El aviso de diagrama enorme ==');
{
  // Un diagrama grande con celdas de 60 px son decenas de miles de celdas: meterlas en
  // el DOM cuelga el Modeler. Hay que poder decirlo ANTES de pintar.
  const pequeno = [ { element: figura('A', 0, 0) } ];
  ok(celdasQueOcupa(pequeno) < MAX_CELDAS, 'un diagrama normal cabe de sobra',
    String(celdasQueOcupa(pequeno)));

  const enorme = [ { element: figura('A', 0, 0, 20000, 20000) } ];
  ok(celdasQueOcupa(enorme) > MAX_CELDAS, 'uno enorme lo supera',
    String(celdasQueOcupa(enorme)));

  // La salida NO es recortar zonas (mentiria sobre donde se trabajo): es subir el lado
  // de celda hasta que quepa, que conserva el mapa entero con menos resolucion.
  const lado = ladoQueCabe(enorme);
  ok(lado > LADO_CELDA, 'y el lado de celda sube para que quepa', String(lado));
  ok(celdasQueOcupa(enorme, lado) <= MAX_CELDAS,
    'hasta quedar dentro del tope', String(celdasQueOcupa(enorme, lado)));

  // Un diagrama normal NO se toca: la resolucion por defecto se conserva.
  ok(ladoQueCabe(pequeno) === LADO_CELDA, 'y a un diagrama normal no le cambia la resolucion');
}

console.log('\n== 7. La geometria de las celdas es coherente ==');
{
  const a = figura('A', 100, 100);
  const zonas = calcularZonas([ { element: a, masa: 5 } ]);

  ok(zonas.celdas.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)),
    'cada celda tiene una posicion valida');
  ok(zonas.celdas.every((c) => c.x === c.cx * zonas.lado && c.y === c.cy * zonas.lado),
    'y su posicion es la de su indice en la rejilla (nada de desfases)');
  // La celda del centro de la figura tiene que estar DENTRO de ella: si no, la mancha
  // se pintaria al lado de la tarea.
  const dentro = zonas.celdas.some((c) => c.x <= 150 && 150 <= c.x + zonas.lado
    && c.y <= 140 && 140 <= c.y + zonas.lado);
  ok(dentro, 'y la celda del centro de la figura cae sobre la figura');
}

console.log('\n== 8. La RESOLUCION: que el detalle sea el que se pidio ==');
{
  // Una tarea estandar de 100x80 tiene que caer en MUCHAS celdas, no en unas pocas: si
  // el detalle baja, el mapa se vuelve una cuadricula gruesa sin que nadie se entere.
  const a = figura('A', 100, 100, 100, 80);
  const zonas = calcularZonas([ { element: a, masa: 1000 } ]);
  const celdasDentro = zonas.celdas.filter((c) => c.x >= 100 - zonas.lado && c.x <= 200
    && c.y >= 100 - zonas.lado && c.y <= 180).length;

  ok(zonas.lado <= 15,
    'el lado de celda es de alta resolucion (<= 15 px)', `${zonas.lado} px`);
  ok(celdasDentro >= 20,
    'y una tarea estandar cae en muchas celdas (detalle real, no cuadricula gruesa)',
    `${celdasDentro} celdas sobre la tarea`);

  // El radio tiene que cubrir la figura: con celdas chicas un radio pequeno dejaria el
  // centro marcado y los bordes vacios, que es volver al punto por figura.
  const alcance = radioDe({ width: 100, height: 80 });
  ok(alcance >= 40,
    'y el reparto se ajusta a la figura (si no, la mancha se sale o queda en un punto)',
    `${alcance} px de radio para una figura de 100x80`);
}

console.log('\n== 9. La mancha NO se sale de las figuras (el fallo del espacio vacio) ==');
{
  // EL CASO QUE SE REPORTO: la mancha aparecia flotando donde no hay nada. Con el radio
  // contado en CELDAS, al bajar la celda a 12 px la mancha se desbordaba 72 px por cada
  // lado de una figura de 100x80, y en un diagrama apretado eso son celdas encendidas en
  // el vacio.
  //
  // La geometria es la del ejemplo REAL del usuario (figuras de x=182 a 852), porque con
  // coordenadas de juguete empezando en 0 el desbordamiento no se ve.
  const figuras = [
    { id: 'T1', x: 270, y: 90, width: 100, height: 80 },
    { id: 'T2', x: 530, y: 90, width: 100, height: 80 },
    { id: 'GW', x: 425, y: 105, width: 50, height: 50 }
  ];

  const zonas = calcularZonas(figuras.map((element) => ({ element, masa: 1000 })), { lado: LADO_CELDA });

  // Se mide la distancia de cada celda al rectangulo de la figura mas cercana: si una
  // celda ya no toca a ninguna, esta en el vacio.
  const distanciaAlRectangulo = (celda, f) => {
    const dx = Math.max(f.x - (celda.x + zonas.lado), celda.x - (f.x + f.width), 0);
    const dy = Math.max(f.y - (celda.y + zonas.lado), celda.y - (f.y + f.height), 0);
    return Math.max(dx, dy);
  };

  const sueltas = zonas.celdas.filter((c) => {
    const d = Math.min(...figuras.map((f) => distanciaAlRectangulo(c, f)));
    return d > 1;   // 1 px de holgura por el solape de las celdas
  });

  ok(sueltas.length === 0,
    'ninguna celda queda lejos de toda figura: la mancha no flota en el vacio',
    sueltas.length ? `${sueltas.length} celdas sueltas, p.ej. (${sueltas[0].x}, ${sueltas[0].y})`
      : `${zonas.n} celdas, todas sobre alguna figura`);

  // Y el radio se ajusta al TAMANO: una compuerta de 50x50 no puede recibir la mancha de
  // una tarea de 100x80, o se sale por los lados.
  const radioGrande = radioDe({ width: 100, height: 80 });
  const radioChico = radioDe({ width: 50, height: 50 });
  ok(radioChico < radioGrande,
    'una figura pequena recibe una mancha mas pequena que una grande',
    `compuerta ${radioChico} px vs tarea ${radioGrande} px`);
  ok(radioGrande <= 50,
    'y el radio no pasa de media figura (si no, la mancha invade a la vecina)', String(radioGrande));
  ok(radioDe({ width: 500, height: 400 }) === RADIO_MAXIMO,
    'con un tope para figuras enormes', String(radioDe({ width: 500, height: 400 })));
  ok(radioDe({ width: 4, height: 4 }) === RADIO_MINIMO,
    'y un minimo para que una figura diminuta siga viendose', String(radioDe({ width: 4, height: 4 })));
  ok(radioDe({}) === RADIO_MINIMO, 'sin caja conocida no revienta', String(radioDe({})));
}

console.log('\n== 10. La vista de LINEAS se encuentra por su NOMBRE ==');
{
  // El usuario -que conoce el producto- pregunto «¿hay manera de colorear las LINEAS?» sin
  // encontrar la vista que ya lo hacia, porque se llamaba «Vista de estructura». Un rotulo
  // que no se encuentra por lo que hace es una funcion escondida.
  //
  // Se comprueba en el FUENTE de la paleta y no en un DOM: este arnes es de Node, y el
  // titulo con el que se registra la entrada es exactamente el texto que ve el usuario.
  const ruta = join(RAIZ, 'client', 'simulation', 'SimulationPalette.js');
  const fuente = readFileSync(ruta, 'utf8');

  const conLineas = fuente.split('\n').filter((l) => /title: '[^']*l[íi]nea/i.test(l));
  ok(conLineas.length > 0,
    'hay una entrada de la paleta que se encuentra buscando «lineas»',
    conLineas.length ? conLineas[0].trim().slice(0, 60) : 'NINGUNA entrada la menciona');

  // Y la vista que hay detras existe y pinta trazos: el rotulo no puede prometer algo que
  // el codigo no haga.
  const controlador = readFileSync(join(RAIZ, 'client', 'simulation', 'SimulationController.js'), 'utf8');
  ok(/metric === 'trafico'/.test(controlador) && /_pintarFlujos\(/.test(controlador),
    'y esa entrada tiene detras la vista que pinta los trazos, no solo un titulo');

  // El nombre viejo ya no se USA como titulo: si volviera a ser el rotulo, la funcion
  // volveria a estar escondida. Se mira solo en los TITULOS y no en todo el archivo, porque
  // el comentario que explica el cambio SI debe poder nombrar el nombre viejo.
  const titulos = fuente.split('\n')
    .filter((l) => /title: '/.test(l))
    .map((l) => l.trim());
  ok(!titulos.some((t) => /Vista de estructura/.test(t)),
    'y el nombre viejo ya no se usa como titulo, para que nadie la busque por ahi',
    String(titulos.length) + ' titulos revisados');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
