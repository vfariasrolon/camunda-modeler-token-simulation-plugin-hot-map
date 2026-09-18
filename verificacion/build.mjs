/**
 * Prepara los arneses de verificación: copia el código REAL del plugin a .mjs y
 * reescribe solo los especificadores de import (Node no adivina la extensión).
 *
 * Por qué existe: los arneses no reimplementan nada. Importan el motor, el
 * calendario y las reglas tal cual los empaqueta webpack para el plugin, con
 * stubs SOLO en las fronteras que dependen de bpmn-js. Si los arneses tuvieran su
 * propia copia de la lógica, comprobarían la copia y no el producto.
 *
 * Uso:  node verificacion/build.mjs   (o `pnpm run verificar`, que lo encadena)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SIM = join(AQUI, '..', 'client', 'simulation');

const leer = (f) => readFileSync(join(SIM, f), 'utf8');

// El motor: solo se cambian las rutas de import a .mjs.
const motor = leer('SimulationEngine.js')
  .replace("from './util'", "from './util.mjs'")
  .replace("from './BusinessCalendar.js'", "from './BusinessCalendar.mjs'")
  .replace("from './WarmupCurve.js'", "from './WarmupCurve.mjs'")
  .replace("from './LaborRules.js'", "from './LaborRules.mjs'")
  .replace("from './Workload.js'", "from './Workload.mjs'")
  .replace("from 'bpmn-js/lib/util/ModelUtil'", "from './ModelUtil.mjs'");

writeFileSync(join(AQUI, 'SimulationEngine.mjs'), motor);
writeFileSync(join(AQUI, 'BusinessCalendar.mjs'), leer('BusinessCalendar.js'));
writeFileSync(join(AQUI, 'WarmupCurve.mjs'), leer('WarmupCurve.js'));
writeFileSync(join(AQUI, 'LaborRules.mjs'), leer('LaborRules.js'));
writeFileSync(join(AQUI, 'Workload.mjs'), leer('Workload.js'));
writeFileSync(join(AQUI, 'DataAudit.mjs'), leer('DataAudit.js'));

// HeatmapScale monta la escala de color sobre los formateadores, asi que su
// import tambien se reescribe.
writeFileSync(join(AQUI, 'HeatmapScale.mjs'),
  leer('HeatmapScale.js').replace("from './util'", "from './util.mjs'"));

// TaskIds es puro (no importa nada del plugin), se copia tal cual.
writeFileSync(join(AQUI, 'TaskIds.mjs'), leer('TaskIds.js'));

// ModelUtil: `is` mira el $type del stub.
writeFileSync(join(AQUI, 'ModelUtil.mjs'),
  'export const is = (el, tipo) => Boolean(el) && el.$type === tipo;\n');

// util.mjs: stubs de las fronteras (nada de bpmn-js) + lo que SI es puro y real
// —los formateadores, que usa la escala del mapa de calor, y la estadistica—,
// extraido de util.js para no tener dos copias de la misma formula.
const utilSrc = leer('util.js');
const puro = utilSrc.slice(utilSrc.indexOf('export const formatMilliseconds'));
writeFileSync(join(AQUI, 'util.mjs'), `
export const isLabel = (el) => Boolean(el && el.labelTarget);
export const getSimulationData = (el) => (el && el._datos) || null;
${puro}
`);

console.log('Código del plugin preparado en verificacion/');
console.log(execSync(`node --check ${join(AQUI, 'SimulationEngine.mjs')} && echo "sintaxis del motor: OK"`, { encoding: 'utf8' }).trim());
console.log('Ahora los arneses, uno a uno o todos con `pnpm run verificar`.');
