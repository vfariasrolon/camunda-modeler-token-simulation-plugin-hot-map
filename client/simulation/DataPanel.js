import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';
import { getSimulationData, formatMilliseconds } from './util';

const PALETTE_CLS = 'simulation-data-panel';
const PALETTE_OPEN_CLS = 'open';

export default class DataPanel {
  constructor(canvas, eventBus, elementRegistry) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this.results = null;

    this._init();
  }

  _init() {
    this._container = domify(`
      <div class="${PALETTE_CLS}">
        <div class="header">
          <span class="title">Visualizador de Datos</span>
          <button class="close" title="Cerrar">×</button>
        </div>
        <div class="content-container">
          <div class="tabs">
            <button class="tab-button active" data-tab="input">Datos de Entrada</button>
            <button class="tab-button" data-tab="results" disabled>Resultados</button>
          </div>
          <div class="content" id="data-input-content"></div>
          <div class="content hidden" id="data-results-content"></div>
        </div>
      </div>
    `);

    this._canvas.getContainer().appendChild(this._container);

    this.closeButton = this._container.querySelector('button.close');
    this.inputContent = this._container.querySelector('#data-input-content');
    this.resultsContent = this._container.querySelector('#data-results-content');
    this.inputTabButton = this._container.querySelector('[data-tab="input"]');
    this.resultsTabButton = this._container.querySelector('[data-tab="results"]');

    domEvent.bind(this.closeButton, 'click', () => this.toggle(false));
    domEvent.bind(this.inputTabButton, 'click', () => this.showTab('input'));
    domEvent.bind(this.resultsTabButton, 'click', () => this.showTab('results'));

    this._eventBus.on('diagram.destroy', () => this.destroy());

    this._eventBus.on('simulation.results.available', (event) => {
      this.results = event.results;
      this.resultsTabButton.disabled = false;
    });

    this._eventBus.on('simulation.cleared', () => {
      this.results = null;
      this.resultsTabButton.disabled = true;
      if (this.isOpen()) {
        this.showTab('input');
      }
    });
  }

  showTab(tab) {
    if (tab === 'input') {
      domClasses(this.inputContent).remove('hidden');
      domClasses(this.resultsContent).add('hidden');
      domClasses(this.inputTabButton).add('active');
      domClasses(this.resultsTabButton).remove('active');
      this.showInputData();
    } else if (tab === 'results' && this.results) {
      domClasses(this.resultsContent).remove('hidden');
      domClasses(this.inputContent).add('hidden');
      domClasses(this.resultsTabButton).add('active');
      domClasses(this.inputTabButton).remove('active');
      this.showResultsTable();
    }
  }

  showInputData() {
    this.inputContent.innerHTML = '';
    const list = domify('<ul></ul>');
    this._elementRegistry.forEach(element => {
      const data = getSimulationData(element);
      if (data && Object.keys(data).length > 0) {
        const name = element.businessObject.name || element.id;
        const dataString = JSON.stringify(data, null, 2);
        const listItem = domify(`<li><strong>${name}</strong><pre>${dataString}</pre></li>`);
        list.appendChild(listItem);
      }
    });
    this.inputContent.appendChild(list);
  }

  showResultsTable() {
    this.resultsContent.innerHTML = '';
    if (!this.results) return;

    const table = domify(`
      <table>
        <thead><tr><th>Elemento</th><th>Ejecuciones</th><th>Fallos</th><th>T. Espera</th><th>T. Proceso</th><th>Costo</th></tr></thead>
        <tbody></tbody>
      </table>`);
    const tbody = table.querySelector('tbody');

    this.results.forEach((result, elementId) => {
      if (result.executionCount > 0) {
        const row = domify(`
          <tr>
            <td>${result.name}</td>
            <td>${result.executionCount}</td>
            <td>${result.failureCount || 0}</td>
            <td>${formatMilliseconds(result.totalWaitTime || 0)}</td>
            <td>${formatMilliseconds(result.totalProcessingTime || 0)}</td>
            <td>$${(result.totalCost || 0).toFixed(2)}</td>
          </tr>`);
        tbody.appendChild(row);
      }
    });
    this.resultsContent.appendChild(table);
  }

  isOpen() {
    return this._container && domClasses(this._container).has(PALETTE_OPEN_CLS);
  }

  toggle() {
    const shouldOpen = !this.isOpen();
    if (shouldOpen) {
      this.showTab('input');
      domClasses(this._container).add(PALETTE_OPEN_CLS);
    } else {
      domClasses(this._container).remove(PALETTE_OPEN_CLS);
    }
  }

  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
      this._container = null;
    }
  }
}

DataPanel.$inject = ['canvas', 'eventBus', 'elementRegistry'];
