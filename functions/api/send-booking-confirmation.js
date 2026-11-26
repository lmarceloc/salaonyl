import { handleConfirmationRequest } from '../../api/send-booking-confirmation-core.js';

export async function onRequest(context) {
  return handleConfirmationRequest(context.request, context.env);
}
