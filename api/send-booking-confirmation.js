import { handleConfirmationRequest } from './send-booking-confirmation-core.js';

export default async function handler(req, res) {
  const request = new Request('https://localhost/api/send-booking-confirmation', {
    method: req.method,
    headers: req.headers,
    body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
  });
  const response = await handleConfirmationRequest(request, process.env);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}
