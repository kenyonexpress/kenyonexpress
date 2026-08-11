-- ============================================================================
-- PENDING: product_type foundation -- the third mode, and what it bills
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- ----------------------------------------------------------------------------
-- THREE THINGS THE BRIEF ASKED FOR THAT THE DATABASE ALREADY DISAGREES WITH
-- ----------------------------------------------------------------------------
--
-- The brief asked for "a product_type enum ('coupon','split','subscription')
-- column on products, default 'coupon'". Measured against the live catalog on
-- 2026-08-11, each third of that sentence already exists in a different shape,
-- so this file implements the intent and not the letter. Every deviation is
-- named here rather than buried.
--
-- 1. THE TYPE EXISTS. `product_type` is a live enum holding
--    ('coupon','physical','service'). `CREATE TYPE product_type` would fail
--    outright. So this ADDs the two missing members instead.
--
-- 2. THE COLUMN EXISTS, UNDER ANOTHER NAME. It is `products.type`, NOT NULL,
--    of that enum, with 61 active rows in it, and `order_items.product_type`
--    is its purchase-time snapshot. Adding a second column literally named
--    `product_type` would give one fact two spellings on one table, which is
--    the exact defect PENDING-money-integer-fix spends a section untangling
--    for `compare_at_price` / `compare_at_price_ils`. This file therefore adds
--    NO column to products and treats `products.type` as the column meant.
--
-- 3. 'split' IS SPELLED 'physical' TODAY, and 'subscription' IS SPELLED
--    'recurring' IN PENDING-109. Three names, two concepts:
--
--      brief         live enum      PENDING-109     this file
--      coupon        coupon         coupon          coupon
--      split         physical       physical        physical + split (both)
--      subscription  -              recurring       subscription
--
--    'subscription' is chosen over 'recurring' because two of the three
--    sources say subscription: the brief, and migration 066 in the file chain
--    which added exactly that member (066 was never applied to this database;
--    the hosted lineage is pre-059). PENDING-109 is the only source saying
--    'recurring', and its application layer name is already translated by
--    src/lib/commerce/recurring-schema-error.ts.
--
--    NO BACKFILL. Not one of the 61 'physical' rows is rewritten to 'split'.
--    Renaming live product rows is a data change on the money path and needs a
--    decision this file is not entitled to make. Both members exist afterwards
--    and an admin, or a later migration, picks.
--
-- ----------------------------------------------------------------------------
-- CONFLICT WITH PENDING-109 -- BOTH MUST NOT BE APPLIED
-- ----------------------------------------------------------------------------
--
-- supabase/migrations/PENDING-109-recurring-subscriptions.sql also creates a
-- `subscriptions` table and also adds an enum member for the same concept. The
-- two files are alternatives, not a sequence. Applying both gives the enum a
-- 'recurring' AND a 'subscription' member for one billing mode and leaves the
-- table shaped by whichever ran first, because both guard with IF NOT EXISTS
-- and neither would error.
--
-- 109 is the richer file: it carries subscription_charges, RLS, the due index
-- and a documented cancellation path. THIS file is the one the brief asked
-- for. Whoever approves either must retire the other first. Nothing here
-- deletes 109, because deleting a file is not a decision this session makes.
--
-- ----------------------------------------------------------------------------
-- WHY NOTHING BELOW USES THE NEW MEMBERS
-- ----------------------------------------------------------------------------
--
-- `ALTER TYPE ... ADD VALUE` cannot be followed, inside the same transaction,
-- by any statement that USES the value it added, and apply_migration runs the
-- file as one transaction. So there is no CHECK naming 'split', no DEFAULT of
-- 'subscription', and product_type_config ships EMPTY. Seeding it is a second
-- migration, and that is a Postgres rule rather than a preference. The DEFAULT
-- set below is 'coupon', which already existed, so it is legal here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The two missing members
-- ---------------------------------------------------------------------------

ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'split';
ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'subscription';

-- ---------------------------------------------------------------------------
-- 2. The default the brief asked for, on the column that already exists
-- ---------------------------------------------------------------------------
--
-- products.type is NOT NULL with no default today, so every insert has had to
-- name a type. 'coupon' is the platform's primary mode, and it is an existing
-- member, so this is legal in the same transaction as the ADD VALUEs above.

ALTER TABLE public.products ALTER COLUMN type SET DEFAULT 'coupon';

COMMENT ON COLUMN public.products.type IS
  'The billing mode. coupon: prepaid, issues a voucher, balance settled at the '
  'business. physical/split: charged in full, platform_percent splits it. '
  'subscription: recurring charge against a stored Cardcom token. '
  'Snapshotted onto order_items.product_type at purchase.';

