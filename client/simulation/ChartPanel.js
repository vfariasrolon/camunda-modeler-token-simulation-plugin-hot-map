import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

const PALETTE_CLS = 'simulation-chart-panel';
const PALETTE_OPEN_CLS = 'open';
const HELP_OPEN_CLS = 'help-open';

const HelpIcon = '<path d="M12,2C6.48,2 2,6.48 2,12s4.48,10 10,10 10,-4.48 10,-10S17.52,2 12,2zm1,15h-2v-2h2v2zm0,-4h-2V7h2v6z"/>';
const ScheduleIcon = '<path d="M19,4H18V2H16V4H8V2H6V4H5C3.89,4 3.01,4.89 3.01,6L3,20c0,1.1 0.89,2 2,2h14c1.1,0 2,-0.9 2,-2V6C21,4.89 20.1,4 19,4zM19,20H5V10h14V20zM19,8H5V6h14V8z"/>';


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
            <option value="comparison">Gráfico Comparativo (Últimas 2)</option>
          </select>
          <div class="header-buttons">
            <button class="schedule-button" title="Ver Cronograma"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${ScheduleIcon}</svg></button>
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
          <p><strong>Resumen General:</strong> Muestra las métricas totales más importantes de toda la simulación, como la duración total en tiempo de calendario, el costo total de la operación y el número de instancias completadas.</p>
          <p><strong>Parámetros de Entrada (Tabla):</strong> Muestra una tabla con todos los datos de simulación configurados para cada elemento del diagrama (tiempos, costos, probabilidades, etc.). Útil para verificar la configuración antes de ejecutar la simulación.</p>
          <p><strong>Resultados de Simulación (Tabla):</strong> Presenta una tabla con las métricas de salida agregadas para cada elemento del diagrama después de ejecutar la simulación. Incluye conteos de ejecución, fallos, tiempos y costos totales.</p>
          <p><strong>Top 5 por Costo:</strong> Muestra las 5 tareas más caras de todo el proceso.</p>
          <p><strong>Top 5 por Tiempo de Proceso:</strong> Muestra las 5 tareas que más tiempo de trabajo activo consumen.</p>
          <p><strong>Top 5 por Tiempo de Espera (Recursos):</strong> Muestra las 5 tareas donde se pierde más tiempo esperando a que un recurso (persona) esté disponible. Indica cuellos de botella de personal.</p>
          <p><strong>Recursos Asignados por Tarea:</strong> Muestra cuántas personas (\`quantityRequired\`) están asignadas a cada tarea según la configuración.</p>
          <p><strong>Diagrama de Dispersión (Tiempo vs. Costo):</strong> Cada punto representa un tipo de tarea. El eje X es el tiempo de proceso promedio y el eje Y es el costo total incurrido por todas las ejecuciones de esa tarea. Ayuda a identificar tareas que son a la vez largas (en promedio) y caras (en total).</p>
          <p><strong>Diagrama de Pareto (Fallos):</strong> Muestra las tareas que causan la mayoría de los fallos. Las barras (eje izquierdo) son el número de fallos por tarea, ordenadas de mayor a menor. La línea (eje derecho) es el porcentaje acumulado del total de fallos. Útil para aplicar la regla 80/20 e identificar los "pocos vitales" problemas.</p>
          <p><strong>Diagrama de Pareto (Tiempos):</strong> Similar al de fallos, pero analiza el tiempo de proceso total. Ayuda a identificar qué pocas tareas contribuyen a la mayor parte del tiempo de trabajo total en el proceso. Las barras son el tiempo total de proceso por tarea, y la línea es el porcentaje acumulado.</p>
          <p><strong>Diagrama de Pareto (Costos):</strong> Aplica el principio de Pareto a los costos. Ayuda a identificar las tareas que son responsables de la mayor parte del costo total del proceso. Las barras son el costo total por tarea, y la línea es el porcentaje acumulado.</p>
          <p><strong>Tiempos de Espera por Tarea (Completo):</strong> Muestra el tiempo total de espera acumulado para cada tarea del proceso, ordenado de mayor a menor. A diferencia de los gráficos "Top 5", esta vista incluye todas las tareas para un análisis exhaustivo de los "tiempos muertos" y cuellos de botella de recursos.</p>
        </div>
        <div class="schedule-modal-overlay hidden">
            <div class="schedule-modal">
                <div class="schedule-modal-header">
                    <h3>Cronograma de Trabajo</h3>
                    <button class="close-modal" title="Cerrar">×</button>
                </div>
                <div class="schedule-modal-content">
                    <!-- Content will be injected here -->
                </div>
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
    this.canvas = this._container.querySelector('#simulationChartCanvas');
    this.scheduleModalOverlay = this._container.querySelector('.schedule-modal-overlay');
    this.scheduleModalClose = this._container.querySelector('.schedule-modal .close-modal');


    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));
    domEvent.bind(this.helpButton, 'click', () => this.toggleHelp());
    domEvent.bind(this.scheduleButton, 'click', () => this._eventBus.fire('simulation.schedule.requested'));
    domEvent.bind(this.scheduleModalClose, 'click', () => this.showScheduleModal(false));
    domEvent.bind(this.scheduleModalOverlay, 'click', (event) => {
        if (event.target === this.scheduleModalOverlay) {
            this.showScheduleModal(false);
        }
    });

    domEvent.bind(this.chartSelect, 'change', (e) => {
        this._eventBus.fire('simulation.charts.opened');
    });

    this._eventBus.on('diagram.destroy', () => this.hide());
    this._eventBus.on('simulation.schedule.show', (event) => {
      this.showScheduleModal(true, event.html);
    });
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
