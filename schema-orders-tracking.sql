-- =========================================================================
-- schema-orders-tracking.sql — Migración para el flujo post-pago
-- -------------------------------------------------------------------------
-- Añade a la tabla `orders` las columnas necesarias para:
--   - Confirmación de pago (payment_ref, paid_at)
--   - Guía de envío y seguimiento (carrier, tracking_number, shipped_at)
--   - Notas internas del admin (notes)
--
-- EJECUTAR EN: Supabase Dashboard → SQL Editor → New query → pegar y Run.
-- Es idempotente: se puede correr las veces que sea necesario.
-- =========================================================================

-- ---- 1) Columnas nuevas en orders (si no existen) ----
alter table public.orders
  add column if not exists payment_ref     text,
  add column if not exists paid_at         timestamptz,
  add column if not exists carrier         text,
  add column if not exists tracking_number text,
  add column if not exists shipped_at      timestamptz,
  add column if not exists notes           text;

-- ---- 2) Índices para búsquedas frecuentes ----
create index if not exists orders_payment_ref_idx     on public.orders(payment_ref);
create index if not exists orders_tracking_number_idx on public.orders(tracking_number);
create index if not exists orders_status_idx          on public.orders(status);
create index if not exists orders_created_at_idx      on public.orders(created_at desc);

-- ---- 3) Comentario informativo ----
comment on column public.orders.payment_ref     is 'Referencia del pago: Stripe session id (cs_...) o Mercado Pago payment id';
comment on column public.orders.paid_at         is 'Fecha en la que se confirmó el pago';
comment on column public.orders.carrier         is 'Transportista: estafeta, dhl, fedex, correos, paqueteexpress, quetal, send, redpack, otro';
comment on column public.orders.tracking_number is 'Número de guía del transportista, compartido con el cliente para rastreo';
comment on column public.orders.shipped_at      is 'Fecha en la que se asignó la guía y se marcó como enviado';
comment on column public.orders.notes           is 'Notas internas del admin';

-- =========================================================================
-- NOTA SOBRE RLS:
--   Las políticas existentes de `orders` ya permiten que el admin (auth.users
--   con perfil de admin) haga SELECT/UPDATE, y que cada cliente lea solo sus
--   propios pedidos (customer_id = auth.uid()). Estas columnas nuevas quedan
--   automáticamente cubiertas por esas mismas políticas.
--
--   Si partiste de una instalación SIN RLS en orders, aplica estas políticas
--   (descomenta). Requieren que exista la tabla `profiles` con la columna
--   `role` ('admin' o 'customer').
-- =========================================================================
/*
-- El cliente ve solo sus propios pedidos
create policy "Cliente lee sus pedidos"
  on public.orders for select
  to authenticated
  using (customer_id = auth.uid());

-- El admin ve y edita todos los pedidos
create policy "Admin full access orders"
  on public.orders for all
  to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));
*/
