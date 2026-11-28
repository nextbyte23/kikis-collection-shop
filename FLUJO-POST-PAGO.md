# Flujo post-pago — Kiki's Collection Shop

Cómo funciona el ciclo completo **después de que el cliente paga**: historial de
compras en su cuenta, correo con el resumen, y guía de envío imprimible estilo
Amazon / Mercado Libre con número de rastreo compartido al cliente.

---

## 🧭 Flujo completo

```
Cliente paga (Stripe / MercadoPago)
        │
        ▼
1. El cliente vuelve a /pago-resultado.html
   → llama a /api/<prov>/verify (consulta el estado REAL con la secret key)
   → si está aprobado: marca el pedido como 'pagado' y dispara el correo
2. El cliente recibe el correo con el resumen (vía Resend)
3. El pedido aparece en su cuenta: Mi Cuenta → Mis pedidos (estado: Pagado)
4. El admin, en el panel → Pedidos:
   - ve el pedido (estado Pagado)
   - clica "🚚 Asignar guía" → elige transportista + pega el número de guía
   - el pedido pasa a 'Enviado' y el cliente ve el rastreo en su cuenta
   - clica "🖨 Imprimir guía" → abre guia-envio.html con la guía imprimible
5. El cliente entra a su cuenta → ve "📦 En camino · Guía XXX" + enlace "Rastrear paquete"
```

Opcional (más robusto): registrar los **webhooks** de Stripe y MercadoPago para
que el pedido se confirme automáticamente aunque el cliente cierre la pestaña
antes de volver a la tienda.

---

## 🗄️ Base de datos (1 sola migración)

Ejecuta en Supabase → **SQL Editor** → pega el contenido de
`schema-orders-tracking.sql` → **Run**.

Añade a la tabla `orders` las columnas: `payment_ref`, `paid_at`, `carrier`,
`tracking_number`, `shipped_at`, `notes` (+ índices). Es idempotente: puedes
correrlo las veces que quieras.

Las políticas RLS existentes ya cubren estas columnas (el admin edita todo;
cada cliente ve solo sus pedidos). Si partiste de una instalación sin RLS en
`orders`, descomenta las políticas del final del archivo SQL.

---

## 🔑 Variables de entorno en Vercel (Settings → Environment Variables)

Añade estas a las que ya tenías (`MP_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`, `URL_BASE`):

| Variable | Tipo | Para qué |
|---|---|---|
| `SUPABASE_URL` | pública | URL de tu proyecto Supabase (la misma de config.js) |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔒 **SECRETA** | Permite a los endpoints marcar el pedido como pagado sin sesión. Cópiala de Supabase → Settings → API → `service_role`. **NUNCA** la pongas en config.js ni en GitHub. |
| `RESEND_API_KEY` | 🔒 **SECRETA** | API key de Resend (empieza con `re_`). Crea cuenta en https://resend.com y verifica tu dominio. |
| `FROM_EMAIL` | pública | Remitente del correo, ej: `Kiki's Collection Shop <tienda@kikicollectionshop.com>` (dominio verificado en Resend). |
| `STRIPE_WEBHOOK_SECRET` | 🔒 opcional | Solo si registras el webhook de Stripe (`whsec_...`). |

> Sin `RESEND_API_KEY` todo sigue funcionando: el pedido se marca pagado y
> aparece en la cuenta del cliente; solo se omite el correo. El admin puede
> reenviarlo después desde el botón "✉️ Correo" una vez configurado Resend.

---

## 📧 Correo (Resend)

1. Crea cuenta en https://resend.com (gratis, sin tarjeta).
2. **Domains → Add domain** → `kikicollectionshop.com` → sigue las instrucciones
   para añadir los registros DNS (SPF, DKIM). Espera a "Verified".
3. **API Keys → Create API Key** → copia `re_...` → pégala en Vercel como
   `RESEND_API_KEY`.
4. `FROM_EMAIL` = `Kiki's Collection Shop <tienda@kikicollectionshop.com>`
   (usa el dominio que verificaste).

