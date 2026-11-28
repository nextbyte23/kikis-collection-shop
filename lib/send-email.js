// =========================================================================
// lib/send-email.js
// -------------------------------------------------------------------------
// Envío del resumen de pedido por correo usando Resend (https://resend.com).
// Resend es el proveedor recomendado para Vercel: API REST simple, plan
// gratuito y buena entregabilidad. Requiere verificar tu dominio
// (kikicollectionshop.com) en Resend.
//
// Variables de entorno requeridas en Vercel:
//   RESEND_API_KEY   → re_xxx... (API key de Resend, SECRETA)
//   FROM_EMAIL       → "Kiki's Collection Shop <tienda@kikicollectionshop.com>"
//                      (debe pertenecer a un dominio verificado en Resend)
//
// Si RESEND_API_KEY no está configurada, se omite el envío sin fallar
// (el pedido se marca como pagado igualmente). El admin puede reenviar el
// correo más tarde desde el panel una vez configurado Resend.
// =========================================================================

const { getOrderWithItems } = require('./supabase-server');

function fmtMoney(n) {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MXN';
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function statusLabel(s) {
  const map = { pendiente: 'Pendiente', confirmado: 'Confirmado', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
  return map[s] || s;
}

// Construye el HTML del resumen del pedido (formato email).
function buildOrderSummaryHtml(order) {
  const items = (order.order_items || []).map(it =>
    `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eee">${esc(it.name)}${it.qty > 1 ? ' ×' + it.qty : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(it.line_total)}</td>
    </tr>`
  ).join('');

  const addr = [order.customer_address_street, order.customer_address_city,
                order.customer_address_state, order.customer_address_zip]
                .filter(Boolean).join(', ');

  const trackingBlock = order.tracking_number ? `
    <div style="background:#eef6ff;border:1px solid #cfe3ff;border-radius:8px;padding:14px 16px;margin:16px 0">
      <div style="font-size:.8rem;color:#1e40af;text-transform:uppercase;letter-spacing:.5px;font-weight:700">Tu paquete va en camino</div>
      <div style="font-size:1.1rem;font-weight:700;margin-top:4px">Guía: ${esc(order.tracking_number)}</div>
      ${order.carrier ? `<div style="font-size:.85rem;color:#555">Transportista: ${esc(order.carrier)}</div>` : ''}
      <div style="font-size:.82rem;color:#555;margin-top:6px">Puedes ver el estado de tu pedido en tu cuenta: Mi Cuenta → Mis pedidos.</div>
    </div>` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf7f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1f1f">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#0f3a3a;border-radius:12px 12px 0 0;padding:18px 20px;color:#f5f0e1">
      <div style="font-size:1.2rem;font-weight:700;color:#c9a227">🎴 Kiki's Collection Shop</div>
      <div style="font-size:.85rem;opacity:.85">Confirmación de tu pedido</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e0d6;border-top:0;border-radius:0 0 12px 12px;padding:20px">
      <h1 style="font-size:1.15rem;margin:0 0 4px">¡Gracias por tu compra, ${esc((order.customer_name || 'cliente').split(' ')[0])}!</h1>
      <p style="color:#666;font-size:.9rem;margin:0 0 14px">Recibimos tu pago y tu pedido ya está confirmado.</p>

      <table style="width:100%;font-size:.9rem;border-collapse:collapse;margin:8px 0 14px">
        <tr><td style="color:#888;padding:3px 0;width:40%">Número de pedido</td><td style="font-weight:700">#${esc(order.id)}</td></tr>
        <tr><td style="color:#888;padding:3px 0">Estado</td><td><b>${statusLabel(order.status)}</b></td></tr>
        <tr><td style="color:#888;padding:3px 0">Fecha</td><td>${new Date(order.created_at).toLocaleString('es-MX')}</td></tr>
        ${order.payment_method ? `<tr><td style="color:#888;padding:3px 0">Método de pago</td><td>${esc(order.payment_method)}</td></tr>` : ''}
      </table>

      <h2 style="font-size:.95rem;margin:14px 0 6px;border-bottom:2px solid #c9a227;padding-bottom:4px">Resumen de tu compra</h2>
      <table style="width:100%;font-size:.9rem;border-collapse:collapse">
        ${items || '<tr><td colspan="2" style="color:#999;padding:10px">Sin items</td></tr>'}
        <tr><td style="padding:10px 10px 2px;font-weight:600">Subtotal</td><td style="padding:10px 10px 2px;text-align:right">${fmtMoney(order.subtotal)}</td></tr>
        <tr><td style="padding:4px 10px;font-weight:600">Envío</td><td style="padding:4px 10px;text-align:right">${fmtMoney(order.shipping)}</td></tr>
        <tr><td style="padding:8px 10px;font-size:1.05rem;font-weight:800;color:#c9a227;border-top:2px solid #eee">Total</td><td style="padding:8px 10px;font-size:1.05rem;font-weight:800;color:#c9a227;border-top:2px solid #eee;text-align:right">${fmtMoney(order.total)}</td></tr>
      </table>

      ${trackingBlock}

      ${addr ? `<div style="background:#faf7f0;border:1px solid #e5e0d6;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:.85rem">
        <div style="font-weight:700;margin-bottom:2px">Dirección de envío</div>${esc(addr)}
      </div>` : ''}

      <div style="text-align:center;margin:18px 0 6px">
        <a href="${esc(process.env.URL_BASE || 'https://www.kikicollectionshop.com')}/" style="display:inline-block;background:#c9a227;color:#2a1500;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:.95rem">Seguir comprando</a>
      </div>
      <p style="color:#999;font-size:.78rem;text-align:center;margin:14px 0 0">¿Tienes dudas? Escríbenos por WhatsApp o responde a este correo.</p>
    </div>
  </div>
</body></html>`;
}

// Envía el resumen del pedido al correo del cliente. Idempotente: no lanza
// si falta configuración, solo registra y devuelve { skipped: true }.
async function sendOrderEmail(orderId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[send-email] RESEND_API_KEY no configurada — se omite el envío del correo del pedido #' + orderId);
    return { skipped: true, reason: 'no_api_key' };
  }

  const order = await getOrderWithItems(orderId);
  if (!order) throw new Error('Pedido no encontrado para enviar email: ' + orderId);
  if (!order.customer_email) {
    console.log('[send-email] Pedido #' + orderId + ' sin customer_email — se omite el envío');
    return { skipped: true, reason: 'no_email' };
  }

  const from = process.env.FROM_EMAIL || "Kiki's Collection Shop <onboarding@resend.dev>";
  const html = buildOrderSummaryHtml(order);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: order.customer_email,
      subject: 'Confirmación de tu pedido #' + order.id + ' · Kiki\'s Collection Shop',
      html,
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('[send-email] Resend error', resp.status, data);
    return { skipped: false, ok: false, error: data.message || ('Resend ' + resp.status) };
  }
  return { skipped: false, ok: true, id: data.id };
}

module.exports = { sendOrderEmail, buildOrderSummaryHtml };
