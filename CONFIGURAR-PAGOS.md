# 💳 Configuración de Pagos — Mercado Pago y Stripe

Esta guía te lleva paso a paso para activar los pagos online en tu tienda. Hay **dos partes**:

1. **Llaves públicas** → van en `config.js` (se suben a GitHub, son seguras)
2. **Llaves secretas** → van en Vercel como variables de entorno (NUNCA en GitHub)

---

## 📋 Archivos que ya están listos

| Archivo | Función |
|---|---|
| `api/mercadopago/create-preference.js` | Endpoint que crea la preferencia de pago de MP |
| `api/stripe/create-checkout.js` | Endpoint que crea la sesión de Stripe Checkout |
| `package.json` | Declara las dependencias (SDKs de MP y Stripe) |
| `vercel.json` | Configuración de Vercel con las funciones API |
| `config.js` | Llaves públicas (Supabase, MP public key, Stripe publishable key) |
| `.env.example` | Plantilla de las variables de entorno secretas |
| `pago-resultado.html` | Página a la que vuelve el cliente después de pagar |

---

## 🟢 PARTE 1 — Mercado Pago

### Paso 1: Obtener las credenciales

1. Entra a [mercadopago.com.mx](https://www.mercadopago.com.mx)
2. Inicia sesión con tu cuenta
3. Ve a **Tus integraciones** → **Credenciales**
4. Copia:
   - **Public Key** (empieza con `APP_USR-...`) → va en `config.js`
   - **Access Token** (empieza con `APP_USR-...`) → va en Vercel

### Paso 2: Poner la Public Key en config.js

Abre el archivo `config.js` y edita esta línea:

```javascript
window.MP_PUBLIC_KEY = "APP_USR-aqui-pega-tu-public-key";
```

### Paso 3: Poner el Access Token en Vercel

1. Entra a [vercel.com](https://vercel.com) → tu proyecto
2. **Settings** → **Environment Variables**
3. Agrega:
   - **Key**: `MP_ACCESS_TOKEN`
   - **Value**: tu access token (el que empieza con `APP_USR-`)
   - **Environment**: marca **Production**, **Preview** y **Development**
4. Click en **Save**

### Paso 4: Activar todos los métodos de pago

En Mercado Pago, los métodos de pago (tarjeta, SPEI, efectivo) se activan automáticamente al crear la preferencia con Checkout Pro. No necesitas configurar nada extra.

---

## 🔵 PARTE 2 — Stripe

### Paso 1: Obtener las credenciales

1. Entra a [dashboard.stripe.com](https://dashboard.stripe.com)
2. Asegúrate de que tu cuenta esté configurada para **México** (para cobrar en MXN)
3. Ve a **Developers** → **API keys**
4. Copia:
   - **Publishable key** (empieza con `pk_live_...`) → va en `config.js`
   - **Secret key** (empieza con `sk_live_...`) → va en Vercel

### Paso 2: Poner la Publishable Key en config.js

Abre `config.js` y edita:

```javascript
window.STRIPE_PUBLIC_KEY = "pk_live_aqui-pega-tu-publishable-key";
```

### Paso 3: Poner la Secret Key en Vercel

1. Vercel → **Settings** → **Environment Variables**
2. Agrega:
   - **Key**: `STRIPE_SECRET_KEY`
   - **Value**: tu secret key (la que empieza con `sk_live_`)
   - **Environment**: marca **Production**, **Preview** y **Development**
3. Click en **Save**

### Paso 4: (Opcional) Activar Stripe en modo sandbox

Como pediste arrancar en sandbox, puedes usar las llaves de prueba (`pk_test_...` y `sk_test_...`) temporalmente. Cuando quieras cobrar de verdad, las cambias por las de producción (`pk_live_...` y `sk_live_...`).

**Tarjetas de prueba de Stripe (sandbox):**
- `4242 4242 4242 4242` → Visa exitosa
- `4000 0027 6000 3184` → Tarjeta que requiere autenticación 3D
- `4000 0000 0000 0002` → Tarjeta rechazada

---

## 🚀 PARTE 3 — Desplegar en Vercel

### Paso 1: Subir los archivos a GitHub

```bash
cd ~/ruta/a/kikis-collection-shop

# Copiar los archivos nuevos
cp ~/Descargas/config.js .
cp ~/Descargas/vercel.json .
cp ~/Descargas/package.json .
cp -r ~/Descargas/api .

# Subir
git add config.js vercel.json package.json api/
git commit -m "feat: integracion Mercado Pago y Stripe Checkout"
git push origin main
```

### Paso 2: Esperar el despliegue

Vercel detectará el `package.json` e instalará automáticamente:
- `stripe` (SDK de Stripe)
- `mercadopago-sdk-nodejs` (SDK de Mercado Pago)

Esto tarda 2-3 min. En la pestaña **Deployments** verás ✅ Ready.

### Paso 3: Verificar que las funciones API responden

Una vez desplegado, prueba estos endpoints (deben devolver un JSON de error, no 404):

```bash
# Debe responder con error de configuración (significa que la API funciona)
curl -X POST https://www.kikicollectionshop.com/api/mercadopago/create-preference \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'

curl -X POST https://www.kikicollectionshop.com/api/stripe/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'
```

Si responden `{"error":"..."}` → ✅ funcionan
Si responden `404` o `500 INTERNAL_SERVER_ERROR` → hay que revisar los logs de Vercel

---

## ✅ PARTE 4 — Probar el flujo completo

### Prueba en sandbox (recomendado antes de salir a producción)

1. **Mercado Pago sandbox**: Usa el Access Token de prueba (`TEST-...`). MP abrirá su checkout de prueba.
2. **Stripe sandbox**: Usa las llaves `sk_test_...` y `pk_test_...`. Usa tarjetas de prueba.

### Flujo de prueba

1. Entra a `https://www.kikicollectionshop.com/`
2. Agrega productos al carrito
3. Click **Finalizar compra**
4. Llena tus datos
5. Selecciona **MercadoPago** o **Stripe**
6. Click **Pagar con MercadoPago** / **Pagar con Stripe**
7. Te redirige al checkout de la pasarela
8. Completa el pago (con tarjetas de prueba en sandbox)
9. Vuelves a `pago-resultado.html` con el estado del pago

---

## 🔒 Seguridad — Resumen

| Llave | Dónde va | ¿Es pública? |
|---|---|---|
| Supabase anon key | `config.js` | ✅ Sí (RLS la protege) |
| MP Public Key (`APP_USR-...`) | `config.js` | ✅ Sí |
| MP Access Token (`APP_USR-...`) | Vercel env vars | ❌ NO — secreta |
| Stripe Publishable Key (`pk_live_...`) | `config.js` | ✅ Sí |
| Stripe Secret Key (`sk_live_...`) | Vercel env vars | ❌ NO — secreta |

**Regla de oro:** si la llave empieza con `pk_` o es "public/publishable" → va en `config.js`. Si empieza con `sk_` o es "secret/access token" → va en Vercel.

---

## 🆘 Solución de problemas

### "MercadoPago no está configurado en config.js"
→ Falta `MP_PUBLIC_KEY` en `config.js`. Verifica que esté entre comillas y sin espacios.

### "MP_ACCESS_TOKEN no configurado en variables de entorno"
→ Falta la variable en Vercel. Ve a Settings → Environment Variables y agrégala.

### "Stripe no está configurado en config.js"
→ Falta `STRIPE_PUBLIC_KEY` en `config.js`.

### Error 404 en /api/...
→ La carpeta `api/` no se subió a GitHub, o Vercel no detectó las funciones. Verifica que `vercel.json` tenga la sección `functions` y que `package.json` esté en la raíz.

### Error 500 INTERNAL_SERVER_ERROR
→ Revisa los logs en Vercel → tu proyecto → **Functions** → click en la función que falló. Suele ser un problema con las credenciales.

### El pago funciona pero no se registra el pedido
→ Revisa la consola del navegador. El registro en Supabase falla silenciosamente si hay un problema de RLS, pero el pago sí se procesa.

---

## 📞 Soporte

Si algo no funciona después de seguir esta guía, revisa:
1. Logs de Vercel (Deployments → tu deploy → Functions)
2. Consola del navegador (F12 → Console)
3. Que las llaves estén bien copiadas (sin espacios al inicio/final)
