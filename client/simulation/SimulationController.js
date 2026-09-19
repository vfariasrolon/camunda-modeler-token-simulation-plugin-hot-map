import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData, getExtensionProperty, formatMilliseconds, formatMinutes, formatCurrency, isLabel, nombreElemento, resumenMuestras, histograma, describirUtilizacion } from './util';
import { describeLabor } from './LaborRules.js';
import { rangoDeValores, opacidadDe, fraccionDe, textoDeEscala, escalaDeMetrica, gradienteCss, colorFrio, colorDeValor, bandasDeValores, gradienteBandas, topCaminos, OPACIDAD_UNIFORME, OPACIDAD_MINIMA, GRADIENTE_ESCALA } from './HeatmapScale.js';
import { numerarTareas, etiquetaDe } from './TaskIds.js';
import {
  COLOR_PLAN, compararPlanes, notasDeEficiencia, fechasUnidas,
  serieAcumulada, techoComun, svgAcumulada, enPorcentaje
} from './ComparativaPlanes.js';
import { LADO_CELDA, calcularZonas, ladoQueCabe } from './HeatmapZones.js';

// Geometric icons to match the look and feel of the editor
const RunIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <path d="M 4 2 L 4 14 L 14 8 Z" fill="currentColor" />
    </svg>
  </span>
`;

const ShowIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80">
      <circle r="39"/>
      <path fill="#fff" d="M0,38a38,38 0 0 1 0,-76a19,19 0 0 1 0,38a19,19 0 0 0 0,38"/>
      <circle r="5" cy="19" fill="#fff"/>
      <circle r="5" cy="-19"/>
    </svg>
  </span>
`;

const ChartIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" />
    </svg>
  </span>
`;

// Icono de tabla (Material Symbols "table") para el editor de datos en bloque.
const TableIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="currentColor" d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 2v2H4V5h16zM4 10h3v3H4v-3zm0 5h3v3H4v-3zm5 3v-3h3v3H9zm3-5H9v-3h3v3zm2 0v-3h3v3h-3zm3 2v3h-3v-3h3zm2-2h-2v-3h3v3h-1z"/>
    </svg>
  </span>
`;

// Icono de informe (Material Symbols "description") para el informe tecnico.
const ReportIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
    </svg>
  </span>
`;

// Tope del radio de una mancha del mapa de calor, en px de diagrama. Sin tope,
// un subproceso grande generaria un circulo que tapa el diagrama entero.
const MAX_BLOB_RADIUS = 240;
// Limites del multiplicador de TAMANO de las manchas (botones «Radio + / −»). Por
// debajo de 0.25 la mancha desaparece dentro de la figura; por encima de 3 se comen el
// diagrama. El defecto es 1: la mancha cubre la figura, que es como se veia siempre.
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;

// Diagnostico de datos: responde «¿tengo lo necesario para medir esto?» antes de
// simular. La lista con la marca de verificacion se lee de un vistazo, que es
// justo lo que se pide a un icono de «que datos tengo».
const AuditIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="currentColor" d="M6.3 10.6l-2.1 2.1 4.6 4.6L20 6.1 17.9 4 8.8 13.1l-2.5-2.5z"/>
      <path fill="currentColor" opacity="0.45" d="M3 19h18v2H3z"/>
    </svg>
  </span>
`;

// Icono de IDs (Material Symbols "tag"): para el boton que muestra el numero de
// cada tarea, que es la etiqueta con la que se mide en planta.
const IdsIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path fill="currentColor" d="M21.41 11.58l-9-9C12.05 2.11 11.36 1.75 10.59 1.75H4c-1.1 0-2 .9-2 2v6.59c0 .77.36 1.46.95 1.91l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l6.59-6.59c.36-.36.58-.86.58-1.41s-.22-1.05-.59-1.41zM6.5 8C5.67 8 5 7.33 5 6.5S5.67 5 6.5 5 8 5.67 8 6.5 7.33 8 6.5 8z"/>
    </svg>
  </span>
