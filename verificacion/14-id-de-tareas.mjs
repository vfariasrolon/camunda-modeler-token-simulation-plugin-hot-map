/**
 * El ID visible de las tareas y el configurador de medicion.
 *
 * Por qué existe: el ID es la etiqueta con la que se mide en planta y la clave
 * con la que la app de tiempos fusiona las mediciones. Si la numeracion es
 * inestable (cambia al mover una figura) o si el configurador pierde el id del
 * XML, las mediciones se atribuyen a la tarea equivocada y el error es invisible:
 * sale un numero, solo que del proceso que no era.
 *
 * Comprueba la logica REAL (TaskIds.js) y el CABLEADO del controlador, porque una
 * funcion correcta que nadie llama no arregla nada.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numerarTareas, idCortoDe, etiquetaDe } from './TaskIds.mjs';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (rel) => readFileSync(join(RAIZ, rel), 'utf8');

/**
 * Diagrama de prueba. `flujos` son pares [origen, destino] por id, y se cablean
 * los incoming/outgoing REALES, que es lo que mira TaskIds.
 */
function diagrama(tareas, flujos) {
  const porId = new Map(tareas.map((t) => [ t.id, t ]));
  for (const t of tareas) {
    t.incoming = [];
    t.outgoing = [];
  }
  for (const [origen, destino] of flujos) {
    const o = porId.get(origen);
    const d = porId.get(destino);
    // Igual que bpmn-js: el flujo no esta dentro de las listas de sus extremos,
    // pero si sabe quien es su source y su target.
    o.outgoing.push({ source: o, target: d });
    d.incoming.push({ source: o, target: d });
  }
  return tareas;
}

const tarea = (id, nombre) => ({
  id,
  $type: 'bpmn:Task',
  type: 'bpmn:Task',
  businessObject: { name: nombre || null }
});

console.log('\n== 1. La numeracion sigue el ORDEN DEL FLUJO, no el del XML ni la posicion ==');
{
  // En el XML el orden es C, A, B; en el flujo el orden es A -> B -> C.
  const d = diagrama(
    [ tarea('C', 'Empacar'), tarea('A', 'Cortar'), tarea('B', 'Soldar') ],
    [ [ 'A', 'B' ], [ 'B', 'C' ] ]
  );
  const n = numerarTareas(d);

  ok(n.get('A') === 1, 'la primera tarea del flujo es la 1', String(n.get('A')));
  ok(n.get('B') === 2, 'la siguiente es la 2', String(n.get('B')));
  ok(n.get('C') === 3, 'y la ultima la 3', String(n.get('C')));

  // El orden del XML daria C=1: se comprueba que NO es lo que pasa.
  ok(n.get('C') !== 1, 'no numera por el orden en que aparecen en el XML');
}

console.log('\n== 2. Mover una figura no renumera (el orden no es X/Y) ==');
{
  const flujos = [ [ 'A', 'B' ], [ 'B', 'C' ] ];
  const antes = numerarTareas(diagrama([ tarea('A'), tarea('B'), tarea('C') ], flujos));

  // "Mover" = cambiar el orden de la lista, como haria el registro al reordenarse.
  const despues = numerarTareas(diagrama([ tarea('C'), tarea('A'), tarea('B') ], flujos));

  ok(antes.get('A') === despues.get('A') && antes.get('B') === despues.get('B') && antes.get('C') === despues.get('C'),
    'el numero de cada tarea no cambia', `A=${antes.get('A')}/${despues.get('A')}`);
}

console.log('\n== 3. Un bucle de retrabajo NO impide numerar ==');
{
  // A -> B -> C -> B (reparacion) y C -> D
  const d = diagrama(
    [ tarea('A'), tarea('B'), tarea('C'), tarea('D') ],
    [ [ 'A', 'B' ], [ 'B', 'C' ], [ 'C', 'B' ], [ 'C', 'D' ] ]
  );
  const n = numerarTareas(d);

  ok(n.size === 4, 'se numeraron las CUATRO tareas (el ciclo no cuelga el recorrido)', String(n.size));
  ok(n.get('A') === 1, 'el arranque del flujo sigue siendo el 1');
  ok([ ...n.values() ].every((v) => Number.isInteger(v) && v >= 1), 'todos los numeros son enteros >= 1');
}

console.log('\n== 4. Ramas en paralelo: todas reciben numero ==');
{
  // A -> B, A -> C, B -> D, C -> D
  const d = diagrama(
    [ tarea('A'), tarea('B'), tarea('C'), tarea('D') ],
    [ [ 'A', 'B' ], [ 'A', 'C' ], [ 'B', 'D' ], [ 'C', 'D' ] ]
  );
  const n = numerarTareas(d);

  ok(n.size === 4, 'las cuatro ramas quedan numeradas', String(n.size));
  ok(n.get('A') === 1, 'la raiz es la 1');
  ok(new Set([ n.get('B'), n.get('C') ]).size === 2, 'las dos ramas reciben numeros DISTINTOS');
  ok(n.get('D') > n.get('B') && n.get('D') > n.get('C'), 'y el punto de union va despues de las dos');
}

