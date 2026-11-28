// =========================================================================
// API: Webhook de Mercado Pago (notificación asíncrona de pago)
// =========================================================================
// Endpoint: POST /api/mercadopago/webhook
// Registra esta URL en Mercado Pago → Tus integraciones → Notificaciones/Webhooks.
//   URL: https://www.kikicollectionshop.com/api/mercadopago/webhook
//   Eventos: pago
//
// Mercado Pago envía { resource, topic, ... } o { type: 'payment', data: { id } }.
// Este endpoint re consulta SIEMPRE el pago con el MP_ACCESS_TOKEN y actúa
// solo sobre el estado real (idempotente).
//
// Variables de entorno: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// (opcional) RESEND_API_KEY, FROM_EMAIL.
// =========================================================================

const { confirmOrderPaid } = require('../../lib/confirm-order');

function mpStatusToOurs(s) {
  if (!s) return 'unknown';
  if (s === 'approved') return 'approved';
  if (s === 'pending' || s === 'in_process' || s === 'authorized') return 'pending';
  return 'rejected';
}

module.exports = async (req, res) => {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado' });

  const body = req.body || {};
  // MP puede enviar el id en data.id (nuevo formato) o como payment_id en query,
  // o como resource (viejo formato https://api.mercadopago.com/v1/payments/123).
  let paymentId = null;
  if (body.data && body.data.id) paymentId = String(body.data.id);
  else if (body.id) paymentId = String(body.id);
  else if (req.query && req.query.payment_id) paymentId = String(req.query.payment_id);
  else if (body.resource) {
    const m = String(body.resource).match(/payments\/(\d+)/);
    if (m) paymentId = m[1];
  }

  // MP a veces solo notifica topic sin data (hay que responder 200 igual).
  if (!paymentId) {
    return res.status(200).json({ received: true, ignored: 'no_payment_id' });
  }

  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(paymentId), {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    const p = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[mp/webhook] MP API', r.status, p);
      return res.status(200).json({ received: true, error: 'MP API ' + r.status });
    }

    const status = mpStatusToOurs(p.status);
    const orderId = p.metadata && (p.metadata.order_id) || null;

    if (status === 'approved' && orderId) {
      const ph = p.payer && p.payer.phone && p.payer.phone.number
        ? ((p.payer.phone.area_code || '') + p.payer.phone.number) : undefined;
      try {
        await confirmOrderPaid({
          orderId, paymentRef: String(p.id), provider: 'mercadopago',
          paidAt: p.date_approved || new Date().toISOString(),
          payer: {
            email: p.payer && p.payer.email,
            name: [p.payer && p.payer.first_name, p.payer && p.payer.last_name].filter(Boolean).join(' ') || undefined,
            phone: ph,
          },
        });
      } catch (e) {
        console.error('[mp/webhook] confirmOrderPaid:', e.message);
      }
    }

    return res.status(200).json({ received: true, status, order_id: orderId });
  } catch (err) {
    console.error('[mp/webhook]', err);
    return res.status(200).json({ received: true, error: err.message || String(err) });
  }
};
