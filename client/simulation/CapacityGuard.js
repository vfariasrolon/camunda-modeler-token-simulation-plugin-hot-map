/**
 * DIAGNOSTICO DE SATURACION: cuando los numeros de la corrida dejan de significar algo.
 *
 * EL PROBLEMA QUE RESUELVE, con un caso real: un diagrama con lotes de 6 piezas, 25 tareas de
 * segundos y piscinas de 1 unidad. La utilizacion del recurso mas cargado daba rho = 1,4, o sea
 * que el trabajo llegaba mas rapido de lo que se podia procesar. Los tiempos de espera salian de
 * CIENTOS DE DIAS en un proceso que deberia tardar 15, y el usuario lo reporto como un error de
 * la app: «no me hace match».
 *
 * No era un error. Era el resultado correcto de un modelo que no cierra: con rho > 1 la cola
 * CRECE SIN LIMITE hasta el final de la corrida, asi que los tiempos -y sus promedios, y sus
 * percentiles- dependen de CUANTO DURA LA CORRIDA, no del proceso. El numero es real y no
 * significa nada.
 *
 * POR QUE HAY QUE DECIRLO EN VOZ ALTA: la app ya imprimia «rho = 1,4» en una tabla, y una tabla
 * con un numero mas no se lee. Lo que faltaba era decir la consecuencia, y decirla ARRIBA, donde
 * se lee antes de creerse el resto. Un informe con un numero que no significa nada y sin avisar
 * es peor que un informe incompleto: el lector lo lleva a una junta.
 *
 * ESTE MODULO ES PURO: recibe la utilizacion calculada y devuelve el diagnostico. No toca el DOM,
 * asi que el arnes comprueba los UMBRALES -que es donde un cambio de criterio se cuela sin que
 * nadie lo note- sin navegador.
 */

/**
 * A partir de que rho el sistema es INESTABLE, y no solo cargado.
 *
 * rho = 1 es la frontera teorica: por encima, la tasa de llegada supera la de servicio y la cola
 * crece sin limite. Justo por debajo la espera se dispara de forma no lineal -es la parte de la
 * curva que casi nadie tiene en la cabeza- y por eso hay un tramo de AVISO antes del limite.
 *
 * Los umbrales son los mismos que ya usa `describirUtilizacion` para la etiqueta de cada fila: si
 * divergieran, la tabla diria «saturado» y el aviso «al limite» sobre el mismo numero.
 */
export const UMBRAL_SATURADO = 1.00;
export const UMBRAL_AL_LIMITE = 0.90;
export const UMBRAL_HOLGURA_JUSTA = 0.80;

/**
 * El diagnostico de capacidad de una corrida.
 *
 * Devuelve `{ nivel, titulo, consecuencia, accion, criticos, holgura }`:
 *
 *   - `nivel`: 'saturado' | 'al-limite' | 'justo' | 'holgado' | 'sin-recursos'.
 *   - `criticos`: las piscinas que estan en el nivel mas grave. Es una LISTA y no la primera:
 *     puede haber tres recursos saturados a la vez y nombrar uno solo esconde los otros dos.
 *   - `consecuencia`: que deja de ser cierto en los numeros. Es la parte que se lee.
 */
