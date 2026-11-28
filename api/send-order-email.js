// =========================================================================
// API: Reenviar el correo de resumen de un pedido (uso desde el admin)
// =========================================================================
// Endpoint: POST /api/send-order-email   body: { order_id }
//
// Permite al admin reenviar el correo de confirmación/resumen a un cliente
// (por ejemplo, si el correo original no llegó, o si se configuró Resend
// después del primer pago). Idempotente: si falta el email del cliente o
// RESEND_API_KEY, lo indica sin fallar.
//
// Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY,
// FROM_EMAIL.
// =========================================================================

const { sendOrderEmail } = require('../../lib/send-email');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

  const orderId = req.body && req.body.order_id;
  if (!orderId) return res.status(400).json({ error: 'Falta order_id' });

  try {
    const result = await sendOrderEmail(orderId);
    if (result && result.skipped) {
      const reason = result.reason === 'no_api_key'
        ? 'RESEND_API_KEY no configurado en Vercel. Configura Resend para habilitar el envío.'
        : 'El pedido no tiene correo del cliente.';
      return res.status(200).json({ ok: false, skipped: true, reason });
    }
    if (result && result.ok === false) {
      return res.status(200).json({ ok: false, error: result.error || 'No se pudo enviar el correo' });
    }
    return res.status(200).json({ ok: true, id: result && result.id });
  } catch (err) {
    console.error('[send-order-email]', err);
    return res.status(500).json({ error: 'No se pudo enviar el correo', detail: err.message || String(err) });
  }
};
