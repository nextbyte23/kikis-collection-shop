// =========================================================================
// API: Webhook de Stripe (notificación asíncrona de pago)
// =========================================================================
// Endpoint: POST /api/stripe/webhook
// Registra esta URL en Stripe Dashboard → Developers → Webhooks.
//   URL: https://www.kikicollectionshop.com/api/stripe/webhook
//   Eventos a suscribir: checkout.session.completed, checkout.session.async_payment_succeeded
//
// SEGURIDAD: en lugar de verificar la firma con el raw body (problemático en
// Vercel Functions sin config especial), este webhook re consulta SIEMPRE la
// sesión a Stripe con la STRIPE_SECRET_KEY y actúa solo sobre el estado real.
// Así, aunque el evento POST fuera fabricado, nunca se marca un pedido como
// pagado si Stripe no lo confirma. Para verificación estricta de firma, define
// STRIPE_WEBHOOK_SECRET y configura el raw body en Vercel (ver docs).
//
// Variables de entorno: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// (opcional) STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, FROM_EMAIL.
// =========================================================================

const Stripe = require('stripe');
const { confirmOrderPaid } = require('../../lib/confirm-order');

module.exports = async (req, res) => {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurado' });

  let event = req.body;
  // Si Vercel entrega el body como string/buffer (raw), parsearlo.
  if (typeof event === 'string' || Buffer.isBuffer(event)) {
    try { event = JSON.parse(event); } catch (e) { return res.status(400).send('Invalid JSON'); }
  }
  if (!event || !event.type) return res.status(400).json({ error: 'Evento inválido' });

  const stripe = Stripe(secretKey);

  // Solo nos interesan los eventos de sesión de checkout completada.
  const relevant = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  if (!relevant.includes(event.type)) {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  try {
    const sess = event.data && event.data.object;
    const sessionId = sess && sess.id;
    if (!sessionId) return res.status(200).json({ received: true, ignored: 'no_session_id' });

    // RE-CONSULTAR el estado real a Stripe (siempre).
    const fresh = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer_details'] });
    const orderId = fresh.metadata && fresh.metadata.order_id;

    if (fresh.payment_status === 'paid' && orderId) {
      const cd = fresh.customer_details || {};
      const addr = cd.address || {};
      try {
        await confirmOrderPaid({
          orderId, paymentRef: fresh.id, provider: 'stripe',
          paidAt: new Date().toISOString(),
          payer: {
            email: cd.email, name: cd.name, phone: cd.phone,
            address_street: [addr.line1, addr.line2].filter(Boolean).join(', ') || undefined,
            address_city: addr.city, address_state: addr.state, address_zip: addr.postal_code,
          },
        });
      } catch (e) {
        console.error('[stripe/webhook] confirmOrderPaid:', e.message);
      }
    }

    return res.status(200).json({ received: true, status: fresh.payment_status, order_id: orderId });
  } catch (err) {
    console.error('[stripe/webhook]', err);
    // Devolver 200 para que Stripe no re intente infinitamente ante errores internos.
    return res.status(200).json({ received: true, error: err.message || String(err) });
  }
};
