const $ = (selector) => document.querySelector(selector);
const state = { config: null, selectedService: 'classic', selectedDate: null, selectedTime: null, weekOffset: 0, slots: [], loading: false, requestSeq: 0 };
const dateFormatter = (date, options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
const formatTime = (time) => new Date(`2000-01-01T${time}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const addDays = (date, count) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0,10); };
const dateWeekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const serviceFor = () => state.config.services.find(s => s.id === state.selectedService);
const setMessage = (message) => { $('#form-message').textContent = message || ''; };

function renderServices() {
  const list = $('#service-list'); list.replaceChildren();
  for (const service of state.config.services) {
    const item = document.createElement('button');
    item.type = 'button'; item.className = `service-option ${state.selectedService === service.id ? 'is-selected' : ''}`;
    item.setAttribute('aria-pressed', String(state.selectedService === service.id));
    item.innerHTML = `<span class="service-number">${service.number}</span><span class="service-body"><span class="service-title"></span><span class="service-description"></span></span><span class="service-meta"><span class="service-price"></span><span class="service-time"></span></span><span class="service-radio" aria-hidden="true"></span>`;
    item.querySelector('.service-title').textContent = service.name;
    item.querySelector('.service-description').textContent = service.description;
    item.querySelector('.service-price').textContent = `$${service.price}`;
    item.querySelector('.service-time').textContent = `${service.duration} MIN`;
    item.addEventListener('click', () => {
      if (state.selectedService === service.id) return;
      state.selectedService = service.id; state.selectedTime = null; setMessage('');
      renderServices(); renderSummary(); fetchAvailability();
    });
    list.append(item);
  }
}

function renderSummary() {
  const service = serviceFor();
  $('#selection-summary strong').textContent = service.name;
  $('#total-price').textContent = `$${service.price}`;
}

function renderDates() {
  const container = $('#date-strip'); container.replaceChildren();
  const start = addDays(state.config.today, state.weekOffset * 7);
  $('#calendar-range').textContent = dateFormatter(start,{month:'long',year:'numeric'}).toUpperCase();
  $('#prev-week').disabled = state.weekOffset === 0;
  $('#next-week').disabled = state.weekOffset >= 4;
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(start, offset);
    const enabled = date <= addDays(state.config.today, state.config.maxDaysAhead) && state.config.openDays[dateWeekday(date)] && !state.config.blockedDates.includes(date);
    const button = document.createElement('button'); button.type = 'button';
    button.className = `date-button ${date === state.selectedDate ? 'is-active' : ''}`;
    button.disabled = !enabled;
    button.setAttribute('aria-pressed', String(date === state.selectedDate));
    button.setAttribute('aria-label', dateFormatter(date, { weekday:'long', month:'long', day:'numeric' }));
    const day = document.createElement('span');day.textContent = dateFormatter(date, { weekday: 'short' }).toUpperCase();
    const number = document.createElement('strong');number.textContent = date.slice(-2).replace(/^0/, '');
    button.append(day,number);
    button.addEventListener('click',() => { state.selectedDate = date;state.selectedTime=null;setMessage('');renderDates();fetchAvailability(); });
    container.append(button);
  }
}

function renderTimes() {
  const container = $('#time-grid'); container.replaceChildren();
  if (state.loading) { const text = document.createElement('span');text.className='muted-message';text.textContent='Checking availability…';container.append(text);return; }
  if (!state.slots.length) { const text = document.createElement('span');text.className='muted-message';text.textContent='No spots available. Try another day.';container.append(text);return; }
  for (const time of state.slots) {
    const button = document.createElement('button');button.type='button';button.className=`time-button ${time===state.selectedTime?'is-active':''}`;button.textContent=formatTime(time);button.setAttribute('aria-pressed',String(time===state.selectedTime));
    button.addEventListener('click',()=>{state.selectedTime=time;setMessage('');renderTimes();});
    container.append(button);
  }
}

async function fetchAvailability() {
  if (!state.selectedDate || state.selectedDate>addDays(state.config.today,state.config.maxDaysAhead)) return;
  state.loading=true;renderTimes();const seq=++state.requestSeq;
  try {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(state.selectedDate)}&serviceId=${encodeURIComponent(state.selectedService)}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not check availability.');
    if (seq !== state.requestSeq) return;
    state.slots=body.slots;
    if (!state.slots.includes(state.selectedTime)) state.selectedTime=null;
  } catch (error) {
    if (seq !== state.requestSeq) return;
    state.slots=[];setMessage(error.message);
  } finally { if (seq === state.requestSeq) {state.loading=false;renderTimes();} }
}

function renderHours() {
  const list=$('#hours-list');list.replaceChildren();
  for(const entry of state.config.businessHours) {
    const line=document.createElement('div');line.className='hours-row';
    const day=document.createElement('span');day.textContent=entry.day;
    const hours=document.createElement('strong');hours.textContent=entry.hours;
    line.append(day,hours);list.append(line);
  }
}

function showConfirmation(result) {
  const booking=result.booking;
  $('#confirmation-copy').textContent='Your appointment has been saved. Here are your details:';
  const container=$('#confirmation-details');container.replaceChildren();
  const service=document.createElement('span');service.textContent=booking.service;
  const date=document.createElement('span');date.textContent=`${dateFormatter(booking.date,{month:'short',day:'numeric'})} · ${formatTime(booking.time)}`;
  container.append(service,date);
  const emailStatus = !result.customerEmailConfigured
    ? 'Customer confirmation emails are not configured yet.'
    : result.customerEmailSent ? 'Confirmation email submitted for delivery to your address.' : 'Your booking is saved, but we could not send your confirmation email.';
  const ownerStatus = !result.notificationConfigured
    ? 'Barber notification emails are not configured yet.'
    : result.notificationSent ? 'William was notified by email.' : 'Barber email was not sent.';
  $('#demo-warning').textContent=`${emailStatus} ${ownerStatus} For changes, contact @willxwiz at least 24 hours in advance.`;
  $('#success-modal').hidden=false;$('#close-modal').focus();
}

async function book(event) {
  event.preventDefault(); if (state.loading) return;
  if (!state.selectedDate || !state.selectedTime) {setMessage('Please choose an available date and time.');return;}
  const form=$('#booking-form');
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  const payload = {serviceId:state.selectedService,date:state.selectedDate,time:state.selectedTime,...values};
  const button=$('#submit-button');button.disabled=true;button.textContent='SAVING YOUR APPOINTMENT…';setMessage('');
  try {
    const response = await fetch('/api/bookings', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await response.json();
    if (!response.ok) throw new Error(data.error || 'Booking failed. Please try again.');
    showConfirmation(data); form.reset();state.selectedTime=null;await fetchAvailability();
  } catch (error) {setMessage(error.message);await fetchAvailability();}
  finally {button.disabled=false;button.innerHTML='CONFIRM APPOINTMENT <span>↗</span>';}
}

function firstOpenDateForWeek(offset) {
  const weekStart=addDays(state.config.today,offset*7);
  const maxDate=addDays(state.config.today,state.config.maxDaysAhead);
  for(let i=0;i<7;i++) {
    const date=addDays(weekStart,i);
    if(date<=maxDate && state.config.openDays[dateWeekday(date)] && !state.config.blockedDates.includes(date)) return date;
  }
  return null;
}
function changeWeek(offset) {
  state.weekOffset=offset;
  state.selectedDate=firstOpenDateForWeek(offset);
  state.selectedTime=null;state.slots=[];setMessage('');
  renderDates();
  if(state.selectedDate)fetchAvailability();
  else renderTimes();
}

async function init() {
  $('#year').textContent=new Date().getFullYear();
  $('#booking-form').addEventListener('submit',book);
  $('#prev-week').addEventListener('click',()=>{changeWeek(Math.max(0,state.weekOffset-1));});
  $('#next-week').addEventListener('click',()=>{changeWeek(Math.min(4,state.weekOffset+1));});
  $('#close-modal').addEventListener('click',()=>{$('#success-modal').hidden=true;});
  $('#success-modal').addEventListener('click',(event)=>{if(event.target.id==='success-modal')$('#success-modal').hidden=true;});
  document.addEventListener('keydown',(event)=>{if(event.key==='Escape')$('#success-modal').hidden=true;});
  try {
    const response=await fetch('/api/config');if(!response.ok)throw new Error('Server is unavailable.');
    state.config=await response.json();
    state.selectedDate=firstOpenDateForWeek(0);
    renderServices();renderSummary();renderHours();renderDates();
    if (state.selectedDate) await fetchAvailability();
    else renderTimes();
  } catch(error){$('#service-list').textContent='Unable to load services. Start the Node.js server and refresh.';setMessage('Booking server unavailable.');$('#submit-button').disabled=true;}
}
init();
