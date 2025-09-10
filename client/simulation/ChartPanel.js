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
          <select class="chart-select">
            <option value="cost">Top 5 by Cost</option>
            <option value="processTime">Top 5 by Process Time</option>
            <option value="waitTime">Top 5 by Wait Time (Resources)</option>
            <option value="transportWaitTime">Top 5 by Transport Wait Time</option>
          </select>
          <button class="close">×</button>
        </div>
        <div class="content">
          <canvas id="simulationChartCanvas" width="400" height="300"></canvas>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.chartSelect = this._container.querySelector('select.chart-select');
    this.content = this._container.querySelector('.content');
    this.canvas = this._container.querySelector('#simulationChartCanvas');

    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));
    domEvent.bind(this.chartSelect, 'change', (e) => {
        this._eventBus.fire('simulation.charts.typeChanged', {
            type: e.target.value
        });
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

  hide() {
    this.toggle(false);
  }

  show() {
    this.toggle(true);
  }
}

ChartPanel.$inject = [ 'canvas', 'eventBus' ];
