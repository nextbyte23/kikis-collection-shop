# Kiki's Collection Shop — Tienda Pokémon TCG en línea

Tienda e-commerce para Kiki's Collection Shop (Tapachula, Chiapas) con catálogo de productos Pokémon TCG, panel de administración, campañas de descuento por fechas (Buen Fin, Black Friday, Navidad) y carrito de compras que finaliza por WhatsApp.

**Stack:** HTML estático + JavaScript + [Supabase](https://supabase.com) (base de datos + autenticación) + [Vercel](https://vercel.com) (hosting) + [GitHub](https://github.com) (control de versiones).

---

## 📁 Estructura del proyecto

```
download/
├── kikis_collection_store.html   # Tienda pública (catálogo + carrito)
├── admin.html                    # Panel de administración (login + CRUD)
├── config.js                     # ← Configuración de Supabase (URL + anon key)
├── supabase-client.js            # Wrapper que conecta con Supabase (fallback localStorage)
├── schema.sql                    # Esquema de base de datos (ejecutar en Supabase)
├── kiki_logo.png                 # Logo de la tienda
└── README.md                     # Este archivo

scripts/
├── migrate_to_supabase.py        # Script opcional para cargar productos por lotes
├── build_admin.py                # Generador del admin.html (referencia)
├── build_kikis_v2_data.py        # Generador del catálogo (referencia)
└── build_kikis_v2_final.py       # Generador de la tienda (referencia)

vercel.json                       # Configuración de despliegue en Vercel
.gitignore                        # Archivos a ignorar en git
.env.example                      # Plantilla de variables de entorno
```

> Los scripts en `scripts/` son para regenerar los HTML si haces cambios estructurales.
> Para uso diario solo necesitas editar los archivos en `download/` y subirlos a git.

---

## 🚀 Guía completa de puesta en marcha

### Paso 1 — Crear cuenta y proyecto en Supabase

1. Ve a https://supabase.com y crea una cuenta (gratis, sin tarjeta de crédito).
2. Click en **New Project**.
3. Completa:
   - **Name:** `kikis-collection-shop`
   - **Database Password:** genera una contraseña fuerte y guárdala en un gestor de contraseñas.
   - **Region:** `US East` (la más cercana a México con buen rendimiento en el plan gratis).
   - **Pricing plan:** Free (suficiente para empezar).
4. Espera 2-3 minutos a que el proyecto se aprovisione.

### Paso 2 — Crear las tablas en la base de datos

1. En el dashboard de Supabase, ve a **SQL Editor** → **New query**.
2. Abre el archivo `download/schema.sql` de este proyecto, copia TODO su contenido y pégalo en el editor.
3. Click en **Run** (▶).
4. Verifica que se crearon las tablas y se insertaron los 70 productos:
   ```sql
   select count(*) from public.products;       -- debe mostrar 70
   select * from public.active_campaigns;      -- debe estar vacío (sin campañas aún)
   ```

### Paso 3 — Crear el usuario administrador

1. En Supabase, ve a **Authentication** → **Users** → **Add user**.
2. Completa:
   - **Email:** tu correo (ej. `kikicshop@gmail.com`)
   - **Password:** una contraseña segura (no uses `kiki2026` en producción)
   - Marca **Auto Confirm User** (o confirma el correo si recibes el email).
3. Click en **Create user**.

> Este usuario podrá iniciar sesión en el panel admin cuando esté conectado a Supabase.

### Paso 4 — Obtener las credenciales de API

1. En Supabase, ve a **Project Settings** (ícono de engrane) → **API**.
2. Copia dos valores:
   - **Project URL:** `https://abcdefghijklm.supabase.co`
   - **anon public key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (larga, empieza con `eyJ`)
3. **NO** uses la `service_role key` en el navegador — esa es solo para scripts en servidor.

### Paso 5 — Configurar el frontend

Edita el archivo `download/config.js` y reemplaza los valores vacíos:

```javascript
window.SUPABASE_CONFIG = {
  url: "https://abcdefghijklm.supabase.co",   // ← tu Project URL
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  // ← tu anon public key
};
```

> **¿Es seguro exponer la anon key?** Sí. Supabase está diseñado así. Las políticas RLS del `schema.sql` controlan qué se puede hacer con esa clave: lectura pública de productos/campañas, y escritura **solo** para usuarios autenticados. Sin iniciar sesión en el admin, nadie puede modificar datos.

### Paso 6 — Probar localmente

Abre `download/admin.html` en tu navegador. Deberías ver:
- Indicador verde "Supabase conectado"
- Formulario de login con campo de correo + contraseña
- Al iniciar sesión con el usuario del Paso 3: dashboard con 70 productos

Abre `download/kikis_collection_store.html` en otra pestaña. Debería mostrar el catálogo con datos frescos desde Supabase.

✅ Si todo funciona localmente, procede al despliegue.

---

## 🖼️ Imágenes de productos (Supabase Storage)

El `schema.sql` ya crea todo lo necesario para subir imágenes:

1. **Columna `image_url`** en la tabla `products` (acepta solo URLs `http(s)://`).
2. **Bucket público `product-images`** (5 MB por archivo, tipos: JPG/PNG/WebP/GIF).
3. **Políticas RLS** en `storage.objects`:
   - Lectura **pública** (la tienda carga las imágenes sin token).
   - Subida/borrado **solo autenticados** (el admin).

Solo necesitas ejecutar el `schema.sql` completo en el **SQL Editor** (Paso 2). Para verificar:

```sql
-- Verificar bucket creado
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'product-images';

-- Verificar políticas
select polname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and polname like 'product_images%';
```

Deberías ver 4 políticas: `read_public` (select, anon+authenticated), `insert_auth`, `update_auth`, `delete_auth`.

### Límites del plan gratis de Supabase Storage

- **1 GB** de almacenamiento total.
- **2 GB** de transferencia (egress) por mes.
- Una imagen promedio de 200 KB te da para ~5,000 productos o ~10,000 vistas de tienda al mes. Amplio para empezar.

### Si en algún momento necesitas más espacio

- Plan Pro de Supabase: $25 USD/mes → 100 GB storage, 250 GB transferencia.
- Alternativa gratuita: Cloudflare R2 (10 GB gratis, sin egress) — requiere cambiar el código del uploader, pero es compatible.

### Solución de problemas comunes

- **"Storage no disponible en modo offline"** → significa que `config.js` no tiene credenciales. Configúralo primero.
- **Error 403 al subir** → las políticas RLS no se crearon. Vuelve a ejecutar la sección 9 del `schema.sql`.
- **La imagen no aparece en la tienda** → verifica con `select id, name, image_url from products where image_url is not null;` que el campo se guardó.
- **"La imagen pesa más de 5 MB"** → reduce con https://tinypng.com o https://squoosh.app antes de subir.

---

## 🌐 Desplegar en Vercel (gratis)

### Opción A — Vía GitHub (recomendado)

1. **Sube el proyecto a GitHub** (ver siguiente sección).
2. Ve a https://vercel.com y regístrate con tu cuenta de GitHub.
3. Click en **Add New Project** → importa el repositorio.
4. Vercel detecta automáticamente la configuración de `vercel.json`. Solo confirma:
   - **Framework Preset:** Other (¡NO Next.js! este es un sitio estático)
   - **Root Directory:** `./` (dejarlo así)
   - **Build Command:** dejar vacío (es sitio estático, `vercel.json` ya pone `buildCommand: null`)
   - **Output Directory:** dejar vacío / `.` (los archivos están en la raíz del proyecto, NO en una carpeta `download`)
5. Click en **Deploy**. En 1-2 minutos tu sitio estará en `https://kikis-collection-shop.vercel.app`.
6. Cada vez que hagas `git push`, Vercel redesplegará automáticamente.

### Opción B — Vía Vercel CLI (sin GitHub)

```bash
npm i -g vercel
cd /home/z/my-project
vercel            # sigue las instrucciones (cuenta, proyecto)
vercel --prod     # despliegue a producción
```

> **Importante:** El archivo `config.js` (con tus credenciales de Supabase) **sí** se sube a Vercel/GitHub. Es seguro: la anon key es pública por diseño. Lo que NUNCA debes subir es la `service_role` key — esa queda fuera del repo (está en `.gitignore`).

---

## 🐙 Crear repositorio en GitHub

1. Crea una cuenta en https://github.com (gratis).
2. Click en **+** → **New repository**.
   - **Name:** `kikis-collection-shop`
   - **Description:** `Tienda Pokémon TCG con panel admin y Supabase`
   - **Private** o **Public** (recomendado Private para que no vean tu código).
3. En tu computadora (ya en el proyecto):
   ```bash
   cd /home/z/my-project
   git init
   git add .
   git commit -m "Tienda Kiki's Collection Shop con Supabase"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/kikis-collection-shop.git
   git push -u origin main
   ```

> Si no quieres usar la terminal, puedes subir los archivos directamente desde la web de GitHub: **Add file → Upload files**.

---

## 🌍 Comprar y conectar un dominio propio

### Comprar el dominio

**Recomendaciones de registradores** (todos soportan dominios `.com` y `.mx`):

| Registrador | Precio aprox. .com/año | Notas |
|---|---|---|
| [Namecheap](https://namecheap.com) | $9-12 USD | Barato, buena interfaz |
| [Cloudflare Registrar](https://cloudflare.com) | $9-10 USD | Sin markup, muy rápido |
| [Google Domains → Squarespace](https://squarespace.com/domains) | $12 USD | Interfaz simple |
| [GoDaddy México](https://godaddy.com/mx) | $200-300 MXN | Soporte en español |

**Sugerencia de dominio:** `kikicollectionstore.com` (coincide con tu marca actual) o `kikicollection.mx` (más corto, da identidad mexicana).

> Evita comprar el dominio en Vercel directamente: es más caro ($20 USD/año). Mejor cómpralo aparte y conéctalo.

### Conectar el dominio a Vercel

1. En Vercel, ve a tu proyecto → **Settings** → **Domains**.
2. Click en **Add** e ingresa tu dominio (ej. `kikicollectionstore.com`).
3. Vercel te muestra los **nameservers** o **registros DNS** que debes configurar:
   - **Opción A (recomendada):** cambia los nameservers del dominio a los de Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Propagación: 1-24h.
   - **Opción B:** mantén tu registrador y agrega un registro **CNAME** apuntando a `cname.vercel-dns.com`.
4. Vercel emite automáticamente un **certificado HTTPS** (candado verde) — sin costo extra.
5. También agrega la versión `www.` (Vercel lo hace automático).

### Verificación

Una vez propagado el DNS, entra a `https://tudominio.com` y debería cargar la tienda. Verifica que:
- El candado HTTPS aparece en el navegador.
- `https://tudominio.com/admin` carga el panel admin.
- El admin te deja iniciar sesión (con Supabase Auth).

---

## 🛠️ Uso diario

### Agregar / editar productos
1. Entra a `/admin` (o `/admin.html`).
2. Inicia sesión con tu correo + contraseña de Supabase.
3. Ve a **Productos** → **Nuevo producto** o edita uno existente.
4. Los cambios aparecen automáticamente en la tienda pública.

#### Subir imagen del producto
1. En el formulario del producto, busca el campo **"Imagen del producto"**.
2. Haz clic en la zona punteada (🖼️) o **arrastra** una imagen ahí.
3. Formatos admitidos: **JPG, PNG, WebP, GIF** · Máximo **5 MB**.
4. Verás una vista previa cuadrada (120×120). Recomendado: imagen cuadrada, ~800×800px.
5. Para **quitar la imagen**, haz clic en la ✕ sobre la vista previa y guarda.
6. Al hacer clic en **Guardar**, la imagen se sube a Supabase Storage y se asocia al producto.
7. Si dejas el campo vacío, la tarjeta muestra el emoji de la categoría (📦 🃏 🗂️ 🐉).

> En modo offline (sin Supabase configurado) la subida está deshabilitada, pero puedes previsualizar la imagen localmente.

### Crear campañas de descuento
1. En el admin, ve a **Campañas**.
2. Usa los botones rápidos (🟠 Buen Fin, ⚫ Black Friday, 🎄 Navidad) o crea una personalizada.
3. Define fecha de inicio, fin, % de descuento y a qué productos aplica.
4. El estado (Programada / Activa / Finalizada) se calcula automáticamente según las fechas.
5. Mientras esté activa, la tienda muestra el banner y aplica el descuento en las tarjetas y el carrito.

### Respaldo de datos
- En el admin, ve a **Respaldo** → **Exportar** para descargar un JSON con todos los productos y campañas.
- Para restaurar, usa **Importar** y selecciona un JSON previamente exportado.

---

## 🔒 Seguridad

| Elemento | ¿Dónde se usa? | ¿Es público? |
|---|---|---|
| `anon key` de Supabase | `config.js` (frontend) | ✅ Sí, es segura. RLS protege la escritura. |
| `service_role key` de Supabase | Solo scripts Python locales | ❌ NUNCA subir a git/frontend |
| Contraseña del admin | Supabase Auth (no en el código) | ❌ Solo tú la conoces |
| `kiki2026` | Solo modo offline (sin Supabase) | Para desarrollo local nada más |

**Reglas de oro:**
1. Nunca subas `.env` (con la service_role key) a git — está en `.gitignore`.
2. Cambia la contraseña `kiki2026` del modo demo antes de cualquier despliegue, o mejor: configura Supabase para que ese modo no se use.
3. Si sospechas que filtraste la service_role key: Supabase → Settings → API → **Reset service_role key**.

---

## ❓ Preguntas frecuentes

**¿Puedo cambiar los productos sin tocar código?**
Sí. Desde el panel admin, todos los cambios se guardan en Supabase y aparecen en la tienda en segundos.

**¿Qué pasa si Supabase se cae?**
La tienda sigue mostrando los últimos productos cargados (caché del navegador). El admin no podrá guardar cambios hasta que vuelva. Supabase tiene 99.9% de uptime en el plan gratis.

**¿Puedo aceptar pagos con tarjeta?**
Todavía no. El carrito finaliza por WhatsApp (ya configurado). Para agregar pago en línea (Stripe/MercadoPago), se necesita un backend adicional que procese el webhook. Es el siguiente paso natural cuando el volumen lo justifique.

**¿Cuánto cuesta mantener esto?**
- Supabase plan gratis: 500MB base de datos, 50K usuarios activos/mes, 2GB tráfico. Suficiente para empezar.
- Vercel plan gratis: 100GB tráfico/mes, dominio gratis `.vercel.app`.
- Dominio propio: ~$10 USD/año.
- **Total: $10 USD/año** si usas dominio propio, **$0** si usas el subdominio de Vercel.

**¿Puedo agregar imágenes de productos?**
¡Sí! Ya está implementado. Al crear o editar un producto en el admin, verás un campo "Imagen del producto" donde puedes arrastrar o seleccionar una imagen (JPG, PNG, WebP o GIF, máx. 5 MB). Se sube automáticamente a Supabase Storage y aparece en la tienda. Si no subes imagen, se mantiene el emoji por categoría (📦 🃏 🗂️ 🐉) como fallback. Ver la sección **🖼️ Imágenes de productos (Storage)** abajo para los pasos de configuración.

---

## 📞 Soporte

Si algo no funciona, revisa:
1. La consola del navegador (F12 → Console) para ver errores.
2. Que `config.js` tenga la URL y anon key correctas.
3. En Supabase → **Table Editor** → `products`: que haya datos.
4. En Supabase → **Authentication** → **Users**: que tu usuario exista y esté confirmado.

Para más ayuda, abre un issue en el repositorio de GitHub o escribe a `kikicshop@gmail.com`.

---

**© 2026 por Kiki's Collection Shop.** Pokémon y sus nombres de personajes son marcas registradas de Nintendo, Creatures Inc. y GAME FREAK inc. Esta tienda es un comercio independiente y no está afiliada ni respaldada por The Pokémon Company.
