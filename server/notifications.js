const sendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
export const customerEmailConfigured = sendConfigured;
export const notificationsEnabled = Boolean(sendConfigured && process.env.BARBER_NOTIFICATION_EMAIL);

async function sendEmail({to, subject, text}) {
  if (!sendConfigured) return { accepted:false, reason:'not_configured' };
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[to],subject,text}),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Email service returned HTTP ${response.status}`);
  return { accepted:true };
}

export async function notifyBarber({ booking, service }) {
  if (!notificationsEnabled) return { accepted:false, reason:'not_configured' };
  return sendEmail({
    to:process.env.BARBER_NOTIFICATION_EMAIL.trim().toLowerCase(),
    subject:`New appointment: ${service.name} — ${booking.date} at ${booking.time}`,
    text:[
      'New booking at William\'s Barber Studio',
      `Name: ${booking.name}`,
      `Email: ${booking.email}`,
      `Phone: ${booking.phone}`,
      `Service: ${service.name}`,
      `Date: ${booking.date}`,
      `Time: ${booking.time} (Pacific Time)`,
      `Duration: ${service.duration} minutes`,
      `Price: $${service.price}`,
      `Notes: ${booking.notes || 'None'}`,
      `Booking ID: ${booking.id}`
    ].join('\n')
  });
}

export async function notifyCustomer({ booking, service }) {
  if (!customerEmailConfigured) return { accepted:false, reason:'not_configured' };
  return sendEmail({
    to:booking.email,
    subject:`Your appointment is confirmed — William's Barber Studio`,
    text:[
      `Hi ${booking.name},`,
      '',
      `Your appointment at William's Barber Studio is confirmed!`,
      '',
      `Service: ${service.name}`,
      `Date: ${booking.date}`,
      `Time: ${booking.time} (Pacific Time)`,
      `Duration: ${service.duration} minutes`,
      `Price: $${service.price} (payment at appointment)`,
      `Booking reference: ${booking.id}`,
      '',
      'CANCELLATION / RESCHEDULING POLICY',
      'Please request any cancellation or rescheduling at least 24 hours before the appointment.',
      'Message @willxwiz on Instagram: https://www.instagram.com/willxwiz/',
      'There is no self-service cancellation link at this time.',
      '',
      'Thank you,',
      "William's Barber Studio"
    ].join('\n')
  });
}
