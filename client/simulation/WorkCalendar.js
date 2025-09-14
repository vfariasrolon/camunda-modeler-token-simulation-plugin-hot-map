/**
 * WorkCalendar class to handle time calculations based on a work schedule.
 */
export default class WorkCalendar {
  constructor(schedule) {
    if (!schedule || !schedule.startTime || !schedule.endTime || !schedule.workDays) {
      throw new Error('WorkCalendar: Invalid schedule provided.');
    }

    this.schedule = schedule;

    const [startH, startM] = schedule.startTime.split(':').map(Number);
    this.startHours = startH;
    this.startMinutes = startM;

    const [endH, endM] = schedule.endTime.split(':').map(Number);
    this.endHours = endH;
    this.endMinutes = endM;

    const [overtimeH, overtimeM] = (schedule.overtimeLimit || schedule.endTime).split(':').map(Number);
    this.overtimeHours = overtimeH;
    this.overtimeMinutes = overtimeM;

    this.lunchBreakMs = (schedule.lunchBreakHours || 0) * 60 * 60 * 1000;
  }

  /**
   * Checks if a given date is a working day according to the schedule.
   * @param {Date} date
   * @returns {boolean}
   */
  isWorkDay(date) {
    const day = date.getDay(); // Sunday=0, Monday=1, ..., Saturday=6
    return this.schedule.workDays.includes(day);
  }

  /**
   * Calculates the end date and time after adding a duration of work,
   * and tracks overtime.
   * @param {Date} startDate
   * @param {number} durationMs - The duration of work in milliseconds.
   * @returns {{finalDate: Date, overtimeMs: number}} The final date and the amount of overtime used.
   */
  addWorkTime(startDate, durationMs) {
    let currentDate = new Date(startDate.getTime());
    let remainingDurationMs = durationMs;
    let overtimeMs = 0;

    this.adjustToStartOfWork(currentDate);

    while (remainingDurationMs > 0) {
      if (!this.isWorkDay(currentDate)) {
        currentDate.setDate(currentDate.getDate() + 1);
        this.adjustToStartOfWork(currentDate);
        continue;
      }

      const regularEndTime = new Date(currentDate.getTime()).setHours(this.endHours, this.endMinutes, 0, 0);
      const overtimeLimitTime = new Date(currentDate.getTime()).setHours(this.overtimeHours, this.overtimeMinutes, 0, 0);

      // --- Regular Hours ---
      if (currentDate.getTime() < regularEndTime) {
        const remainingRegularTime = regularEndTime - currentDate.getTime();
        const timeToAdd = Math.min(remainingDurationMs, remainingRegularTime);
        currentDate.setTime(currentDate.getTime() + timeToAdd);
        remainingDurationMs -= timeToAdd;
        if (remainingDurationMs <= 0) break;
      }

      // --- Overtime Hours ---
      if (currentDate.getTime() < overtimeLimitTime) {
        const remainingOvertime = overtimeLimitTime - currentDate.getTime();
        const timeToAdd = Math.min(remainingDurationMs, remainingOvertime);
        currentDate.setTime(currentDate.getTime() + timeToAdd);
        remainingDurationMs -= timeToAdd;
        overtimeMs += timeToAdd;
        if (remainingDurationMs <= 0) break;
      }

      // If duration still remains, move to the start of the next day
      currentDate.setDate(currentDate.getDate() + 1);
      this.adjustToStartOfWork(currentDate);
    }

    return { finalDate: currentDate, overtimeMs };
  }

  /**
   * Adjusts a given date to the beginning of the next available work slot.
   * @param {Date} date - The date to adjust (will be mutated).
   */
  adjustToStartOfWork(date) {
    while (!this.isWorkDay(date)) {
      date.setDate(date.getDate() + 1);
      date.setHours(this.startHours, this.startMinutes, 0, 0);
    }

    const startTime = new Date(date.getTime()).setHours(this.startHours, this.startMinutes, 0, 0);
    const overtimeLimitTime = new Date(date.getTime()).setHours(this.overtimeHours, this.overtimeMinutes, 0, 0);

    if (date.getTime() >= overtimeLimitTime) {
      date.setDate(date.getDate() + 1);
      date.setHours(this.startHours, this.startMinutes, 0, 0);
      // Recursive call to handle moving from a Friday to a Monday
      this.adjustToStartOfWork(date);
    } else if (date.getTime() < startTime) {
      date.setTime(startTime);
    }
  }
}
