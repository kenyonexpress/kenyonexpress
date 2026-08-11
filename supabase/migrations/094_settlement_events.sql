-- 094_settlement_events.sql
--
-- APPLIED TO PRODUCTION 2026-07-31 through apply_migration. Additive only, safe
-- to re-run. Self-tested there in a rolled-back DO block: insert succeeds,
-- UPDATE refused, DELETE refused, no row left behind.
--
-- An append-only journal of what each order line was worth to each party at the
-- moment money moved, and under which split.
--
-- WHY THIS EXISTS WHEN order_items ALREADY SNAPSHOTS THE SPLIT
--
-- `order_items` carries platform_percent and supplier_split_percent as agreed
-- at purchase (070, and buildOrderItemSnapshot refuses to write a line without
-- them rather than defaulting to 100/0). That answers "what was agreed". It
-- does not answer "what happened, when, and in what order", and those are
-- different questions the moment anything goes wrong:
--
--   * A coupon line is charged once and redeemed later, possibly months later,
--     possibly never. The order row is one row; the money has at least two
--     moments.
--   * A refund reverses part of a line. `order_items` ends up describing the
--     final state, and nothing describes the sequence that produced it.
--   * Reconciliation compares what a terminal settled against what we believe
--     we took. That comparison needs events with timestamps, not totals.
--
-- So this table records events, and each event carries its own copy of the
-- percent it was computed under. A row here is never recomputed from the
-- product: `platform_percent_snapshot` is what the line's split was at the
-- instant of the event, so an admin editing a product tomorrow cannot rewrite
-- what a customer was charged today. That is the same rule 070 established for
-- order_items, applied per event instead of per line.
--
-- APPEND ONLY. No UPDATE and no DELETE policy, and a trigger refuses both even
-- for the service role. A journal that can be edited is not a journal, and this
-- one exists precisely to be believed when the other tables disagree.
--
-- MONEY IS INTEGER AGOROT throughout, like every money column since 059.

CREATE TABLE IF NOT EXISTS public.settlement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE RESTRICT,
  order_item_id uuid REFERENCES public.order_items (id) ON DELETE RESTRICT,
  -- Which supplier the event concerns. Nullable because a platform-only event
  -- (a discount code we funded) belongs to no supplier.
  supplier_id uuid REFERENCES public.suppliers (id) ON DELETE RESTRICT,

  kind text NOT NULL,

  -- What the customer paid on site for this line, in agorot.
  paid_on_site_agorot bigint NOT NULL DEFAULT 0,
  -- The platform's gross take before anything it funded itself.
  commission_agorot bigint NOT NULL DEFAULT 0,
  -- Owed to the supplier out of the on-site charge.
  supplier_due_agorot bigint NOT NULL DEFAULT 0,
  -- A discount code, funded by the platform. Never reduces supplier_due.
  discount_agorot bigint NOT NULL DEFAULT 0,

  -- THE SNAPSHOT. The split this event was computed under, not the split the
  -- product carries now.
  platform_percent_snapshot numeric(5, 2),
  supplier_split_percent_snapshot numeric(5, 2),

  -- Free-form detail: the payment id, the voucher code, the terminal, whatever
  -- the event's kind makes meaningful.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Replay guard. The webhook, the cron sweep and a manual admin action can all
  -- try to record the same event; only one row may exist for a given key.
  idempotency_key text UNIQUE,

  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.settlement_events
    ADD CONSTRAINT settlement_events_kind_known CHECK (
      kind IN (
        'charge_settled',      -- the card cleared; the line's split is now real
        'voucher_redeemed',    -- a coupon unit was scanned at the business
        'voucher_expired',     -- a coupon unit expired unredeemed
        'refund_issued',       -- part or all of a line was reversed
        'discount_funded',     -- the platform paid for a cart discount code
        'payout_settled'       -- the supplier was actually paid
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.settlement_events
    ADD CONSTRAINT settlement_events_amounts_non_negative CHECK (
      paid_on_site_agorot >= 0
      AND commission_agorot >= 0
      AND supplier_due_agorot >= 0
      AND discount_agorot >= 0
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.settlement_events
    ADD CONSTRAINT settlement_events_percent_range CHECK (
      (platform_percent_snapshot IS NULL
        OR (platform_percent_snapshot >= 0 AND platform_percent_snapshot <= 100))
      AND (supplier_split_percent_snapshot IS NULL
        OR (supplier_split_percent_snapshot >= 0 AND supplier_split_percent_snapshot <= 100))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The pair must add to 100 when both are present, for the same reason
-- products_split_pair_sums_to_100 exists on products: a pair that does not sum
-- is two unrelated numbers wearing the name of a split.
DO $$ BEGIN
  ALTER TABLE public.settlement_events
    ADD CONSTRAINT settlement_events_split_pair_sums_to_100 CHECK (
      platform_percent_snapshot IS NULL
      OR supplier_split_percent_snapshot IS NULL
      OR (platform_percent_snapshot + supplier_split_percent_snapshot) = 100
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS settlement_events_order_idx
  ON public.settlement_events (order_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS settlement_events_item_idx
  ON public.settlement_events (order_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS settlement_events_supplier_idx
  ON public.settlement_events (supplier_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS settlement_events_kind_idx
  ON public.settlement_events (kind, occurred_at DESC);

-- Append only, enforced in the database and not only by convention.
CREATE OR REPLACE FUNCTION public.settlement_events_no_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'settlement_events is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS settlement_events_no_update ON public.settlement_events;
CREATE TRIGGER settlement_events_no_update
  BEFORE UPDATE OR DELETE ON public.settlement_events
  FOR EACH ROW EXECUTE FUNCTION public.settlement_events_no_rewrite();

ALTER TABLE public.settlement_events ENABLE ROW LEVEL SECURITY;

-- Deliberately NO policy for `authenticated`. This is an internal money
-- journal; it is read by staff tooling over the service role, which bypasses
-- RLS, and by nobody else. RLS on with zero policies is deny-all, which is the
-- correct posture here and matches cardcom_accounts and idempotency_keys.

COMMENT ON TABLE public.settlement_events IS
  'Append-only journal of money events per order line. Each row carries the split percent it was computed under, so an edit to a product cannot rewrite history.';
COMMENT ON COLUMN public.settlement_events.platform_percent_snapshot IS
  'products.platform_percent as it stood at the moment of the event. Never recomputed.';
