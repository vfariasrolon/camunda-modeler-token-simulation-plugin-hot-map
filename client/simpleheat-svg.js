'use strict';

// Default gradient copied from the original example
const defaultGradient = {
  0.4: 'blue',
  0.6: 'cyan',
  0.7: 'lime',
  0.8: 'yellow',
  1.0: 'red'
};

/**
 * A customized version of simpleheatSVG, adapted to work with bpmn-js.
 * Instead of an SVG element ID, it takes a bpmn-js `canvas` object.
 *
 * @param {Canvas} canvas The bpmn-js canvas.
 */
function SimpleHeatSVG(canvas) {
  if (!canvas) {
    throw new Error('bpmn-js canvas required');
  }

  if (!(this instanceof SimpleHeatSVG)) {
    return new SimpleHeatSVG(canvas);
  }

  this._canvas = canvas;

  // La capa donde se dibujan los circulos.
  this._layer = canvas.getLayer('overlays');

  if (!this._layer) {
    throw new Error('Could not get overlays layer from canvas.');
  }

  // LOS DEFS VAN EN EL MISMO SVG QUE LOS CIRCULOS, y esto no es un detalle.
  //
  // Antes se cogia el PRIMER <svg> del contenedor (`querySelector('svg')`) y se le
  // metian los filtros. Mientras ese svg sea el del diagrama, funciona; pero los
  // circulos llevan `filter="url(#heatmap-colorize)"` y esa referencia se resuelve
  // A NIVEL DE DOCUMENTO, asi que si los defs acaban en otro svg -o en uno que se
  // reemplaza- la pantalla se queda sin filtro y los circulos NO SE VEN, mientras
  // el EXPORT si los pinta (porque reune los defs por id y los mete en el SVG que
  // serializa). Esa asimetria -pantalla no, PNG si- es la firma de este fallo.
  //
  // Subiendo por el arbol desde la CAPA se garantiza que los defs y los circulos
  // compartan svg: la referencia se resuelve en el mismo documento y deja de
  // depender de que el navegador la busque en todo el documento.
  const svg = this._layer.closest('svg') || canvas.getContainer().querySelector('svg');
  if (!svg) {
    throw new Error('Could not find SVG element for the overlays layer.');
  }

  let defs = svg.querySelector('defs');
  if (!defs) {
    // If <defs> does not exist, create and append it. This is a fallback.
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.prepend(defs);
  }
  this._defs = defs;

  this._max = 1;
  this._data = [];
  this._heatGroup = null;

  this._setupSVG();
}

