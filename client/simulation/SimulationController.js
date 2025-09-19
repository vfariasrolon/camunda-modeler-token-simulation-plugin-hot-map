import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
import Chart from 'chart.js/auto';
import { getSimulationData, getExtensionProperty, formatMilliseconds, formatCurrency } from './util';

const RunIcon = `<span class="bts-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M 4 2 L 4 14 L 14 8 Z" fill="currentColor" /></svg></span>`;
const ShowIcon = `<span class="bts-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80"><circle r="39"/><path fill="#fff" d="M0,38a38,38 0 0 1 0,-76a19,19 0 0 1 0,38a19,19 0 0 0 0,38"/><circle r="5" cy="19" fill="#fff"/><circle r="5" cy="-19"/></svg></span>`;
const ChartIcon = `<span class="bts-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" /></svg></span>`;

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
    this.simulationResults = null;
    this.overtimeReport = null;
    this.normalReport = null;
    this.lastMetric = null;

    this._eventBus.on('canvas.init', () => {
      this.init();
    });
  }

  init() {
    const runButton = domify(`<div class="bts-entry" title="Ejecutar Simulación">${RunIcon}</div>`);
    const showButton = domify(`<div class="bts-entry" title="Mostrar Análisis de Frecuencia">${ShowIcon}</div>`);
    const chartButton = domify(`<div class="bts-entry" title="Mostrar Panel de Análisis">${ChartIcon}</div>`);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());
    domEvent.bind(chartButton, 'click', () => this._chartPanel.toggle(true));

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);
    this._tokenSimulationPalette.addEntry(chartButton, 14);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));

    this._eventBus.on('simulation.charts.opened', () => this.showChart());
    this._eventBus.on('simulation.charts.typeChanged', () => this.showChart());
  }

  createComparisonCardsHtml() {
    if (!this.normalReport || !this.overtimeReport) return '';

    const aggregateReportCosts = (report) => {
      let totalOperationCost = 0, totalDoubleOvertimeCost = 0, totalTripleOvertimeCost = 0;
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
    const helpText = `<h4>¿Cómo leer los costos?</h4><ul><li><strong>Costo de Operación:</strong> Costo del trabajo a tarifa normal.</li><li><strong>Pago Extra:</strong> Bono adicional por sobretiempo.</li><li><strong>Costo Total:</strong> Suma de operación y extras.</li></ul>`;

    return `
      <style>
        .plan-comparison-container { display: flex; gap: 20px; justify-content: space-around; flex-wrap: wrap; }
        .plan-card { border: 1px solid #ccc; border-radius: 8px; padding: 15px; width: 45%; min-width: 250px; background-color: #f9f9f9; }
        .plan-card h4 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
        .plan-card .sim-summary-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .plan-card .sim-summary-item:last-child { border-bottom: none; }
        .plan-card .label { font-weight: 500; }
        .plan-card .value { font-weight: bold; }
        .total-cost { font-size: 1.1em; border-top: 2px solid #ccc; margin-top: 10px; padding-top: 10px; }
        .help-icon-button { font-family: monospace; font-weight: bold; cursor: pointer; border: 1px solid #999; border-radius: 50%; width: 20px; height: 20px; display: inline-flex; justify-content: center; align-items: center; font-size: 14px; }
        .hidden-help { display: none; }
        .comparison-title-container { display: flex; justify-content: space-between; align-items: center; }
        .schedule-container { padding: 10px; border: 1px solid #ddd; margin-top: 10px; border-radius: 5px; background: #f0f0f0; }
      </style>
      <div class="schedule-container">${scheduleHtml}</div>
      <hr style="margin: 20px 0;"/>
      <div class="comparison-title-container">
        <h2>Comparativo de Planes</h2>
        <span id="plan-comparison-help-icon" class="help-icon-button" title="Ayuda sobre costos">?</span>
      </div>
      <div id="plan-comparison-help-content" class="hidden-help">${helpText}</div>
      <div class="plan-comparison-container" style="margin-top: 20px;">
        <div class="plan-card"><h4>Plan Normal</h4><div class="sim-summary-item"><span class="label">Días Laborales:</span><span class="value">${normalPlan.totalDays}</span></div><div class="sim-summary-item"><span class="label">Piezas Producidas:</span><span class="value">${normalPlan.completedInstances}</span></div><div class="sim-summary-item"><span class="label">Costo Operación:</span><span class="value">${formatCurrency(normalPlan.operationCost, 'MXN')}</span></div><div class="sim-summary-item total-cost"><span class="label">Costo Total:</span><span class="value">${formatCurrency(normalPlan.totalCost, 'MXN')}</span></div></div>
        <div class="plan-card"><h4>Plan con Horas Extras</h4><div class="sim-summary-item"><span class="label">Días Laborales:</span><span class="value">${overtimePlan.totalDays}</span></div><div class="sim-summary-item"><span class="label">Piezas Producidas:</span><span class="value">${overtimePlan.completedInstances}</span></div><div class="sim-summary-item"><span class="label">Costo Operación:</span><span class="value">${formatCurrency(overtimePlan.operationCost, 'MXN')}</span></div><div class="sim-summary-item"><span class="label">Pago Extra (Doble):</span><span class="value">${formatCurrency(overtimePlan.doublePremium, 'MXN')}</span></div><div class="sim-summary-item"><span class="label">Pago Extra (Triple):</span><span class="value">${formatCurrency(overtimePlan.triplePremium, 'MXN')}</span></div><div class="sim-summary-item total-cost"><span class="label">Costo Total:</span><span class="value">${formatCurrency(overtimePlan.totalCost, 'MXN')}</span></div></div>
      </div>
    `;
  }

  createScheduleHtml(calendar) {
    if (!calendar || !calendar.config) { return ''; }
    const { workingDays, workingHours, holidays } = calendar.config;
    const formatTime = (timeObj) => `${String(timeObj.hour).padStart(2, '0')}:${String(timeObj.minute).padStart(2, '0')}`;
    const dayNames = ["D", "L", "M", "M", "J", "V", "S"];
    let workweekHtml = '';
    for (let i = 0; i < 7; i++) { workweekHtml += `<td class="${workingDays.includes(i) ? 'working' : ''}">${dayNames[i]}</td>`; }
    return `<style>.schedule-table {width: 100%; text-align: center;} .working {font-weight: bold; color: #1565c0;}</style><h4>Horario de Trabajo</h4><table class="schedule-table"><tr>${workweekHtml}</tr></table><p>${formatTime(workingHours.start)} - ${formatTime(workingHours.end)}</p>${holidays.length ? `<p><strong>Días Festivos:</strong> ${holidays.join(', ')}</p>` : ''}`;
  }

  _runAndGetReport(rootConfig, options) {
    const results = this._simulationEngine.run(rootConfig, options);
    if (!results) return null;
    const totalWorkingDays = this._simulationEngine.calendar.calculateWorkingDays(new Date(this._simulationEngine.simulationStartTime), new Date(this._simulationEngine.clock));
    let totalCost = 0;
    results.forEach(result => { totalCost += result.totalCost || 0; });
    return { results, completedInstances: this._simulationEngine.completedInstances, dailyCompletions: new Map(this._simulationEngine.dailyCompletions), totalWorkingDays, totalCost };
  }

  runSimulation() {
    const rootConfig = this._simulationEngine._findRootConfig();
    if (!rootConfig) {
      this._notifications.showNotification({ text: 'Error: No se encontró una configuración raíz única.', type: 'error', duration: 8000 });
      return;
    }
    this._notifications.showNotification({ text: 'Ejecutando simulaciones...', type: 'info', duration: 2000 });
    this.clear();
    this.normalReport = this._runAndGetReport(rootConfig, { useOvertime: false });
    this.overtimeReport = this._runAndGetReport(rootConfig, { useOvertime: true });
    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Una de las simulaciones falló.', type: 'error', duration: 6000 });
      return;
    }
    this._notifications.showNotification({ text: 'Simulaciones completadas.', type: 'info', duration: 4000 });
    this.simulationResults = this.overtimeReport.results;
    if (this._chartPanel.isOpen()) {
        this.showChart();
    }
  }

  showChart() {
    if (!this.normalReport || !this.overtimeReport) {
      this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles.</p>');
      return;
    }

    const metric = this._chartPanel.getChartType();

    if (metric === 'overallSummary') {
        const comparisonHtml = this.createComparisonCardsHtml();
        this._chartPanel.showComparison(comparisonHtml);
        this._chartPanel.showHtmlContent(''); // Clear bottom content
        setTimeout(() => {
            const helpIcon = document.getElementById('plan-comparison-help-icon');
            const helpContent = document.getElementById('plan-comparison-help-content');
            if (helpIcon && helpContent) {
                helpIcon.addEventListener('click', () => {
                helpContent.classList.toggle('hidden-help');
                });
            }
        }, 100);
        return;
    }

    this._chartPanel.showComparison('');

    if (metric === 'inputParams' || metric === 'resultsTable') {
        const tableHtml = metric === 'inputParams'
            ? this.createInputParametersTable(this.getInputParametersData())
            : this.createResultsTable(this.simulationResults);
        this._chartPanel.showHtmlContent(tableHtml);
        return;
    }

    this._chartPanel.showCanvas();
    if (this._chart) { this._chart.destroy(); }

    const chartConfig = this.getChartConfig(metric);
    if (!chartConfig) {
      this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay datos para este gráfico.</p>');
      return;
    }
    const ctx = this._chartPanel.getCanvas().getContext('2d');
    this._chart = new Chart(ctx, chartConfig);
  }

  getChartConfig(metric) {
    if (metric === 'productionCompare') {
      const allDates = [...new Set([...this.normalReport.dailyCompletions.keys(), ...this.overtimeReport.dailyCompletions.keys()])];
      allDates.sort((a, b) => new Date(a) - new Date(b));
      const normalData = allDates.map(date => this.normalReport.dailyCompletions.get(date) || 0);
      const overtimeData = allDates.map(date => this.overtimeReport.dailyCompletions.get(date) || 0);
      return { type: 'bar', data: { labels: allDates, datasets: [ { label: 'Producción Normal', data: normalData, backgroundColor: 'rgba(54, 162, 235, 0.5)' }, { label: 'Producción con Horas Extras', data: overtimeData, backgroundColor: 'rgba(255, 159, 64, 0.5)' } ] }, options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'Piezas Completadas' } } } } };
    }
    const chartData = this.getChartData(metric);
    if (!chartData || !chartData.data || chartData.data.length === 0) return null;
    let chartType = 'bar';
    if (metric === 'scatter') chartType = 'scatter';
    if (metric.includes('pareto')) chartType = 'bar';
    return { type: chartType, data: { labels: chartData.labels, datasets: chartData.datasets || [{ label: chartData.label, data: chartData.data }] }, options: { scales: { y: { beginAtZero: true } } } };
  }

  getChartData(metric) {
    const tasks = [];
    (this.simulationResults || new Map()).forEach((result, elementId) => {
        const element = this._elementRegistry.get(elementId);
        if (element && is(element, 'bpmn:Task')) { tasks.push({ ...result, name: element.businessObject.name || element.id }); }
    });
    if (metric === 'dailyProduction') {
      const dailyData = this.normalReport.dailyCompletions;
      const sortedDailyData = Array.from(dailyData.entries()).sort((a, b) => new Date(a[0]) - new Date(b[0]));
      return { labels: sortedDailyData.map(entry => entry[0]), datasets: [{ label: 'Piezas Completadas por Día', data: sortedDailyData.map(entry => entry[1]) }] };
    }
    let dataProperty, label;
    if (metric === 'cost') { dataProperty = 'totalCost'; label = 'Costo Total'; }
    else if (metric === 'processTime') { dataProperty = 'totalProcessingTime'; label = 'Tiempo de Proceso'; }
    else if (metric === 'waitTime') { dataProperty = 'totalWaitTime'; label = 'Tiempo de Espera'; }
    else if (metric === 'overtime') { dataProperty = 'totalOvertime'; label = 'Tiempo Extra'; }
    else { return { labels: [], data: [] }; }
    tasks.sort((a, b) => (b[dataProperty] || 0) - (a[dataProperty] || 0));
    const top5 = tasks.slice(0, 5);
    return { labels: top5.map(t => t.name), data: top5.map(t => t[dataProperty]), label: label };
  }

  getInputParametersData() {
    const allElements = this._elementRegistry.getAll();
    const elementsWithData = [];
    allElements.forEach(element => {
      if (is(element, 'bpmn:Process') || is(element, 'bpmn:Participant') || is(element, 'bpmn:Task') || is(element, 'bpmn:StartEvent') || (is(element, 'bpmn:SequenceFlow') && element.source?.type === 'bpmn:ExclusiveGateway')) {
        const data = getSimulationData(element);
        if (data && Object.keys(data).length > 0) {
          elementsWithData.push({ id: element.id, name: element.businessObject.name || element.id, type: element.type, data: data });
        }
      }
    });
    return elementsWithData;
  }

  createInputParametersTable(data) {
    if (!data || data.length === 0) { return '<p>No hay datos para mostrar.</p>'; }
    let tableHtml = `<table class="sim-results-table"><thead><tr><th>Elemento</th><th>Parámetro</th><th>Valor</th></tr></thead><tbody>`;
    data.forEach(element => { Object.entries(element.data).forEach(([key, value]) => { tableHtml += `<tr><td>${element.name}</td><td>${key}</td><td>${JSON.stringify(value)}</td></tr>`; }); });
    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  createResultsTable(results) {
    if (!results || results.size === 0) { return '<p>No hay datos para mostrar.</p>'; }
    let tableHtml = `<table class="sim-results-table"><thead><tr><th>Elemento</th><th>Ejecuciones</th><th>Costo Total</th></tr></thead><tbody>`;
    results.forEach(result => { if (result.executionCount > 0) { tableHtml += `<tr><td>${result.name}</td><td>${result.executionCount}</td><td>${formatCurrency(result.totalCost, 'MXN')}</td></tr>`; } });
    tableHtml += '</tbody></table>';
    return tableHtml;
  }

  adjustHeatmap(type, amount) { if (type === 'radius') this._radius = Math.max(1, this._radius + amount); else if (type === 'blur') this._blur = Math.max(0, this._blur + amount); if (this.lastMetric) this.showMetric(this.lastMetric); }
  showMetric(metric) { this.clearOverlaysAndHeatmap(); this.lastMetric = metric; const dataPoints = []; let max = 0; if (!this.simulationResults) { this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero', type: 'warning', duration: 4000 }); return; } this.simulationResults.forEach((result, elementId) => { const element = this._elementRegistry.get(elementId); if (!element || !is(element, 'bpmn:FlowNode')) return; let value = 0; if (metric === 'frequency') value = result.executionCount; else if (metric === 'cost') value = result.totalCost; else if (metric === 'waitTime') value = result.totalWaitTime / (result.executionCount || 1); else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1); else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1); else if (metric === 'overtime') value = result.totalOvertime; if (value > max) max = value; if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]); }); this.createHeatmap(); this._heatmap.data(dataPoints).max(max || 1).radius(this._radius, this._blur).draw(); this.showOverlays(metric); }
  showOverlays(metric) { const elements = Array.from(this.simulationResults.keys()).map(id => this._elementRegistry.get(id)); elements.forEach(element => { if (!element) return; let overlayText = ''; const result = this.simulationResults.get(element.id); if (result) { if (is(element, 'bpmn:Task')) { if (metric === 'cost') overlayText = `Costo: ${formatCurrency(result.totalCost, 'MXN')}`; else if (metric === 'waitTime') overlayText = `Espera Prom: ${formatMilliseconds(result.totalWaitTime / (result.executionCount || 1))}`; else if (metric === 'processTime') overlayText = `Proceso: ${formatMilliseconds(result.totalProcessingTime / (result.executionCount || 1))}`; else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`; else if (metric === 'overtime') overlayText = `H. Extras: ${formatMilliseconds(result.totalOvertime)}`; } else if (is(element, 'bpmn:EndEvent') && metric === 'cycleTime' && result.totalCycleTime > 0) { overlayText = `Ciclo: ${formatMilliseconds(result.totalCycleTime / (result.executionCount || 1))}`; } } if (overlayText) this._overlays.add(element, 'simulation-overlay', { position: { bottom: -5, left: element.width / 2 - 20 }, html: `<div class="simulation-overlay-text">${overlayText}</div>` }); if (result && is(element, 'bpmn:ExclusiveGateway')) { element.outgoing.forEach(flow => { const flowResult = this.simulationResults.get(flow.id); if (flowResult && result.executionCount > 0 && flowResult.executionCount > 0) { const percentage = (flowResult.executionCount / result.executionCount * 100).toFixed(1); this._overlays.add(flow.id, 'simulation-overlay', { position: { top: -15, left: -20 }, html: `<div class="simulation-overlay-text">${flowResult.executionCount} (${percentage}%)</div>` }); } }); } }); }
  clear() { this.lastMetric = null; this.simulationResults = null; this.normalReport = null; this.overtimeReport = null; this.clearOverlaysAndHeatmap(); if (this._chartPanel.isOpen()) { this._chartPanel.showHtmlContent(''); this._chartPanel.showComparison(''); } }
  clearOverlaysAndHeatmap() { if (this._heatmap) { this._heatmap.destroy(); this._heatmap = null; } domClasses(this._canvas.getContainer()).remove('heatmap-shown'); this._overlays.remove({ type: 'simulation-overlay' }); }
  createHeatmap() { if (this._heatmap) return; this._heatmap = new SimpleHeatSVG(this._canvas); domClasses(this._canvas.getContainer()).add('heatmap-shown'); }
}

SimulationController.$inject = [ 'canvas', 'eventBus', 'simulationPalette', 'simulationEngine', 'elementRegistry', 'overlays', 'tokenSimulationPalette', 'notifications', 'chartPanel' ];
