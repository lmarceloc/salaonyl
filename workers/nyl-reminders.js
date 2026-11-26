const TIME_ZONE = 'America/Sao_Paulo';
const SALON_EMAIL = 'niltonalmeida3006@gmail.com';
const FROM_EMAIL = 'Nyl Hair Design <agendamento@nylhairdesign.com.br>';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function localDateLabel(value) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}

function nextLocalDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

function bookingRange(date) {
  return {
    start: `${date}T00:00:00-03:00`,
    end: `${nextLocalDate(date)}T00:00:00-03:00`,
  };
}

async function loadBookings(env, date) {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('supabase-not-configured');
  const range = bookingRange(date);
  const query = new URLSearchParams([
    ['select', 'id,client_name,client_phone,client_email,booked_at,status,services(name)'],
    ['status', 'eq.confirmed'],
    ['booked_at', `gte.${range.start}`],
    ['booked_at', `lt.${range.end}`],
    ['order', 'booked_at.asc'],
  ]);
  const response = await fetch(`${base}/rest/v1/bookings?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error('supabase-unavailable');
  return response.json();
}

async function sendEmail(env, { to, subject, html, text, idempotencyKey }) {
  if (!env.RESEND_API_KEY) throw new Error('resend-not-configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text, tags: [{ name: 'type', value: 'booking-reminder' }] }),
  });
  if (!response.ok) throw new Error('resend-failed');
}

async function sendReminders(env, now = new Date()) {
  const date = localDate(now);
  const bookings = await loadBookings(env, date);
  if (!bookings.length) return { date, bookings: 0, clientReminders: 0, salonSummary: false };

  const dateLabel = localDateLabel(bookings[0].booked_at);
  const rows = bookings.map((booking) => {
    const name = escapeHtml(booking.client_name || 'Cliente');
    const service = escapeHtml(booking.services?.name || 'Serviço');
    const time = escapeHtml(localTime(booking.booked_at));
    const phone = escapeHtml(booking.client_phone || 'Não informado');
    const email = escapeHtml(booking.client_email || 'Não informado');
    return { booking, name, service, time, phone, email };
  });

  const salonText = [
    `Resumo de agendamentos — ${dateLabel}`,
    '',
    ...rows.map(({ booking }) => `${booking.client_name || 'Cliente'} — ${booking.services?.name || 'Serviço'} — ${localTime(booking.booked_at)} — Telefone: ${booking.client_phone || 'Não informado'} — E-mail: ${booking.client_email || 'Não informado'}`),
  ].join('\n');
  const salonHtml = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Resumo de agendamentos</h2><p>${escapeHtml(dateLabel)}</p><ul>${rows.map(({ name, service, time, phone, email }) => `<li><strong>${name}</strong> — ${service} — ${time}<br>Telefone: ${phone}<br>E-mail: ${email}</li>`).join('')}</ul></div>`;
  await sendEmail(env, {
    to: SALON_EMAIL,
    subject: `Lembretes do dia — ${dateLabel}`,
    html: salonHtml,
    text: salonText,
    idempotencyKey: `nyl-reminder-salon-${date}`,
  });

  let clientReminders = 0;
  for (const { booking, name, service, time } of rows) {
    if (!booking.client_email) continue;
    await sendEmail(env, {
      to: booking.client_email,
      subject: `Lembrete do seu agendamento — ${service}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Lembrete de agendamento</h2><p>Olá, ${name}!</p><p>Estamos lembrando do seu horário na Nyl Hair Design:</p><p><strong>${service}</strong><br>${escapeHtml(dateLabel)} às <strong>${time}</strong></p><p>Se precisar remarcar, fale conosco pelo WhatsApp: (42) 98882-0334.</p></div>`,
      text: `Olá, ${booking.client_name || 'Cliente'}!\n\nLembrete do seu agendamento na Nyl Hair Design:\n${booking.services?.name || 'Serviço'}\n${dateLabel} às ${localTime(booking.booked_at)}\n\nSe precisar remarcar, fale conosco pelo WhatsApp: (42) 98882-0334.`,
      idempotencyKey: `nyl-reminder-client-${date}-${booking.id}`,
    });
    clientReminders += 1;
  }
  return { date, bookings: bookings.length, clientReminders, salonSummary: true };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendReminders(env).catch((error) => console.error('nyl-reminders failed', error.message)));
  },
};
