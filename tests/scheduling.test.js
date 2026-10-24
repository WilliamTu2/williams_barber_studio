import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableSlots, validateBooking, overlaps, toMinutes, minutesToTime, dateOffset, dayOfWeek } from '../server/scheduling.js';

const futureDate = (() => {
  let d = '2027-06-01';
  while (dayOfWeek(d) !== 2) d = dateOffset(d, 1);
  return d;
})();
const fixedNow = { date: '2027-05-28', minutes: 600 };

// Fake now is deliberately set before futureDate for deterministic tests.
test('converts times', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(minutesToTime(570), '09:30');
  assert.ok(Number.isNaN(toMinutes('25:40')));
});
test('overlap treats touching boundaries as nonoverlapping', () => {
  assert.equal(overlaps(540, 600, 600, 660), false);
  assert.equal(overlaps(540, 600, 590, 660), true);
});
test('long services reserve adjacent starts', () => {
  const bookings = [{ date: futureDate, start_minute: 540, end_minute: 600, status: 'confirmed' }];
  const slots = getAvailableSlots({ date: futureDate, serviceId: 'fade', bookings, now: fixedNow });
  assert.ok(!slots.includes('09:00'));
  assert.ok(!slots.includes('09:30'));
  assert.ok(slots.includes('10:00'));
});
test('rejects malformed customer details', () => {
  const valid = { serviceId: 'classic', date: futureDate, time: '10:00', name: 'Jane Smith', email: 'jane@example.com', phone: '(555) 555-1212' };
  assert.equal(validateBooking(valid, fixedNow), null);
  assert.match(validateBooking({ ...valid, email: 'not-an-email' }, fixedNow), /email/);
});
test('monday has no availability', () => {
  let monday = futureDate;
  while(dayOfWeek(monday) !== 1) monday = dateOffset(monday, 1);
  assert.deepEqual(getAvailableSlots({ date: monday, serviceId: 'classic', now: fixedNow }), []);
});
