import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';
const HELP_OPEN_CLS = 'help-open';

// Iconos de la cabecera del panel. Material Symbols (Apache 2.0), SVG inline.
// Todos usan fill="currentColor" para heredar el color del boton y funcionar en
// cualquier tema. No usar estilos inline de color: rompen la homogeneidad.
const SummaryIcon = '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>';
const CompareIcon = '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>';
const HelpIcon = '<path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>';
const CloseIcon = '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';

const icon = (path) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;


export default class ChartPanel {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;

    this._init();
  }

  _init() {
    this._container = domify(`
      <div class="${PALETTE_CLS}">
        <div class="header">
          <select class="chart-select">
            <option value="overallSummary">Resumen General</option>
            <option value="dailyProduction">Producción Diaria</option>
            <option value="productionCompare">Análisis de Producción (Normal vs. Extras)</option>
            <option value="inputParams">Parámetros de Entrada (Tabla)</option>
            <option value="resultsTable">Resultados de Simulación (Tabla)</option>
            <option value="cost">Top 5 por Costo</option>
            <option value="processTime">Top 5 por Tiempo de Proceso</option>
            <option value="waitTime">Top 5 por Tiempo de Espera (Recursos)</option>
            <option value="overtime">Top 5 por Tiempo Extra</option>
            <option value="resourceQuantity">Recursos Asignados por Tarea</option>
            <option value="scatter">Diagrama de Dispersión (Tiempo vs. Costo)</option>
            <option value="pareto">Diagrama de Pareto (Fallos)</option>
            <option value="paretoTime">Diagrama de Pareto (Tiempos)</option>
            <option value="paretoCost">Diagrama de Pareto (Costos)</option>
            <option value="allWaitTimes">Tiempos de Espera por Tarea (Completo)</option>
          </select>
          <div class="header-buttons">
            <button class="summary-button" title="Ver Resumen General" data-tip="Resumen General — métricas totales de la simulación">${icon(SummaryIcon)}</button>
            <button class="comparison-button" title="Ver Comparativo de Planes" data-tip="Comparativo de Planes — Plan Normal vs. Horas Extras">${icon(CompareIcon)}</button>
            <button class="help-button" title="Ayuda" data-tip="Ayuda sobre gráficos y tablas">${icon(HelpIcon)}</button>
            <button class="close" title="Cerrar" data-tip="Cerrar el panel" data-tip-pos="left">${icon(CloseIcon)}</button>
          </div>
        </div>
        <div class="content">
          <div class="html-content"></div>
          <!-- Envoltorio con ALTO DEFINIDO. Chart.js (con maintainAspectRatio:false)
               ajusta el canvas al tamano de su contenedor; sin este alto el canvas
               heredaba la relacion 2:1 por defecto y un panel ancho producia un
               grafico desproporcionadamente alto que obligaba a desplazarse. -->
          <div class="canvas-wrap">
            <canvas id="simulationChartCanvas"></canvas>
          </div>
        </div>
        <div class="help-content hidden">
          <h4>Ayuda de Gráficos y Tablas de Simulación</h4>

          <p>
            <strong>El documento completo está en</strong>
            <code>docs/GUIA_SIMULACION.md</code>: teoría, fórmulas, ejemplos numéricos
            resueltos y método de validación. Aquí va lo esencial.
          </p>

          <h5>Cómo se lee un panel</h5>
          <ul>
            <li><strong>Resumen General:</strong> métricas totales de la simulación, con una
              línea de <em>comprobación</em> que verifica que operación + primas + espera
              cuadra con el coste total.</li>
            <li><strong>Top 5 por…:</strong> las cinco tareas con el valor más alto. Las
              métricas de tiempo se miden en <strong>minutos</strong>.</li>
            <li><strong>Pareto:</strong> ordena de mayor a menor y añade el porcentaje
              acumulado, para aplicar el principio 80/20.</li>
            <li><strong>Dispersión:</strong> tiempo de proceso medio frente a coste, para
              ver qué tareas caras lo son por durar o por otra cosa.</li>
            <li><strong>Producción Diaria / Comparativa:</strong> piezas terminadas por día,
              plan normal frente a plan con horas extra.</li>
          </ul>

          <h5>Tres cosas que conviene tener claras</h5>
          <ol>
            <li>
              <strong>La tasa de llegada es una tasa, no un intervalo.</strong>
              <code>60</code> con unidad <code>minute</code> son <em>60 por minuto</em>,
              o sea una cada segundo — no una cada 60 minutos. El informe de la consola
              la imprime ya resuelta («una cada 1.0 s»).
            </li>
            <li>
              <strong>Tiempo de reloj ≠ tiempo de trabajo.</strong> Una tarea de 2 h que
              empieza un lunes a las 16:00 termina el martes a las 10:00: 2 h de trabajo y
              18 h de reloj. El mapa de calor muestra <em>trabajo</em>; la fecha de fin es
              de <em>reloj</em>.
            </li>
            <li>
              <strong>La utilidad de horas extra depende del cupo semanal.</strong>
              El límite de horas antes de recargo se aplica <em>por semana ISO</em>. Repartir
              la carga entre semanas paga menos prima que concentrarla, aunque sean las
              mismas horas.
            </li>
          </ol>

          <h5>Interpretar el mapa de calor</h5>
          <ul>
            <li><strong>Tiempo de espera</strong> es la métrica que localiza el cuello de
              botella: la tarea que brilla ahí son recursos que no dan abasto.</li>
            <li>Una mancha con la opacidad mínima significa <strong>valor cero</strong>, no
              «sin analizar»: se contabilizó y dio cero.</li>
            <li>Solo se colorean <strong>tareas y compuertas</strong>.</li>
          </ul>

          <h5>Antes de decidir con estos números</h5>
          <p>
            Con distribución <em>fija</em> y sin fallos el modelo es <strong>determinista</strong>
            y los resultados se pueden recalcular a mano: valide así primero. Con
            distribuciones aleatorias, cada corrida es <strong>una sola réplica</strong>: el
            plugin no usa semilla fija, ni réplicas, ni intervalos de confianza, así que una
            diferencia entre escenarios puede ser ruido. Repita la corrida varias veces antes
            de dar por buena una diferencia.
          </p>
        </div>
        <div class="generic-modal-overlay hidden">
            <div class="generic-modal">
                <div class="generic-modal-header">
                    <h3 id="generic-modal-title"></h3>
                    <button class="close-modal" title="Cerrar" data-tip="Cerrar" data-tip-pos="left">${icon(CloseIcon)}</button>
                </div>
                <div class="generic-modal-content"></div>
            </div>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.helpButton = this._container.querySelector('button.help-button');
    this.summaryButton = this._container.querySelector('button.summary-button');
    this.comparisonButton = this._container.querySelector('button.comparison-button');
    this.helpContent = this._container.querySelector('.help-content');
    this.chartSelect = this._container.querySelector('select.chart-select');
    this.content = this._container.querySelector('.content');
    this.canvas = this._container.querySelector('#simulationChartCanvas');
    this.canvasWrap = this._container.querySelector('.canvas-wrap');
    this.modalOverlay = this._container.querySelector('.generic-modal-overlay');
    this.modalClose = this._container.querySelector('.generic-modal .close-modal');

    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));
    domEvent.bind(this.helpButton, 'click', () => this.toggleHelp());
    domEvent.bind(this.summaryButton, 'click', () => this._eventBus.fire('simulation.summary.requested'));
    domEvent.bind(this.comparisonButton, 'click', () => this._eventBus.fire('simulation.comparison.requested'));

    domEvent.bind(this.modalClose, 'click', () => this.showModal(false));
    domEvent.bind(this.modalOverlay, 'click', (event) => {
        if (event.target === this.modalOverlay) this.showModal(false);
    });

    domEvent.bind(this.chartSelect, 'change', (e) => {
        this._eventBus.fire('simulation.charts.opened');
    });

    this._eventBus.on('diagram.destroy', () => this.hide());
    this._eventBus.on('simulation.modal.show', (event) => this.showModal(true, event.title, event.html));
  }

  getChartType() {
    return this.chartSelect.value;
  }

  getCanvas() {
    return this.canvas;
  }

  showHtmlContent(html) {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = html;
    domClasses(this.canvas).add('hidden');
    // Se oculta tambien el envoltorio: si no, dejaria un hueco vacio debajo de
    // la tabla. Y se sale del modo grafico, para que el panel vuelva a ajustar
    // su alto al contenido.
    domClasses(this.canvasWrap).add('hidden');
    domClasses(this._container).remove('chart-mode');
    domClasses(htmlContent).remove('hidden');
  }

  showCanvas() {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = ''; // Clear it
    domClasses(this.canvas).remove('hidden');
    domClasses(this.canvasWrap).remove('hidden');
    // Modo grafico: fija el alto del panel para que el canvas tenga contra que
    // repartir el espacio (ver .chart-mode en simulation.css).
    domClasses(this._container).add('chart-mode');
    domClasses(htmlContent).add('hidden');
  }

  showModal(show, title = '', html = '') {
      if (show) {
          const titleEl = this.modalOverlay.querySelector('#generic-modal-title');
          const contentEl = this.modalOverlay.querySelector('.generic-modal-content');

          titleEl.textContent = title;
          contentEl.innerHTML = html;
          domClasses(this.modalOverlay).remove('hidden');
      } else {
          domClasses(this.modalOverlay).add('hidden');
      }
  }

  isOpen() {
    return domClasses(this._container).has(PALETTE_OPEN_CLS);
  }

  toggle(open) {
    const shouldOpen = (open !== undefined) ? open : !this.isOpen();

    if (shouldOpen) {
      domClasses(this._container).add(PALETTE_OPEN_CLS);
      this._eventBus.fire('simulation.charts.opened');
    } else {
      domClasses(this._container).remove(PALETTE_OPEN_CLS);
      this._eventBus.fire('simulation.charts.closed');
    }
  }

  toggleHelp() {
    domClasses(this.helpContent).toggle('hidden');
    domClasses(this.content).toggle('hidden');
  }

  hide() {
    this.toggle(false);
  }

  show() {
    this.toggle(true);
  }
}

ChartPanel.$inject = [ 'canvas', 'eventBus' ];
