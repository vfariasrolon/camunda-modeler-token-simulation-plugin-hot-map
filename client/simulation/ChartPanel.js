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
          <div class="html-content"></div>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));

    this._eventBus.on('diagram.destroy', () => this.hide());

    // The controller will now be responsible for telling us when to show and with what content.
    this._eventBus.on('simulation.panel.show', (event) => {
      this.showHtmlContent(event.html);
      this.toggle(true);
    });
  }

  showHtmlContent(html) {
    const htmlContent = this._container.querySelector('.html-content');
    htmlContent.innerHTML = html;
  }

  isOpen() {
    return domClasses(this._container).has(PALETTE_OPEN_CLS);
  }

  toggle(open) {
    const shouldOpen = (open !== undefined) ? open : !this.isOpen();

    if (shouldOpen) {
      domClasses(this._container).add(PALETTE_OPEN_CLS);
      this._eventBus.fire('simulation.charts.opened'); // Keep this for other potential listeners
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
