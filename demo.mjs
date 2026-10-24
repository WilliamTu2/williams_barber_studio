// Zero-dependency preview mode. Run: node demo.mjs
// The main production-style backend lives in server/index.js and uses Express.
// This lightweight local server stores bookings in memory; restart clears them.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { SERVICES, TIMEZONE, MAX_DAYS_AHEAD, zonedNow, getService, getAvailableSlots, validateBooking, validateDate, toMinutes } from './server/scheduling.js';
import { DEFAULT_SCHEDULE, businessHoursFor, publicSchedule, validateSchedule } from './server/studio-config.js';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'public');
const bookings=[];
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
async function demoSchedule(){try{return validateSchedule(JSON.parse(await fs.readFile('.data/schedule.json','utf8')));}catch(e){if(e.code==='ENOENT')return validateSchedule(DEFAULT_SCHEDULE);throw e;}}
const send=(res,status,data)=>{const content=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(content)};
http.createServer(async(req,res)=>{
 try {
  const uri=new URL(req.url,'http://localhost');
  if(req.method==='GET' && uri.pathname==='/api/config') return send(res,200,{services:SERVICES,timezone:TIMEZONE,today:zonedNow().date,maxDaysAhead:MAX_DAYS_AHEAD,storageMode:'preview-memory',notificationsEnabled:false,customerEmailConfigured:false,...publicSchedule(await demoSchedule())});
  if(req.method==='GET' && uri.pathname==='/api/availability') {
   const date=uri.searchParams.get('date'),serviceId=uri.searchParams.get('serviceId');
   const schedule=await demoSchedule(), businessHours=businessHoursFor(schedule);
   if(!getService(serviceId)||validateDate(date,zonedNow(),businessHours,schedule.blockedDates))return send(res,400,{error:'Invalid date or service.'});
   return send(res,200,{date,serviceId,slots:getAvailableSlots({date,serviceId,bookings,businessHours,blockedDates:schedule.blockedDates})});
  }
  if(req.method==='POST' && uri.pathname==='/api/bookings') {
   let raw='';for await(const part of req){raw+=part;if(raw.length>12000)return send(res,413,{error:'Request too large.'});}
   let body;try{body=JSON.parse(raw)}catch{return send(res,400,{error:'Invalid JSON.'})}
   const schedule=await demoSchedule(), businessHours=businessHoursFor(schedule);
   const invalid=validateBooking(body,zonedNow(),businessHours,schedule.blockedDates);if(invalid)return send(res,400,{error:invalid});
   const slots=getAvailableSlots({date:body.date,serviceId:body.serviceId,bookings,businessHours,blockedDates:schedule.blockedDates});
   if(!slots.includes(body.time))return send(res,409,{error:'That time is no longer available.'});
   const service=getService(body.serviceId),start=toMinutes(body.time);
   const saved={id:randomUUID(),date:body.date,time:body.time,service_id:body.serviceId,start_minute:start,end_minute:start+service.duration,status:'confirmed'};
   bookings.push(saved);return send(res,201,{booking:{id:saved.id,service:service.name,date:saved.date,time:saved.time,price:service.price,duration:service.duration},notificationSent:false,notificationConfigured:false,customerEmailSent:false,customerEmailConfigured:false});
  }
  if(uri.pathname.startsWith('/api/admin/'))return send(res,503,{error:'Owner schedule editor requires npm start. The preview mode does not support admin changes.'});
  if(uri.pathname.startsWith('/api/'))return send(res,404,{error:'Not found.'});
  const clean=path.posix.normalize(uri.pathname==='/'?'/index.html':uri.pathname);
  if(clean.includes('..'))return send(res,403,{error:'Forbidden.'});
  const filename=path.join(dir,clean);
  if(!filename.startsWith(dir+path.sep))return send(res,403,{error:'Forbidden.'});
  let bytes;try{bytes=await fs.readFile(filename)}catch{return send(res,404,{error:'Not found.'})}
  res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'});res.end(bytes);
 }catch(error){console.error(error);if(!res.headersSent)send(res,500,{error:'Unexpected error.'});}
}).listen(3000,'127.0.0.1',()=>console.log('Preview ready: http://127.0.0.1:3000 (in-memory, no email, no npm install required)'));
