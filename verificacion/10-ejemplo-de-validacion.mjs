// Comprueba que docs/ejemplo-validacion.bpmn es valido y que el motor REAL lo lee
// como se espera. Un fichero de arranque roto seria peor que no tenerlo: se
// descubriria despues de semanas de validacion.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';


let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA = join(AQUI, "..", "docs", 'ejemplo-validacion.bpmn');
const xml = readFileSync(RUTA, 'utf8');

console.log('\n== 1. Estructura XML ==');
{
  ok(xml.startsWith('<?xml'), 'empieza con la declaracion XML');
  ok(/<bpmn:definitions[\s\S]*<\/bpmn:definitions>\s*$/.test(xml.trim()), 'cierra el elemento definitions');

  // Balance de etiquetas. Un `sequenceFlow` puede cerrarse de dos formas: con
  // `/>` cuando no lleva datos (los flujos sin probabilidad) o con etiqueta de
  // cierre cuando los lleva. Se cuentan las dos.
  const cuenta = (tag) => (xml.match(new RegExp(`<bpmn:${tag}[\\s>]`, 'g')) || []).length;
  const cierra = (tag) => (xml.match(new RegExp(`</bpmn:${tag}>`, 'g')) || []).length;
  const autocierra = (tag) => (xml.match(new RegExp(`<bpmn:${tag}\\b[^>]*/>`, 'g')) || []).length;

  [ 'process', 'startEvent', 'task', 'exclusiveGateway', 'sequenceFlow', 'endEvent' ].forEach((t) => {
    const abre = cuenta(t);
    const cerradas = cierra(t) + autocierra(t);
    ok(abre === cerradas, `<bpmn:${t}> abre y cierra igual`,
      `${abre} abre, ${cerradas} cierra (${autocierra(t)} autocerradas)`);
  });

  // Los comentarios explicativos no pueden contener `--`.
  const comentarios = xml.match(/<!--[\s\S]*?-->/g) || [];
  ok(comentarios.every((c) => !c.slice(4, -3).includes('--')),
    'ningun comentario contiene «--» (invalido en XML)', comentarios.length);
}

console.log('\n== 2. Los datos de simulacion son JSON valido ==');
{
  const props = [ ...xml.matchAll(/<camunda:property name="simulationData" value="([^"]*)"/g) ];
  ok(props.length === 7, 'hay 7 bloques de simulationData (raiz, 3 tareas, 2 flujos, piscinas)',
    props.length);

  const decodificar = (s) => s
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");

  const datos = props.map((m) => {
    const crudo = decodificar(m[1]);
    try { return JSON.parse(crudo); } catch (e) { return { __error: e.message, crudo }; }
  });

  datos.forEach((d, i) => {
    ok(!d.__error, `bloque ${i + 1} es JSON valido`, d.__error || 'ok');
  });

  const raiz = datos.find((d) => d.isRoot);
  ok(Boolean(raiz), 'hay un bloque raiz (isRoot)');
  ok(raiz && raiz.simulationConfig && raiz.simulationConfig.runValue === 200,
    'la raiz pide 200 instancias', raiz && raiz.simulationConfig.runValue);
  ok(raiz && raiz.calendar && raiz.calendar.breaks.length === 1,
    'la raiz declara un descanso', raiz && raiz.calendar.breaks.length);

  const piscinas = datos.find((d) => d.resourcePools);
  ok(Boolean(piscinas) && piscinas.resourcePools[0].name === 'Operarios',
    'las piscinas declaran «Operarios»',
    piscinas && JSON.stringify(piscinas.resourcePools));

  const flujos = datos.filter((d) => d.branchingProbability != null);
  const suma = flujos.reduce((a, f) => a + f.branchingProbability, 0);
  ok(flujos.length === 2 && Math.abs(suma - 1) < 1e-9,
    'los dos flujos de la compuerta suman exactamente 1', `${flujos.length} flujos, suma ${suma}`);
}

