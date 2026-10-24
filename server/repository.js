import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { overlaps } from './scheduling.js';

const dataPath = path.resolve('.data', 'bookings.json');
let queue = Promise.resolve();
const localMode = (process.env.DATA_MODE || 'local') === 'local';
let supabase;

if (!localMode) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase mode requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}

async function readLocal() {
  try {
    return JSON.parse(await fs.readFile(dataPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeLocal(rows) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  const tmp = `${dataPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2));
  await fs.rename(tmp, dataPath);
}

export async function listReservedOn(date) {
  if (localMode) {
    return (await readLocal()).filter((b) => b.date === date && b.status !== 'cancelled');
  }
  const { data, error } = await supabase.from('bookings')
    .select('date,start_minute,end_minute,status')
    .eq('date', date)
    .eq('status', 'confirmed');
  if (error) throw error;
  return data || [];
}

export async function createReservation(booking) {
  if (!localMode) {
    const { data, error } = await supabase.from('bookings').insert(booking).select('id,date,time,service_id,status').single();
    if (error) {
      if (error.code === '23P01') {
        const conflict = new Error('That time was just booked. Please choose another.');
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
    return data;
  }
  // Serialized local writes prevent overlapping bookings within this Node process.
  const write = async () => {
    const existing = await readLocal();
    if (existing.some((b) => b.date === booking.date && b.status !== 'cancelled' && overlaps(
      b.start_minute, b.end_minute, booking.start_minute, booking.end_minute
    ))) {
      const conflict = new Error('That time was just booked. Please choose another.');
      conflict.status = 409;
      throw conflict;
    }
    const record = { ...booking, id: crypto.randomUUID() };
    existing.push(record);
    await writeLocal(existing);
    return record;
  };
  const result = queue.then(write);
  queue = result.catch(() => {});
  return result;
}

export const storageMode = localMode ? 'local' : 'supabase';
