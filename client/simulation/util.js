import { is } from 'bpmn-js/lib/util/ModelUtil';

/**
 * Indica si un elemento del registro es una ETIQUETA (un texto).
 *
 * En bpmn-js cada texto es un elemento propio del registro y COMPARTE el
 * businessObject de su figura. Como `is()` mira el businessObject y no el tipo
 * del elemento, comprobaciones como is(etiquetaDeTarea, 'bpmn:Task') devuelven
 * true. Sin descartarlas, cualquier filtro por tipo incluye los textos: aparecen
 * manchas sobre ellos, filas duplicadas en tablas y etiquetas de datos de mas.
 *
 * Usar SIEMPRE antes de comprobar el tipo de un elemento del registro.
 */
export const isLabel = (element) =>
  Boolean(element && (element.labelTarget || element.type === 'label'));

/**
 * Nombre legible de un elemento: el del diagrama o, si no lo tiene, su id.
 *
 * Compartido entre el controlador (etiquetas de graficos) y el informe (tablas).
 * Antes cada uno tenia su copia y la del informe no existia: el metodo se llamaba
 * desde el informe pero solo estaba definido en el controlador, asi que generar
 * el informe lanzaba "this._nombre is not a function".
 */
export const nombreElemento = (element) =>
  (element ? (element.businessObject.name || element.id) : '?');

export const getExtensionProperty = (element, name) => {
  if (!element || !element.businessObject) return null;
  const bo = element.businessObject;
  if (!bo.extensionElements || !bo.extensionElements.values) {
    return null;
  }
  const props = bo.extensionElements.values.find(v => is(v, 'camunda:Properties'));
  if (!props || !props.values) {
    return null;
  }
  const prop = props.values.find(p => p.name === name);
  return prop ? prop.value : null;
};

export const getSimulationData = (element) => {
  const dataString = getExtensionProperty(element, 'simulationData');
  if (!dataString) return null;
  try {
    return JSON.parse(dataString);
  } catch (e) {
    console.error(`Error parsing simulationData for element ${element.id}`, e);
    return null;
  }
};

/**
 * Escribe simulationData en un elemento, creando la jerarquia de extension
 * elements si no existe:
 *   bpmn:ExtensionElements > camunda:Properties > camunda:Property(name=simulationData)
 *
 * El valor se guarda como string JSON, que es el formato que leen
 * getSimulationData() y el motor de simulacion.
 *
 * @param {Object} element            elemento de bpmn-js
 * @param {Object} data               objeto de datos de simulacion
 * @param {Object} services           { modeling, bpmnFactory }
 */
export const setSimulationData = (element, data, services) => {
  const { modeling, bpmnFactory } = services;
  const businessObject = element.businessObject;

  let extensionElements = businessObject.get('extensionElements');
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
  }

  let properties = extensionElements.get('values').find(v => v.$type === 'camunda:Properties');
  if (!properties) {
    properties = bpmnFactory.create('camunda:Properties', { values: [] });
    extensionElements.get('values').push(properties);
  }

  let simProperty = properties.get('values').find(p => p.name === 'simulationData');
  if (!simProperty) {
    simProperty = bpmnFactory.create('camunda:Property', { name: 'simulationData' });
    properties.get('values').push(simProperty);
  }

  simProperty.value = JSON.stringify(data, null, 2);

  modeling.updateProperties(element, { extensionElements });
};

export const formatMilliseconds = (ms) => {
  if (ms === 0) return '0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
};

/**
 * Formatea una cantidad de MINUTOS.
 *
 * Hace falta porque no todos los campos del motor estan en milisegundos.
 * `totalWaitTime` y `totalCycleTime` se acumulan con
 * calculateBusinessDurationInMinutes(), que cuenta minutos, mientras que
 * totalProcessingTime, totalOvertime y totalReworkTime si estan en milisegundos.
 *
 * Usar formatMilliseconds() sobre los dos primeros los mostraba 60.000 veces
 * menores: una espera de 480 minutos aparecia como "0.5s" en lugar de "8.0h".
 */
export const formatMinutes = (minutes) => {
  if (!minutes) return '0s';
  const totalMinutes = minutes;
  if (totalMinutes < 1) return `${(totalMinutes * 60).toFixed(0)}s`;
  if (totalMinutes < 60) return `${totalMinutes.toFixed(1)}m`;
  const hours = totalMinutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
};

export const formatCurrency = (amount, currency = 'MXN') => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

// ---------------------------------------------------------------------------
// Estadistica descriptiva.
//
// El motor acumula TOTALES por elemento (espera total, costo total...), que dan
// medias pero esconden la cola de la distribucion. Con las muestras por caso
// (tiempo de ciclo) se pueden calcular percentiles, y el p95 es lo que de verdad
// rompe un plazo: la media puede estar bien con una cola desastrosa.
//
// Viven aqui (y no en el motor ni en el panel) porque las usan los dos: los
// graficos y el informe.
// ---------------------------------------------------------------------------

