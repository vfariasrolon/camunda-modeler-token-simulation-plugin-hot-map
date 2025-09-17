import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
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
    this.simulationReports = [];   // Holds the last two full simulation reports
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
    this._eventBus.on('simulation.schedule.requested', () => this.showSchedule());
  }

  showSchedule() {
    const rootElement = this._elementRegistry.find(el => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const simulationData = getSimulationData(rootElement);
    const timetable = simulationData ? simulationData.timetable : null;

    const html = this.createScheduleHtml(timetable);
    this._eventBus.fire('simulation.schedule.show', { html });
  }

  createScheduleHtml(timetable) {
    if (!timetable || !Array.isArray(timetable) || timetable.length === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No se ha definido un cronograma de trabajo detallado.</p>';
    }

    let timetableHtml = timetable.map(entry => `
      <tr>
        <td>${entry.day || 'N/A'}</td>
        <td>${entry.start || 'N/A'}</td>
        <td>${entry.end || 'N/A'}</td>
      </tr>
    `).join('');

    return `
      <h4>Cronograma de Trabajo Configurado</h4>
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Día</th>
            <th>Inicio</th>
            <th>Fin</th>
          </tr>
        </thead>
        <tbody>
          ${timetableHtml}
        </tbody>
      </table>
    `;
  }

  runSimulation() {
    // Clear UI elements
    this.lastMetric = null;
    this.clearOverlaysAndHeatmap();
    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }

    // Run new simulation
    const results = this._simulationEngine.run();
    this._notifications.showNotification({ text: 'Simulación completada', type: 'info', duration: 3000 });

    // Create and store report
    const report = {
        results: results,
        completedInstances: this._simulationEngine.completedInstances,
        duration: this._simulationEngine.calendar.calculateElapsedTime(new Date(0), new Date(this._simulationEngine.clock)) * 60000,
        calendarDuration: this._simulationEngine.clock,
        dailyCompletions: this._simulationEngine.dailyCompletions,
        createdAt: new Date()
    };
    this.simulationReports.unshift(report);
    this.simulationReports = this.simulationReports.slice(0, 2);

    // Update simulationResults for other functions that rely on it
    this.simulationResults = report.results;

    // Refresh any open chart
    if (this._chartPanel.isOpen()) {
        this.showChart();
    }
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
          else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1); // Average
          else if (metric === 'totalWaitTime') value = result.totalWaitTime; // Total
          else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1);
          else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1);
          else if (metric === 'failureRate') value = result.failureCount / (result.executionCount || 1);
          else if (metric === 'transportWaitTime') value = result.totalTransportWaitTime / (result.executionCount || 1);
          else if (metric === 'inefficientDispatch') value = result.inefficientDispatchCount;
          else if (metric === 'overtime') value = result.totalOvertime;
          else if (metric === 'reworkTime') value = result.totalReworkTime;
          else if (metric === 'reworkCost') value = result.totalReworkCost;
          else if (metric === 'waitTimeCost') value = result.totalWaitTimeCost;


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
                else if (metric === 'overtime') overlayText = `H. Extras: ${formatMilliseconds(result.totalOvertime)}`;
                else if (metric === 'reworkTime') overlayText = `T. Reparación: ${formatMilliseconds(result.totalReworkTime)}`;
                else if (metric === 'reworkCost') overlayText = `Costo Reparación: $${result.totalReworkCost.toFixed(2)}`;
                else if (metric === 'waitTimeCost') overlayText = `Costo Espera: $${result.totalWaitTimeCost.toFixed(2)}`;
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

    if (metric === 'overallSummary') {
      if (this.simulationReports.length === 0) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
        return;
      }
      const summaryHtml = this.createOverallSummary(this.simulationReports[0]);
      this._chartPanel.showHtmlContent(summaryHtml);
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

    this._chartPanel.showCanvas(); // Ensure canvas is visible for charts

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
    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') chartType = 'bar'; // It's a mixed type, but 'bar' is the base

    const options = {
        scales: {
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Valor' // Placeholder
                }
            }
        }
    };

    const yAxisTitle =
        metric === 'cost' ? 'Costo Total ($)' :
        metric === 'processTime' ? 'Tiempo de Proceso Total (s)' :
        metric === 'waitTime' || metric === 'allWaitTimes' ? 'Tiempo de Espera Total (s)' :
        metric === 'resourceQuantity' ? 'Cantidad de Recursos' :
        metric === 'pareto' ? 'Número de Fallos' :
        metric === 'paretoTime' ? 'Tiempo de Proceso Total' :
        metric === 'paretoCost' ? 'Costo Total ($)' :
        metric === 'overtime' ? 'Tiempo Extra Total (s)' :
        metric === 'reworkTime' ? 'Tiempo de Reparación Total (s)' :
        metric === 'reworkCost' ? 'Costo de Reparación Total ($)' :
        metric === 'waitTimeCost' ? 'Costo de Espera Total ($)' :
        metric === 'dailyProduction' ? 'Piezas Completadas' :
        metric === 'workPlan' ? 'Valor' :
        'Valor';
    options.scales.y.title.text = yAxisTitle;

    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') {
        options.scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0,
            max: 100,
            title: {
                display: true,
                text: 'Porcentaje Acumulado (%)'
            },
            grid: {
                drawOnChartArea: false, // only draw grid for primary axis
            },
        };
    }

    if (metric === 'scatter') {
        options.scales.x = {
            type: 'linear',
            position: 'bottom',
            title: {
                display: true,
                text: 'Tiempo de Proceso Promedio (s)'
            }
        };
        options.scales.y.title = {
            display: true,
            text: 'Costo Total ($)'
        };
    }

    // For pareto, datasets are pre-built. For others, build them now.
    const datasets = chartData.datasets ? chartData.datasets : [{
        label: chartData.label,
        data: chartData.data,
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
    }];

    const timeMetrics = ['processTime', 'waitTime', 'allWaitTimes', 'overtime', 'reworkTime'];
    if (timeMetrics.includes(metric) || metric === 'paretoTime') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') {
                            label += context.parsed.y.toFixed(1) + '%';
                          } else {
                            label += formatMilliseconds(context.parsed.y);
                          }
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
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') {
                            label += context.parsed.y.toFixed(1) + '%';
                          } else {
                            label += '$' + context.parsed.y.toFixed(2);
                          }
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
                        const time = formatMilliseconds(context.parsed.x * 1000); // convert seconds back to ms for formatting
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
    const allElements = this._elementRegistry.getAll();
    const elementsWithData = [];
    allElements.forEach(element => {
      // We are interested in elements that can have simulation data
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
            <th>Tipo</th>
            <th>Parámetro</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.forEach(element => {
      Object.entries(element.data).forEach(([key, value]) => {
        if (key === 'resourcePools' && Array.isArray(value)) {
           value.forEach(pool => {
              tableHtml += `
                <tr>
                  <td>${element.name}</td>
                  <td>${element.type.replace('bpmn:', '')}</td>
                  <td>resourcePools</td>
                  <td>${pool.name} (Qty: ${pool.quantity})</td>
                </tr>
              `;
           });
        } else if (typeof value !== 'object' || value === null) {
          tableHtml += `
            <tr>
              <td>${element.name}</td>
              <td>${element.type.replace('bpmn:', '')}</td>
              <td>${key}</td>
              <td>${JSON.stringify(value)}</td>
            </tr>
          `;
        } else {
          Object.entries(value).forEach(([subKey, subValue]) => {
            tableHtml += `
              <tr>
                <td>${element.name}</td>
                <td>${element.type.replace('bpmn:', '')}</td>
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

  createOverallSummary(report) {
    let totalCost = 0, totalOvertimeTime = 0, totalFailures = 0,
        totalReworkCost = 0, totalWaitTimeCost = 0, inefficientDispatchCount = 0, totalOvertimeCost = 0;

    report.results.forEach(result => {
      totalCost += result.totalCost || 0;
      totalOvertimeTime += result.totalOvertime || 0;
      totalFailures += result.failureCount || 0;
      totalReworkCost += result.totalReworkCost || 0;
      totalWaitTimeCost += result.totalWaitTimeCost || 0;
      inefficientDispatchCount += result.inefficientDispatchCount || 0;
      totalOvertimeCost += result.totalOvertimeCost || 0;
    });

    const operationalCost = totalCost - totalReworkCost - totalWaitTimeCost - totalOvertimeCost;

    return `
      <div class="sim-summary-container">
        <h2>Resumen General de la Simulación</h2>
        <div class="sim-summary-item">
          <span class="label">Instancias Completadas:</span>
          <span class="value">${report.completedInstances}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Duración Total (Tiempo de Trabajo Neto):</span>
          <span class="value">${formatMilliseconds(report.duration)}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Duración Total (Días Naturales):</span>
          <span class="value">${(report.calendarDuration / (1000 * 60 * 60 * 24)).toFixed(2)} días</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Número Total de Fallos:</span>
          <span class="value">${totalFailures}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Despachos Ineficientes:</span>
          <span class="value">${inefficientDispatchCount}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Costo de Operación:</span>
          <span class="value">$${operationalCost.toFixed(2)}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Costo de Espera:</span>
          <span class="value">$${totalWaitTimeCost.toFixed(2)}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Costo de Reparación:</span>
          <span class="value">$${totalReworkCost.toFixed(2)}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Costo de Horas Extras:</span>
          <span class="value">$${totalOvertimeCost.toFixed(2)}</span>
        </div>
        <div class="sim-summary-item">
          <span class="label">Costo Total de Operación:</span>
          <span class="value">$${totalCost.toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  createResultsTable(results) {
    if (!results || results.size === 0) {
      return '<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles. Por favor, ejecute una simulación primero.</p>';
    }

    let tableHtml = `
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
      // Only show elements that were executed or have some value
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

  _calculateWorkPlans(workloadMs, calendar, config) {
    const baseRatePerHour = config.cost.baseRatePerHour || 0;
    const overtimeRules = config.overtime || { payMultiplier: 1.5 };
    const overtimeMultiplier = overtimeRules.payMultiplier || 1.5;
    const OVERTIME_HOURS_PER_DAY = 3; // Assumption for the overtime plan

    // 1. Normal Plan Calculation
    const normalCost = (workloadMs / 3600000) * baseRatePerHour;
    const normalDurationMinutes = workloadMs / 60000;
    const normalEndDate = calendar.addWorkingTime(new Date(0), normalDurationMinutes);
    const normalCalendarDays = (normalEndDate.getTime() / (1000 * 60 * 60 * 24));

    // 2. Overtime Plan Calculation
    let overtimeCost = 0;
    let remainingWorkloadMs = workloadMs;
    let overtimeCalendarDays = 0;
    const minutesPerDay = (calendar.config.workingHours.end.hour - calendar.config.workingHours.start.hour) * 60;
    const msPerDay = minutesPerDay * 60000;
    const overtimeMsPerDay = OVERTIME_HOURS_PER_DAY * 3600000;

    while (remainingWorkloadMs > 0) {
        overtimeCalendarDays++;
        const normalWorkThisDay = Math.min(remainingWorkloadMs, msPerDay);
        overtimeCost += (normalWorkThisDay / 3600000) * baseRatePerHour;
        remainingWorkloadMs -= normalWorkThisDay;

        if (remainingWorkloadMs > 0) {
            const overtimeWorkThisDay = Math.min(remainingWorkloadMs, overtimeMsPerDay);
            overtimeCost += (overtimeWorkThisDay / 3600000) * baseRatePerHour * overtimeMultiplier;
            remainingWorkloadMs -= overtimeWorkThisDay;
        }
    }

    return {
      normalPlan: { cost: normalCost, duration: normalCalendarDays },
      overtimePlan: { cost: overtimeCost, duration: overtimeCalendarDays }
    };
  }

  getChartData(metric) {
    if (metric === 'workPlan') {
      if (this.simulationReports.length === 0) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero para calcular el plan de trabajo.', type: 'warning', duration: 4000 });
        return { labels: [], datasets: [] };
      }

      const report = this.simulationReports[0];
      let totalWorkloadMs = 0;
      report.results.forEach(res => {
        totalWorkloadMs += (res.totalProcessingTime || 0) + (res.totalReworkTime || 0);
      });

      if (totalWorkloadMs <= 0) {
        this._notifications.showNotification({ text: 'No hay trabajo procesado en la simulación para generar un plan.', type: 'info', duration: 3000 });
        return { labels: [], datasets: [] };
      }

      const plans = this._calculateWorkPlans(totalWorkloadMs, this._simulationEngine.calendar, this._simulationEngine.rootConfig);

      const labels = ['Costo Total ($)', 'Duración Total (Días Naturales)'];
      const normalData = [plans.normalPlan.cost, plans.normalPlan.duration];
      const extraData = [plans.overtimePlan.cost, plans.overtimePlan.duration];

      return {
        labels,
        datasets: [
          {
            label: 'Plan de Trabajo Normal',
            data: normalData,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: 'Plan de Trabajo con Horas Extras',
            data: extraData,
            backgroundColor: 'rgba(255, 159, 64, 0.5)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1
          }
        ]
      };
    }

    if (metric === 'dailyProduction') {
      if (this.simulationReports.length === 0) {
        return { labels: [], datasets: [] };
      }
      const report = this.simulationReports[0];
      const dailyData = report.dailyCompletions;

      if (!dailyData || dailyData.size === 0) {
        return { labels: [], datasets: [] };
      }

      // Sort the data by date
      const sortedDailyData = Array.from(dailyData.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));

      const labels = sortedDailyData.map(entry => entry[0]);
      const data = sortedDailyData.map(entry => entry[1]);

      return {
        labels,
        datasets: [{
          label: 'Piezas Completadas por Día',
          data: data,
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 1
        }]
      };
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

    if (metric === 'pareto') {
        const failedTasks = tasks.filter(t => t.failureCount > 0);
        failedTasks.sort((a, b) => b.failureCount - a.failureCount);

        const labels = failedTasks.map(t => t.name);
        const failureData = failedTasks.map(t => t.failureCount);
        const totalFailures = failureData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = failureData.map(count => {
            cumulative += count;
            return totalFailures > 0 ? (cumulative / totalFailures) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Número de Fallos',
                    data: failureData,
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderColor: 'rgba(255, 99, 132, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    if (metric === 'paretoCost') {
        const costTasks = tasks.filter(t => t.totalCost > 0);
        costTasks.sort((a, b) => b.totalCost - a.totalCost);

        const labels = costTasks.map(t => t.name);
        const costData = costTasks.map(t => t.totalCost);
        const totalCostValue = costData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = costData.map(count => {
            cumulative += count;
            return totalCostValue > 0 ? (cumulative / totalCostValue) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Costo Total',
                    data: costData,
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    if (metric === 'paretoTime') {
        const timedTasks = tasks.filter(t => t.totalProcessingTime > 0);
        timedTasks.sort((a, b) => b.totalProcessingTime - a.totalProcessingTime);

        const labels = timedTasks.map(t => t.name);
        const timeData = timedTasks.map(t => t.totalProcessingTime);
        const totalTime = timeData.reduce((sum, count) => sum + count, 0);

        let cumulative = 0;
        const cumulativePercentage = timeData.map(count => {
            cumulative += count;
            return totalTime > 0 ? (cumulative / totalTime) * 100 : 0;
        });

        return {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Tiempo de Proceso Total',
                    data: timeData,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    yAxisID: 'y',
                },
                {
                    type: 'line',
                    label: 'Porcentaje Acumulado',
                    data: cumulativePercentage,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false,
                    yAxisID: 'y1',
                }
            ]
        };
    }

    let dataProperty, label;
    if (metric === 'cost') { dataProperty = 'totalCost'; label = 'Costo Total por Tarea'; }
    else if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso Total'; }
    else if (metric === 'waitTime') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'allWaitTimes') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera Total (Recursos)'; }
    else if (metric === 'transportWaitTime') { dataProperty = 'totalTransportWaitTime'; label = 'Tiempo de Espera Total (Transporte)'; }
    else if (metric === 'inefficientDispatch') { dataProperty = 'inefficientDispatchCount'; label = 'Total de Despachos Ineficientes'; }
    else if (metric === 'resourceQuantity') { dataProperty = 'value'; label = 'Cantidad de Recursos por Tarea'; }
    else if (metric === 'overtime') { dataProperty = 'totalOvertime'; label = 'Tiempo Extra Total'; }
    else if (metric === 'reworkTime') { dataProperty = 'totalReworkTime'; label = 'Tiempo de Reparación Total'; }
    else if (metric === 'reworkCost') { dataProperty = 'totalReworkCost'; label = 'Costo de Reparación Total'; }
    else if (metric === 'waitTimeCost') { dataProperty = 'totalWaitTimeCost'; label = 'Costo de Espera Total'; }

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
    this.simulationReports = [];
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
