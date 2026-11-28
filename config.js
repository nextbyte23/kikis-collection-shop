// =========================================================================
// Configuración de Supabase + Pasarelas de pago para Kiki's Collection Shop
// =========================================================================
// IMPORTANTE: las "anon key" y "publishable key" están diseñadas para ser
// públicas. Son seguras de poner en el navegador porque las políticas RLS
// controlan qué se puede hacer con ellas y porque solo sirven para iniciar
// flujos de pago (no para cobrar directamente).
//
// Para configurar:
//   1. Crea tu proyecto en https://supabase.com → copia Project URL y
//      "anon public key" en SUPABASE_CONFIG.
//   2. Crea tu cuenta en https://www.mercadopago.com.mx → Tus integraciones
//      → Credenciales → copia "Public Key" y "Access Token".
//      - MP_PUBLIC_KEY  va AQUÍ (pública).
//      - MP_ACCESS_TOKEN va en Vercel (secreta, NUNCA en el navegador).
//   3. Crea tu cuenta en https://stripe.com → Developers → API keys
//      - STRIPE_PUBLIC_KEY (publishable key) va AQUÍ (pública).
//      - STRIPE_SECRET_KEY (secret key) va en Vercel (secreta).
//      - STRIPE_WEBHOOK_SECRET va en Vercel (signing secret del webhook).
//
// Mientras las URLs/keys estén vacías, la app usa localStorage y solo
// ofrece WhatsApp como método de pago (modo offline / desarrollo).
// =========================================================================

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⚠️ EDITA ESTO CON TUS CREDENCIALES REALES DE SUPABASE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cómo obtener tus credenciales:
//   1. Ve a https://supabase.com/dashboard
//   2. Abre tu proyecto "Kiki's Collection Shop"
//   3. Menú izquierdo → Settings (⚙️) → API
//   4. Copia "Project URL" y "anon public key" en las variables de abajo
//
// Tu URL se ve así:        https://abcdefghijklm.supabase.co
// Tu anon key se ve así:   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

window.SUPABASE_CONFIG = {
  url: "https://uxjokvkjwbdyuunqflca.supabase.co",           // ← Ej: "https://abcdefghijklm.supabase.co"
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4am9rdmtqd2JkeXV1bnFmbGNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyMjYzODEsImV4cCI6MjExMDgwMjM4MX0.rTWqdi8DGluV6NX7B6sfsXSN45o04d2pPVrdus1qwqc"  // ← Ej: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};

// WhatsApp de la tienda (compartido entre la tienda y el admin).
// Formato internacional sin "+", solo dígitos (ej: 529626141770).
window.WHATSAPP_NUMBER = "529626141770";

// ---- MercadoPago (claves públicas, seguras para el navegador) ----
window.MP_PUBLIC_KEY = "APP_USR-85b77000-06ef-4024-bfd5-89382fdcdfd7";   // ← Ej: "APP_USR-1234abcd-...-123456"

// ---- Stripe (publishable key, segura para el navegador) ----
window.STRIPE_PUBLIC_KEY = "pk_live_51SrnnCH9W4wWnmh2S9SksYbQHCQoU3jujKmlum0eKb30vcKgpik1Z3waoKXxDFnFyQxyDpIN3WnrQy6QCdnTmzRw00sTJPGfSH";   // ← Ej: "pk_live_..." o "pk_test_..."

// Función helper: ¿hay backend configurado?
window.supabaseEnabled = function() {
  return !!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey);
};

// Helper: ¿MercadoPago listo para usarse?
window.mercadoPagoEnabled = function() {
  return !!window.MP_PUBLIC_KEY;
};

// Helper: ¿Stripe listo para usarse?
window.stripeEnabled = function() {
  return !!window.STRIPE_PUBLIC_KEY;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Datos del REMITENTE para la guía de envío imprimible (guia-envio.html).
// Es información pública de la tienda, segura en el navegador.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.STORE_ADDRESS = {
  name: "Kiki's Collection Shop",
  contact: "Tapachula, Chiapas, México",
  street: "Av. Central #123, Colonia Centro",   // ← Pon tu dirección real
  city: "Tapachula",
  state: "Chiapas",
  zip: "30700",
  phone: window.WHATSAPP_NUMBER || "529626141770"
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transportistas soportados para el rastreo del paquete.
// El cliente ve el enlace "Rastrear paquete" armado con trackingUrl
// (sustituye {TRACK} por el número de guía). Agrega/edita los que uses.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
window.CARRIERS = {
  estafeta:        { name: "Estafeta",          trackingUrl: "https://www.estafeta.com/Herramientas/Rastreo?idioma=es&tipoGuia=1&numGuia={TRACK}" },
  dhl:             { name: "DHL",               trackingUrl: "https://www.dhl.com/mx-es/home/tracking.html?track&submit=1&tracking-id={TRACK}" },
  fedex:           { name: "FedEx",             trackingUrl: "https://www.fedex.com/fedextrack/?trknbr={TRACK}" },
  correos:         { name: "Correos de México", trackingUrl: "https://www.correosdemexico.gob.mx/Seguimiento/" },
  paqueteexpress:  { name: "Paquete Express",   trackingUrl: "https://www.paqueteexpress.com/rastreo?guia={TRACK}" },
  quetal:          { name: "Quetal",            trackingUrl: "https://www.quetal.com.mx/rastreo?guia={TRACK}" },
  send:            { name: "Send",              trackingUrl: "https://app.send.com.mx/tracking?guia={TRACK}" },
  redpack:         { name: "Redpack",           trackingUrl: "https://www.redpack.com.mx/rastreo?guia={TRACK}" },
  otro:            { name: "Otro",              trackingUrl: "" }
};

// Helper: arma la URL de rastreo para un transportista + número de guía.
window.buildTrackingUrl = function(carrier, trackingNumber) {
  if (!carrier || !trackingNumber) return null;
  const c = window.CARRIERS[carrier];
  if (!c || !c.trackingUrl) return null;
  return c.trackingUrl.replace('{TRACK}', encodeURIComponent(trackingNumber));
};
