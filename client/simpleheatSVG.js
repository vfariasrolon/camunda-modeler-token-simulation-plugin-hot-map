'use strict';

if (typeof module !== 'undefined') module.exports = simpleheatSVG;

function simpleheatSVG(svgElementId) {
    if (!(this instanceof simpleheatSVG)) return new simpleheatSVG(svgElementId);

    this._svg = typeof svgElementId === 'string' ? document.getElementById(svgElementId) : svgElementId;

    // Obtener dimensiones del viewBox para un sistema de coordenadas consistente
    const viewBox = this._svg.viewBox.baseVal;
    if (!viewBox || !viewBox.width || !viewBox.height) {
        console.error("SVG element must have a valid viewBox attribute.");
        return;
    }
    this._width = viewBox.width;
    this._height = viewBox.height;

    this._max = 1;
    this._data = [];
    this._defs = null;
    this._heatGroup = null;
    this._feFuncR = null;
    this._feFuncG = null;
    this._feFuncB = null;

    this._setupSVG();
}

simpleheatSVG.prototype = {
    defaultRadius: 25,
    defaultBlur: 15,
    defaultGradient: {
        0.4: 'blue',
        0.6: 'cyan',
        0.7: 'lime',
        0.8: 'yellow',
        1.0: 'red'
    },

    _setupSVG: function() {
        const ns = 'http://www.w3.org/2000/svg';

        this._defs = document.createElementNS(ns, 'defs');
        this._svg.appendChild(this._defs);

        const radialGradient = document.createElementNS(ns, 'radialGradient');
        radialGradient.id = 'blurGradient';
        this._defs.appendChild(radialGradient);
        this._blurGradient = radialGradient;

        const filter = document.createElementNS(ns, 'filter');
        filter.id = 'colorize';
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

        this._heatGroup = document.createElementNS(ns, 'g');
        this._heatGroup.setAttribute('filter', 'url(#colorize)');
        this._svg.appendChild(this._heatGroup);
    },

    data: function (data) {
        this._data = data;
        return this;
    },

    max: function (max) {
        this._max = max;
        return this;
    },

    add: function (point) {
        this._data.push(point);
        return this;
    },

    clear: function () {
        this._data = [];
        if (this._heatGroup) {
            this._heatGroup.innerHTML = '';
        }
        return this;
    },

    radius: function (r, blur) {
        blur = blur === undefined ? this.defaultBlur : blur;
        r = r === undefined ? this.defaultRadius : r;

        this._r = r + blur;

        const blurStopRatio = r / this._r;
        this._blurGradient.innerHTML = `
            <stop offset="0%" stop-color="white" stop-opacity="1"></stop>
            <stop offset="${blurStopRatio * 100}%" stop-color="white" stop-opacity="1"></stop>
            <stop offset="100%" stop-color="white" stop-opacity="0"></stop>
        `;

        return this;
    },

    gradient: function (grad) {
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

    draw: function (minOpacity) {
        if (!this._r) this.radius(this.defaultRadius, this.defaultBlur);
        if (!this._feFuncR.getAttribute('tableValues')) this.gradient(this.defaultGradient);

        const ns = 'http://www.w3.org/2000/svg';
        minOpacity = minOpacity === undefined ? 0.05 : minOpacity;

        this._heatGroup.innerHTML = '';

        for (var i = 0, len = this._data.length, p; i < len; i++) {
            p = this._data[i];

            const circle = document.createElementNS(ns, 'circle');
            circle.setAttribute('cx', p[0]);
            circle.setAttribute('cy', p[1]);
            circle.setAttribute('r', this._r);
            circle.setAttribute('fill', 'url(#blurGradient)');

            const opacity = Math.min(Math.max(p[2] / this._max, minOpacity), 1);
            circle.setAttribute('opacity', opacity);

            this._heatGroup.appendChild(circle);
        }
        return this;
    }
};
