-- 148_orders_monthly_partitioning.sql
--
-- Convert public.orders to a table partitioned BY RANGE (created_at), one
-- partition per UTC calendar month, with partitions always provisioned twelve
-- months ahead by pg_cron (installed, 1.6.4).
--
-- WHY THE FILE IS THIS LONG. Partitioning a table with sixteen inbound foreign
-- keys is not a one-liner, because a partitioned table can only carry unique
-- constraints that include the partition key. Two consequences follow, and
-- both are handled here rather than dropped on the floor:
--
--   1. The primary key becomes (id, created_at). Every FK that used to say
--      REFERENCES orders(id) must become a composite FK on
--      (<fk>, <fk's created_at twin>). Each of the sixteen referencing tables
--      gains a timestamptz twin column, auto-filled by a BEFORE trigger, so
--      **no application write path changes**: inserts that set only order_id
--      keep working, the trigger fills the twin, and the composite FK keeps
--      the exact ON DELETE semantics each table had before (CASCADE, RESTRICT
--      or SET NULL — SET NULL now nulls the pair). The FK constraint names are
--      preserved verbatim, so PostgREST resource embedding
--      (order_items(...), orders!inner(...)) resolves exactly as before.
--   2. UNIQUE (invoice_number) cannot survive on the parent. Global invoice
--      uniqueness is law, not a preference, so it moves to a tiny server-only
--      registry table, orders_invoice_numbers, kept in sync by an AFTER
--      trigger on orders. A duplicate invoice number now raises
--      unique_violation on orders_invoice_numbers_pkey (new name, same
--      SQLSTATE 23505; no code in src/ matches on the old constraint name).
--
-- WHAT DOES NOT CHANGE. Column list, types, defaults, generated agorot twins,
-- CHECK constraints, the four RLS policies, grants, and the three triggers
-- (set_updated_at, tg_orders_status_guard, trg_orders_notify_paid) are
-- recreated verbatim on the parent. Row triggers and indexes created on a
-- partitioned parent propagate to every partition automatically, including
-- future ones. The asc/desc near-duplicate pair on created_at is kept as-is
-- on purpose: this file is a structural conversion, not an index review.
--
-- PARTITION HYGIENE. Every partition is created by one function,
-- orders_ensure_partitions(). Each new partition gets ROW LEVEL SECURITY
-- enabled and anon/authenticated revoked, because Supabase default privileges
-- would otherwise expose orders_pYYYY_MM through the data API with no
-- policies. Access through the parent is governed by the parent's policies
-- (partition policies are ignored when querying via the parent).
--
-- SCHEDULING. pg_cron job 'orders-ensure-partitions' runs daily at 03:17 UTC.
-- A creation run is a handful of no-op catalog probes on all but at most one
-- day a month; daily keeps eleven months of slack if any single run fails.
--
-- BOUNDS. Partitions cover months from the oldest existing row through
-- current month + 12. An INSERT dated before the oldest partition or more
-- than 12 months ahead fails with "no partition of relation" — by design;
-- backdated imports need their partition created first.
--
-- AFTER APPLY. Regenerate src/types/database.ts (pnpm db:types): the sixteen
-- twin columns and the registry table change the generated types.
--
-- ROLLBACK (full, in order):
--   select cron.unschedule('orders-ensure-partitions');
--   -- recreate a plain table from the partitioned one:
--   create table public.orders_flat (like public.orders including defaults
--     including generated including constraints);
--   insert into public.orders_flat (<the 23 non-generated columns>)
--     select <same> from public.orders;
--   -- drop the 16 composite FKs + pair checks + twin columns + triggers,
--   --   re-add the original single-column FKs to orders_flat(id);
--   drop view public.v_admin_pending_queues;
--   drop table public.orders;  -- takes all partitions with it
--   alter table public.orders_flat rename to orders;
--   alter table public.orders add primary key (id);
--   alter table public.orders add constraint orders_invoice_number_key unique (invoice_number);
--   -- recreate the indexes, policies, grants, triggers and the view from
--   --   this file's own text;
--   drop table public.orders_invoice_numbers;
--   drop function public.orders_ensure_partitions(integer, date);
--   drop function public.fn_sync_order_partition_key();
--   drop function public.fn_orders_sync_invoice_number();
--   drop function public.fn_orders_block_truncate();

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The invoice-number registry: global uniqueness the parent can no longer
--    carry. Server-only: RLS on, no policies, client roles revoked.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.orders_invoice_numbers (
  invoice_number text PRIMARY KEY,
  order_id       uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders_invoice_numbers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orders_invoice_numbers FROM anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Functions. All idempotent (CREATE OR REPLACE), all SECURITY DEFINER with
--    an empty search_path and fully qualified references, EXECUTE revoked
--    from client roles below in section 5.
-- ────────────────────────────────────────────────────────────────────────────

-- Creates every missing monthly partition from p_from (default: the current
-- UTC month) through current UTC month + p_months_ahead. Returns how many
-- partitions it created. Safe to call any number of times.
CREATE OR REPLACE FUNCTION public.orders_ensure_partitions(
  p_months_ahead integer DEFAULT 12,
  p_from         date    DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_month   date;
  v_last    date;
  v_name    text;
  v_from_ts timestamptz;
  v_to_ts   timestamptz;
  v_created integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_partitioned_table
    WHERE partrelid = 'public.orders'::regclass
  ) THEN
    RAISE NOTICE 'orders_ensure_partitions: public.orders is not partitioned, nothing to do';
    RETURN 0;
  END IF;

  IF p_months_ahead < 0 THEN
    RAISE EXCEPTION 'orders_ensure_partitions: p_months_ahead must be >= 0, got %', p_months_ahead;
  END IF;

  v_month := COALESCE(
    date_trunc('month', p_from)::date,
    date_trunc('month', now() AT TIME ZONE 'utc')::date
  );
  v_last := (date_trunc('month', now() AT TIME ZONE 'utc')
             + make_interval(months => p_months_ahead))::date;

  WHILE v_month <= v_last LOOP
    v_name := 'orders_p' || to_char(v_month, 'YYYY_MM');
    IF to_regclass('public.' || quote_ident(v_name)) IS NULL THEN
      -- UTC month boundaries, spelled with an explicit offset so the bound
      -- does not depend on the session TimeZone at DDL time.
      v_from_ts := v_month::timestamp AT TIME ZONE 'utc';
      v_to_ts   := ((v_month + interval '1 month')::date)::timestamp AT TIME ZONE 'utc';
      EXECUTE format(
        'CREATE TABLE public.%I PARTITION OF public.orders FOR VALUES FROM (%L) TO (%L)',
        v_name, v_from_ts, v_to_ts
      );
      -- Supabase default privileges would expose the new partition through
      -- the data API as its own table. Close that door: no direct access,
      -- deny-all RLS. The parent's policies govern access through the parent.
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', v_name);
      v_created := v_created + 1;
    END IF;
    v_month := (v_month + interval '1 month')::date;
  END LOOP;

  RETURN v_created;
END
$fn$;

-- Generic partition-key filler for tables referencing orders.
-- TG_ARGV[0] = the uuid FK column, TG_ARGV[1] = its timestamptz twin.
-- Fills the twin from orders.created_at so application inserts that set only
-- the FK keep working. If the order does not exist the twin is left as given:
-- either the pair CHECK or the composite FK then raises, exactly as the old
-- single-column FK would have.
CREATE OR REPLACE FUNCTION public.fn_sync_order_partition_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_order   uuid;
  v_created timestamptz;
BEGIN
  v_order := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF v_order IS NULL THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[1], NULL));
    RETURN NEW;
  END IF;
  SELECT o.created_at INTO v_created FROM public.orders o WHERE o.id = v_order;
  IF v_created IS NOT NULL THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[1], v_created));
  END IF;
  RETURN NEW;
