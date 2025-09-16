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
    if (date > newDate) { // if it's already past start time today
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

    const numWorkDays = this.config.workingDays.length;
    if (numWorkDays > 0) {
      const fullDays = Math.floor(remainingMinutes / minutesPerWorkDay);
      if (fullDays > 0) {
        let calendarDays = 0;
        let workDaysCounted = 0;
        let tempDate = new Date(currentDate.getTime());
        while (workDaysCounted < fullDays) {
          if (this.config.workingDays.includes(tempDate.getDay())) {
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

  calculateElapsedTime(startDate, endDate) {
    if (endDate <= startDate) return 0;

    let start = new Date(startDate.getTime());
    let end = new Date(endDate.getTime());

    const { start: startHours, end: endHours } = this.config.workingHours;
    const startTotalMinutes = startHours.hour * 60 + startHours.minute;
    const endTotalMinutes = endHours.hour * 60 + endHours.minute;
    const minutesPerDay = endTotalMinutes - startTotalMinutes;

    if (minutesPerDay <= 0) return 0;

    let elapsedMinutes = 0;

    // Align start and end to be within working hours for calculation
    if (!this.isWorkingTime(start)) start = this._moveToNextWorkingDayStart(start);
    if (start >= end) return 0;

    const startDay = new Date(start.getTime());
    startDay.setHours(0,0,0,0);
    const endDay = new Date(end.getTime());
    endDay.setHours(0,0,0,0);

    // Same day calculation
    if (startDay.getTime() === endDay.getTime()) {
      const startMinutes = start.getHours() * 60 + start.getMinutes();
      const endMinutes = end.getHours() * 60 + end.getMinutes();
      return Math.max(0, endMinutes - startMinutes);
    }

    // First day partial
    const firstDayEndMinutes = endTotalMinutes;
    const firstDayStartMinutes = start.getHours() * 60 + start.getMinutes();
    elapsedMinutes += firstDayEndMinutes - firstDayStartMinutes;

    // Last day partial
    const lastDayStartMinutes = startTotalMinutes;
    const lastDayEndMinutes = end.getHours() * 60 + end.getMinutes();
    if(this.config.workingDays.includes(end.getDay()) && lastDayEndMinutes > lastDayStartMinutes) {
        elapsedMinutes += lastDayEndMinutes - lastDayStartMinutes;
    }

    // Full days in between
    let fullDaysCount = 0;
    let cursor = new Date(start.getTime());
    cursor.setDate(cursor.getDate() + 1);
    while (cursor < endDay) {
        if (this.config.workingDays.includes(cursor.getDay())) {
            fullDaysCount++;
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    elapsedMinutes += fullDaysCount * minutesPerDay;

    return elapsedMinutes;
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
