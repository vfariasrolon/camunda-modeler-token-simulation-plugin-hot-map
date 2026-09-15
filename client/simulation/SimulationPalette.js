import {
  domify,
  classes as domClasses,
  event as domEvent
} from 'min-dom';

// Icons from Material Symbols (Apache 2.0) — SVG inline, monocromos.
// Regla: una métrica = un icono distinto. No repetir iconos entre métricas,
// o la columna deja de ser legible de un vistazo.

// --- Navegación ---
const BackIcon = '<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>';

// --- Tiempos (tres iconos distintos, antes eran tres relojes iguales) ---
const WaitTimeIcon = '<path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4a9 9 0 0 0-9 9c0 4.97 4.02 9 9 9a8.994 8.994 0 0 0 7.03-14.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>';
const TotalWaitTimeIcon = '<path d="M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5-4-4V4h8v3.5l-4 4z"/>';
const ProcessTimeIcon = '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>';
const CycleTimeIcon = '<path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8A5.87 5.87 0 0 1 6 12c0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0 8-3.58 8-8 0-1.57-.46-3.03-1.24-4.26z"/>';

// --- Costos (tres iconos distintos, antes eran tres dólares iguales) ---
const CostIcon = '<path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>';
const ReworkCostIcon = '<path d="M14 6.2c-.84-.28-1.63-.51-2.36-.7-1.45-.38-2.01-.65-2.01-1.36 0-.62.57-1.1 1.65-1.1 1.02 0 1.5.42 1.57 1.13h2.06C14.85 2.62 13.98 1.72 12.5 1.4V0h-2.5v1.37C8.4 1.66 7.2 2.53 7.2 3.99c0 1.75 1.4 2.62 3.5 3.13 1.9.46 2.3 1.01 2.3 1.87 0 .72-.6 1.3-1.75 1.3-1.5 0-2.1-.7-2.2-1.6H7.05c.1 1.7 1.35 2.6 2.9 2.9V13h2.5v-1.4c1.75-.28 2.9-1.13 2.9-2.83 0-2.1-1.8-2.82-3.35-3.2zM4 19l3 3h10l3-3-3-3H7l-3 3z"/>';
const IdleCostIcon = '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>';

// --- Calidad y fallos (dos iconos distintos, antes eran dos bichos iguales) ---
const FailureRateIcon = '<path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/>';
const ReworkTimeIcon = '<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>';

// --- Tiempo extra y logística ---
const OvertimeIcon = '<path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>';
const TruckIcon = '<path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM15 11V6h3.5l1.96 2.5H15z"/>';
const WarningIcon = '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>';

// --- Otros ---
const FrequencyIcon = '<path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"/>';
const GroupIcon = '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>';

// --- Controles ---
const ClearIcon = '<path d="M15 16h4v2h-4v-2zm0-8h7v2h-7V8zm0 4h6v2h-6v-2zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12V5z"/>';
const RadiusPlusIcon = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v3H8v2h3v3h2v-3h3v-2h-3V7z"/>';
const RadiusMinusIcon = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M8 11h8v2H8z"/>';
const BlurPlusIcon = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M11 7h2v4h4v2h-4v4h-2v-4H7v-2h4V7z" opacity=".55"/>';
const BlurMinusIcon = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M6 11h12v2H6z"/>';

// --- Ayuda ---
const HelpIcon = '<path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>';

// --- Exportar ---
const ExportIcon = '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>';

