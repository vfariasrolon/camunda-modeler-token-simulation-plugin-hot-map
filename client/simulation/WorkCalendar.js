// A simple WorkCalendar class to manage work hours and breaks.
export default class WorkCalendar {
  constructor(config) {
    // Default to a standard 9-5 workday if no config is provided
    this.workHours = config.workHours || { start: 9, end: 17 }; // 9am to 5pm
    this.workDays = config.workDays || [1, 2, 3, 4, 5]; // Monday to Friday
    this.breaks = config.breaks || [{ start: 12, end: 13 }]; // 1-hour lunch break
  }

  // Checks if a given timestamp (in milliseconds from start of simulation) is within a working period.
  isWorkTime(timestamp) {
    const msInHour = 60 * 60 * 1000;
    const msInDay = 24 * msInHour;

    const dayOfWeek = new Date(timestamp).getDay(); // Sunday is 0, Monday is 1, etc.
    const hourOfDay = new Date(timestamp).getUTCHours(); // Use UTC hours to avoid timezone issues

    if (!this.workDays.includes(dayOfWeek)) {
      return false; // Not a working day
    }

    if (hourOfDay < this.workHours.start || hourOfDay >= this.workHours.end) {
      return false; // Outside of working hours
    }

    for (const breakPeriod of this.breaks) {
      if (hourOfDay >= breakPeriod.start && hourOfDay < breakPeriod.end) {
        return false; // During a break
      }
    }

    return true;
  }

  // Adjusts a timestamp to the next available working time.
  adjustTimestamp(timestamp) {
    let newTimestamp = timestamp;
    const msInHour = 60 * 60 * 1000;
    const msInDay = 24 * msInHour;

    while (!this.isWorkTime(newTimestamp)) {
      const date = new Date(newTimestamp);
      const hour = date.getUTCHours();

      // If before work hours or during a break, jump to the end of that period
      if (hour < this.workHours.start) {
        date.setUTCHours(this.workHours.start, 0, 0, 0);
        newTimestamp = date.getTime();
        continue;
      }

      let inBreak = false;
      for (const breakPeriod of this.breaks) {
        if (hour >= breakPeriod.start && hour < breakPeriod.end) {
          date.setUTCHours(breakPeriod.end, 0, 0, 0);
          newTimestamp = date.getTime();
          inBreak = true;
          break;
        }
      }
      if (inBreak) continue;

      // If after work hours or on a non-working day, jump to the start of the next day
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(this.workHours.start, 0, 0, 0);
      newTimestamp = date.getTime();
    }
    return newTimestamp;
  }
}
