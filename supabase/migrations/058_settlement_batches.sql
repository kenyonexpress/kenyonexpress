-- ============================================================================
-- 058_settlement_batches.sql  (spec number 037; renumbered 033->050 ...
-- 039->056 because 033-035 already exist in this tree and 049 was the last
-- used number; see LEDGER-DESIGN.md section 0)
--
-- Per-supplier settlement for the no-escrow model (locked decision 4d929db):
-- physical items are charged 100% on site, the supplier share becomes a
-- supplier_payable liability, and periodic settlement batches pay it out.
-- Coupon items never appear here: the platform holds no supplier money for
-- coupons (the balance is collected at the business).
--
-- SNAPSHOT RULE (locked): platform_bp on settlement_items is copied
-- EXCLUSIVELY from order_items (the purchase-time snapshot). Settlement never
-- reads products.* for percentages; fn_build_settlement_batch below contains
-- no join to products, and trg_order_items_snapshot_lock freezes the
-- order_items snapshot columns once the order is paid.
--
-- ROLLBACK NOTE: additive only. To roll back:
--   DROP TRIGGER IF EXISTS trg_order_items_snapshot_lock ON public.order_items;
--   DROP FUNCTION IF EXISTS public.fn_order_items_snapshot_lock();
--   DROP FUNCTION IF EXISTS public.fn_build_settlement_batch(uuid, date, date);
--   DROP TABLE IF EXISTS public.settlement_items;
--   DROP TABLE IF EXISTS public.settlement_batches;
--   DROP TYPE IF EXISTS public.settlement_batch_status;
-- ============================================================================

