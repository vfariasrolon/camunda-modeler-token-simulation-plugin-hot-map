import { domify, classes as domClasses } from 'min-dom';
import './matrix-loader.css';

const OVERLAY_CLS = 'sim-matrix-overlay';
const OPEN_CLS = 'open';

// Repertorio de la lluvia. Se excluyen < > & " ' ` para no romper el innerHTML
// al construir las columnas.
const CARACTERES = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン'
  + '0123456789ABCDEF+-=*|/:.,;()[]{}';

const azar = (n) => Math.floor(Math.random() * n);

/**
 * Aviso de carga estilo "matrix" para la ejecucion de simulaciones.
 *
 * Dos decisiones tecnicas que no son obvias:
 *
 * 1. La lluvia se anima con CSS sobre `transform`, NO con JavaScript. La
 *    simulacion es sincrona y bloquea el hilo principal: una animacion en JS se
 *    congelaria durante toda la ejecucion. Las animaciones de `transform` y
 *    `opacity` corren en el hilo de composicion del navegador, asi que siguen
 *    moviendose aunque el JS este bloqueado.
 *
 * 2. Las columnas se generan UNA vez, al mostrar el modal. No se regeneran
 *    mientras esta visible, por el mismo motivo: no habria hilo libre.
 */
export default class MatrixLoader {

  constructor(canvas) {
    this._canvas = canvas;
    this._overlay = null;
  }

  _crear() {
    if (this._overlay) return this._overlay;

    const overlay = this._overlay = domify(`
      <div class="${OVERLAY_CLS}">
        <div class="caja">
          <div class="rain"></div>
          <div class="mensaje">Espera, cargando simulación…</div>
        </div>
      </div>
    `);

    this._rain = overlay.querySelector('.rain');
    this._caja = overlay.querySelector('.caja');

    // El contenedor del canvas es el mismo que usan las demas paletas.
    this._canvas.getContainer().appendChild(overlay);

    return overlay;
  }

  /** Rellena la lluvia con columnas de caracteres aleatorios. */
  _generarLluvia() {
    // Se mide la caja de verdad en lugar de repetir sus medidas del CSS: si
    // alguien cambia el tamano alli, esto sigue cuadrando.
    const ancho = this._caja.clientWidth || 460;
    const alto = this._caja.clientHeight || 280;
    const paso = 24;
    const columnas = Math.max(8, Math.ceil(ancho / paso));

    let html = '';

    for (let i = 0; i < columnas; i++) {
      const largo = 18 + azar(20);
      let texto = '';
      for (let j = 0; j < largo; j++) {
        texto += CARACTERES[azar(CARACTERES.length)];
      }

      // Duracion y retardo propios por columna: sin eso todas caerian
      // sincronizadas y se veria como una sola banda.
      const duracion = (2.4 + Math.random() * 3.2).toFixed(2);
      const retardo = (-Math.random() * 6).toFixed(2);
      const opacidad = (0.30 + Math.random() * 0.5).toFixed(2);
      const x = i * paso + azar(5);

      html += `<span class="col" style="`
        + `left:${x}px;`
        + `height:${alto}px;`
        + `opacity:${opacidad};`
        + `animation-duration:${duracion}s;`
        + `animation-delay:${retardo}s;`
        + `">${texto.split('').join('\n')}</span>`;
    }

    this._rain.innerHTML = html;
  }

  show() {
    const overlay = this._crear();

    // Se abre ANTES de medir: con display:none la caja no tiene dimensiones y
    // clientWidth daria 0.
    domClasses(overlay).add(OPEN_CLS);

    this._generarLluvia();
  }

  hide() {
    if (this._overlay) domClasses(this._overlay).remove(OPEN_CLS);
  }

  destroy() {
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
      this._overlay = null;
    }
  }
}

MatrixLoader.$inject = [ 'canvas' ];
