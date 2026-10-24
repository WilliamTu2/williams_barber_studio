import { DEFAULT_SCHEDULE, businessHoursFor } from './studio-config.js';
export const SERVICES = Object.freeze([
  { id: 'classic', name: 'Classic Haircut', description: 'A clean, timeless cut tailored to your style.', duration: 45, price: 25, number: '01' },
  { id: 'fade', name: 'Fades & Tapers', description: 'Fresh fades, clean tapers, and sharp details.', duration: 60, price: 30, number: '02' }
]);

export const TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Los_Angeles';
export const MAX_DAYS_AHEAD = 30;
export const BUSINESS_HOURS = Object.freeze(businessHoursFor(DEFAULT_SCHEDULE));

export const getService = (id) => SERVICES.find((s) => s.id === id);
export const toMinutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return NaN;
  const [h, m] = time.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : NaN;
};
export const minutesToTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function zonedNow(timeZone = TIMEZONE, instant = new Date()) {
  const pieces = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
  }).formatToParts(instant);
  const p = Object.fromEntries(pieces.map(({ type, value }) => [type, value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export function dateOffset(dateISO, days) {
  const date = new Date(`${dateISO}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfWeek(dateISO) {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay();
}

export function validateDate(dateISO, now = zonedNow(), hours = BUSINESS_HOURS, blockedDates = []) {
  if (typeof dateISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    return 'Please select a valid date.';
  }
  const date = new Date(`${dateISO}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== dateISO) return 'Please select a valid date.';
  if (dateISO < now.date) return 'Please select a future date.';
  if (dateISO > dateOffset(now.date, MAX_DAYS_AHEAD)) return 'Bookings open 30 days in advance.';
  if (blockedDates.includes(dateISO) || !hours[dayOfWeek(dateISO)]) return 'Will is unavailable on that date. Please choose another.';
  return null;
}

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function getAvailableSlots({ date, serviceId, bookings = [], now = zonedNow(), businessHours = BUSINESS_HOURS, blockedDates = [] }) {
  const service = getService(serviceId);
  if (!service || validateDate(date, now, businessHours, blockedDates)) return [];
  const [open, close] = businessHours[dayOfWeek(date)];
  const list = [];
  for (let start = open; start + service.duration <= close; start += 30) {
    if (date === now.date && start <= now.minutes + 30) continue; // 30-min minimum lead time
    const reserved = bookings.some((b) =>
      b.date === date && b.status !== 'cancelled' && overlaps(start, start + service.duration, b.start_minute, b.end_minute)
    );
    if (!reserved) list.push(minutesToTime(start));
  }
  return list;
}

export function validateBooking(body, now = zonedNow(), businessHours = BUSINESS_HOURS, blockedDates = []) {
  const service = getService(body?.serviceId);
  if (!service) return 'Please choose a service.';
  const dateError = validateDate(body?.date, now, businessHours, blockedDates);
  if (dateError) return dateError;
  const time = toMinutes(body?.time);
  if (!Number.isFinite(time) || time % 30 !== 0) return 'Please choose a valid time.';
  const [open, close] = businessHours[dayOfWeek(body.date)];
  if (time < open || time + service.duration > close) return 'That time is outside business hours.';
  if (body.date === now.date && time <= now.minutes + 30) return 'Please choose a later time.';
  if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 80) return 'Please enter your full name.';
  if (typeof body.email !== 'string' || body.email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'Please enter a valid email.';
  if (typeof body.phone !== 'string' || body.phone.length > 35 || body.phone.replace(/\D/g, '').length < 10) return 'Please enter a valid phone number.';
  if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 400)) return 'Notes must be under 400 characters.';
  return null;
}