END
$fn$;

-- Keeps orders_invoice_numbers exactly in step with orders.invoice_number.
-- The registry PK is what enforces global uniqueness across partitions; a
-- duplicate insert raises 23505 here and aborts the write to orders.
-- Cross-partition moves surface as DELETE + INSERT row events, both handled.
CREATE OR REPLACE FUNCTION public.fn_orders_sync_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.orders_invoice_numbers
    WHERE invoice_number = OLD.invoice_number;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_number IS NOT DISTINCT FROM NEW.invoice_number THEN
      RETURN NEW;
    END IF;
    IF OLD.invoice_number IS NOT NULL THEN
      DELETE FROM public.orders_invoice_numbers
      WHERE invoice_number = OLD.invoice_number;
    END IF;
  END IF;

  IF NEW.invoice_number IS NOT NULL THEN
    INSERT INTO public.orders_invoice_numbers (invoice_number, order_id)
    VALUES (NEW.invoice_number, NEW.id);
  END IF;
  RETURN NEW;
END
$fn$;

-- TRUNCATE orders CASCADE would empty the referencing tables but not the
-- registry, leaving invoice numbers permanently reserved. Refuse it.
CREATE OR REPLACE FUNCTION public.fn_orders_block_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION
    'TRUNCATE on public.orders is blocked: it would strand public.orders_invoice_numbers. Delete rows instead.';
