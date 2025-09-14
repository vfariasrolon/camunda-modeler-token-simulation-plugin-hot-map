import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { es } from 'date-fns/locale';
import { getSimulationData, formatMilliseconds } from './util';

// Geometric icons to match the look and feel of the editor
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
    this._chartPanel.toggleProductionCharts(this._simulationEngine.workCalendar !== null);
  }

  adjustHeatmap(type, amount) {
      if (type === 'radius') this._radius = Math.max(1, this._radius + amount);
      else if (type === 'blur') this._blur = Math.max(0, this._blur + amount);
      if (this.lastMetric) this.showMetric(this.lastMetric);
  }

  showMetric(metric) {
    this.clearOverlaysAndHeatmap();
    this.lastMetric = metric;
    const dataPoints = [];
    let max = 0;

    if (metric === 'resourceQuantity') {
      this._elementRegistry.forEach(element => {
        if (is(element, 'bpmn:Task')) {
          const data = getSimulationData(element);
          const value = (data && data.resources && data.resources.quantityRequired) || 0;
          if (value > max) max = value;
          if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
        }
      });
    } else {
      if (!this.simulationResults) {
          this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
          return;
      }
      this.simulationResults.forEach((result, elementId) => {
          const element = this._elementRegistry.get(elementId);
          if (!element || !is(element, 'bpmn:FlowNode')) return;

          let value = 0;
          if (metric === 'frequency') value = result.executionCount;
          else if (metric === 'cost') value = result.totalCost;
          else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1);
          else if (metric === 'totalWaitTime') value = result.totalWaitTime;
          else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1);
          else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1);
          else if (metric === 'failureRate') value = result.failureCount / (result.executionCount || 1);
          else if (metric === 'transportWaitTime') value = result.totalTransportWaitTime / (result.executionCount || 1);
          else if (metric === 'inefficientDispatch') value = result.inefficientDispatchCount;

          if (value > max) max = value;
          if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
      });
    }

    this.createHeatmap();
    this._heatmap.data(dataPoints).max(max || 1).radius(this._radius, this._blur).draw();
    this.showOverlays(metric);
  }

  showOverlays(metric) {
    const elements = metric === 'resourceQuantity'
      ? this._elementRegistry.filter(el => is(el, 'bpmn:Task'))
      : Array.from(this.simulationResults.keys()).map(id => this._elementRegistry.get(id));

    elements.forEach(element => {
        if (!element) return;
        let overlayText = '';
        const result = this.simulationResults ? this.simulationResults.get(element.id) : null;

        if (metric === 'resourceQuantity') {
            const data = getSimulationData(element);
            const value = (data && data.resources && data.resources.quantityRequired) || 0;
            if (value > 0) overlayText = `Recursos: ${value}`;
        } else if (result) {
            if (is(element, 'bpmn:Task')) {
                if (metric === 'cost') overlayText = `Costo: $${result.totalCost.toFixed(2)}`;
                else if (metric === 'waitTime') overlayText = `Espera Prom: ${formatMilliseconds(result.totalWaitTime / (result.executionCount || 1))}`;
                else if (metric === 'totalWaitTime') overlayText = `Espera Total: ${formatMilliseconds(result.totalWaitTime)}`;
                else if (metric === 'processTime') overlayText = `Proceso: ${formatMilliseconds(result.totalProcessingTime / (result.executionCount || 1))}`;
                else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
                else if (metric === 'failureRate' && result.executionCount > 0) {
                    const rate = (result.failureCount / result.executionCount * 100).toFixed(1);
                    overlayText = `Fallos: ${result.failureCount} (${rate}%)`;
                }
                else if (metric === 'transportWaitTime' && result.totalTransportWaitTime > 0) {
                  overlayText = `E.Carro: ${formatMilliseconds(result.totalTransportWaitTime / (result.executionCount || 1))}`;
                }
                else if (metric === 'inefficientDispatch' && result.inefficientDispatchCount > 0) {
                  overlayText = `Desp. Inef: ${result.inefficientDispatchCount}`;
                }
            } else if (is(element, 'bpmn:EndEvent') && metric === 'cycleTime' && result.totalCycleTime > 0) {
                overlayText = `Ciclo: ${formatMilliseconds(result.totalCycleTime / (result.executionCount || 1))}`;
            }
        }

        if (overlayText) this._overlays.add(element, 'simulation-overlay', { position: { bottom: -5, left: element.width / 2 - 20 }, html: `<div class="simulation-overlay-text">${overlayText}</div>` });

        if (result && is(element, 'bpmn:ExclusiveGateway')) {
            element.outgoing.forEach(flow => {
                const flowResult = this.simulationResults.get(flow.id);
                if (flowResult && result.executionCount > 0 && flowResult.executionCount > 0) {
                    const percentage = (flowResult.executionCount / result.executionCount * 100).toFixed(1);
                    this._overlays.add(flow.id, 'simulation-overlay', { position: { top: -15, left: -20 }, html: `<div class="simulation-overlay-text">${flowResult.executionCount} (${percentage}%)</div>` });
                }
            });
        }
    });
  }

  showChart() {
    const metric = this._chartPanel.getChartType();

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
    const chartData = this.getChartData(metric);

    let chartType = 'bar';
    if (metric === 'scatter') chartType = 'scatter';
    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') chartType = 'bar';
    if (metric === 'productionScurve') chartType = 'line';

    const options = {
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Valor'
                }
            }
        }
    };

    if (metric === 'productionScurve') {
      options.scales.x = {
        type: 'time',
        time: {
          unit: 'day',
          tooltipFormat: 'PPpp',
          displayFormats: { day: 'PP' }
        },
        title: { display: true, text: 'Fecha' },
        adapters: { date: { locale: es } }
      };
      options.scales.y.title = { display: true, text: 'Productos Completados' };
    } else {
      const yAxisTitle =
          metric === 'cost' ? 'Costo Total ($)' :
          metric === 'processTime' ? 'Tiempo de Proceso Total' :
          metric === 'waitTime' || metric === 'allWaitTimes' ? 'Tiempo de Espera Total' :
          metric === 'resourceQuantity' ? 'Cantidad de Recursos' :
          metric === 'pareto' ? 'Número de Fallos' :
          metric === 'paretoTime' ? 'Tiempo de Proceso Total' :
          metric === 'paretoCost' ? 'Costo Total ($)' :
          'Valor';
      options.scales.y.title.text = yAxisTitle;
    }

    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') {
        options.scales.y1 = {
            type: 'linear', display: true, position: 'right', min: 0, max: 100,
            title: { display: true, text: 'Porcentaje Acumulado (%)' },
            grid: { drawOnChartArea: false },
        };
    }

    if (metric === 'scatter') {
        options.scales.x = {
            type: 'linear', position: 'bottom',
            title: { display: true, text: 'Tiempo de Proceso Promedio (s)' }
        };
        options.scales.y.title = { display: true, text: 'Costo Total ($)' };
    }

    const datasets = chartData.datasets ? chartData.datasets : [{
        label: chartData.label,
        data: chartData.data,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
    }];

    if (metric === 'productionScurve') {
        datasets[0].fill = true;
        datasets[0].tension = 0.1;
    }

    const timeMetrics = ['processTime', 'waitTime', 'allWaitTimes', 'paretoTime', 'cycleTime', 'totalWaitTime'];
    if (timeMetrics.includes(metric)) {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') label += context.parsed.y.toFixed(1) + '%';
                          else label += formatMilliseconds(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        };
    }

    if (metric === 'paretoCost') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') label += context.parsed.y.toFixed(1) + '%';
                          else label += '$' + context.parsed.y.toFixed(2);
                        }
                        return label;
                    }
                }
            }
        };
    }

    if (metric === 'scatter') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.dataset.label || '';
                        const time = formatMilliseconds(context.parsed.x * 1000);
                        const cost = context.parsed.y.toFixed(2);
                        return `${context.chart.data.labels[context.dataIndex]}: (${time}, $${cost})`;
                    }
                }
            }
        };
    }

    return {
      type: chartType,
      data: {
        labels: chartData.labels,
        datasets: datasets
      },
      options: options
    };
  }

  getInputParametersData() {
    // ... (unchanged)
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
        if (key === 'rootCheckpoint') return; // Don't show the checkpoint itself

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

    // Add production results summary if in production mode
    if (this._simulationEngine.workCalendar) {
      const rootElementId = this._simulationEngine.rootElementId;
      const rootResults = results.get(rootElementId);
      if (rootResults) {
        const completionDate = rootResults.estimatedCompletionDate
          ? rootResults.estimatedCompletionDate.toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' })
          : 'N/A';
        const totalOvertime = rootResults.totalOvertime
          ? formatMilliseconds(rootResults.totalOvertime)
          : '0s';

        tableHtml += `
          <h4 class="sim-results-header">Resumen de Producción</h4>
          <table class="sim-results-table summary-table">
            <thead>
              <tr>
                <th>Fecha de Finalización Estimada</th>
                <th>Horas Extras Totales</th>
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

  getChartData(metric) {
    if (metric === 'productionScurve') {
      const rootElement = this._elementRegistry.find(el => {
          const data = getSimulationData(el);
          return data && data.rootCheckpoint === true;
      });
      if (rootElement && this.simulationResults.has(rootElement.id)) {
          const snapshots = this.simulationResults.get(rootElement.id).progressSnapshots || [];
          const chartData = snapshots.map(s => ({ x: s[0].getTime(), y: s[1] }));
          return { data: chartData, label: 'Avance de Producción' };
      }
      return { data: [], label: 'Avance de Producción' };
    }

    const tasks = [];
    if (metric === 'resourceQuantity') {
        this._elementRegistry.forEach(element => {
            if (is(element, 'bpmn:Task')) {
                const data = getSimulationData(element);
                const value = (data && data.resources && data.resources.quantityRequired) || 0;
                tasks.push({ name: element.businessObject.name || element.id, value: value });
            }
        });
    } else {
        this.simulationResults.forEach((result, elementId) => {
            const element = this._elementRegistry.get(elementId);
            if (element && is(element, 'bpmn:Task')) {
                tasks.push({ ...result, name: element.businessObject.name || element.id });
            }
        });
    }

    if (metric === 'scatter') {
        const scatterData = tasks.map(t => ({
            x: t.totalProcessingTime / (t.executionCount || 1) / 1000,
            y: t.totalCost
        }));
        return { data: scatterData, labels: tasks.map(t => t.name), label: 'Tiempo de Proceso vs. Costo' };
    }

    if (metric === 'pareto' || metric === 'paretoCost' || metric === 'paretoTime') {
      // ... (pareto logic unchanged)
    }

    let dataProperty, label;
    if (metric === 'cost') { dataProperty = 'totalCost'; label = 'Costo Total por Tarea'; }
    else if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso Total'; }
    else if (metric === 'waitTime') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'allWaitTimes') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'transportWaitTime') { dataProperty = 'totalTransportWaitTime'; label = 'Tiempo de Espera Total (Transporte)'; }
    else if (metric === 'inefficientDispatch') { dataProperty = 'inefficientDispatchCount'; label = 'Total de Despachos Ineficientes'; }
    else if (metric === 'resourceQuantity') { dataProperty = 'value'; label = 'Cantidad de Recursos por Tarea'; }

    tasks.sort((a, b) => b[dataProperty] - a[dataProperty]);

    const chartTasks = metric === 'allWaitTimes'
        ? tasks.filter(t => t[dataProperty] > 0)
        : tasks.filter(t => t[dataProperty] > 0).slice(0, 5);

    const labels = chartTasks.map(t => t.name);
    const data = chartTasks.map(t => t[dataProperty]);

    return { data, labels, label };
  }

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this._chartPanel.toggleProductionCharts(false);
    this.clearOverlaysAndHeatmap();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }

  clearOverlaysAndHeatmap() {
    if (this._heatmap) {
      this._heatmap.destroy();
      this._heatmap = null;
    }
    domClasses(this._canvas.getContainer()).remove('heatmap-shown');
    this._overlays.remove({ type: 'simulation-overlay' });
  }

  createHeatmap() {
    if (this._heatmap) return;
    this._heatmap = new SimpleHeatSVG(this._canvas);
    domClasses(this._canvas.getContainer()).add('heatmap-shown');
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
