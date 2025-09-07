/**
 * Proporciona funciones para generar números aleatorios a partir de
 * diferentes distribuciones estadísticas.
 */
export default class StatisticalGenerator {

  /**
   * Genera un valor basado en la distribución especificada.
   * @param {Object} distConfig - Configuración de la distribución.
   * @returns {number} - El valor generado.
   */
  generate(distConfig) {
    if (!distConfig || !distConfig.distribution) {
      return 0;
    }

    switch (distConfig.distribution) {
      case 'fixed':
        return this._fixed(distConfig);
      case 'uniform':
        return this._uniform(distConfig);
      case 'triangular':
        return this._triangular(distConfig);
      case 'normal':
        return this._normal(distConfig);
      default:
        console.warn(`Distribución no soportada: ${distConfig.distribution}`);
        return 0;
    }
  }

  _fixed(config) {
    return config.value || 0;
  }

  _uniform(config) {
    const min = config.min || 0;
    const max = config.max || 0;
    return min + Math.random() * (max - min);
  }

  _triangular(config) {
    const min = config.min || 0;
    const max = config.max || 0;
    const mode = config.mode || 0;
    const u = Math.random();

    if (u < (mode - min) / (max - min)) {
      return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
  }

  _normal(config) {
    const mean = config.mean || 0;
    const stddev = config.stddev || 0;

    // Algoritmo Box-Muller para una distribución normal estándar
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random(); // Excluyendo 0 para evitar log(0)
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

    // Escalar por la media y desviación estándar
    return z * stddev + mean;
  }
}