END
$fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The conversion itself. Runs once; a re-run is a NOTICE and a no-op.
--    apply_migration wraps the file in a single transaction, so a failure at
--    any line leaves production exactly as it was.
-- ────────────────────────────────────────────────────────────────────────────

DO $mig$
DECLARE
  r              record;
  v_min          date;
  v_count_before bigint;
  v_count_after  bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_partitioned_table
    WHERE partrelid = 'public.orders'::regclass
  ) THEN
    RAISE NOTICE '148: public.orders is already partitioned; conversion skipped';
    RETURN;
  END IF;

  LOCK TABLE public.orders IN ACCESS EXCLUSIVE MODE;
  SELECT count(*) INTO v_count_before FROM public.orders;

  -- 3.1 The one dependent view goes first; recreated verbatim in 3.9.
  DROP VIEW IF EXISTS public.v_admin_pending_queues;

  -- 3.2 Park the old table under a legacy name and free its index names
  -- (index names are schema-wide; constraint names are per-table and clash
  -- with nothing).
  ALTER TABLE public.orders RENAME TO orders_prepartition_legacy;
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'orders_prepartition_legacy'
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I',
                   r.indexname, 'legacy_' || r.indexname);
  END LOOP;

  -- 3.3 The partitioned parent, same shape: columns, defaults, generated
  -- agorot twins, CHECK constraints and comments all copied.
  CREATE TABLE public.orders (
    LIKE public.orders_prepartition_legacy
      INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING CONSTRAINTS INCLUDING COMMENTS
  ) PARTITION BY RANGE (created_at);

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id, created_at);

  ALTER TABLE public.orders
    ADD CONSTRAINT orders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_address_id_fkey
    FOREIGN KEY (address_id) REFERENCES public.user_addresses(id) ON DELETE SET NULL;

  -- 3.4 Indexes, verbatim from the old table (they become partitioned
  -- indexes and propagate to every partition, present and future).
  CREATE INDEX idx_orders_paid_at_paid ON public.orders (paid_at DESC)
    WHERE paid_at IS NOT NULL AND deleted_at IS NULL;
  CREATE INDEX idx_orders_user_status ON public.orders (user_id, status);
  CREATE INDEX idx_orders_created_at ON public.orders (created_at DESC);
  CREATE INDEX orders_created_at_idx ON public.orders (created_at);
  CREATE INDEX idx_orders_invoice_number ON public.orders (invoice_number);
  CREATE INDEX orders_user_id_idx ON public.orders (user_id);
  CREATE INDEX idx_orders_pending_expiry ON public.orders (expires_at)
    WHERE paid_at IS NULL;
  CREATE INDEX idx_orders_address_id ON public.orders (address_id);

  -- 3.5 Partitions: from the oldest existing row's month through +12.
  SELECT date_trunc('month', min(created_at) AT TIME ZONE 'utc')::date
    INTO v_min
    FROM public.orders_prepartition_legacy;
  PERFORM public.orders_ensure_partitions(
    12,
    COALESCE(v_min, date_trunc('month', now() AT TIME ZONE 'utc')::date)
  );

  -- 3.6 Triggers, before the copy so the INSERTs below backfill the invoice
  -- registry through the same code path production writes will use.
  CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  CREATE TRIGGER tg_orders_status_guard
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_orders_status_guard();
  CREATE TRIGGER trg_orders_notify_paid
    AFTER UPDATE OF paid_at ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_orders_notify_paid();
  CREATE TRIGGER trg_orders_sync_invoice_number
    AFTER INSERT OR DELETE OR UPDATE OF invoice_number ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.fn_orders_sync_invoice_number();
  CREATE TRIGGER trg_orders_block_truncate
    BEFORE TRUNCATE ON public.orders
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_orders_block_truncate();

  -- 3.7 Copy every row. The four agorot twins are GENERATED and excluded.
  INSERT INTO public.orders
    (id, user_id, status, subtotal_ils, discount_ils, cashback_applied_ils,
     total_ils, currency, cardcom_payment_id, invoice_number, address_id,
     affiliate_code, referral_code_used, accepted_terms_at, notes, deleted_at,
     created_at, updated_at, paid_at, expires_at, gift_recipient_name,
     gift_recipient_email, gift_message)
  SELECT
     id, user_id, status, subtotal_ils, discount_ils, cashback_applied_ils,
     total_ils, currency, cardcom_payment_id, invoice_number, address_id,
     affiliate_code, referral_code_used, accepted_terms_at, notes, deleted_at,
     created_at, updated_at, paid_at, expires_at, gift_recipient_name,
     gift_recipient_email, gift_message
  FROM public.orders_prepartition_legacy;

  SELECT count(*) INTO v_count_after FROM public.orders;
  IF v_count_after <> v_count_before THEN
    RAISE EXCEPTION '148: row count mismatch after copy: % before, % after',
      v_count_before, v_count_after;
  END IF;

  -- 3.8 RLS, policies and grants, verbatim from the old table.
  ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS orders_select_unified ON public.orders;
  CREATE POLICY orders_select_unified ON public.orders
    FOR SELECT TO authenticated
    USING (
      is_admin()
      OR (
        (deleted_at IS NULL
          AND status = ANY (ARRAY['paid'::order_status,
                                  'partially_fulfilled'::order_status,
                                  'fulfilled'::order_status])
          AND is_supplier_order(id))
        OR (is_support() AND deleted_at IS NULL)
        OR (user_id = (SELECT auth.uid()))
      )
    );

  DROP POLICY IF EXISTS orders_insert_unified ON public.orders;
  CREATE POLICY orders_insert_unified ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (is_admin());

  DROP POLICY IF EXISTS orders_update_unified ON public.orders;
  CREATE POLICY orders_update_unified ON public.orders
    FOR UPDATE TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

  DROP POLICY IF EXISTS orders_delete_unified ON public.orders;
  CREATE POLICY orders_delete_unified ON public.orders
    FOR DELETE TO authenticated
    USING (is_admin());

  GRANT SELECT ON public.orders TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.orders TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.orders TO service_role;

  -- 3.9 The sixteen inbound FKs, re-pointed as composite FKs with their
  -- original names and original ON DELETE behaviour. Each referencing table
  -- gains a trigger-filled created_at twin plus a pair CHECK closing the
  -- MATCH SIMPLE hole (a non-null FK with a null twin would otherwise skip
  -- FK validation entirely).
  FOR r IN
    SELECT * FROM (VALUES
      ('order_items',           'order_id',                'order_created_at',                'order_items_order_id_fkey',                     'CASCADE'),
      ('stock_reservations',    'order_id',                'order_created_at',                'stock_reservations_order_id_fkey',              'CASCADE'),
      ('payments',              'order_id',                'order_created_at',                'payments_order_id_fkey',                        'RESTRICT'),
      ('invoices',              'order_id',                'order_created_at',                'invoices_order_id_fkey',                        'RESTRICT'),
      ('refunds',               'order_id',                'order_created_at',                'refunds_order_id_fkey',                         'RESTRICT'),
      ('vouchers',              'order_id',                'order_created_at',                'vouchers_order_id_fkey',                        'RESTRICT'),
      ('escrow_holds',          'order_id',                'order_created_at',                'escrow_holds_order_id_fkey',                    'RESTRICT'),
      ('split_executions',      'order_id',                'order_created_at',                'split_executions_order_id_fkey',                'RESTRICT'),
      ('discount_redemptions',  'order_id',                'order_created_at',                'discount_redemptions_order_id_fkey',            'RESTRICT'),
      ('settlement_events',     'order_id',                'order_created_at',                'settlement_events_order_id_fkey',               'RESTRICT'),
      ('wallet_entries',        'order_id',                'order_created_at',                'wallet_entries_order_id_fkey',                  'SET NULL'),
      ('payment_events',        'order_id',                'order_created_at',                'payment_events_order_id_fkey',                  'SET NULL'),
      ('wallet_transactions',   'related_order_id',        'related_order_created_at',        'wallet_transactions_related_order_id_fkey',     'SET NULL'),
      ('referrals',             'referred_first_order_id', 'referred_first_order_created_at', 'referrals_referred_first_order_id_fkey',        'SET NULL'),
      ('abandoned_cart_nudges', 'recovered_order_id',      'recovered_order_created_at',      'abandoned_cart_nudges_recovered_order_id_fkey', 'SET NULL'),
      ('subscriptions',         'origin_order_id',         'origin_order_created_at',         'subscriptions_origin_order_id_fkey',            'SET NULL')
    ) AS t(tbl, fk_col, twin_col, fk_name, on_del)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
                   r.tbl, r.fk_name);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I timestamptz',
                   r.tbl, r.twin_col);
    EXECUTE format(
      'UPDATE public.%I t SET %I = o.created_at
         FROM public.orders o
        WHERE t.%I = o.id AND t.%I IS DISTINCT FROM o.created_at',
      r.tbl, r.twin_col, r.fk_col, r.twin_col);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK ((%I IS NULL) = (%I IS NULL))',
      r.tbl, r.tbl || '_' || r.fk_col || '_partition_pair_chk',
      r.fk_col, r.twin_col);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
                   'trg_' || r.tbl || '_' || r.fk_col || '_partition_key', r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.fn_sync_order_partition_key(%L, %L)',
      'trg_' || r.tbl || '_' || r.fk_col || '_partition_key',
      r.fk_col, r.tbl, r.fk_col, r.twin_col);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I
         FOREIGN KEY (%I, %I) REFERENCES public.orders (id, created_at)
         ON UPDATE CASCADE ON DELETE %s',
      r.tbl, r.fk_name, r.fk_col, r.twin_col, r.on_del);
  END LOOP;

  -- 3.10 The old table has nothing pointing at it any more.
  DROP TABLE public.orders_prepartition_legacy;

  -- 3.11 The view, verbatim, with its original option and grants.
  CREATE VIEW public.v_admin_pending_queues
  WITH (security_invoker = true) AS
   SELECT 'product_approvals'::text AS queue,
      count(*)::integer AS n,
      min(products.submitted_at) AS oldest_at,
      '3 days'::interval AS sla
     FROM products
    WHERE products.approval_status = 'pending'::product_approval_status
      AND products.deleted_at IS NULL
  UNION ALL
   SELECT 'stuck_payments'::text AS queue,
      count(*)::integer AS n,
      min(payments.created_at) AS oldest_at,
      '01:00:00'::interval AS sla
     FROM payments
    WHERE (payments.status = ANY (ARRAY['initiated'::payment_status,
                                        'redirected'::payment_status]))
      AND payments.created_at < (now() - '00:10:00'::interval)
  UNION ALL
   SELECT 'expired_pending_orders'::text AS queue,
      count(*)::integer AS n,
      min(orders.created_at) AS oldest_at,
      '1 day'::interval AS sla
     FROM orders
    WHERE orders.status = 'pending'::order_status
      AND orders.expires_at IS NOT NULL
      AND orders.expires_at < now()
      AND orders.deleted_at IS NULL
  UNION ALL
   SELECT 'affiliate_applications'::text AS queue,
      count(*)::integer AS n,
      min(affiliates.created_at) AS oldest_at,
      '3 days'::interval AS sla
     FROM affiliates
    WHERE affiliates.status = 'pending_review'::affiliate_status
      AND affiliates.deleted_at IS NULL;

  GRANT SELECT ON public.v_admin_pending_queues TO anon;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.v_admin_pending_queues TO authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
    ON public.v_admin_pending_queues TO service_role;

  RAISE NOTICE '148: conversion done, % rows carried over', v_count_after;
END
$mig$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Top-up now, then keep twelve months of runway daily at 03:17 UTC.
--    cron.schedule upserts by job name, so re-running is safe.
-- ────────────────────────────────────────────────────────────────────────────

SELECT public.orders_ensure_partitions(12);

SELECT cron.schedule(
  'orders-ensure-partitions',
  '17 3 * * *',
  $cron$SELECT public.orders_ensure_partitions(12)$cron$
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Function hygiene: SECURITY DEFINER functions are not callable by client
--    roles (matches 143/145). Triggers still fire; EXECUTE is checked at
--    trigger creation, not per row.
-- ────────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.orders_ensure_partitions(integer, date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_order_partition_key()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_orders_sync_invoice_number()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_orders_block_truncate()
  FROM PUBLIC, anon, authenticated;
