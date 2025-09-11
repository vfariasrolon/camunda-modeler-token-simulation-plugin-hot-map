import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';
const HELP_OPEN_CLS = 'help-open';

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
            <option value="waitTime">Top 5 por Tiempo de Espera (Recursos)</option>
            <option value="resourceQuantity">Recursos Asignados por Tarea</option>
            <option value="scatter">Diagrama de Dispersión (Tiempo vs. Costo)</option>
            <option value="pareto">Diagrama de Pareto (Fallos)</option>
            <option value="allWaitTimes">Tiempos de Espera por Tarea (Completo)</option>
          </select>
          <button class="help-button" title="Ayuda"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${HelpIcon}</svg></button>
          <button class="close" title="Cerrar">×</button>
        </div>
        <div class="content">
          <canvas id="simulationChartCanvas"></canvas>
        </div>
        <div class="help-content hidden">
          <h4>Ayuda de Gráficos de Simulación</h4>
          <p><strong>Top 5 por Costo:</strong> Muestra las 5 tareas más caras de todo el proceso.</p>
          <p><strong>Top 5 por Tiempo de Proceso:</strong> Muestra las 5 tareas que más tiempo de trabajo activo consumen.</p>
          <p><strong>Top 5 por Tiempo de Espera (Recursos):</strong> Muestra las 5 tareas donde se pierde más tiempo esperando a que un recurso (persona) esté disponible. Indica cuellos de botella de personal.</p>
          <p><strong>Recursos Asignados por Tarea:</strong> Muestra cuántas personas (\`quantityRequired\`) están asignadas a cada tarea según la configuración.</p>
          <p><strong>Diagrama de Dispersión (Tiempo vs. Costo):</strong> Cada punto representa un tipo de tarea. El eje X es el tiempo de proceso promedio y el eje Y es el costo total incurrido por todas las ejecuciones de esa tarea. Ayuda a identificar tareas que son a la vez largas (en promedio) y caras (en total).</p>
          <p><strong>Diagrama de Pareto (Fallos):</strong> Muestra las tareas que causan la mayoría de los fallos. Las barras (eje izquierdo) son el número de fallos por tarea, ordenadas de mayor a menor. La línea (eje derecho) es el porcentaje acumulado del total de fallos. Útil para aplicar la regla 80/20 e identificar los "pocos vitales" problemas.</p>
          <p><strong>Tiempos de Espera por Tarea (Completo):</strong> Muestra el tiempo total de espera acumulado para cada tarea del proceso, ordenado de mayor a menor. A diferencia de los gráficos "Top 5", esta vista incluye todas las tareas para un análisis exhaustivo de los "tiempos muertos" y cuellos de botella de recursos.</p>
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
        this._eventBus.fire('simulation.charts.opened');
    });

    this._eventBus.on('diagram.destroy', () => this.hide());
  }

  getChartType() {
    return this.chartSelect.value;
  }

  getCanvas() {
    return this.canvas;
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
