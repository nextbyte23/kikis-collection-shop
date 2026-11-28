// =========================================================================
// lib/supabase-server.js
// -------------------------------------------------------------------------
// Cliente server-side para Supabase vía PostgREST (REST API).
// Usa la SERVICE ROLE KEY (secreta, NUNCA en el navegador) para poder
// escribir pedidos desde los webhooks/verify sin depender de la sesión
// de un usuario. La service role key ignora RLS.
//
// Variables de entorno requeridas en Vercel:
//   SUPABASE_URL               → https://uxjokvkjwbdyuunqflca.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  → eyJ... (service_role key, SECRETA)
// =========================================================================

function creds() {
  const url = process.env.SUPABASE_URL || process.env.SUPABASE_CONFIG_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const err = new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en variables de entorno de Vercel');
    err.code = 'NO_SUPABASE_CREDS';
    throw err;
  }
  return { url: String(url).replace(/\/$/, ''), serviceKey };
}

async function sbFetch(path, opts = {}) {
  const { url, serviceKey } = creds();
  const headers = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  const resp = await fetch(url + path, { ...opts, headers });
  return resp;
}

// Devuelve un pedido con sus items embebidos (order_items(*)).
async function getOrderWithItems(orderId) {
  const resp = await sbFetch(
    '/rest/v1/orders?id=eq.' + encodeURIComponent(orderId) + '&select=*,order_items(*)',
    { method: 'GET' }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('Supabase getOrderWithItems ' + resp.status + ': ' + txt);
  }
  const rows = await resp.json();
  return rows && rows.length ? rows[0] : null;
}

// Actualiza un pedido por id. Devuelve la fila actualizada.
async function updateOrder(orderId, patch) {
  const resp = await sbFetch(
    '/rest/v1/orders?id=eq.' + encodeURIComponent(orderId),
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('Supabase updateOrder ' + resp.status + ': ' + txt);
  }
  const rows = await resp.json();
  return rows && rows.length ? rows[0] : null;
}

// Busca un pedido por su referencia de pago (Stripe session id / MP payment id).
async function findOrderByPaymentRef(paymentRef) {
  if (!paymentRef) return null;
  const resp = await sbFetch(
    '/rest/v1/orders?payment_ref=eq.' + encodeURIComponent(String(paymentRef)) + '&select=*,order_items(*)',
    { method: 'GET' }
  );
  if (!resp.ok) return null;
  const rows = await resp.json();
  return rows && rows.length ? rows[0] : null;
}

module.exports = { creds, sbFetch, getOrderWithItems, updateOrder, findOrderByPaymentRef };
