import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE, validateSchedule, businessHoursFor, publicSchedule } from '../server/studio-config.js';
import { getAvailableSlots, validateDate, validateBooking, dateOffset, dayOfWeek } from '../server/scheduling.js';

const now={date:'2027-05-28', minutes:600};
const tuesday=(()=>{let d='2027-06-01';while(dayOfWeek(d)!==2)d=dateOffset(d,1);return d;})();

test('default schedule exposes seven opening days',()=>{
  const schedule=validateSchedule(DEFAULT_SCHEDULE);
  assert.equal(schedule.weeklyHours.length,7);
  assert.equal(publicSchedule(schedule).openDays[1],false);
});
test('owner can close any weekday',()=>{
  const schedule=validateSchedule({weeklyHours:DEFAULT_SCHEDULE.weeklyHours.map((h,i)=>i===2?null:h),blockedDates:[]});
  const hours=businessHoursFor(schedule);
  assert.match(validateDate(tuesday,now,hours,[]),/unavailable/);
  assert.deepEqual(getAvailableSlots({date:tuesday,serviceId:'classic',now,businessHours:hours}),[]);
});
test('owner can block a specific date',()=>{
  const schedule=validateSchedule({...DEFAULT_SCHEDULE,blockedDates:[tuesday]});
  const hours=businessHoursFor(schedule);
  assert.deepEqual(getAvailableSlots({date:tuesday,serviceId:'fade',now,businessHours:hours,blockedDates:schedule.blockedDates}),[]);
});
test('booking validation obeys edited closing hours',()=>{
  const weeklyHours=DEFAULT_SCHEDULE.weeklyHours.map((h,i)=>i===2?{open:'09:00',close:'12:00'}:h);
  const hours=businessHoursFor(validateSchedule({weeklyHours,blockedDates:[]}));
  const body={serviceId:'fade',date:tuesday,time:'11:30',name:'Jane Sample',email:'jane@example.com',phone:'714-555-1234'};
  assert.match(validateBooking(body,now,hours,[]),/outside business hours/);
});
test('invalid schedule times and dates are refused',()=>{
  assert.throws(()=>validateSchedule({...DEFAULT_SCHEDULE,weeklyHours:DEFAULT_SCHEDULE.weeklyHours.map((h,i)=>i===0?{open:'10:15',close:'16:00'}:h)}),/Invalid/);
  assert.throws(()=>validateSchedule({...DEFAULT_SCHEDULE,blockedDates:['2026-02-30']}),/Invalid/);
});