`;

// Tipos de figura que reciben mancha del mapa de calor.
//
// Se deja como lista explicita (en vez de "todo FlowNode") para poder ajustarla
// sin ambiguedad. Ojo si se quiere la metrica de tiempo de ciclo: la paleta la
// documenta "sobre los eventos de fin", asi que habria que anadir 'bpmn:Event'.
const HEATMAP_TYPES = [ 'bpmn:Task', 'bpmn:Gateway' ];

// Nombre legible de cada metrica, para el nombre del archivo exportado.
//
// Se listan SOLO las metricas que el motor puede calcular de verdad. Antes
// estaban tambien `reworkCost`, `transportWaitTime` e `inefficientDispatch`,
// pero el motor no acumula `totalReworkCost`, `totalTransportWaitTime` ni
// `inefficientDispatchCount`: el mapa de calor pintaba NaN y los graficos
// salian vacios. Una metrica que nunca puede dar dato es peor que no tenerla.
const NOMBRES_METRICA = {
  cost: 'costo',
  waitTime: 'espera-promedio',
  totalWaitTime: 'espera-total',
  cycleTime: 'tiempo-de-ciclo',
  frequency: 'frecuencia',
  processTime: 'tiempo-de-proceso',
  failureRate: 'tasa-de-fallos',
  reworkTime: 'tiempo-de-reparacion',
  overtime: 'horas-extras',
  waitTimeCost: 'costo-tiempos-muertos',
  resourceQuantity: 'cantidad-de-recursos'
};

// Los resultados del motor mezclan DOS unidades de tiempo y hay que
// normalizarlas antes de dibujar:
//   - totalProcessingTime / totalOvertime / totalReworkTime -> MILISEGUNDOS
//   - totalWaitTime / totalCycleTime -> MINUTOS
//     (los acumula calculateBusinessDurationInMinutes, que cuenta minutos)
//
// Los graficos pintaban el valor CRUDO con el eje rotulado "(s)": las barras
// mostraban milisegundos bajo una etiqueta de segundos, y el tiempo de espera
// —que viene en minutos— se formateaba con formatMilliseconds(), un error de
// 60.000x. Se normaliza TODO a MINUTOS, que es la unidad con la que el usuario
// configura el simulador, y se formatea con formatMinutes().
//
// `factor` convierte el campo crudo a minutos.
const METRICAS_TIEMPO = {
  processTime: { campo: 'totalProcessingTime', factor: 1 / 60000 },
  paretoTime: { campo: 'totalProcessingTime', factor: 1 / 60000 },
  waitTime: { campo: 'totalWaitTime', factor: 1 },
  allWaitTimes: { campo: 'totalWaitTime', factor: 1 },
  overtime: { campo: 'totalOvertime', factor: 1 / 60000 },
  reworkTime: { campo: 'totalReworkTime', factor: 1 / 60000 }
};

// Quita caracteres que no son validos en un nombre de archivo.
const limpiarNombre = (s) => String(s || '')
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

// Decide si un elemento recibe mancha. isLabel viene de util.js: descarta las
// etiquetas (textos), que comparten el businessObject de su figura y por tanto
// pasarian cualquier comprobacion de tipo.
const isSimulatedElement = (element) => {
  if (isLabel(element)) return false;
  return HEATMAP_TYPES.some((type) => is(element, type));
};

/**
 * ¿Se le puede pintar una mancha a este elemento?
 *
 * Las CONEXIONES entran en el mapa de estructura -se les clona el trazo- pero no
 * llevan mancha: un circulo sobre una linea no dice nada. Por eso hay dos preguntas
 * distintas: `isSimulatedElement` (lo que el mapa colorea) y esta (quien ademas puede
 * recibir un circulo).
 */
const esPintable = (element) => isSimulatedElement(element);

export default class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays, tokenSimulationPalette, notifications, chartPanel, dataTablePanel, matrixLoader) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._simulationEngine = simulationEngine;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;
    this._chartPanel = chartPanel;
    this._dataTablePanel = dataTablePanel;
    this._matrixLoader = matrixLoader;

    this._heatmap = null;
    this._chart = null;
    this._radius = 20;
    this._blur = 10;
    // Multiplicador de tamano de las manchas (botones «Radio + / −»). 1 = tamano de
    // siempre. Va APARTE de `_radius` a proposito: `_radius` es el ancla del reparto
    // nucleo/desvanecido, y mezclar las dos cosas era lo que hacia que el boton de
    // agrandar achicara.
    this._scale = 1;
    this.simulationResults = null;
    this.simulationReports = [];
    this.overtimeReport = null;
    this.normalReport = null;
    this.lastMetric = null;
    // Los IDs visibles arrancan ENCENDIDOS: son la etiqueta con la que se mide en
    // planta y sin ellos no se sabe a que tarea corresponde una medicion.
    this.idsVisibles = true;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    // data-tip alimenta el tooltip CSS (ver simulation.css). Se mantiene tambien
    // el atributo title por accesibilidad: los lectores de pantalla lo anuncian,
    // y sirve como respaldo si el CSS no carga.
    const runButton = domify(`<div class="bts-entry" title="Ejecutar Simulación" data-tip="Ejecuta la simulación y calcula los resultados del proceso">${RunIcon}</div>`);
    const showButton = domify(`<div class="bts-entry" title="Mostrar Análisis" data-tip="Abre el mapa de calor para analizar el diagrama">${ShowIcon}</div>`);
    const chartButton = domify(`<div class="bts-entry" title="Mostrar Gráficos" data-tip="Abre el panel de gráficos y tablas">${ChartIcon}</div>`);
    const tableButton = domify(`<div class="bts-entry" title="Editar Datos por Tabla" data-tip="Edita los datos de simulación en una tabla, con exportar e importar CSV">${TableIcon}</div>`);
    const reportButton = domify(`<div class="bts-entry" title="Informe PDF" data-tip="Genera el informe técnico de evaluación (con figuras y puntaje) y lo manda a guardar como PDF">${ReportIcon}</div>`);
    const auditButton = domify(`<div class="bts-entry" title="Diagnóstico de datos" data-tip="Comprueba qué se puede medir con los datos que ya tienes y qué falta para lo demás, antes de simular">${AuditIcon}</div>`);
    const idsButton = domify(`<div class="bts-entry" title="Mostrar IDs" data-tip="Muestra u oculta el ID de cada tarea (círculo azul). El número sigue el orden del flujo y se reasigna al añadir o borrar tareas: la clave para medir es el id del XML, no el número">${IdsIcon}</div>`);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());
    domEvent.bind(chartButton, 'click', () => this._chartPanel.toggle());
    domEvent.bind(tableButton, 'click', () => this._dataTablePanel.toggle());
    // Por evento y no llamando al panel: el modulo del informe se registra
    // DESPUES que este, asi que inyectarlo aqui seria una dependencia circular.
    domEvent.bind(reportButton, 'click', () => this._eventBus.fire('simulation.report.requested'));
    // Mismo motivo: el panel de diagnostico se registra despues.
    domEvent.bind(auditButton, 'click', () => this._eventBus.fire('simulation.audit.requested'));
    domEvent.bind(idsButton, 'click', () => (this.idsVisibles ? this.ocultarIds() : this.mostrarIds()));

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);
    this._tokenSimulationPalette.addEntry(chartButton, 14);
    this._tokenSimulationPalette.addEntry(tableButton, 15);
    this._tokenSimulationPalette.addEntry(reportButton, 16);
    this._tokenSimulationPalette.addEntry(auditButton, 17);
    this._tokenSimulationPalette.addEntry(idsButton, 18);

    // Los IDs se pintan al arrancar (arrancan encendidos) y se repintan cuando el
    // diagrama cambia, porque el numero depende del orden del flujo.
    this._eventBus.on('canvas.init', () => this.mostrarIds());
    const refrescar = () => this._refrescarIds();
    this._eventBus.on('shape.added', refrescar);
    this._eventBus.on('shape.removed', refrescar);
    this._eventBus.on('elements.changed', refrescar);
    this._eventBus.on('connection.added', refrescar);
    this._eventBus.on('connection.removed', refrescar);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));
    this._simulationPalette.setExportCallback(this.exportHeatmapPng.bind(this));
    this._simulationPalette.setMeasurementCallback(this.exportMediciones.bind(this));

    this._eventBus.on('simulation.charts.opened', () => this.showChart());
    this._eventBus.on('simulation.charts.typeChanged', (e) => this.showChart());
    this._eventBus.on('simulation.summary.requested', () => this.showSummaryModal());
    this._eventBus.on('simulation.comparison.requested', () => this.showPlanBreakdown());
  }

  /**
   * Datos que necesita el informe tecnico: los dos planes y los elementos del
   * modelo.
   *
   * Se expone como metodo (y no como campo publico) para que el modulo del
   * informe no dependa de la estructura interna del controlador. Es lo que
   * rompe la dependencia circular: el controlador avisa por evento y el informe
   * pide los datos cuando los necesita.
   */
  getReportData() {
    return {
      normal: this.normalReport,
      overtime: this.overtimeReport,
      tareas: this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task')),
      flujos: this._elementRegistry.filter(
        (el) => !isLabel(el) && is(el, 'bpmn:SequenceFlow') && el.source && is(el.source, 'bpmn:ExclusiveGateway')
      )
    };
  }

  showSummaryModal() {
    if (!this.overtimeReport || !this.normalReport) {
      this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero.', type: 'warning', duration: 4000 });
      return;
    }
    const summaryHtml = this.createOverallSummary(this.overtimeReport, this.normalReport);
    this._eventBus.fire('simulation.modal.show', {
      title: 'Resumen General de Simulación',
      html: summaryHtml
    });
  }

  createScheduleHtml(calendar) {
    if (!calendar || !calendar.config) {
        return '<p>No se ha definido un cronograma de trabajo.</p>';
    }

    const { workingDays, workingHours, holidays } = calendar.config;

    if (!workingDays || !workingHours) {
        return '<p>La configuración del cronograma es incompleta o no es válida.</p>';
    }

    const formatTime = (timeObj) => {
      if (!timeObj || typeof timeObj.hour === 'undefined' || typeof timeObj.minute === 'undefined') return 'N/A';
      const h = String(timeObj.hour).padStart(2, '0');
      const m = String(timeObj.minute).padStart(2, '0');
      return `${h}:${m}`;
    };

    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    let workweekHtml = '';

    for (let i = 0; i < 7; i++) {
        const isWorking = workingDays.includes(i);
        workweekHtml += `
            <tr>
              <td>${dayNames[i]}</td>
              <td>${isWorking ? formatTime(workingHours.start) : 'No Laborable'}</td>
              <td>${isWorking ? formatTime(workingHours.end) : 'No Laborable'}</td>
            </tr>
        `;
    }

    let holidaysHtml = '';
    if (holidays && holidays.length > 0) {
      holidaysHtml = '<ul>';
      for (const holiday of holidays) {
        holidaysHtml += `<li>${holiday}</li>`;
      }
      holidaysHtml += '</ul>';
    } else {
      holidaysHtml = '<p>No hay días festivos definidos.</p>';
    }

    return `
      <h4>Horario de Trabajo Utilizado en la Simulación</h4>
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Día</th>
            <th>Inicio</th>
            <th>Fin</th>
          </tr>
        </thead>
        <tbody>
          ${workweekHtml}
        </tbody>
      </table>
      <h4 style="margin-top: 20px;">Días Festivos</h4>
      ${holidaysHtml}
    `;
  }

  _runAndGetReport(options) {
    const results = this._simulationEngine.run(options);
    if (!results) {
        this._notifications.showNotification({ text: 'La simulación falló al ejecutarse.', type: 'error', duration: 5000 });
        return null;
    }

    const totalWorkingDays = this._simulationEngine.calendar.calculateWorkingDays(
      new Date(this._simulationEngine.simulationStartTime),
      new Date(this._simulationEngine.clock)
    );

    let totalCost = 0;
    results.forEach(result => {
      totalCost += result.totalCost || 0;
    });

    const report = {
        results: results,
        completedInstances: this._simulationEngine.completedInstances,
        calendarDuration: this._simulationEngine.calendar.calculateBusinessDurationInMinutes(
            new Date(this._simulationEngine.simulationStartTime),
            new Date(this._simulationEngine.clock)
        ) * 60 * 1000, // convert minutes to ms
        dailyCompletions: new Map(this._simulationEngine.dailyCompletions),
        createdAt: new Date(),
        totalWorkingDays: totalWorkingDays,
        totalCost: totalCost,

        // --- ventana de tiempo, en dos relojes distintos ---
        // El reloj de la PLANTA (dias laborables, lo que se trabaja) y el del
        // CALENDARIO (dias naturales, lo que tarda en llegar la fecha). Los dos
        // hacen falta y NO son intercambiables: decir «tarda 12 dias» sin decir
        // cual de los dos es una cifra que cada uno lee como quiere.
        inicio: new Date(this._simulationEngine.simulationStartTime),
        fin: new Date(this._simulationEngine.clock),
        // Dias naturales: del dia de inicio al de fin, contando AMBOS. Es lo que
        // se mira en un calendario, no una resta de fechas.
        diasNaturales: this._diasNaturales(
            new Date(this._simulationEngine.simulationStartTime),
            new Date(this._simulationEngine.clock)
        ),

        // --- datos de distribucion y de capacidad (graficos e informe) ---
        // Muestras por caso: permiten percentiles e histograma. La media sola
        // esconde la cola.
        cycleTimes: (this._simulationEngine.instanceCycleTimes || []).slice(),

        // Costo por caso, para los percentiles de COSTE del informe. Va aparte de
        // `cycleTimes` porque un caso puede tener tiempo y no coste (un modelo sin tarifas),
        // y al reves: los dos ejes se reportan por separado y con su propio `n`.
        instanceCosts: (this._simulationEngine.instanceCosts || []).slice(),

        // Utilizacion (rho) por piscina, ya calculada por el motor con el
        // calendario de ESTE plan.
        utilization: new Map(this._simulationEngine.utilization || []),

        // Reparto del tiempo extra por tramo: lo imprime el informe.
        overtimeBreakdown: { ...(this._simulationEngine.overtimeBreakdown || {}) },
        overtimeCalendar: this._simulationEngine.overtimeCalendarConfig
            ? JSON.parse(JSON.stringify(this._simulationEngine.overtimeCalendarConfig))
            : null,

        // Configuracion CONGELADA (copia, no referencia). El informe la imprime,
        // y no debe cambiar si despues el usuario edita el diagrama.
        config: this._configSnapshot(),

        // Reglas laborales RESUELTAS y cumplimiento (A2). Van aqui, y no dentro
        // de `config`, porque no son lo que el usuario escribio: son lo que el
        // motor APLICO tras resolver la vigencia por fecha. El informe tiene que
        // imprimir lo aplicado, que es lo que permite auditar la corrida.
        labor: this._simulationEngine.labor ? JSON.parse(JSON.stringify(this._simulationEngine.labor)) : null,
        // La SEMILLA que se uso. Sin esto el informe no puede decir si una corrida
        // es repetible, que es lo primero que pregunta quien va a auditar el
        // documento: con la semilla se reproduce tal cual, sin ella es una foto.
        semilla: this._simulationEngine.seed,
        laborDescripcion: this._simulationEngine.labor
            ? describeLabor(this._simulationEngine.labor)
            : null,
        compliance: this._simulationEngine.compliance
            ? JSON.parse(JSON.stringify(this._simulationEngine.compliance))
            : null,
        dayPremiums: this._simulationEngine.premiumStats
            ? JSON.parse(JSON.stringify(this._simulationEngine.premiumStats))
            : null,

        // Carga fisica y operatividad (A5). Los Map se convierten a arrays para
        // que el informe no dependa de la estructura interna del motor.
        carga: this._simulationEngine.carga ? {
            area: { ...this._simulationEngine.carga.area },
            porTarea: Array.from(this._simulationEngine.carga.porTarea.entries())
                .map(([ id, c ]) => ({ id, ...c })),
            porPersona: Array.from(this._simulationEngine.carga.porPersona.entries())
                .map(([ nombre, c ]) => ({ nombre, ...c })),
            porMiembro: Array.from(this._simulationEngine.carga.porMiembro.entries())
                .map(([ nombre, c ]) => ({ nombre, ...c }))
        } : null,
        operatividad: this._simulationEngine.operatividad
            ? { ...this._simulationEngine.operatividad }
            : null,

        // Mapa de calor del dia: `AAAA-MM-DD|HH` -> minutos-recurso. Se aplana a
        // array para que el informe y los graficos no dependan del Map.
        heatmapDia: this._simulationEngine.heatmapDia
            ? Array.from(this._simulationEngine.heatmapDia.entries()).map(([ clave, minutos ]) => ({
                dia: clave.split('|')[0],
                hora: Number(clave.split('|')[1]),
                minutos
            }))
            : [],

        // Piscinas declaradas en el proceso, tal como las leyo el motor. Los
        // miembros van con ellas: el informe los necesita para saber a quien
        // atribuir el tiempo y la carga.
        resourcePools: Array.from(this._simulationEngine.resourcePools.values())
            .map((p) => ({
                name: p.name,
                quantity: p.quantity,
                members: (p.members || []).map((m) => ({ ...m })),
                // Ocupacion por persona, ya acumulada por el motor.
                porMiembro: Array.from((p.porMiembro || new Map()).values())
                    .map((f) => ({ ...f, carga: { ...f.carga } }))
            }))
    };
    return report;
  }

  /**
   * Días NATURALES entre dos fechas, contando el primero y el último.
   *
   * Se cuentan ambos a proposito: si empiezas el lunes a las 18:00 y terminas el
   * martes a las 10:00, eso son **2 días naturales** para cualquiera que mire un
   * calendario, aunque hayan pasado 16 horas. Es la lectura que espera quien
   * pregunta «¿cuántos días tarda?», y no una resta de fechas.
   *
   * Se comparan claves de día LOCAL (no milisegundos / 86400000), porque dividir
   * milisegundos falla en los cambios de horario de verano: un día de 23 o 25
   * horas daría un día de más o de menos.
   */
  _diasNaturales(desde, hasta) {
    // `instanceof Date` NO basta: `new Date('cualquier cosa')` es un Date valido
    // como objeto pero con getTime() = NaN, y esa NaN se propagaba al resumen
    // («NaN días»). Hace falta comprobar que la fecha sea utilizable.
    const util = (d) => d instanceof Date && Number.isFinite(d.getTime());
    if (!util(desde) || !util(hasta)) return null;
    const dia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dias = Math.round((dia(hasta) - dia(desde)) / 86400000);
    return dias + 1;
  }

  /** Copia de la configuracion global que el informe puede imprimir sin riesgo. */
  _configSnapshot() {
    const c = this._simulationEngine.rootConfig || {};
    const copia = (o) => (o ? JSON.parse(JSON.stringify(o)) : null);
    return {
      arrivalRate: copia(c.arrivalRate),
      calendar: copia(c.calendar),
      cost: copia(c.cost),
      overtime: copia(c.overtime),
      labor: copia(c.labor),
      simulationConfig: copia(c.simulationConfig),
      startDate: c.startDate || ''
    };
  }

  runSimulation() {
    const rootConfig = this._simulationEngine._findRootConfig();
    if (!rootConfig) {
      this._notifications.showNotification({
        text: 'Error: No se encontró una configuración raíz única. Por favor, designe un único Evento de Inicio como "Configuración Raíz".',
        type: 'error',
        duration: 8000
      });
      return;
    }

    // Se muestra el modal y se APLAZA la simulacion. No es un adorno: el motor
    // es sincrono y bloquea el hilo principal, asi que si se ejecutase aqui
    // mismo el navegador no llegaria a pintar el modal nunca. Dos
    // requestAnimationFrame encadenados garantizan que ya se ha pintado.
    this._matrixLoader.show();

    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        this._ejecutarSimulaciones();
      } finally {
        // En finally para que el modal se cierre tambien si la simulacion lanza
        // o sale por un return anticipado: si no, quedaria tapando la pantalla.
        this._matrixLoader.hide();
      }
    }));
  }

  _ejecutarSimulaciones() {
    this._notifications.showNotification({ text: 'Ejecutando simulaciones (normal y con horas extras)...', type: 'info', duration: 2000 });

    this.lastMetric = null;

    // Las dos pasadas (normal y con horas extra) son UNA corrida: comparten la
    // semilla, para que la diferencia entre planes se deba al plan y no a la
    // suerte. Si la semilla esta declarada esto no cambia nada; si esta vacia,
    // cada pulsacion del boton saca una nueva.
    if (this._simulationEngine.nuevaCorrida) this._simulationEngine.nuevaCorrida();

    // Run normal simulation
    this.clear();
    this.normalReport = this._runAndGetReport({ useOvertime: false });

    // Run overtime simulation
    // We DON'T clear here so the calendar from the normal run is preserved for the overtime run
    this.overtimeReport = this._runAndGetReport({ useOvertime: true });

    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Una de las simulaciones falló. No se pueden mostrar resultados comparativos.', type: 'error', duration: 6000 });
      return;
    }

    this._notifications.showNotification({ text: 'Simulaciones completadas', type: 'info', duration: 3000 });

    // The main report for the summary panel is the overtime one, as it's the most comprehensive.
    this.simulationReports = [this.overtimeReport];

    this.simulationResults = this.overtimeReport.results; // Heatmap and overlays are based on the main report.

    if (this._chartPanel.isOpen()) {
        this.showChart();
    }
  }

  adjustHeatmap(type, amount) {
      if (type === 'radius') {
        // TAMANO de las manchas: un multiplicador, no el radio base.
        //
        // Antes estos botones movian `_radius`, que ademas de ser el radio base es el
        // ANCLA del reparto nucleo/desvanecido de la gradiente. Subirlo reducia el
        // factor de cobertura (`(r+blur)/r`), asi que el total BAJABA: pulsar «Radio +»
        // ACHICABA las manchas. Con un multiplicador aparte, los botones agrandan y
        // achican siempre en la direccion que dicen, y la forma (cuanto del radio es
        // nucleo solido) no cambia al cambiar el tamano.
        this._scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this._scale + amount));
      }
      else if (type === 'blur') this._blur = Math.max(0, this._blur + amount);
      if (this.lastMetric) this.showMetric(this.lastMetric);
  }

  /**
   * Radio de la mancha para un elemento.
   *
   * Antes el radio era fijo (this._radius + this._blur = 30 px) mientras que las
   * tareas miden 100x80: la mancha cubria solo el centro y los bordes quedaban
   * sin colorear, asi que parecia que el mapa de calor "no llegaba" a la figura.
   *
   * El desvanecido del borde ocupa el ultimo tramo del radio, de modo que para
   * que la mancha cubra la figura de forma solida hay que escalar el radio total
   * en la misma proporcion que la figura:
   *   total = (radio + desenfoque) * (semiFigura / radio)
   *
   * Y ESE total se multiplica por la ESCALA del usuario (botones «Radio + / −»), que
   * es lo que agranda y achica. El factor de cobertura se queda como esta: es lo que
   * hace que la parte solida llegue al borde de la figura, y cambiarlo con el tamano
   * era justo lo que invertia el sentido de los botones.
   */
  _blobRadius(element) {
    const base = (this._radius + this._blur) * this._scale;

    // Un flujo de secuencia es una linea: dimensionar un circulo por su caja
    // englobante daria manchas enormes. Se queda con el radio base.
    if (!is(element, 'bpmn:FlowNode')) return Math.min(base, MAX_BLOB_RADIUS);

    const half = Math.max(element.width || 0, element.height || 0) / 2;
    if (!half || half <= this._radius) return Math.min(base, MAX_BLOB_RADIUS);

    const cobertura = (this._radius + this._blur) * (half / this._radius);
    return Math.min(cobertura * this._scale, MAX_BLOB_RADIUS);
  }

  /**
   * Anade un punto al mapa de calor, centrado en la figura.
   *
   * Se anade SIEMPRE que exista resultado, aunque el valor sea 0. El filtro
   * anterior (value > 0) hacia que toda tarea sin fallos, o de costo 0, no
   * dibujase nada: el diagrama parecia tener figuras "sin analizar" cuando en
   * realidad su valor era cero. Con valor 0 la mancha sale con la opacidad
   * minima (o con la uniforme si todo el diagrama vale 0), que es informacion
   * util: se ve que se contabilizo y dio cero.
   */
  /**
   * Opacidad de un valor DENTRO del rango de la corrida.
   *
   * Es lo que hace legible un mapa de calor relativo, y el arreglo del reporte «casi todo
   * en azul y un punto rojo»: reparte el color entre el MINIMO y el MAXIMO observados, en
   * vez de calcular `valor / max`. Con `valor / max`, el minimo de una corrida real cae muy
   * por debajo de 0,4 -donde la escala deja de ser plana- y el mapa sale entero azul con un
   * unico punto rojo. Se ve con un bucle: la compuerta se ejecuta 9 veces mas que una tarea
   * y deja al minimo en 100/900 = 0,11.
   *
   * Con `uniforme` (todos los valores iguales) no hay contraste que repartir: manda el
   * extremo frio, que es lo que significa «no hay diferencias».
   */
  _opacidadEnRango(valor, rango, piso = OPACIDAD_MINIMA) {
    if (!rango || rango.uniforme) return opacidadDe(valor, rango ? rango.max : 0, true);
    const f = fraccionDe(valor, rango.min, rango.max);
    // `fraccionDe` devuelve null sin contraste; aqui ya se comprobo `uniforme`, asi que es
    // una red por si el rango llega incompleto.
    return f == null ? OPACIDAD_UNIFORME : Math.min(1, Math.max(piso, f));
  }

  _pushPoint(dataPoints, element, value, opacidad) {
    const cx = Math.round(element.x + (element.width || 0) / 2);
    const cy = Math.round(element.y + (element.height || 0) / 2);
    const punto = [ cx, cy, value, this._blobRadius(element) ];

    // 5º elemento opcional: la opacidad ya resuelta (ver HeatmapScale). Solo se
    // anade si viene, para no cambiar la forma del punto en el caso normal.
    if (opacidad != null) punto[4] = opacidad;

    dataPoints.push(punto);
  }

  /**
   * Nombre del ARCHIVO ORIGINAL, sin extension y sin el nombre de la aplicacion.
   *
   * `document.title` en Camunda Modeler lleva el nombre del archivo abierto, pero el
   * formato cambia entre versiones: puede ser «demo.bpmn - Camunda Modeler», «demo» a
   * secas, o el nombre de la aplicacion cuando no hay ningun archivo.
   *
   * Devuelve null cuando NO se puede deducir. Antes se devolvia el titulo tal cual, y
   * con un Modeler que no sigue el patron esperado el «archivo» del configurador
   * acababa siendo literalmente «Camunda Modeler». Un dato inventado es peor que un
   * hueco: el hueco se ve.
   */
  _nombreDelArchivo() {
    const titulo = String(document.title || '')
      .replace(/\s*[-–—|]\s*Camunda Modeler.*$/i, '')
      .trim();

    if (!titulo) return null;
    // Si lo que queda es solo el nombre de la aplicacion, no hay archivo que deducir.
    if (/^camunda[- ]?modeler$/i.test(titulo)) return null;

    const sinExtension = titulo.replace(/\.(bpmn20\.xml|bpmn|xml)$/i, '').trim();
    return sinExtension || null;
  }

  /**
   * Nombre base del archivo a DESCARGAR (PNG o JSON): "<archivo>_<metrica>".
   *
   * No se usa para el nombre del proyecto del configurador: ahi lo que vale es el
   * nombre del diagrama, no el de la metrica del mapa de calor que estuviera puesta.
   */
  _nombreExportado() {
    const metrica = limpiarNombre(NOMBRES_METRICA[this.lastMetric] || this.lastMetric || 'simulacion');
    const original = this._nombreDelArchivo();

    return original ? `${limpiarNombre(original)}_${metrica}` : `mapa-calor_${metrica}`;
  }

  /**
   * Exporta un PNG con el diagrama y el mapa de calor superpuesto.
   *
   * NO se usa canvas.saveSVG() de bpmn-js: esa funcion exporta unicamente la
   * capa ACTIVA (BaseViewer.js:471-472), que por defecto es 'base'. El mapa de
   * calor se dibuja en la capa 'overlays' (simpleheat-svg.js:43), asi que
   * saveSVG() devolveria el diagrama SIN calor. Aqui se serializa el viewport
   * completo, que contiene todas las capas.
   */
  exportHeatmapPng() {
    // Log de entrada: es lo PRIMERO que ocurre al pulsar el boton. Sirve para
    // distinguir dos fallos que desde fuera se ven igual:
    //   - si NO aparece este log  -> el clic no llega al metodo (boton mal
    //                                conectado, o se esta pulsando otro boton)
    //   - si aparece              -> el metodo entra y el problema esta despues
    console.log('[mapa de calor] boton de exportar pulsado', {
      hayMapaDeCalor: Boolean(this._heatmap),
      metricaActiva: this.lastMetric
    });

    try {
      // Se usa el SVG real del diagrama, no "el primer <svg>" del contenedor:
      // el contenedor tambien aloja los botones de las paletas y CADA BOTON
      // lleva su propio <svg> con el icono. Un icono no tiene capas, asi que
      // buscar el primero puede devolver el equivocado.
      //
      // this._canvas._svg es el mismo SVG que emplea bpmn-js internamente
      // (BaseViewer.js:473 lo consulta para localizar el <defs>).
      const container = this._canvas.getContainer();
      const rootSvg = this._canvas._svg ||
        Array.from(container.querySelectorAll('svg')).find((s) => s.querySelector('g'));

      if (!rootSvg) {
        const n = container.querySelectorAll('svg').length;
        throw new Error(`no se encontró el SVG del diagrama (${n} <svg> en el contenedor)`);
      }

      const defs = rootSvg.querySelector('defs');

      // El viewport es el <g> que contiene TODAS las capas: el diagrama y el
      // mapa de calor. Se exporta entero para no depender del nombre de ninguna
      // capa: canvas.getLayer() CREA la capa si el nombre no existe
      // (diagram-js Canvas.js:414-418), asi que devolveria un <g> vacio.
      const viewport = rootSvg.querySelector(':scope > g') || rootSvg.querySelector('g');

      if (!viewport) {
        throw new Error(`el SVG del diagrama no tiene capas (hijos: ${rootSvg.children.length})`);
      }

      // Los rotulos de datos ("Costo: $120") son overlays HTML dentro de un
      // <foreignObject> y Chromium no los rasteriza de forma fiable al cargar
      // el SVG como imagen. Se quitan del clon: el diagrama real no se toca.
      const clone = viewport.cloneNode(true);
      clone.querySelectorAll('foreignObject').forEach((node) => {
        const group = node.closest('.djs-overlay') || node;
        group.remove();
      });

      // BBox a partir de la GEOMETRIA DE LAS FIGURAS, no de viewport.getBBox().
      //
      // getBBox() del viewport incluye elementos auxiliares (overlays del
      // token-simulation, contenedores) cuyo tamano es un centinela de
      // 100000x100000. Eso producia un viewBox imposible, el lienzo no se podia
      // crear y toBlob() devolvia null: "el lienzo no devolvio datos".
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let figuras = 0;

      this._elementRegistry.getAll().forEach((el) => {
        if (isLabel(el)) return;
        if (typeof el.x !== 'number' || typeof el.y !== 'number') return;
        if (!(el.width > 0) || !(el.height > 0)) return;
        if (el.width > 50000 || el.height > 50000) return; // centinelas de la raiz
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
        figuras++;
      });

      if (!figuras || !isFinite(minX) || !isFinite(maxX) || maxX <= minX || maxY <= minY) {
        throw new Error('no se pudo medir el diagrama: no hay figuras con geometría');
      }

      const bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };

      // Se cuenta el calor por lo que hay DIBUJADO, no por la bandera interna
      // this._heatmap: esa bandera se pone a null en clear() y puede no coincidir
      // con lo que se ve en pantalla. El DOM es la fuente fiable.
      const manchas = viewport.querySelectorAll('circle[fill*="heatmap-blur-gradient"]').length;

      // Diagnostico: si la exportacion vuelve a fallar, este log dice
      // exactamente que SVG y que estructura se encontraron.
      console.log('[mapa de calor] exportando', {
        svgsEnElContenedor: container.querySelectorAll('svg').length,
        svgUsado: rootSvg.getAttribute('class') || '(sin clase)',
        hijosDelSvg: Array.from(rootSvg.children).map((c) => c.tagName),
        viewportHijos: viewport.children.length,
        manchasDeCalor: manchas,
        tamano: `${Math.round(bbox.width)}x${Math.round(bbox.height)}`
      });

      const PAD = 20;
      const x = Math.floor(bbox.x - PAD);
      const y = Math.floor(bbox.y - PAD);
      const w = Math.ceil(bbox.width + PAD * 2);
      const h = Math.ceil(bbox.height + PAD * 2);

      // El degradado y el filtro que dan COLOR a las manchas NO estan en el
      // <defs> del canvas. simpleheat-svg.js los crea en el <defs> del primer
      // <svg> del contenedor (simpleheat-svg.js:36), y con ~190 <svg> -los
      // iconos de las paletas- ese primero puede ser el de un boton.
      //
      // En pantalla funciona porque en SVG los url(#id) se resuelven a nivel de
      // documento, asi que las manchas encuentran el filtro igualmente. Pero al
      // exportar solo se serializaba el <defs> del canvas: faltaba el filtro,
      // las manchas se dibujaban en blanco y quedaban invisibles sobre el fondo
      // blanco. Por eso salian las figuras pero no el calor.
      //
      // Se recogen POR ID, esten donde esten. Si algun dia los defs del calor
      // ya estan dentro del <defs> del canvas (p. ej. tras corregir
      // simpleheat-svg), no se duplican: repetir ids en un documento SVG
      // funciona pero ensucia el archivo.
      const yaEnDefs = Boolean(defs && defs.querySelector('#heatmap-colorize'));
      const heatDefs = yaEnDefs ? '' : Array.from(
        container.querySelectorAll('#heatmap-blur-gradient, #heatmap-colorize')
      ).map((node) => node.outerHTML).join('');

      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
        `width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">` +
        '<defs>' + (defs ? defs.innerHTML : '') + heatDefs + '</defs>' +
        clone.innerHTML +
        '</svg>';

      // Escala adaptativa: un diagrama grande a 2x puede superar el maximo de
      // lienzo del navegador, y entonces getContext('2d') devuelve null. Se
      // limita el area total para evitarlo.
      const MAX_PIXELS = 16e6;
      let scale = 2;
      if (w * h * scale * scale > MAX_PIXELS) {
        scale = Math.max(1, Math.sqrt(MAX_PIXELS / (w * h)));
      }

      // "<archivo original>_<metrica>.png", p. ej. "stratech_costo.png"
      const nombreBase = this._nombreExportado();
      console.log('[mapa de calor] nombre del archivo', {
        tituloDeLaVentana: document.title,
        nombreBase
      });

      const img = new Image();

      // Todo el cuerpo va en try/catch: img.onload es ASINCRONO, asi que un
      // fallo aqui NO lo cubre el try exterior. Sin esto, cualquier error
      // despues de cargar la imagen se pierde en silencio: el boton no hace
      // nada y no aparece ningun archivo.
      img.onload = () => {
        try {
          const canvasEl = document.createElement('canvas');
          canvasEl.width = Math.round(w * scale);
          canvasEl.height = Math.round(h * scale);

          const ctx = canvasEl.getContext('2d');
          if (!ctx) {
            throw new Error(`no se pudo crear el lienzo de ${canvasEl.width}x${canvasEl.height} px`);
          }

          // Fondo blanco: el PNG tendria transparencia y se ve mal al pegarlo.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
          ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);

          canvasEl.toBlob((blob) => {
            try {
              if (!blob) {
                throw new Error('el lienzo no devolvió datos');
              }

              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `${nombreBase}.png`;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);

              // Se informa del tamano generado: si el archivo no aparece en
              // Descargas pese a este aviso, el problema esta en la descarga
              // de Electron y no en la generacion de la imagen.
              const kb = Math.round(blob.size / 1024);
              const detalle = manchas === 0
                ? ' OJO: no había calor activo, así que la imagen es solo el diagrama.'
                : ` Incluye ${manchas} mancha(s) de calor.`;
              this._notifications.showNotification({
                text: `PNG generado (${canvasEl.width}x${canvasEl.height} px, ${kb} KB).${detalle} Revisa tu carpeta de Descargas.`,
                type: 'info',
                duration: 9000
              });
            } catch (err) {
              console.error('[mapa de calor] fallo al guardar el PNG', err);
              this._notifications.showNotification({
                text: `No se pudo guardar el PNG: ${err.message || err}`,
                type: 'error',
                duration: 8000
              });
            }
          }, 'image/png');
        } catch (err) {
          console.error('[mapa de calor] fallo al generar el PNG', err);
          this._notifications.showNotification({
            text: `No se pudo generar el PNG: ${err.message || err}`,
            type: 'error',
            duration: 8000
          });
        }
      };

      img.onerror = () => {
        console.error('[mapa de calor] el SVG no se pudo cargar como imagen');
        this._notifications.showNotification({
          text: 'No se pudo convertir el diagrama a imagen (el SVG no cargó).',
          type: 'error',
          duration: 8000
        });
      };

      // encodeURIComponent NO es opcional: los rellenos del calor son
      // url(#heatmap-blur-gradient) y el '#' sin escapar rompe el data URL.
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch (err) {
      console.error('[mapa de calor] fallo al preparar la exportacion', err);
      this._notifications.showNotification({
        text: `No se pudo exportar la imagen: ${err.message}`,
        type: 'error',
        duration: 8000
      });
    }
  }

  showMetric(metric) {
    this.clearOverlaysAndHeatmap();
    this.lastMetric = metric;

    // Se recogen los pares (figura, valor) y el dibujo se aplaza hasta conocer
    // el RANGO: la opacidad de cada mancha depende de si hay contraste o no, y
    // eso no se sabe hasta haber visto todos los valores.
    const pares = [];

    // TRAFICO: una linea no tiene tiempo ni costo, tiene PASOS. Aqui las conexiones
    // entran en la MISMA lista que las figuras, asi que el rango -y por tanto la
    // escala- es uno solo: un trazo y una tarea con los mismos pasos salen del mismo
    // color. Separarlos en dos rangos haria que dos cosas distintas pareciesen
    // comparables.
    if (metric === 'trafico') {
      // OJO CON EL FILTRO: aqui NO se usa `_pintable`, que es el del mapa por tareas
      // y deja fuera justo lo que esta vista viene a medir. Las conexiones TAMBIEN
      // entran. Se comprueba «tiene valor acumulable y se puede dibujar», que es
      // distinto: una tarea lleva mancha y una conexion trazo, pero las dos llevan
      // trafico, y ese trafico va en la MISMA escala para que se puedan comparar.
      this.simulationResults.forEach((result, elementId) => {
        const element = this._elementRegistry.get(elementId);
        if (!element || isLabel(element)) return;
        if (!this._esTrafizable(element)) return;
        pares.push({ element, value: result.executionCount || 0 });
      });

      // Las conexiones SIN ENTRADA en los resultados tambien cuentan: son justo las
      // que no se recorrieron, y son el hallazgo de esta vista. Si solo se dibujaran
      // las que tienen resultado, la rama muerta desapareceria del mapa.
      const enResultados = new Set(pares.map((p) => p.element.id));
      this._getFlujosDelDiagrama().forEach((flujo) => {
        if (!enResultados.has(flujo.id)) pares.push({ element: flujo, value: 0 });
      });

      const rangoTrafico = rangoDeValores(pares.map((p) => p.value));
      const dibujo = this._pintarFlujos(
        pares.filter((p) => is(p.element, 'bpmn:SequenceFlow')), rangoTrafico);

      // Los circulos van SOLO sobre las figuras: la lista de pares mezcla las dos
      // cosas a proposito (para el rango), pero una linea no lleva mancha.
      const soloFiguras = pares.filter((p) => !is(p.element, 'bpmn:SequenceFlow'));
      const dataPointsT = [];
      soloFiguras.forEach(({ element, value }) => {
        this._pushPoint(dataPointsT, element, value, this._opacidadEnRango(value, rangoTrafico));
      });

      this.createHeatmap();
      this._heatmap.gradient(GRADIENTE_ESCALA);
      this._heatmap.data(dataPointsT).max(rangoTrafico.max || 1).radius(this._radius, this._blur).draw();

      const sinTrafico = pares.filter((p) => p.value <= 0 && is(p.element, 'bpmn:SequenceFlow')).length;
      if (rangoTrafico.n > 0) this._leyendaEstructura(metric, rangoTrafico, sinTrafico, dibujo);
      this.showOverlays(metric);
      return;
    }

    // ZONAS: una rejilla sobre el diagrama con el trabajo que paso por cada trozo.
    // Va aparte de las otras dos porque no comparte ni la forma de pintar (celdas, no
    // circulos ni trazos) ni la unidad (minutos de trabajo, no costo ni pasos).
    if (metric === 'zonas' || metric === 'zonasTrafico') {
      if (!this.simulationResults) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        return;
      }

      const resultado = this._pintarZonas(metric);
      if (!resultado.pintadas) {
        this._notifications.showNotification({
          text: 'No hay trabajo que dibujar: ninguna tarea se ejecutó en esta corrida.',
          type: 'warning', duration: 5000
        });
        return;
      }

      const lado = resultado.zonas.lado;
      this._leyendaZonas(resultado.zonas, lado, lado !== LADO_CELDA, metric);
      // Sin circulos ni trazos: esta vista ES la rejilla. Mezclarlas daria dos
      // significados al mismo color sobre el mismo diagrama.
      return;
    }

    if (metric === 'resourceQuantity') {
      this._elementRegistry.forEach(element => {
        if (is(element, 'bpmn:Task') && !isLabel(element)) {
          const data = getSimulationData(element);
          const value = (data && data.resources && data.resources.quantityRequired) || 0;
          pares.push({ element, value });
        }
      });
    } else {
      if (!this.simulationResults) {
          this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
          return;
      }
      this.simulationResults.forEach((result, elementId) => {
          const element = this._elementRegistry.get(elementId);
          if (!element || !isSimulatedElement(element)) return;

          let value = 0;
          if (metric === 'frequency') value = result.executionCount;
          else if (metric === 'cost') value = result.totalCost;
          else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1); // Average
          else if (metric === 'totalWaitTime') value = result.totalWaitTime; // Total
          else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1);
          else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1);
          else if (metric === 'failureRate') value = result.failureCount / (result.executionCount || 1);
          else if (metric === 'overtime') value = result.totalOvertime;
          else if (metric === 'reworkTime') value = result.totalReworkTime;
          else if (metric === 'waitTimeCost') value = result.totalWaitTimeCost;

          pares.push({ element, value });
      });
    }

    const rango = rangoDeValores(pares.map((p) => p.value));

    const dataPoints = [];
    pares.forEach(({ element, value }) => {
      // La opacidad se resuelve aqui (funcion pura, comprobable fuera del
      // navegador) y viaja CON el punto. Si todos los valores son iguales,
      // HeatmapScale devuelve el extremo FRIO: sin esto, `valor / max` vale 1
      // en todas y el mapa sale entero rojo aunque no haya diferencias.
      this._pushPoint(dataPoints, element, value, this._opacidadEnRango(value, rango));
    });

    this.createHeatmap();
    // El degradado se fija desde HeatmapScale para que la leyenda y el filtro
    // SVG no puedan divergir.
    this._heatmap.gradient(GRADIENTE_ESCALA);
    this._heatmap.data(dataPoints).max(rango.max || 1).radius(this._radius, this._blur).draw();
    if (rango.n > 0) this._renderLegend(metric, rango);
    this.showOverlays(metric);
  }

  /**
   * Enciende el ID visible de cada tarea: un circulo azul con el numero corto.
   *
   * El numero se DERIVA del diagrama (ver TaskIds.js) y sigue el ORDEN DEL FLUJO,
   * no el de la pantalla: mover una figura no renumera el proceso, y el numero
   * coincide con el orden en que se recorre midiendo.
   *
   * NO se usa `show: { minZoom }` a proposito. En diagram-js, `minZoom` OCULTA el
   * overlay por debajo del umbral (Overlays.js, `_updateOverlayVisibilty`): es
   * justo el fallo que tenia el mapa de calor al alejarse. En su lugar se fija
   * `scale: { min: 0.35 }`, que hace que el circulo DEJE de encogerse por debajo
   * del 35 % sin desaparecer. Es decir: a cualquier zoom se ve, y en un diagrama
   * enorme sigue siendo legible.
   *
   * Se dibuja DENTRO de la tarea (arriba a la derecha, sin offset) para no
   * solaparse con la figura vecina ni girar sobre el borde.
   */
  mostrarIds() {
    this.idsVisibles = true;
    const tareas = this._tareasNumerables();
    const numeros = numerarTareas(tareas);

    tareas.forEach((tarea) => {
      const numero = numeros.get(tarea.id);

      // GUARDA: si el mapa y la lista no coinciden, el badge pintaba literalmente
      // «undefined» (paso con los subtipos de tarea, por un fallo de jerarquia de
      // tipos). Aqui se prefiere NO pintar antes que pintar una mentira.
      if (numero == null) {
        console.warn('[IDs] tarea sin numero, no se pinta badge:', tarea.id, tarea.type);
        return;
      }

      const etiqueta = etiquetaDe(tarea, numero);

      this._overlays.add(tarea, 'task-id', {
        position: { top: 5, right: 5 },
        scale: { min: 0.35 },
        html: `<div class="task-id-badge" title="ID ${numero} · ${etiqueta}">${numero}</div>`
      });
    });
  }

  ocultarIds() {
    this.idsVisibles = false;
    this._overlays.remove({ type: 'task-id' });
  }

  /**
   * Configurador de medicion: el JSON que alimenta la app de toma de tiempos.
   *
   * Lleva SOLO tareas (los eventos y compuertas no se miden) y tres formas de
   * nombrar cada una, porque cada una sirve para algo distinto:
   *   - `id`      el del XML: la clave con la que se fusionan las mediciones.
   *   - `idCorto` el numero visible. Se reasigna si cambia el diagrama.
   *   - `nombre`  para leer en pantalla.
   *
   * Y el SUPUESTO actual (la distribucion que hoy usa el motor), para que la app
   * pueda contrastar lo declarado con lo medido en planta. Ese contraste es el
   * motivo de existir del archivo: hoy el informe presenta un supuesto con la
   * misma autoridad que si estuviera medido.
   */
  construirConfigurador() {
    const tareas = this._tareasNumerables();
    const numeros = numerarTareas(tareas);

    const tareasJson = tareas.map((tarea) => {
      const data = getSimulationData(tarea) || {};
      const pt = data.processingTime || {};
      const carga = data.carga || {};

      // El supuesto se aplana (min/moda/max) en vez de anidarse: la app de tiempos
      // no tiene por que conocer la estructura interna del motor.
      const supuesto = { distribucion: pt.distribution || 'fixed' };
      if (supuesto.distribucion === 'triangular') {
        supuesto.min = pt.min;
        supuesto.moda = pt.mode;
        supuesto.max = pt.max;
      } else {
        supuesto.valor = pt.value;
      }
      supuesto.unidad = pt.unit || 'minutes';

      return {
        id: tarea.id,
        idCorto: numeros.get(tarea.id) || null,
        nombre: (tarea.businessObject && tarea.businessObject.name) || null,
        tipo: tarea.type,
        unidad: pt.unit || 'minutes',
        supuesto,
        tiempoPorLote: data.frequency === 'lot',
        carga: {
          masaCargadaKg: carga.masaCargadaKg == null ? null : carga.masaCargadaKg,
          masaArrastradaKg: carga.masaArrastradaKg == null ? null : carga.masaArrastradaKg,
          distanciaM: carga.distanciaM == null ? null : carga.distanciaM
        },
        habilidad: data.habilidad || null,
        medicion: { confianza: 95, precision: 5 }
      };
    });

    const raiz = this._elementRegistry.find((el) => !isLabel(el) && is(el, 'bpmn:StartEvent') && (getSimulationData(el) || {}).isRoot);
    const archivo = this._nombreDelArchivo();

    return {
      tipo: 'configurador-tiempos',
      version: 1,
      proyecto: {
        // El nombre del proyecto es el del DIAGRAMA, no el del archivo a descargar.
        // Antes se usaba `_nombreExportado()`, que devuelve «archivo_metrica»: el
        // proyecto acababa llamandose «mapa-calor_simulacion», que es el nombre de la
        // ultima metrica del mapa de calor y no dice nada del estudio.
        nombre: archivo,
        // `archivo` puede ser null si no se puede deducir del titulo de la ventana. Se
        // deja el hueco a proposito: inventar el nombre de la aplicacion seria un dato
        // falso, y un hueco se ve.
        archivo: archivo,
        fecha: new Date().toISOString().slice(0, 10),
        semilla: raiz ? ((getSimulationData(raiz) || {}).seed || null) : null
      },
      tareas: tareasJson
    };
  }

  /**
   * Descarga el configurador como JSON.
   *
   * Si no hay tareas avisa en vez de descargar un archivo vacio: un JSON sin
   * tareas haria que la app abriese sin nada que medir y el fallo se veria mas
   * tarde, lejos de la causa.
   */
  exportMediciones() {
    const configurador = this.construirConfigurador();

    if (!configurador.tareas.length) {
      this._notifications.showNotification({
        text: 'El diagrama no tiene tareas que medir',
        type: 'warning',
        duration: 5000
      });
      return;
    }

    const dataStr = JSON.stringify(configurador, null, 2);
    const link = document.createElement('a');
    link.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr));
    link.setAttribute('download', `configurador-${this._nombreExportado()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this._notifications.showNotification({
      text: `Configurador exportado: ${configurador.tareas.length} tarea(s)`,
      type: 'success',
      duration: 4000
    });
  }

  /** Tareas que reciben numero: solo tareas, igual que el mapa de calor. */
  _tareasNumerables() {
    return this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task'));
  }

  /**
   * Vuelve a pintar los IDs tras un cambio en el diagrama.
   *
   * Hace falta porque el numero depende de la ESTRUCTURA (el orden del flujo): al
   * anadir o borrar una tarea hay que renumerar. Se quita y se vuelve a poner en
   * lugar de recalcular, porque el overlay guarda su propio html y su posicion.
   *
   * Si los IDs estan apagados no hace nada: repintar seria encenderlos sin que
   * nadie lo haya pedido.
   */
  _refrescarIds() {
    if (!this.idsVisibles) return;
    this.ocultarIds();
    this.mostrarIds();
  }

  /**
   * Pinta la leyenda que da sentido al color.
   *
   * Sin ella, el rojo y el azul no significan nada: la escala es relativa al
   * maximo de la corrida, asi que «rojo» quiere decir «el mas alto de ESTE
   * diagrama», no «critico». La leyenda enseña el rango real (o el valor unico
   * cuando no hay diferencias).
   *
   * Va con `pointer-events: none` en CSS: es informativa y no debe interceptar
   * el zoom ni los clics del lienzo.
   */
  _renderLegend(metric, rango) {
    const contenedor = this._canvas.getContainer();
    let leyenda = contenedor.querySelector('.heatmap-legend');
    if (!leyenda) {
      leyenda = domify('<div class="heatmap-legend"></div>');
      contenedor.appendChild(leyenda);
    }

    const texto = textoDeEscala(metric, rango);
    const barra = texto.uniforme ? colorFrio(GRADIENTE_ESCALA) : gradienteCss(GRADIENTE_ESCALA);

    leyenda.innerHTML = `
      <div class="heatmap-legend-title">${texto.titulo}</div>
      <div class="heatmap-legend-bar" style="background: ${barra};"></div>
      <div class="heatmap-legend-detail">${texto.detalle}</div>
      <div class="heatmap-legend-note">${texto.nota}</div>
    `;
  }

  /**
   * Vista de ESTRUCTURA: el trafico pintado sobre las CONEXIONES, no solo sobre las
   * figuras.
   *
   * POR QUE HACIA FALTA: el mapa por tareas contesta «cuanto cuesta / cuanto espera
   * esta tarea», pero no «por donde pasa el trabajo». Y una conexion NO TIENE tiempo
   * ni costo: el unico dato que se acumula para una linea es cuantas veces se recorrio
   * (lo cuenta el motor en `findNextElements` al elegir la salida). Esto no es el mismo
   * mapa en otro sitio, es OTRA LECTURA de la misma corrida.
   *
   * Los trazos se clonan en la capa de overlays -la misma de los circulos- y NO se
   * tocan los del diagrama: asi no hay ningun estilo original que guardar y restaurar
   * mal, y el resaltado de seleccion del Modeler sigue siendo suyo.
   *
   * Las conexiones con CERO pasos van aparte, en gris discontinuo y NO en el extremo
   * frio de la escala. Es el hallazgo mas util de esta vista -una rama que no se
   * dispara es capacidad que se paga y no se usa- y con el azul se confundiria con
   * «poco trafico», que es otra cosa.
   *
   * Devuelve `{ bandas, top }`: las bandas para la leyenda -con el rango REAL de valores
   * de cada color- y los caminos mas usados con su nombre. Se devuelven en vez de
   * guardarse en `this` porque los necesita la leyenda, que se dibuja despues y en otro
   * sitio, y un estado de mas es un sitio mas donde desincronizarse.
   */
  _pintarFlujos(pares, rango) {
    this._limpiarFlujos();

    const capa = this._capaOverlays();
    if (!capa) return { bandas: null, top: [] };

    // LAS BANDAS SE CALCULAN CON LOS VALORES DE LAS CONEXIONES SOLO, no con los del
    // diagrama entero. Es la «escala propia»: comparar una linea contra una tarea seria
    // comparar dos cosas distintas, y mientras las tareas tengan numeros mas altos las
    // lineas no llegarian nunca al rojo.
    const bandasTrafico = bandasDeValores((pares || []).map((p) => p.value));
    const grupo = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grupo.setAttribute('class', 'heatmap-flows');
    capa.appendChild(grupo);
    this._flujosGrupo = grupo;

    const valores = new Map(pares.map((p) => [ p.element.id, p.value ]));

    let sinTrazo = 0;
    this._getFlujosDelDiagrama().forEach((flujo) => {
      if (!this._trazoDe(flujo)) {
        // Se CUENTA en vez de salir en silencio: si un diagrama no pinta ninguna linea,
        // esto es lo que lo explica en consola.
        sinTrazo++;
        return;
      }

      const d = this._trazoDe(flujo);
      if (!d) return;

      const valor = valores.has(flujo.id) ? valores.get(flujo.id) : 0;
      const trazo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      trazo.setAttribute('d', d);
      trazo.setAttribute('fill', 'none');
      trazo.setAttribute('stroke-linecap', 'round');
      trazo.setAttribute('stroke-linejoin', 'round');
      trazo.setAttribute('data-flujo', flujo.id);

      if (valor <= 0) {
        trazo.setAttribute('class', 'flujo-sin-trafico');
        trazo.setAttribute('stroke', '#9aa5b1');
        trazo.setAttribute('stroke-width', '2');
        trazo.setAttribute('stroke-dasharray', '6 5');
      } else {
        // BANDAS POR RANKING, con la escala PROPIA de las lineas.
        //
        // Antes se usaba la escala compartida con las figuras -`fraccionDe` sobre el rango
        // de TODO el diagrama-, y tenia dos problemas que se veian a la vez:
        //
        //   1. El tramo muerto: por debajo de 0,4 la escala es un unico azul plano. Con el
        //      rango real de una corrida (5-154) eso llegaba al valor 64,6, asi que 47 de
        //      las 49 conexiones salian del MISMO color. El canal del color no decia nada.
        //   2. Competir con las figuras: el maximo del diagrama suele ser una TAREA (154
        //      frente a los 111 de la conexion mas cargada), asi que las lineas nunca
        //      llegaban al rojo. Una tarea ejecutada 154 veces y una linea recorrida 111
        //      veces no son magnitudes comparables.
        //
        // Con las bandas propias, el camino MAS usado de las lineas sale SIEMPRE rojo, y la
        // pregunta «por que caminos pasa mas el trabajo» se contesta de un vistazo.
        const banda = bandasTrafico ? bandasTrafico.bandaDe(valor) : null;
        const color = banda ? banda.color : 'blue';
        // El GROSOR sigue siendo progresivo -no por bandas-: asi el color dice «en que
        // grupo estas» y el grosor dice «cuanto», y las dos lecturas no se estorban. Un
        // grosor por bandas daria cuatro anchos y perderia la gradacion fina.
        const fraccion = fraccionDe(valor, rango.min, rango.max);
        const grosor = 2 + 16 * (fraccion == null ? 0.5 : fraccion);
        trazo.setAttribute('stroke', color);
        trazo.setAttribute('stroke-width', String(Math.round(grosor * 10) / 10));
        trazo.setAttribute('stroke-opacity', '0.92');
      }

      grupo.appendChild(trazo);
    });

    if (sinTrazo) {
      console.warn(`[mapa] ${sinTrazo} conexion(es) sin trazo legible: no se pudieron pintar.`
        + ' Su grafico no expone un <path> con `d`, que es lo que se clona.');
    }

    // DIAGNOSTICO. Se cuenta lo que QUEDO en el DOM, y no lo que se creo: entre el
    // `appendChild` de arriba y este punto no hay nada, pero si en el Modeler real el
    // grupo acaba en otro sitio (o el DOM del SVG no es el que cree el codigo), la
    // diferencia entre «creados» y «en el documento» es justo la respuesta.
    this._avisarSiNoSeVenFlujos(grupo);

    // LOS CAMINOS MAS USADOS, con nombre y numero. Es lo que convierte el color en una
    // medicion: un color siempre es ambiguo -¿este naranja es mas que aquel?-, y un color
    // con su cifra al lado no lo es.
    const top = topCaminos(
      (pares || []).map((p) => ({
        valor: p.value,
        id: p.element && p.element.id,
        etiqueta: this._nombreDeConexion(p.element),
        color: bandasTrafico.bandaDe(p.value) ? bandasTrafico.bandaDe(p.value).color : null
      })),
      5
    );

    return { bandas: bandasTrafico, top };
  }

  /**
   * Nombre legible de una conexion: «origen → destino».
   *
   * Se usa el NOMBRE del elemento cuando lo tiene y su id cuando no, que es lo que hace
   * el resto del plugin. Una conexion sin nombre en bpmn-js es lo normal -casi nadie las
   * etiqueta-, asi que sin esto la lista de los caminos mas usados serian dos ids.
   */
  _nombreDeConexion(flujo) {
    if (!flujo) return '(sin conexion)';
    const nombreDe = (elemento) => {
      if (!elemento) return '?';
      const bo = elemento.businessObject;
      return (bo && bo.name) || elemento.id || '?';
    };
    return `${nombreDe(flujo.source)} → ${nombreDe(flujo.target)}`;
  }

  /**
   * AVISA cuando los trazos se crearon pero no llegaron al diagrama.
   *
   * Es la averia que costo mas encontrar: los `<path>` existian con su color y su grosor
   * -los arneses lo daban por bueno- y no se veian porque el grupo habia acabado en un
   * nodo que no cuelga del SVG que el usuario mira. Contar los CREADOS no la distingue;
   * hay que contar los que estan EN EL CONTENEDOR, que es lo que se ve.
   *
   * Solo avisa cuando hay averia. Una traza informativa en cada pintado acaba siendo ruido
   * en la consola justo cuando hace falta leerla para algo.
   */
  _avisarSiNoSeVenFlujos(grupo) {
    const creados = grupo ? grupo.querySelectorAll('path').length : 0;
    if (!creados) return;

    const enDocumento = this._canvas.getContainer().querySelectorAll('.heatmap-flows path').length;

    if (enDocumento < creados) {
      console.warn(`[mapa] ${creados} trazo(s) creados pero solo ${enDocumento} en el diagrama:`
        + ' el grupo se inserto en un nodo que no cuelga del SVG. Es la averia de «se pinta'
        + ' en el vacio» que ya sufrio el mapa de zonas.');
    }
  }

  /**
   * El `d` del trazo de una conexion.
   *
   * `canvas.getGraphics(flujo)` NO devuelve el `<path>`: devuelve el `<g class="djs-connection">`
   * que lo CONTIENE. La documentacion de diagram-js lo dice tal cual: «getGraphics(rootElement);
   * // <g ...>». Buscar `d` en ese grupo da undefined -un <g> no tiene `d`-, asi que la vista
   * salia por el `if (!d) return` en TODAS las conexiones y NO pintaba ninguna linea: es
   * exactamente el reporte «solo veo islas de colores, no toma en cuenta las lineas».
   *
   * Se busca el `d` en el propio nodo y, si no esta, en un descendiente. El arnes daba un
   * `d` de mentira en el nodo devuelto, asi que este camino nunca se probo de verdad.
   */
  _trazoDe(flujo) {
    // EL `d` SE CONSTRUYE, NO SE BUSCA EN EL DOM, y esto es el arreglo de verdad.
    //
    // Se buscaba el trazo en el grafico del elemento -`canvas.getGraphics(flujo)`- y ese
    // camino dependia de COMO dibuje bpmn-js: devuelve un `<g>`, el `d` esta en un `<path>`
    // hijo, y si manana lo anida de otra forma la vista deja de pintar. Costo cinco
    // hipotesis falsas y varias pruebas del usuario.
    //
    // La forma FIABLE la usa la propia libreria de tokens para animar: el `d` sale de
    // `connection.waypoints`, que son las coordenadas del diagrama -el MISMO sistema que
    // la capa de overlays-. Ver `bpmn-js-token-simulation/lib/animation/Animation.js`,
    // donde se reduce `waypoints` a `M x y L x y ...`. Aqui se hace lo mismo, sin el
    // desplazamiento de media ficha que ahi se aplica al `d` del token.
    //
    // No se usa `getGraphics` en absoluto: no hace falta el DOM para saber por donde va
    // una conexion.
    const waypoints = flujo && flujo.waypoints;
    if (!waypoints || !waypoints.length) return null;

    return waypoints.reduce((d, punto, indice) => {
      const x = Number(punto && punto.x);
      const y = Number(punto && punto.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return d;
      d.push([ indice > 0 ? 'L' : 'M', x, y ]);
      return d;
    }, []).map((parte) => parte.join(' ')).join(' ') || null;
  }

  /**
   * La capa donde se dibujan los overlays del mapa.
   *
   * SE PIDE EN CADA PINTADO, NO SE MEMORIZA. Guardarla en `this._overlaysLayer` y reusarla
   * mientras tuviera padre estaba MAL por dos motivos, y el primero explica el reporte
   * «todo se pinta en 0,0»:
   *
   *   1. `clearOverlaysAndHeatmap()` borra el grupo de overlays y `SimpleHeatSVG` se
   *      recrea: la referencia guardada queda colgando de un nodo muerto, asi que las
   *      celdas siguientes se dibujaban en un contenedor que YA NO ES el diagrama. Su
   *      sintoma era inconfundible: todo en (0,0), la esquina superior izquierda, con los
   *      valores apilados y sumados en el mismo sitio.
   *   2. El `catch` caia al `viewport` «para no dejar la vista sin pintar». Fue una mala
   *      idea: el viewport es el <g> que CONTIENE las capas y lleva su propio `transform`,
   *      asi que NO es el mismo sistema de coordenadas. Pintar ahi es pintar mal; es mejor
   *      no pintar y decir por que.
   *
   * Y es la razon de que los CIRCULOS si se vieran bien: `SimpleHeatSVG` pide la capa en
   * cada instancia, y si no la consigue LANZA. Aqui se hace lo mismo: se pide cada vez, y
   * si no se puede, se avisa en vez de inventarse un contenedor.
   */
  _capaOverlays() {
    try {
      const capa = this._canvas.getLayer('overlays');
      // Sin padre no sirve: un <g> suelto no esta en el arbol del diagrama y sus
      // coordenadas serian locales.
      if (capa && capa.parentNode) return capa;
      console.warn('[mapa] la capa de overlays no esta en el arbol del diagrama');
      return null;
    } catch (err) {
      // Ya existe con otro indice: el mapa de calor y esta vista piden lo mismo, asi que
      // esto solo pasa si algo la creo antes en otro sitio.
      console.warn('[mapa] no se pudo obtener la capa de overlays', err);
      return null;
    }
  }

  /** Quita los trazos de la vista de estructura, si los hubiera. */
  _limpiarFlujos() {
    if (this._flujosGrupo && this._flujosGrupo.parentNode) {
      this._flujosGrupo.parentNode.removeChild(this._flujosGrupo);
    }
    this._flujosGrupo = null;
  }

  /** ¿Esta figura puede recibir una mancha? Las conexiones no: solo trazo. */
  _pintable(element) {
    return esPintable(element);
  }

  /**
   * ¿Este elemento PUEDE llevar tráfico? Figuras y conexiones, pero no etiquetas ni
   * elementos de otra piscina (un participante no transporta nada).
   *
   * Es una pregunta DISTINTA de `_pintable`, y confundirlas fue el primer error de
   * esta vista: `_pintable` deja fuera las conexiones -a proposito, porque no llevan
   * mancha- y usarlo para decidir qué tiene tráfico dejaba TODAS las líneas en gris,
   * como si ninguna se hubiera recorrido. La vista de estructura existe justamente
   * para las conexiones.
   */
  _esTrafizable(element) {
    return is(element, 'bpmn:SequenceFlow') || esPintable(element);
  }

  /**
   * Los flujos que se pueden pintar. Se filtran por su tipo REAL (`bpmn:SequenceFlow`)
   * y no por «todo lo que tenga trazo»: pintar tambien las asociaciones o los flujos
   * de mensaje haria parecer que el trabajo se mueve por donde no se mueve.
   */
  _getFlujosDelDiagrama() {
    return this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:SequenceFlow'));
  }

  /**
   * Leyenda de la vista de estructura: la misma escala, mas el aviso de lo que NO se
   * recorrio. Sin ese aviso, una linea gris se lee como «sin datos» en vez de como
   * «por aqui no paso nada», que es el hallazgo.
   */
  _leyendaEstructura(metric, rango, sinTrafico, dibujo) {
    const contenedor = this._canvas.getContainer();
    let leyenda = contenedor.querySelector('.heatmap-legend');
    if (!leyenda) {
      leyenda = domify('<div class="heatmap-legend"></div>');
      contenedor.appendChild(leyenda);
    }

    const bandas = dibujo && dibujo.bandas;
    const top = (dibujo && dibujo.top) || [];

    // LA BARRA ES UN ESCALON, NO UNA RAMPA, y lleva el RANGO REAL de cada color debajo.
    // Un color sin su cifra es ambiguo: «¿este naranja es mucho o poco?». Con el rango
    // al lado -«de 66 a 111 pasos»- el color pasa a ser una medicion.
    const barra = bandas && bandas.bandas.length
      ? gradienteBandas(bandas.bandas)
      : (textoDeEscala(metric, rango).uniforme
        ? colorFrio(GRADIENTE_ESCALA) : gradienteCss(GRADIENTE_ESCALA));

    const filasBandas = bandas && bandas.bandas.length
      ? `<div class="heatmap-legend-bandas">${bandas.bandas.map((b) => `
          <div class="heatmap-legend-banda">
            <span class="muestra" style="background: ${b.color};"></span>
            <span class="rango">${Math.round(b.min)}${b.min === b.max ? '' : '–' + Math.round(b.max)} pasos</span>
            <span class="cuantos">${b.cuantos} camino(s)</span>
          </div>`).join('')}</div>`
      : `<div class="heatmap-legend-detail">${textoDeEscala(metric, rango).detalle}</div>`;

    // LOS CAMINOS MAS USADOS. Es la respuesta directa a «¿por qué líneas pasaron más
    // tokens?»: un color siempre es ambiguo, un color con su número y su nombre no.
    const filasTop = top.length
      ? `<div class="heatmap-legend-top">
          <div class="heatmap-legend-top-title">Los ${top.length} caminos más usados</div>
          ${top.map((c) => `
            <div class="heatmap-legend-top-fila">
              <span class="muestra" style="background: ${c.color || '#9aa5b1'};"></span>
              <span class="nombre" title="${c.etiqueta}">${c.etiqueta}</span>
              <span class="valor">${Math.round(c.valor)}</span>
            </div>`).join('')}
        </div>`
      : '';

    const aviso = sinTrafico > 0
      ? `<div class="heatmap-legend-warn"><strong>${sinTrafico}</strong> conexión(es) sin tráfico, en gris`
        + ' discontinuo: por ahí no pasó el trabajo. Una rama que no se usa es capacidad que se paga y no se aprovecha.</div>'
      : '';

    leyenda.innerHTML = `
      <div class="heatmap-legend-title">Caminos · ${escalaDeMetrica(metric).etiqueta}</div>
      <div class="heatmap-legend-bar" style="background: ${barra};"></div>
      ${filasBandas}
      ${filasTop}
      <div class="heatmap-legend-note">Los colores reparten las <strong>conexiones</strong> por
        puestos, no por valor: el rojo es siempre el camino más usado de este diagrama. El
        grosor sí es proporcional a los pasos.</div>
      ${aviso}
    `;
  }

  /**
   * VISTA DE ZONAS: una rejilla de celdas sobre el diagrama, con el trabajo que paso
   * por cada trozo.
   *
   * POR QUE HACIA FALTA, y por que no bastaba con lo de antes: un circulo esta centrado
   * en su figura, asi que por construccion NUNCA puede formar una mancha; dice «esta
   * tarea es cara», no «por aqui pasa el trabajo». La zona contesta lo otro, y para eso
   * hay que SUMAR la masa de varias figuras cercanas en un mismo trozo de diagrama.
   *
   * Las celdas viven en COORDENADAS DEL DIAGRAMA y escalan con el zoom. Es lo que hace
   * que una celda sea siempre el mismo trozo de planta y que el numero de la leyenda
   * signifique lo mismo sin importar como se este mirando. Si la rejilla se anclara a la
   * pantalla, «1.200 minutos en esta celda» cambiaria de significado al acercarse.
   *
   * Como lo normal es mirarlo SIN zoom, ese es el caso que se cuida: a zoom alto las
   * celdas crecen, que es una esquina rara y no rompe nada.
   */
  _pintarZonas(metric) {
    this._limpiarZonas();

    // Con trafico, la masa es el NUMERO DE PASOS; sin el, los minutos de trabajo.
    const porTrafico = metric === 'zonasTrafico';

    // La masa de cada figura es MINUTOS DE TRABAJO: ejecuciones x duracion. No el
    // costo ni la espera, porque la pregunta de esta vista es por donde paso el
    // trabajo, y eso es tiempo que estuvo ocupado, no dinero.
    const conMasa = [];
    this.simulationResults.forEach((result, elementId) => {
      const element = this._elementRegistry.get(elementId);
      if (!element || isLabel(element) || !this._esTrafizable(element)) return;

      const ejecuciones = result.executionCount || 0;
      // Con trafico la masa son los PASOS; sin el, los MINUTOS DE TRABAJO. Es la unica
      // diferencia entre las dos lecturas, y va aqui y no en el bucle de pintado para
      // que el rango y la escala salgan del dato correcto.
      const esFlujo = is(element, 'bpmn:SequenceFlow');
      const masa = porTrafico
        ? ejecuciones
        : (esFlujo ? ejecuciones : ejecuciones * (result.totalProcessingTime || 0));

      if (!(masa > 0)) return;

      // UNA CONEXION APORTA POR SU TRAZO O NO APORTA. Y no es una optimizacion: es el
      // arreglo del reporte «se pintan las demas secciones pero en azul, lo unico rojo es
      // 0,0, y no hay figuras en esa zona».
      //
      // La condicion NO puede ser «no tiene caja» -que es lo que puse primero, y no
      // atrapaba el caso-: una conexion de bpmn-js no tiene width/height, pero el registro
      // puede entregarla de cualquiera de las dos formas, y el caso que ROMPE es
      // justamente el contrario, una conexion CON caja y sin trazo utilizable.
      //
      // Lo que decide es si su masa TIENE DONDE IR:
      //
      //   con trazo -> va repartida por la linea, que es el dibujo correcto;
      //   sin trazo -> caeria al centro de su caja, y si esa caja esta en el origen su
      //                masa entera termina en la esquina. Con la escala RELATIVA AL MAXIMO
      //                se lleva el rojo y todo el diagrama real sale azul.
      //
      // Una FIGURA nunca se queda fuera: su caja es su sitio y ahi si hay algo que pintar.

      if (esFlujo && !(this._puntosDelTrazo(element) || []).length) return;

      conMasa.push({ element, masa });
    });

    if (!conMasa.length) return { pintadas: 0 };

    // El lado de celda se ajusta si el diagrama es enorme: decenas de miles de nodos
    // cuelgan el Modeler. Se sube la celda en vez de recortar zonas, porque recortar
    // mentiria sobre donde se trabajo.
    const lado = ladoQueCabe(conMasa, LADO_CELDA);

    // El contenedor tiene que estar en el modo «mapa»: la clase hace visible lo que se
    // salga de la caja del SVG (`overflow: visible`). Se PONE aqui tambien -y no solo en
    // el mapa de tareas- porque `showMetric` limpia al empezar, y la limpieza la quita;
    // sin esto, la mancha se recortaria por los bordes.
    domClasses(this._canvas.getContainer()).add('heatmap-shown');

    const zonas = calcularZonas(conMasa, {
      lado,
      // Los puntos del trazo de una conexion, muestreados del `path` REAL. Sin esto la
      // masa de una linea caeria en el centro de su caja envolvente, que en una linea
      // diagonal esta en el aire y la mancha saldria separada del trazo.
      puntosDeFlujo: (flujo) => this._puntosDelTrazo(flujo)
    });

    if (!zonas.n) return { pintadas: 0 };

    const capa = this._capaOverlays();
    if (!capa) {
      this._notifications.showNotification({
        text: 'No se encontró la capa del diagrama donde dibujar el mapa.',
        type: 'error', duration: 6000
      });
      return { pintadas: 0 };
    }

    const grupo = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grupo.setAttribute('class', 'heatmap-zones');
    capa.appendChild(grupo);
    this._zonasGrupo = grupo;

    zonas.celdas.forEach((celda) => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', celda.x);
      rect.setAttribute('y', celda.y);
      // Se solapa un pixel para que no queden rendijas blancas entre celdas contiguas:
      // sin eso la mancha sale cuadriculada en vez de continua.
      rect.setAttribute('width', zonas.lado + 1);
      rect.setAttribute('height', zonas.lado + 1);
      rect.setAttribute('fill', colorDeValor(zonas.max > 0 ? celda.valor / zonas.max : 0));
      rect.setAttribute('opacity', String(opacidadDe(celda.valor, zonas.max, false)));
      grupo.appendChild(rect);
    });

    return { pintadas: zonas.celdas.length, zonas };
  }

  /**
   * Puntos de muestreo del trazo de una conexion.
   *
   * `getPointAtLength` da puntos SOBRE el trazo real, que es lo que hace que la mancha
   * siga la linea y no su caja. Se muestrea cada 40 px: mas denso no cambia el dibujo
   * (el reparto tiene radio de dos celdas) y multiplica el trabajo.
   */
  _puntosDelTrazo(flujo, cada = 40) {
    // SE MIDE SOBRE LOS WAYPOINTS, no sobre el `<g>` del diagrama.
    //
    // Antes se pedia `getTotalLength` al grafico del elemento -un `<g>`-, y un `<g>` NO
    // tiene ese metodo: solo lo tiene el `<path>`. Devolvia null SIEMPRE, asi que la
    // guarda de `_pintarZonas` -«una conexion sin puntos no aporta»- descartaba todas las
    // conexiones y la mancha de zonas caia al centro de la figura en vez de seguir la
    // linea. Es el mismo error que tenia `_trazoDe`, y se arregla igual: midiendo la
    // polilinea de `waypoints`, que no depende de como dibuje bpmn-js.
    const waypoints = flujo && flujo.waypoints;
    if (!waypoints || waypoints.length < 2) return null;

    const limpios = waypoints
      .map((p) => ({ x: Number(p && p.x), y: Number(p && p.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (limpios.length < 2) return null;

    // Se recorre la polilinea segmento a segmento y se muestrea cada `cada` px de
    // RECORRIDO, no por segmento: muestrear por segmento daria mas puntos en los tramos
    // cortos y el reparto de la masa quedaria sesgado hacia las esquinas.
    const puntos = [];
    let restante = 0;
    for (let i = 1; i < limpios.length; i++) {
      const a = limpios[i - 1];
      const b = limpios[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const largo = Math.sqrt(dx * dx + dy * dy);
      if (!(largo > 0)) continue;

      for (let avance = restante; avance <= largo; avance += cada) {
        puntos.push({ x: a.x + (dx * avance) / largo, y: a.y + (dy * avance) / largo });
      }
      // Lo que sobra del ultimo paso se arrastra al segmento siguiente, para que la
      // distancia entre puntos sea constante en toda la linea y no se reinicie en cada
      // esquina (que amontonaria puntos justo ahi).
      restante = (restante - largo) % cada;
      if (restante < 0) restante += cada;
    }

    // El punto final no sale del bucle si el largo no es multiplo de `cada`: la punta de
    // la conexion se quedaria sin masa y la mancha no llegaria a la figura de destino.
    const ultimo = limpios[limpios.length - 1];
    const previo = puntos[puntos.length - 1];
    if (!previo || Math.abs(previo.x - ultimo.x) > 0.5 || Math.abs(previo.y - ultimo.y) > 0.5) {
      puntos.push({ x: ultimo.x, y: ultimo.y });
    }

    return puntos.length ? puntos : null;
  }

  /** Quita las celdas del mapa de zonas, si las hubiera. */
  _limpiarZonas() {
    if (this._zonasGrupo && this._zonasGrupo.parentNode) {
      this._zonasGrupo.parentNode.removeChild(this._zonasGrupo);
    }
    this._zonasGrupo = null;
    // NO se toca la clase del contenedor. Es estado GLOBAL -la trae `overflow: visible`,
    // que el mapa de tareas TAMBIEN necesita- y quitarla desde una vista dejaba a la otra
    // sin ella: los circulos se pintaban con el SVG recortado y las celdas acababan sin
    // una capa valida. El estado lo pone y lo quita `clearOverlaysAndHeatmap`, en el
    // mismo sitio donde se destruye el mapa.
  }

  /** Leyenda de la vista de zonas: la unidad dicha, y el aviso de la resolucion. */
  _leyendaZonas(zonas, lado, ajustado, metric) {
    const contenedor = this._canvas.getContainer();
    let leyenda = contenedor.querySelector('.heatmap-legend');
    if (!leyenda) {
      leyenda = domify('<div class="heatmap-legend"></div>');
      contenedor.appendChild(leyenda);
    }

    const porTrafico = metric === 'zonasTrafico';
    // La unidad de cada lectura, escrita y distinta: minutos de trabajo y pasos NO son
    // lo mismo, y una leyenda que dijera «trabajo» en las dos dejaria al usuario sin
    // saber cual de las dos esta mirando.
    const formatea = porTrafico
      ? (v) => `${Math.round(v)} ${Math.round(v) === 1 ? 'paso' : 'pasos'}`
      : (v) => `${formatMinutes(v / 60000)} de trabajo`;

    const rango = rangoDeValores(zonas.celdas.map((c) => c.valor));
    const barra = rango.uniforme ? colorFrio(GRADIENTE_ESCALA) : gradienteCss(GRADIENTE_ESCALA);

    // La unidad va ESCRITA. Sin ella, «1.200» en una celda no dice nada, y una mancha
    // que nadie sabe de donde sale es un adorno, no una medicion.
    const detalle = rango.uniforme
      ? `Uniforme: ${formatea(rango.min)} por celda`
      : `${formatea(rango.min)} → ${formatea(rango.max)} por celda`;

    const aviso = ajustado
      ? `<div class="heatmap-legend-warn">El diagrama es grande y se subió el tamaño de celda a`
        + ` <strong>${lado} px</strong> para no colgar el navegador. La mancha se lee igual, con menos`
        + ' resolución: cada celda cubre más zona.</div>'
      : '';

    leyenda.innerHTML = `
      <div class="heatmap-legend-title">${porTrafico
        ? 'Zonas · por dónde PASAN los tokens (tráfico)'
        : 'Zonas · dónde se va el TIEMPO (minutos de trabajo)'}</div>
      <div class="heatmap-legend-bar" style="background: ${barra};"></div>
      <div class="heatmap-legend-detail">${detalle}</div>
      <div class="heatmap-legend-note">${zonas.n} celdas de ${lado} px · la celda es un trozo fijo del diagrama, así que el número no cambia al acercarse. ${rango.uniforme ? '' : 'Azul = menos trabajo · Rojo = más'}</div>
      ${aviso}
    `;
  }

  showOverlays(metric) {
    const elements = metric === 'resourceQuantity'
      ? this._elementRegistry.filter(el => !isLabel(el) && is(el, 'bpmn:Task'))
      : Array.from(this.simulationResults.keys()).map(id => this._elementRegistry.get(id));

    elements.forEach(element => {
        if (!element) return;
        let overlayText = '';
        const result = this.simulationResults ? this.simulationResults.get(element.id) : null;

        if (metric === 'resourceQuantity') {
            const data = getSimulationData(element);
            const value = (data && data.resources && data.resources.quantityRequired) || 0;
            if (value > 0) overlayText = `Recursos: ${value}`;
        } else if (result) {
            if (is(element, 'bpmn:Task') && !isLabel(element)) {
                if (metric === 'cost') overlayText = `Costo: ${formatCurrency(result.totalCost, 'MXN')}`;
                else if (metric === 'waitTime') overlayText = `Espera Prom: ${formatMinutes(result.totalWaitTime / (result.executionCount || 1))}`;
                else if (metric === 'totalWaitTime') overlayText = `Espera Total: ${formatMinutes(result.totalWaitTime)}`;
                else if (metric === 'processTime') overlayText = `Proceso: ${formatMilliseconds(result.totalProcessingTime / (result.executionCount || 1))}`;
                else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
                else if (metric === 'failureRate' && result.executionCount > 0) {
                    const rate = (result.failureCount / result.executionCount * 100).toFixed(1);
                    overlayText = `Fallos: ${result.failureCount} (${rate}%)`;
                }
                else if (metric === 'overtime') overlayText = `H. Extras: ${formatMilliseconds(result.totalOvertime)}`;
                else if (metric === 'reworkTime') overlayText = `T. Reparación: ${formatMilliseconds(result.totalReworkTime)}`;
                else if (metric === 'waitTimeCost') overlayText = `Costo Espera: ${formatCurrency(result.totalWaitTimeCost, 'MXN')}`;
            } else if (is(element, 'bpmn:EndEvent') && metric === 'cycleTime' && result.totalCycleTime > 0) {
                overlayText = `Ciclo: ${formatMinutes(result.totalCycleTime / (result.executionCount || 1))}`;
            }
        }

        if (overlayText) this._overlays.add(element, 'simulation-overlay', { position: { bottom: -5, left: element.width / 2 - 20 }, html: `<div class="simulation-overlay-text">${overlayText}</div>` });

        // El guard !isLabel es imprescindible: una etiqueta de compuerta pasa
        // is(el, 'bpmn:ExclusiveGateway'), pero NO tiene `outgoing`, asi que
        // element.outgoing.forEach lanzaria TypeError.
        if (result && is(element, 'bpmn:ExclusiveGateway') && !isLabel(element)) {
            element.outgoing.forEach(flow => {
                const flowResult = this.simulationResults.get(flow.id);
                if (flowResult && result.executionCount > 0 && flowResult.executionCount > 0) {
                    const percentage = (flowResult.executionCount / result.executionCount * 100).toFixed(1);
                    this._overlays.add(flow.id, 'simulation-overlay', { position: { top: -15, left: -20 }, html: `<div class="simulation-overlay-text">${flowResult.executionCount} (${percentage}%)</div>` });
                }
            });
        }
    });
  }

  showChart() {
    const metric = this._chartPanel.getChartType();

    // "Resumen General" del desplegable es una VISTA, no un grafico. No habia
    // ninguna rama para ella, asi que caia al camino del canvas con una metrica
    // sin datos y dibujaba un grafico VACIO. Y es la PRIMERA opcion del
    // desplegable, o sea lo primero que ve el usuario al abrir el panel.
    // Se pinta en linea (y no en el modal) para no abrir una ventana sola al
    // mostrar el panel; el modal sigue disponible en el boton de la cabecera.
    if (metric === 'overallSummary') {
      if (!this.normalReport || !this.overtimeReport) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
        return;
      }
      this._chartPanel.showHtmlContent(this.createOverallSummary(this.overtimeReport, this.normalReport));
      return;
    }

    // This metric does not require a simulation run
    if (metric === 'inputParams') {
      const data = this.getInputParametersData();
      const tableHtml = this.createInputParametersTable(data);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
      this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
      return;
    }

    // HTML-based reports
    if (metric === 'resultsTable') {
      const tableHtml = this.createResultsTable(this.simulationResults);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    // Canvas-based charts
    this._chartPanel.showCanvas();
    if (this._chart) {
      this._chart.destroy();
    }

    const chartConfig = this.getChartConfig(metric);
    if (!chartConfig) {
      return; // getChartConfig is responsible for showing an error message
    }

    const ctx = this._chartPanel.getCanvas().getContext('2d');
    this._chart = new Chart(ctx, chartConfig);
  }

  getChartConfig(metric) {
    if (metric === 'productionCompare') {
      if (!this.normalReport || !this.overtimeReport) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación comparativa disponibles.</p>');
        return null;
      }
      const normalReport = this.normalReport;
      const overtimeReport = this.overtimeReport;
      const allDates = [...new Set([...normalReport.dailyCompletions.keys(), ...overtimeReport.dailyCompletions.keys()])];
      allDates.sort((a, b) => new Date(a) - new Date(b));

      const normalData = allDates.map(date => normalReport.dailyCompletions.get(date) || 0);
      const overtimeData = allDates.map(date => overtimeReport.dailyCompletions.get(date) || 0);

      // console.log('--- CHART DATA ---');
      // console.log('Labels (Dates):', allDates);
      // console.log('Normal Production Data:', normalData);
      // console.log('Overtime Production Data:', overtimeData);

      return {
        type: 'bar',
        data: {
          labels: allDates,
          datasets: [
            {
              label: 'Producción Normal',
              data: normalData,
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            },
            {
              label: 'Producción con Horas Extras',
              data: overtimeData,
              backgroundColor: 'rgba(255, 159, 64, 0.5)',
              borderColor: 'rgba(255, 159, 64, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          // El canvas se ajusta al envoltorio (.canvas-wrap), que tiene un alto
          // definido: asi el grafico no se estira en alto al ensanchar el panel.
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Piezas Completadas por Día' }
            }
          }
        }
      };
    }

    // Operatividad por persona (A5): activo y las tres ociosidades que el motor
    // puede medir, apiladas. Sin nombres no hay nada que dibujar, y se dice.
    if (metric === 'operatividadPersona' || metric === 'cargaPersona') {
      const personas = (this.overtimeReport && this.overtimeReport.operatividad
        && this.overtimeReport.operatividad.porMiembro) || [];

      if (!personas.length) {
        this._chartPanel.showHtmlContent(`
          <div style="padding:18px; line-height:1.6;">
            <h4 style="margin:0 0 8px;">Sin colaboradores con nombre</h4>
            <p>Este gráfico necesita <strong>miembros con nombre</strong> en las piscinas: sin nombres el
            motor solo sabe que la piscina trabajó, no <em>quién</em>.</p>
            <p>Se declaran en la pestaña <strong>Recursos</strong>, dentro de cada piscina. Es opcional: sin
            nombres, todo lo demás se comporta igual que siempre.</p>
          </div>
        `);
        return null;
      }

      if (metric === 'operatividadPersona') {
        const nombres = personas.map((p) => p.nombre);
        const serie = (campo, etiqueta, color) => ({
          label: etiqueta,
          data: personas.map((p) => Number((p[campo] / 60).toFixed(2))),
          backgroundColor: color
        });

        const libres = this.overtimeReport.operatividad.noCalculado || [];
        return {
          type: 'bar',
          data: {
            labels: nombres,
            datasets: [
              serie('activoMin', 'Activo (trabajando)', 'rgba(46, 125, 50, 0.75)'),
              serie('sinTrabajoMin', 'Sin trabajo', 'rgba(158, 158, 158, 0.75)'),
              serie('esperandoFirmaMin', 'Esperando firma', 'rgba(255, 159, 64, 0.85)'),
              serie('bloqueadoPorHabilidadMin', 'Bloqueado por habilidad', 'rgba(198, 40, 40, 0.8)')
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              title: {
                display: true,
                text: 'Jornada de cada persona, en horas'
                  + (libres.length ? ` · no incluye «${libres[0]}»` : '')
              },
              tooltip: {
                callbacks: {
                  afterBody: (items) => {
                    const p = personas[items[0].dataIndex];
                    return `Ocupación: ${(p.ocupacion * 100).toFixed(1)} %\nTareas: ${p.tareas}`;
                  }
                }
              }
            },
            scales: {
              x: { stacked: true },
              y: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: 'Horas' }
              }
            }
          }
        };
      }

      // Carga física por persona: DOS series en columnas separadas, nunca
      // apiladas, porque no son la misma magnitud y sumarlas daría un número sin
      // significado.
      const conCarga = personas.filter((p) => p.carga && (p.carga.cargadaKg > 0 || p.carga.arrastradaKg > 0));
      if (!conCarga.length) {
        this._chartPanel.showHtmlContent(`
          <div style="padding:18px; line-height:1.6;">
            <h4 style="margin:0 0 8px;">Sin carga declarada</h4>
            <p>Ninguna tarea declara masa, así que no hay nada que dibujar. Se declara por tarea: masa
            <strong>cargada</strong> (la que se soporta), masa <strong>arrastrada</strong> (la que se desliza)
            y distancia.</p>
            <p>Las dos series van separadas a propósito: <strong>no se suman</strong>.</p>
          </div>
        `);
        return null;
      }

      return {
        type: 'bar',
        data: {
          labels: conCarga.map((p) => p.nombre),
          datasets: [
            {
              label: 'Masa cargada (t)',
              data: conCarga.map((p) => Number((p.carga.cargadaKg / 1000).toFixed(3))),
              backgroundColor: 'rgba(21, 101, 192, 0.75)'
            },
            {
              label: 'Masa arrastrada (t)',
              data: conCarga.map((p) => Number((p.carga.arrastradaKg / 1000).toFixed(3))),
              backgroundColor: 'rgba(120, 144, 156, 0.8)'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            title: {
              display: true,
              text: 'Masa movida por persona, en toneladas (series separadas: no se suman)'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Toneladas' }
            }
          }
        }
      };
    }

    // Mapa de calor del dia: hora x ocupacion. NO usa Chart.js: es una rejilla
    // de celdas, y dibujarla con una libreria de graficos seria pelear contra
    // ella. Se compone como HTML, que ademas se imprime bien.
    if (metric === 'heatmapDia') {
      const celdas = (this.overtimeReport && this.overtimeReport.heatmapDia) || [];
      if (!celdas.length) {
        this._chartPanel.showHtmlContent(`
          <div style="padding:18px; line-height:1.6;">
            <h4 style="margin:0 0 8px;">Sin actividad que dibujar</h4>
            <p>La corrida no registró ninguna tarea completada con duración, así que no hay ocupación por hora.</p>
          </div>
        `);
        return null;
      }

      const dias = [ ...new Set(celdas.map((c) => c.dia)) ].sort();
      const porClave = new Map(celdas.map((c) => [`${c.dia}|${c.hora}`, c.minutos]));
      const max = Math.max(...celdas.map((c) => c.minutos));

      // Escala de color en 4 tramos. El CORTE se imprime en la leyenda: una
      // banda sin su umbral es una cifra con autoridad falsa.
      const color = (v) => {
        if (!v) return '#f4f6f8';
        const r = v / max;
        if (r < 0.25) return '#c8e6c9';
        if (r < 0.5) return '#81c784';
        if (r < 0.75) return '#43a047';
        return '#1b5e20';
      };

      const cabecera = Array.from({ length: 24 }, (_, h) => `<th>${h}</th>`).join('');
      const filas = dias.map((dia) => {
        const celdasDia = Array.from({ length: 24 }, (_, h) => {
          const v = porClave.get(`${dia}|${h}`) || 0;
          return `<td style="background:${color(v)}" title="${dia} ${h}:00 · ${v ? v.toFixed(0) : 0} min-recurso"></td>`;
        }).join('');
        return `<tr><th class="dia">${dia}</th>${celdasDia}</tr>`;
      }).join('');

      const textoGlobal = `Ocupación por hora del día, en minutos-recurso (una tarea de 2 unidades durante 30 min son 60).
El corte de color va de 0 a ${max.toFixed(0)} min-recurso, que es la hora más cargada de la corrida: verde claro
es poca ocupación y verde oscuro es la máxima. Pasa el ratón por una celda para ver el valor.`;

      // El grafico se compone con su propia ayuda para que se pueda interpretar
      // sin salir del panel. El contenedor lo pinta el panel de graficos.
      this._chartPanel.showHtmlContent(`
        <div class="heatmap-dia">
          <style>
            .heatmap-dia table { border-collapse: collapse; margin: 0 auto; }
            .heatmap-dia th { font-size: 11px; color: #666; font-weight: 500; padding: 2px; text-align: center; }
            .heatmap-dia th.dia { text-align: right; padding-right: 8px; white-space: nowrap; color: #333; font-weight: 600; }
            .heatmap-dia td { width: 30px; height: 20px; border: 1px solid #fff; }
            .heatmap-dia .leyenda { display: flex; gap: 6px; align-items: center; justify-content: center; margin-top: 12px; font-size: 12px; color: #555; }
            .heatmap-dia .leyenda i { display: inline-block; width: 18px; height: 12px; border: 1px solid #ddd; }
            .heatmap-dia p { font-size: 12px; color: #555; line-height: 1.5; max-width: 820px; margin: 12px auto 0; }
          </style>
          <p style="text-align:center; font-weight:600; margin: 0 0 10px;">Ocupación por hora × día</p>
          <table>
            <thead><tr><th></th>${cabecera}</tr></thead>
            <tbody>${filas}</tbody>
          </table>
          <div class="leyenda">
            <span>0</span>
            <i style="background:#c8e6c9"></i><i style="background:#81c784"></i>
            <i style="background:#43a047"></i><i style="background:#1b5e20"></i>
            <span>${max.toFixed(0)} min-recurso</span>
          </div>
          <p>${textoGlobal}</p>
        </div>
      `);
      return null;
    }

    // Perfil de la jornada: cuanto se ocupo CADA DIA. Es el diente de sierra que
    // pide el diseno —produccion durante el lote, ociosidad hasta el siguiente—,
    // y con lotes el escalon se ve directamente.
    if (metric === 'perfilJornada') {
      const dias = this._produccionDiaria(this.overtimeReport);
      if (!dias.length) {
        this._chartPanel.showHtmlContent(`
          <div style="padding:18px; line-height:1.6;">
            <h4 style="margin:0 0 8px;">Sin días que dibujar</h4>
            <p>La corrida no produjo ningún día completo.</p>
          </div>
        `);
        return null;
      }

      return {
        type: 'bar',
        data: {
          labels: dias.map((d) => d.dia),
          datasets: [{
            label: 'Piezas completadas',
            data: dias.map((d) => d.piezas),
            backgroundColor: 'rgba(21, 101, 192, 0.7)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            title: {
              display: true,
              text: 'Perfil de la jornada: piezas por día (barras, no curva: un día es un valor)'
            }
          },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Piezas' } }
          }
        }
      };
    }

    const chartData = this.getChartData(metric);

    let chartType = 'bar';
    if (metric === 'scatter') chartType = 'scatter';
    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') chartType = 'bar';

    const options = {
        // El canvas se ajusta al envoltorio (.canvas-wrap), que tiene un alto
        // definido: asi el grafico no se estira en alto al ensanchar el panel.
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Valor'
                }
            }
        }
    };

    // Los ejes de tiempo se rotulan en MINUTOS porque getChartData() ya ha
    // convertido la serie a minutos (ver METRICAS_TIEMPO).
    const yAxisTitle =
        metric === 'cost' ? 'Costo ($) por componente' :
        metric === 'costCompare' ? 'Costo ($)' :
        metric === 'cycleHistogram' ? 'Casos' :
        metric === 'utilization' ? 'Utilización (%)' :
        metric === 'flowVolume' ? 'Casos que pasaron' :
        metric === 'dailyRun' || metric === 'cumulative' ? 'Piezas' :
        metric === 'processTime' ? 'Tiempo de Proceso Total (min)' :
        metric === 'waitTime' || metric === 'allWaitTimes' || metric === 'paretoWait' ? 'Tiempo de Espera Total (min)' :
        metric === 'resourceQuantity' ? 'Cantidad de Recursos' :
        metric === 'pareto' ? 'Número de Fallos' :
        metric === 'paretoTime' ? 'Tiempo de Proceso Total (min)' :
        metric === 'paretoCost' ? 'Costo Total ($)' :
        metric === 'overtime' ? 'Tiempo Extra Total (min)' :
        metric === 'reworkTime' ? 'Tiempo de Reparación Total (min)' :
        metric === 'waitTimeCost' ? 'Costo de Espera Total ($)' :
        metric === 'dailyProduction' ? 'Piezas Completadas' :
        'Valor';
    options.scales.y.title.text = yAxisTitle;

    // Barras APILADAS del desglose de costo: cada tarea es un monton.
    if (metric === 'cost') {
        options.scales.x = { stacked: true };
        options.scales.y.stacked = true;
    }

    // Eje derecho de porcentaje acumulado, comun a los cuatro Pareto.
    if ([ 'pareto', 'paretoTime', 'paretoCost', 'paretoWait' ].includes(metric)) {
        options.scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0,
            max: 100,
            title: {
                display: true,
                text: 'Porcentaje Acumulado (%)'
            },
            grid: { drawOnChartArea: false },
        };
    }

    // Titulo del eje X donde la unidad no se deduce del contexto.
    if (metric === 'cycleHistogram') {
        options.scales.x = {
            ...(options.scales.x || {}),
            title: { display: true, text: 'Tiempo de ciclo (min)' }
        };
    }

    if (metric === 'scatter') {
        options.scales.x = {
            type: 'linear',
            position: 'bottom',
            title: { display: true, text: 'Tiempo de Proceso Promedio (min)' }
        };
        options.scales.y.title = { display: true, text: 'Costo Total ($)' };
    }

    const datasets = chartData.datasets ? chartData.datasets : [{
        label: chartData.label,
        data: chartData.data,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
    }];

    // Tooltips. Cada familia de metricas necesita su formato: tiempo, dinero,
    // conteos o porcentaje. En los Pareto, el eje derecho (y1) es un porcentaje y
    // se distingue por `yAxisID`; el resto usa el formato de su unidad.
    const tooltipTiempo = () => ({
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) { label += ': '; }
                    if (context.parsed.y === null) return label;
                    if (context.dataset.yAxisID === 'y1') return label + context.parsed.y.toFixed(1) + ' %';
                    return label + formatMinutes(context.parsed.y);
                }
            }
        }
    });

    const tooltipDinero = () => ({
        tooltip: {
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) { label += ': '; }
                    if (context.parsed.y === null) return label;
                    if (context.dataset.yAxisID === 'y1') return label + context.parsed.y.toFixed(1) + ' %';
                    return label + formatCurrency(context.parsed.y, 'MXN');
                }
            }
        }
    });

    // Series de tiempo (ya en MINUTOS) y el Pareto de esperas, que comparte forma.
    if (METRICAS_TIEMPO[metric] || metric === 'paretoWait') {
        options.plugins = tooltipTiempo();
    }

    if (metric === 'costCompare') {
        options.plugins = tooltipDinero();
    }

    // Costo apilado: el pie suma el monton, que es el costo total de la tarea.
    if (metric === 'cost') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `${context.dataset.label}: ${formatCurrency(context.parsed.y, 'MXN')}`;
                    },
                    footer: function(items) {
                        const total = items.reduce((a, i) => a + (i.parsed.y || 0), 0);
                        return `Total: ${formatCurrency(total, 'MXN')}`;
                    }
                }
            }
        };
    }

    if (metric === 'cumulative') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const pct = (context.dataset.porcentajes || [])[context.dataIndex];
                        return `${context.parsed.y} pieza(s)`
                            + (pct == null ? '' : ` — ${pct.toFixed(1)} % del total`);
                    }
                }
            }
        };
    }

    if (metric === 'flowVolume') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const pct = (context.dataset.porcentajes || [])[context.dataIndex];
                        return `${context.parsed.y} caso(s)`
                            + (pct == null ? '' : ` — ${pct.toFixed(1)} % de los completados`);
                    }
                }
            }
        };
    }

    // Utilizacion: se muestra rho, su lectura en palabras y el detalle del
    // calculo, porque rho es la metrica que mas se malinterpreta.
    if (metric === 'utilization') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const detalle = (context.dataset.detalle || [])[context.dataIndex];
                        if (!detalle) return `${context.parsed.y.toFixed(1)} %`;

                        const lectura = describirUtilizacion(detalle.utilization);
                        return [
                            `ρ = ${detalle.utilization.toFixed(3)} (${(detalle.utilization * 100).toFixed(1)} %): ${lectura.etiqueta}`,
                            `${detalle.quantity} unidad(es) · ${detalle.busyMinutes} de ${detalle.availableMinutes} min-recurso`
                        ];
                    }
                }
            }
        };
    }

    if (metric === 'paretoCost') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) { label += ': '; }
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') {
                            label += context.parsed.y.toFixed(1) + '%';
                          } else {
                            label += formatCurrency(context.parsed.y, 'MXN');
                          }
                        }
                        return label;
                    }
                }
            }
        };
    }

    if (metric === 'scatter') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const time = formatMinutes(context.parsed.x);
                        const cost = formatCurrency(context.parsed.y, 'MXN');
                        return `${context.chart.data.labels[context.dataIndex]}: (${time}, ${cost})`;
                    }
                }
            }
        };
    }

    // El histograma lleva sus percentiles en el titulo: sin ellos hay que
    // estimar la cola a ojo, que es justo lo que el histograma viene a evitar.
    if (metric === 'cycleHistogram' && chartData.resumen) {
        const r = chartData.resumen;
        options.plugins = {
            ...(options.plugins || {}),
            title: {
                display: true,
                text: `${r.n} casos · p50 ${formatMinutes(r.p50)} · p90 ${formatMinutes(r.p90)}`
                    + ` · p95 ${formatMinutes(r.p95)} · máximo ${formatMinutes(r.max)}`
            }
        };
    }

    return {
      type: chartType,
      data: { labels: chartData.labels, datasets: datasets },
      options: options
    };
  }

  getInputParametersData() {
    const allElements = this._elementRegistry.getAll();
    const elementsWithData = [];
    allElements.forEach(element => {
      if (!isLabel(element) && (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant') || is(element, 'bpmn:Task') || is(element, 'bpmn:StartEvent') || (is(element, 'bpmn:SequenceFlow') && element.source?.type === 'bpmn:ExclusiveGateway'))) {
        const data = getSimulationData(element);
        if (data && Object.keys(data).length > 0) {
          elementsWithData.push({
            id: element.id,
            name: element.businessObject.name || element.id,
            type: element.type,
            data: data
          });
        }
      }
    });
    return elementsWithData;
  }

  createInputParametersTable(data) {
    if (!data || data.length === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No se encontraron elementos con datos de simulación configurados.</p>';
    }

    let tableHtml = `
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Tipo</th>
            <th>Parámetro</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach(element => {
      Object.entries(element.data).forEach(([key, value]) => {
        if (key === 'resourcePools' && Array.isArray(value)) {
           value.forEach(pool => {
              tableHtml += `
                <tr>
                  <td>${element.name}</td>
                  <td>${element.type.replace('bpmn:', '')}</td>
                  <td>resourcePools</td>
                  <td>${pool.name} (Qty: ${pool.quantity})</td>
                </tr>
              `;
           });
        } else if (typeof value !== 'object' || value === null) {
          tableHtml += `
            <tr>
              <td>${element.name}</td>
              <td>${element.type.replace('bpmn:', '')}</td>
              <td>${key}</td>
              <td>${JSON.stringify(value)}</td>
            </tr>
          `;
        } else {
          Object.entries(value).forEach(([subKey, subValue]) => {
            tableHtml += `
              <tr>
                <td>${element.name}</td>
                <td>${element.type.replace('bpmn:', '')}</td>
                <td>${key}.${subKey}</td>
                <td>${JSON.stringify(subValue)}</td>
              </tr>
            `;
          });
        }
      });
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  createOverallSummary(report, normalReport) {
    // Solo se acumulan campos que el motor ESCRIBE de verdad. Antes se leian
    // aqui `totalReworkCost`, `totalOvertimeCost` y `totalNormalTimeCost`, que
    // SimulationEngine.initialize no crea y nadie acumula: el `|| 0` los
    // convertia en tres tarjetas que mostraban siempre $0.00.
    let totalCost = 0, totalFailures = 0, totalReworkTime = 0, totalOvertimeMs = 0,
        totalDoubleOvertimeCost = 0, totalTripleOvertimeCost = 0,
        totalOperationCost = 0, totalWaitTimeCost = 0, totalExternalCost = 0;

    // console.log('--- SUMMARY DATA ---');
    // console.log('Overtime Report:', report);
    // console.log('Normal Report:', normalReport);


    report.results.forEach(result => {
      totalCost += result.totalCost || 0;
      totalFailures += result.failureCount || 0;
      totalReworkTime += result.totalReworkTime || 0;
      totalOvertimeMs += result.totalOvertime || 0;
      totalDoubleOvertimeCost += result.totalDoubleOvertimeCost || 0;
      totalTripleOvertimeCost += result.totalTripleOvertimeCost || 0;
      totalOperationCost += result.totalOperationCost || 0;
      totalExternalCost += result.totalExternalCost || 0;
      totalWaitTimeCost += result.totalWaitTimeCost || 0;
    });

    // Nómina contra facturas. Se calcula restando para no cambiar el significado de
    // `totalOperationCost`, que ya lo leen el informe y esta misma rejilla.
    const totalNomina = totalOperationCost - totalExternalCost;

    const totalPrimasExtra = totalDoubleOvertimeCost + totalTripleOvertimeCost;
    const sumaComponentes = totalOperationCost + totalPrimasExtra + totalWaitTimeCost;

    const totalTimeDays = report.totalWorkingDays;
    const totalTimeHours = (report.calendarDuration / (1000 * 60 * 60)).toFixed(2);
    const overtimePercentage = report.calendarDuration > 0
      ? ((totalOvertimeMs / report.calendarDuration) * 100).toFixed(1)
      : 0;

    // --- ventana de tiempo, contada en los DOS relojes ---
    // El bloque va PRIMERO en el resumen porque es la pregunta que se hace antes
    // que ninguna: «si produzco 1000 piezas, ¿cuándo termino?». Y hay que dar las
    // dos respuestas, porque «12 días» significa cosas distintas según el reloj:
    // 12 días trabajados (lo que se paga) o 12 días de calendario (lo que tarda
    // en llegar la fecha). Confundirlos es el error más fácil de cometer.
    const fechaHora = (d) => d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '(sin fecha)';
    const soloFecha = (d) => d instanceof Date && !Number.isNaN(d.getTime())
      ? d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : '(sin fecha)';

    const diasLab = report.totalWorkingDays;
    const diasNat = report.diasNaturales;
    // Dias NO laborables dentro de la ventana: la diferencia entre los dos
    // relojes, y lo que explica por que el trabajo se estira mas alla del
    // calendario laboral.
    const diasNoLaborables = (diasNat != null && diasLab != null) ? Math.max(0, diasNat - diasLab) : null;
    const horasTrabajadasAlDia = (diasLab > 0) ? (report.calendarDuration / (1000 * 60 * 60)) / diasLab : 0;

    const bloqueTiempo = `
      <div class="sim-ventana">
        <h3>¿Cuándo termina?</h3>
        <table class="sim-ventana-tabla">
          <tr>
            <th>Empieza</th>
            <td><strong>${fechaHora(report.inicio)}</strong>
              <span class="sub">${soloFecha(report.inicio)}</span></td>
          </tr>
          <tr>
            <th>Termina</th>
            <td><strong>${fechaHora(report.fin)}</strong>
              <span class="sub">${soloFecha(report.fin)}</span></td>
          </tr>
          <tr class="destacado">
            <th>Días laborables</th>
            <td><strong>${diasLab}</strong>
              <span class="sub">lo que se trabaja y se paga (jornada completa de la planta)</span></td>
          </tr>
          <tr class="destacado">
            <th>Días naturales</th>
            <td><strong>${diasNat == null ? '—' : diasNat}</strong>
              <span class="sub">lo que tarda en llegar la fecha, contando fines de semana y festivos</span></td>
          </tr>
          ${diasNoLaborables ? `
            <tr>
              <th>Días no laborables</th>
              <td><strong>${diasNoLaborables}</strong>
                <span class="sub">fines de semana y festivos dentro de la ventana: la diferencia entre los dos relojes</span></td>
            </tr>` : ''}
          <tr>
            <th>Horas netas de trabajo</th>
            <td><strong>${totalTimeHours} h</strong>
              <span class="sub">${horasTrabajadasAlDia.toFixed(2)} h al día de media, en los ${diasLab} días laborables</span></td>
          </tr>
        </table>
        <p class="sim-nota">
          <strong>Los dos contadores NO son intercambiables.</strong> «${diasLab} días laborables» es lo que se trabaja
          (${totalTimeHours} h netas); «${diasNat == null ? '—' : diasNat} días naturales» es lo que tarda en llegar la fecha
          del final, porque en medio hay fines de semana y festivos en los que la planta no trabaja. Si tu pregunta es
          <em>«¿cuándo le entrego al cliente?»</em>, la respuesta es la segunda. Si es <em>«¿cuánto le voy a pagar a la
          plantilla?»</em>, la primera.
        </p>
      </div>
    `;

    // --- los DOS planes, frente a frente -------------------------------------
    //
    // El informe del plan normal se calculaba y se tiraba: llegaba a este metodo como
    // parametro y no se usaba para nada. Aqui se le da salida, porque la comparacion es
    // la pregunta de verdad: «si abro horas extra, ¿cuanto mas pago y cuanto antes
    // entrego?». Las dos mitades juntas o el resumen empuja a decidir a medias.
    const cmp = compararPlanes(normalReport, report);
    const notas = notasDeEficiencia(cmp);

    const fechas = fechasUnidas(normalReport, report);
    const serieNormal = serieAcumulada(normalReport, fechas);
    const serieExtra = serieAcumulada(report, fechas);
    const techo = techoComun(serieNormal, serieExtra);

    const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
    const bloquePlanes = `
      <div class="sim-planes">
        <h3>Los dos planes, frente a frente</h3>
        <p class="sim-planes-intro">
          Las dos simulaciones son <strong>una sola corrida con el mismo azar</strong>, así que la diferencia
          entre estos dos escenarios se debe al plan y no a la suerte. No hay que ejecutar nada dos veces.
        </p>
        <div class="sim-planes-grid">
          <div class="plan-card plan-normal">
            <span class="plan-nombre">Plan normal (sin extras)</span>
            <span class="plan-dato">${dias(cmp.plazo.normalDias)}</span>
            <span class="plan-sub">${cmp.piezas.normal} piezas · ${formatCurrency(cmp.coste.normal, 'MXN')}</span>
          </div>
          <div class="plan-card plan-extra">
            <span class="plan-nombre">Plan con horas extra</span>
            <span class="plan-dato">${dias(cmp.plazo.extraDias)}</span>
            <span class="plan-sub">${cmp.piezas.extra} piezas · ${formatCurrency(cmp.coste.extra, 'MXN')}</span>
          </div>
          <div class="plan-card plan-delta">
            <span class="plan-nombre">Diferencia</span>
            <span class="plan-dato">${cmp.coste.delta >= 0 ? '+' : '−'}${enPorcentaje(cmp.coste.deltaPct)} coste</span>
            <span class="plan-sub">${cmp.plazo.adelanta ? '−' : '+'}${enPorcentaje(cmp.plazo.ahorroPct)} plazo</span>
          </div>
        </div>
        <ul class="sim-notas">
          ${notas.map((n) => `<li class="nota-${n.nivel}">${n.texto}</li>`).join('')}
        </ul>
      </div>
    `;

    const bloqueGraficos = fechas.length > 1 ? `
      <div class="sim-graficos">
        <h3>Producción acumulada: cuándo se entrega cada plan</h3>
        <p class="sim-graficos-intro">
          Los dos gráficos comparten <strong>fechas y escala</strong>. Es lo que permite compararlos de un
          vistazo: con un eje ajustado a cada uno, el plan lento se dibujaría igual de alto que el rápido.
        </p>
        <div class="sim-graficos-par">
          <div>${svgAcumulada({
            titulo: `Plan normal — ${cmp.piezas.normal} piezas en ${dias(cmp.plazo.normalDias)}`,
            series: serieNormal, fechas, techo, color: COLOR_PLAN.normal
          })}</div>
          <div>${svgAcumulada({
            titulo: `Plan con horas extra — ${cmp.piezas.extra} piezas en ${dias(cmp.plazo.extraDias)}`,
            series: serieExtra, fechas, techo, color: COLOR_PLAN.extra
          })}</div>
        </div>
      </div>
    ` : '';

    return `
      <div class="sim-summary-container">
        <h2>Resumen General</h2>
        ${bloqueTiempo}
        ${bloquePlanes}
        ${bloqueGraficos}
        <h3 class="sim-detalle-titulo">Detalle del plan con horas extra</h3>
        <div class="sim-summary-grid">
          <div class="sim-summary-item">
            <span class="label">Piezas Producidas:</span>
            <span class="value">${report.completedInstances}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Total de Errores:</span>
            <span class="value">${totalFailures}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Tiempo Total (Horas Netas):</span>
            <span class="value">${totalTimeHours}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Tiempo de Reparación Total:</span>
            <span class="value">${formatMilliseconds(totalReworkTime)}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Total de Horas Extra:</span>
            <span class="value">${formatMilliseconds(totalOvertimeMs)}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Total:</span>
            <span class="value">${formatCurrency(totalCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo de Operación (base):</span>
            <span class="value">${formatCurrency(totalOperationCost, 'MXN')}</span>
          </div>
          ${totalExternalCost > 0 ? `
          <div class="sim-summary-item">
            <span class="label">· de eso, NÓMINA (tu plantilla):</span>
            <span class="value">${formatCurrency(totalNomina, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">· y FACTURAS de proveedores:</span>
            <span class="value">${formatCurrency(totalExternalCost, 'MXN')}</span>
          </div>` : ''}
          <div class="sim-summary-item">
            <span class="label">Primas de Horas Extra (doble + triple):</span>
            <span class="value">${formatCurrency(totalPrimasExtra, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Horas Extras Dobles:</span>
            <span class="value">${formatCurrency(totalDoubleOvertimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Horas Extras Triples:</span>
            <span class="value">${formatCurrency(totalTripleOvertimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo de Espera de Recursos:</span>
            <span class="value">${formatCurrency(totalWaitTimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Porcentaje de Tiempo Extra:</span>
            <span class="value">${overtimePercentage}%</span>
          </div>
        </div>
        <p class="sim-summary-note">
          Comprobación: operación + primas + espera =
          <strong>${formatCurrency(sumaComponentes, 'MXN')}</strong>
          ${Math.abs(sumaComponentes - totalCost) < 0.01
            ? '— coincide con el Costo Total.'
            : `— NO coincide con el Costo Total (${formatCurrency(totalCost, 'MXN')}).`}
          ${totalExternalCost > 0
            ? ` De la operación, <strong>${formatCurrency(totalNomina, 'MXN')}</strong> es nómina y`
              + ` <strong>${formatCurrency(totalExternalCost, 'MXN')}</strong> son facturas de proveedores.`
              + ' A los proveedores no se les suman primas de la LFT: su factura es su precio.'
            : ''}
        </p>
      </div>
    `;
  }

  createResultsTable(results) {
    if (!results || results.size === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles. Por favor, ejecute una simulación primero.</p>';
    }

    let tableHtml = `
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Ejecuciones</th>
            <th>Fallos</th>
            <th>Espera Total</th>
            <th>Proceso Total</th>
            <th>Costo Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    results.forEach(result => {
      if (result.executionCount > 0 || result.totalCost > 0 || result.totalProcessingTime > 0) {
        tableHtml += `
          <tr>
            <td>${result.name}</td>
            <td>${result.executionCount}</td>
            <td>${result.failureCount}</td>
            <td>${formatMinutes(result.totalWaitTime)}</td>
            <td>${formatMilliseconds(result.totalProcessingTime)}</td>
            <td>${formatCurrency(result.totalCost, 'MXN')}</td>
          </tr>
        `;
      }
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  /**
   * Produccion diaria ordenada por dia: [{ dia, piezas }].
   *
   * El mapa del motor viene con claves "AAAA-MM-DD" y NO en orden garantizado
   * (se insertan segun se completan los casos), asi que se ordena siempre. Sin
   * esto, la curva acumulada saldria en zigzag.
   */
  _produccionDiaria(report) {
    const mapa = (report && report.dailyCompletions) || new Map();
    return Array.from(mapa.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([dia, piezas]) => ({ dia, piezas }));
  }

  /**
   * Desglose del costo por tarea, ordenado de mayor a menor.
   *
   * La suma de los cuatro componentes coincide con `totalCost` (asi lo acumula el
   * motor), de modo que la altura de la barra apilada ES el costo total: no hay
   * una barra "total" aparte que pueda contradecir al monton.
   */
  _costoPorTarea(report, max) {
    const tareas = [];
    (report ? report.results : new Map()).forEach((r, id) => {
      const el = this._elementRegistry.get(id);
      if (!el || isLabel(el) || !is(el, 'bpmn:Task')) return;

      const operacion = r.totalOperationCost || 0;
      const doble = r.totalDoubleOvertimeCost || 0;
      const triple = r.totalTripleOvertimeCost || 0;
      const espera = r.totalWaitTimeCost || 0;

      tareas.push({
        name: nombreElemento(el),
        operacion, doble, triple, espera,
        total: operacion + doble + triple + espera
      });
    });

    tareas.sort((a, b) => b.total - a.total);
    return tareas.slice(0, max || 8);
  }

  /** Volumen por camino: casos que pasaron por cada flujo del diagrama. */
  _volumenPorCamino(report, max) {
    const caminos = [];
    (report ? report.results : new Map()).forEach((r, id) => {
      const el = this._elementRegistry.get(id);
      if (!el || isLabel(el) || !is(el, 'bpmn:SequenceFlow')) return;
      if (!r.executionCount) return;

      caminos.push({
        name: `${nombreElemento(el.source)} → ${nombreElemento(el.target)}`,
        total: r.executionCount
      });
    });

    caminos.sort((a, b) => b.total - a.total);
    return caminos.slice(0, max || 12);
  }

  /** Utilizacion por piscina, de mayor a menor (lo primero que hay que mirar). */
  _utilizacion(report) {
    const mapa = (report && report.utilization) || new Map();
    return Array.from(mapa.values()).sort((a, b) => b.utilization - a.utilization);
  }

  /**
   * Comparativa de costos por componente entre los dos planes.
   *
   * Se comparan los cuatro componentes mas el total, y NO las piezas: mezclar
   * pesos y unidades en el mismo grafico no se puede leer.
   */
  _comparativaCostos() {
    const suma = (report, campo) => {
      let t = 0;
      (report ? report.results : new Map()).forEach((r) => { t += r[campo] || 0; });
      return t;
    };
    const componentes = (report) => ([
      suma(report, 'totalOperationCost'),
      suma(report, 'totalDoubleOvertimeCost'),
      suma(report, 'totalTripleOvertimeCost'),
      suma(report, 'totalWaitTimeCost')
    ]);
    const cerrar = (v) => v.concat([v.reduce((a, b) => a + b, 0)]);

    return {
      labels: ['Operación', 'Prima doble', 'Prima triple', 'Espera', 'Costo total'],
      normal: cerrar(componentes(this.normalReport)),
      overtime: cerrar(componentes(this.overtimeReport))
    };
  }

  getChartData(metric) {
    if (metric === 'dailyProduction') {
      if (!this.normalReport) {
        return { labels: [], datasets: [] };
      }
      const report = this.normalReport;
      const dailyData = report.dailyCompletions;

      if (!dailyData || dailyData.size === 0) {
        return { labels: [], datasets: [] };
      }

      const sortedDailyData = Array.from(dailyData.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));
      const labels = sortedDailyData.map(entry => entry[0]);
      const data = sortedDailyData.map(entry => entry[1]);

      return {
        labels,
        datasets: [{
          label: 'Piezas Completadas por Día',
          data: data,
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        }]
      };
    }

    // Run chart: la produccion diaria en LINEA, con la media de referencia. La
    // barra compara dias entre si; la linea deja ver el arranque (transitorio) y
    // si el ritmo se estabiliza, que es lo que se quiere saber.
    //
    // SIN SUAVIZADO: la produccion de un dia es un valor POR DIA, no una curva
    // continua. El suavizado dibuja subidas y bajadas graduales que no existieron
    // (un dia se produjo 5 y el siguiente 8: no hubo un 6,5 a media tarde), y eso
    // oculta justo lo que se mira: si un dia concreto se descolgo.
    if (metric === 'dailyRun') {
      const dias = this._produccionDiaria(this.normalReport);
      const media = dias.length ? dias.reduce((a, d) => a + d.piezas, 0) / dias.length : 0;

      return {
        labels: dias.map((d) => d.dia),
        datasets: [
          {
            type: 'line',
            label: 'Piezas completadas',
            data: dias.map((d) => d.piezas),
            borderColor: 'rgba(21, 101, 192, 1)',
            backgroundColor: 'rgba(21, 101, 192, .15)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0,
            fill: true
          },
          {
            type: 'line',
            label: `Media (${media.toFixed(1)}/día)`,
            data: dias.map(() => media),
            borderColor: 'rgba(198, 40, 40, .85)',
            borderWidth: 1,
            borderDash: [ 6, 4 ],
            pointRadius: 0,
            fill: false
          }
        ]
      };
    }

    // Curva S: el avance acumulado. Responde "cuando lleve el 50 %/90 % del
    // trabajo", que es la pregunta de planificacion, no "cuanto hice el martes".
    //
    // ESCALONES, y no es un detalle estetico: la produccion acumulada sube a
    // saltos (el alto del escalon es lo que entro ese dia) y se queda PLANA entre
    // ellos. Dibujarla suavizada inventa un avance continuo que no ocurre, y con
    // lotes el escalon es literalmente el tamano del lote. El tramo plano es el
    // dato mas util del grafico —el hueco entre lotes— y el suavizado lo borra.
    if (metric === 'cumulative') {
      const dias = this._produccionDiaria(this.normalReport);
      let acumulado = 0;
      const datos = dias.map((d) => (acumulado += d.piezas));
      const total = acumulado;

      return {
        labels: dias.map((d) => d.dia),
        datasets: [{
          type: 'line',
          label: 'Piezas acumuladas',
          data: datos,
          borderColor: 'rgba(46, 125, 50, 1)',
          backgroundColor: 'rgba(46, 125, 50, .15)',
          borderWidth: 2,
          pointRadius: 0,
          // `stepped: 'before'` mantiene el valor anterior HASTA que entra el
          // nuevo, que es como se lee una acumulacion: primero se produce, luego
          // el contador sube.
          stepped: 'before',
          tension: 0,
          fill: true,
          // El % viaja con el dato para que el tooltip no repita la division.
          porcentajes: total > 0 ? datos.map((v) => (v / total) * 100) : []
        }]
      };
    }

    const tasks = [];

    if (metric === 'resourceQuantity') {
        this._elementRegistry.forEach(element => {
            if (is(element, 'bpmn:Task') && !isLabel(element)) {
                const data = getSimulationData(element);
                const value = (data && data.resources && data.resources.quantityRequired) || 0;
                tasks.push({ name: element.businessObject.name || element.id, value: value });
            }
        });
    } else {
        this.simulationResults.forEach((result, elementId) => {
            const element = this._elementRegistry.get(elementId);
            if (element && is(element, 'bpmn:Task') && !isLabel(element)) {
                tasks.push({ ...result, name: element.businessObject.name || element.id });
            }
        });
    }

    if (metric === 'scatter') {
        const scatterData = tasks.map(t => ({
            // /60000: de milisegundos a minutos, la unidad del eje.
            x: t.totalProcessingTime / (t.executionCount || 1) / 60000,
            y: t.totalCost
        }));
        return { data: scatterData, labels: tasks.map(t => t.name), label: 'Tiempo de Proceso vs. Costo' };
    }

    if (metric === 'pareto') {
        const failedTasks = tasks.filter(t => t.failureCount > 0);
        failedTasks.sort((a, b) => b.failureCount - a.failureCount);

        const labels = failedTasks.map(t => t.name);
        const failureData = failedTasks.map(t => t.failureCount);
        const totalFailures = failureData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = failureData.map(count => {
            cumulative += count;
            return totalFailures > 0 ? (cumulative / totalFailures) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Número de Fallos',
                    data: failureData,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    if (metric === 'paretoCost') {
        const costTasks = tasks.filter(t => t.totalCost > 0);
        costTasks.sort((a, b) => b.totalCost - a.totalCost);

        const labels = costTasks.map(t => t.name);
        const costData = costTasks.map(t => t.totalCost);
        const totalCostValue = costData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = costData.map(count => {
            cumulative += count;
            return totalCostValue > 0 ? (cumulative / totalCostValue) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Costo Total',
                    data: costData,
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    if (metric === 'paretoTime') {
        const timedTasks = tasks.filter(t => t.totalProcessingTime > 0);
        timedTasks.sort((a, b) => b.totalProcessingTime - a.totalProcessingTime);

        const labels = timedTasks.map(t => t.name);
        // totalProcessingTime esta en MILISEGUNDOS; el eje del Pareto de tiempos
        // esta rotulado en minutos, asi que se convierte aqui.
        const timeData = timedTasks.map(t => t.totalProcessingTime / 60000);
        const totalTime = timeData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = timeData.map(count => {
            cumulative += count;
            return totalTime > 0 ? (cumulative / totalTime) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Tiempo de Proceso Total',
                    data: timeData,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    // Costo APILADO por tarea: operacion + primas + espera. Responde "por que es
    // caro eso", que una barra de total no responde. La altura del monton es el
    // costo total, asi que no hace falta una barra de total aparte.
    if (metric === 'cost') {
      const t = this._costoPorTarea(this.overtimeReport, 8);
      const capa = (etiqueta, color, campo) => ({
        type: 'bar',
        label: etiqueta,
        data: t.map((x) => x[campo]),
        backgroundColor: color,
        stack: 'costo'
      });

      return {
        labels: t.map((x) => x.name),
        datasets: [
          capa('Operación', 'rgba(21, 101, 192, .75)', 'operacion'),
          capa('Prima doble', 'rgba(255, 159, 64, .85)', 'doble'),
          capa('Prima triple', 'rgba(198, 40, 40, .8)', 'triple'),
          capa('Espera', 'rgba(117, 117, 117, .7)', 'espera')
        ]
      };
    }

    if (metric === 'costCompare') {
      const c = this._comparativaCostos();
      return {
        labels: c.labels,
        datasets: [
          {
            type: 'bar',
            label: 'Plan normal',
            data: c.normal,
            backgroundColor: 'rgba(54, 162, 235, .6)',
            borderColor: 'rgba(54, 162, 235, 1)'
          },
          {
            type: 'bar',
            label: 'Plan con horas extra',
            data: c.overtime,
            backgroundColor: 'rgba(255, 159, 64, .6)',
            borderColor: 'rgba(255, 159, 64, 1)'
          }
        ]
      };
    }

    // Pareto de esperas: el Pareto del CUELLO DE BOTELLA. Las tareas que se llevan
    // la mayor parte de la espera son las que hay que atacar primero.
    if (metric === 'paretoWait') {
      const conEspera = tasks.filter((t) => t.totalWaitTime > 0);
      conEspera.sort((a, b) => b.totalWaitTime - a.totalWaitTime);

      const labels = conEspera.map((t) => t.name);
      const datos = conEspera.map((t) => t.totalWaitTime);
      const total = datos.reduce((a, b) => a + b, 0);

      let acumulado = 0;
      const pct = datos.map((v) => {
        acumulado += v;
        return total > 0 ? (acumulado / total) * 100 : 0;
      });

      return {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Tiempo de espera (min)',
            data: datos,
            backgroundColor: 'rgba(255, 99, 132, .25)',
            borderColor: 'rgba(255, 99, 132, 1)',
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Porcentaje acumulado',
            data: pct,
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, .2)',
            fill: false,
            yAxisID: 'y1'
          }
        ]
      };
    }

    // Volumen por camino. Sustituye al Sankey: para ANALIZAR, una barra ordenada
    // se lee mejor y no necesita dependencias; el diagrama BPMN ya dibuja la red.
    if (metric === 'flowVolume') {
      const caminos = this._volumenPorCamino(this.overtimeReport, 12);
      const casos = this.overtimeReport ? this.overtimeReport.completedInstances : 0;

      return {
        labels: caminos.map((c) => c.name),
        datasets: [{
          type: 'bar',
          label: 'Casos que pasaron',
          data: caminos.map((c) => c.total),
          backgroundColor: 'rgba(21, 101, 192, .55)',
          borderColor: 'rgba(21, 101, 192, 1)',
          porcentajes: casos > 0 ? caminos.map((c) => (c.total / casos) * 100) : []
        }]
      };
    }

    // Distribucion del tiempo de ciclo: la media esconde la cola.
    if (metric === 'cycleHistogram') {
      const muestras = (this.overtimeReport && this.overtimeReport.cycleTimes) || [];
      const h = histograma(muestras, 14);
      const res = resumenMuestras(muestras);

      return {
        labels: h.etiquetas,
        datasets: [{
          type: 'bar',
          label: 'Casos',
          data: h.conteos,
          backgroundColor: 'rgba(21, 101, 192, .55)',
          borderColor: 'rgba(21, 101, 192, 1)'
        }],
        // El resumen viaja con los datos para que el titulo del grafico muestre
        // los percentiles: un histograma sin ellos obliga a estimarlos a ojo.
        resumen: res
      };
    }

    // Utilizacion (rho) por piscina. Es LA metrica de capacidad.
    if (metric === 'utilization') {
      const u = this._utilizacion(this.overtimeReport);

      return {
        labels: u.map((x) => x.name),
        datasets: [
          {
            type: 'bar',
            label: 'Utilización (ρ)',
            data: u.map((x) => x.utilization * 100),
            // Color por tramo: el mismo criterio que describirUtilizacion().
            backgroundColor: u.map((x) => (x.utilization >= 0.9
              ? 'rgba(198, 40, 40, .7)'
              : x.utilization >= 0.8 ? 'rgba(249, 168, 37, .75)' : 'rgba(46, 125, 50, .65)')),
            borderColor: 'rgba(0, 0, 0, .2)',
            detalle: u
          },
          {
            type: 'line',
            label: 'Límite de capacidad (100 %)',
            data: u.map(() => 100),
            borderColor: 'rgba(198, 40, 40, .85)',
            borderWidth: 1,
            borderDash: [ 6, 4 ],
            pointRadius: 0,
            fill: false
          }
        ]
      };
    }

    let dataProperty, label;
    if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso Total'; }
    else if (metric === 'waitTime') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'allWaitTimes') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'resourceQuantity') { dataProperty = 'value'; label = 'Cantidad de Recursos por Tarea'; }
    else if (metric === 'overtime') { dataProperty = 'totalOvertime'; label = 'Tiempo Extra Total'; }
    else if (metric === 'reworkTime') { dataProperty = 'totalReworkTime'; label = 'Tiempo de Reparación Total'; }
    else if (metric === 'waitTimeCost') { dataProperty = 'totalWaitTimeCost'; label = 'Costo de Espera Total'; }

    tasks.sort((a, b) => b[dataProperty] - a[dataProperty]);

    const chartTasks = metric === 'allWaitTimes'
        ? tasks.filter(t => t[dataProperty] > 0)
        : tasks.filter(t => t[dataProperty] > 0).slice(0, 5);

    const labels = chartTasks.map(t => t.name);

    // Normalizacion de unidades: las metricas de tiempo se pasan a MINUTOS para
    // que coincidan con el rotulo del eje. El resto se deja tal cual.
    const tiempo = METRICAS_TIEMPO[metric];
    const data = chartTasks.map(t => (tiempo ? t[dataProperty] * tiempo.factor : t[dataProperty]));

    return { data, labels, label };
  }

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this.simulationReports = [];
    this.clearOverlaysAndHeatmap();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  clearOverlaysAndHeatmap() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    // Los trazos de la vista de estructura se van con el mapa: si quedaran, cambiar
    // de metrica dejaria las lineas pintadas de una lectura que ya no es la activa.
    this._limpiarFlujos();
    // Y las celdas del mapa de zonas, por lo mismo.
    this._limpiarZonas();
    const contenedor = this._canvas.getContainer();
    domClasses(contenedor).remove('heatmap-shown');
    const leyenda = contenedor.querySelector('.heatmap-legend');
    if (leyenda) leyenda.remove();
    this._overlays.remove({ type: 'simulation-overlay' });
  }

  createHeatmap() {
    if (this._heatmap) return;
    this._heatmap = new SimpleHeatSVG(this._canvas);
    domClasses(this._canvas.getContainer()).add('heatmap-shown');
  }

  showPlanBreakdown() {
    if (!this.normalReport || !this.overtimeReport) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero.', type: 'warning', duration: 4000 });
        return;
    }

    const aggregateReportCosts = (report) => {
      let totalOperationCost = 0;
      let totalDoubleOvertimeCost = 0;
      let totalTripleOvertimeCost = 0;

      report.results.forEach(r => {
        totalOperationCost += r.totalOperationCost || 0;
        totalDoubleOvertimeCost += r.totalDoubleOvertimeCost || 0;
        totalTripleOvertimeCost += r.totalTripleOvertimeCost || 0;
      });

      return { totalOperationCost, totalDoubleOvertimeCost, totalTripleOvertimeCost };
    };

    const normalCosts = aggregateReportCosts(this.normalReport);
    const overtimeCosts = aggregateReportCosts(this.overtimeReport);

    const normalPlan = {
      totalDays: this.normalReport.totalWorkingDays,
      totalCost: this.normalReport.totalCost,
      operationCost: normalCosts.totalOperationCost,
      completedInstances: this.normalReport.completedInstances,
      avgCostPerPiece: this.normalReport.completedInstances > 0 ? (this.normalReport.totalCost / this.normalReport.completedInstances) : 0
    };

    const overtimePlan = {
      totalDays: this.overtimeReport.totalWorkingDays,
      totalCost: this.overtimeReport.totalCost,
      operationCost: overtimeCosts.totalOperationCost,
      doublePremium: overtimeCosts.totalDoubleOvertimeCost,
      triplePremium: overtimeCosts.totalTripleOvertimeCost,
      completedInstances: this.overtimeReport.completedInstances,
      avgCostPerPiece: this.overtimeReport.completedInstances > 0 ? (this.overtimeReport.totalCost / this.overtimeReport.completedInstances) : 0
    };

    const helpText = `
      <div class="help-content-container">
        <h4>¿Cómo leer los costos?</h4>
        <ul>
          <li><strong>Costo de Operación:</strong> Es el costo de todo el tiempo trabajado, pagado a tarifa normal. Imagina que es el sueldo base que le pagas a un cocinero por preparar jugos.</li>
          <li><strong>Pago Extra (Doble/Triple):</strong> Es el <strong>bono adicional</strong> que se paga por trabajar fuera del horario. Es el dinero extra que le das al cocinero por quedarse más tiempo.</li>
          <li><strong>Costo Total:</strong> Es la suma de <code>Costo de Operación</code> + todos los <code>Pagos Extras</code>.</li>
        </ul>
        <h4>Ejemplo con Frutas:</h4>
        <p>Quieres hacer 10 jugos de naranja. Cada uno toma 1 hora en prepararse y pagas $10 la hora. Tu jornada normal es de 8 horas.</p>
        <p><strong>Plan Normal:</strong> Tomas 10 horas repartidas en 2 días.</p>
        <ul>
          <li><code>Costo de Operación</code>: 10 horas x $10/hora = $100.</li>
          <li><code>Pago Extra</code>: $0.</li>
          <li><code>Costo Total</code>: $100.</li>
        </ul>
        <p><strong>Plan con Extras:</strong> Trabajas 10 horas seguidas en 1 solo día. Las primeras 8 horas son normales y las últimas 2 son extras que se pagan al doble.</p>
        <ul>
          <li><code>Costo de Operación</code>: 10 horas x $10/hora = $100 (el costo base del trabajo).</li>
          <li><code>Pago Extra (Doble)</code>: 2 horas x ($10/hora de bono) = $20.</li>
          <li><code>Costo Total</code>: $100 (operación) + $20 (extra) = $120.</li>
        </ul>
      </div>
    `;

    const comparisonHtml = `
      <style>
        .plan-comparison-container { display: flex; gap: 20px; justify-content: space-around; }
        .plan-card { border: 1px solid #ccc; border-radius: 8px; padding: 15px; width: 45%; background-color: #f9f9f9; }
        .plan-card h4 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .plan-card .sim-summary-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .plan-card .sim-summary-item:last-child { border-bottom: none; }
        .plan-card .label { font-weight: 500; }
        .plan-card .value { font-weight: bold; }
        .total-cost { font-size: 1.1em; border-top: 2px solid #ccc; margin-top: 10px; padding-top: 10px; }
        .help-icon-button { font-family: monospace; font-weight: bold; cursor: pointer; border: 1px solid #999; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; justify-content: center; align-items: center; font-size: 14px; }
        .hidden-help { display: none; }
      </style>
      <div class="sim-summary-container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2>Comparativo de Planes</h2>
          <span id="plan-comparison-help-icon" class="help-icon-button" title="Ayuda sobre costos">?</span>
        </div>
        <div id="plan-comparison-help-content" class="hidden-help" style="padding: 10px; border: 1px solid #ddd; margin-top: 10px; border-radius: 5px; background: #f0f0f0;">
          ${helpText}
        </div>
        <div class="plan-comparison-container" style="margin-top: 20px;">
          <div class="plan-card">
            <h4>Plan Normal</h4>
            <div class="sim-summary-item">
              <span class="label">Duración (Días Laborales):</span>
              <span class="value">${normalPlan.totalDays}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Piezas Producidas:</span>
              <span class="value">${normalPlan.completedInstances}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo de Operación:</span>
              <span class="value">${formatCurrency(normalPlan.operationCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item total-cost">
              <span class="label">Costo Total:</span>
              <span class="value">${formatCurrency(normalPlan.totalCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo Promedio / Pieza:</span>
              <span class="value">${formatCurrency(normalPlan.avgCostPerPiece, 'MXN')}</span>
            </div>
          </div>
          <div class="plan-card">
            <h4>Plan con Horas Extras</h4>
            <div class="sim-summary-item">
              <span class="label">Duración (Días Laborales):</span>
              <span class="value">${overtimePlan.totalDays}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Piezas Producidas:</span>
              <span class="value">${overtimePlan.completedInstances}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo de Operación:</span>
              <span class="value">${formatCurrency(overtimePlan.operationCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Pago Extra (Doble):</span>
              <span class="value">${formatCurrency(overtimePlan.doublePremium, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Pago Extra (Triple):</span>
              <span class="value">${formatCurrency(overtimePlan.triplePremium, 'MXN')}</span>
            </div>
            <div class="sim-summary-item total-cost">
              <span class="label">Costo Total:</span>
              <span class="value">${formatCurrency(overtimePlan.totalCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo Promedio / Pieza:</span>
              <span class="value">${formatCurrency(overtimePlan.avgCostPerPiece, 'MXN')}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this._eventBus.fire('simulation.modal.show', {
      title: 'Comparativo de Planes',
      html: comparisonHtml
    });

    setTimeout(() => {
      const helpIcon = document.getElementById('plan-comparison-help-icon');
      const helpContent = document.getElementById('plan-comparison-help-content');
      if (helpIcon && helpContent) {
        helpIcon.addEventListener('click', () => {
          helpContent.classList.toggle('hidden-help');
        });
      }
    }, 100);
  }
}

SimulationController.$inject = [
  'canvas',
  'eventBus',
  'simulationPalette',
  'simulationEngine',
  'elementRegistry',
  'overlays',
  'tokenSimulationPalette',
  'notifications',
  'chartPanel',
  'dataTablePanel',
  'matrixLoader'
];

// Jules verification comment 2
