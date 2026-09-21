import { domify, event as domEvent } from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import Chart from 'chart.js/auto';
import {
  getSimulationData, isLabel, nombreElemento, formatMinutes, formatMilliseconds, formatCurrency,
  resumenMuestras, describirUtilizacion
} from './util';
import { compararEscenarios, notaDelTopeLegal, svgTresEscenarios } from './ComparativaPlanes.js';
import { diagnosticarCapacidad, avisosPorSaturacion } from './CapacityGuard.js';

const OPEN_CLS = 'sim-report-open';

// ---------------------------------------------------------------------------
// Estilos del informe.
//
// Van como cadena de texto (y no en un .css importado) porque el informe se
// imprime dentro de un iframe con SU PROPIO documento: alli no llegan las hojas
// del bundle. Tener una sola cadena garantiza que lo que se ve en pantalla y lo
// que se imprime son el mismo diseno, sin duplicar la fuente de verdad.
// ---------------------------------------------------------------------------
const ESTILOS_INFORME = `
.sim-report { font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
.sim-report h1 { font-size: 24px; margin: 0 0 4px; }
.sim-report h2 { font-size: 17px; margin: 26px 0 10px; padding-bottom: 5px; border-bottom: 2px solid #1565c0; color: #0d47a1; }
.sim-report h3 { font-size: 14px; margin: 18px 0 6px; color: #333; }
.sim-report h4 { font-size: 13px; margin: 14px 0 4px; color: #444; }
.sim-report p { margin: 6px 0; }
.sim-report .sub { color: #666; margin: 0 0 14px; }
/* El mismo .sub usado DENTRO de una celda: ahi no lleva margen de parrafo, va en
   su propia linea y mas pequeno, para explicar la cifra de al lado sin competir
   con ella. */
.sim-report td .sub, .sim-report th .sub { display: block; margin: 2px 0 0; font-size: 10.5px; line-height: 1.35; font-weight: 400; }
.sim-report table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 12px; }
.sim-report th { background: #eef3f9; border: 1px solid #cfd8e3; padding: 6px 8px; text-align: left; font-weight: 600; }
.sim-report td { border: 1px solid #dfe5ec; padding: 5px 8px; }
.sim-report td.num, .sim-report th.num { text-align: right; font-variant-numeric: tabular-nums; }
.sim-report tr:nth-child(even) td { background: #fafbfd; }
.sim-report figure { margin: 12px 0 18px; break-inside: avoid; page-break-inside: avoid; }
.sim-report figure img { width: 100%; height: auto; border: 1px solid #dde3ea; border-radius: 4px; }
.sim-report figcaption { font-size: 11.5px; color: #666; margin-top: 4px; }
.sim-report .aviso { border-left: 4px solid #f9a825; background: #fff8e1; padding: 10px 13px; margin: 12px 0; border-radius: 4px; }
.sim-report .aviso.ok { border-color: #2e7d32; background: #edf7ee; }
.sim-report .aviso.mal { border-color: #c62828; background: #fdecea; }
/* Cumple / no cumple, en la tabla de escenarios. El color lo lleva la palabra y no la
   celda entera: pintar la fila de rojo por incumplir exagera lo que se esta diciendo,
   porque el escenario sin tope NO es un error del modelo sino una opcion. */
.sim-report .ok-txt { color: #2e7d32; font-weight: 600; }
.sim-report .mal-txt { color: #c62828; font-weight: 600; }
/* La leyenda del grafico de escenarios, impresa. En papel no se puede pasar el raton
   por encima de las curvas, asi que el color de cada una tiene que estar escrito. */
.sim-report .leyenda-escenarios {
  list-style: none; padding-left: 0; margin: 6px 0 0;
  display: flex; flex-wrap: wrap; gap: 4px 16px;
}
.sim-report .leyenda-escenarios li { font-size: 11.5px; color: #444; }
.sim-report .leyenda-escenarios .gl {
  display: inline-block; width: 10px; height: 10px; border-radius: 2px;
  margin-right: 5px; vertical-align: baseline;
}
.sim-report .veredicto { display: flex; align-items: center; gap: 18px; border: 1px solid #cfd8e3; border-radius: 8px; padding: 16px 18px; margin: 14px 0; break-inside: avoid; }
.sim-report .veredicto .puntos { font-size: 34px; font-weight: 700; line-height: 1; color: #1565c0; }
.sim-report .veredicto .puntos small { display: block; font-size: 11px; font-weight: 400; color: #777; }
.sim-report .veredicto .texto { flex: 1; }
.sim-report .veredicto .texto strong { font-size: 15px; }
.sim-report .barra { height: 8px; background: #e8edf3; border-radius: 4px; overflow: hidden; margin-top: 6px; }
.sim-report .barra > span { display: block; height: 100%; background: #1565c0; }
.sim-report .etiqueta { display: inline-block; padding: 1px 7px; border-radius: 9px; font-size: 11px; font-weight: 600; background: #eee; color: #555; }
.sim-report .etiqueta.ok { background: #e6f4ea; color: #0a7d32; }
.sim-report .etiqueta.aviso { background: #fff4e0; color: #a35b00; }
.sim-report .etiqueta.mal { background: #fdecea; color: #c62828; }
/* Color de texto suelto: se usa dentro de tablas y de listas, donde una
   etiqueta con fondo recargaria la lectura. */
.sim-report .ok { color: #0a7d32; }
.sim-report .mal { color: #c62828; font-weight: 600; }
.sim-report td.col-mal { color: #c62828; }
.sim-report .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 12px 0; }
.sim-report .kpi { border: 1px solid #dfe5ec; border-radius: 6px; padding: 9px 11px; break-inside: avoid; }
.sim-report .kpi .k { font-size: 11px; color: #666; }
.sim-report .kpi .v { font-size: 17px; font-weight: 600; color: #0d47a1; }
.sim-report .pie { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 11px; color: #777; }
.sim-report ul { margin: 6px 0; padding-left: 20px; }
.sim-report li { margin-bottom: 5px; }

@page { size: A4; margin: 15mm 13mm; }
@media print {
  .sim-report h1, .sim-report h2 { break-after: avoid; page-break-after: avoid; }
  .sim-report table, .sim-report .kpis, .sim-report .veredicto { break-inside: avoid; page-break-inside: avoid; }
  .sim-report .salto { break-before: page; page-break-before: always; }
  .sim-report figure img { box-shadow: none; }
}
`;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (v, dec = 2) => (Number.isFinite(v) ? v.toFixed(dec) : '—');
const ent = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-MX') : '—');

/**
 * Rampa lineal de puntuacion: `bueno` vale 100 puntos, `malo` vale 0.
 *
 * Lineal y no una curva "bonita" a proposito: la lineal es la unica que el lector
 * puede rehacer mentalmente a partir del valor y de los dos umbrales. Esa es la
 * condicion para que el puntaje sea auditable y no una cifra con aire de
 * autoridad. Funciona en cualquier direccion (mayor-mejor o menor-mejor) porque
 * los umbrales se dan en la escala de la propia metrica.
 */
const rampa = (valor, bueno, malo) => {
  if (!Number.isFinite(valor)) return null;
  if (bueno === malo) return valor <= bueno ? 100 : 0;
  const t = (valor - bueno) / (malo - bueno);
  return Math.max(0, Math.min(100, (1 - t) * 100));
};

const veredictoDe = (puntos) => {
  if (puntos == null) return { titulo: 'Sin datos suficientes', nivel: '' };
  if (puntos >= 85) return { titulo: 'Proceso sólido', nivel: 'ok' };
  if (puntos >= 70) return { titulo: 'Apto con reservas', nivel: 'aviso' };
  if (puntos >= 50) return { titulo: 'Requiere mejoras antes de operar', nivel: 'aviso' };
  return { titulo: 'No apto: hay un problema estructural', nivel: 'mal' };
};

export default class ReportPanel {

  constructor(canvas, eventBus, elementRegistry, notifications, simulationController) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._notifications = notifications;
    this._controller = simulationController;

    this._overlay = null;

