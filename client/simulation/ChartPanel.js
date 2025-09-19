import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';

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
          <span class="title">Análisis de Simulación</span>
          <button class="close" title="Cerrar">×</button>
        </div>
        <div class="content">
          <div id="comparison-container"></div>
          <hr style="margin: 15px 0;" />
          <div id="charts-container">
            <select class="chart-select">
              <option value="productionCompare">Análisis de Producción (Normal vs. Extras)</option>
              <option value="dailyProduction">Producción Diaria</option>
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
            <div class="html-content" style="margin-top: 10px;"></div>
            <canvas id="simulationChartCanvas" style="margin-top: 10px;"></canvas>
          </div>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.chartSelect = this._container.querySelector('select.chart-select');
    this.canvas = this._container.querySelector('#simulationChartCanvas');

    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));

    domEvent.bind(this.chartSelect, 'change', (e) => {
        this._eventBus.fire('simulation.charts.typeChanged');
    });

    this._eventBus.on('diagram.destroy', () => this.hide());

    this._eventBus.on('simulation.panel.show', (event) => {
      this.showComparison(event.comparisonHtml);
      this.toggle(true);
    });
  }

  showComparison(html) {
    const comparisonContainer = this._container.querySelector('#comparison-container');
    comparisonContainer.innerHTML = html;
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

  hide() {
    this.toggle(false);
  }

  show() {
    this.toggle(true);
  }
}

ChartPanel.$inject = [ 'canvas', 'eventBus' ];
