import { domify, event as domEvent, classes as domClasses } from 'min-dom';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import { getSimulationData, isLabel } from './util';
import { inventarioDe, diagnosticar, pendientesPorDato, CAPACIDADES } from './DataAudit';
import './data-audit.css';

const PANEL_CLS = 'sim-data-audit-panel';
const OPEN_CLS = 'open';

const CloseIcon = `
  <span class="bts-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <path d="M 3.5 3.5 L 12.5 12.5 M 12.5 3.5 L 3.5 12.5"
        stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    </svg>
  </span>
`;

// Los tres estados, con su palabra. No se usan solo colores: un daltónico tiene
// que poder leer la lista igual, y un informe impreso en blanco y negro tambien.
const ETIQUETA = {
  listo: { texto: 'listo', glifo: '✓' },
  parcial: { texto: 'parcial', glifo: '≈' },
  falta: { texto: 'falta', glifo: '✗' }
};

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Panel de diagnostico de datos: «tengo lo necesario para medir esto o no».
 *
 * Existe porque la pregunta del analista llega ANTES de simular («quiero medir
 * la carga física, ¿qué me falta?») y hasta ahora la unica forma de responderla
 * era correr y encontrar un cero.
 *
 * Lee el MISMO camino que el editor de datos (getSimulationData), asi que no
 * puede discrepar de lo que se va a simular.
 */
export default class DataAuditPanel {
  constructor(canvas, eventBus, elementRegistry, overlays) {
    this._canvas = canvas;
    this._eventBus = eventBus;
    this._elementRegistry = elementRegistry;
    this._overlays = overlays;

    this._panel = null;

    this._eventBus.on('canvas.init', () => this._init());
    this._eventBus.on('diagram.destroy', () => this.destroy());
    // Por evento: el boton de la barra vive en el controlador, que se registra
    // antes, asi que inyectar el panel alli seria una dependencia circular.
    this._eventBus.on('simulation.audit.requested', () => this.toggle());
  }

  isOpen() { return this._panel && domClasses(this._panel).has(OPEN_CLS); }
  toggle() { this.isOpen() ? this.close() : this.open(); }

  open() {
    if (!this._panel) this._init();
    domClasses(this._panel).add(OPEN_CLS);
    this._render();
  }

  close() {
    if (this._panel) domClasses(this._panel).remove(OPEN_CLS);
  }

  destroy() {
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
    this._panel = null;
  }

  // -- infraestructura ------------------------------------------------------

  _init() {
    if (this._panel) return;

    const panel = this._panel = domify(`
      <div class="${PANEL_CLS}">
        <div class="panel-header">
          <span class="panel-title">Diagnóstico de datos: qué se puede medir y qué falta</span>
          <div class="panel-actions">
            <button class="btn-close" title="Cerrar" data-tip="Cerrar el diagnóstico" data-tip-pos="left">${CloseIcon}</button>
          </div>
        </div>
        <div class="panel-body"></div>
      </div>
    `);

    this._canvas.getContainer().appendChild(panel);
    this._body = panel.querySelector('.panel-body');

    domEvent.bind(panel.querySelector('.btn-close'), 'click', () => this.close());
  }

  // -- lectura de datos -----------------------------------------------------

  /**
   * Inventario del modelo, leido igual que lo lee el editor de datos.
   *
   * Se filtra por `bpmn:Task` y no por `bpmn:Activity`: el generador de datos y el
   * editor usan `bpmn:Task`, y contar dos veces lo mismo daria un inventario que
   * no cuadra con la pestana Tareas.
   */
  _leerModelo() {
    const tareas = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:Task'))
      .map((el) => ({ id: el.id, nombre: el.businessObject.name || el.id, datos: getSimulationData(el) || {} }));

    const flujos = this._elementRegistry.filter(
      (el) => !isLabel(el) && is(el, 'bpmn:SequenceFlow') && el.source && is(el.source, 'bpmn:ExclusiveGateway')
    ).map((el) => ({ id: el.id, datos: getSimulationData(el) || {} }));

    const proceso = this._elementRegistry.find((el) => is(el, 'bpmn:Process') || is(el, 'bpmn:Participant'));
    const pools = ((getSimulationData(proceso) || {}).resourcePools || []);

    const raiz = this._elementRegistry.filter((el) => !isLabel(el) && is(el, 'bpmn:StartEvent'))
      .map((el) => getSimulationData(el))
      .find((d) => d && d.isRoot) || null;

    return { tareas, flujos, pools, root: raiz };
  }