/**
 * Percentil por interpolacion lineal sobre una lista YA ORDENADA de menor a mayor.
 *
 * Interpolar (en vez de tomar el elemento mas cercano) es lo correcto para una
 * muestra pequena: con 10 datos, el "p95" por vecino seria el maximo, que
 * exagera la cola.
 */
export const percentil = (ordenados, p) => {
  const n = ordenados ? ordenados.length : 0;
  if (!n) return 0;
  if (n === 1) return ordenados[0];

  const pos = (n - 1) * (p / 100);
  const bajo = Math.floor(pos);
  const alto = Math.min(bajo + 1, n - 1);
  return ordenados[bajo] + (ordenados[alto] - ordenados[bajo]) * (pos - bajo);
};

/**
 * Resumen descriptivo de una muestra. Devuelve null si esta vacia.
 *
 * Incluye el coeficiente de variacion (cv = desviacion / media): es la
 * variabilidad RELATIVA, y es lo que permite comparar la dispersion de un
 * proceso rapido con uno lento.
 */
export const resumenMuestras = (muestras) => {
  const datos = (muestras || []).slice().sort((a, b) => a - b);
  const n = datos.length;
  if (!n) return null;

  const media = datos.reduce((a, b) => a + b, 0) / n;
  const varianza = n > 1 ? datos.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1) : 0;
  const desviacion = Math.sqrt(varianza);

  return {
    n,
    min: datos[0],
    max: datos[n - 1],
    media,
    desviacion,
    // p10 y p25 existen para los ESCENARIOS DE COSTO del informe, que necesitan una
    // horquilla que se pueda defender. El minimo observado es «todo salio perfecto» -un
    // evento de probabilidad casi nula-, asi que se usa p10 como «mejor caso realista»; y
    // p25 permite ver el cuarto mas barato de la corrida. Se calculan siempre y no solo para
    // el costo: un percentil de mas no cuesta nada y evita tener dos caminos de codigo.
    p10: percentil(datos, 10),
    p25: percentil(datos, 25),
    p50: percentil(datos, 50),
    p90: percentil(datos, 90),
    p95: percentil(datos, 95),
    p99: percentil(datos, 99),
    cv: media > 0 ? desviacion / media : 0
  };
};

/**
 * Histograma de cubetas de ancho uniforme (regla de Sturges, con topes).
 *
 * Devuelve `etiquetas` (una por cubeta, con el rango) y `conteos`. Si todos los
 * valores son iguales devuelve una sola cubeta: sin ese caso, el ancho saldria 0
 * y las etiquetas serian NaN.
 */
export const histograma = (muestras, cubetas) => {
  const datos = (muestras || []).filter((v) => Number.isFinite(v));
  if (!datos.length) return { etiquetas: [], conteos: [], min: 0, max: 0, ancho: 0 };

  const min = Math.min(...datos);
  const max = Math.max(...datos);
  if (max === min) {
    return { etiquetas: [ String(Math.round(min * 100) / 100) ], conteos: [ datos.length ], min, max, ancho: 0 };
  }

  const n = cubetas || Math.min(20, Math.max(6, Math.ceil(Math.log2(datos.length) + 1)));
  const ancho = (max - min) / n;
  const conteos = new Array(n).fill(0);
  datos.forEach((v) => {
    const i = Math.min(n - 1, Math.floor((v - min) / ancho));
    conteos[i]++;
  });

  const num = (v) => String(Math.round(v * 100) / 100);
  const etiquetas = conteos.map((_, i) => `${num(min + i * ancho)}–${num(min + (i + 1) * ancho)}`);

  return { etiquetas, conteos, min, max, ancho };
};

/**
 * Descripcion legible de una utilizacion (rho).
 *
 * Se rotula con palabras y no solo con el numero porque rho es contraintuitivo:
 * un 0,90 parece "queda un 10 % libre" cuando en realidad es saturacion, y las
 * colas crecen de forma no lineal segun se acerca a 1.
 */
export const describirUtilizacion = (rho) => {
  if (!Number.isFinite(rho)) return { etiqueta: 'sin datos', nivel: 'nd' };
  if (rho >= 1) return { etiqueta: 'saturado (la cola crece sin límite)', nivel: 'mal' };
  if (rho >= 0.9) return { etiqueta: 'al límite', nivel: 'mal' };
  if (rho >= 0.8) return { etiqueta: 'alta', nivel: 'aviso' };
  if (rho >= 0.6) return { etiqueta: 'saludable', nivel: 'ok' };
  return { etiqueta: 'holgado', nivel: 'ok' };
};
