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
            <option value="workPlan">Plan de Trabajo (Horas vs. Días)</option>
          </select>
          <div class="header-buttons">
            <button class="schedule-button" title="Ver Cronograma"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ClockIcon}</svg></button>
            <button class="help-button" title="Ayuda"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${HelpIcon}</svg></button>
            <button class="close" title="Cerrar">×</button>
          </div>
        </div>
        <div class="content">
          <div class="chart-wrapper">
            <canvas id="simulationChartCanvas"></canvas>
          </div>
          <div class="html-content"></div>
        </div>
        <div class="help-content hidden">
          <h4>Ayuda de Gráficos y Tablas de Simulación</h4>
          <p><strong>Resumen General:</strong> Muestra las métricas totales más importantes de toda la simulación.</p>
        </div>
        <div class="schedule-modal-overlay hidden">
            <div class="schedule-modal">
                <div class="schedule-modal-header">
                    <h3>Cronograma de Trabajo</h3>
                    <button class="close-modal" title="Cerrar">×</button>
                </div>
                <div class="schedule-modal-content"></div>
            </div>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.helpButton = this._container.querySelector('button.help-button');
    this.scheduleButton = this._container.querySelector('button.schedule-button');
    this.helpContent = this._container.querySelector('.help-content');
    this.chartSelect = this._container.querySelector('select.chart-select');
    this.content = this._container.querySelector('.content');
    this.chartWrapper = this._container.querySelector('.chart-wrapper');
    this.canvas = this._container.querySelector('#simulationChartCanvas');
    this.scheduleModalOverlay = this._container.querySelector('.schedule-modal-overlay');
    this.scheduleModalClose = this._container.querySelector('.schedule-modal .close-modal');
    this.planSummaryButton = null; // Will be created dynamically

    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));
    domEvent.bind(this.helpButton, 'click', () => this.toggleHelp());
    domEvent.bind(this.scheduleButton, 'click', () => this._eventBus.fire('simulation.schedule.requested'));

    domEvent.bind(this.scheduleModalClose, 'click', () => this.showScheduleModal(false));
    domEvent.bind(this.scheduleModalOverlay, 'click', (event) => {
        if (event.target === this.scheduleModalOverlay) this.showScheduleModal(false);
    });

    domEvent.bind(this.chartSelect, 'change', (e) => {
        this.updateDynamicButtons();
        this._eventBus.fire('simulation.charts.opened');
    });

    this._eventBus.on('diagram.destroy', () => this.hide());
    this._eventBus.on('simulation.schedule.show', (event) => this.showScheduleModal(true, event.html));
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
    domClasses(this.chartWrapper).add('hidden');
    domClasses(htmlContent).remove('hidden');
  }

  showCanvas() {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = ''; // Clear it
    domClasses(this.chartWrapper).remove('hidden');
    domClasses(htmlContent).add('hidden');
  }

  showScheduleModal(show, html) {
      if (show) {
          const content = this.scheduleModalOverlay.querySelector('.schedule-modal-content');
          content.innerHTML = html;
          domClasses(this.scheduleModalOverlay).remove('hidden');
      } else {
          domClasses(this.scheduleModalOverlay).add('hidden');
      }
  }

  isOpen() {
    return domClasses(this._container).has(PALETTE_OPEN_CLS);
  }

  updateDynamicButtons() {
    const chartType = this.getChartType();
    const headerButtons = this._container.querySelector('.header-buttons');

    if (this.planSummaryButton) {
        this.planSummaryButton.remove();
        this.planSummaryButton = null;
    }

    if (chartType === 'workPlan') {
        this.planSummaryButton = domify('<button class="plan-summary-button" title="Ver Resumen de Costos">Resumen</button>');
        headerButtons.insertBefore(this.planSummaryButton, this.scheduleButton);
        domEvent.bind(this.planSummaryButton, 'click', () => {
            this._eventBus.fire('simulation.plan_summary.requested');
        });
    }
  }

  toggle(open) {
    const shouldOpen = (open !== undefined) ? open : !this.isOpen();

    if (shouldOpen) {
      domClasses(this._container).add(PALETTE_OPEN_CLS);
      this.updateDynamicButtons();
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
