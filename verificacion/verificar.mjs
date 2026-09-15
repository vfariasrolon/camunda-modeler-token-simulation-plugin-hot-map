/**
 * Corre TODOS los arneses de verificación y resume el resultado.
 *
 * Un solo comando para saber si algo se rompió: `pnpm run verificar`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const arneses = readdirSync(AQUI).filter((f) => /^\d\d-.*\.mjs$/.test(f)).sort();

let fallos = 0;
let comprobaciones = 0;
const resumen = [];

for (const arnes of arneses) {
  let salida = '';
  let codigo = 0;
  try {
    salida = execFileSync('node', [ join(AQUI, arnes) ], { encoding: 'utf8' });
  } catch (e) {
    codigo = e.status == null ? 1 : e.status;
    salida = `${e.stdout || ''}${e.stderr || ''}`;
  }

  // Cada arnes imprime su recuento y su veredicto; se extraen para el resumen.
  const checks = (salida.match(/^\s+(OK|FALLO)\s/gm) || []).length;
  comprobaciones += checks;
  const paso = codigo === 0;
  if (!paso) fallos++;

  resumen.push({ arnes, paso, checks });
  console.log(`${paso ? 'OK   ' : 'FALLA'}  ${arnes}${checks ? `  (${checks} comprobaciones)` : ''}`);
  if (!paso) {
    // Se imprime solo lo que falló, para que el error sea lo primero que se lee.
    salida.split('\n').filter((l) => l.includes('FALLO') || l.includes('Error')).forEach((l) => console.log(`        ${l.trim()}`));
  }
}

console.log('');
console.log(`${arneses.length} arneses · ${comprobaciones} comprobaciones · ${fallos === 0 ? 'TODO PASA' : `${fallos} ARNES(ES) CON FALLOS`}`);

process.exit(fallos === 0 ? 0 : 1);