export const diagnosticarCapacidad = (utilizacion) => {
  const filas = (utilizacion || []).filter((u) => u && Number.isFinite(Number(u.utilization)));

  if (!filas.length) {
    return {
      nivel: 'sin-recursos',
      titulo: 'El modelo no declara recursos',
      consecuencia: 'No hay utilización que evaluar: las tareas se ejecutan sin restricción de '
        + 'capacidad y las esperas serán cero. El modelo no puede mostrar cuellos de botella de recursos.',
      accion: 'Declare piscinas en la pestaña Recursos y asígnelas en Tareas.',
      criticos: [],
      holgura: null
    };
  }

  const ordenadas = filas.slice().sort((a, b) => b.utilization - a.utilization);
  const peor = ordenadas[0].utilization;

  // LOS SATURADOS SON UNA LISTA, no el primero. Puede haber varios recursos por encima del
  // limite -en un diagrama con ocho piscinas es lo normal- y nombrar solo el peor deja al lector
  // arreglando uno y volviendo a simular para descubrir el siguiente.
  const criticos = ordenadas
    .filter((u) => u.utilization >= (peor >= UMBRAL_SATURADO ? UMBRAL_SATURADO : UMBRAL_AL_LIMITE))
    .map((u) => ({ name: u.name, utilization: u.utilization, quantity: u.quantity }));

  if (peor >= UMBRAL_SATURADO) {
    return {
      nivel: 'saturado',
      titulo: `Hay ${criticos.length} recurso(s) POR ENCIMA del 100 % de capacidad`,
      // LA CONSECUENCIA ES LO QUE HACE UTIL EL AVISO, y hay que decirla sin rodeos: no es «el
      // proceso va justo», es «estos numeros miden la corrida, no el proceso».
      consecuencia: 'Con ρ ≥ 1 el trabajo llega más rápido de lo que se puede procesar, así que la '
        + 'cola crece sin límite hasta el final de la corrida. Los tiempos de espera —y sus promedios '
        + 'y sus percentiles— dependen de CUÁNTO DURA la corrida, no del proceso: NO son '
        + 'representativos y no sirven para decidir plazos.',
      accion: 'Añada capacidad en los recursos saturados, reduzca la tasa de llegada, o suba el '
        + 'tamaño de lote. Vuelva a simular: mientras ρ siga por encima de 1, el resto del informe '
        + 'se lee con esta advertencia.',
      criticos,
      holgura: null
    };
  }

  // El tramo de aviso: por debajo de 1 la cola NO crece sin limite y los numeros SI valen, pero la
  // espera se dispara de forma no lineal. Es el hallazgo «aqui esta el cuello» sin la invalidez.
  if (peor >= UMBRAL_AL_LIMITE) {
    return {
      nivel: 'al-limite',
      titulo: `Recurso(s) al límite (ρ = ${peor.toFixed(3)})`,
      consecuencia: 'Los números son válidos, pero en este tramo la espera crece de forma no '
        + 'lineal: un pico pequeño de demanda se convierte en una cola grande. Es el punto donde '
        + 'interviene la variabilidad, no solo la carga media.',
      accion: null,
      criticos,
      holgura: null
    };
  }

  if (peor >= UMBRAL_HOLGURA_JUSTA) {
    return {
      nivel: 'justo',
      titulo: `Recurso(s) con holgura justa (ρ = ${peor.toFixed(3)})`,
      consecuencia: 'El sistema funciona, pero con poca holgura ante picos. Los números son válidos.',
      accion: null,
      criticos,
      holgura: null
    };
  }

  return {
    nivel: 'holgado',
    titulo: `Capacidad holgada (ρ máximo = ${peor.toFixed(3)})`,
    consecuencia: 'Ningún recurso se acerca a su límite. Los números son válidos.',
    accion: null,
    criticos: [],
    holgura: 1 - peor
  };
};

/**
 * El DESFASE entre lo que llega y lo que se puede producir, en piezas al dia.
 *
 * QUE RESUELVE, con el caso real: un diagrama con `arrivalRate` de 1 por minuto -480
 * piezas al dia- y 25 tareas de 244 minutos por pieza con UNA unidad en cada piscina. La
 * corrida tardaba 254 dias para 3000 piezas, y el usuario lo reporto como error: «no tiene
 * sentido, cuando mucho eran 10 dias».
 *
 * No era un error, y la explicacion cabe en dos numeros que el informe no daba juntos:
 *
 *   llegan      480 piezas/dia    (1 por minuto x 480 minutos de jornada)
 *   se producen ~ 60 piezas/dia   (lo que da el puesto mas lento)
 *
 * Con esas dos cifras el lector ve el problema en cinco segundos: la cola crece 420 piezas
 * al dia y NO PUEDE VACIARSE. Los «254 dias» no son lo que tarda una pieza, son cuando sale
 * la ULTIMA de una cola que no dejo de crecer.
 *
 * POR QUE ES UN CALCULO Y NO UN TEXTO FIJO: la cifra depende del diagrama, y un aviso que no
 * lleva numeros se lee como una advertencia generica y se ignora.
 *
 * `entradas` es `{ llegadasPorDia, capacidadPorDia, piezas }`. Devuelve `null` cuando no hay
 * desfase que declarar -capacidad de sobra-, porque un aviso permanente se aprende a ignorar.
 */
