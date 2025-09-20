import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';
const HELP_OPEN_CLS = 'help-open';

const HelpIcon = '<path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zm1,15h-2v-2h2v2zm0,-4h-2V7h2v6z"/>';
const ClockIcon = '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7-.8 1.3z" style="fill: #1565c0;" />';
const DollarIcon = '<path d="M11.8,10.9c-2.27-.59-3-1.2-3-2.15c0-1.09,1.01-1.85,2.7-1.85c1.78,0,2.44,0.85,2.5,2.1h-2.21c-0.07-0.55-0.47-0.9-1.09-0.9c-0.64,0-1.02,0.45-1.02,1c0,0.68,0.52,1,2.5,1.5c2.9,0.75,3.5,1.55,3.5,2.5c0,1.23-1.05,2.2-2.9,2.2c-1.95,0-2.86-0.93-2.96-2.14h2.21c0.07,0.59,0.57,1.04,1.29,1.04c0.75,0,1.22-0.45,1.22-1.14c0-0.74-0.63-1.15-2.5-1.63Z" />';


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
            <button class="summary-button" title="Ver Resumen General"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ClockIcon}</svg></button>
            <button class="comparison-button" title="Ver Comparativo de Planes"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${DollarIcon}</svg></button>
            <button class="help-button" title="Ayuda"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${HelpIcon}</svg></button>
            <button class="close" title="Cerrar">×</button>
          </div>
        </div>
        <div class="content">
          <div class="html-content"></div>
          <canvas id="simulationChartCanvas"></canvas>
        </div>
        <div class="help-content hidden">
          <h4>Ayuda de Gráficos y Tablas de Simulación</h4>
          <p><strong>Resumen General:</strong> Muestra las métricas totales más importantes de toda la simulación.</p>
        </div>
        <div class="generic-modal-overlay hidden">
            <div class="generic-modal">
                <div class="generic-modal-header">
                    <h3 id="generic-modal-title"></h3>
                    <button class="close-modal" title="Cerrar">×</button>
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
    domClasses(htmlContent).remove('hidden');
  }

  showCanvas() {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = ''; // Clear it
    domClasses(this.canvas).remove('hidden');
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