// Catálogo de ayuda: alimenta el panel del botón ?.
// Se mantiene junto a los iconos para que icono y explicación no se desincronicen.
const HELP_SECTIONS = [
  {
    title: 'Mapa de calor — tiempos',
    items: [
      [ WaitTimeIcon, 'Tiempo de espera',
        'Cuánto espera una tarea, en promedio, antes de empezar. Si una tarea brilla mucho aquí, <strong>es un cuello de botella</strong>: los recursos no dan abasto.' ],
      [ TotalWaitTimeIcon, 'Espera total',
        'La suma de toda la espera acumulada, no el promedio. Útil para ver el volumen total de tiempo perdido.' ],
      [ ProcessTimeIcon, 'Tiempo de proceso',
        'Tiempo de <strong>trabajo activo</strong>, sin contar esperas. Es lo que tarda la tarea en sí.' ],
      [ CycleTimeIcon, 'Tiempo de ciclo',
        'Cuánto tarda un caso completo, de principio a fin. Se dibuja sobre los <strong>eventos de fin</strong>.' ]
    ]
  },
  {
    title: 'Costos',
    items: [
      [ CostIcon, 'Costo total',
        'Coste acumulado en cada tarea: operación + primas de horas extra + espera. <em>Piensa en él como lo que cuesta producir ahí.</em>' ],
      [ ReworkCostIcon, 'Costo de reparación',
        'Lo que cuesta el tiempo dedicado a <strong>rehacer trabajo</strong> tras un fallo.' ],
      [ IdleCostIcon, 'Costo de tiempos muertos',
        'Lo que <strong>pagas mientras nadie trabaja</strong>: recursos ociosos esperando. Dinero que se va sin producir nada.' ]
    ]
  },
  {
    title: 'Calidad y fallos',
    items: [
      [ FailureRateIcon, 'Tasa de fallos',
        'Cuántas veces falla una tarea. Las tareas que brillan aquí son las que más problemas dan.' ],
      [ ReworkTimeIcon, 'Tiempo de reparación',
        'Cuánto se tarda en <strong>arreglar</strong> lo que falló. Si es alto, cada fallo sale caro en tiempo.' ]
    ]
  },
  {
    title: 'Tiempo extra y logística',
    items: [
      [ OvertimeIcon, 'Horas extras',
        'Horas trabajadas fuera de la jornada, dentro de las franjas de <strong>pago doble o triple</strong>.' ],
      [ TruckIcon, 'Espera de transporte',
        'Tiempo perdido esperando un vehículo o un lote antes de poder mover el material.' ],
      [ WarningIcon, 'Despachos ineficientes',
        'Viajes que <strong>no se aprovecharon</strong>. Ejemplo: un camión que sale medio vacío. Cada uno es un costo evitable.' ]
    ]
  },
  {
    title: 'Otros',
    items: [
      [ FrequencyIcon, 'Frecuencia',
        'Cuántas veces pasó el flujo por cada elemento. Revela <strong>qué caminos se usan de verdad</strong>.' ],
      [ GroupIcon, 'Cantidad de recursos',
        'Cuántos recursos tiene asignados cada tarea en la configuración.' ]
    ]
  },
  {
    title: 'Controles',
    items: [
      [ ClearIcon, 'Limpiar',
        'Quita el mapa de calor y las etiquetas del diagrama.' ],
      [ RadiusPlusIcon, 'Radio + / −',
        'Tamaño de las manchas de calor. Súbelo si el diagrama es grande y quieres ver la tendencia general.' ],
      [ BlurPlusIcon, 'Desenfoque + / −',
        'Suavizado de las manchas. Más desenfoque = vista más difusa; menos = zonas más definidas.' ]
    ]
  }
];

const PALETTE_CLS = 'simulation-palette';
const PALETTE_OPEN_CLS = 'open';
const HELP_OPEN_CLS = 'palette-help-open';

export default class SimulationPalette {
  constructor(canvas, eventBus) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._metricCallback = () => {};
    this._clearCallback = () => {};
    this._adjustCallback = () => {};
    this._exportCallback = () => {};

    // *** FIX: Defer initialization until canvas is ready ***
    this._eventBus.on('canvas.init', () => {
      this.init();
    });

