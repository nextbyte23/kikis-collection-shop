// =========================================================================
// API: Verificar estado de un pago de Stripe (llamada por pago-resultado.html)
// =========================================================================
// Endpoint: GET /api/stripe/verify?session_id=cs_...
//
// Consulta el estado REAL de la sesión de Stripe con la secret key (server-side)
// para evitar spoofing del redirect. Si el pago está confirmado, marca el
// pedido como 'pagado' en Supabase y dispara el correo de resumen al cliente
// (vía lib/confirm-order, idempotente).
//
// Variables de entorno: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// (opcional) RESEND_API_KEY + FROM_EMAIL para el correo.
// =========================================================================

const Stripe = require('stripe');
const { confirmOrderPaid } = require('../../lib/confirm-order');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const sessionId = req.query && req.query.session_id;
  if (!sessionId) {
    return res.status(400).json({ error: 'Falta el parámetro session_id' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurado en Vercel' });
  }

  try {
    const stripe = Stripe(secretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details', 'line_items'],
    });

    const paymentStatus = session.payment_status; // 'paid' | 'unpaid' | 'no_payment_required'
    const status =
      paymentStatus === 'paid' || paymentStatus === 'no_payment_required' ? 'approved' :
      paymentStatus === 'unpaid' ? 'pending' : 'rejected';

    const orderId = session.metadata && session.metadata.order_id;

    // Si está pagado y tenemos el order_id, confirmar el pedido + email.
    let confirmResult = null;
    if (status === 'approved' && orderId) {
      try {
        const cd = session.customer_details || {};
        const addr = (cd.address || {});
        confirmResult = await confirmOrderPaid({
          orderId,
          paymentRef: session.id,
          provider: 'stripe',
          paidAt: new Date().toISOString(),
          payer: {
            email: cd.email,
            name: cd.name,
            phone: cd.phone,
            address_street: [addr.line1, addr.line2].filter(Boolean).join(', ') || undefined,
            address_city: addr.city,
            address_state: addr.state,
            address_zip: addr.postal_code,
          },
        });
      } catch (e) {
        console.error('[stripe/verify] confirmOrderPaid falló:', e.message);
      }
    }

    return res.status(200).json({
      provider: 'stripe',
      status,
      order_id: orderId ? Number(orderId) : null,
      payment_id: session.id,
      payment_method: session.payment_method_types && session.payment_method_types[0],
      transaction_amount: session.amount_total != null ? session.amount_total / 100 : null,
      currency: session.currency,
      payer_email: session.customer_details && session.customer_details.email,
      date_approved: status === 'approved' ? new Date().toISOString() : null,
      confirmed: confirmResult ? confirmResult.ok : false,
      already_confirmed: confirmResult ? confirmResult.alreadyConfirmed : false,
    });
  } catch (err) {
    console.error('[stripe/verify]', err);
    return res.status(500).json({
      error: 'No se pudo verificar el pago con Stripe',
      detail: err.message || String(err),
    });
  }
};
