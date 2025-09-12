import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';

const HelpIcon = '<path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zm1,15h-2v-2h2v2zm0,-4h-2V7h2v6z"/>';

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
            <option value="cost">Top 5 por Costo</option>
            <option value="processTime">Top 5 por Tiempo de Proceso</option>
            <option value="waitTime">Top 5 por Tiempo de Espera</option>
            <option value="allWaitTimes">Tiempos de Espera (Completo)</option>
            <option value="pareto">Pareto de Fallos</option>
            <option value="scatter">Tiempo vs. Costo</option>
          </select>
          <button class="help-button" title="Ayuda"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${HelpIcon}</svg></button>
          <button class="close" title="Cerrar">×</button>
        </div>
        <div class="content">
          <canvas id="simulationChartCanvas"></canvas>
        </div>
        <div class="help-content hidden">
          <h4>Ayuda de Gráficos</h4>
          <p><strong>Top 5 por Costo:</strong> Tareas más caras.</p>
          <p><strong>Top 5 por Tiempo de Proceso:</strong> Tareas con mayor tiempo de trabajo activo.</p>
          <p><strong>Top 5 por Tiempo de Espera:</strong> Tareas con mayor tiempo de espera por recursos.</p>
          <p><strong>Tiempos de Espera (Completo):</strong> Todas las tareas con tiempo de espera, de mayor a menor.</p>
          <p><strong>Pareto de Fallos:</strong> Tareas que causan la mayoría de los fallos (80/20).</p>
          <p><strong>Tiempo vs. Costo:</strong> Diagrama de dispersión para identificar tareas largas y caras.</p>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.helpButton = this._container.querySelector('button.help-button');
    this.helpContent = this._container.querySelector('.help-content');
    this.chartSelect = this._container.querySelector('select.chart-select');
    this.content = this._container.querySelector('.content');
    this.canvas = this._container.querySelector('#simulationChartCanvas');

    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));
    domEvent.bind(this.helpButton, 'click', () => this.toggleHelp());
    domEvent.bind(this.chartSelect, 'change', (e) => {
        this._eventBus.fire('simulation.charts.typeChanged');
    });

    this._eventBus.on('diagram.destroy', () => this.destroy());
  }

  getChartType() {
    return this.chartSelect.value;
  }

  getCanvas() {
    return this.canvas;
  }

  isOpen() {
    return this._container && domClasses(this._container).has(PALETTE_OPEN_CLS);
  }

  toggle(open) {
    const shouldOpen = (open !== undefined) ? open : !this.isOpen();
    if (shouldOpen) {
      domClasses(this._container).add(PALETTE_OPEN_CLS);
      this._eventBus.fire('simulation.charts.opened');
    } else {
      domClasses(this._container).remove(PALETTE_OPEN_CLS);
    }
  }

  toggleHelp() {
    domClasses(this.helpContent).toggle('hidden');
    domClasses(this.content).toggle('hidden');
  }

  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
      this._container = null;
    }
  }
}

ChartPanel.$inject = [ 'canvas', 'eventBus' ];