-- Defensive: 001 may stop early on live DBs.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Enum --------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.settlement_batch_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'paid',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. settlement_batches ------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.settlement_batches (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id             uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start            date NOT NULL,
  period_end              date NOT NULL,
  status                  public.settlement_batch_status NOT NULL DEFAULT 'draft',
  gross_agorot            bigint NOT NULL DEFAULT 0 CHECK (gross_agorot >= 0),
  commission_agorot       bigint NOT NULL DEFAULT 0 CHECK (commission_agorot >= 0),
  -- Informational: VAT portion inside commission_agorot (17% extraction).
  vat_on_commission_agorot bigint NOT NULL DEFAULT 0 CHECK (vat_on_commission_agorot >= 0),
  net_due_agorot          bigint NOT NULL DEFAULT 0 CHECK (net_due_agorot >= 0),
  item_count              integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  -- The physical_settled journal posted when the batch is paid.
  ledger_journal_id       uuid REFERENCES public.ledger_journals(id) ON DELETE SET NULL,
  approved_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at             timestamptz,
  paid_at                 timestamptz,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_batches_period CHECK (period_end >= period_start),
  CONSTRAINT settlement_batches_conservation CHECK (net_due_agorot = gross_agorot - commission_agorot),
  CONSTRAINT settlement_batches_supplier_period_key UNIQUE (supplier_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_settlement_batches_supplier ON public.settlement_batches (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_status ON public.settlement_batches (status, period_end DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.settlement_batches;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.settlement_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. settlement_items --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.settlement_items (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                uuid NOT NULL REFERENCES public.settlement_batches(id) ON DELETE CASCADE,
  -- UNIQUE: an order item can be settled at most once, across all batches.
  order_item_id           uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  order_id                uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  supplier_id             uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  -- Snapshot copied EXCLUSIVELY from order_items.platform_bp (never products).
  platform_bp             integer NOT NULL CHECK (platform_bp BETWEEN 0 AND 10000),
  gross_agorot            integer NOT NULL CHECK (gross_agorot >= 0),
  commission_agorot       integer NOT NULL CHECK (commission_agorot >= 0),
  vat_on_commission_agorot integer NOT NULL DEFAULT 0 CHECK (vat_on_commission_agorot >= 0),
  net_agorot              integer NOT NULL CHECK (net_agorot >= 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_items_conservation CHECK (gross_agorot = commission_agorot + net_agorot)
);

CREATE INDEX IF NOT EXISTS idx_settlement_items_batch ON public.settlement_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_settlement_items_supplier ON public.settlement_items (supplier_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.settlement_items;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.settlement_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Batch builder (service only) --------------------------------------------
-- Selects eligible physical order items of one supplier and snapshots their
-- money EXCLUSIVELY from order_items columns (051 units). No join to
-- products anywhere in this function, by design.
-- Eligibility: order paid, item physical, item delivered at least 14 days
-- before now (return window, R6), delivered inside the period, not cancelled
-- or refunded, not already settled (UNIQUE order_item_id).

CREATE OR REPLACE FUNCTION public.fn_build_settlement_batch(
  p_supplier_id uuid,
  p_period_start date,
  p_period_end date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_batch_id uuid;
  v_status public.settlement_batch_status;
BEGIN
  INSERT INTO public.settlement_batches (supplier_id, period_start, period_end)
  VALUES (p_supplier_id, p_period_start, p_period_end)
  ON CONFLICT ON CONSTRAINT settlement_batches_supplier_period_key DO NOTHING;

  SELECT id, status INTO v_batch_id, v_status
  FROM public.settlement_batches
  WHERE supplier_id = p_supplier_id
    AND period_start = p_period_start
    AND period_end = p_period_end;

  IF v_status <> 'draft'::public.settlement_batch_status THEN
    -- Locked batch: idempotent re-run returns it untouched.
    RETURN v_batch_id;
  END IF;

  INSERT INTO public.settlement_items
    (batch_id, order_item_id, order_id, supplier_id,
     platform_bp, gross_agorot, commission_agorot, vat_on_commission_agorot, net_agorot)
  SELECT
    v_batch_id,
    oi.id,
    oi.order_id,
    oi.supplier_id,
    COALESCE(oi.platform_bp, oi.commission_bp),
    t.gross,
    t.commission,
    -- ::numeric before multiplying keeps the math out of int4 overflow range.
    (t.commission - round(t.commission::numeric * 10000 / 11700))::integer,
    t.gross - t.commission
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(oi.total_price_agorot, oi.face_value_agorot,
               oi.unit_price_agorot * oi.quantity)::integer AS gross,
      COALESCE(
        oi.platform_fee_agorot,
        round(COALESCE(oi.total_price_agorot, oi.face_value_agorot,
                       oi.unit_price_agorot * oi.quantity)::numeric
              * COALESCE(oi.platform_bp, oi.commission_bp) / 10000)
      )::integer AS commission
  ) t
  WHERE oi.supplier_id = p_supplier_id
    AND oi.product_type = 'physical'::public.product_type
    AND o.paid_at IS NOT NULL
    AND oi.item_status = 'delivered'::public.order_item_status
    AND oi.fulfilled_at IS NOT NULL
    AND oi.fulfilled_at >= p_period_start
    AND oi.fulfilled_at < p_period_end + 1
    AND oi.fulfilled_at <= now() - interval '14 days'
    AND oi.deleted_at IS NULL
    AND COALESCE(oi.platform_bp, oi.commission_bp) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.settlement_items si WHERE si.order_item_id = oi.id);

  UPDATE public.settlement_batches b
  SET gross_agorot             = s.gross,
      commission_agorot        = s.commission,
      vat_on_commission_agorot = s.vat,
      net_due_agorot           = s.gross - s.commission,
      item_count               = s.cnt
  FROM (
    SELECT COALESCE(sum(gross_agorot), 0) AS gross,
           COALESCE(sum(commission_agorot), 0) AS commission,
           COALESCE(sum(vat_on_commission_agorot), 0) AS vat,
           count(*) AS cnt
    FROM public.settlement_items
    WHERE batch_id = v_batch_id
  ) s
  WHERE b.id = v_batch_id;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_build_settlement_batch(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_build_settlement_batch(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.fn_build_settlement_batch(uuid, date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_build_settlement_batch(uuid, date, date) TO service_role;

-- 5. Freeze order_items money snapshots after the order is paid --------------
-- Guarantees the settlement snapshot always equals the purchase snapshot
-- (INVARIANTS.md INV-3 checks both this trigger's existence and drift).

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'platform_bp'
  ) THEN
    CREATE OR REPLACE FUNCTION public.fn_order_items_snapshot_lock()
    RETURNS trigger
    LANGUAGE plpgsql AS $fn$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = OLD.order_id AND o.paid_at IS NOT NULL
      ) THEN
        IF NEW.platform_bp IS DISTINCT FROM OLD.platform_bp
           OR NEW.commission_bp IS DISTINCT FROM OLD.commission_bp
           OR NEW.upfront_bp IS DISTINCT FROM OLD.upfront_bp
           OR NEW.cashback_bp IS DISTINCT FROM OLD.cashback_bp THEN
          RAISE EXCEPTION 'order item % belongs to a paid order; percent snapshots are frozen', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_order_items_snapshot_lock ON public.order_items;
    CREATE TRIGGER trg_order_items_snapshot_lock
      BEFORE UPDATE ON public.order_items
      FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_snapshot_lock();
  END IF;
END $$;

-- 6. RLS: enabled now, default deny; policies land in 056 --------------------

ALTER TABLE public.settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_items ENABLE ROW LEVEL SECURITY;
