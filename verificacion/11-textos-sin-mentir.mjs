/**
 * Los textos del producto no pueden mentir sobre lo que el motor hace.
 *
 * Por qué existe este arnés: la semilla se añadió en A3 y durante varios bloques
 * el informe siguió diciendo «sin semilla fija», y las limitaciones seguían
 * citando «sin lotes» cuando los lotes ya estaban hechos. Eso es peor que no
 * documentar nada: quien audita el informe deja de fiarse de todo lo demás.
 *
 * Comprueba que cada afirmación de «no hace X» sigue siendo cierta. Cuando
 * implementes X, este arnés FALLA y te obliga a actualizar el texto.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let fallos = 0;
const ok = (cond, etiqueta, detalle) => {
  console.log(`${cond ? '  OK   ' : '  FALLO'}  ${etiqueta}${detalle === undefined ? '' : '  ->  ' + detalle}`);
  if (!cond) fallos++;
};

const SIM = join(dirname(fileURLToPath(import.meta.url)), '..', 'client', 'simulation');
const leer = (f) => readFileSync(join(SIM, f), 'utf8');

console.log('\n== 1. Lo que el motor SÍ hace no puede negarse en los textos ==');
{
  // Cada fila: [ capacidad implementada, texto que NO puede aparecer, donde ].
  // Los textos se buscan tal cual, sin distinguir mayusculas.
  const prohibidos = [
    {
      capacidad: 'semilla reproducible (§4.4)',
      // Se implementa en A3. Si algún día se quita, este arnés deja de tener sentido.
      implementada: /seed/.test(leer('SimulationEngine.js')) && /crearAleatorio/.test(leer('SimulationEngine.js')),
      textos: [ /sin semilla fija/i ],
      archivos: [ 'ReportPanel.js', 'ChartPanel.js' ]
    },
    {
      capacidad: 'lotes en serie (§4.3)',
      implementada: /normalizeLots/.test(leer('SimulationEngine.js')),
      textos: [ /limitaciones[^<]*sin lotes/i, /sin lotes ni transporte/i ],
      archivos: [ 'ReportPanel.js', 'ChartPanel.js' ]
    },
    {
      capacidad: 'curva de arranque (§6)',
      implementada: /normalizeWarmup/.test(leer('WarmupCurve.js')),
      textos: [ /sin curva de arranque/i ],
      archivos: [ 'ReportPanel.js', 'ChartPanel.js' ]
    },
    {
      capacidad: 'reglas laborales y cumplimiento LFT (§5)',
      implementada: /resolveLabor/.test(leer('LaborRules.js')),
      textos: [ /sin cumplimiento legal/i, /no calcula el cumplimiento/i ],
      archivos: [ 'ReportPanel.js' ]
    },
    {
      capacidad: 'carga física (§8.1)',
      implementada: /normalizeCarga/.test(leer('Workload.js')),
      textos: [ /sin carga física/i, /no calcula la masa/i ],
      archivos: [ 'ReportPanel.js', 'ChartPanel.js' ]
    },
    {
      capacidad: 'colaboradores con nombre (§8.2)',
      implementada: /normalizeMembers/.test(leer('Workload.js')),
      textos: [ /sin colaboradores/i, /sin miembros con nombre/i ],
      archivos: [ 'ReportPanel.js' ]
    }
  ];

  prohibidos.forEach(({ capacidad, implementada, textos, archivos }) => {
    const fuentes = archivos.map((a) => ({ a, src: leer(a) }));
    textos.forEach((t) => {
      fuentes.forEach(({ a, src }) => {
        const aparece = t.test(src);
        ok(!aparece, `${a} no dice que falte «${capacidad}»`,
          aparece ? `dice «${String(src.match(t)[0])}» y SÍ está implementada` : 'ok');
      });
    });
  });
}

console.log('\n== 2. Lo que sigue siendo cierto se declara ==');
{
  // La limitacion metodologica principal: tiene que seguir declarada. Si algún
  // día se implementan las replicas, esta comprobacion falla y hay que cambiarla.
  const reporte = leer('ReportPanel.js');
  ok(/sin intervalo de confianza/i.test(reporte) || /sin <strong>intervalo de confianza/i.test(reporte),
    'el informe declara que no hay intervalo de confianza (sigue siendo cierto)');
  ok(/una sola\s*\n?\s*réplica|una sola réplica/i.test(reporte),
    'y que cada corrida es una sola réplica');
  ok(/calentamiento|transitorio/i.test(reporte),
    'y el transitorio sin excluir');

  const motor = leer('SimulationEngine.js');
  const hayReplicas = /nReplicas|intervaloDeConfianza|replicas\s*=\s*\d/.test(motor);
  ok(!hayReplicas, 'las réplicas automáticas SIGUEN sin implementarse (si las haces, actualiza los textos)');
}

console.log('\n== 3. La semilla se imprime donde se promete ==');
{
  const reporte = leer('ReportPanel.js');
  ok(/Semilla de la corrida/i.test(reporte),
    'el informe tiene una fila para la semilla');
  ok(/ctx\.semilla/.test(reporte), 'y lee el dato del contexto');

  const controlador = leer('SimulationController.js');
  ok(/semilla:\s*this\._simulationEngine\.seed/.test(controlador),
    'y el controlador se la pasa desde el motor');
}

console.log('\n== 4. La guia del usuario coincide con el motor ==');
{
  const guia = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'GUIA_SIMULACION.md'), 'utf8');

  ok(/Semilla fija \(PRNG reproducible\) \| \*\*Sí\*\*/.test(guia),
    'la guia dice que la semilla SÍ está (no «No»)');
  ok(!/los dos\s*\n?\s*planes usan flujos aleatorios independientes/i.test(guia),
    'la guia ya no dice que los dos planes usan azar independiente (comparten semilla)');
  ok(/cambia la semilla/i.test(guia) || /cambiando la semilla/i.test(guia),
    'y dice que hay que CAMBIAR la semilla para estimar el ruido');

  ok(/los \*\*lotes\*\* sí están modelados/i.test(guia),
    'y reconoce que los lotes sí están modelados');
}

console.log(`\n== RESULTADO: ${fallos === 0 ? 'TODAS LAS COMPROBACIONES PASAN' : fallos + ' FALLO(S)'} ==\n`);
process.exit(fallos === 0 ? 0 : 1);
