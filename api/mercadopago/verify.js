// =========================================================================
// API: Verificar estado de un pago de Mercado Pago (llamada por pago-resultado.html)
// =========================================================================
// Endpoint: GET /api/mercadopago/verify?payment_id=12345
//           GET /api/mercadopago/verify?preference_id=...  (sin pago aún)
//
// Consulta el estado REAL del pago/preferencia con el access token (server-side).
// Si el pago está aprobado, marca el pedido como 'pagado' en Supabase y dispara
// el correo de resumen (vía lib/confirm-order, idempotente).
//
// Variables de entorno: MP_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// (opcional) RESEND_API_KEY + FROM_EMAIL.
// =========================================================================

const { confirmOrderPaid } = require('../../lib/confirm-order');

function mpStatusToOurs(s) {
  if (!s) return 'unknown';
  if (s === 'approved') return 'approved';
  if (s === 'pending' || s === 'in_process' || s === 'authorized') return 'pending';
  if (s === 'rejected' || s === 'cancelled' || s === 'refunded' || s === 'charged_back') return 'rejected';
  return 'unknown';
}

async function mpGet(path) {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  const resp = await fetch('https://api.mercadopago.com' + path, {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  return { ok: resp.ok, status: resp.status, data: await resp.json().catch(() => ({})) };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado en Vercel' });
  }

  const paymentId = req.query && req.query.payment_id;
  const preferenceId = req.query && req.query.preference_id;

  try {
    let orderId = null, status = 'unknown', paymentRef = null, payer = null, extra = {};

    if (paymentId) {
      const r = await mpGet('/v1/payments/' + encodeURIComponent(paymentId));
      if (!r.ok) {
        return res.status(200).json({
          provider: 'mercadopago', status: 'unknown', order_id: null,
          error: 'No se pudo consultar el pago en Mercado Pago', detail: r.data && r.data.message,
        });
      }
      const p = r.data;
      status = mpStatusToOurs(p.status);
      paymentRef = String(p.id);
      orderId = p.metadata && (p.metadata.order_id || (p.metadata.order && p.metadata.order.id)) || null;
      const ph = p.payer && (p.payer.phone && p.payer.phone.number)
        ? ((p.payer.phone.area_code || '') + p.payer.phone.number)
        : (p.payer && p.payer.phone && p.payer.phone.number);
      payer = {
        email: p.payer && p.payer.email,
        name: [p.payer && p.payer.first_name, p.payer && p.payer.last_name].filter(Boolean).join(' ') || undefined,
        phone: ph,
      };
      extra = {
        payment_method: p.payment_method_id,
        transaction_amount: p.transaction_amount,
        currency: p.currency_id,
        payer_email: p.payer && p.payer.email,
        date_approved: p.date_approved,
        status_detail: p.status_detail,
      };
    } else if (preferenceId) {
      const r = await mpGet('/checkout/preferences/' + encodeURIComponent(preferenceId));
      if (!r.ok) {
        return res.status(200).json({ provider: 'mercadopago', status: 'unknown', order_id: null,
          error: 'No se pudo consultar la preferencia', detail: r.data && r.data.message });
      }
      const pref = r.data;
      orderId = pref.metadata && (pref.metadata.order_id) || null;
      status = 'pending'; // la preferencia existe pero aún no hay pago confirmado
      payer = {
        email: pref.payer && pref.payer.email,
        name: pref.payer && [pref.payer.name, pref.payer.surname].filter(Boolean).join(' ') || undefined,
        phone: pref.payer && pref.payer.phone && pref.payer.phone.number,
      };
      extra = { transaction_amount: pref.items && pref.items.reduce((s, i) => s + (i.unit_price * i.quantity), 0) };
    } else {
      return res.status(400).json({ error: 'Falta payment_id o preference_id' });
    }

    // Confirmar pedido si está aprobado y tenemos order_id.
    let confirmResult = null;
    if (status === 'approved' && orderId) {
      try {
        confirmResult = await confirmOrderPaid({
          orderId, paymentRef, provider: 'mercadopago',
          paidAt: extra.date_approved || new Date().toISOString(), payer,
        });
      } catch (e) {
        console.error('[mp/verify] confirmOrderPaid falló:', e.message);
      }
    }

    return res.status(200).json({
      provider: 'mercadopago',
      status,
      order_id: orderId ? Number(orderId) : null,
      payment_id: paymentRef,
      ...extra,
      confirmed: confirmResult ? confirmResult.ok : false,
      already_confirmed: confirmResult ? confirmResult.alreadyConfirmed : false,
    });
  } catch (err) {
    console.error('[mp/verify]', err);
    return res.status(500).json({ error: 'No se pudo verificar el pago con Mercado Pago', detail: err.message || String(err) });
  }
};