  // -- render ---------------------------------------------------------------

  _render() {
    if (!this._panel) return;

    const modelo = this._leerModelo();
    const inv = inventarioDe(modelo);
    const diag = diagnosticar(inv);
    const porDato = pendientesPorDato(diag);

    const { listo, parcial, falta, total } = diag.recuento;

    this._body.innerHTML = `
      <p class="intro">
        Esta lista dice <strong>qué se puede medir con los datos que ya tienes</strong> y qué falta para lo
        demás. No evalúa nada: solo cuenta datos. Si tu pregunta es «quiero medir esto, ¿qué me falta?», la
        respuesta está aquí <em>antes</em> de simular.
      </p>

      <div class="recuento">
        <span class="marca listo">✓ ${listo} listas</span>
        <span class="marca parcial">≈ ${parcial} parciales</span>
        <span class="marca falta">✗ ${falta} sin datos</span>
        <span class="total">${total} capacidades</span>
      </div>

      <h4 class="subtitulo">Lo que falta, agrupado por el dato que lo desbloquea</h4>
      ${porDato.length ? `
        <p class="hint">
          Ordenado por <strong>cuántas capacidades desbloquea cada dato</strong>: lo de arriba es lo que más
          te devuelve por el esfuerzo de rellenarlo.
        </p>
        <table class="data-table">
          <thead><tr><th>Dato que falta</th><th>Qué te pierdes sin él</th><th>Desbloquea</th></tr></thead>
          <tbody>
            ${porDato.map((p) => `
              <tr>
                <td class="dato">${esc(p.dato)}</td>
                <td class="cons">${esc(p.consecuencia)}</td>
                <td class="desb">${p.desbloquea.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      ` : '<p class="vacio">No falta ningún dato: todas las capacidades del sistema se pueden medir.</p>'}

      <h4 class="subtitulo">Detalle por capacidad</h4>
      <table class="data-table">
        <thead><tr><th>Capacidad</th><th>Estado</th><th>Qué necesita</th></tr></thead>
        <tbody>
          ${diag.capacidades.map((c) => this._filaCapacidad(c)).join('')}
        </tbody>
      </table>

      <h4 class="subtitulo">Qué mide cada capacidad</h4>
      <ul class="porques">
        ${CAPACIDADES.map((c) => `<li><strong>${esc(c.titulo)}</strong> — ${esc(c.porque)}</li>`).join('')}
      </ul>
    `;
  }

  _filaCapacidad(c) {
    const e = ETIQUETA[c.estado];
    const necesita = c.detalle.map((d) => {
      const marca = d.cumple ? '✓' : '✗';
      const clase = d.cumple ? 'ok' : 'mal';
      const opcional = d.opcional ? ' <em>(opcional)</em>' : '';
      return `<div class="req ${clase}">${marca} ${esc(d.dato)}${opcional}</div>`;
    }).join('');

    return `
      <tr class="fila-${c.estado}">
        <td class="cap">
          <strong>${esc(c.titulo)}</strong>
          <div class="porque">${esc(c.porque)}</div>
        </td>
        <td class="estado"><span class="marca ${c.estado}">${e.glifo} ${e.texto}</span></td>
        <td class="reqs">${necesita}</td>
      </tr>`;
  }
}