console.log('\n== 3. Todo lo que se referencia existe ==');
{
  const ids = new Set([ ...xml.matchAll(/ id="([^"]+)"/g) ].map((m) => m[1]));
  const refs = [ ...xml.matchAll(/(?:sourceRef|targetRef|bpmnElement|incoming|outgoing)="([^"]+)"/g) ]
    .map((m) => m[1]);

  const huerfanos = [ ...new Set(refs) ].filter((r) => !ids.has(r));
  ok(huerfanos.length === 0, 'ninguna referencia apunta a un id inexistente',
    huerfanos.join(', ') || `${refs.length} referencias revisadas`);

  // Cada tarea y cada evento tiene que estar conectado: un nodo suelto no se
  // simula y daria un resultado que el analista no sabria explicar.
  [ 'Inicio', 'Inspeccion', 'Compuerta', 'Procesado', 'Reparacion', 'Fin' ].forEach((id) => {
    ok(ids.has(id), `existe el elemento ${id}`);
  });
  ok(/sourceRef="Inicio"/.test(xml) && /targetRef="Fin"/.test(xml),
    'el flujo va del inicio al fin');
}

console.log('\n== 4. La forma del diagrama coincide con los datos ==');
{
  // 4 tareas -> 4 BPMNShape de tarea; 6 flujos -> 6 BPMNEdge. Si no cuadra, el
  // modelador dibujaria el diagrama a medias.
  const tareas = (xml.match(/<bpmn:task /g) || []).length;
  const formasTarea = (xml.match(/<bpmndi:BPMNShape[^>]*bpmnElement="(?:Inspeccion|Procesado|Reparacion)"/g) || []).length;
  ok(tareas === formasTarea, 'cada tarea tiene su forma dibujada', `${tareas} tareas, ${formasTarea} formas`);

  const flujos = (xml.match(/<bpmn:sequenceFlow /g) || []).length;
  const aristas = (xml.match(/<bpmndi:BPMNEdge/g) || []).length;
  ok(flujos === aristas, 'cada flujo tiene su arista dibujada', `${flujos} flujos, ${aristas} aristas`);

  const eventos = (xml.match(/<bpmn:(?:startEvent|endEvent) /g) || []).length;
  const formasEvento = (xml.match(/<bpmndi:BPMNShape[^>]*bpmnElement="(?:Inicio|Fin)"/g) || []).length;
  ok(eventos === formasEvento, 'cada evento tiene su forma', `${eventos} eventos, ${formasEvento} formas`);
}

console.log('\n== 5. El MOTOR lee el fichero como se espera ==');
{
  // Se construye un registro de elementos a partir del XML REAL, con la misma
  // forma que espera el motor, y se corre. Es la unica forma de saber que el
  // fichero de arranque no esta roto ANTES de que lo uses durante semanas.
  const decodificar = (s) => s
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");

  const datosDe = (id) => {
    // El bloque de simulationData que sigue al elemento con ese id.
    const i = xml.indexOf(`id="${id}"`);
    if (i === -1) return null;
    const m = xml.slice(i).match(/<camunda:property name="simulationData" value="([^"]*)"/);
    return m ? JSON.parse(decodificar(m[1])) : null;
  };

  const tipo = (tag) => ({ task: 'bpmn:Task', startEvent: 'bpmn:StartEvent',
    endEvent: 'bpmn:EndEvent', exclusiveGateway: 'bpmn:ExclusiveGateway' })[tag];

  const elementos = [];
  for (const m of xml.matchAll(/<bpmn:(task|startEvent|endEvent|exclusiveGateway) id="([^"]+)"(?: name="([^"]*)")?/g)) {
    elementos.push({
      id: m[2], $type: tipo(m[1]),
      businessObject: { name: m[3] || m[2] },
      outgoing: [],
      _datos: datosDe(m[2])
    });
  }
  for (const m of xml.matchAll(/<bpmn:sequenceFlow id="([^"]+)"(?: name="([^"]*)")? sourceRef="([^"]+)" targetRef="([^"]+)"/g)) {
    const f = { id: m[1], $type: 'bpmn:SequenceFlow', businessObject: { name: m[2] || '' },
      source: null, target: null, _datos: datosDe(m[1]) };
    elementos.push(f);
    const src = elementos.find((e) => e.id === m[3]);
    const dst = elementos.find((e) => e.id === m[4]);
    f.source = src; f.target = dst;
    if (src) src.outgoing = [ ...(src.outgoing || []), f ];
  }
  // El proceso con las piscinas: es el unico bloque que declara `resourcePools`.
  const bloquePiscinas = [ ...xml.matchAll(/<camunda:property name="simulationData" value="([^"]*)"/g) ]
    .map((m) => JSON.parse(decodificar(m[1])))
    .find((d) => d.resourcePools);
  ok(Boolean(bloquePiscinas), 'se encuentra el bloque de piscinas en el XML');

  elementos.push({ id: 'Process_Validacion', $type: 'bpmn:Process',
    businessObject: { name: 'Validacion a mano' },
    _datos: bloquePiscinas || { resourcePools: [] } });

  const registro = {
    getAll: () => elementos,
    get: (id) => elementos.find((e) => e.id === id),
    filter: (fn) => elementos.filter(fn),
    find: (fn) => elementos.find(fn)
  };

  ok(registro.filter((e) => e.$type === 'bpmn:Task').length === 3,
    'el motor ve las 3 tareas', registro.filter((e) => e.$type === 'bpmn:Task').length);
  ok(registro.filter((e) => e.$type === 'bpmn:StartEvent').length === 1, 'y el evento de inicio');

  const guardar = console.log;
  console.log = () => {};
  let resultado = null;
  let error = null;
  try {
    const { default: SimulationEngine } = await import('./SimulationEngine.mjs');
    const motor = new SimulationEngine(registro);
    motor.run({ useOvertime: false });
    resultado = {
      completadas: motor.completedInstances,
      fin: new Date(motor.clock),
      // Las tres tareas tienen que haberse ejecutado.
      ejecuciones: [ 'Inspeccion', 'Procesado', 'Reparacion' ]
        .map((id) => (motor.results.get(id) || {}).executionCount || 0),
      tieneResultados: motor.results.size > 0
    };
  } catch (e) {
    error = e.message;
  }
  console.log = guardar;

  ok(!error, 'el motor corre el fichero sin lanzar', error || 'ok');
  ok(resultado && resultado.completadas === 200,
    'se completan las 200 instancias que pide la raiz',
    resultado && String(resultado.completadas));
  ok(resultado && resultado.ejecuciones.every((n) => n > 0),
    'y se ejecutan las tres tareas', resultado && resultado.ejecuciones.join(' / '));
  ok(resultado && resultado.fin > new Date('2026-01-01'),
    'el reloj avanza a una fecha real', resultado && resultado.fin.toISOString().slice(0, 10));
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
