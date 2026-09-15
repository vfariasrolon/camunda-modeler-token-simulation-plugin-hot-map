/**
 * A business calendar that is aware of working days and hours.
 */
export default class BusinessCalendar {
  constructor(config = {}) {
    this.config = {
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      workingHours: {
        start: { hour: 9, minute: 0 },
        end: { hour: 17, minute: 0 }
      },
      holidays: [],
      ...config
    };
  }

  isWorkingTime(date) {
    const day = date.getDay();
    if (!this.config.workingDays.includes(day)) {
      return false;
    }

    const dateString = date.toISOString().slice(0, 10);
    if (this.config.holidays && this.config.holidays.includes(dateString)) {
      return false;
    }

    const { start, end } = this.config.workingHours;
    const currentTime = date.getHours() * 60 + date.getMinutes();
    const startTime = start.hour * 60 + start.minute;
    const endTime = end.hour * 60 + end.minute;
    return currentTime >= startTime && currentTime < endTime;
  }

  _moveToNextWorkingDayStart(date) {
    const newDate = new Date(date.getTime());
    const { start } = this.config.workingHours;
    newDate.setHours(start.hour, start.minute, 0, 0);

    if (date >= newDate) {
        newDate.setDate(newDate.getDate() + 1);
    }

    while (!this.isWorkingTime(newDate)) {
      newDate.setDate(newDate.getDate() + 1);
      newDate.setHours(start.hour, start.minute, 0, 0);
    }
    return newDate;
  }

  addWorkingTime(startDate, durationInMinutes) {
    if (durationInMinutes <= 0) return new Date(startDate.getTime());

    let currentDate = new Date(startDate.getTime());
    let remainingMinutes = durationInMinutes;

    if (!this.isWorkingTime(currentDate)) {
      currentDate = this._moveToNextWorkingDayStart(currentDate);
    }

    const { start, end } = this.config.workingHours;
    const minutesPerWorkDay = (end.hour - start.hour) * 60 + (end.minute - start.minute);

    if (minutesPerWorkDay <= 0) return currentDate;

    const minutesLeftInDay = ((end.hour * 60 + end.minute) - (currentDate.getHours() * 60 + currentDate.getMinutes()));

    if (remainingMinutes <= minutesLeftInDay) {
      currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
      return currentDate;
    }

    remainingMinutes -= minutesLeftInDay;
    currentDate = this._moveToNextWorkingDayStart(currentDate);

    const numWorkDaysInWeek = this.config.workingDays.length;
    if (numWorkDaysInWeek > 0) {
        const fullDays = Math.floor(remainingMinutes / minutesPerWorkDay);
        if (fullDays > 0) {
            // ERROR CORREGIDO: el bucle contaba las jornadas completas pero no
            // avanzaba mas alla de la ultima contada, asi que currentDate
            // quedaba en el inicio del ULTIMO dia consumido en lugar del
            // inicio del siguiente. Se perdia una jornada entera por tramo:
            // una tarea de 16 h que empezaba el martes terminaba el miercoles
            // en vez del jueves, y el resultado siempre caia dentro del horario
            // laboral, por lo que el error no se veia en los resultados.
            //
            // currentDate ya es el inicio de un dia laborable, y
            // _moveToNextWorkingDayStart() aplicado sobre ese inicio avanza
            // exactamente un dia laborable.
            let consumed = 0;
            let tempDate = new Date(currentDate.getTime());
            while (consumed < fullDays) {
                consumed++;
                tempDate = this._moveToNextWorkingDayStart(tempDate);
            }
            currentDate = tempDate;
            remainingMinutes -= fullDays * minutesPerWorkDay;
        }
    }

    currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);

    return currentDate;
  }

  calculateBusinessDurationInMinutes(startDate, endDate) {
    if (endDate <= startDate) return 0;

    let totalMinutes = 0;
    let cursor = new Date(startDate.getTime());

    while(cursor < endDate) {
        if(this.isWorkingTime(cursor)) {
            totalMinutes++;
        }
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

  calculateBusinessDuration(startDate, endDate) {
    if (endDate <= startDate) return 0;

    let businessMs = 0;
    let current = new Date(startDate.getTime());

    while (current < endDate) {
        const day = current.getDay();

        if (this.config.workingDays.includes(day)) {
            const { start, end } = this.config.workingHours;

            const startOfDay = new Date(current.getTime());
            startOfDay.setHours(start.hour, start.minute, 0, 0);

            const endOfDay = new Date(current.getTime());
            endOfDay.setHours(end.hour, end.minute, 0, 0);

            const effectiveStart = Math.max(current.getTime(), startOfDay.getTime());
            const effectiveEnd = Math.min(endDate.getTime(), endOfDay.getTime());

            if (effectiveStart < effectiveEnd) {
                businessMs += (effectiveEnd - effectiveStart);
            }
        }

        // Move to the start of the next day, robustly
        current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
    }
    return businessMs;
  }

  getWorkdayEnd(date) {
    const { end } = this.config.workingHours;
    const endOfDay = new Date(date.getTime());
    endOfDay.setHours(end.hour, end.minute, 0, 0);
    return endOfDay;
  }

  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  calculateWorkingDays(startDate, endDate) {
    let workingDaysCount = 0;
    let currentDate = new Date(startDate.getTime());
    currentDate.setHours(0, 0, 0, 0); // Start of the day

    const holidaysSet = new Set(this.config.holidays || []);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dateString = currentDate.toISOString().slice(0, 10);

      if (this.config.workingDays.includes(dayOfWeek) && !holidaysSet.has(dateString)) {
        workingDaysCount++;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDaysCount;
  }
}
