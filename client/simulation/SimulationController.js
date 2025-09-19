import {
  domify,
  event as domEvent,
  classes as domClasses
} from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import SimpleHeatSVG from '../simpleheat-svg.js';
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
    const chartButton = domify(`<div class="bts-entry" title="Mostrar Análisis de Planes">${ChartIcon}</div>`);

    domEvent.bind(runButton, 'click', () => this.runSimulation());
    domEvent.bind(showButton, 'click', () => this._simulationPalette.toggle());
    domEvent.bind(chartButton, 'click', () => this.showAnalysisPanel());

    this._tokenSimulationPalette.addEntry(domify('<hr class="bts-entry-separator">'), 11);
    this._tokenSimulationPalette.addEntry(runButton, 12);
    this._tokenSimulationPalette.addEntry(showButton, 13);
    this._tokenSimulationPalette.addEntry(chartButton, 14);

    this._simulationPalette.setMetricCallback(this.showMetric.bind(this));
    this._simulationPalette.setClearCallback(this.clear.bind(this));
    this._simulationPalette.setAdjustCallback(this.adjustHeatmap.bind(this));
  }

  showAnalysisPanel() {
    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Por favor, ejecute una simulación primero.', type: 'warning', duration: 4000 });
      this._chartPanel.toggle(true); // Open the panel to show the message
      this._chartPanel.showHtmlContent('<p style="text-align: center; margin-top: 20px;">No hay resultados de simulación disponibles. Por favor, ejecute una simulación.</p>');
      return;
    }

    const analysisHtml = this.createUnifiedComparisonView();

    this._eventBus.fire('simulation.panel.show', {
      html: analysisHtml
    });

    // The timeout is necessary because the event firing is asynchronous,
    // and we need to wait for the panel to render the HTML before we can query for the element.
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

  createUnifiedComparisonView() {
    // 1. Aggregate cost data from reports
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

    // 2. Get Schedule HTML
    const scheduleHtml = this.createScheduleHtml(this._simulationEngine.calendar);

    // 3. Get Help Text
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

    // 4. Assemble the final HTML
    return `
      <style>
        .plan-comparison-container { display: flex; gap: 20px; justify-content: space-around; flex-wrap: wrap; }
        .plan-card { border: 1px solid #ccc; border-radius: 8px; padding: 15px; width: 45%; min-width: 250px; background-color: #f9f9f9; }
        .plan-card h4 { margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
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
      <div class="sim-summary-container">

        <div class="schedule-container">
          ${scheduleHtml}
        </div>

        <hr style="margin: 20px 0;"/>

        <div class="comparison-title-container">
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
      <h4>Horario de Trabajo Utilizado</h4>
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
      <h4 style="margin-top: 10px;">Días Festivos</h4>
      ${holidaysHtml}
    `;
  }

  _runAndGetReport(rootConfig, options) {
    const results = this._simulationEngine.run(rootConfig, options);
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
    this.normalReport = this._runAndGetReport(rootConfig, { useOvertime: false });

    // Run overtime simulation
    this.overtimeReport = this._runAndGetReport(rootConfig, { useOvertime: true });

    if (!this.normalReport || !this.overtimeReport) {
      this._notifications.showNotification({ text: 'Una de las simulaciones falló. No se pueden mostrar resultados comparativos.', type: 'error', duration: 6000 });
      return;
    }

    this._notifications.showNotification({ text: 'Simulaciones completadas. ¡Abra el panel de análisis para ver los resultados!', type: 'info', duration: 4000 });

    this.simulationResults = this.overtimeReport.results;

    if (this._chartPanel.isOpen()) {
        this.showAnalysisPanel();
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
        else if (metric === 'processTime') value = result.totalProcessingTime / (result.executionCount || 1);
        else if (metric === 'cycleTime') value = result.totalCycleTime / (result.executionCount || 1);
        else if (metric === 'overtime') value = result.totalOvertime;

        if (value > max) max = value;
        if (value > 0) dataPoints.push([ Math.round(element.x + element.width / 2), Math.round(element.y + element.height / 2), value ]);
    });

    this.createHeatmap();
    this._heatmap.data(dataPoints).max(max || 1).radius(this._radius, this._blur).draw();
    this.showOverlays(metric);
  }

  showOverlays(metric) {
    const elements = Array.from(this.simulationResults.keys()).map(id => this._elementRegistry.get(id));

    elements.forEach(element => {
        if (!element) return;
        let overlayText = '';
        const result = this.simulationResults.get(element.id);

        if (result) {
            if (is(element, 'bpmn:Task')) {
                if (metric === 'cost') overlayText = `Costo: ${formatCurrency(result.totalCost, 'MXN')}`;
                else if (metric === 'waitTime') overlayText = `Espera Prom: ${formatMilliseconds(result.totalWaitTime / (result.executionCount || 1))}`;
                else if (metric === 'processTime') overlayText = `Proceso: ${formatMilliseconds(result.totalProcessingTime / (result.executionCount || 1))}`;
                else if (metric === 'frequency') overlayText = `Frec: ${result.executionCount}`;
                else if (metric === 'overtime') overlayText = `H. Extras: ${formatMilliseconds(result.totalOvertime)}`;
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

  clear() {
    this.lastMetric = null;
    this.simulationResults = null;
    this.normalReport = null;
    this.overtimeReport = null;
    this.clearOverlaysAndHeatmap();
    if (this._chartPanel.isOpen()) {
      this._chartPanel.showHtmlContent('');
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
