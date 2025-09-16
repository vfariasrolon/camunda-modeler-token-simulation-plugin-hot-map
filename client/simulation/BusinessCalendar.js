/**
 * A business calendar that is aware of working days and hours.
 *
 * The simulation engine will use this calendar to schedule events
 * and calculate durations, considering only working time.
 */
export default class BusinessCalendar {
  constructor(config = {}) {
    this.config = {
      // Default: Monday to Friday
      workingDays: [1, 2, 3, 4, 5],
      // Default: 9am to 5pm
      workingHours: {
        start: { hour: 9, minute: 0 },
        end: { hour: 17, minute: 0 }
      },
      holidays: [],
      ...config
    };
  }

  /**
   * Checks if a given date falls within working hours and a working day.
   * @param {Date} date The date to check.
   * @returns {boolean}
   */
  isWorkingTime(date) {
    const day = date.getDay();
    if (!this.config.workingDays.includes(day)) {
      return false; // It's not a working day
    }

    // TODO: Check for holidays

    const { start, end } = this.config.workingHours;
    const currentTime = date.getHours() * 60 + date.getMinutes();
    const startTime = start.hour * 60 + start.minute;
    const endTime = end.hour * 60 + end.minute;

    return currentTime >= startTime && currentTime < endTime;
  }

  _moveToNextWorkingDayStart(date) {
    const newDate = new Date(date.getTime());
    const { start } = this.config.workingHours;

    // Move to the start of the next day
    newDate.setDate(newDate.getDate() + 1);
    newDate.setHours(start.hour, start.minute, 0, 0);

    // Find the next working day
    while (!this.config.workingDays.includes(newDate.getDay())) {
      newDate.setDate(newDate.getDate() + 1);
    }

    // TODO: Skip holidays

    return newDate;
  }

  addWorkingTime(startDate, durationInMinutes) {
    let currentDate = new Date(startDate.getTime());
    let remainingMinutes = durationInMinutes;

    if (!this.isWorkingTime(currentDate)) {
      currentDate.setSeconds(0, 0);
      const day = currentDate.getDay();
      const { start, end } = this.config.workingHours;
      const startTime = start.hour * 60 + start.minute;
      const currentTime = currentDate.getHours() * 60 + currentDate.getMinutes();

      if (!this.config.workingDays.includes(day) || currentTime >= (end.hour * 60 + end.minute)) {
        currentDate = this._moveToNextWorkingDayStart(currentDate);
      } else if (currentTime < startTime) {
        currentDate.setHours(start.hour, start.minute);
      }
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
                calendarDays++;
                tempDate.setDate(tempDate.getDate() + 1);
            }
            currentDate.setDate(currentDate.getDate() + calendarDays -1);
            remainingMinutes -= fullDays * minutesPerWorkDay;
        }
    }

    currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);

    return currentDate;
  }

  calculateElapsedTime(startDate, endDate) {
    if (endDate < startDate) return 0;

    let totalMinutes = 0;
    let cursor = new Date(startDate.getTime());

    const { start, end } = this.config.workingHours;
    const startTotalMinutes = start.hour * 60 + start.minute;
    const endTotalMinutes = end.hour * 60 + end.minute;
    const minutesPerWorkDay = endTotalMinutes - startTotalMinutes;

    if (minutesPerWorkDay <= 0) return 0;

    // Align cursor to the beginning of its working day if it's not in working time
    if (!this.isWorkingTime(cursor)) {
        const cursorTime = cursor.getHours() * 60 + cursor.getMinutes();
        if(cursorTime >= endTotalMinutes || !this.config.workingDays.includes(cursor.getDay())){
            cursor = this._moveToNextWorkingDayStart(cursor);
        } else if (cursorTime < startTotalMinutes) {
            cursor.setHours(start.hour, start.minute, 0, 0);
        }
    }

    while(cursor < endDate) {
        const day = cursor.getDay();
        if (this.config.workingDays.includes(day)) {
            const cursorTime = cursor.getHours() * 60 + cursor.getMinutes();

            const startOfPeriod = Math.max(startTotalMinutes, cursorTime);

            const endOfDay = new Date(cursor);
            endOfDay.setHours(23, 59, 59, 999);

            let endOfPeriod;
            if(endDate < endOfDay) { // If endDate is on the same day
                const endTime = endDate.getHours() * 60 + endDate.getMinutes();
                endOfPeriod = Math.min(endTotalMinutes, endTime);
            } else {
                endOfPeriod = endTotalMinutes;
            }

            if (endOfPeriod > startOfPeriod) {
                totalMinutes += (endOfPeriod - startOfPeriod);
            }
        }
        cursor = this._moveToNextWorkingDayStart(cursor);
    }

    return totalMinutes;
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
}
