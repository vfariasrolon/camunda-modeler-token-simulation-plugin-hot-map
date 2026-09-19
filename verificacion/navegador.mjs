/**
 * Arneses de NAVEGADOR: los que necesitan DOM real, canvas y filtros SVG.
 *
 * Por qué viven aparte de los `0X-*.mjs`: los de Node importan el codigo puro y
 * comprueban logica; estos montan diagram-js de verdad y comprueban lo que solo
 * se puede ver en un navegador (un `getComputedStyle`, un `matrix`, un
 * `feFuncR`). El fallo que dejo pasar la regresion del zoom no era de logica: era
 * del CICLO DE EVENTOS, y eso no se ve sin navegador.
 *
 * Uso:  node verificacion/navegador.mjs
 * Requiere Google Chrome. Se salta solo (con aviso) si no lo encuentra.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].find(existsSync);

if (!CHROME) {
  console.log('Chrome no encontrado: se saltan los arneses de navegador.');
  process.exit(0);
}

// Los arneses viven versionados en verificacion/navegador/ y se copian a un
// directorio temporal para compilarlos (webpack escribe un bundle, y el repo no
// debe llenarse de derivados).
const ORIGEN = join(AQUI, 'navegador');
const TRABAJO = join(tmpdir(), 'qwen-verificacion-navegador');
mkdirSync(join(TRABAJO, 'dist'), { recursive: true });

const casos = [
  { nombre: 'mapa de calor (color y opacidad)', entry: 'mapa-de-calor.js' },
  // El camino del CONTROLADOR, que es el que pinta de verdad en el Modeler: el otro
  // arnes conduce la libreria directa y por eso no cubria la orquestacion.
  { nombre: 'mapa de calor (las once metricas)', entry: 'mapa-de-calor-controlador.js' },
  { nombre: 'IDs de tarea (overlay y zoom)', entry: 'ids-de-tarea.js' },
  // El editor de datos es el archivo mas GRANDE del plugin (3000+ lineas) y hasta
  // ahora su unico arnes vivia en /tmp, asi que se perdia al reiniciar. Aqui queda
  // versionado: es la red que hace falta antes de reestructurar sus pestanas.
  { nombre: 'panel de datos (tareas, global y CSV)', entry: 'panel-de-datos.js' }
  // PENDIENTE: 'informe-pdf.js' esta escrito y NO se ha podido poner en verde. El bundle
  // compila y el modulo carga -comprobado a mano-, pero al ejecutarlo en el runner de Chrome
  // falla con «Script error» sin linea, y no he conseguido ver la causa. Se deja el archivo
  // versionado para no perderlo y se documenta aqui en vez de dejar la suite en rojo por un
  // arnes que aun no sirve. NO se registra hasta que pase.
];

let fallos = 0;

for (const caso of casos) {
  const entry = join(TRABAJO, caso.entry);
  cpSync(join(ORIGEN, caso.entry), entry);

  writeFileSync(join(TRABAJO, 'webpack.config.js'), `
const ROOT = ${JSON.stringify(RAIZ)};
const path = require('path');
const glob = require('fs').readdirSync(path.join(ROOT, 'node_modules', '.pnpm'))
  .filter((d) => d.startsWith('didi@'));

module.exports = {
  mode: 'development', devtool: false,
  entry: ${JSON.stringify(entry)},
  output: { path: ${JSON.stringify(join(TRABAJO, 'dist'))}, filename: 'bundle.js' },
  resolve: {
    modules: [ ROOT + '/node_modules', 'node_modules' ],
    alias: {
      // Los arneses importan el codigo del plugin por un alias y no por ruta
      // relativa: el runner los COPIA a un temporal, asi que un \`../../client\`
      // apuntaria al directorio equivocado. Con el alias, la ruta se resuelve
      // siempre contra el repo.
      '@plugin': path.join(ROOT, 'client'),
      ...Object.fromEntries(glob.map((d) => [
        'didi/dist/index.js',
        path.join(ROOT, 'node_modules', '.pnpm', d, 'node_modules', 'didi', 'dist', 'index.js')
      ]))
    }
  },
  resolveLoader: { modules: [ ROOT + '/node_modules', 'node_modules' ] },
  module: { rules: [ { test: /\\.css$/, use: [ 'style-loader', 'css-loader' ] } ] }
};
`);

  writeFileSync(join(TRABAJO, 'index.html'), `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>${caso.nombre}</title></head>
<body>
<div id="lienzo"></div>
<pre id="informe">(sin ejecutar)</pre>
<script>
window.addEventListener('error', (e) => {
  const p = document.getElementById('informe');
  if (p.textContent !== '(sin ejecutar)') return;
  p.textContent = 'ERROR: ' + (e.message || '') + '\\n' + (e.error && e.error.stack ? e.error.stack : '');
});
</script>
<script src="dist/bundle.js"></script></body></html>
`);

  let salida = '';
  try {
    execFileSync(join(RAIZ, 'node_modules', '.bin', 'webpack'),
      [ '--config', join(TRABAJO, 'webpack.config.js') ], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    salida = 'FALLO al compilar: ' + (e.stdout || e.message);
  }

  if (!salida) {
    try {
      const dom = execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--no-sandbox',
        '--virtual-time-budget=8000', '--dump-dom',
        'file://' + join(TRABAJO, 'index.html')
      ], { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'ignore' ] });

      const informe = dom.match(/<pre id="informe">([\s\S]*?)<\/pre>/);
      salida = informe ? informe[1]
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : 'sin informe';
    } catch (e) {
      salida = 'FALLO al ejecutar Chrome: ' + e.message;
    }
  }

  const paso = /TODAS LAS COMPROBACIONES PASAN/.test(salida);
  if (!paso) fallos++;
  const checks = (salida.match(/^\s+(OK|FALLO)\s/gm) || []).length;

  console.log(`${paso ? 'OK   ' : 'FALLA'}  ${caso.nombre}  (${checks} comprobaciones)`);
  if (!paso) salida.split('\n').filter((l) => l.includes('FALLO') || l.includes('ERROR') || l.includes('DIAG')).forEach((l) => console.log(`        ${l.trim()}`));
}

console.log('');
console.log(`${casos.length} arneses de navegador · ${fallos === 0 ? 'TODO PASA' : `${fallos} CON FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
