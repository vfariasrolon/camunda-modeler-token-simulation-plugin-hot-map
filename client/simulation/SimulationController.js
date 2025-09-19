import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData, getExtensionProperty, formatMilliseconds, formatCurrency } from './util';

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
    this.simulationReports = [];
    this.overtimeReport = null;
    this.normalReport = null;
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
    this._eventBus.on('simulation.plan_summary.requested', () => this.showPlanBreakdown());
  }

  createScheduleHtml(calendar) {
    if (!calendar || !calendar.config) {
        return '<p>No se ha definido un cronograma de trabajo.</p>';
    }

    const { workingDays, workingHours, holidays } = calendar.config;

    if (!workingDays || !workingHours) {
        return '<p>La configuración del cronograma es incompleta o no es válida.</p>';
    }

    const formatTime = (timeObj) => {
      if (!timeObj || typeof timeObj.hour === 'undefined' || typeof timeObj.minute === 'undefined') return 'N/A';
      const h = String(timeObj.hour).padStart(2, '0');
      const m = String(timeObj.minute).padStart(2, '0');
      return `${h}:${m}`;
    };

    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    let workweekHtml = '';

    for (let i = 0; i < 7; i++) {
        const isWorking = workingDays.includes(i);
        workweekHtml += `
            <tr>
              <td>${dayNames[i]}</td>
              <td>${isWorking ? formatTime(workingHours.start) : 'No Laborable'}</td>
              <td>${isWorking ? formatTime(workingHours.end) : 'No Laborable'}</td>
            </tr>
        `;
    }

    let holidaysHtml = '';
    if (holidays && holidays.length > 0) {
      holidaysHtml = '<ul>';
      for (const holiday of holidays) {
        holidaysHtml += `<li>${holiday}</li>`;
      }
      holidaysHtml += '</ul>';
    } else {
      holidaysHtml = '<p>No hay días festivos definidos.</p>';
    }

    return `
      <h4>Horario de Trabajo Utilizado en la Simulación</h4>
      <table class="sim-results-table">
        <thead>
          <tr>
            <th>Día</th>
            <th>Inicio</th>
            <th>Fin</th>
          </tr>
        </thead>
        <tbody>
          ${workweekHtml}
        </tbody>
      </table>
      <h4 style="margin-top: 20px;">Días Festivos</h4>
      ${holidaysHtml}
    `;
  }

  _runAndGetReport(options) {
    const results = this._simulationEngine.run(options);
    if (!results) {
        this._notifications.showNotification({ text: 'La simulación falló al ejecutarse.', type: 'error', duration: 5000 });
        return null;
    }

    const totalWorkingDays = this._simulationEngine.calendar.calculateWorkingDays(
      new Date(this._simulationEngine.simulationStartTime),
      new Date(this._simulationEngine.clock)
    );

    let totalCost = 0;
    results.forEach(result => {
      totalCost += result.totalCost || 0;
    });

    const report = {
        results: results,
        completedInstances: this._simulationEngine.completedInstances,
        calendarDuration: this._simulationEngine.calendar.calculateBusinessDurationInMinutes(
            new Date(this._simulationEngine.simulationStartTime),
            new Date(this._simulationEngine.clock)
        ) * 60 * 1000, // convert minutes to ms
        dailyCompletions: new Map(this._simulationEngine.dailyCompletions),
        createdAt: new Date(),
        totalWorkingDays: totalWorkingDays,
        totalCost: totalCost
    };
    return report;
  }

  runSimulation() {
    const rootConfig = this._simulationEngine._findRootConfig();
    if (!rootConfig) {
      this._notifications.showNotification({
        text: 'Error: No se encontró una configuración raíz única. Por favor, designe un único Evento de Inicio como "Configuración Raíz".',
        type: 'error',
        duration: 8000
      });
      return;
    }

    this._notifications.showNotification({ text: 'Ejecutando simulaciones (normal y con horas extras)...', type: 'info', duration: 2000 });

    this.lastMetric = null;

    // Run normal simulation
    this.clear();
    this.normalReport = this._runAndGetReport({ useOvertime: false });

    // Run overtime simulation
    // We DON'T clear here so the calendar from the normal run is preserved for the overtime run
    this.overtimeReport = this._runAndGetReport({ useOvertime: true });

    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Una de las simulaciones falló. No se pueden mostrar resultados comparativos.', type: 'error', duration: 6000 });
      return;
    }

    this._notifications.showNotification({ text: 'Simulaciones completadas', type: 'info', duration: 3000 });

    // The main report for the summary panel is the overtime one, as it's the most comprehensive.
    this.simulationReports = [this.overtimeReport];

    this.simulationResults = this.overtimeReport.results; // Heatmap and overlays are based on the main report.

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
                if (metric === 'cost') overlayText = `Costo: ${formatCurrency(result.totalCost, 'MXN')}`;
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
                else if (metric === 'reworkCost') overlayText = `Costo Reparación: ${formatCurrency(result.totalReworkCost, 'MXN')}`;
                else if (metric === 'waitTimeCost') overlayText = `Costo Espera: ${formatCurrency(result.totalWaitTimeCost, 'MXN')}`;
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

    // This metric does not require a simulation run
    if (metric === 'inputParams') {
      const data = this.getInputParametersData();
      const tableHtml = this.createInputParametersTable(data);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
      this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
      return;
    }

    // HTML-based reports
    if (metric === 'overallSummary') {
      const summaryHtml = this.createOverallSummary(this.overtimeReport, this.normalReport);
      this._chartPanel.showHtmlContent(summaryHtml);
      return;
    }

    if (metric === 'resultsTable') {
      const tableHtml = this.createResultsTable(this.simulationResults);
      this._chartPanel.showHtmlContent(tableHtml);
      return;
    }

    // Canvas-based charts
    this._chartPanel.showCanvas();
    if (this._chart) {
      this._chart.destroy();
    }

    const chartConfig = this.getChartConfig(metric);
    if (!chartConfig) {
      return; // getChartConfig is responsible for showing an error message
    }

    const ctx = this._chartPanel.getCanvas().getContext('2d');
    this._chart = new Chart(ctx, chartConfig);
  }

  getChartConfig(metric) {
    if (metric === 'productionCompare') {
      if (!this.normalReport || !this.overtimeReport) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 });
        this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación comparativa disponibles.</p>');
        return null;
      }
      const normalReport = this.normalReport;
      const overtimeReport = this.overtimeReport;
      const allDates = [...new Set([...normalReport.dailyCompletions.keys(), ...overtimeReport.dailyCompletions.keys()])];
      allDates.sort((a, b) => new Date(a) - new Date(b));

      const normalData = allDates.map(date => normalReport.dailyCompletions.get(date) || 0);
      const overtimeData = allDates.map(date => overtimeReport.dailyCompletions.get(date) || 0);

      // console.log('--- CHART DATA ---');
      // console.log('Labels (Dates):', allDates);
      // console.log('Normal Production Data:', normalData);
      // console.log('Overtime Production Data:', overtimeData);

      return {
        type: 'bar',
        data: {
          labels: allDates,
          datasets: [
            {
              label: 'Producción Normal',
              data: normalData,
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            },
            {
              label: 'Producción con Horas Extras',
              data: overtimeData,
              backgroundColor: 'rgba(255, 159, 64, 0.5)',
              borderColor: 'rgba(255, 159, 64, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Piezas Completadas por Día' }
            }
          }
        }
      };
    }

    const chartData = this.getChartData(metric);

    let chartType = 'bar';
    if (metric === 'scatter') chartType = 'scatter';
    if (metric === 'pareto' || metric === 'paretoTime' || metric === 'paretoCost') chartType = 'bar';

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
            grid: { drawOnChartArea: false },
        };
    }

    if (metric === 'scatter') {
        options.scales.x = {
            type: 'linear',
            position: 'bottom',
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

    const timeMetrics = ['processTime', 'waitTime', 'allWaitTimes', 'overtime', 'reworkTime'];
    if (timeMetrics.includes(metric) || metric === 'paretoTime') {
        options.plugins = {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) { label += ': '; }
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
                        if (label) { label += ': '; }
                        if (context.parsed.y !== null) {
                          if (context.dataset.yAxisID === 'y1') {
                            label += context.parsed.y.toFixed(1) + '%';
                          } else {
                            label += formatCurrency(context.parsed.y, 'MXN');
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
                        const time = formatMilliseconds(context.parsed.x * 1000);
                        const cost = formatCurrency(context.parsed.y, 'MXN');
                        return `${context.chart.data.labels[context.dataIndex]}: (${time}, ${cost})`;
                    }
                }
            }
        };
    }

    return {
      type: chartType,
      data: { labels: chartData.labels, datasets: datasets },
      options: options
    };
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

  createOverallSummary(report, normalReport) {
    let totalCost = 0, totalReworkCost = 0, totalOvertimeCost = 0,
        totalFailures = 0, totalReworkTime = 0, totalOvertimeMs = 0,
        totalDoubleOvertimeCost = 0, totalTripleOvertimeCost = 0,
        totalNormalTimeCost = 0;

    // console.log('--- SUMMARY DATA ---');
    // console.log('Overtime Report:', report);
    // console.log('Normal Report:', normalReport);


    report.results.forEach(result => {
      totalCost += result.totalCost || 0;
      totalReworkCost += result.totalReworkCost || 0;
      totalOvertimeCost += result.totalOvertimeCost || 0;
      totalFailures += result.failureCount || 0;
      totalReworkTime += result.totalReworkTime || 0;
      totalOvertimeMs += result.totalOvertime || 0;
      totalDoubleOvertimeCost += result.totalDoubleOvertimeCost || 0;
      totalTripleOvertimeCost += result.totalTripleOvertimeCost || 0;
      totalNormalTimeCost += result.totalNormalTimeCost || 0;
    });

    const totalTimeDays = report.totalWorkingDays;
    const totalTimeHours = (report.calendarDuration / (1000 * 60 * 60)).toFixed(2);
    const overtimePercentage = report.calendarDuration > 0
      ? ((totalOvertimeMs / report.calendarDuration) * 100).toFixed(1)
      : 0;

    return `
      <div class="sim-summary-container">
        <h2>Resumen General</h2>
        <div class="sim-summary-grid">
          <div class="sim-summary-item">
            <span class="label">Piezas Producidas:</span>
            <span class="value">${report.completedInstances}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Total de Errores:</span>
            <span class="value">${totalFailures}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Días Laborales Totales:</span>
            <span class="value">${totalTimeDays}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Tiempo Total (Horas Netas):</span>
            <span class="value">${totalTimeHours}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Tiempo de Reparación Total:</span>
            <span class="value">${formatMilliseconds(totalReworkTime)}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Total de Horas Extra:</span>
            <span class="value">${formatMilliseconds(totalOvertimeMs)}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Total:</span>
            <span class="value">${formatCurrency(totalCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo del Tiempo de Reparación:</span>
            <span class="value">${formatCurrency(totalReworkCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Total Horas Extras:</span>
            <span class="value">${formatCurrency(totalOvertimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Horas Extras Dobles:</span>
            <span class="value">${formatCurrency(totalDoubleOvertimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Horas Extras Triples:</span>
            <span class="value">${formatCurrency(totalTripleOvertimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Costo Horas Normales:</span>
            <span class="value">${formatCurrency(totalNormalTimeCost, 'MXN')}</span>
          </div>
          <div class="sim-summary-item">
            <span class="label">Porcentaje de Tiempo Extra:</span>
            <span class="value">${overtimePercentage}%</span>
          </div>
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
      if (result.executionCount > 0 || result.totalCost > 0 || result.totalProcessingTime > 0) {
        tableHtml += `
          <tr>
            <td>${result.name}</td>
            <td>${result.executionCount}</td>
            <td>${result.failureCount}</td>
            <td>${formatMilliseconds(result.totalWaitTime)}</td>
            <td>${formatMilliseconds(result.totalProcessingTime)}</td>
            <td>${formatCurrency(result.totalCost, 'MXN')}</td>
          </tr>
        `;
      }
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  getChartData(metric) {
    if (metric === 'dailyProduction') {
      if (!this.normalReport) {
        return { labels: [], datasets: [] };
      }
      const report = this.normalReport;
      const dailyData = report.dailyCompletions;

      if (!dailyData || dailyData.size === 0) {
        return { labels: [], datasets: [] };
      }

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

  showPlanBreakdown() {
    if (!this.normalReport || !this.overtimeReport) {
        this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero.', type: 'warning', duration: 4000 });
        return;
    }

    const aggregateReportCosts = (report) => {
      let totalOperationCost = 0;
      let totalDoubleOvertimeCost = 0;
      let totalTripleOvertimeCost = 0;

      report.results.forEach(r => {
        totalOperationCost += r.totalOperationCost || 0;
        totalDoubleOvertimeCost += r.totalDoubleOvertimeCost || 0;
        totalTripleOvertimeCost += r.totalTripleOvertimeCost || 0;
      });

      return { totalOperationCost, totalDoubleOvertimeCost, totalTripleOvertimeCost };
    };

    const normalCosts = aggregateReportCosts(this.normalReport);
    const overtimeCosts = aggregateReportCosts(this.overtimeReport);

    const normalPlan = {
      totalDays: this.normalReport.totalWorkingDays,
      totalCost: this.normalReport.totalCost,
      operationCost: normalCosts.totalOperationCost,
      completedInstances: this.normalReport.completedInstances,
      avgCostPerPiece: this.normalReport.completedInstances > 0 ? (this.normalReport.totalCost / this.normalReport.completedInstances) : 0
    };

    const overtimePlan = {
      totalDays: this.overtimeReport.totalWorkingDays,
      totalCost: this.overtimeReport.totalCost,
      operationCost: overtimeCosts.totalOperationCost,
      doublePremium: overtimeCosts.totalDoubleOvertimeCost,
      triplePremium: overtimeCosts.totalTripleOvertimeCost,
      completedInstances: this.overtimeReport.completedInstances,
      avgCostPerPiece: this.overtimeReport.completedInstances > 0 ? (this.overtimeReport.totalCost / this.overtimeReport.completedInstances) : 0
    };

    const scheduleHtml = this.createScheduleHtml(this._simulationEngine.calendar);

    const helpText = `
      <div class="help-content-container">
        <h4>¿Cómo leer los costos?</h4>
        <ul>
          <li><strong>Costo de Operación:</strong> Es el costo de todo el tiempo trabajado, pagado a tarifa normal. Imagina que es el sueldo base que le pagas a un cocinero por preparar jugos.</li>
          <li><strong>Pago Extra (Doble/Triple):</strong> Es el <strong>bono adicional</strong> que se paga por trabajar fuera del horario. Es el dinero extra que le das al cocinero por quedarse más tiempo.</li>
          <li><strong>Costo Total:</strong> Es la suma de <code>Costo de Operación</code> + todos los <code>Pagos Extras</code>.</li>
        </ul>
        <h4>Ejemplo con Frutas:</h4>
        <p>Quieres hacer 10 jugos de naranja. Cada uno toma 1 hora en prepararse y pagas $10 la hora. Tu jornada normal es de 8 horas.</p>
        <p><strong>Plan Normal:</strong> Tomas 10 horas repartidas en 2 días.</p>
        <ul>
          <li><code>Costo de Operación</code>: 10 horas x $10/hora = $100.</li>
          <li><code>Pago Extra</code>: $0.</li>
          <li><code>Costo Total</code>: $100.</li>
        </ul>
        <p><strong>Plan con Extras:</strong> Trabajas 10 horas seguidas en 1 solo día. Las primeras 8 horas son normales y las últimas 2 son extras que se pagan al doble.</p>
        <ul>
          <li><code>Costo de Operación</code>: 10 horas x $10/hora = $100 (el costo base del trabajo).</li>
          <li><code>Pago Extra (Doble)</code>: 2 horas x ($10/hora de bono) = $20.</li>
          <li><code>Costo Total</code>: $100 (operación) + $20 (extra) = $120.</li>
        </ul>
      </div>
    `;

    const comparisonHtml = `
      <style>
        .plan-comparison-container { display: flex; gap: 20px; justify-content: space-around; }
        .plan-card { border: 1px solid #ccc; border-radius: 8px; padding: 15px; width: 45%; background-color: #f9f9f9; }
        .plan-card h4 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        .plan-card .sim-summary-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .plan-card .sim-summary-item:last-child { border-bottom: none; }
        .plan-card .label { font-weight: 500; }
        .plan-card .value { font-weight: bold; }
        .total-cost { font-size: 1.1em; border-top: 2px solid #ccc; margin-top: 10px; padding-top: 10px; }
        .help-icon-button { font-family: monospace; font-weight: bold; cursor: pointer; border: 1px solid #999; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; justify-content: center; align-items: center; font-size: 14px; }
        .hidden-help { display: none; }
      </style>
      <div class="sim-summary-container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h2>Comparativo de Planes</h2>
          <span id="plan-comparison-help-icon" class="help-icon-button" title="Ayuda sobre costos">?</span>
        </div>
        <div id="plan-comparison-help-content" class="hidden-help" style="padding: 10px; border: 1px solid #ddd; margin-top: 10px; border-radius: 5px; background: #f0f0f0;">
          ${helpText}
        </div>
        <div class="plan-comparison-container" style="margin-top: 20px;">
          <div class="plan-card">
            <h4>Plan Normal</h4>
            <div class="sim-summary-item">
              <span class="label">Duración (Días Laborales):</span>
              <span class="value">${normalPlan.totalDays}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Piezas Producidas:</span>
              <span class="value">${normalPlan.completedInstances}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo de Operación:</span>
              <span class="value">${formatCurrency(normalPlan.operationCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item total-cost">
              <span class="label">Costo Total:</span>
              <span class="value">${formatCurrency(normalPlan.totalCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo Promedio / Pieza:</span>
              <span class="value">${formatCurrency(normalPlan.avgCostPerPiece, 'MXN')}</span>
            </div>
          </div>
          <div class="plan-card">
            <h4>Plan con Horas Extras</h4>
            <div class="sim-summary-item">
              <span class="label">Duración (Días Laborales):</span>
              <span class="value">${overtimePlan.totalDays}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Piezas Producidas:</span>
              <span class="value">${overtimePlan.completedInstances}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo de Operación:</span>
              <span class="value">${formatCurrency(overtimePlan.operationCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Pago Extra (Doble):</span>
              <span class="value">${formatCurrency(overtimePlan.doublePremium, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Pago Extra (Triple):</span>
              <span class="value">${formatCurrency(overtimePlan.triplePremium, 'MXN')}</span>
            </div>
            <div class="sim-summary-item total-cost">
              <span class="label">Costo Total:</span>
              <span class="value">${formatCurrency(overtimePlan.totalCost, 'MXN')}</span>
            </div>
            <div class="sim-summary-item">
              <span class="label">Costo Promedio / Pieza:</span>
              <span class="value">${formatCurrency(overtimePlan.avgCostPerPiece, 'MXN')}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const finalHtml = scheduleHtml + '<hr style="margin: 20px 0;"/>' + comparisonHtml;

    this._eventBus.fire('simulation.schedule.show', { html: finalHtml });

    setTimeout(() => {
      const helpIcon = document.getElementById('plan-comparison-help-icon');
      const helpContent = document.getElementById('plan-comparison-help-content');
      if (helpIcon && helpContent) {
        helpIcon.addEventListener('click', () => {
          helpContent.classList.toggle('hidden-help');
        });
      }
    }, 100);
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

// Jules verification comment 2
