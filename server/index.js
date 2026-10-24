import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createReservation, listReservedOn, storageMode } from './repository.js';
import { SERVICES, TIMEZONE, MAX_DAYS_AHEAD, zonedNow, getService, getAvailableSlots, validateBooking, validateDate, toMinutes } from './scheduling.js';
import { notifyBarber, notifyCustomer, notificationsEnabled, customerEmailConfigured } from './notifications.js';
import { loadSchedule, saveSchedule } from './schedule-store.js';
import { businessHoursFor, publicSchedule, validateSchedule } from './studio-config.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false })); // CSP can be added for a deployed site
app.use(express.json({ limit: '12kb' }));
const staticDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
app.use(express.static(staticDir));
const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-7', legacyHeaders: false });

app.get('/api/config', async (_req, res) => {
  try {
    const schedule = await loadSchedule();
    res.json({
      services: SERVICES,
      timezone: TIMEZONE,
      today: zonedNow().date,
      maxDaysAhead: MAX_DAYS_AHEAD,
      storageMode,
      notificationsEnabled,
      customerEmailConfigured,
      ...publicSchedule(schedule)
    });
  } catch (error) {
    console.error('Could not load studio schedule:',error);
    res.status(500).json({error:'Could not load studio schedule.'});
  }
});

// Owner-only schedule editor. The key must be configured in the SERVER environment.
const adminLimiter = rateLimit({ windowMs: 15*60*1000, limit: 15, standardHeaders:'draft-7', legacyHeaders:false });
function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_KEY || '';
  if (configured.length < 16) return res.status(503).json({error:'Set an ADMIN_KEY of at least 16 characters in your .env file first.'});
  const supplied = String(req.headers.authorization || '').replace(/^Bearer /i,'');
  const a = Buffer.from(configured), b = Buffer.from(supplied);
  if (a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'Incorrect owner password.'});
  next();
}
app.get('/api/admin/schedule', adminLimiter, requireAdmin, async (_req,res) => {
  try { res.json(await loadSchedule()); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not load schedule.'}); }
});
app.put('/api/admin/schedule', adminLimiter, requireAdmin, async (req,res) => {
  try {
    const updated=validateSchedule(req.body);
    res.json(await saveSchedule(updated));
  } catch(e) {
    if (e.message.startsWith('Invalid') || e.message.startsWith('Provide')) return res.status(400).json({error:e.message});
    console.error(e);res.status(500).json({error:'Could not save schedule.'});
  }
});

app.get('/api/availability', async (req, res) => {
  const date = String(req.query.date || '');
  const serviceId = String(req.query.serviceId || '');
  if (!getService(serviceId)) return res.status(400).json({ error: 'Invalid service.' });
  try {
    const schedule=await loadSchedule();
    const businessHours=businessHoursFor(schedule);
    const validation=validateDate(date,zonedNow(),businessHours,schedule.blockedDates);
    if(validation) return res.status(400).json({error:validation});
    const bookings = await listReservedOn(date);
    res.json({ date, serviceId, slots: getAvailableSlots({ date, serviceId, bookings, businessHours, blockedDates:schedule.blockedDates }) });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Could not load availability. Try again.' });
  }
});

app.post('/api/bookings', bookingLimiter, async (req, res) => {
  let schedule;
  try { schedule=await loadSchedule(); }
  catch(e) { console.error(e); return res.status(500).json({error:'Could not check opening hours.'}); }
  const invalid = validateBooking(req.body, zonedNow(), businessHoursFor(schedule), schedule.blockedDates);
  if (invalid) return res.status(400).json({ error: invalid });
  const { serviceId, date, time } = req.body;
  const service = getService(serviceId);
  const start = toMinutes(time);
  const booking = {
    service_id: service.id,
    date,
    time,
    start_minute: start,
    end_minute: start + service.duration,
    name: req.body.name.trim(),
    email: req.body.email.trim().toLowerCase(),
    phone: req.body.phone.trim(),
    notes: (req.body.notes || '').trim(),
    status: 'confirmed',
    created_at: new Date().toISOString()
  };
  try {
    const saved = await createReservation(booking);
    // Booking stays saved even if email provider temporarily fails.
    const bookingWithId = { ...booking, id:saved.id };
    let barberNotificationSent = false;
    let customerEmailSent = false;
    try {
      const outcome=await notifyBarber({booking:bookingWithId,service});
      barberNotificationSent=outcome.accepted;
    } catch(e) {console.error('Barber email failed:',e.message);}
    try {
      const outcome=await notifyCustomer({booking:bookingWithId,service});
      customerEmailSent=outcome.accepted;
    } catch(e) {console.error('Customer confirmation email failed:',e.message);}
    res.status(201).json({
      booking:{id:saved.id,service:service.name,date,time,duration:service.duration,price:service.price},
      notificationSent:barberNotificationSent,
      notificationConfigured:notificationsEnabled,
      customerEmailSent,
      customerEmailConfigured
    });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ error: error.message });
    console.error('Booking error:', error);
    res.status(500).json({ error: 'Could not save booking. Please try again.' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: 'Invalid request body.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`William's Barber Studio booking site → http://localhost:${port}`);
  console.log(`Storage: ${storageMode}; email notifications: ${notificationsEnabled ? 'enabled' : 'disabled'}`);
});