El correo enviado incluye: número de pedido, estado, fecha, método de pago,
tabla de artículos, subtotal/envío/total, dirección de envío y, cuando aplique,
el número de guía y transportista.

---

## 🖨️ Guía de envío (admin)

Desde **admin.html → Pedidos**, cada pedido tiene:

- **👁 Detalle** — resumen completo del pedido.
- **🚚 Asignar guía** — modal para elegir transportista y pegar el número de guía.
  Al guardar, el pedido pasa a **Enviado** y el cliente ve el rastreo en su cuenta.
- **🖨 Imprimir guía** — abre `guia-envio.html?order=ID` en otra pestaña con la
  guía lista para imprimir (A4): remitente, destinatario, código de barras del
  número de guía (CODE128), tabla de artículos, totales y datos de pago.
  Botón **"🖨 Imprimir / Guardar PDF"** (usa el diálogo del navegador; puedes
  elegir "Guardar como PDF").
- **✉️ Correo** — reenvía el correo de resumen al cliente.
- **💬 WhatsApp** — contacta al cliente con un mensaje pre-armado.

### Transportistas soportados (rastreo)

Definidos en `config.js` → `window.CARRIERS`. El cliente ve el enlace
"Rastrear paquete" armado con la URL de cada transportista. Incluye: Estafeta,
DHL, FedEx, Correos de México, Paquete Express, Quetal, Send, Redpack. Para
agregar/editar uno, modifica `CARRIERS` en `config.js` (la URL lleva `{TRACK}`
donde va el número de guía).

### Dirección del remitente

Definida en `config.js` → `window.STORE_ADDRESS`. Edita la calle/ciudad/CP con
tu dirección real antes de imprimir la primera guía.

---

## 🔌 Webhooks (opcional, recomendado)

Confirmación asíncrona del pago (por si el cliente no vuelve a la tienda):

**Stripe** → Dashboard → Developers → Webhooks → **Add endpoint**:
- URL: `https://www.kikicollectionshop.com/api/stripe/webhook`
- Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
- Copia el **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET` en Vercel.

**MercadoPago** → Tus integraciones → Notificaciones / Webhooks → **Crear**:
- URL: `https://www.kikicollectionshop.com/api/mercadopago/webhook`
- Eventos: `pago`

> Nota de seguridad: los webhooks **re consultan** siempre el pago a
> Stripe/MercadoPago con la secret key y actúan solo sobre el estado real,
> así que son seguros aunque el evento POST fuera manipulado. El pedido solo se
> marca como pagado si el proveedor lo confirma.

---

## 📁 Archivos nuevos / modificados

**Nuevos:**
- `lib/supabase-server.js` — cliente PostgREST server-side (service_role).
- `lib/send-email.js` — envío del resumen vía Resend.
- `lib/confirm-order.js` — confirma el pedido como pagado + dispara email (idempotente).
- `api/stripe/verify.js`, `api/mercadopago/verify.js` — verifica el pago real al volver el cliente.
- `api/stripe/webhook.js`, `api/mercadopago/webhook.js` — confirmación asíncrona.
- `api/send-order-email.js` — reenvío manual del correo (admin).
- `guia-envio.html` — guía de envío imprimible.
- `schema-orders-tracking.sql` — migración de BD.
- `FLUJO-POST-PAGO.md` — este documento.

**Modificados:**
- `supabase-client.js` — `setTracking`, `resendOrderEmail`, selects con tracking.
- `account.html` — historial con tracking + enlace de rastreo.
- `admin.html` — pedidos: asignar guía, imprimir, reenviar correo.
- `pago-resultado.html` — botón "Ver mi compra" y mensaje de correo/rastreo.
- `config.js` — `STORE_ADDRESS`, `CARRIERS`, `buildTrackingUrl`.
- `api/stripe/create-checkout.js`, `api/mercadopago/create-preference.js` — redirects con `prov` y `order`.
- `.env.example` — nuevas variables.
