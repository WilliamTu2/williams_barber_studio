import test from 'node:test';
import assert from 'node:assert/strict';

test('confirmation requests two distinct emails and includes the 24-hour policy', async()=>{
  process.env.RESEND_API_KEY='test_key';
  process.env.RESEND_FROM_EMAIL='Test Studio <bookings@example.com>';
  process.env.BARBER_NOTIFICATION_EMAIL='owner@example.com';
  const {notifyBarber,notifyCustomer,customerEmailConfigured,notificationsEnabled}=await import('../server/notifications.js?test=1');
  assert.equal(customerEmailConfigured,true);
  assert.equal(notificationsEnabled,true);
  const messages=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.resend.com/emails');
    messages.push(JSON.parse(options.body));
    return {ok:true,status:200};
  };
  const booking={id:'test-id',name:'Alex Sample',email:'alex@example.com',phone:'7145551234',date:'2027-06-01',time:'14:00',notes:''};
  const service={name:'Classic Haircut',duration:45,price:25};
  try{
    assert.equal((await notifyBarber({booking,service})).accepted,true);
    assert.equal((await notifyCustomer({booking,service})).accepted,true);
  }finally{globalThis.fetch=originalFetch;}
  assert.deepEqual(messages.map(m=>m.to[0]),['owner@example.com','alex@example.com']);
  assert.match(messages[1].text,/24 hours/);
  assert.match(messages[1].text,/willxwiz/);
  assert.match(messages[1].text,/Classic Haircut/);
});
