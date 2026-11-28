# ⚡ Cómo arreglar el 404 en www.kikicollectionshop.com

El error **"404 NO ENCONTRADO — Esta página no existe"** con un ID tipo `cle1::wz9l5-…`
es el **404 a nivel plataforma de Vercel**. Significa que el dominio sí llega a los
servidores de Vercel (el DNS está bien), pero **Vercel no encuentra ningún despliegue
de producción asignado a ese dominio**.

El código de la tienda **está correcto y completo**. El problema está en la
configuración del proyecto dentro de Vercel. Sigue estos pasos en orden.

---

## Paso 1 — Verifica que el proyecto tenga un despliegue de producción "Ready"

1. Entra a https://vercel.com → abre tu proyecto **Kiki's Collection Shop**.
2. Pestaña **Deployments**.
3. Busca un despliegue marcado como **Production** con estado **Ready** (✅ verde).
   - Si NO hay ninguno, o hay alguno en estado **Error** / **Building** roto,
     ese es el problema: **no hay nada que servir**.
   - Si el único despliegue es **Preview** (no Production), tampoco sirve al dominio.

> Si falta o falla: ve al Paso 3 para corregir la configuración y luego al Paso 5
> para forzar un despliegue de producción.

## Paso 2 — Verifica que el dominio esté añadido a ESTE proyecto

1. En el proyecto → **Settings** → **Domains**.
2. Debes ver **`www.kikicollectionshop.com`** (y mejor también el dominio raíz
   **`kikicollectionshop.com`**).
3. Junto a cada dominio debe decir **"Valid Configuration"** (✅).
   - Si dice **"Configuration Error"** o no aparece el dominio, ese es el problema:
     el dominio existe en tu cuenta de Vercel pero **no está conectado a este
     proyecto** (o lo conectaste a otro proyecto que ya borraste).
4. Si no está, click **Add** → escribe `www.kikicollectionshop.com` → **Add**.
   Vercel te dirá qué registro DNS apuntar (normalmente un **CNAME** a
   `cname.vercel-dns.com`, o un **A record** `76.76.21.21` para el dominio raíz).

## Paso 3 — Corrige el Framework Preset (causa #1 de build roto)

Este **NO es un proyecto Next.js**. Es un **sitio estático** (HTML + JS) con
`vercel.json`. Si Vercel lo detectó como Next.js, intenta ejecutar `next build`,
falla, y no genera despliegue → 404.

1. Proyecto → **Settings** → **General**.
2. **Framework Preset** → selecciona **Other** (NO Next.js, NO Nuxt, NO nada).
3. **Build Command** → déjalo **vacío** (o escribe `None`). El `vercel.json` ya
   tiene `"buildCommand": null`.
4. **Output Directory** → déjalo **vacío** o `.` (punto). Los archivos están en
   la **raíz** del proyecto, NO en una carpeta `download`.
5. **Install Command** → vacío.
6. **Save**.

> El `vercel.json` incluido aquí ya tiene `"framework": null`, así que al
> redesplegar se fuerza el preset "Other" automáticamente.

## Paso 4 — Asegúrate de que las variables de entorno secretas estén puestas

Solo si vas a usar pago con tarjeta. Si por ahora solo usas WhatsApp, salta al Paso 5.

En **Settings** → **Environment Variables** deben existir ( Production):

| Nombre | Valor | Para qué sirve |
|---|---|---|
| `MP_ACCESS_TOKEN` | `APP_USR-…` (tu access token de MercadoPago producción) | Checkout Pro |
| `STRIPE_SECRET_KEY` | `sk_live_…` (tu secret key de Stripe) | Stripe Checkout |
| `URL_BASE` | `https://www.kikicollectionshop.com` | Redirección tras pago |

> Las **public keys** (Supabase anon key, MP public key, Stripe publishable key)
> ya van dentro de `config.js` (son seguras de exponer). Las **secret keys**
> NUNCA van en el código, solo aquí en Vercel.

## Paso 5 — Fuerza un despliegue de producción limpio

**Opción más simple (sin tocar Git):**
1. **Deployments** → click en los **⋮** del último despliegue → **Redeploy**.
2. Marca **"Use existing Build Cache"** = NO (para que reconstruya limpio).
3. **Redeploy**.
4. Espera a que termine en **Ready** ✅.

**Opción definitiva (vía Git):**
1. Sube **todos los archivos de esta carpeta** a la raíz de tu repositorio de
   GitHub conectado a Vercel (sustituye los anteriores).
2. Haz un commit + push. Vercel redesplegará solo.
3. Verifica en **Deployments** que el nuevo commit quede **Ready** ✅ en Production.

**Opción sin GitHub (Vercel CLI):**
```bash
npm i -g vercel
cd kikis-collection-shop        # la carpeta de este proyecto
vercel link                     # conecta con tu proyecto existente
vercel --prod                   # despliega a PRODUCCIÓN
```

## Paso 6 — Verifica el dominio

1. Espera 1–2 minutos tras el despliegue Ready.
2. Abre https://www.kikicollectionshop.com/ → debe cargar la tienda.
3. Prueba https://www.kikicollectionshop.com/admin → panel admin.
4. Si el dominio sigue en "Configuration Error" en Settings → Domains, el DNS
   aún no apunta bien. Confirma con tu registrador el **CNAME** a
   `cname.vercel-dns.com` (para `www`) y/o **A** → `76.76.21.21` (para el raíz).
   La propagación DNS puede tardar hasta 24 h (normalmente minutos).

---

## ✅ Checklist rápido

- [ ] Hay un despliegue **Production → Ready** ✅ en Deployments
- [ ] Framework Preset = **Other** (no Next.js)
- [ ] Output Directory = **vacío / `.`** (no `download`)
- [ ] Dominio `www.kikicollectionshop.com` añadido y en **Valid Configuration**
- [ ] (Opcional) `MP_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`, `URL_BASE` en Environment Variables
- [ ] Último commit/despliegue hecho después de estos cambios

Si después de todo sigues con 404, copia el **Deployment URL** (algo como
`kikis-collection-shop-xxxx.vercel.app`) y ábrelo directamente. Si ese SÍ carga
pero tu dominio no, el problema es 100% de DNS/dominio (Paso 2 y 6). Si ese
también da 404, el problema es de build/config (Paso 3 y 5).