console.log('\n== 5. Casos que podrian dejar tareas SIN numero ==');
{
  // Un fragmento sin entrantes: no se puede perder ninguna tarea.
  const suelto = diagrama([ tarea('X'), tarea('Y') ], []);
  ok(numerarTareas(suelto).size === 2, 'sin flujos, se numeran igual (2)', String(numerarTareas(suelto).size));

  // Un ciclo cerrado sin raiz tampoco puede devolver una lista vacia.
  const ciclo = diagrama([ tarea('P'), tarea('Q') ], [ [ 'P', 'Q' ], [ 'Q', 'P' ] ]);
  ok(numerarTareas(ciclo).size === 2, 'un ciclo sin raiz tambien se numera (2)', String(numerarTareas(ciclo).size));

  ok(numerarTareas([]).size === 0, 'sin tareas, mapa vacio');
  ok(numerarTareas(null).size === 0, 'y con null no revienta');
}

console.log('\n== 6. Solo se numeran TAREAS (eventos y compuertas no) ==');
{
  const evento = { id: 'E', $type: 'bpmn:StartEvent', type: 'bpmn:StartEvent', businessObject: {} };
  const compuerta = { id: 'G', $type: 'bpmn:ExclusiveGateway', type: 'bpmn:ExclusiveGateway', businessObject: {} };
  const t = tarea('T', 'Cortar');

  const n = numerarTareas([ evento, compuerta, t ]);
  ok(n.size === 1 && n.get('T') === 1, 'solo la tarea recibe numero', String(n.size));
  ok(!n.has('E') && !n.has('G'), 'el evento y la compuerta no aparecen en el mapa');
  ok(idCortoDe([ evento, compuerta, t ], 'E') === null, 'idCortoDe de un evento es null');
}

console.log('\n== 6b. TODOS los subtipos de tarea reciben numero (el bug del «undefined») ==');
{
  // Este es EL fallo que llego a produccion: `is(el,'bpmn:Task')` es JERARQUICO e
  // incluye los subtipos, pero TaskIds comparaba el tipo EXACTO. La tarea entraba
  // en la lista y no en el mapa -> el badge pintaba «undefined».
  const subtipos = [
    'bpmn:Task', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:ManualTask',
    'bpmn:ScriptTask', 'bpmn:SendTask', 'bpmn:ReceiveTask',
    'bpmn:BusinessRuleTask', 'bpmn:CallActivity'
  ];

  // Se construye un diagrama EN CADENA con un tipo distinto en cada eslabon, para
  // que cada uno reciba un numero y ninguno pueda colarse.
  const eslabones = subtipos.map((tipo, i) => ({
    id: 'N' + i, type: tipo, $type: tipo, businessObject: { name: 'T' + i }, incoming: [], outgoing: []
  }));
  for (let i = 0; i < eslabones.length - 1; i++) {
    eslabones[i].outgoing.push({ source: eslabones[i], target: eslabones[i + 1] });
    eslabones[i + 1].incoming.push({ source: eslabones[i], target: eslabones[i + 1] });
  }

  const n = numerarTareas(eslabones);

  subtipos.forEach((tipo, i) => {
    ok(n.get('N' + i) === i + 1, `«${tipo}» recibe numero`, String(n.get('N' + i)));
  });

  ok(n.size === subtipos.length, 'ninguna tarea se queda sin numero', `${n.size}/${subtipos.length}`);

  // Ningun valor puede ser undefined/null: es lo que se pintaba en el badge.
  const valores = [ ...n.values() ];
  ok(valores.every((v) => Number.isInteger(v) && v > 0),
    'ningun numero es undefined (que era lo que salia en el circulo azul)', JSON.stringify(valores));

  // Y los que NO son tareas siguen fuera.
  const noTareas = [
    { id: 'X1', type: 'bpmn:StartEvent', $type: 'bpmn:StartEvent' },
    { id: 'X2', type: 'bpmn:ExclusiveGateway', $type: 'bpmn:ExclusiveGateway' },
    { id: 'X3', type: 'bpmn:EndEvent', $type: 'bpmn:EndEvent' },
    { id: 'X4', type: 'bpmn:IntermediateCatchEvent', $type: 'bpmn:IntermediateCatchEvent' },
    { id: 'X5', type: 'bpmn:SubProcess', $type: 'bpmn:SubProcess' }
  ];
  const n2 = numerarTareas(noTareas);
  ok(n2.size === 0, 'un evento, una compuerta, un fin ni un subproceso se numeran', String(n2.size));
}

