import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleConfirmationRequest, resetForTests } from './send-booking-confirmation-core.js';

const bookingId = '11111111-1111-4111-8111-111111111111';
const booking = {
  id: bookingId,
  client_name: 'Cliente Teste',
  client_phone: '42988820334',
  client_email: 'cliente@example.com',
  booked_at: '2026-12-01T14:00:00.000Z',
  status: 'pending',
  services: { name: 'Corte' },
};

beforeEach(() => { resetForTests(); });
const env = { RESEND_API_KEY: 'test-key', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const request = (body, ip = '203.0.113.10') => new Request('https://example.test/api/send-booking-confirmation', {
  method: 'POST',
  headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('rejeita chamada sem identificador', async () => {
  const res = await handleConfirmationRequest(request({}), env, async () => { throw new Error('não deveria chamar'); });
  assert.equal(res.status, 400);
});

test('usa somente os dados do banco e inclui o telefone no aviso ao salão', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/rest/v1/bookings')) return { ok: true, async json() { return [booking]; } };
    return { ok: true };
  };
  const res = await handleConfirmationRequest(request({ booking_id: bookingId, email: 'attacker@example.com', name: 'Forjado' }), env, fetchImpl);
  assert.equal(res.status, 200);
  const mails = calls.slice(1).map(({ options }) => JSON.parse(options.body));
  assert.equal(mails.length, 2);
  const salonMail = mails.find((mail) => mail.to[0] === 'niltonalmeida3006@gmail.com');
  assert.ok(salonMail);
  assert.match(salonMail.text, /Telefone: 42988820334/);
  assert.match(salonMail.html, /Telefone: 42988820334/);
  assert.ok(mails.some((mail) => mail.to[0] === booking.client_email));
  assert.equal(mails[0].from, 'Nyl Hair Design <agendamento@nylhairdesign.com.br>');
});

test('deduplica chamadas concorrentes por reserva', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes('/rest/v1/bookings')) return { ok: true, async json() { return [booking]; } };
    return { ok: true };
  };
  const results = await Promise.all([
    handleConfirmationRequest(request({ booking_id: bookingId }, '203.0.113.11'), env, fetchImpl),
    handleConfirmationRequest(request({ booking_id: bookingId }, '203.0.113.12'), env, fetchImpl),
  ]);
  assert.equal(results[0].status, 200);
  assert.equal(results[1].status, 200);
  assert.equal(calls.filter(({ url }) => String(url).includes('api.resend.com')).length, 2);
});