export const desfaseDeCapacidad = ({ llegadasPorDia, capacidadPorDia, piezas }) => {
  if (!Number.isFinite(llegadasPorDia) || !Number.isFinite(capacidadPorDia)) return null;
  if (llegadasPorDia <= 0 || capacidadPorDia <= 0) return null;

  const colaPorDia = llegadasPorDia - capacidadPorDia;
  // Holgura: solo se avisa cuando NO se da abasto. Un 5 % de margen no es un problema y decirlo
  // convertiria el aviso en ruido de fondo.
  if (colaPorDia <= 0) return null;

  const factor = llegadasPorDia / capacidadPorDia;
  return {
    llegadasPorDia: Math.round(llegadasPorDia),
    capacidadPorDia: Math.round(capacidadPorDia),
    colaPorDia: Math.round(colaPorDia),
    factor,
    // Cuanto tardaria el lote si SOLO se produjera -sin nuevas llegadas encima-. Es el numero
    // optimista que el usuario tiene en la cabeza cuando dice «cuando mucho 10 dias».
    diasDeTrabajo: piezas > 0 ? piezas / capacidadPorDia : null,
    // Y lo que tarda de verdad, con la cola realimentandose: es el que sale en el informe.
    titulo: `Las llegadas superan la capacidad en ${factor.toFixed(1)}×`,
    consecuencia: `Entran ${Math.round(llegadasPorDia)} piezas al día y la planta puede producir `
      + `unas ${Math.round(capacidadPorDia)}. La cola crece ${Math.round(colaPorDia)} piezas al día, `
      + 'así que el tiempo total NO mide lo que tarda una pieza: mide cuándo sale la última de una '
      + 'cola que no deja de crecer. El proceso no está lento; el plan no cabe.'
  };
};

/**
 * Lo que el aviso de saturación cambia en el RESTO del informe.
 *
 * POR QUE ESTO ES UN TEXTO Y NO UNA BANDERA: el informe tiene varias afirmaciones que dejan de ser
 * ciertas cuando la corrida esta saturada -los percentiles de ciclo, el Pareto de esperas, la
 * comparacion de planes-, y cada una tiene que decir su propia version. Una bandera booleana
 * obligaria a que el lector dedujera cual de ellas falla.
 */
export const avisosPorSaturacion = (diagnostico) => {
  if (!diagnostico || diagnostico.nivel !== 'saturado') return { ciclo: null, espera: null, planes: null };

  return {
    ciclo: 'Con el sistema saturado, estos percentiles dependen de cuánto duró la corrida y no del '
      + 'proceso. No los use como plazo: para eso hay que bajar ρ por debajo de 1 y volver a simular.',
    espera: 'El Pareto de esperas sigue diciendo DÓNDE se acumula la cola, pero no CUÁNTO: el '
      + 'tiempo de espera de un sistema saturado crece sin límite, así que las magnitudes no son '
      + 'comparables con las de un sistema que sí da abasto.',
    planes: 'La comparación entre planes es válida como ORDEN —el plan con más capacidad espera '
      + 'menos—, pero no como magnitud. Con ρ ≥ 1, las diferencias de plazo dependen de la duración '
      + 'de la corrida y no del plan.',
    // El legal SI sigue valiendo: el cumplimiento de los topes se cuenta sobre semanas reales del
    // calendario, no sobre una cola que crece. Decirlo evita que el lector descarte un hallazgo
    // valido por culpa del aviso.
    legal: 'El cumplimiento de los topes de la LFT SÍ es válido: se cuenta sobre semanas reales '
      + 'del calendario y no depende de la cola.'
  };
};
