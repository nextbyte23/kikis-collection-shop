// =========================================================================
// API: Crear Stripe Checkout Session
// =========================================================================
// Endpoint: POST /api/stripe/create-checkout
//
// Recibe:
//   { order_id, items: [{name, unit_price, qty}], customer: {...}, total }
//
// Devuelve:
//   { url, session_id }   (url = URL de Stripe Checkout a redirigir)
//
// Variables de entorno requeridas en Vercel:
//   STRIPE_SECRET_KEY   → Secret key (sk_test_... o sk_live_...)
//
// La publishable key va en el frontend (config.js), la secret key aquí (secreta).
// =========================================================================

const Stripe = require('stripe');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({
      error: 'STRIPE_SECRET_KEY no configurado en variables de entorno de Vercel'
    });
  }

  try {
    const stripe = Stripe(secretKey);
    const { order_id, items, customer, total } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    // URL base para redirección post-pago
    const baseUrl = process.env.URL_BASE || 'https://www.kikicollectionshop.com';

    // Construir line_items (Stripe requiere amount en centavos)
    const lineItems = items.map(i => ({
      quantity: Number(i.qty) || 1,
      price_data: {
        currency: 'mxn',
        unit_amount: Math.round(Number(i.unit_price) * 100), // centavos
        product_data: {
          name: (i.name || 'Producto').slice(0, 200),
          metadata: { product_id: String(i.product_id || '') }
        }
      }
    }));

    // Datos del cliente para Stripe (si los hay)
    const customerData = {};
    if (customer) {
      if (customer.email) customerData.email = customer.email;
      if (customer.name) customerData.name = customer.name;
      if (customer.phone) customerData.phone = customer.phone;
    }

    // Crear Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: `${baseUrl}/pago-resultado.html?prov=stripe&status=success&order=${encodeURIComponent(order_id || '')}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pago-resultado.html?prov=stripe&status=cancel&order=${encodeURIComponent(order_id || '')}`,
      locale: 'es',
      // Enviar currency en MXN (requiere cuenta Stripe México)
      submit_type: 'pay',
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['MX'] },
      metadata: {
        order_id: order_id ? String(order_id) : null,
        platform: 'kikis_collection_store',
        customer_name: customer && customer.name ? customer.name : '',
        customer_phone: customer && customer.phone ? customer.phone : ''
      },
      customer_creation: 'always',
      ...(Object.keys(customerData).length ? { customer_data: customerData } : {})
    });

    if (!session.url) {
      throw new Error('Stripe no devolvió URL de checkout');
    }

    return res.status(200).json({
      session_id: session.id,
      url: session.url
    });
  } catch (err) {
    console.error('Error creando Stripe Checkout:', err);
    return res.status(500).json({
      error: 'No se pudo crear la sesión de pago de Stripe',
      detail: err.message || String(err)
    });
  }
};
