// Weekday index: 0 = Sunday, 1 = Monday, ... 6 = Saturday.
// Change the opening days in the private owner dashboard (/admin.html).
// These are the starting hours before the owner saves custom availability.
export const DEFAULT_SCHEDULE = Object.freeze({
  weeklyHours: [
    { open: '10:00', close: '16:00' }, // Sunday
    null,                             // Monday closed
    { open: '09:00', close: '18:00' }, // Tuesday
    { open: '09:00', close: '18:00' }, // Wednesday
    { open: '09:00', close: '18:00' }, // Thursday
    { open: '09:00', close: '18:00' }, // Friday
    { open: '09:00', close: '17:00' }  // Saturday
  ],
  blockedDates: []
});
export const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const toMins = (str) => /^\d{2}:\d{2}$/.test(str || '')
  ? Number(str.slice(0,2))*60 + Number(str.slice(3,5)) : NaN;

export function validateSchedule(input) {
  if (!input || !Array.isArray(input.weeklyHours) || input.weeklyHours.length !== 7) {
    throw new Error('Provide all seven weekdays.');
  }
  const weeklyHours = input.weeklyHours.map((entry, day) => {
    if (entry === null) return null;
    const open = typeof entry?.open === 'string' ? entry.open : '';
    const close = typeof entry?.close === 'string' ? entry.close : '';
    const start = toMins(open), end = toMins(close);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1440 ||
        start % 30 !== 0 || end % 30 !== 0 || end-start < 60 ||
        end > 23*60 + 30) {
      throw new Error(`Invalid opening hours for ${WEEKDAYS[day]}. Use half-hour steps and at least one hour open.`);
    }
    return { open, close };
  });
  if (!Array.isArray(input.blockedDates) || input.blockedDates.length > 120) {
    throw new Error('Provide no more than 120 blocked dates.');
  }
  const blockedDates = [...new Set(input.blockedDates.map((d) => {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Invalid blocked date.');
    const test = new Date(`${d}T12:00:00Z`);
    if (Number.isNaN(test.getTime()) || test.toISOString().slice(0,10) !== d) throw new Error('Invalid blocked date.');
    return d;
  }))].sort();
  return { weeklyHours, blockedDates };
}

export function businessHoursFor(schedule) {
  return Object.fromEntries(schedule.weeklyHours.map((hours, day) => [day, hours
    ? [toMins(hours.open), toMins(hours.close)] : null]));
}

export function displayTime(time) {
  const [h,m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function publicSchedule(schedule) {
  return {
    openDays: schedule.weeklyHours.map(Boolean),
    blockedDates: schedule.blockedDates,
    businessHours: WEEKDAYS.map((name,day) => ({
      day: name, hours: schedule.weeklyHours[day]
        ? `${displayTime(schedule.weeklyHours[day].open)} – ${displayTime(schedule.weeklyHours[day].close)}`
        : 'Closed'
    }))
  };
}
