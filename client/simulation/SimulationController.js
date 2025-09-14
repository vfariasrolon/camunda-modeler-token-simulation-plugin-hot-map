import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData, formatMilliseconds } from './util';

const RunIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <path d="M 4 2 L 4 14 L 14 8 Z" fill="currentColor" />
    </svg>
  </span>
`;

const ShowIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80">
      <circle r="39"/>
      <path fill="#fff" d="M0,38a38,38 0 0 1 0,-76a19,19 0 0 1 0,38a19,19 0 0 0 0,38"/>
      <circle r="5" cy="19" fill="#fff"/>
      <circle r="5" cy="-19"/>
    </svg>
  </span>
`;

const ChartIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" />
    </svg>
  </span>
`;

export default class SimulationController {
  constructor(canvas, eventBus, simulationPalette, simulationEngine, elementRegistry, overlays, tokenSimulationPalette, notifications, chartPanel) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._simulationPalette = simulationPalette;
    this._simulationEngine = simulationEngine;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;
    this._tokenSimulationPalette = tokenSimulationPalette;
    this._notifications = notifications;
    this._chartPanel = chartPanel;

    this._heatmap = null;
    this._chart = null;
    this._radius = 20;
    this._blur = 10;
    this.simulationResults = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    const runButton = domify(`<div class="bts-entry" title="Ejecutar Simulación">${RunIcon}</div>`);
    const showButton = domify(`<div class="bts-entry" title="Mostrar Análisis">${ShowIcon}</div>`);
    const chartButton = domify(`<div class="bts-entry" title="Mostrar Gráficos">${ChartIcon}</div>`);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());
    domEvent.bind(chartButton, 'click', () => this._chartPanel.toggle());

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);
    this._tokenSimulationPalette.addEntry(chartButton, 14);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));

    this._eventBus.on('simulation.charts.opened', () => this.showChart());
    this._eventBus.on('simulation.charts.typeChanged', (e) => this.showChart());
  }

  runSimulation() {
    this.clear();
    this.simulationResults = this._simulationEngine.run();
    this._notifications.showNotification({ text: 'Simulación completada', type: 'info', duration: 3000 });

    const estimationOption = this._chartPanel.getContainer().querySelector('[data-production="true"]');
    if (estimationOption) {
      estimationOption.style.display = this._simulationEngine.workCalendar ? '' : 'none';
    }
  }

  adjustHeatmap(type, amount) {
    // ... (unchanged)
  }

  showMetric(metric) {
    // ... (unchanged)
  }

  showOverlays(metric) {
    // ... (unchanged)
  }

  showChart() {
    const metric = this._chartPanel.getChartType();

    if (metric === 'estimations') {
      const tableHtml = this.createEstimationsTable();
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    if (metric === 'inputParams') {
      const data = this.getInputParametersData();
      const tableHtml = this.createInputParametersTable(data);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    if (metric === 'resultsTable') {
      if (!this.simulationResults) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
        return;
      }
      const tableHtml = this.createResultsTable(this.simulationResults);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    this._chartPanel.showCanvas();

    if (!this.simulationResults && metric !== 'resourceQuantity') {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        return;
    }

    if (this._chart) {
      this._chart.destroy();
    }

    const chartConfig = this.getChartConfig(metric);

    const ctx = this._chartPanel.getCanvas().getContext('2d');
    this._chart = new Chart(ctx, chartConfig);
  }

  getChartConfig(metric) {
    // ... (unchanged, all date-related logic is removed)
  }

  getInputParametersData() {
    const allElements = this._elementRegistry.getAll();
    const elementsWithData = [];
    allElements.forEach(element => {
      if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant') || is(element, 'bpmn:Task') || is(element, 'bpmn:StartEvent') || (is(element, 'bpmn:SequenceFlow') && element.source?.type === 'bpmn:ExclusiveGateway')) {
        const data = getSimulationData(element);
        if (data && Object.keys(data).length > 0) {
          elementsWithData.push({
            id: element.id,
            name: element.businessObject.name || element.id,
            type: element.type,
            data: data
          });
        }
      }
    });
    return elementsWithData;
  }

  createInputParametersTable(data) {
    if (!data || data.length === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No se encontraron elementos con datos de simulación configurados.</p>';
    }

    let tableHtml = `
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Parámetro</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
    `;

    const dayMap = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    data.forEach(element => {
      const isRoot = element.data.rootCheckpoint;
      const elementName = `${element.name} ${isRoot ? '(Raíz)' : ''}`;

      Object.entries(element.data).forEach(([key, value]) => {
        if (key === 'rootCheckpoint') return;

        if (key === 'workSchedule' && typeof value === 'object') {
          const scheduleEntries = Object.entries(value);
          scheduleEntries.forEach(([schedKey, schedValue], index) => {
            let displayValue = JSON.stringify(schedValue);
            if (schedKey === 'workDays') {
              displayValue = schedValue.map(d => dayMap[d] || d).join(', ');
            } else if (schedKey === 'lunchBreakHours') {
              displayValue = `${schedValue} hora(s)`;
            }
            tableHtml += `
              <tr>
                ${index === 0 ? `<td rowspan="${scheduleEntries.length}">${elementName}</td>` : ''}
                <td>Horario: ${schedKey}</td>
                <td>${displayValue}</td>
              </tr>`;
          });
        } else if (key === 'resourcePools' && Array.isArray(value)) {
           value.forEach((pool, index) => {
              tableHtml += `
                <tr>
                  ${index === 0 ? `<td rowspan="${value.length}">${elementName}</td>` : ''}
                  <td>Pool de Recursos</td>
                  <td>${pool.name} (Cantidad: ${pool.quantity})</td>
                </tr>
              `;
           });
        } else if (typeof value !== 'object' || value === null) {
          tableHtml += `
            <tr>
              <td>${elementName}</td>
              <td>${key}</td>
              <td>${JSON.stringify(value)}</td>
            </tr>
          `;
        } else {
          const subEntries = Object.entries(value);
          subEntries.forEach(([subKey, subValue], index) => {
            tableHtml += `
              <tr>
                ${index === 0 ? `<td rowspan="${subEntries.length}">${element.name}</td>` : ''}
                <td>${key}.${subKey}</td>
                <td>${JSON.stringify(subValue)}</td>
              </tr>
            `;
          });
        }
      });
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  createResultsTable(results) {
    if (!results || results.size === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles. Por favor, ejecute una simulación primero.</p>';
    }

    let tableHtml = '';

    if (this._simulationEngine.workCalendar) {
      const rootElementId = this._simulationEngine.rootElementId;
      const rootResults = results.get(rootElementId);
      if (rootResults) {
        tableHtml += this.createEstimationsTable();
      }
    }

    tableHtml += `
      <h4 class="sim-results-header">Resultados por Elemento</h4>
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Elemento</th>
            <th>Ejecuciones</th>
            <th>Fallos</th>
            <th>Espera Total</th>
            <th>Proceso Total</th>
            <th>Costo Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    results.forEach(result => {
      if (result.executionCount > 0 || result.totalCost > 0 || result.totalProcessingTime > 0) {
        tableHtml += `
          <tr>
            <td>${result.name}</td>
            <td>${result.executionCount}</td>
            <td>${result.failureCount}</td>
            <td>${formatMilliseconds(result.totalWaitTime)}</td>
            <td>${formatMilliseconds(result.totalProcessingTime)}</td>
            <td>$${result.totalCost.toFixed(2)}</td>
          </tr>
        `;
      }
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  createEstimationsTable() {
    if (!this.simulationResults || !this._simulationEngine.workCalendar) {
      return '<p style="text-align: center; margin-top: 20px;">No hay estimaciones de producción disponibles. Ejecute una simulación en modo de producción primero.</p>';
    }

    const rootElementId = this._simulationEngine.rootElementId;
    const rootResults = this.simulationResults.get(rootElementId);

    if (!rootResults) {
      return '<p style="text-align: center; margin-top: 20px;">No se encontraron resultados para el elemento raíz.</p>';
    }

    const completionDate = rootResults.estimatedCompletionDate
      ? rootResults.estimatedCompletionDate.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' })
      : 'N/A';
    const totalOvertime = rootResults.totalOvertime
      ? formatMilliseconds(rootResults.totalOvertime)
      : '0s';

    return `
      <h4 class="sim-results-header">Resumen de Producción</h4>
      <table class="sim-results-table summary-table">
        <thead>
          <tr>
            <th>Fecha de Finalización Estimada</th>
            <th>Horas Extras Totales Requeridas</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${completionDate}</td>
            <td>${totalOvertime}</td>
          </tr>
        </tbody>
      </table>
    `;
  }

  getChartData(metric) {
    // ... (unchanged, all date-related logic is removed)
  }

  clear() {
    // ... (unchanged)
  }

  clearOverlaysAndHeatmap() {
    // ... (unchanged)
  }

  createHeatmap() {
    // ... (unchanged)
  }
}

SimulationController.$inject = [
  'canvas',
  'eventBus',
  'simulationPalette',
  'simulationEngine',
  'elementRegistry',
  'overlays',
  'tokenSimulationPalette',
  'notifications',
  'chartPanel'
];
