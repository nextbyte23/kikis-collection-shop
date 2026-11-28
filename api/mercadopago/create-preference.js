// =========================================================================
// API: Crear preferencia de pago en Mercado Pago (Checkout Pro)
// =========================================================================
// Endpoint: POST /api/mercadopago/create-preference
//
// Recibe:
//   { order_id, items: [{name, unit_price, qty}], customer: {...}, total }
//
// Devuelve:
//   { init_point, preference_id }   (init_point = URL de checkout a redirigir)
//
// Variables de entorno requeridas en Vercel:
//   MP_ACCESS_TOKEN  → Access token (APP_USR-... para producción, TEST-... para sandbox)
//
// Implementación: API REST directa con fetch (Node 18+).
// Sin dependencias externas — evita problemas de versión de SDK.
// =========================================================================

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({
      error: 'MP_ACCESS_TOKEN no configurado en variables de entorno de Vercel'
    });
  }

  try {
    const { order_id, items, customer, total } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    // Detectar si es sandbox o producción por el prefijo del token
    const isSandbox = accessToken.startsWith('TEST-');

    // URL base para redirección post-pago (la tienda)
    const baseUrl = process.env.URL_BASE || 'https://www.kikicollectionshop.com';
    const backUrls = {
      success: `${baseUrl}/pago-resultado.html?status=success&method=mercadopago`,
      pending: `${baseUrl}/pago-resultado.html?status=pending&method=mercadopago`,
      failure: `${baseUrl}/pago-resultado.html?status=failure&method=mercadopago`
    };

    // Construir items de la preferencia
    const preferenceItems = items.map(i => ({
      id: String(i.product_id || ''),
      title: (i.name || 'Producto').slice(0, 230),
      quantity: Number(i.qty) || 1,
      unit_price: Number(i.unit_price) || 0,
      currency_id: 'MXN'
    }));

    // Datos del pagador (si los hay)
    const payer = {};
    if (customer) {
      if (customer.name) {
        const parts = String(customer.name).trim().split(/\s+/);
        payer.name = parts[0] || undefined;
        if (parts.length > 1) payer.surname = parts.slice(1).join(' ');
      }
      if (customer.email) payer.email = customer.email;
      if (customer.phone) {
        const phoneDigits = String(customer.phone).replace(/\D/g, '');
        if (phoneDigits.length >= 10) {
          payer.phone = { area_code: '52', number: phoneDigits };
        }
      }
    }

    const preference = {
      items: preferenceItems,
      back_urls: backUrls,
      auto_return: 'approved',
      statement_descriptor: 'KIKIS COLLECTION',
      metadata: {
        order_id: order_id ? String(order_id) : null,
        platform: 'kikis_collection_store'
      }
    };
    // Solo añadir payer si tiene datos
    if (Object.keys(payer).length) preference.payer = payer;

    // Llamar a la API REST de Mercado Pago directamente con fetch
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': 'kiki-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
      },
      body: JSON.stringify(preference)
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Mercado Pago API error:', mpResponse.status, data);
      throw new Error(data.message || data.error || 'Mercado Pago devolvió ' + mpResponse.status);
    }

    // init_point = URL de producción (Checkout Pro real)
    // sandbox_init_point = URL de pruebas (cuando el token es TEST-)
    const initPoint = isSandbox ? (data.sandbox_init_point || data.init_point) : data.init_point;

    if (!initPoint) {
      throw new Error('Mercado Pago no devolvió init_point');
    }

    return res.status(200).json({
      preference_id: data.id,
      init_point: initPoint,
      sandbox_init_point: data.sandbox_init_point || null
    });
  } catch (err) {
    console.error('Error creando preferencia MP:', err);
    return res.status(500).json({
      error: 'No se pudo crear la preferencia de pago',
      detail: err.message || String(err)
    });
  }
};
