/**
 * Calendario laboral: dias laborables, jornada, DESCANSOS y festivos.
 *
 * El descanso no se modela como un "hueco en el reloj", sino como lo que es: la
 * jornada se parte en TRAMOS de trabajo, y el descanso es lo que queda entre
 * ellos. Asi, todo el calendario usa un unico mecanismo —moverse al inicio del
 * siguiente tramo— tanto para saltar una noche o un fin de semana como para
 * saltar la comida. No hay dos logicas de tiempo, hay una.
 *
 * Estructura de la configuracion (compatible hacia atras):
 *
 *   workingDays:  [1, 2, 3, 4, 5]
 *   workingHours: { start: {hour,minute}, end: {hour,minute} }
 *   breaks: [ { start, end, cuentaComoJornada, existeEnExtra } ]   <- NUEVO
 *   holidays: [ "2026-01-01", ... ]
 *
 * Sin `breaks` el comportamiento es EXACTAMENTE el de antes: una jornada
 * continua. Eso importa: hay diagramas guardados y CSV en circulacion.
 */

// Tope de seguridad al buscar el siguiente tramo. Sin el, un calendario sin
// ningun dia laborable daria un bucle infinito en lugar de fallar.
const LIMITE_DIAS_BUSQUEDA = 4000;

/** Minutos desde medianoche de un { hour, minute } del motor. */
const aMinutos = (t) => (t && Number.isFinite(t.hour) && Number.isFinite(t.minute)
  ? t.hour * 60 + t.minute
  : null);

/**
 * Clave de dia "AAAA-MM-DD" en hora LOCAL.
 *
 * ERROR CORREGIDO: se usaba `toISOString().slice(0, 10)`, que es UTC. En un huso
 * negativo (Mexico), las 23:00 locales ya son el dia siguiente en UTC, asi que
 * un festivo podia no aplicarse (o aplicarse un dia antes). Con jornadas de 9 a
 * 17 casi nunca saltaba, pero el error estaba ahi y afectaba a `holidays` y a
 * `calculateWorkingDays`.
 */
const claveDeDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default class BusinessCalendar {
  constructor(config = {}) {
    this.config = {
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      workingHours: {
        start: { hour: 9, minute: 0 },
        end: { hour: 17, minute: 0 }
      },
      breaks: [],
      holidays: [],
      ...config
    };

    // --- valores precalculados -------------------------------------------
    // `isWorkingTime()` se llama MINUTO A MINUTO en calculateBusinessDuration
    // InMinutes, asi que no puede asignar objetos. Todo lo que se pueda
    // precalcular, se precalcula aqui una sola vez.
    this._dias = new Set(this.config.workingDays || []);
    this._festivos = new Set(this.config.holidays || []);
    this._jornada = {
      inicio: aMinutos(this.config.workingHours && this.config.workingHours.start),
      fin: aMinutos(this.config.workingHours && this.config.workingHours.end)
    };

    const bruto = Array.isArray(this.config.breaks) ? this.config.breaks : [];
    this._descansos = bruto
      .map((b) => ({
        inicio: aMinutos(b && b.start),
        fin: aMinutos(b && b.end),
        // Interruptor 1: si el descanso cuenta como tiempo de jornada (afecta a
        // las horas extra). La ley lo exige cuando NO se puede salir del centro.
        cuentaComoJornada: Boolean(b && b.cuentaComoJornada),
        // Interruptor 3: si el descanso existe tambien en el tramo de horas
        // extra (lo lee el motor al montar el calendario extendido).
        existeEnExtra: !(b && b.existeEnExtra === false)
      }))
      // Un descanso sin horas validas o con fin <= inicio se ignora en vez de
      // romper el calendario.
      .filter((b) => Number.isFinite(b.inicio) && Number.isFinite(b.fin) && b.fin > b.inicio);
  }

  /** ¿El dia de esa fecha es laborable (dia de la semana y no festivo)? */
  _esDiaLaborable(date) {
    if (!this._dias.has(date.getDay())) return false;
    return !this._festivos.has(claveDeDia(date));
  }

  /**
   * Tramos de TRABAJO de un dia, en minutos desde medianoche y ordenados.
   * Es la jornada menos los descansos. Un dia no laborable devuelve [].
   */
  tramosDelDia(date) {
    if (!this._esDiaLaborable(date)) return [];
    const { inicio, fin } = this._jornada;
    if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return [];

    let tramos = [ { inicio, fin } ];

    this._descansos.forEach((b) => {
      const siguientes = [];
      tramos.forEach((t) => {
        // Descanso que no toca este tramo: se queda igual.
        if (b.fin <= t.inicio || b.inicio >= t.fin) {
          siguientes.push(t);
          return;
        }
        // Si queda trabajo antes del descanso, ahi acaba este tramo...
        if (b.inicio > t.inicio) siguientes.push({ inicio: t.inicio, fin: b.inicio });
        // ...y si queda despues, ahi empieza el siguiente.
        if (b.fin < t.fin) siguientes.push({ inicio: b.fin, fin: t.fin });
      });
      tramos = siguientes;
    });

    return tramos.filter((t) => t.fin > t.inicio).sort((a, b) => a.inicio - b.inicio);
  }

  /** Minutos de trabajo de un dia (jornada menos descansos). */
  minutosDeTrabajoDelDia(date) {
    return this.tramosDelDia(date).reduce((total, t) => total + (t.fin - t.inicio), 0);
  }

  /** Tramo de trabajo que contiene esa fecha, o null si cae fuera. */
  _tramoDe(date) {
    if (!this._esDiaLaborable(date)) return null;
    const minuto = date.getHours() * 60 + date.getMinutes();
    const tramos = this.tramosDelDia(date);
    for (let i = 0; i < tramos.length; i++) {
      if (minuto >= tramos[i].inicio && minuto < tramos[i].fin) return tramos[i];
    }
    return null;
  }

  /**
   * ¿Es hora de trabajo? Incluye los descansos: dentro de un descanso NO se
   * trabaja, aunque se este dentro de la jornada.
   *
   * Sin asignar memoria a proposito: se llama minuto a minuto.
   */
  isWorkingTime(date) {
    if (!this._esDiaLaborable(date)) return false;

    const minuto = date.getHours() * 60 + date.getMinutes();
    if (minuto < this._jornada.inicio || minuto >= this._jornada.fin) return false;

    for (let i = 0; i < this._descansos.length; i++) {
      const b = this._descansos[i];
      if (minuto >= b.inicio && minuto < b.fin) return false;
    }
    return true;
  }

  /** Inicio del primer tramo ESTRICTAMENTE posterior a esa fecha. */
  _siguienteInicioDeTramo(date) {
    const cursor = new Date(date.getTime());
    const minutoActual = cursor.getHours() * 60 + cursor.getMinutes();

    for (let dia = 0; dia < LIMITE_DIAS_BUSQUEDA; dia++) {
      const tramos = this.tramosDelDia(cursor);
      for (let i = 0; i < tramos.length; i++) {
        const t = tramos[i];
        if (dia > 0 || t.inicio > minutoActual) {
          const destino = new Date(cursor.getTime());
          destino.setHours(Math.floor(t.inicio / 60), t.inicio % 60, 0, 0);
          return destino;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    }

    // Sin ningun dia laborable configurado. Se devuelve null para que quien
    // llame decida; antes esto era un bucle infinito.
    return null;
  }

  /**
   * Inicio del tramo de trabajo que contiene la fecha (o del siguiente).
   *
   * Es el DISPARADOR de la curva de arranque: cada tramo empieza con un
   * arranque. El primero del dia es el de la jornada; los siguientes son los del
   * regreso del descanso. Un solo concepto, dos usos.
   */
  inicioDeTramo(date) {
    const tramo = this._tramoDe(date);
    if (tramo) {
      const inicio = new Date(date.getTime());
      inicio.setHours(Math.floor(tramo.inicio / 60), tramo.inicio % 60, 0, 0);
      return inicio;
    }
    return this._siguienteInicioDeTramo(date);
  }

  /** ¿La fecha cae en el PRIMER tramo del dia (arranque de jornada)? */
  esPrimerTramo(date) {
    const tramo = this._tramoDe(date);
    if (!tramo) return false;
    const tramos = this.tramosDelDia(date);
    return tramos.length > 0 && tramos[0].inicio === tramo.inicio;
  }

  /**
   * Suma minutos DE TRABAJO saltando noches, fines de semana y descansos.
   *
   * Se recorre tramo a tramo en lugar de calcular "dias completos" con una
   * division: con varios tramos por dia (los descansos) esa division ya no tiene
   * sentido, y era el origen de un error.
   *
   * ERROR CORREGIDO (regresion): la version anterior calculaba los dias completos
   * DESPUES de haber avanzado ya al dia siguiente, asi que contaba una jornada de
   * mas en cuanto la duracion cruzaba dias enteros. Una tarea de 16 h que
   * empezaba el martes terminaba el jueves en lugar del miercoles. Solo afectaba
   * a duraciones de dos jornadas o mas (con jornada de 8 h, a partir de 16 h),
   * por eso no salia en las corridas normales.
   *
   * Tambien se conserva la milesima al sumar: antes se hacia con setMinutes(),
   * que trunca los decimales, asi que una duracion de 10,5 min sumaba 10 y ese
   * medio minuto perdido por tarea se acumulaba.
   */
  addWorkingTime(startDate, durationInMinutes) {
    if (!(durationInMinutes > 0)) return new Date(startDate.getTime());

    let restante = durationInMinutes;
    let cursor = new Date(startDate.getTime());

    for (let guarda = 0; guarda < LIMITE_DIAS_BUSQUEDA; guarda++) {
      const tramo = this._tramoDe(cursor);

      if (tramo) {
        const minuto = cursor.getHours() * 60 + cursor.getMinutes();
        const restanteEnTramo = tramo.fin - minuto;

        if (restante <= restanteEnTramo) {
          return new Date(cursor.getTime() + Math.round(restante * 60000));
        }
        restante -= restanteEnTramo;
      }

      const siguiente = this._siguienteInicioDeTramo(cursor);
      if (!siguiente || siguiente.getTime() <= cursor.getTime()) return cursor;
      cursor = siguiente;
    }

    return cursor;
  }

  /**
   * Minutos de TRABAJO entre dos instantes. Cuenta minuto a minuto, y con
   * descansos un minuto de descanso NO cuenta.
   *
   * Nota de rendimiento (limitacion conocida): esta funcion itera minuto a
   * minuto, y es la que alimenta esperas y tiempos de ciclo. Es correcta pero su
   * coste crece con la duracion simulada.
   */
  calculateBusinessDurationInMinutes(startDate, endDate) {
    if (endDate <= startDate) return 0;

    let totalMinutes = 0;
    let cursor = new Date(startDate.getTime());

    while (cursor < endDate) {
      if (this.isWorkingTime(cursor)) totalMinutes++;
      cursor.setMinutes(cursor.getMinutes() + 1);
    }

    return totalMinutes;
  }

  /**
   * Descompone una tarea en tiempo trabajado y horas extra.
   *
   * ERROR CORREGIDO: antes el campo `overtime` se calculaba como
   *   (tiempo de reloj) - (tiempo trabajado)
   * que NO son horas extra, sino el hueco NO laboral que atraviesa la tarea:
   * noches, fines de semana y saltos entre jornadas. Una tarea de 2 h que
   * empieza un lunes a las 16:00 con jornada 9-17 termina el martes a las 10:00
   * y registraba 16 h de "horas extra". El efecto era doble: se pagaba recargo
   * por las noches del plan normal, y las horas realmente extra del plan
   * extendido se registraban con recargo CERO.
   *
   * Horas extra es el tiempo trabajado FUERA del horario estandar:
   *   overtime = duracion - (minutos de la tarea dentro del horario estandar)
   *
   * Con descansos el resultado sigue siendo correcto: el descanso no es trabajo,
   * asi que no se cuenta en ninguna de las dos partes y una tarea que se parte
   * por la comida no genera horas extra por ese rato.
   *
   * @param {Date}   startDate
   * @param {number} durationInMinutes duracion trabajada (segun el calendario de
   *                                   esta instancia, que puede ser el extendido)
   * @param {BusinessCalendar} [standardCalendar] calendario SIN horas extra. Si
   *                                   se omite, se usa esta instancia, y entonces
   *                                   el resultado es 0: correcto, porque un
   *                                   calendario estandar no tiene horas extra.
   */
  calculateBusinessTime(startDate, durationInMinutes, standardCalendar) {
    const start = new Date(startDate.getTime());
    const endDate = this.addWorkingTime(new Date(startDate.getTime()), durationInMinutes);

    const businessMs = durationInMinutes * 60 * 1000;

    const standard = standardCalendar || this;
    const standardMinutes = standard.calculateBusinessDurationInMinutes(start, endDate);
    const overtimeMs = Math.max(0, durationInMinutes - standardMinutes) * 60 * 1000;

    return {
      businessTime: businessMs,
      overtime: overtimeMs,
      endTime: endDate
    };
  }

  /** Igual que la version en minutos, pero devuelve milisegundos. */
  calculateBusinessDuration(startDate, endDate) {
    if (endDate <= startDate) return 0;

    let businessMs = 0;

    // Se recorre por tramos (que ya excluyen los descansos) en lugar de por el
    // bloque unico de jornada, que contaba el descanso como tiempo trabajado.
    for (let guarda = 0; guarda < LIMITE_DIAS_BUSQUEDA; guarda++) {
      const tramos = this.tramosDelDia(startDate);
      let avanzado = false;

      for (let i = 0; i < tramos.length; i++) {
        const inicio = new Date(startDate.getTime());
        inicio.setHours(Math.floor(tramos[i].inicio / 60), tramos[i].inicio % 60, 0, 0);

        const fin = new Date(startDate.getTime());
        fin.setHours(Math.floor(tramos[i].fin / 60), tramos[i].fin % 60, 0, 0);

        if (fin <= startDate) continue;

        const desde = Math.max(inicio.getTime(), startDate.getTime());
        const hasta = Math.min(fin.getTime(), endDate.getTime());
        if (desde < hasta) {
          businessMs += (hasta - desde);
          avanzado = true;
        }
        if (hasta >= endDate.getTime()) return businessMs;
      }

      // Avanzar un dia entero. `startDate` se reusa como cursor local.
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1);
      if (!avanzado && startDate.getTime() > endDate.getTime()) return businessMs;
    }

    return businessMs;
  }

  /** Fin del ULTIMO tramo de trabajo de ese dia (o null si no es laborable). */
  getWorkdayEnd(date) {
    const tramos = this.tramosDelDia(date);
    if (!tramos.length) return null;

    const ultimo = tramos[tramos.length - 1];
    const fin = new Date(date.getTime());
    fin.setHours(Math.floor(ultimo.fin / 60), ultimo.fin % 60, 0, 0);
    return fin;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Clave unica de la semana ISO: "AAAA-Wnn" (p. ej. "2026-W03").
   *
   * getWeekNumber() devuelve SOLO el numero de semana, asi que la semana 1 de
   * 2026 y la de 2027 compartian contador. Quien use el numero como clave (el
   * cupo semanal de horas extra del motor) sumaba entre si dos semanas separadas
   * por un año, y la segunda heredaba el cupo ya agotado de la primera.
   *
   * El año que acompaña es el año ISO (el de la semana), no el natural: el 1 de
   * enero puede pertenecer a la ultima semana de diciembre del año anterior.
   */
  getWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const isoYear = d.getUTCFullYear();
    return `${isoYear}-W${String(this.getWeekNumber(date)).padStart(2, '0')}`;
  }

  calculateWorkingDays(startDate, endDate) {
    let workingDaysCount = 0;
    let currentDate = new Date(startDate.getTime());
    currentDate.setHours(0, 0, 0, 0); // Start of the day

    while (currentDate <= endDate) {
      if (this._esDiaLaborable(currentDate)) workingDaysCount++;
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDaysCount;
  }
}