    this._eventBus.on('canvas.init', () => this._init());
    this._eventBus.on('diagram.destroy', () => this.destroy());
    this._eventBus.on('simulation.report.requested', () => this.toggle());
  }

  _init() {
    if (this._overlay) return;

    const overlay = this._overlay = domify(`
      <div class="sim-report-overlay">
        <div class="sim-report-barra">
          <span class="sim-report-titulo">Informe técnico de evaluación</span>
          <div class="sim-report-acciones">
            <button class="btn-imprimir" title="Guardar como PDF" data-tip="Guardar como PDF (elige «Guardar como PDF» en el diálogo)">Guardar como PDF</button>
            <button class="btn-cerrar" title="Cerrar" data-tip="Cerrar el informe" data-tip-pos="left">×</button>
          </div>
        </div>
        <div class="sim-report-lienzo"></div>
      </div>
    `);

    // Los estilos se inyectan una sola vez y son los MISMOS que usa el iframe de
    // impresion (ver ESTILOS_INFORME).
    if (!document.getElementById('sim-report-estilos')) {
      const estilo = domify(`<style id="sim-report-estilos">${ESTILOS_INFORME}</style>`);
      document.head.appendChild(estilo);
    }

    this._lienzo = overlay.querySelector('.sim-report-lienzo');
    this._canvas.getContainer().appendChild(overlay);

    domEvent.bind(overlay.querySelector('.btn-cerrar'), 'click', () => this.close());
    domEvent.bind(overlay.querySelector('.btn-imprimir'), 'click', () => this._imprimir());

    // Estilo minimo del contenedor en pantalla (no va en ESTILOS_INFORME porque
    // solo aplica a la ventana de la aplicacion, no al papel).
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2500;display:none;flex-direction:column;background:#f4f6f9;';
    overlay.querySelector('.sim-report-barra').style.cssText =
      'display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #dde3ea;';
    overlay.querySelector('.sim-report-titulo').style.cssText = 'font-weight:600;flex:1;';
    overlay.querySelector('.sim-report-acciones').style.cssText = 'display:flex;gap:6px;align-items:center;';
    overlay.querySelector('.btn-imprimir').style.cssText =
      'padding:7px 14px;font-size:13px;font-weight:600;color:#fff;background:#1565c0;border:0;border-radius:4px;cursor:pointer;';
    overlay.querySelector('.btn-cerrar').style.cssText =
      'width:30px;height:30px;font-size:18px;line-height:1;background:none;border:0;border-radius:4px;cursor:pointer;color:#555;';
    overlay.querySelector('.sim-report-lienzo').style.cssText =
      'flex:1;min-height:0;overflow:auto;padding:24px;';
  }

  isOpen() { return this._overlay && this._overlay.style.display === 'flex'; }
  toggle() { this.isOpen() ? this.close() : this.open(); }

  close() {
    if (this._overlay) this._overlay.style.display = 'none';
  }

  open() {
    const datos = this._controller.getReportData();

    if (!datos.normal || !datos.overtime) {
      this._notifications.showNotification({
        text: 'Ejecuta una simulación antes de generar el informe.',
        type: 'warning',
        duration: 5000
      });
      return;
    }

    if (!this._overlay) this._init();
    this._overlay.style.display = 'flex';
    this._lienzo.innerHTML = '<p style="padding:20px;color:#666">Generando informe y figuras…</p>';

    // Se aplaza un frame para que el aviso de "generando" se pinte antes de que
    // Chart.js dibuje las figuras (que es sincrono y bloquea el hilo).
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this._construir(datos);
    }));
  }

  // -- contenido ------------------------------------------------------------

  _construir(datos) {
    const contexto = this._contexto(datos);
    const figuras = this._figuras();

    this._lienzo.innerHTML = `<div class="sim-report">
      ${this._portada(contexto)}
      ${this._resumen(contexto)}
      ${this._metodologia()}
      ${this._comprobacion(contexto)}
      ${this._laboral(contexto)}
      ${this._carga(contexto)}
      ${this._entradas()}
      ${this._resultados(contexto, figuras)}
      ${this._capacidad(contexto, figuras)}
      ${this._scorecard(contexto)}
      ${this._hallazgos(contexto)}
      ${this._anexos(contexto)}
    </div>`;

    this._htmlInforme = this._documentoImprimible(this._lienzo.innerHTML);
  }

  /**
   * Reune todo lo que necesitan el informe y sus puntajes, en un solo sitio.
   *
   * Cualquier metrica que use el scorecard sale de aqui: asi el documento y la
   * puntuacion no pueden discrepar, porque leen el mismo numero.
   */
  _contexto(datos) {
    const { normal, overtime, tareas, flujos } = datos;

    const suma = (report, campo) => {
      let t = 0;
      (report ? report.results : new Map()).forEach((r) => { t += r[campo] || 0; });
      return t;
    };

    const operacion = suma(overtime, 'totalOperationCost');
    const doble = suma(overtime, 'totalDoubleOvertimeCost');
    const triple = suma(overtime, 'totalTripleOvertimeCost');
    const costoEspera = suma(overtime, 'totalWaitTimeCost');

    // LA SEPARACION: cuanto de la operacion es NOMINA y cuanto es FACTURA de un
    // proveedor. Se calcula restando, no sumando: `totalOperationCost` sigue
    // incluyendo las dos cosas (es lo que ya leian el resumen y el informe), y
    // `totalExternalCost` marca la parte facturada. Asi ningun numero ya publicado
    // cambia de significado, y la separacion es informacion anadida.
    const facturas = suma(overtime, 'totalExternalCost');
    const nomina = operacion - facturas;

    const costoTotal = operacion + doble + triple + costoEspera;

    const completadas = overtime ? overtime.completedInstances : 0;
    const minutosLaborables = overtime ? (overtime.calendarDuration || 0) / 60000 : 0;

    const ciclo = resumenMuestras((overtime && overtime.cycleTimes) || []);
    const cicloNormal = resumenMuestras((normal && normal.cycleTimes) || []);

    const utilizacion = Array.from((overtime && overtime.utilization) || [])
      .sort((a, b) => b.utilization - a.utilization);
    const utilizacionMax = utilizacion.length ? utilizacion[0].utilization : null;

    // La espera solo se puntua si el modelo usa recursos: sin restriccion de
    // recursos no hay cola que juzgar, y puntuar un 0 seria enganoso.
    const esperaTotal = suma(overtime, 'totalWaitTime');
    const esperaPorCaso = utilizacion.length && completadas ? esperaTotal / completadas : null;
    const esperaRelativa = (esperaPorCaso != null && ciclo && ciclo.media > 0)
      ? esperaPorCaso / ciclo.media
      : null;

    const ejecucionesTareas = tareas.reduce((a, t) => a + ((overtime && overtime.results.get(t.id) || {}).executionCount || 0), 0);
    const fallos = suma(overtime, 'failureCount');
    const tasaFallos = ejecucionesTareas > 0 ? fallos / ejecucionesTareas : null;

    const primaRelativa = operacion > 0 ? (doble + triple) / operacion : null;

    // Estabilidad: coeficiente de variacion de la produccion diaria.
    const porDia = Array.from((normal && normal.dailyCompletions) || [])
      .map(([, v]) => v)
      .sort((a, b) => a - b);
    const mediaDia = porDia.length ? porDia.reduce((a, b) => a + b, 0) / porDia.length : 0;
    const varDia = porDia.length > 1
      ? porDia.reduce((a, b) => a + (b - mediaDia) ** 2, 0) / (porDia.length - 1)
      : 0;
    const cvProduccion = mediaDia > 0 ? Math.sqrt(varDia) / mediaDia : null;

    const incidencias = this._incidencias(tareas, flujos);

    return {
      normal, overtime, tareas, flujos,
      operacion, doble, triple, costoEspera, costoTotal,
      nomina, facturas,
      completadas, minutosLaborables, dias: porDia.length,
      costoUnitario: completadas > 0 ? costoTotal / completadas : null,
      primas: doble + triple,
      primaRelativa,
      esperaTotal, esperaPorCaso, esperaRelativa,
      utilizacion, utilizacionMax,
      // EL DIAGNOSTICO DE SATURACION. Va en el contexto y no dentro de una seccion porque lo leen
      // VARIAS: la portada, el resumen, los percentiles de ciclo y el Pareto de esperas. Cada una
      // tiene que decir su propia parte, y para eso necesita el mismo diagnostico.
      saturacion: diagnosticarCapacidad(utilizacion),
      ciclo, cicloNormal,
      tasaFallos, ejecucionesTareas,
      cvProduccion,
      incidencias,
      // Reglas laborales RESUELTAS (no lo que el usuario escribió) y el
      // cumplimiento de los topes. Van en el contexto porque el documento y el
      // veredicto tienen que leer el mismo número.
      labor: (overtime && overtime.labor) || null,
      laborDescripcion: (overtime && overtime.laborDescripcion) || null,
      // La semilla de la corrida: el informe la imprime para que se pueda repetir.
      semilla: (overtime && overtime.semilla) || null,
      cumplimiento: (overtime && overtime.compliance) || null,
      // LOS TRES ESCENARIOS DE HORAS EXTRA, ya comparados. Se calcula aqui y no en la
      // plantilla porque es el unico sitio donde estan los tres informes juntos, y porque la
      // comparativa es logica pura que el arnes puede probar sin montar el documento.
      //
      // Puede faltar cualquiera de los dos de extra (un modelo sin tarifas de horas extra, o
      // un informe viejo); `compararEscenarios` devuelve null y la seccion se imprime como
      // «no hay escenarios que comparar» en vez de romper el informe entero.
      escenariosTres: (overtime && datos.legal)
        ? compararEscenarios({ normal, legal: datos.legal, extra: overtime })
        : null,
      primasDeDia: suma(overtime, 'totalDayPremiumCost'),
      primasDia: (overtime && overtime.dayPremiums) || null,
      // Carga fisica y personas (A5). `carga` viene con las tres vistas ya
      // aplanadas (area / por tarea / por persona) y NUNCA sumadas entre si.
      carga: (overtime && overtime.carga) || null,
      operatividad: (overtime && overtime.operatividad) || null,
      pools: (overtime && overtime.resourcePools) || []
    };
  }

  /**
   * Incidencias del MODELO (no de los resultados).
   *
   * Se revisan a proposito porque son errores silenciosos: el motor no avisa de
   * nada de esto, simplemente da numeros peores.
   */
  _incidencias(tareas, flujos) {
    const lista = [];

    // Un reparto de compuerta que no sume 100 % desvia casos a la ultima rama.
    const porCompuerta = new Map();
    flujos.forEach((f) => {
      const p = getSimulationData(f);
      const valor = p && typeof p.branchingProbability === 'number'
        ? p.branchingProbability
        : 1 / ((f.source && f.source.outgoing ? f.source.outgoing.length : 1));
      const lista2 = porCompuerta.get(f.source.id) || { gateway: f.source, suma: 0, flujos: [] };
      lista2.suma += valor;
      lista2.flujos.push(f);
      porCompuerta.set(f.source.id, lista2);
    });

    porCompuerta.forEach((g) => {
      if (g.flujos.length <= 1) return;
      const pct = Math.round(g.suma * 10000) / 100;
      if (Math.abs(pct - 100) > 0.5) {
        lista.push(`La compuerta «${nombreElemento(g.gateway)}» reparte ${pct} % y debería sumar 100 %`
          + ' (el sobrante se desvía a la última salida).');
      }
    });

    tareas.forEach((t) => {
      const d = getSimulationData(t);
      if (!d || !d.processingTime) {
        lista.push(`La tarea «${nombreElemento(t)}» no tiene tiempo de proceso configurado: se simula como 0.`);
      }
    });

    return lista;
  }

  // -- secciones ------------------------------------------------------------

  _portada(ctx) {
    const ahora = new Date();
    const fichero = (String(document.title || '').split(/\s[-–|]\s/)[0] || '').trim() || '(sin nombre)';
    const porDia = ctx.dias > 0 ? ctx.completadas / ctx.dias : null;

    return `
      <h1>Informe técnico de evaluación de proceso</h1>
      <p class="sub">Modelo BPMN simulado por eventos discretos · ${esc(fichero)}</p>
      <table>
        <tr><th>Generado</th><td>${ahora.toLocaleString('es-MX')}</td>
            <th class="num">Instancias completadas</th><td class="num">${ent(ctx.completadas)}</td></tr>
        <tr><th>Plan evaluado</th><td>Con horas extra (frente al plan normal)</td>
            <th>Jornada</th><td>${esc(this._jornada(ctx))}</td></tr>
        ${this._fechas(ctx)}
        <tr><th>Días laborables simulados</th><td class="num">${ent(ctx.dias)}</td>
            <th class="num">Media de piezas por día</th><td class="num">${num(porDia, 1)}</td></tr>
        <tr><th>Reparto de llegadas</th><td colspan="3">${esc(this._llegada(ctx))}</td></tr>
        <tr><th>Semilla de la corrida</th><td colspan="3">${
          ctx.semilla
            ? `<code>${esc(String(ctx.semilla))}</code> — con esta semilla la corrida se <strong>reproduce
              exactamente</strong>. Es lo que permite repetirla o auditarla dentro de meses.`
            : 'no declarada'
        }</td></tr>
        <tr><th>Reglas laborales</th><td colspan="3">${esc(ctx.laborDescripcion || '(sin reglas declaradas)')}</td></tr>
        ${ctx.cumplimiento ? `<tr><th>Cumplimiento de topes</th><td colspan="3">${
          (ctx.cumplimiento.semanasSobreLimite > 0 || ctx.cumplimiento.diasSobreLimiteDiario > 0 || ctx.cumplimiento.semanasSobreDias > 0)
            ? `<span class="mal">NO CUMPLE</span> — ${ctx.cumplimiento.semanasSobreLimite} de ${ctx.cumplimiento.semanas} semana(s)`
              + ` por encima del cupo, ${ctx.cumplimiento.diasSobreLimiteDiario} día(s) por encima del tope diario`
            : `<span class="ok">CUMPLE</span> — ningún día ni semana supera los topes`}</td></tr>` : ''}
      </table>
    `;
  }

  /**
   * Fechas de inicio y fin, y los días contados en los DOS relojes.
   *
   * Va en la portada porque es la primera pregunta que se hace quien lee un
   * informe de plazos: «¿esto cuándo empieza y cuándo termina?». Y da las dos
   * cifras a propósito: `días laborables` es lo que se trabaja y se paga;
   * `días naturales` es lo que tarda en llegar la fecha, con los fines de semana
   * y festivos dentro. Confundirlos es el error más fácil de cometer al leer.
   */
  _fechas(ctx) {
    const r = ctx.overtime || {};
    if (!r.inicio || !r.fin) return '';

    const f = (d) => d.toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const diasNat = r.diasNaturales;
    const noLaborables = (diasNat != null) ? Math.max(0, diasNat - ctx.dias) : null;

    return `
      <tr><th>Empieza</th><td>${f(r.inicio)}</td>
          <th>Termina</th><td>${f(r.fin)}</td></tr>
      <tr><th>Días laborables</th><td><strong>${ent(ctx.dias)}</strong>
            <span class="sub">lo que se trabaja y se paga</span></td>
          <th>Días naturales</th><td><strong>${diasNat == null ? '—' : ent(diasNat)}</strong>
            <span class="sub">lo que tarda en llegar la fecha${
              noLaborables ? ` (${ent(noLaborables)} día(s) no laborable(s) dentro)` : ''}</span></td></tr>
    `;
  }

  _jornada(ctx) {
    const cal = ctx.overtime && ctx.overtime.config && ctx.overtime.config.calendar;
    if (!cal || !cal.workingHours) return '(sin calendario)';
    const h = (t) => `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    const ext = ctx.overtime.overtimeCalendar && ctx.overtime.overtimeCalendar.workingHours
      ? ` (extendida: ${h(ctx.overtime.overtimeCalendar.workingHours.end)})`
      : '';
    return `${h(cal.workingHours.start)}–${h(cal.workingHours.end)}${ext}`;
  }

  _llegada(ctx) {
    const r = ctx.overtime && ctx.overtime.config && ctx.overtime.config.arrivalRate;
    if (!r || !(r.value > 0)) return 'sin llegadas (solo la instancia inicial)';
    const seg = r.unit === 'hour' ? 3600 / r.value : r.unit === 'second' ? 1 / r.value : 60 / r.value;
    const cada = seg < 1 ? `una cada ${(seg * 1000).toFixed(0)} ms`
      : seg < 90 ? `una cada ${seg.toFixed(1)} s`
      : `una cada ${(seg / 60).toFixed(1)} min`;
    return `${r.value} por ${r.unit || 'minute'} → ${cada}`;
  }

  _resumen(ctx) {
    const puntos = this._puntajeTotal(ctx);
    const v = veredictoDe(puntos);

    return `
      <h2>1 · Resumen ejecutivo</h2>
      <div class="veredicto ${v.nivel}">
        <div class="puntos">${puntos == null ? '—' : Math.round(puntos)}<small>de 100 (orientativo)</small></div>
        <div class="texto">
          <strong>${esc(v.titulo)}</strong>
          <div class="barra"><span style="width:${puntos == null ? 0 : Math.max(2, Math.min(100, puntos))}%"></span></div>
          <p class="sub" style="margin:6px 0 0">Puntaje de dimensiones estructurales (capacidad, colas, calidad,
          coste indirecto, estabilidad y consistencia del modelo). Excluye costo unitario y plazo porque exigirían
          un objetivo declarado por el negocio; se informan abajo sin calificar.</p>
        </div>
      </div>

      <div class="kpis">
        ${this._kpi('Piezas terminadas', ent(ctx.completadas))}
        ${this._kpi('Costo total', formatCurrency(ctx.costoTotal, 'MXN'))}
        ${this._kpi('Costo por pieza', ctx.costoUnitario == null ? '—' : formatCurrency(ctx.costoUnitario, 'MXN'))}
        ${this._kpi('Tiempo de ciclo medio', ctx.ciclo ? formatMinutes(ctx.ciclo.media) : '—')}
        ${this._kpi('Tiempo de ciclo p95', ctx.ciclo ? formatMinutes(ctx.ciclo.p95) : '—')}
        ${this._kpi('Primas de horas extra', formatCurrency(ctx.primas, 'MXN'))}
        ${this._kpi('Utilización máxima (ρ)', ctx.utilizacionMax == null ? '— (sin recursos)' : num(ctx.utilizacionMax, 3))}
        ${this._kpi('Tasa de fallos', ctx.tasaFallos == null ? '—' : `${num(ctx.tasaFallos * 100, 1)} %`)}
      </div>

      ${this._avisoSaturacion(ctx)}
      <div class="aviso">
        <strong>Advertencia metodológica.</strong> Estos resultados salen de <strong>una sola
        réplica</strong> del modelo y <strong>sin intervalo de confianza</strong>. El motor repite la corrida
        exactamente si le das la misma semilla${ctx.semilla ? ` (<strong>${ctx.semilla}</strong>)` : ''}, pero
        <strong>no lanza N réplicas ni agrega el error estadístico</strong>, así que diferencias pequeñas
        entre escenarios pueden ser ruido. Con distribución de duración <em>fija</em> y sin fallos el modelo
        es determinista y no hay tal incertidumbre. Antes de decidir con una diferencia concreta,
        <strong>cambia la semilla y repite la corrida varias veces</strong>: si el rango se solapa, la
        diferencia no está demostrada.
      </div>
    `;
  }

  _kpi(etiqueta, valor) {
    return `<div class="kpi"><div class="k">${esc(etiqueta)}</div><div class="v">${valor}</div></div>`;
  }

  _metodologia() {
    return `
      <h2>2 · Metodología y supuestos</h2>
      <ul>
        <li><strong>Método:</strong> simulación de eventos discretos sobre el diagrama BPMN. El reloj avanza
        de suceso en suceso, no en pasos fijos.</li>
        <li><strong>Duración de las tareas:</strong> determinista (<em>fija</em>) o <em>triangular</em>, muestreada
        por inversa de la función de distribución acumulada.</li>
        <li><strong>Calendario:</strong> el tiempo se mide en minutos <em>laborables</em>. Las noches, los fines de
        semana y los festivos no consumen jornada: una tarea de 2 h que empieza a las 16:00 termina a las 10:00 del
        día siguiente, con 2 h de trabajo y 18 h de reloj.</li>
        <li><strong>Recursos:</strong> la tarea toma las unidades que necesita antes de empezar y las devuelve al
        terminar. Si no hay unidades libres espera en cola (FIFO). La espera no se penaliza si el costo de espera es 0.</li>
        <li><strong>Horas extra:</strong> el límite semanal se reparte en extensión diaria
        (límite ÷ días laborables). El cupo se acumula por semana ISO; lo que lo excede pasa al tramo de prima
        superior.</li>
        <li><strong>Calidad:</strong> un fallo añade <em>retrabajo</em> (tiempo extra) y el caso continúa. El modelo
        <strong>no</strong> representa chatarra ni pérdida de piezas.</li>
      </ul>
      <div class="aviso">
        <strong>Limitaciones conocidas.</strong> Sin turnos múltiples (un solo bloque de jornada por día),
        sin averías de máquina, sin prioridades en las colas, y <strong>sin réplicas automáticas ni intervalo
        de confianza</strong>: cada corrida es una réplica y el intervalo se calcula a mano repitiendo con
        semillas distintas. Sin <em>periodo de calentamiento</em> excluido, el transitorio inicial entra en
        los resultados. El motor <strong>sí</strong> modela lotes en serie, transporte declarado por tarea y
        carga física; lo que no modela es el movimiento entre puestos.
      </div>
    `;
  }

  /**
   * La comprobacion del cuadre.
   *
   * Es el apartado que separa un informe que solo presenta numeros de otro que
   * demuestra que los numeros son correctos: cada total se recompone a partir de
   * sus partes y se declara si coincide.
   */
  _comprobacion(ctx) {
    const suma = ctx.operacion + ctx.primas + ctx.primasDeDia + ctx.costoEspera;
    const cuadra = Math.abs(suma - ctx.costoTotal) < 0.01;

    const tramos = ctx.overtime && ctx.overtime.overtimeBreakdown;
    const dobleH = tramos ? tramos.normalMs / 3600000 : 0;
    const tripleH = tramos ? tramos.excessMs / 3600000 : 0;

    return `
      <h2>3 · Comprobación de los resultados</h2>
      <p>El coste total se recompone a partir de sus cuatro componentes. Si esta tabla no cuadra, ninguno de
      los demás números del informe es fiable.</p>
      <table>
        <thead><tr><th>Componente</th><th class="num">Importe</th><th>Origen</th></tr></thead>
        <tbody>
          <tr><td>Operación (trabajo a tarifa base)</td><td class="num">${formatCurrency(ctx.operacion, 'MXN')}</td>
              <td>duracion × tarifa base</td></tr>
          ${ctx.facturas > 0 ? `
          <tr class="sub"><td>· de eso, NÓMINA (plantilla)</td><td class="num">${formatCurrency(ctx.nomina, 'MXN')}</td>
              <td>horas × tarifa de la persona o de planta</td></tr>
          <tr class="sub"><td>· y FACTURAS de proveedores</td><td class="num">${formatCurrency(ctx.facturas, 'MXN')}</td>
              <td>por hora o por pieza, segun la piscina</td></tr>` : ''}
          <tr><td>Prima de horas extra doble</td><td class="num">${formatCurrency(ctx.doble, 'MXN')}</td>
              <td>horas × tarifa × (mult − 1)</td></tr>
          <tr><td>Prima de horas extra triple</td><td class="num">${formatCurrency(ctx.triple, 'MXN')}</td>
              <td>horas × tarifa × (mult − 1)</td></tr>
          <tr><td>Primas de día (dominical y festivos)</td><td class="num">${formatCurrency(ctx.primasDeDia, 'MXN')}</td>
              <td>horas × tarifa × % del día</td></tr>
          <tr><td>Espera de recursos</td><td class="num">${formatCurrency(ctx.costoEspera, 'MXN')}</td>
              <td>horas de espera × costo de espera</td></tr>
          <tr><th>Suma de componentes</th><th class="num">${formatCurrency(suma, 'MXN')}</th><td></td></tr>
          <tr><th>Coste total del motor</th><th class="num">${formatCurrency(ctx.costoTotal, 'MXN')}</th><td></td></tr>
        </tbody>
      </table>
      <div class="aviso ${cuadra ? 'ok' : 'mal'}">
        ${cuadra
          ? 'La suma de componentes coincide con el coste total: el cuadre es correcto.'
          : 'La suma de componentes NO coincide con el coste total. Revise la configuración antes de usar el informe.'}
      </div>
      ${tramos ? `
        <h3>Reparto del tiempo extra</h3>
        <table>
          <thead><tr><th>Tramo</th><th class="num">Horas</th></tr></thead>
          <tbody>
            <tr><td>Tramo doble</td><td class="num">${num(dobleH, 2)}</td></tr>
            <tr><td>Tramo triple</td><td class="num">${num(tripleH, 2)}</td></tr>
            <tr><th>Total</th><th class="num">${num(dobleH + tripleH, 2)}</th></tr>
          </tbody>
        </table>
        <p class="sub">El reparto entre tramos depende de en cuántas semanas ISO caen las horas extra: el cupo se
        agota una vez por semana. Concentrar la carga en pocas semanas manda más horas al tramo triple.</p>
      ` : ''}
    `;
  }

  /**
   * Cumplimiento de las reglas laborales.
   *
   * Es una salida DISTINTA del coste, y por eso va en su propia seccion: pasarse
   * del tope cuesta mas, pero ademas es ilegal. Un informe que solo dijera el
   * coste estaria escondiendo la mitad de la conclusion.
   */
  _laboral(ctx) {
    const c = ctx.cumplimiento;
    const l = ctx.labor;

    if (!c || !l) {
      return `
        <h2>4 · Reglas laborales, personas y carga</h2>
        <p class="sub">La corrida no dejó información laboral. Suele significar que el motor es anterior a este
        informe; vuelve a simular para que aparezca.</p>
      `;
    }

    const incumple = c.semanasSobreLimite > 0 || c.diasSobreLimiteDiario > 0 || c.semanasSobreDias > 0;

    // LOS TRES ESCENARIOS, calculados aqui porque es aqui donde se usan y donde vive el
    // contexto de los tres informes. Se calcula SIEMPRE, aunque el plan cumpla: saber cuanto
    // margen hay es igual de util antes y despues de incumplir.
    const escenarios = ctx.escenariosTres
      ? this._escenariosExtra({ escenarios: ctx.escenariosTres })
      : '';
    const filas = (c.detalleSemanas || []).map((s) => `
      <tr>
        <td>${s.semana}</td>
        <td class="num">${num(s.extraHoras, 2)}</td>
        <td class="num">${s.diasConExtra}</td>
        <td>${s.sobreLimiteSemanal ? '<span class="mal">supera el cupo</span>' : 'dentro'}</td>
        <td>${s.sobreDiasConExtra ? '<span class="mal">demasiados días</span>' : 'dentro'}</td>
      </tr>`).join('');

    return `
      <h2>4 · Reglas laborales, personas y carga</h2>
      <p>Reglas <strong>resueltas</strong> para la fecha de arranque de esta corrida, no las de hoy. Es lo que
      hace que el informe siga siendo auditable cuando la ley cambie.</p>
      <table>
        <thead><tr><th>Parámetro</th><th>Valor aplicado</th><th>Base legal</th></tr></thead>
        <tbody>
          <tr><td>Tipo de jornada</td><td>${l.shiftType} (${num(l.baseDailyHours, 1)} h/día)</td><td>LFT art. 61</td></tr>
          <tr><td>Cupo semanal de horas extra</td><td>${num(l.limitHours, 2)} h · prima ${num(l.payMultiplier, 2)}×</td><td>LFT art. 66</td></tr>
          <tr><td>Exceso sobre el cupo</td><td>prima ${num(l.excessPayMultiplier, 2)}×</td><td>LFT art. 68</td></tr>
          <tr><td>Tope de horas extra al día</td><td>${num(l.dailyOvertimeLimitHours, 2)} h</td><td>LFT art. 65</td></tr>
          <tr><td>Días con extra por semana</td><td>${num(l.maxOvertimeDaysPerWeek, 0)}</td><td>LFT art. 65</td></tr>
          <tr><td>Prima dominical</td><td>${num(l.sundayPremiumPercent, 2)} %</td><td>LFT art. 73</td></tr>
          <tr><td>Prima de día festivo</td><td>${num(l.holidayPremiumPercent, 2)} %</td><td>LFT art. 74</td></tr>
          <tr><td>Vigencia de estas reglas</td><td>${l.version ? `desde ${l.version}` : 'valores por defecto (sin vigencia declarada)'}</td><td>—</td></tr>
        </tbody>
      </table>
      <p class="sub">Los topes de los artículos 65, 66 y 68 son topes de <em>legalidad</em>: el informe los
      aplica y los imprime, pero no sustituyen a una asesoría. Esto es una tabla de tasas y umbrales para
      costear el proceso, no una nómina.</p>

      <h3>Cumplimiento de los topes</h3>
      <table>
        <thead><tr><th>Comprobación</th><th class="num">Resultado</th><th>Tope</th></tr></thead>
        <tbody>
          <tr><td>Semanas analizadas</td><td class="num">${c.semanas}</td><td>—</td></tr>
          <tr><td class="col-mal">Semanas por encima del cupo semanal</td><td class="num">${c.semanasSobreLimite}</td>
              <td>${num(c.limiteSemanalHoras, 2)} h/semana</td></tr>
          <tr><td>Semanas con más días de extra de los permitidos</td><td class="num">${c.semanasSobreDias}</td>
              <td>${num(c.maxDiasConExtraPorSemana, 0)} días</td></tr>
          <tr><td>Días por encima del tope diario</td><td class="num">${c.diasSobreLimiteDiario}</td>
              <td>${num(c.limiteDiarioHoras, 2)} h/día</td></tr>
          <tr><td>Extra máxima registrada en un día</td><td class="num">${num(c.maxExtraDiaHoras, 2)} h</td><td>—</td></tr>
          <tr><td>Exceso total sobre el cupo</td><td class="num">${num(c.excesoTotalHoras, 2)} h</td><td>—</td></tr>
          <tr><td>Exceso medio por semana excedida</td><td class="num">${num(c.excesoMedioSemanasSobreLimite, 2)} h</td><td>—</td></tr>
        </tbody>
      </table>
      <div class="aviso ${incumple ? 'mal' : 'ok'}">
        ${incumple
          ? `NO CUMPLE: con este plan, ${c.semanasSobreLimite} de ${c.semanas} semana(s) superaron el tope legal`
            + (c.excesoTotalHoras > 0 ? ` y en promedio ${num(c.excesoMedioSemanasSobreLimite, 2)} h de más` : '')
            + (c.diasSobreLimiteDiario > 0 ? `. Además, ${c.diasSobreLimiteDiario} día(s) pasaron del tope diario.` : '.')
          : 'CUMPLE: ninguna semana ni ningún día supera los topes declarados.'}
      </div>
      ${filas ? `
        <h3>Detalle por semana</h3>
        <table>
          <thead><tr><th>Semana</th><th class="num">Extra (h)</th><th class="num">Días con extra</th><th>Cupo</th><th>Días</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      ` : ''}
      ${escenarios}
    `;
  }

  /**
   * LOS TRES ESCENARIOS, en el PDF.
   *
   * VA JUSTO DESPUES DEL CUMPLIMIENTO, y no es casual: el lector acaba de leer «NO CUMPLE» y
   * la pregunta inmediata es «¿y si lo cumpliera?». Ponerlo aqui contesta esa pregunta en el
   * mismo sitio donde nace.
   *
   * Se imprime SIEMPRE, aunque el plan cumpla: saber que cumplir cuesta X es igual de util
   * cuando ya se cumple, porque dice cuanto margen hay.
   */
  _escenariosExtra(ctx) {
    const cmp = ctx.escenarios;
    if (!cmp || !cmp.filas.length) {
      return '<h3>Escenarios de horas extra</h3>'
        + '<p class="sub">No hay escenarios que comparar: hace falta que el modelo declare horas extra '
        + 'y que la corrida haya producido resultados.</p>';
    }

    const pp = (v) => (v == null ? '—' : formatCurrency(v, 'MXN'));
    const base = cmp.base;

    const filas = cmp.filas.map((f) => {
      const dCosto = base && f.clave !== 'normal' && base.costo > 0
        ? ((f.costo - base.costo) / base.costo) * 100 : null;
      const dPiezas = base && f.clave !== 'normal' && base.piezas > 0
        ? ((f.piezas - base.piezas) / base.piezas) * 100 : null;
      const delta = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} %`);
      const ley = f.cumple === true ? '<span class="ok-txt">cumple</span>'
        : f.cumple === false ? '<span class="mal-txt">NO cumple</span>' : '—';
      return `<tr>
        <td>${esc(f.etiqueta)}<br><span class="sub">${esc(f.detalle)}</span></td>
        <td class="num">${ent(f.piezas)}<br><span class="sub">${delta(dPiezas)}</span></td>
        <td class="num">${formatCurrency(f.costo, 'MXN')}<br><span class="sub">${delta(dCosto)}</span></td>
        <td class="num">${pp(f.costoPorPieza)}</td>
        <td class="num">${f.dias || '—'}</td>
        <td class="num">${ley}</td></tr>`;
    }).join('');

    const nota = notaDelTopeLegal(cmp);

    // La leyenda del grafico, impresa: en papel no se puede pasar el raton por encima de las
    // curvas, asi que el color de cada escenario tiene que estar escrito.
    const leyenda = cmp.filas.map((f) => `<li><span class="gl" style="background:${f.color};"></span>
      <strong>${esc(f.etiqueta)}</strong> — ${ent(f.piezas)} piezas en ${f.dias || '?'} días</li>`).join('');

    const series = cmp.filas.map((f) => ({ etiqueta: f.etiqueta, color: f.color, valores: f.serie }));

    return `
      <h3>Escenarios de horas extra</h3>
      <p class="sub">
        Las tres corridas son <strong>una sola simulación con el mismo azar</strong>, así que la diferencia
        entre escenarios se debe al plan y no a la suerte. El escenario <em>con tope legal</em> aplica los
        tres límites de la LFT: lo que no cabe en el cupo <strong>espera a la semana siguiente</strong>, que
        es lo que obliga la ley.
      </p>
      <table>
        <thead><tr><th>Escenario</th><th class="num">Piezas</th><th class="num">Costo</th>
          <th class="num">Unitario</th><th class="num">Días</th><th class="num">Ley</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${nota ? `<div class="aviso ok">${nota}</div>` : ''}
      <figure>
        ${svgTresEscenarios({ series, fechas: cmp.fechas, techo: cmp.techo, alto: 240 })}
        <figcaption><strong>Producción acumulada de los tres escenarios.</strong>
          Comparten fechas y escala, que es lo que permite compararlos de un vistazo: cuanto antes se
          separa una curva de las otras, antes entrega ese plan.
          <ul class="leyenda-escenarios">${leyenda}</ul>
        </figcaption>
      </figure>
    `;
  }

  /**
   * Carga física y personas.
   *
   * La regla que manda aquí: **la masa cargada y la arrastrada NUNCA se suman**.
   * Cargar (soportar el peso) y arrastrar (deslizarlo) no son la misma magnitud,
   * así que van en dos columnas y no hay ninguna fila de total conjunto. La
   * equivalencia la declara el analista, no el programa.
   *
   * Y el límite de alcance, impreso: el sistema **no valora el riesgo**. Da la
   * masa, la distancia y las horas; la valoración es de fuera.
   */
  _carga(ctx) {
    const c = ctx.carga;
    const op = ctx.operatividad;

    if (!c) {
      return `
        <h3 class="salto">4.1 · Carga física y personas</h3>
        <p class="sub">La corrida no dejó información de carga. Vuelve a simular para que aparezca.</p>
      `;
    }

    const t = (kg) => (Number(kg) || 0) / 1000;
    const area = c.area || {};
    const hayAlgo = area.cargadaKg > 0 || area.arrastradaKg > 0;

    const tablaPersonas = (c.porMiembro || []).map((p) => `
      <tr>
        <td>${esc(p.nombre)}</td>
        <td class="num">${ent(p.tareas)}</td>
        <td class="num">${num(p.busyMinutes, 0)}</td>
        <td class="num">${num(t(p.carga.cargadaKg), 2)}</td>
        <td class="num">${num(t(p.carga.arrastradaKg), 2)}</td>
        <td class="num">${num(p.carga.cargadaKgM, 0)}</td>
        <td class="num">${num(p.carga.arrastradaKgM, 0)}</td>
      </tr>`).join('');

    const tablaPiscinas = (c.porPersona || []).map((p) => `
      <tr>
        <td>${esc(p.nombre)} <span class="sub">(sin nombres asignados)</span></td>
        <td class="num">${num(t(p.cargadaKg), 2)}</td>
        <td class="num">${num(t(p.arrastradaKg), 2)}</td>
      </tr>`).join('');

    if (!hayAlgo) {
      return `
        <h3 class="salto">4.1 · Carga física y personas</h3>
        <div class="aviso">
          No hay <strong>carga declarada</strong> en ninguna tarea, así que esta corrida no puede decir
          cuánta masa se movió. Se declara por tarea (masa cargada, masa arrastrada y distancia); el
          diagnóstico de datos dice exactamente qué falta.
        </div>
        ${op && op.tareasBloqueadas ? `
          <div class="aviso mal">
            ${op.tareasBloqueadas} tarea(s) quedaron <strong>bloqueadas por habilidad</strong>: nadie de su
            piscina tenía la habilidad que exigían. Esa es la razón de que no se completaran.
          </div>` : ''}
      `;
    }

    return `
      <h3 class="salto">4.1 · Carga física y personas</h3>
      <p>Masa movida en la corrida, en <strong>dos series separadas</strong>. No se suman: cargar (soportar)
      y arrastrar (deslizar) no son la misma magnitud, y cualquier equivalencia la declara el analista.</p>

      <table>
        <thead><tr><th>Serie</th><th class="num">Masa</th><th class="num">Distancia acumulada</th><th class="num">Masa × distancia</th></tr></thead>
        <tbody>
          <tr><td><strong>Cargada</strong> <span class="sub">(la soporta la persona)</span></td>
              <td class="num">${num(t(area.cargadaKg), 2)} t</td>
              <td class="num">${num(area.distanciaM, 0)} m</td>
              <td class="num">${num(area.cargadaKgM, 0)} kg·m</td></tr>
          <tr><td><strong>Arrastrada</strong> <span class="sub">(la desliza)</span></td>
              <td class="num">${num(t(area.arrastradaKg), 2)} t</td>
              <td class="num">—</td>
              <td class="num">${num(area.arrastradaKgM, 0)} kg·m</td></tr>
        </tbody>
      </table>
      <p class="sub">Ejecuciones contadas: ${ent(area.ejecuciones)}. La masa se aplica <strong>una vez por
      ejecución de la tarea</strong>, y una tarea «por lote» se ejecuta una vez por lote.</p>

      <div class="aviso">
        <strong>Esto son datos, no una valoración.</strong> El sistema dice qué masa se movió, a qué distancia
        y durante cuántas horas, y marca las bandas que el analista haya declarado. No evalúa posturas ni
        riesgo: eso se hace fuera, con estos números.
      </div>

      ${tablaPersonas ? `
        <h3>Por colaborador</h3>
        <table>
          <thead><tr><th>Persona</th><th class="num">Tareas</th><th class="num">Min. ocupada</th>
            <th class="num">Cargada (t)</th><th class="num">Arrastrada (t)</th>
            <th class="num">kg·m cargada</th><th class="num">kg·m arrastrada</th></tr></thead>
          <tbody>${tablaPersonas}</tbody>
        </table>
        <p class="sub">Las dos series van en columnas distintas a propósito: sumarlas daría un número sin
        significado.</p>
      ` : ''}

      ${tablaPiscinas ? `
        <h3>Por piscina (sin nombres asignados)</h3>
        <table>
          <thead><tr><th>Piscina</th><th class="num">Cargada (t)</th><th class="num">Arrastrada (t)</th></tr></thead>
          <tbody>${tablaPiscinas}</tbody>
        </table>
        <p class="sub">Declara <strong>miembros con nombre</strong> en la pestaña Recursos para que la carga se
        atribuya a personas concretas en vez de a la piscina.</p>
      ` : ''}

      ${op && op.tareasBloqueadas ? `
        <div class="aviso mal">
          <strong>${op.tareasBloqueadas} tarea(s) bloqueadas por habilidad.</strong> Nadie de la piscina tenía
          la habilidad que exigían, así que no arrancaron. Es una decisión de modelado conservadora: un dato
          que falta bloquea, no acelera.
        </div>
      ` : ''}
      ${this._operatividad(ctx)}
    `;
  }

  /**
   * Operatividad por persona: activo y las tres ociosidades medibles.
   *
   * Las cuatro cifras **suman la jornada disponible** de cada persona, y eso es lo
   * que las hace útiles: no hay un «resto» sin explicar. Lo que NO se calcula
   * («con trabajo asignable») se declara en la propia tabla, porque un hueco sin
   * explicar se leería como un cero.
   */
  _operatividad(ctx) {
    const op = ctx.operatividad;
    const personas = (op && op.porMiembro) || [];
    if (!personas.length) return '';

    const filas = personas.map((p) => {
      const horas = (m) => num(m / 60, 2);
      return `
        <tr>
          <td>${esc(p.nombre)} <span class="sub">${esc(p.piscina)}</span></td>
          <td class="num">${ent(p.tareas)}</td>
          <td class="num">${horas(p.activoMin)}</td>
          <td class="num">${horas(p.sinTrabajoMin)}</td>
          <td class="num">${horas(p.esperandoFirmaMin)}</td>
          <td class="num">${horas(p.bloqueadoPorHabilidadMin)}</td>
          <td class="num">${num(p.ocupacion * 100, 1)} %</td>
        </tr>`;
    }).join('');

    // La comprobacion: activo + las tres ociosidades tiene que dar la jornada.
    const cuadra = personas.every((p) => Math.abs(
      (p.activoMin + p.sinTrabajoMin + p.esperandoFirmaMin + p.bloqueadoPorHabilidadMin) - p.disponibleMin
    ) < 0.02);

    const sinCalcular = (op.noCalculado || []);

    return `
      <h3>4.2 · Operatividad por persona</h3>
      <p>Cómo se repartió la jornada de cada persona, en horas. Las cuatro columnas
      <strong>suman la jornada disponible</strong>: no hay un resto sin explicar.</p>
      <table>
        <thead><tr><th>Persona</th><th class="num">Tareas</th><th class="num">Activo</th>
          <th class="num">Sin trabajo</th><th class="num">Esperando firma</th>
          <th class="num">Bloqueado por habilidad</th><th class="num">Ocupación</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="aviso ${cuadra ? 'ok' : 'mal'}">
        ${cuadra
          ? 'Las cuatro categorías suman la jornada disponible de cada persona: el reparto cuadra.'
          : 'Las cuatro categorías NO suman la jornada disponible. Revise antes de usar estas cifras.'}
      </div>
      ${sinCalcular.length ? `
        <p class="sub"><strong>No calculado, y por qué:</strong> ${esc(sinCalcular.join('; '))}. Un hueco sin
        explicar se leería como un cero, así que se declara en vez de dejarlo vacío.</p>
      ` : ''}
      <p class="sub">La <em>espera de firma</em> y el <em>bloqueo por habilidad</em> se reparten entre las
      personas de la piscina: es una <strong>imputación declarada</strong>, no una medida, porque el motor no
      sabe a ciencia cierta quién aguantó cada espera.</p>
    `;
  }

  _entradas() {
    const tareas = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task'));
    const flujos = this._elementRegistry.filter(
      (el) => !isLabel(el) && is(el, 'bpmn:SequenceFlow') && el.source && is(el.source, 'bpmn:ExclusiveGateway')
    );
    const proceso = this._elementRegistry.find((el) => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const pools = (getSimulationData(proceso) || {}).resourcePools || [];

    const filasTareas = tareas.map((el) => {
      const d = getSimulationData(el) || {};
      const pt = d.processingTime || {};
      const rt = d.reworkTime || {};
      const tri = pt.distribution === 'triangular';
      return `<tr>
        <td>${esc(nombreElemento(el))}</td>
        <td>${tri ? 'triangular' : 'fija'}</td>
        <td>${tri ? `mín ${num(pt.min, 2)} / moda ${num(pt.mode, 2)} / máx ${num(pt.max, 2)}` : num(pt.value, 2)}</td>
        <td>${esc(pt.unit || '—')}</td>
        <td class="num">${d.failureRate == null ? '—' : num(d.failureRate * 100, 1) + ' %'}</td>
        <td class="num">${num(rt.value, 2)}</td>
        <td>${esc(rt.unit || '—')}</td>
        <td>${esc(d.resources ? `${d.resources.pool} ×${d.resources.quantityRequired || 1}` : '—')}</td>
      </tr>`;
    }).join('');

    const filasFlujos = flujos.map((el) => {
      const p = getSimulationData(el);
      const valor = p && typeof p.branchingProbability === 'number' ? p.branchingProbability * 100 : null;
      return `<tr>
        <td>${esc(nombreElemento(el.source))}</td>
        <td>${esc(el.target ? nombreElemento(el.target) : '(sin destino)')}</td>
        <td class="num">${valor == null ? '—' : num(valor, 2) + ' %'}</td>
      </tr>`;
    }).join('');

    return `
      <h2 class="salto">5 · Entradas del modelo</h2>

      <h3>Tareas</h3>
      <table>
        <thead><tr><th>Tarea</th><th>Distribución</th><th>Tiempo</th><th>Unidad</th><th class="num">Fallo</th>
        <th class="num">Retrabajo</th><th>Unidad</th><th>Recurso</th></tr></thead>
        <tbody>${filasTareas || '<tr><td colspan="8">Sin tareas.</td></tr>'}</tbody>
      </table>

      <h3>Reparto de compuertas</h3>
      <table>
        <thead><tr><th>Compuerta</th><th>Hacia</th><th class="num">Reparto</th></tr></thead>
        <tbody>${filasFlujos || '<tr><td colspan="3">Sin compuertas exclusivas con varias salidas.</td></tr>'}</tbody>
      </table>

      <h3>Recursos</h3>
      <table>
        <thead><tr><th>Piscina</th><th class="num">Unidades</th></tr></thead>
        <tbody>${pools.length
          ? pools.map((p) => `<tr><td>${esc(p.name)}</td><td class="num">${ent(p.quantity)}</td></tr>`).join('')
          : '<tr><td colspan="2">El modelo no declara recursos.</td></tr>'}</tbody>
      </table>
    `;
  }

  _resultados(ctx, figuras) {
    const filas = [];
    ctx.tareas.forEach((t) => {
      const r = (ctx.overtime && ctx.overtime.results.get(t.id)) || {};
      filas.push(`<tr>
        <td>${esc(nombreElemento(t))}</td>
        <td class="num">${ent(r.executionCount || 0)}</td>
        <td class="num">${ent(r.failureCount || 0)}</td>
        <td class="num">${formatMinutes(r.totalWaitTime || 0)}</td>
        <td class="num">${formatMilliseconds(r.totalProcessingTime || 0)}</td>
        <td class="num">${formatMilliseconds(r.totalOvertime || 0)}</td>
        <td class="num">${formatCurrency((r.totalOperationCost || 0) + (r.totalDoubleOvertimeCost || 0) + (r.totalTripleOvertimeCost || 0) + (r.totalWaitTimeCost || 0), 'MXN')}</td>
      </tr>`);
    });

    return `
      <h2 class="salto">6 · Resultados</h2>

      <h3>Producción y ciclo</h3>
      ${this._figuraHtml(figuras, 'dailyRun', 'Producción diaria con su media', 'El tramo inicial es el arranque del sistema vacío; a partir de ahí el ritmo se estabiliza.')}
      ${this._figuraHtml(figuras, 'cumulative', 'Avance acumulado (curva S)', 'Cuándo se alcanza cada porcentaje del trabajo total.')}
      ${this._figuraHtml(figuras, 'cycleHistogram', 'Distribución del tiempo de ciclo', 'La cola del histograma es lo que rompe un plazo: la media no la muestra.')}

      <h3>Costos</h3>
      ${this._figuraHtml(figuras, 'cost', 'Costo por tarea, desglosado', 'La altura del montón es el costo total de la tarea; los colores, su composición.')}
      ${this._figuraHtml(figuras, 'costCompare', 'Comparativa de costos: normal frente a horas extra', 'Diferencia por componente entre los dos planes.')}

      <h3>Por tarea</h3>
      <table>
        <thead><tr><th>Tarea</th><th class="num">Ejecuciones</th><th class="num">Fallos</th><th class="num">Espera</th>
        <th class="num">Proceso</th><th class="num">Horas extra</th><th class="num">Costo</th></tr></thead>
        <tbody>${filas.join('') || '<tr><td colspan="7">Sin tareas.</td></tr>'}</tbody>
      </table>
    `;
  }

  _capacidad(ctx, figuras) {
    if (!ctx.utilizacion.length) {
      return `
        <h2>7 · Capacidad y cuello de botella</h2>
        <div class="aviso">El modelo no declara recursos, así que no hay utilización que evaluar. Las tareas
        se ejecutan sin restricción de capacidad y las esperas serán cero: el modelo no puede mostrar cuellos de
        botella de recursos. Para evaluarlos, declare piscinas en la pestaña <strong>Recursos</strong> y asígnelas
        en <strong>Tareas</strong>.</div>
      `;
    }

    const filas = ctx.utilizacion.map((u) => {
      const lec = describirUtilizacion(u.utilization);
      return `<tr>
        <td>${esc(u.name)}</td>
        <td class="num">${ent(u.quantity)}</td>
        <td class="num">${ent(u.busyMinutes)}</td>
        <td class="num">${ent(u.availableMinutes)}</td>
        <td class="num">${num(u.utilization, 3)}</td>
        <td><span class="etiqueta ${lec.nivel}">${esc(lec.etiqueta)}</span></td>
      </tr>`;
    }).join('');

    const critico = ctx.utilizacion[0];

    return `
      <h2>7 · Capacidad y cuello de botella</h2>
      <p>La utilización (ρ) es la fracción del tiempo disponible que el recurso está ocupado:
      minutos-recurso ocupados ÷ minutos-recurso disponibles. Se mide en el calendario del plan evaluado, así que
      las horas extra <em>añaden capacidad</em> y bajan ρ.</p>
      ${this._figuraHtml(figuras, 'utilization', 'Utilización por recurso', 'La línea roja es el límite de capacidad.')}
      <table>
        <thead><tr><th>Piscina</th><th class="num">Unidades</th><th class="num">Min·recurso ocupados</th>
        <th class="num">Min·recurso disponibles</th><th class="num">ρ</th><th>Lectura</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      ${this._avisoSaturacion(ctx)}
      ${avisosPorSaturacion(ctx.saturacion).espera
        ? `<div class="aviso mal">${avisosPorSaturacion(ctx.saturacion).espera}</div>` : ''}
      ${this._figuraHtml(figuras, 'paretoWait', 'Pareto de esperas', 'Las tareas que se llevan la mayor parte de la espera son las que hay que atacar primero.')}
      <p class="sub">Nota: si las tareas no comparten piscina, la espera observada señala el efecto, pero no
      identifica por sí sola el recurso saturado. La tabla de utilización sí lo identifica.</p>
    `;
  }

  /**
   * Scorecard. Cada dimension declara su metrica, su origen, sus dos umbrales y
   * su peso: con esos cuatro datos el lector puede recalcular la nota.
   *
   * Los pesos suman 100 cuando todas las dimensiones son evaluables. Si alguna no
   * lo es (por ejemplo, no hay recursos), los pesos se renormalizan y el informe
   * lo dice: no se reparte una nota que no se ha medido.
   */
  _dimensionesScorable(ctx) {
    return [
      {
        nombre: 'Saturación de recursos',
        valor: ctx.utilizacionMax,
        formato: (v) => num(v, 3),
        bueno: 0.70, malo: 1.00, peso: 20,
        como: 'Utilización del recurso más cargado (ρ).',
        origen: 'ρ = minutos-recurso ocupados ÷ disponibles'
      },
      {
        nombre: 'Variabilidad del tiempo de ciclo',
        valor: ctx.ciclo ? ctx.ciclo.cv : null,
        formato: (v) => num(v, 3),
        bueno: 0.05, malo: 0.50, peso: 15,
        como: 'Coeficiente de variación del tiempo de ciclo (desviación ÷ media).',
        origen: 'muestras por caso'
      },
      {
        nombre: 'Peso de la espera',
        valor: ctx.esperaRelativa,
        formato: (v) => num(v * 100, 1) + ' %',
        bueno: 0.00, malo: 0.40, peso: 15,
        como: 'Espera media por caso ÷ tiempo de ciclo medio.',
        origen: 'espera total acumulada y muestras de ciclo'
      },
      {
        nombre: 'Coste indirecto de las horas extra',
        valor: ctx.primaRelativa,
        formato: (v) => num(v * 100, 1) + ' %',
        bueno: 0.00, malo: 0.30, peso: 15,
        como: 'Primas de horas extra ÷ coste de operación.',
        origen: 'componentes de costo'
      },
      {
        nombre: 'Calidad (retrabajo)',
        valor: ctx.tasaFallos,
        formato: (v) => num(v * 100, 1) + ' %',
        bueno: 0.00, malo: 0.10, peso: 15,
        como: 'Fallos por ejecución de tarea.',
        origen: 'failureCount ÷ ejecuciones'
      },
      {
        nombre: 'Estabilidad del ritmo productivo',
        valor: ctx.cvProduccion,
        formato: (v) => num(v, 3),
        bueno: 0.00, malo: 0.40, peso: 10,
        como: 'Coeficiente de variación de la producción diaria (incluye el arranque).',
        origen: 'completados por día'
      },
      {
        nombre: 'Consistencia del modelo',
        valor: ctx.incidencias.length,
        formato: (v) => `${ent(v)} incidencia(s)`,
        bueno: 0, malo: 1, peso: 10,
        como: 'Errores silenciosos de configuración detectados.',
        origen: 'revisión de repartos y datos de tarea'
      }
    ];
  }

  /** Nota de 0 a 100, renormalizando los pesos de las dimensiones medidas. */
  /**
   * AVISO DE SATURACION, arriba del todo.
   *
   * VA ANTES DE LAS CIFRAS DEL RESUMEN, y ese es el punto entero: el usuario de `bob_retrabajo`
   * leyo «cientos de dias» de espera en un proceso de 15 y lo reporto como un error de la app. Los
   * numeros eran correctos -rho = 1,4, la cola crece sin limite- pero NO significan nada, y el
   * informe los daba sin avisar. Un lector que ve primero las cifras ya se las creyo.
   *
   * Solo aparece cuando hay algo que decir: con capacidad holgada no se imprime nada, porque un
   * aviso permanente se aprende a ignorar.
   */
  _avisoSaturacion(ctx) {
    const d = ctx.saturacion;
    if (!d || d.nivel === 'holgado' || d.nivel === 'sin-recursos') return '';

    const nivel = d.nivel === 'saturado' ? 'mal' : (d.nivel === 'al-limite' ? '' : 'ok');
    const lista = d.criticos.length
      ? `<ul class="sub" style="margin:6px 0 0;padding-left:18px">${d.criticos.map((c) =>
          `<li><strong>${esc(c.name)}</strong> — ρ = ${num(c.utilization, 3)} con ${ent(c.quantity)} unidad(es)</li>`
        ).join('')}</ul>`
      : '';

    return `
      <div class="aviso ${nivel}">
        <strong>${esc(d.titulo)}.</strong> ${d.consecuencia}
        ${lista}
        ${d.accion ? `<div style="margin-top:6px"><strong>Qué hacer:</strong> ${d.accion}</div>` : ''}
      </div>
    `;
  }

  _puntajeTotal(ctx) {
    const dimensiones = this._dimensionesScorable(ctx)
      .map((d) => ({ ...d, puntos: rampa(d.valor, d.bueno, d.malo) }))
      .filter((d) => d.puntos != null);

    if (!dimensiones.length) return null;

    const pesoTotal = dimensiones.reduce((a, d) => a + d.peso, 0);
    return dimensiones.reduce((a, d) => a + d.puntos * (d.peso / pesoTotal), 0);
  }

  _scorecard(ctx) {
    const dimensiones = this._dimensionesScorable(ctx)
      .map((d) => ({ ...d, puntos: rampa(d.valor, d.bueno, d.malo) }));
    const medidas = dimensiones.filter((d) => d.puntos != null);
    const pesoTotal = medidas.reduce((a, d) => a + d.peso, 0);
    const total = this._puntajeTotal(ctx);

    const filas = dimensiones.map((d) => {
      const medida = d.puntos != null;
      const aporte = medida ? d.puntos * (d.peso / pesoTotal) : null;
      return `<tr>
        <td>${esc(d.nombre)}<br><span class="sub">${esc(d.como)}</span></td>
        <td class="num">${d.valor == null ? '—' : d.formato(d.valor)}</td>
        <td class="num">${esc(d.bueno)} – ${esc(d.malo)}</td>
        <td class="num">${d.peso} %</td>
        <td class="num">${medida ? Math.round(d.puntos) : '—'}</td>
        <td class="num">${medida ? num(aporte, 1) : '—'}</td>
      </tr>`;
    }).join('');

    const sinMedir = dimensiones.filter((d) => d.puntos == null);

    return `
      <h2 class="salto">8 · Evaluación por puntos</h2>
      <p>Cada dimensión se puntúa con una <strong>rampa lineal</strong> entre dos umbrales declarados: el umbral
      <em>bueno</em> vale 100 puntos y el <em>malo</em> vale 0. La nota final es la media ponderada. Con el valor,
      los dos umbrales y el peso, cualquiera puede rehacer la cuenta.</p>
      <table>
        <thead><tr><th>Dimensión</th><th class="num">Valor</th><th class="num">Umbrales (bueno – malo)</th>
        <th class="num">Peso</th><th class="num">Puntos</th><th class="num">Aporte</th></tr></thead>
        <tbody>${filas}</tbody>
        <tfoot><tr><th colspan="5">Puntaje total (sobre las ${medidas.length} dimensiones medidas)</th>
        <th class="num">${total == null ? '—' : num(total, 1)}</th></tr></tfoot>
      </table>
      ${sinMedir.length ? `
        <div class="aviso">
          <strong>Sin medir: ${sinMedir.map((d) => esc(d.nombre)).join(', ')}.</strong>
          No se les asigna nota en lugar de darles un cero: dar cero a algo que no se ha medido falsearía el total.
          El puntaje se ha renormalizado sobre el resto, así que sigue siendo comparable entre corridas del mismo modelo.
        </div>` : ''}

      <h3>Sin calificar a propósito</h3>
      <table>
        <thead><tr><th>Métrica</th><th class="num">Valor</th><th>Por qué no se puntúa</th></tr></thead>
        <tbody>
          <tr><td>Costo por pieza</td>
              <td class="num">${ctx.costoUnitario == null ? '—' : formatCurrency(ctx.costoUnitario, 'MXN')}</td>
              <td>Un costo no es bueno ni malo en abstracto: depende del objetivo del negocio. Calificarlo sin un objetivo declarado sería inventar el criterio.</td></tr>
          <tr><td>Tiempo de ciclo p95</td>
              <td class="num">${ctx.ciclo ? formatMinutes(ctx.ciclo.p95) : '—'}</td>
              <td>Igual que el costo: hace falta un plazo objetivo para poder juzgarlo.</td></tr>
        </tbody>
      </table>
      <p class="sub">Ambas se informan con su valor para que el lector las juzgue con su propio criterio. Si se
      declaran objetivos (costo por pieza y plazo), pasan a puntuarse con la misma rampa.</p>
    `;
  }

  _hallazgos(ctx) {
    const puntos = [];

    if (ctx.utilizacionMax != null && ctx.utilizacionMax >= 0.9) {
      const u = ctx.utilizacion[0];
      puntos.push(`<strong>Capacidad crítica.</strong> El recurso «${esc(u.name)}» está a ρ = ${num(u.utilization, 3)}
        (${num(u.utilization * 100, 1)} %). En este tramo la espera crece de forma no lineal: la cola absorbe
        cualquier variabilidad. Prioridad: añadir capacidad o mover trabajo fuera de ese recurso.`);
    }

    if (ctx.ciclo && ctx.ciclo.p95 > ctx.ciclo.media * 1.5) {
      puntos.push(`<strong>Cola larga.</strong> El p95 del ciclo (${formatMinutes(ctx.ciclo.p95)}) supera en más de
        un 50 % a la media (${formatMinutes(ctx.ciclo.media)}). El caso típico va bien, pero uno de cada veinte se
        desvía: hay que mirar la variabilidad, no la media.`);
    }

    if (ctx.triple > 0) {
      puntos.push(`<strong>Se está pagando el tramo triple.</strong> La prima triple supone
        ${formatCurrency(ctx.triple, 'MXN')}. El cupo semanal se agota, lo que indica que la carga está concentrada
        en pocas semanas: repartirla bajaría la factura sin trabajar menos horas.`);
    }

    if (ctx.tasaFallos != null && ctx.tasaFallos > 0.05) {
      puntos.push(`<strong>Calidad.</strong> Tasa de fallos del ${num(ctx.tasaFallos * 100, 1)} % por ejecución de tarea,
        con el retrabajo correspondiente sumado al tiempo de ciclo.`);
    }

    if (ctx.incidencias.length) {
      puntos.push(`<strong>Modelo incompleto.</strong> ${ctx.incidencias.length} incidencia(s) de configuración:
        <ul>${ctx.incidencias.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
    }

    // El incumplimiento va PRIMERO entre los hallazgos cuando existe: pasarse de
    // un tope legal no es un problema de eficiencia, es un problema.
    const c = ctx.cumplimiento;
    if (c && (c.semanasSobreLimite > 0 || c.diasSobreLimiteDiario > 0 || c.semanasSobreDias > 0)) {
      const partes = [];
      if (c.semanasSobreLimite > 0) {
        partes.push(`${c.semanasSobreLimite} de ${c.semanas} semana(s) superan el cupo de `
          + `${num(c.limiteSemanalHoras, 2)} h de extra`);
      }
      if (c.excesoTotalHoras > 0) {
        partes.push(`el exceso suma ${num(c.excesoTotalHoras, 2)} h`);
      }
      if (c.diasSobreLimiteDiario > 0) {
        partes.push(`${c.diasSobreLimiteDiario} día(s) pasan del tope de ${num(c.limiteDiarioHoras, 2)} h al día`);
      }
      if (c.semanasSobreDias > 0) {
        partes.push(`${c.semanasSobreDias} semana(s) con más de ${num(c.maxDiasConExtraPorSemana, 0)} días con extra`);
      }
      puntos.unshift(`<strong class="mal">Incumplimiento legal.</strong> ${partes.join('; ')}. `
        + 'Excederse no solo cuesta más: está fuera de la ley, y aquí está medido antes de que ocurra.');
    }

    if (!puntos.length) {
      puntos.push('No se han detectado problemas estructurales: capacidad con holgura, calidad dentro de lo '
        + 'razonable y modelo consistente.');
    }

    return `
      <h2>9 · Hallazgos y recomendaciones</h2>
      <ul>${puntos.map((p) => `<li>${p}</li>`).join('')}</ul>
      <h3>Qué haría a continuación</h3>
      <ul>
        <li><strong>Repetir la corrida cambiando la semilla</strong> antes de dar por buena cualquier
        diferencia pequeña: esta es una sola réplica y no tiene intervalo de confianza. Con la
        <em>misma</em> semilla se reproduce igual, así que para estimar el ruido hay que cambiarla.</li>
        <li>Validar el escenario con duración <em>fija</em> y sin fallos: así todo resultado se recalcula a mano.</li>
        <li>Probar el escenario alternativo que ataque el hallazgo principal y comparar coste por pieza, no coste total.</li>
      </ul>
    `;
  }

  _anexos(ctx) {
    const filas = [];
    (ctx.overtime ? ctx.overtime.results : new Map()).forEach((r, id) => {
      const el = this._elementRegistry.get(id);
      if (!el || isLabel(el)) return;
      filas.push(`<tr><td>${esc(r.name || id)}</td><td>${esc(String(el.type).replace('bpmn:', ''))}</td>
        <td class="num">${ent(r.executionCount || 0)}</td>
        <td class="num">${ent(r.failureCount || 0)}</td>
        <td class="num">${formatMinutes(r.totalWaitTime || 0)}</td>
        <td class="num">${formatMilliseconds(r.totalProcessingTime || 0)}</td>
        <td class="num">${formatCurrency(r.totalCost || 0, 'MXN')}</td></tr>`);
    });

    const produccion = Array.from((ctx.normal && ctx.normal.dailyCompletions) || [])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([dia, n]) => `<tr><td>${esc(dia)}</td><td class="num">${ent(n)}</td></tr>`).join('');

    const muestra = (ctx.overtime && ctx.overtime.cycleTimes) || [];
    const percentiles = ctx.ciclo ? `
      <table>
        <thead><tr><th class="num">Casos</th><th class="num">Mín</th><th class="num">p50</th><th class="num">p90</th>
        <th class="num">p95</th><th class="num">p99</th><th class="num">Máx</th><th class="num">Media</th>
        <th class="num">Desv.</th><th class="num">CV</th></tr></thead>
        <tbody><tr>
          <td class="num">${ent(ctx.ciclo.n)}</td>
          <td class="num">${num(ctx.ciclo.min, 1)}</td>
          <td class="num">${num(ctx.ciclo.p50, 1)}</td>
          <td class="num">${num(ctx.ciclo.p90, 1)}</td>
          <td class="num">${num(ctx.ciclo.p95, 1)}</td>
          <td class="num">${num(ctx.ciclo.p99, 1)}</td>
          <td class="num">${num(ctx.ciclo.max, 1)}</td>
          <td class="num">${num(ctx.ciclo.media, 1)}</td>
          <td class="num">${num(ctx.ciclo.desviacion, 1)}</td>
          <td class="num">${num(ctx.ciclo.cv, 3)}</td>
        </tr></tbody>
      </table>
      <p class="sub">Tiempos de ciclo en minutos laborables. Calculados sobre ${ent(muestra.length)} muestras individuales.</p>
    ` : '<p class="sub">Sin muestras de tiempo de ciclo.</p>';

    // ESCENARIOS DE COSTO. El informe daba UN numero de costo, y una suma no tiene rango:
    // «34.176 pesos» no se puede presupuestar ni discutir. Con el costo de cada caso salen
    // los percentiles, y ahi SI se puede decir «en 8 de cada 10 meses el gasto cae entre
    // esto y esto».
    //
    // SE USA p10-p50-p90 Y NO minimo-maximo, y es una decision, no un redondeo: el minimo
    // teorico es «todo salio perfecto» -ningun fallo, ninguna espera, ningun extra-, que es
    // un evento de probabilidad casi nula. Reportarlo invita a que el cliente lea «podria
    // gastar esto» cuando eso casi nunca pasa. p10-p90 cubre el 80 % de los escenarios y es
    // la horquilla que se puede defender.
    const costos = resumenMuestras((ctx.overtime && ctx.overtime.instanceCosts) || []);
    const escenarios = (() => {
      if (!costos) return '<p class="sub">Sin muestras de costo por caso: el modelo no tiene tarifas declaradas, así que todas las corridas cuestan lo mismo.</p>';

      // El costo por pieza es lo que permite comparar corridas de distinto tamaño; el total
      // solo dice cuanto se gasto, no si fue caro.
      const porPieza = (v) => (ctx.completadas > 0 ? v / ctx.completadas : null);
      const pieza = (v) => (porPieza(v) == null ? '—' : `${formatCurrency(porPieza(v), 'MXN')}/pza`);

      const fila = (nombre, valor, lectura) => `
        <tr><td>${esc(nombre)}</td>
        <td class="num">${formatCurrency(valor, 'MXN')}</td>
        <td class="num">${pieza(valor)}</td>
        <td>${lectura}</td></tr>`;

      // LA ATRIBUCION ES LO QUE HACE UTIL EL ESCENARIO. Un rango sin causa se lee como
      // incertidumbre del modelo; con causa se lee como una palanca. Los disparadores salen
      // de la descomposicion real de la corrida, no de una plantilla.
      const primas = ctx.operacion > 0 ? (ctx.doble + ctx.triple) / ctx.operacion : 0;
      const semanas = (ctx.cumplimiento && ctx.cumplimiento.semanas) || 0;
      const sobreLimite = (ctx.cumplimiento && ctx.cumplimiento.semanasSobreLimite) || 0;

      const causaMejor = sobreLimite > 0
        ? `Solo si se respeta el cupo legal de horas extra: hoy se pasa en ${ent(sobreLimite)} de ${ent(semanas)} semanas.`
        : 'Con el cupo de horas extra respetado y sin reprocesos.';
      const causaPeor = sobreLimite > 0
        ? `Escenario de ${ent(sobreLimite)} de ${ent(semanas)} semanas pasadas de cupo, que es lo observado.`
        : 'Escenario con más reprocesos y espera por saturación.';

      return `
        <table>
          <thead><tr><th>Escenario</th><th class="num">Costo</th><th class="num">Unitario</th><th>Cómo se llega a él</th></tr></thead>
          <tbody>
            ${fila('Mejor (p10)', costos.p10, causaMejor)}
            ${fila('Esperado (p50)', costos.p50, 'El caso típico de la corrida. Es la cifra que se presupuesta.')}
            ${fila('Peor (p90)', costos.p90, causaPeor)}
          </tbody>
        </table>
        <p class="sub">
          ${ent(costos.n)} casos simulados${ctx.completadas ? ` de ${ent(ctx.completadas)} completados` : ''}.
          Mín observado ${formatCurrency(costos.min, 'MXN')} · máx observado ${formatCurrency(costos.max, 'MXN')} ·
          desviación ${formatCurrency(costos.desviacion, 'MXN')} (CV ${num(costos.cv, 3)}), sobre una media de
          ${formatCurrency(costos.media, 'MXN')}.
        </p>
        <p class="sub">
          <strong>La horquilla p10–p90 cubre 8 de cada 10 corridas</strong>, no el 100 %. El mínimo y el máximo
          observados son posibles pero raros, y por eso no son el escenario a presupuestar. Las primas de
          tiempo extra son el ${num(100 * primas, 1)} % del costo de operación, así que el resultado depende
          sobre todo de cuántas semanas se pasa del cupo.
        </p>`;
    })();

    return `
      <h2 class="salto">10 · Anexos</h2>

      <h3>Tiempo de ciclo: percentiles</h3>
      ${avisosPorSaturacion(ctx.saturacion).ciclo
        ? `<div class="aviso mal"><strong>Estos percentiles no sirven como plazo.</strong> ${
            avisosPorSaturacion(ctx.saturacion).ciclo}</div>` : ''}
      ${percentiles}

      <h3>Costo por caso: escenarios</h3>
      ${escenarios}

      <h3>Producción diaria (plan normal)</h3>
      <table><thead><tr><th>Día</th><th class="num">Piezas</th></tr></thead><tbody>${produccion || '<tr><td colspan="2">Sin datos.</td></tr>'}</tbody></table>

      <h3>Resultados por elemento</h3>
      <table>
        <thead><tr><th>Elemento</th><th>Tipo</th><th class="num">Ejecuciones</th><th class="num">Fallos</th>
        <th class="num">Espera</th><th class="num">Proceso</th><th class="num">Costo</th></tr></thead>
        <tbody>${filas.join('') || '<tr><td colspan="7">Sin datos.</td></tr>'}</tbody>
      </table>
    `;
  }

  // -- figuras --------------------------------------------------------------

  _figuras() {
    const metricas = [
      [ 'dailyRun', 1000, 340 ],
      [ 'cumulative', 1000, 340 ],
      [ 'cycleHistogram', 1000, 360 ],
      [ 'cost', 1000, 400 ],
      [ 'costCompare', 1000, 380 ],
      [ 'utilization', 1000, 360 ],
      [ 'paretoWait', 1000, 380 ]
    ];
    const figuras = {};
    metricas.forEach(([metrica, ancho, alto]) => {
      const url = this._figura(metrica, ancho, alto);
      if (url) figuras[metrica] = url;
    });
    return figuras;
  }

  /**
   * Dibuja un grafico fuera de pantalla y lo devuelve como PNG en data URL.
   *
   * Se reutiliza `getChartConfig()` del controlador a proposito: si el informe
   * dibujara sus propias figuras habria dos implementaciones del mismo grafico, y
   * acabararian discrepando. Aqui solo se cambian las opciones que no tienen
   * sentido fuera de pantalla (animacion, tamano, fondo).
   */
  _figura(metric, ancho, alto) {
    const config = this._controller.getChartConfig(metric);
    if (!config || !config.data || !config.data.datasets || !config.data.datasets.length) return null;

    const contenedor = document.createElement('div');
    contenedor.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px;`;
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    contenedor.appendChild(lienzo);
    document.body.appendChild(contenedor);

    let url = null;
    try {
      const ctx = lienzo.getContext('2d');
      // Fondo blanco: un PNG con transparencia se ve sucio al imprimir.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, ancho, alto);

      config.options = {
        ...config.options,
        responsive: false,
        animation: false,
        devicePixelRatio: 1,
        plugins: {
          ...(config.options.plugins || {}),
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
        }
      };

      const grafico = new Chart(ctx, config);
      grafico.draw();
      url = lienzo.toDataURL('image/png');
      grafico.destroy();
    } catch (err) {
      console.error('[informe] no se pudo dibujar la figura', metric, err);
      url = null;
    } finally {
      contenedor.remove();
    }

    return url;
  }

  _figuraHtml(figuras, clave, titulo, pie) {
    if (!figuras[clave]) return '';
    return `<figure>
      <img src="${figuras[clave]}" alt="${esc(titulo)}">
      <figcaption><strong>${esc(titulo)}.</strong> ${esc(pie)}</figcaption>
    </figure>`;
  }

  // -- impresion ------------------------------------------------------------

  /** Documento HTML completo y autonomo, listo para el iframe de impresion. */
  _documentoImprimible(cuerpoHtml) {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
      <title>${esc(this._nombreFichero())}</title>
      <style>body { margin: 0; padding: 0; } ${ESTILOS_INFORME}</style>
      </head><body><div class="sim-report">${cuerpoHtml}</div></body></html>`;
  }

  _nombreFichero() {
    const fichero = (String(document.title || '').split(/\s[-–|]\s/)[0] || '').trim() || 'proceso';
    const hoy = new Date().toISOString().slice(0, 10);
    return `informe-simulacion-${fichero}-${hoy}`;
  }

  /**
   * Imprime el informe usando un IFRAME oculto.
   *
   * Se imprime el iframe y no la ventana porque `window.print()` imprimiria TODA
   * la aplicacion (paleta, panel de propiedades, diagrama...), y ese DOM no es
   * nuestro: no podemos ocultarlo con CSS de forma estable. Un iframe con su
   * propio documento tiene nuestro CSS como unica fuente de estilo, asi que el
   * PDF sale limpio. El titulo se pone para que el nombre de fichero por defecto
   * del dialogo sea el del informe.
   */
  _imprimir() {
    if (!this._htmlInforme) {
      this._notifications.showNotification({ text: 'El informe aún se está generando.', type: 'info', duration: 3000 });
      return;
    }

    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0;';
    document.body.appendChild(marco);

    const doc = marco.contentDocument;
    doc.open();
    doc.write(this._htmlInforme);
    doc.close();

    const tituloOriginal = document.title;
    const nombre = this._nombreFichero();
    const restaurar = () => { document.title = tituloOriginal; };

    window.addEventListener('afterprint', restaurar, { once: true });

    const disparar = () => {
      document.title = nombre;
      try {
        marco.contentWindow.focus();
        marco.contentWindow.print();
      } finally {
        // El dialogo puede ser modal (bloquea hasta cerrarse) o no; se programa
        // la limpieza por si no llega el evento `afterprint`.
        setTimeout(() => { restaurar(); marco.remove(); }, 2000);
      }
    };

    if (doc.readyState === 'complete') {
      requestAnimationFrame(() => requestAnimationFrame(disparar));
    } else {
      marco.addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(disparar)));
    }
  }

  destroy() {
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
      this._overlay = null;
    }
  }
}

ReportPanel.$inject = [
  'canvas',
  'eventBus',
  'elementRegistry',
  'notifications',
  'simulationController'
];
