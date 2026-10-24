const $=s=>document.querySelector(s);
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let ownerKey='';
const feedback=(message,error=false)=>{const el=$('#admin-feedback');el.textContent=message;el.classList.toggle('error',error);};
const times=[];
for(let min=0;min<=23*60+30;min+=30)times.push(`${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`);
const labelFor=t=>{const [h,m]=t.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;};

function render(schedule) {
  const list=$('#weekly-list');list.replaceChildren();
  schedule.weeklyHours.forEach((hours,day)=>{
    const row=document.createElement('div');row.className='weekday-row';row.dataset.day=String(day);
    const label=document.createElement('label');label.className='weekday-label';
    const check=document.createElement('input');check.type='checkbox';check.checked=!!hours;
    const name=document.createElement('span');name.textContent=days[day];label.append(check,name);
    const makeSelect=(value)=>{
      const select=document.createElement('select');select.disabled=!hours;
      for(const time of times){const option=document.createElement('option');option.value=time;option.textContent=labelFor(time);select.append(option);}
      select.value=value;return select;
    };
    const open=makeSelect(hours?.open||'09:00');
    const close=makeSelect(hours?.close||'18:00');
    open.setAttribute('aria-label',`${days[day]} opening time`);
    close.setAttribute('aria-label',`${days[day]} closing time`);
    check.addEventListener('change',()=>{open.disabled=!check.checked;close.disabled=!check.checked;});
    row.append(label,open,close);list.append(row);
  });
  $('#blocked-dates').value=schedule.blockedDates.join('\n');
  $('#schedule-form').hidden=false;
}
async function request(method,url,body) {
  const response=await fetch(url,{
    method,headers:{'Authorization':`Bearer ${ownerKey}`, ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let result;try{result=await response.json();}catch{throw new Error('Server unavailable. Run npm start (not demo.mjs).');}
  if(!response.ok)throw new Error(result.error||'Could not update schedule.');
  return result;
}
$('#load-schedule').addEventListener('click',async()=>{
  ownerKey=$('#owner-key').value.trim();
  if(!ownerKey){feedback('Enter your owner access key first.',true);return;}
  feedback('Loading schedule…');
  try {render(await request('GET','/api/admin/schedule'));$('#owner-key').value='';feedback('Loaded. Adjust your schedule and click Save Availability.');}
  catch(e){feedback(e.message,true);}
});
$('#schedule-form').addEventListener('submit',async(event)=>{
  event.preventDefault();
  const weeklyHours=[...document.querySelectorAll('.weekday-row')].map(row=>{
    if(!row.querySelector('input').checked)return null;
    const selects=row.querySelectorAll('select');
    return {open:selects[0].value,close:selects[1].value};
  });
  const blockedDates=$('#blocked-dates').value.split(/[\s,]+/).map(v=>v.trim()).filter(Boolean);
  const button=$('#save-schedule');button.disabled=true;feedback('Saving…');
  try {render(await request('PUT','/api/admin/schedule',{weeklyHours,blockedDates}));feedback('Schedule saved! Refresh the website to see updated booking days.');}
  catch(e){feedback(e.message,true);}
  finally{button.disabled=false;}
});
