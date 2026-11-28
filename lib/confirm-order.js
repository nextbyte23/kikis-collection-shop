// =========================================================================
// lib/confirm-order.js
// -------------------------------------------------------------------------
// Confirma un pedido como pagado de forma idempotente:
//   1) Recupera el pedido de Supabase (con sus items).
//   2) Si NO estaba ya en un estado >= pagado, lo marca 'pagado',
//      guarda la referencia de pago y la fecha, y completa datos del
//      cliente que falten a partir del pagador que devuelve el proveedor.
//   3) Envía el correo de resumen al cliente (solo en la primera
//      confirmación, para no spammer si se re-llama).
//
// Lo usan tanto /api/<prov>/verify (al volver el cliente a pago-resultado)
// como /api/<prov>/webhook (notificación asíncrona del proveedor).
// =========================================================================

const { getOrderWithItems, updateOrder } = require('./supabase-server');
const { sendOrderEmail } = require('./send-email');

const PAID_OR_LATER = ['pagado', 'enviado', 'entregado'];

function cleanPayer(payer) {
  if (!payer) return null;
  const p = {};
  if (payer.email) p.customer_email = String(payer.email).trim();
  if (payer.name) p.customer_name = String(payer.name).trim();
  if (payer.phone) p.customer_phone = String(payer.phone).replace(/\D/g, '');
  if (payer.address_street) p.customer_address_street = String(payer.address_street).trim();
  if (payer.address_city) p.customer_address_city = String(payer.address_city).trim();
  if (payer.address_state) p.customer_address_state = String(payer.address_state).trim();
  if (payer.address_zip) p.customer_address_zip = String(payer.address_zip).trim();
  return p;
}

async function confirmOrderPaid({ orderId, paymentRef, provider, payer, paidAt }) {
  if (!orderId) throw new Error('confirmOrderPaid: falta orderId');

  const order = await getOrderWithItems(orderId);
  if (!order) {
    // El pedido podría no existir si el cliente pagó como invitado sin que
    // la tienda alcanzara a crearlo. Lo registramos en logs para revisión.
    throw new Error('confirmOrderPaid: pedido no encontrado #' + orderId);
  }

  const alreadyPaid = PAID_OR_LATER.includes(order.status);

  if (!alreadyPaid) {
    const patch = {
      status: 'pagado',
      paid_at: paidAt || new Date().toISOString(),
    };
    if (paymentRef) patch.payment_ref = String(paymentRef);

    // Completar datos del cliente que falten con la info del proveedor.
    const p = cleanPayer(payer);
    if (p) {
      if (!order.customer_email && p.customer_email) patch.customer_email = p.customer_email;
      if (!order.customer_name && p.customer_name) patch.customer_name = p.customer_name;
      if (!order.customer_phone && p.customer_phone) patch.customer_phone = p.customer_phone;
      if (!order.customer_address_street && p.customer_address_street) patch.customer_address_street = p.customer_address_street;
      if (!order.customer_address_city && p.customer_address_city) patch.customer_address_city = p.customer_address_city;
      if (!order.customer_address_state && p.customer_address_state) patch.customer_address_state = p.customer_address_state;
      if (!order.customer_address_zip && p.customer_address_zip) patch.customer_address_zip = p.customer_address_zip;
    }

    await updateOrder(orderId, patch);

    // Enviar el correo de resumen solo en la primera confirmación.
    try {
      await sendOrderEmail(orderId);
    } catch (e) {
      // El correo es best-effort: el pedido ya quedó pagado en BD.
      console.error('[confirm-order] email falló para pedido #' + orderId + ':', e.message);
    }
  }

  return { ok: true, orderId: Number(orderId), alreadyConfirmed: alreadyPaid, status: 'pagado' };
}

module.exports = { confirmOrderPaid, PAID_OR_LATER };