console.log('\n== 7. La etiqueta no puede quedarse vacia ==');
{
  ok(etiquetaDe(tarea('T', 'Cortar'), 1) === '1 · Cortar', 'con numero y nombre: "1 · Cortar"', etiquetaDe(tarea('T', 'Cortar'), 1));
  ok(etiquetaDe(tarea('T', null), 2) === '2', 'sin nombre: solo el numero', etiquetaDe(tarea('T', null), 2));
  ok(etiquetaDe(tarea('T', 'Cortar'), null) === 'Cortar', 'sin numero: el nombre', etiquetaDe(tarea('T', 'Cortar'), null));
  ok(etiquetaDe({ id: 'T', businessObject: {} }, null) === 'T', 'sin nombre ni numero: el id tecnico (nunca vacio)', etiquetaDe({ id: 'T', businessObject: {} }, null));
}

console.log('\n== 8. El cableado: el ID visible y el configurador estan conectados ==');
{
  const controlador = leer('client/simulation/SimulationController.js');

  ok(/numerarTareas\(/.test(controlador) && /etiquetaDe\(/.test(controlador),
    'el controlador usa la numeracion real de TaskIds');
  ok(/_overlays\.add\(tarea, 'task-id'/.test(controlador), 'el ID se pinta como overlay propio');
  ok(/scale:\s*\{\s*min:\s*0\.35\s*\}/.test(controlador),
    'con scale.min para no encogerse en zoom out');
  ok(!/task-id[\s\S]{0,200}minZoom/.test(controlador),
    'y SIN minZoom: minZoom OCULTA el overlay al alejarse (el fallo ya conocido)');

  // El toggle: un boton de la paleta que enciende y apaga.
  ok(/idsButton/.test(controlador) && /idsVisibles \? this\.ocultarIds\(\) : this\.mostrarIds\(\)/.test(controlador),
    'hay boton que alterna mostrar/ocultar');
  ok(/shape\.added|shape\.removed|elements\.changed/.test(controlador),
    'y se repinta al cambiar el diagrama (el numero depende del flujo)');

  // El configurador.
  ok(/construirConfigurador\(/.test(controlador), 'el configurador se construye');
  ok(/exportMediciones\(/.test(controlador), 'y se exporta a un archivo');
  ok(/setMeasurementCallback\(this\.exportMediciones\.bind\(this\)\)/.test(controlador),
    'conectado a la paleta (si no, el boton no haria nada)');

  ok(/'configurador-tiempos'/.test(controlador), 'el archivo declara su tipo');
  ok(/idCorto:\s*numeros\.get\(tarea\.id\)/.test(controlador), 'cada tarea lleva el idCorto derivado');
  ok(/id:\s*tarea\.id/.test(controlador), 'y el id tecnico, que es la clave de fusion');
  ok(/tiempoPorLote:\s*data\.frequency === 'lot'/.test(controlador), 'y si el tiempo es por lote');
  ok(/unidad:\s*pt\.unit \|\| 'minutes'/.test(controlador), 'y la unidad DECLARADA (sin ella seria un error de 60x)');

  // Aviso si no hay tareas en vez de un archivo vacio.
  ok(/no tiene tareas que medir/.test(controlador), 'sin tareas avisa, no descarga un JSON vacio');

  // --- El bug del «undefined»: la lista y el mapa tienen que usar EL MISMO criterio ---
  // `_tareasNumerables` selecciona con `is(el, 'bpmn:Task')`, que es JERARQUICO.
  // Si TaskIds comparase el tipo exacto, la lista tendria tareas que el mapa no
  // conoce y el badge pintaria «undefined».
  ok(/is\(el, 'bpmn:Task'\)/.test(controlador), 'la lista del controlador usa is(el, bpmn:Task) (jerarquico)');

  const taskIds = leer('client/simulation/TaskIds.js');
  ok(!/\$type === 'bpmn:Task'/.test(taskIds),
    'TaskIds NO compara el tipo exacto (ese era el fallo)');
  ok(/Task\$\/\.test\(tipo\)/.test(taskIds),
    'y acepta los subtipos (UserTask, ServiceTask...) como tareas');

  // La guarda: sin numero, no se pinta NADA. Nunca «undefined» en pantalla.
  ok(/if \(numero == null\)/.test(controlador),
    'hay guarda: sin numero, no se pinta el badge (antes salia «undefined»)');

  const paleta = leer('client/simulation/SimulationPalette.js');
  ok(/isMeasurementExport/.test(paleta) && /_measurementCallback\(\)/.test(paleta),
    'la paleta dispara el callback del configurador');
  ok(/setMeasurementCallback\(cb\)/.test(paleta), 'y expone el setter');

  // La advertencia que el producto TIENE que dar: el idCorto se reasigna.
  ok(/se reasigna/i.test(paleta), 'la ayuda avisa de que el ID visible se reasigna al cambiar el diagrama');

  const css = leer('client/simulation/simulation.css');
  const badge = css.slice(css.indexOf('.task-id-badge'));
  ok(/\.task-id-badge\s*\{/.test(css), 'el circulo tiene estilos');
  ok(/#1565c0/.test(badge.slice(0, 400)), 'y es AZUL (distingue del token verde de la libreria)');
  ok(/pointer-events:\s*none/.test(badge.slice(0, 500)), 'y no intercepta la seleccion ni el zoom');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