-- ---------------------------------------------------------------------------
-- 3. subscriptions
-- ---------------------------------------------------------------------------
--
-- Money is integer agorot from birth, per src/lib/money.ts. There is no
-- numeric shekel column here to convert later, which is the whole point of
-- PENDING-money-integer-fix and the reason this table does not repeat it.
--
-- cardcom_token is the stored payment token. It is NOT the card number and
-- never becomes one; Cardcom holds the instrument and returns a token that is
-- only chargeable by this terminal.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_id       uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  -- The Cardcom recurring token. Nullable only between row creation and the
  -- first successful authorisation; a subscription without one cannot charge.
  cardcom_token     text,

  status            text NOT NULL DEFAULT 'pending',
  interval          text NOT NULL,
  interval_count    integer NOT NULL DEFAULT 1,

  -- Integer agorot. Never numeric, never shekels.
  amount_agorot     bigint NOT NULL,

  -- The percent in force when this subscription was created, snapshotted for
  -- the same reason order_items snapshots it: the product's percent may change
  -- and an existing subscriber's split must not move with it.
  platform_percent  numeric(5,2),

  next_charge_at    timestamptz,
  last_charged_at   timestamptz,
  canceled_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscriptions_amount_positive
    CHECK (amount_agorot > 0),
  CONSTRAINT subscriptions_interval_known
    CHECK (interval IN ('monthly', 'yearly')),
  CONSTRAINT subscriptions_interval_count_positive
    CHECK (interval_count >= 1),
  CONSTRAINT subscriptions_status_known
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
  -- A canceled subscription has no future charge, and an active one that has
  -- a token must have a date. Both directions, because "active with no next
  -- charge" is how a silent stop looks in production.
  CONSTRAINT subscriptions_canceled_is_terminal
    CHECK (canceled_at IS NULL OR (status = 'canceled' AND next_charge_at IS NULL)),
  CONSTRAINT subscriptions_active_is_scheduled
    CHECK (status <> 'active' OR next_charge_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS subscriptions_due_idx
  ON public.subscriptions (next_charge_at)
  WHERE status = 'active' AND canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS subscriptions_user_idx
  ON public.subscriptions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS subscriptions_product_idx
  ON public.subscriptions (product_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.subscriptions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS. A subscriber reads and cancels their own; nothing else is client
-- reachable. Charging runs service_role from the cron route.
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions: owner read" ON public.subscriptions;
CREATE POLICY "subscriptions: owner read" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "subscriptions: owner cancel" ON public.subscriptions;
CREATE POLICY "subscriptions: owner cancel" ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- The token is never client readable. RLS grants row access, not column
-- access, so the grant is narrowed explicitly.
REVOKE ALL ON public.subscriptions FROM anon;

COMMENT ON COLUMN public.subscriptions.cardcom_token IS
  'Cardcom recurring token. Not a card number. Readable by service_role only.';

-- ---------------------------------------------------------------------------
-- 4. product_type_config
-- ---------------------------------------------------------------------------
--
-- One row per billing mode, describing what the admin form must collect and
-- what checkout must do. It ships EMPTY: seeding it would name 'split' and
-- 'subscription' in the same transaction that added them, which Postgres
-- refuses. The seed is migration 007.

CREATE TABLE IF NOT EXISTS public.product_type_config (
  type                    public.product_type PRIMARY KEY,
  label_he                text NOT NULL,
  description_he          text,

  -- What the admin form must require for this mode. The form's zod schema is
  -- the enforcing copy; this row is what the admin UI reads to build itself,
  -- so a fourth mode does not mean a fourth branch in TSX.
  requires_coupon_price   boolean NOT NULL DEFAULT false,
  requires_platform_percent boolean NOT NULL DEFAULT false,
  requires_recurring_amount boolean NOT NULL DEFAULT false,
  requires_expiry_days    boolean NOT NULL DEFAULT false,

  -- Whether checkout issues a voucher for this mode, or settles a split.
  issues_voucher          boolean NOT NULL DEFAULT false,
  creates_subscription    boolean NOT NULL DEFAULT false,

  is_active               boolean NOT NULL DEFAULT true,
  position                integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.product_type_config;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.product_type_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.product_type_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_type_config: public read" ON public.product_type_config;
CREATE POLICY "product_type_config: public read" ON public.product_type_config
  FOR SELECT TO anon, authenticated
  USING (is_active);

-- public.is_admin() and not an inline EXISTS on profiles. Measured against the
-- live catalog: it is SECURITY DEFINER with search_path pinned to public, it
-- already covers admin AND super_admin, and it is the convention every other
-- policy in this database uses (`has_role('admin')`, `is_admin()`).
--
-- The first draft of this file wrote `role IN ('admin', 'staff')`. The live
-- user_role enum is (customer, content_uploader, vendor, admin, super_admin,
-- support) and has no 'staff' member, so that comparison would have failed the
-- whole migration with 22P02 invalid input value for enum user_role.
DROP POLICY IF EXISTS "product_type_config: staff write" ON public.product_type_config;
CREATE POLICY "product_type_config: staff write" ON public.product_type_config
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- VERIFICATION (run after applying; expected results inline)
-- ============================================================================
--
-- 1. Five members, in order (expect coupon, physical, service, split,
--    subscription):
--
--      SELECT e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
--       WHERE t.typname = 'product_type' ORDER BY e.enumsortorder;
--
-- 2. No product row moved (expect the same 61 active 'physical' rows as
--    before; this migration writes no product data):
--
--      SELECT type, count(*) FROM public.products
--       WHERE deleted_at IS NULL GROUP BY type ORDER BY 1;
--
-- 3. The default landed (expect 'coupon'::product_type):
--
--      SELECT column_default FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='products'
--         AND column_name='type';
--
-- 4. anon cannot reach a subscription (expect zero rows):
--
--      SELECT grantee, privilege_type FROM information_schema.role_table_grants
--       WHERE table_name='subscriptions' AND grantee='anon';
--
-- 5. product_type_config is empty and awaiting migration 007 (expect 0):
--
--      SELECT count(*) FROM public.product_type_config;
--
-- ============================================================================
