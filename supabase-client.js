// =========================================================================
// Cliente de datos para Kiki's Collection Shop
// -------------------------------------------------------------------------
// Abstrae el acceso a productos y campañas. Usa Supabase si está configurado,
// si no, cae a localStorage (modo offline / desarrollo).
//
// También gestiona la autenticación del admin con Supabase Auth.
// =========================================================================

(function() {
  'use strict';

  const LS_PRODUCTS_KEY = 'kiki_products';
  const LS_CAMPAIGNS_KEY = 'kiki_campaigns';
  const LS_SEED_LOADED = 'kiki_seed_loaded';

  // ===== Cliente Supabase (lazy init) =====
  let _sb = null;
  function getSupabase() {
    if (_sb) return _sb;
    if (!window.supabaseEnabled || !window.supabaseEnabled()) return null;
    try {
      // El SDK de Supabase se carga vía CDN en el HTML (window.supabase)
      if (!window.supabase || !window.supabase.createClient) return null;
      _sb = window.supabase.createClient(
        window.SUPABASE_CONFIG.url,
        window.SUPABASE_CONFIG.anonKey,
        { auth: { persistSession: true, autoRefreshToken: true } }
      );
      return _sb;
    } catch (e) {
      console.warn('Error inicializando Supabase:', e);
      return null;
    }
  }

  // ===== Helpers localStorage (fallback) =====
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

  function nextId(arr) { return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1; }

  // ===== Seed inicial (solo para modo localStorage) =====
  // En Supabase, el schema.sql ya inserta los 70 productos.
  const SEED_PRODUCTS = window.SEED_PRODUCTS || [];

  function ensureSeed() {
    if (getSupabase()) return; // Supabase ya tiene sus datos
    if (localStorage.getItem(LS_SEED_LOADED) || lsGet(LS_PRODUCTS_KEY, null)) {
      // ya hay datos, no sembrar (a menos que esté vacío)
      if (!lsGet(LS_PRODUCTS_KEY, []).length) {
        lsSet(LS_PRODUCTS_KEY, SEED_PRODUCTS);
        localStorage.setItem(LS_SEED_LOADED, '1');
      }
      return;
    }
    lsSet(LS_PRODUCTS_KEY, SEED_PRODUCTS);
    lsSet(LS_CAMPAIGNS_KEY, []);
    localStorage.setItem(LS_SEED_LOADED, '1');
  }

  // ===== Helper: extraer la ruta dentro del bucket a partir de la URL pública =====
  // La URL pública tiene la forma: <SUPABASE_URL>/storage/v1/object/public/product-images/<path>
  // Esta función devuelve <path> para poder borrar/actualizar el archivo.
  function extractStoragePath(publicUrl, supabaseUrl) {
    if (!publicUrl || !supabaseUrl) return null;
    const marker = '/storage/v1/object/public/product-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(publicUrl.substring(idx + marker.length));
  }

  // ===== Normalización: convertir filas de Supabase a formato de la app =====
  function normalizeProduct(row) {
    return {
      id: row.id,
      name: row.name,
      cat: row.cat,
      description: row.description || '',
      price: parseFloat(row.price),
      sale: (row.sale == null || row.sale === '') ? null : parseFloat(row.sale),
      stock: !!row.stock,
      stock_quantity: (row.stock_quantity != null) ? parseInt(row.stock_quantity) : (row.stock ? 10 : 0),
      badge: row.badge || null,
      image_url: row.image_url || null
    };
  }
  function normalizeCampaign(row) {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      start: row.starts_at || row.start,   // ISO string (BD usa starts_at, app usa start)
      end: row.ends_at || row.end,         // ISO string (BD usa ends_at, app usa end)
      discount: parseInt(row.discount),
      scope: row.scope || 'all',
      category: row.category || null,
      ids: Array.isArray(row.ids) ? row.ids : [],
      banner: (row.banner === false) ? false : true,
      paused: !!row.paused
    };
  }

  // ===== API pública =====
  const API = {

    // ---- Estado del backend ----
    isOnline: function() { return !!getSupabase(); },

    // ---- Productos ----
    async listProducts() {
      const sb = getSupabase();
      if (!sb) { ensureSeed(); return lsGet(LS_PRODUCTS_KEY, []); }
      const { data, error } = await sb.from('products').select('*').order('id', { ascending: true });
      if (error) { console.error('listProducts:', error); return lsGet(LS_PRODUCTS_KEY, []); }
      return (data || []).map(normalizeProduct);
    },

    async createProduct(p) {
      const sb = getSupabase();
      if (!sb) {
        const arr = lsGet(LS_PRODUCTS_KEY, []);
        const np = { id: nextId(arr), name: p.name, cat: p.cat, description: p.description || '',
                     price: p.price, sale: p.sale, stock: p.stock,
                     stock_quantity: (p.stock_quantity != null) ? parseInt(p.stock_quantity) : (p.stock ? 10 : 0),
                     badge: p.badge, image_url: p.image_url || null };
        arr.push(np); lsSet(LS_PRODUCTS_KEY, arr);
        return np;
      }
      const qty = (p.stock_quantity != null) ? parseInt(p.stock_quantity) : (p.stock ? 10 : 0);
      const { data, error } = await sb.from('products').insert({
        name: p.name, cat: p.cat, description: p.description || null, price: p.price, sale: p.sale,
        stock: qty > 0, stock_quantity: qty, badge: p.badge, image_url: p.image_url || null
      }).select().single();
      if (error) throw error;
      return normalizeProduct(data);
    },

    async updateProduct(id, patch) {
      const sb = getSupabase();
      if (!sb) {
        const arr = lsGet(LS_PRODUCTS_KEY, []);
        const i = arr.findIndex(x => x.id === id);
        if (i >= 0) { arr[i] = { ...arr[i], ...patch }; lsSet(LS_PRODUCTS_KEY, arr); return arr[i]; }
        throw new Error('Producto no encontrado');
      }
      const updateFields = {
        name: patch.name, cat: patch.cat, price: patch.price, sale: patch.sale,
        badge: patch.badge
      };
      // stock_quantity si viene en el patch (modo inventario numérico)
      if ('stock_quantity' in patch) {
        const qty = parseInt(patch.stock_quantity) || 0;
        updateFields.stock_quantity = qty;
        updateFields.stock = qty > 0;  // mantén sincronizado por si acaso
      } else if ('stock' in patch) {
        // compatibilidad hacia atrás: si solo viene stock booleano
        updateFields.stock = patch.stock;
      }
      // description se actualiza solo si viene en el patch (permite vaciarla)
      if ('description' in patch) updateFields.description = patch.description;
      // Solo actualizar image_url si viene explícito en el patch (para poder nullificar)
      if ('image_url' in patch) updateFields.image_url = patch.image_url;
      const { data, error } = await sb.from('products').update(updateFields).eq('id', id).select().single();
      if (error) throw error;
      return normalizeProduct(data);
    },

    async deleteProduct(id) {
      const sb = getSupabase();
      if (!sb) {
        const arr = lsGet(LS_PRODUCTS_KEY, []).filter(x => x.id !== id);
        lsSet(LS_PRODUCTS_KEY, arr);
        return;
      }
      // Borrar primero la imagen del bucket (si existe) para no dejar archivos huérfanos
      try {
        const { data: prod } = await sb.from('products').select('image_url').eq('id', id).maybeSingle();
        if (prod && prod.image_url) {
          const path = extractStoragePath(prod.image_url, window.SUPABASE_CONFIG.url);
          if (path) await sb.storage.from('product-images').remove([path]);
        }
      } catch (e) { console.warn('No se pudo borrar la imagen del bucket:', e); }
      const { error } = await sb.from('products').delete().eq('id', id);
      if (error) throw error;
    },

    // ---- Imágenes (Storage) ----
    // Devuelve la URL pública de un archivo del bucket "product-images".
    getPublicImageUrl(path) {
      const sb = getSupabase();
      if (!sb) return null;
      return sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    },

    // Sube una imagen al bucket y devuelve la URL pública.
    // path: ruta dentro del bucket (ej: "12-1700000000.webp")
    // file: objeto File del input
    async uploadProductImage(path, file) {
      const sb = getSupabase();
      if (!sb) throw new Error('Storage no disponible en modo offline. Configura Supabase en config.js.');
      // Validación del lado cliente (la BD también valida en server)
      const allowedTypes = ['image/jpeg','image/png','image/webp','image/gif'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Tipo de archivo no permitido. Usa JPG, PNG, WebP o GIF.');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('La imagen pesa más de 5 MB. Reduce su tamaño.');
      }
      const { data, error } = await sb.storage.from('product-images')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });
      if (error) throw error;
      return this.getPublicImageUrl(path);
    },

    // Borra una imagen del bucket por su path.
    async deleteProductImage(path) {
      const sb = getSupabase();
      if (!sb) throw new Error('Storage no disponible en modo offline.');
      const { error } = await sb.storage.from('product-images').remove([path]);
      if (error) throw error;
    },

    // ---- Campañas ----
    async listCampaigns() {
      const sb = getSupabase();
      if (!sb) { return lsGet(LS_CAMPAIGNS_KEY, []); }
      const { data, error } = await sb.from('campaigns').select('*').order('id', { ascending: true });
      if (error) { console.error('listCampaigns:', error); return lsGet(LS_CAMPAIGNS_KEY, []); }
      return (data || []).map(normalizeCampaign);
    },

    async createCampaign(c) {
      const sb = getSupabase();
      if (!sb) {
        const arr = lsGet(LS_CAMPAIGNS_KEY, []);
        const nc = { id: nextId(arr), name: c.name, type: c.type, start: c.start, end: c.end,
                     discount: c.discount, scope: c.scope, category: c.category, ids: c.ids || [],
                     banner: c.banner, paused: false };
        arr.push(nc); lsSet(LS_CAMPAIGNS_KEY, arr);
        return nc;
      }
      const { data, error } = await sb.from('campaigns').insert({
        name: c.name, type: c.type, starts_at: c.start, ends_at: c.end, discount: c.discount,
        scope: c.scope, category: c.category, ids: c.ids || [], banner: c.banner
      }).select().single();
      if (error) throw error;
      return normalizeCampaign(data);
    },

    async updateCampaign(id, patch) {
      const sb = getSupabase();
      if (!sb) {
        const arr = lsGet(LS_CAMPAIGNS_KEY, []);
        const i = arr.findIndex(x => x.id === id);
        if (i >= 0) { arr[i] = { ...arr[i], ...patch }; lsSet(LS_CAMPAIGNS_KEY, arr); return arr[i]; }
        throw new Error('Campaña no encontrada');
      }
      const updateFields = {
        name: patch.name, type: patch.type, starts_at: patch.start, ends_at: patch.end,
        discount: patch.discount, scope: patch.scope, category: patch.category,
        ids: patch.ids, banner: patch.banner
      };
      if ('paused' in patch) updateFields.paused = patch.paused;
      const { data, error } = await sb.from('campaigns').update(updateFields).eq('id', id).select().single();
      if (error) throw error;
      return normalizeCampaign(data);
    },

    async deleteCampaign(id) {
      const sb = getSupabase();
      if (!sb) {
        const arr = lsGet(LS_CAMPAIGNS_KEY, []).filter(x => x.id !== id);
        lsSet(LS_CAMPAIGNS_KEY, arr);
        return;
      }
      const { error } = await sb.from('campaigns').delete().eq('id', id);
      if (error) throw error;
    },

    // ---- Auth (solo admin) ----
    async signIn(email, password) {
      const sb = getSupabase();
      if (!sb) {
        // Modo offline: contraseña hardcodeada del admin original
        if (password === 'kiki2026') {
          sessionStorage.setItem('kiki_admin_auth', '1');
          return { user: { email: email || 'admin@local' } };
        }
        throw new Error('Contraseña incorrecta');
      }
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      const sb = getSupabase();
      if (!sb) {
        sessionStorage.removeItem('kiki_admin_auth');
        return;
      }
      await sb.auth.signOut();
    },

    async getSession() {
      const sb = getSupabase();
      if (!sb) {
        return sessionStorage.getItem('kiki_admin_auth') === '1'
          ? { user: { email: 'admin@local' } } : null;
      }
      const { data } = await sb.auth.getSession();
      return data.session ? { user: data.session.user } : null;
    },

    // ---- Auth de CLIENTE (Opción B) ----
    // Registro de cliente. Crea el usuario en auth.users; el trigger
    // handle_new_user (schema-customers.sql) crea automáticamente el profile.
    // emailRedirectTo: cuando el cliente haga clic en el enlace del correo de
    // confirmación, Supabase lo llevará a account.html (donde se verifica solo).
    async signUpCustomer(email, password, fullName, phone) {
      const sb = getSupabase();
      if (!sb) throw new Error('Registro requiere conexión a Supabase');
      // Construir la URL absoluta de account.html en el mismo origen
      const redirectUrl = new URL('account.html', window.location.origin + window.location.pathname.replace(/[^/]*$/, '')).href;
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName || '',
            phone: phone || ''
          }
        }
      });
      if (error) throw error;
      return data;
    },

    // Verifica el código OTP de 6 dígitos que el usuario recibió por correo.
    // type='signup' valida el código enviado al registrar; también funciona para
    // 'email' (magic link) y 'email_change'. Devuelve { session, error }.
    async verifyEmailOtp(email, token, type) {
      const sb = getSupabase();
      if (!sb) throw new Error('Verificación requiere conexión a Supabase');
      const { data, error } = await sb.auth.verifyOtp({
        email,
        token: String(token).trim(),
        options: { type: type || 'signup' }
      });
      return { session: data && data.session, error };
    },

    // Verifica el token_hash que Supabase pone en la URL cuando el cliente hace
    // clic en el enlace de confirmación del correo (modo default, sin SMTP custom).
    // El type viene también en la URL ('signup', 'email', 'email_change', etc.).
    // Devuelve { session, error }.
    async verifyOtpTokenHash(tokenHash, type) {
      const sb = getSupabase();
      if (!sb) throw new Error('Verificación requiere conexión a Supabase');
      const { data, error } = await sb.auth.verifyOtp({
        token_hash: String(tokenHash).trim(),
        type: type || 'signup'
      });
      return { session: data && data.session, error };
    },

    // Reenvía el código OTP de registro al correo dado.
    // Útil cuando el usuario no recibió el primer código.
    async resendOtp(email, type) {
      const sb = getSupabase();
      if (!sb) throw new Error('Reenvío requiere conexión a Supabase');
      const { data, error } = await sb.auth.resend({
        email,
        options: { type: type || 'signup' }
      });
      return { data, error };
    },

    // Suscripción a cambios de sesión (login/logout). Devuelve función para desuscribirse.
    onAuthStateChange(callback) {
      const sb = getSupabase();
      if (!sb) return () => {};
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        callback(session ? { user: session.user } : null);
      });
      return () => { try { data.subscription.unsubscribe(); } catch (e) {} };
    },

    // Devuelve el profile completo del usuario autenticado (con rol y datos de envío).
    async getCurrentProfile() {
      const sb = getSupabase();
      if (!sb) return null;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data, error } = await sb.from('profiles')
        .select('*').eq('id', user.id).single();
      if (error) throw error;
      return data;
    },

    // Actualiza datos de envío del cliente en su propio profile.
    async updateProfile(patch) {
      const sb = getSupabase();
      if (!sb) throw new Error('Se requiere sesión');
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error('No hay sesión activa');
      const allowed = ['full_name', 'phone', 'address_street', 'address_city',
                       'address_state', 'address_zip', 'address_country'];
      const clean = {};
      allowed.forEach(k => { if (k in patch) clean[k] = patch[k]; });
      const { data, error } = await sb.from('profiles')
        .update(clean).eq('id', user.id).select().single();
      if (error) throw error;
      return data;
    },

    // ---- PEDIDOS (Opción B) ----
    // Crea un pedido + sus items. Devuelve { id, total, ... }.
    // `order` debe traer: customer_name, customer_email, customer_phone,
    // direccion opcional, items:[{product_id, name, unit_price, qty, line_total}],
    // subtotal, shipping, total, whatsapp_msg.
    async createOrder(order) {
      const sb = getSupabase();
      if (!sb) throw new Error('Se requiere conexión a Supabase para registrar el pedido');

      const { data: { user } } = await sb.auth.getUser();
      const row = {
        customer_id: user ? user.id : null,
        customer_name: order.customer_name,
        customer_email: order.customer_email || null,
        customer_phone: order.customer_phone,
        customer_address_street: order.customer_address_street || null,
        customer_address_city: order.customer_address_city || null,
        customer_address_state: order.customer_address_state || null,
        customer_address_zip: order.customer_address_zip || null,
        subtotal: Number(order.subtotal) || 0,
        shipping: Number(order.shipping) || 0,
        total: Number(order.total) || 0,
        status: 'pendiente',
        payment_method: order.payment_method || 'whatsapp',
        whatsapp_msg: order.whatsapp_msg || null
      };
      const { data: orderRow, error } = await sb.from('orders')
        .insert(row).select().single();
      if (error) throw error;

      if (order.items && order.items.length) {
        const items = order.items.map(it => ({
          order_id: orderRow.id,
          product_id: it.product_id || null,
          name: it.name,
          unit_price: Number(it.unit_price),
          qty: Number(it.qty),
          line_total: Number(it.line_total)
        }));
        const { error: ie } = await sb.from('order_items').insert(items);
        if (ie) throw ie;
      }
      return orderRow;
    },

    // Lista los pedidos del cliente autenticado (sus propios pedidos).
    async listMyOrders() {
      const sb = getSupabase();
      if (!sb) return [];
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data, error } = await sb.from('orders')
        .select('id, status, total, payment_method, carrier, tracking_number, paid_at, shipped_at, created_at, order_items(name, qty, line_total)')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },

    // Lista TODOS los pedidos (solo admin, validado por RLS).
    async listAllOrders() {
      const sb = getSupabase();
      if (!sb) return [];
      const { data, error } = await sb.from('orders')
        .select('id, customer_name, customer_email, customer_phone, customer_address_street, customer_address_city, customer_address_state, customer_address_zip, total, subtotal, shipping, status, payment_method, carrier, tracking_number, paid_at, shipped_at, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },

    // Detalle de un pedido con sus items (solo admin, validado por RLS).
    async getOrderDetail(id) {
      const sb = getSupabase();
      if (!sb) throw new Error('Sin conexión');
      const { data, error } = await sb.from('orders')
        .select('*, order_items(*)').eq('id', id).single();
      if (error) throw error;
      return data;
    },

    // Cambia el estado de un pedido (solo admin).
    async updateOrderStatus(id, status) {
      const sb = getSupabase();
      if (!sb) throw new Error('Sin conexión');
      const { data, error } = await sb.from('orders')
        .update({ status }).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    // Asigna transportista + número de guía a un pedido y lo marca como 'enviado'
    // (solo admin). Así el cliente ve el rastreo en su historial de compras.
    async setTracking(id, carrier, trackingNumber) {
      const sb = getSupabase();
      if (!sb) throw new Error('Sin conexión');
      const patch = {
        carrier: carrier || null,
        tracking_number: (trackingNumber || '').trim() || null,
        shipped_at: new Date().toISOString()
      };
      // Si el pedido estaba pagado/confirmado, al asignar guía pasa a 'enviado'.
      const { data: cur } = await sb.from('orders').select('status').eq('id', id).maybeSingle();
      if (cur && ['pagado', 'confirmado', 'pendiente'].includes(cur.status)) {
        patch.status = 'enviado';
      }
      const { data, error } = await sb.from('orders')
        .update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },

    // Reenvía el correo de resumen del pedido al cliente (llama al endpoint
    // server-side /api/send-order-email). Solo admin.
    async resendOrderEmail(id) {
      const resp = await fetch('/api/send-order-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo enviar el correo');
      return data;
    },

    // ---- CUENTAS BANCARIAS (para cuando se active pago por transferencia) ----
    // Lista las cuentas activas — vía RPC pública, sin requerir login.
    async listBankAccounts() {
      const sb = getSupabase();
      if (!sb) return [];
      const { data, error } = await sb.rpc('list_active_bank_accounts');
      if (error) throw error;
      return data || [];
    },

    // Lista TODAS las cuentas (admin) — activas e inactivas.
    async listAllBankAccounts() {
      const sb = getSupabase();
      if (!sb) return [];
      const { data, error } = await sb.from('bank_accounts')
        .select('*').order('sort_order', { ascending: true }).order('id', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    // Crea o actualiza una cuenta bancaria (solo admin).
    async upsertBankAccount(acc) {
      const sb = getSupabase();
      if (!sb) throw new Error('Sin conexión');
      const row = {
        bank_name: acc.bank_name,
        holder: acc.holder,
        clabe: acc.clabe,
        card_number_last4: acc.card_number_last4 || null,
        account_type: acc.account_type || 'transferencia',
        is_active: acc.is_active !== false,
        sort_order: Number(acc.sort_order) || 0
      };
      if (acc.id) {
        const { data, error } = await sb.from('bank_accounts')
          .update(row).eq('id', acc.id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await sb.from('bank_accounts')
          .insert(row).select().single();
        if (error) throw error;
        return data;
      }
    },

    async deleteBankAccount(id) {
      const sb = getSupabase();
      if (!sb) throw new Error('Sin conexión');
      const { error } = await sb.from('bank_accounts').delete().eq('id', id);
      if (error) throw error;
    },

    // ---- Import / Export (respaldo) ----
    async exportAll() {
      const [products, campaigns] = await Promise.all([this.listProducts(), this.listCampaigns()]);
      return {
        exported_at: new Date().toISOString(),
        store: "Kiki's Collection Shop",
        backend: this.isOnline() ? 'supabase' : 'localStorage',
        products, campaigns
      };
    },

    async importAll(data) {
      // Reemplaza todos los productos y campañas.
      // En modo Supabase esto es una operación destructiva — se usa truncate + insert.
      const sb = getSupabase();
      if (!sb) {
        lsSet(LS_PRODUCTS_KEY, data.products || []);
        lsSet(LS_CAMPAIGNS_KEY, data.campaigns || []);
        return;
      }
      // En Supabase, hacemos upsert por id. Para reemplazar todo, primero borramos.
      if (data.products && data.products.length) {
        await sb.from('products').delete().neq('id', 0);
        const rows = data.products.map(p => ({
          name: p.name, cat: p.cat, description: p.description || null, price: p.price, sale: p.sale,
          stock: p.stock, badge: p.badge
        }));
        const { error } = await sb.from('products').insert(rows);
        if (error) throw error;
      }
      if (data.campaigns && data.campaigns.length) {
        await sb.from('campaigns').delete().neq('id', 0);
        const rows = data.campaigns.map(c => ({
          name: c.name, type: c.type, starts_at: c.start, ends_at: c.end, discount: c.discount,
          scope: c.scope, category: c.category, ids: c.ids || [], banner: c.banner, paused: c.paused
        }));
        const { error } = await sb.from('campaigns').insert(rows);
        if (error) throw error;
      }
    },

    async resetToSeed() {
      // Solo aplica en modo localStorage (en Supabase el schema.sql carga el seed)
      if (this.isOnline()) {
        throw new Error('Para restablecer en Supabase, ejecuta schema.sql de nuevo');
      }
      lsSet(LS_PRODUCTS_KEY, SEED_PRODUCTS);
      lsSet(LS_CAMPAIGNS_KEY, []);
      localStorage.setItem(LS_SEED_LOADED, '1');
    }
  };

  window.KikiDB = API;

  // Avisar al resto de la app si estamos online u offline
  window.dispatchEvent(new CustomEvent('kiki-db-ready', { detail: { online: API.isOnline() } }));
})();
