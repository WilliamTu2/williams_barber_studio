import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SCHEDULE, validateSchedule } from './studio-config.js';

const local = (process.env.DATA_MODE || 'local') === 'local';
const filename = path.resolve('.data', 'schedule.json');
let db;
if (!local) {
  db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
  });
}
export async function loadSchedule() {
  if (local) {
    try { return validateSchedule(JSON.parse(await fs.readFile(filename, 'utf8'))); }
    catch(e) { if(e.code === 'ENOENT') return validateSchedule(DEFAULT_SCHEDULE); throw e; }
  }
  const {data,error} = await db.from('studio_settings').select('schedule').eq('id',1).maybeSingle();
  if(error) throw error;
  return validateSchedule(data?.schedule || DEFAULT_SCHEDULE);
}
export async function saveSchedule(input) {
  const schedule=validateSchedule(input);
  if (local) {
    await fs.mkdir(path.dirname(filename),{recursive:true});
    const tmp=filename+'.tmp';
    await fs.writeFile(tmp, JSON.stringify(schedule,null,2));
    await fs.rename(tmp,filename);
  } else {
    const {error}=await db.from('studio_settings').upsert({id:1,schedule},{onConflict:'id'});
    if(error) throw error;
  }
  return schedule;
}