SimpleHeatSVG.prototype = {

  defaultRadius: 25,
  defaultBlur: 15,

  _setupSVG: function() {
    const ns = 'http://www.w3.org/2000/svg';

    // --- Create Gradient ---
    // Check if gradient already exists to avoid duplicates
    if (!this._defs.querySelector('#heatmap-blur-gradient')) {
      const radialGradient = document.createElementNS(ns, 'radialGradient');
      radialGradient.id = 'heatmap-blur-gradient';
      this._defs.appendChild(radialGradient);
      this._blurGradient = radialGradient;
    } else {
      this._blurGradient = this._defs.querySelector('#heatmap-blur-gradient');
    }

    // --- Create Filter ---
    // Check if filter already exists
    if (!this._defs.querySelector('#heatmap-colorize')) {
      const filter = document.createElementNS(ns, 'filter');
      filter.id = 'heatmap-colorize';
      this._defs.appendChild(filter);

      const feComponentTransferAlpha = document.createElementNS(ns, 'feComponentTransfer');
      feComponentTransferAlpha.setAttribute('in', 'SourceGraphic');
      feComponentTransferAlpha.setAttribute('result', 'boostedAlpha');
      filter.appendChild(feComponentTransferAlpha);

      const feFuncA = document.createElementNS(ns, 'feFuncA');
      feFuncA.setAttribute('type', 'gamma');
      feFuncA.setAttribute('exponent', '0.75');
      feComponentTransferAlpha.appendChild(feFuncA);

      const feColorMatrix = document.createElementNS(ns, 'feColorMatrix');
      feColorMatrix.setAttribute('type', 'matrix');
      feColorMatrix.setAttribute('values', '0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 0');
      feColorMatrix.setAttribute('in', 'boostedAlpha');
      feColorMatrix.setAttribute('result', 'grayscale');
      filter.appendChild(feColorMatrix);

      const feComponentTransferColor = document.createElementNS(ns, 'feComponentTransfer');
      feComponentTransferColor.setAttribute('in', 'grayscale');
      feComponentTransferColor.setAttribute('result', 'colorized');
      filter.appendChild(feComponentTransferColor);

      this._feFuncR = document.createElementNS(ns, 'feFuncR');
      this._feFuncR.setAttribute('type', 'table');
      feComponentTransferColor.appendChild(this._feFuncR);

      this._feFuncG = document.createElementNS(ns, 'feFuncG');
      this._feFuncG.setAttribute('type', 'table');
      feComponentTransferColor.appendChild(this._feFuncG);

      this._feFuncB = document.createElementNS(ns, 'feFuncB');
      this._feFuncB.setAttribute('type', 'table');
      feComponentTransferColor.appendChild(this._feFuncB);
    } else {
      // If filter exists, just get the references to the color functions
      this._feFuncR = this._defs.querySelector('#heatmap-colorize feFuncR');
      this._feFuncG = this._defs.querySelector('#heatmap-colorize feFuncG');
      this._feFuncB = this._defs.querySelector('#heatmap-colorize feFuncB');
    }

    // --- Create Heatmap Group ---
    // This is the group where the circles will be drawn.
    this._heatGroup = document.createElementNS(ns, 'g');
    this._heatGroup.setAttribute('class', 'heatmap-layer');
    this._heatGroup.setAttribute('filter', 'url(#heatmap-colorize)');

    // Prepend to the layer to be below other overlays.
    this._layer.prepend(this._heatGroup);

    // Set default gradient
    this.gradient(defaultGradient);
  },

  data: function(data) {
    this._data = data;
    return this;
  },

  max: function(max) {
    this._max = max;
    return this;
  },

  add: function(point) {
    this._data.push(point);
    return this;
  },

  clear: function() {
    this._data = [];
    if (this._heatGroup) {
      this._heatGroup.innerHTML = '';
    }
    return this;
  },

  radius: function(r, blur) {
    blur = blur === undefined ? this.defaultBlur : blur;
    r = r === undefined ? this.defaultRadius : r;
    this._r = r + blur;

    const blurStopRatio = r / this._r;

    // Use domify from min-dom would be better, but to keep this standalone, use innerHTML
    this._blurGradient.innerHTML = `
      <stop offset="0%" stop-color="white" stop-opacity="1"></stop>
      <stop offset="${blurStopRatio * 100}%" stop-color="white" stop-opacity="1"></stop>
      <stop offset="100%" stop-color="white" stop-opacity="0"></stop>
    `;

    return this;
  },

  gradient: function(grad) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);

    canvas.width = 1;
    canvas.height = 256;

    for (var i in grad) {
      gradient.addColorStop(+i, grad[i]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1, 256);

    const pixels = ctx.getImageData(0, 0, 1, 256).data;
    const r = [], g = [], b = [];

    for (let i = 0; i < pixels.length; i += 4) {
      r.push(pixels[i] / 255);
      g.push(pixels[i + 1] / 255);
      b.push(pixels[i + 2] / 255);
    }

    this._feFuncR.setAttribute('tableValues', r.join(' '));
    this._feFuncG.setAttribute('tableValues', g.join(' '));
    this._feFuncB.setAttribute('tableValues', b.join(' '));

    return this;
  },

  /**
   * Dibuja las manchas.
   *
   * Cada punto es [cx, cy, valor] y, opcionalmente, [cx, cy, valor, radio] y
   * [cx, cy, valor, radio, opacidad].
   *
   * - El cuarto elemento permite que una figura grande reciba una mancha mas
   *   grande que una pequena. Si falta, se usa el radio global (this._r).
   * - El quinto es la opacidad YA resuelta por quien llama. Quien conoce el
   *   sentido del dato (aqui, el controlador via HeatmapScale) decide la
   *   opacidad; esta libreria solo la pinta. Si falta, se cae a `valor / max`,
   *   que es el comportamiento de siempre para quien use la libreria suelta.
   *
   * El degradado del borde esta definido en porcentajes del radio, asi que al
   * variar el radio el desvanecido se escala en la misma proporcion: no hace
   * falta recalcular la gradiente por punto.
   */
  draw: function(minOpacity) {
    if (!this._r) this.radius(this.defaultRadius, this.defaultBlur);

    const ns = 'http://www.w3.org/2000/svg';
    // 0.05 hacia que un valor 0 quedase practicamente invisible; 0.10 se
    // percibe como "hay algo" sin ensuciar el diagrama.
    minOpacity = minOpacity === undefined ? 0.10 : minOpacity;

    // clear previous heatmap content
    this._heatGroup.innerHTML = '';

    for (var i = 0, len = this._data.length, p; i < len; i++) {
      p = this._data[i];

      const r = p.length > 3 && p[3] > 0 ? p[3] : this._r;

      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', p[0]);
      circle.setAttribute('cy', p[1]);
      circle.setAttribute('r', r);
      circle.setAttribute('fill', 'url(#heatmap-blur-gradient)');

      const opacity = p.length > 4 && p[4] != null
        ? p[4]
        : Math.min(Math.max(p[2] / this._max, minOpacity), 1);
      circle.setAttribute('opacity', opacity);

      this._heatGroup.appendChild(circle);
    }
    return this;
  },

  destroy: function() {
    if (this._heatGroup) {
      this._heatGroup.remove();
      this._heatGroup = null;
    }
    // Note: We are not removing the defs (filter, gradient) because other
    // instances might be using them. They are lightweight anyway.
  }
};

module.exports = SimpleHeatSVG;
