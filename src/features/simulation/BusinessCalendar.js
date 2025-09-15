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
      // TODO: Add holidays
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

  /**
   * Adds a duration of working time to a given start date.
   * This method skips over non-working days and hours.
   *
   * @param {Date} startDate The date to start from.
   * @param {number} durationInMinutes The duration to add in minutes.
   * @returns {Date} The resulting end date.
   */
  addWorkingTime(startDate, durationInMinutes) {
    let remainingMinutes = durationInMinutes;
    let currentDate = new Date(startDate.getTime());

    // First, move to the next available working time slot if not already in one
    if (!this.isWorkingTime(currentDate)) {
      currentDate = this._moveToNextWorkingDayStart(currentDate);
    }

    while (remainingMinutes > 0) {
      const { end } = this.config.workingHours;
      const endOfDay = new Date(currentDate.getTime());
      endOfDay.setHours(end.hour, end.minute, 0, 0);

      const minutesLeftInDay = (endOfDay.getTime() - currentDate.getTime()) / 60000;

      if (remainingMinutes <= minutesLeftInDay) {
        currentDate.setMinutes(currentDate.getMinutes() + remainingMinutes);
        remainingMinutes = 0;
      } else {
        remainingMinutes -= minutesLeftInDay;
        currentDate = this._moveToNextWorkingDayStart(currentDate);
      }
    }

    return currentDate;
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

  /**
   * Calculates the working time between two dates.
   *
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {number} The duration in minutes.
   */
  calculateElapsedTime(startDate, endDate) {
    let totalMinutes = 0;
    let cursor = new Date(startDate.getTime());

    while (cursor < endDate) {
      if (this.isWorkingTime(cursor)) {
        const { end } = this.config.workingHours;
        const endOfDay = new Date(cursor.getTime());
        endOfDay.setHours(end.hour, end.minute, 0, 0);

        const endOfPeriod = endDate < endOfDay ? endDate : endOfDay;
        totalMinutes += (endOfPeriod.getTime() - cursor.getTime()) / 60000;
      }

      // Move cursor to the start of the next working day
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

  /**
   * Gets the week number for a given date.
   * @param {Date} date The date to check.
   * @returns {number} The week number.
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
}
