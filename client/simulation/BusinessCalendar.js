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
    // TODO: Holiday check
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
    while (!this.config.workingDays.includes(newDate.getDay())) {
      newDate.setDate(newDate.getDate() + 1);
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
            let calendarDays = 0;
            let workDaysCounted = 0;
            let tempDate = new Date(currentDate.getTime());
            while(workDaysCounted < fullDays) {
                if(this.config.workingDays.includes(tempDate.getDay())) {
                    workDaysCounted++;
                }
                if (workDaysCounted < fullDays) {
                  tempDate.setDate(tempDate.getDate() + 1);
                  calendarDays++;
                }
            }
            currentDate.setDate(currentDate.getDate() + calendarDays);
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

  calculateBusinessTime(startDate, durationInMinutes) {
    const businessTimeMs = durationInMinutes * 60000;

    if (businessTimeMs <= 0) {
      return { businessTime: 0, overtime: 0 };
    }

    const endDate = this.addWorkingTime(new Date(startDate.getTime()), durationInMinutes);
    const totalElapsedMs = endDate.getTime() - startDate.getTime();

    // Overtime is the total elapsed time minus the business time.
    const overtimeMs = totalElapsedMs - businessTimeMs;

    return { businessTime: businessTimeMs, overtime: overtimeMs > 0 ? overtimeMs : 0 };
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