    this._eventBus.on('diagram.destroy', () => this.destroy());
  }

  init() {
    // Check if palette already exists to prevent duplicates on re-init
    if (this._palette) {
        return;
    }
    const container = this._canvas.getContainer();
    const palette = this._palette = domify(`<div class="${PALETTE_CLS}"></div>`);
    container.appendChild(palette);

    this.addEntry({
      title: 'Atrás',
      tooltip: 'Atrás — cierra la paleta de análisis',
      icon: BackIcon,
      isBack: true
    });

    this.addSeparator();

    this.addEntry({
      title: 'Visualizar Costos',
      tooltip: 'Costo total acumulado en cada tarea',
      icon: CostIcon,
      metric: 'cost'
    });
    this.addEntry({
      title: 'Visualizar Tiempos de Espera Promedio (Cuellos de Botella)',
      tooltip: 'Tiempo de espera promedio por tarea. Clave para detectar cuellos de botella de recursos.',
      icon: WaitTimeIcon,
      metric: 'waitTime'
    });
    this.addEntry({
      title: 'Visualizar Tiempos de Espera Totales',
      tooltip: 'Suma total del tiempo de espera (no el promedio)',
      icon: TotalWaitTimeIcon,
      metric: 'totalWaitTime'
    });
    this.addEntry({
        title: 'Visualizar Tiempos de Ciclo',
        tooltip: 'Tiempo promedio total de un caso, de principio a fin. Se dibuja sobre los eventos de fin.',
        icon: CycleTimeIcon,
        metric: 'cycleTime'
    });
    this.addEntry({
      title: 'Visualizar Frecuencia de Ejecución',
      tooltip: 'Número de veces que se ejecutó cada elemento. Revela las rutas más transitadas.',
      icon: FrequencyIcon,
      metric: 'frequency'
    });
    this.addEntry({
        title: 'Visualizar Tiempo de Proceso',
        tooltip: 'Tiempo de trabajo activo promedio en cada tarea',
        icon: ProcessTimeIcon,
        metric: 'processTime'
    });
    this.addEntry({
        title: 'Visualizar Tasa de Fallos',
        tooltip: 'Tareas donde ocurren más fallos',
        icon: FailureRateIcon,
        metric: 'failureRate'
    });
    this.addEntry({
        title: 'Visualizar Tiempo de Reparación por Fallo',
        tooltip: 'Tiempo medio dedicado a reparar (rework) tras un fallo',
        icon: ReworkTimeIcon,
        metric: 'reworkTime'
    });
    this.addEntry({
        title: 'Visualizar Costo de Reparación por Fallo',
        tooltip: 'Costo acumulado del tiempo de reparación tras fallos',
        icon: ReworkCostIcon,
        metric: 'reworkCost'
    });
    this.addEntry({
        title: 'Visualizar Horas Extras',
        tooltip: 'Horas trabajadas dentro de las franjas de pago doble y triple',
        icon: OvertimeIcon,
        metric: 'overtime'
    });
    this.addEntry({
        title: 'Visualizar Costo de Tiempos Muertos',
        tooltip: 'Costo del tiempo en que los recursos estuvieron ociosos esperando',
        icon: IdleCostIcon,
        metric: 'waitTimeCost'
    });
    this.addEntry({
        title: 'Visualizar Espera de Transporte',
        tooltip: 'Tiempo perdido esperando por un vehículo o lote',
        icon: TruckIcon,
        metric: 'transportWaitTime'
    });
    this.addEntry({
        title: 'Visualizar Despachos Ineficientes',
        tooltip: 'Despachos de transporte ineficientes (p. ej. un vehículo que sale sin llenarse)',
        icon: WarningIcon,
        metric: 'inefficientDispatch'
    });
    this.addEntry({
        title: 'Visualizar Cantidad de Recursos Asignados',
        tooltip: 'Número de recursos configurados para cada tarea',
        icon: GroupIcon,
        metric: 'resourceQuantity'
    });

    this.addSeparator();

    this.addEntry({
      title: 'Limpiar Visualización',
      tooltip: 'Quita el mapa de calor y las etiquetas de datos del diagrama',
      icon: ClearIcon,
      isClear: true
    });

    this.addSeparator();

    this.addControl(RadiusPlusIcon, 'Aumentar Radio', 'Aumentar radio de las manchas de calor (+5)', () => this._adjustCallback('radius', 5));
    this.addControl(RadiusMinusIcon, 'Disminuir Radio', 'Disminuir radio de las manchas de calor (−5)', () => this._adjustCallback('radius', -5));
    this.addControl(BlurPlusIcon, 'Aumentar Desenfoque', 'Aumentar desenfoque de las manchas de calor (+5)', () => this._adjustCallback('blur', 5));
    this.addControl(BlurMinusIcon, 'Disminuir Desenfoque', 'Disminuir desenfoque de las manchas de calor (−5)', () => this._adjustCallback('blur', -5));

    this.addSeparator();

    this.addEntry({
      title: 'Exportar Mapa de Calor como Imagen',
      tooltip: 'Descarga un PNG con el diagrama y el mapa de calor',
      icon: ExportIcon,
      isExport: true
    });

    this.addSeparator();

    this.addHelpEntry();
  }

  addEntry(options) {
    const { title, tooltip, icon, text, metric, isClear, isBack, isExport } = options;

    let content;
    if (icon) {
        content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>`;
    } else {
        content = `<span class="bts-entry-text">${text}</span>`;
    }

    const button = domify(`
      <button class="bts-entry" title="${tooltip || title}" data-tip="${tooltip || title}">
        ${content}
      </button>
    `);

    domEvent.bind(button, 'click', () => {
        if (isClear) this._clearCallback();
        else if (isExport) this._exportCallback();
        else if (isBack) this.close();
        else this._metricCallback(metric);
    });

    this._palette.appendChild(button);
  }

  addControl(icon, title, tooltip, action) {
    const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg>`;
    const button = domify(
      `<button class="bts-entry" title="${tooltip || title}" data-tip="${tooltip || title}">${content}</button>`
    );
    domEvent.bind(button, 'click', action);
    this._palette.appendChild(button);
  }

  addSeparator() {
    this._palette.appendChild(domify('<hr class="bts-entry-separator">'));
  }

  // Botón ? + panel desplegable. Reutiliza el patrón de ayuda que ya usa
  // SimulationController, pero integrado en la propia paleta.
  addHelpEntry() {
    const button = domify(`
      <button class="bts-entry" title="Qué significa cada icono" data-tip="Qué significa cada icono">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${HelpIcon}</svg>
      </button>
    `);

    const panel = domify(`
      <div class="palette-help-panel">
        <div class="palette-help-title">¿Qué significa cada icono?</div>
        ${HELP_SECTIONS.map((section) => `
          <div class="palette-help-section">${section.title}</div>
          <table class="palette-help-table">
            ${section.items.map(([icon, name, desc]) => `
              <tr>
                <td class="ic"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${icon}</svg></td>
                <td class="nm">${name}</td>
                <td class="ds">${desc}</td>
              </tr>
            `).join('')}
          </table>
        `).join('')}
      </div>
    `);

    domEvent.bind(button, 'click', () => {
      const isOpen = domClasses(panel).has(HELP_OPEN_CLS);
      isOpen ? domClasses(panel).remove(HELP_OPEN_CLS) : domClasses(panel).add(HELP_OPEN_CLS);
      domClasses(button).toggle('active', !isOpen);
    });

    this._palette.appendChild(button);
    this._palette.appendChild(panel);
  }

  setMetricCallback(cb) { this._metricCallback = cb; }
  setClearCallback(cb) { this._clearCallback = cb; }
  setAdjustCallback(cb) { this._adjustCallback = cb; }
  setExportCallback(cb) { this._exportCallback = cb; }

  isOpen() {
      return this._palette && domClasses(this._palette).has(PALETTE_OPEN_CLS);
  }
  toggle() { this.isOpen() ? this.close() : this.open(); }
  open() {
      if (this._palette) domClasses(this._palette).add(PALETTE_OPEN_CLS);
  }
  close() {
      if (this._palette) {
        domClasses(this._palette).remove(PALETTE_OPEN_CLS);
        // Al cerrar, repliega la ayuda para que no quede abierta la próxima vez.
        const panel = this._palette.querySelector('.palette-help-panel');
        if (panel) domClasses(panel).remove(HELP_OPEN_CLS);
        const helpBtn = this._palette.querySelector('.bts-entry.active');
        if (helpBtn) domClasses(helpBtn).remove('active');
      }
  }
  destroy() {
    if (this._palette && this._palette.parentNode) {
      this._palette.parentNode.removeChild(this._palette);
      this._palette = null;
    }
  }
}

SimulationPalette.$inject = [ 'canvas', 'eventBus' ];
