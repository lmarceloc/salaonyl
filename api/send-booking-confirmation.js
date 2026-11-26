const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALON_EMAIL = 'niltonalmeida3006@gmail.com';
const FROM_EMAIL = 'Nyl Hair Design <agendamento@nylhairdesign.com.br>';
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_IP = 12;
const requestsByIp = new Map();
const inFlightByBooking = new Map();

function json(res, status, body, headers = {}) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  return res.end(JSON.stringify(body));
}

function clientIp(req) {
  const forwarded = req.headers?.['cf-connecting-ip'] || req.headers?.['x-forwarded-for'];
  return String(forwarded || 'unknown').split(',')[0].trim().slice(0, 128) || 'unknown';
}

function rateLimited(ip, now = Date.now()) {
  const current = requestsByIp.get(ip);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestsByIp.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_REQUESTS_PER_IP;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function parseBody(req) {
  if (typeof req.body === 'object' && req.body !== null) return req.body;
  return JSON.parse(req.body || '{}');
}

async function loadBooking(bookingId) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('booking-store-not-configured');
  const query = new URLSearchParams({ select: 'id,client_name,client_email,booked_at,status,services(name)', id: `eq.${bookingId}`, limit: '1' });
  const response = await fetch(`${base}/rest/v1/bookings?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error('booking-store-unavailable');
  const rows = await response.json();
  return rows?.[0] || null;
}

function bookingDetails(booking) {
  const email = String(booking.client_email || '').trim().toLowerCase();
  const name = String(booking.client_name || '').trim();
  const serviceName = String(booking.services?.name || '').trim();
  const when = new Date(booking.booked_at);
  if (!EMAIL_RE.test(email) || name.length < 3 || name.length > 120 || !serviceName || !Number.isFinite(when.getTime())) return null;
  return { email, name, serviceName, when };
}

async function sendEmail({ to, subject, html, text, idempotencyKey, apiKey }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html, text, tags: [{ name: 'type', value: 'booking-confirmation' }] }),
  });
  if (!response.ok) throw new Error('mail-provider-failed');
}

async function deliverConfirmation(bookingId, booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const details = bookingDetails(booking);
  if (!apiKey || !details) throw new Error('booking-not-sendable');
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(details.when);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(details.when);
  const safeName = escapeHtml(details.name); const safeService = escapeHtml(details.serviceName); const safeDate = escapeHtml(date); const safeTime = escapeHtml(time);
  await Promise.all([
    sendEmail({ to: details.email, subject: `Agendamento recebido — ${details.serviceName}`, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Agendamento recebido</h2><p>Olá, ${safeName}!</p><p>Recebemos seu agendamento na Nyl Hair Design:</p><p><strong>${safeService}</strong><br>${safeDate} às <strong>${safeTime}</strong></p><p>Se precisar remarcar, fale conosco pelo WhatsApp: (42) 98882-0334.</p></div>`, text: `Olá, ${details.name}!\n\nRecebemos seu agendamento na Nyl Hair Design:\n${details.serviceName}\n${date} às ${time}`, idempotencyKey: `booking-confirmation-client-${bookingId}`, apiKey }),
    sendEmail({ to: SALON_EMAIL, subject: `Novo agendamento — ${details.serviceName}`, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222"><h2>Novo agendamento</h2><p><strong>${safeName}</strong> agendou <strong>${safeService}</strong>.</p><p>${safeDate} às <strong>${safeTime}</strong>.</p><p>Contato: ${escapeHtml(details.email)}</p></div>`, text: `Novo agendamento\nCliente: ${details.name}\nServiço: ${details.serviceName}\n${date} às ${time}\nE-mail: ${details.email}`, idempotencyKey: `booking-confirmation-salon-${bookingId}`, apiKey }),
  ]);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' }, { Allow: 'POST' });
  if (rateLimited(clientIp(req))) return json(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' });
  if (!process.env.RESEND_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json(res, 503, { error: 'Serviço de confirmação ainda não configurado.' });
  let body;
  try { body = parseBody(req); } catch { return json(res, 400, { error: 'JSON inválido.' }); }
  const bookingId = String(body.booking_id || '').trim();
  if (!UUID_RE.test(bookingId)) return json(res, 400, { error: 'Identificador do agendamento inválido.' });
  try {
    const booking = await loadBooking(bookingId);
    if (!booking) return json(res, 404, { error: 'Agendamento não encontrado.' });
    if (['cancelled', 'canceled', 'completed'].includes(String(booking.status || '').toLowerCase())) return json(res, 409, { error: 'Este agendamento não está ativo.' });
    if (!bookingDetails(booking)) return json(res, 409, { error: 'O agendamento não possui dados válidos para confirmação.' });
    let delivery = inFlightByBooking.get(bookingId);
    if (!delivery) { delivery = deliverConfirmation(bookingId, booking).finally(() => inFlightByBooking.delete(bookingId)); inFlightByBooking.set(bookingId, delivery); }
    await delivery;
    return json(res, 200, { sent: true });
  } catch (error) {
    if (error.message === 'booking-store-not-configured') return json(res, 503, { error: 'Banco de agendamentos ainda não configurado.' });
    if (error.message === 'booking-store-unavailable') return json(res, 502, { error: 'Não foi possível confirmar o agendamento.' });
    return json(res, 502, { error: 'Não foi possível enviar a confirmação.' });
  }
}

export function resetForTests() { requestsByIp.clear(); inFlightByBooking.clear(); }
