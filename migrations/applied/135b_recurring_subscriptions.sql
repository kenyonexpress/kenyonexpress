-- ROLLBACK: drop table subscription_charges, then subscriptions; see file body for columns added to products.
-- 135b: the recurring subscription tables and columns.
--
-- SPLIT FROM 135. The `ALTER TYPE ... ADD VALUE` that was here now lives in
-- `135a_product_type_recurring.sql`, matching the two rows production actually
-- recorded: `135a_product_type_recurring` and `135b_recurring_subscriptions`.
--
-- NOTHING BELOW MAY REFERENCE THE 'recurring' LABEL. Not in a CHECK, a DEFAULT,
-- an INSERT or a cast. That was true when the two halves shared a transaction
-- and it stays true as a matter of style now that they do not, because the
-- whole point of the split is that a reader should not have to hold that rule
-- in their head.

-- ============================================================================
-- PENDING: the recurring product type and the subscriptions it creates
-- ============================================================================
--
-- STATUS: NOT APPLIED. Awaiting Ofir's explicit approval.
-- Apply ONLY through MCP apply_migration, never db push. The filename
-- deliberately breaks the NNN_ prefix convention so no tooling picks it up as
-- part of the ordered chain, matching 142_money_integer_fix_in_place.sql.
--
-- MEASURED AGAINST PRODUCTION 2026-08-07, BEFORE A LINE WAS WRITTEN
--
--   select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
--   where t.typname = 'product_type';
--     -> coupon, physical, service.   'recurring' does NOT exist.
--
--   information_schema.tables, public schema:
--     -> 'subscriptions' does NOT exist. 'subscription_charges' does NOT exist.
--     -> 'payment_tokens' DOES exist, and already holds cardcom_token,
--        last_4, card_brand, expiry_month, expiry_year, profile_id.
--
--   information_schema.columns, products:
--     -> no column matching %recur%, %billing% or %interval%.
--
-- Everything below is therefore additive. Nothing is altered, nothing is
-- dropped, and re-running the file is a no-op.
--
-- ============================================================================
-- WHY THE PRODUCT AMOUNT IS agorot AND NOT numeric ILS
-- ============================================================================
--
-- Every existing money column on `products` is numeric ILS (kenyon_price,
-- price_ils, coupon_price_ils), and all 41 of them are queued for conversion
-- in 142_money_integer_fix_in_place.sql. A new numeric ILS column here would be the
-- 42nd, added on the same day the project rule says money is integer agorot.
--
-- So `recurring_amount_agorot` is integer agorot from birth. It costs one
-- conversion at the form boundary - which src/lib/commerce/money.ts already
-- does for every other amount - and it means the recurring path is the one
-- money path in this schema that never needed the pending fix at all.
--
-- The same reasoning applies to subscriptions.amount_agorot and to every
-- amount on subscription_charges.
--
--
-- Before PostgreSQL 12, ALTER TYPE ... ADD VALUE could not run in a transaction
-- block at all. This database is PostgreSQL 17.6, where it can. The remaining
-- restriction is that the new label cannot be USED in the same transaction that
-- added it - so nothing below references 'recurring' in a CHECK, a DEFAULT, an
-- INSERT or a cast. Verified by reading, not assumed: the only mention of the
-- literal in this file is the ADD VALUE itself and this comment.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Defensive: 001 is not idempotent and may have stopped early on a live DB.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. The third product type
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 2. What a recurring product costs, and how often
-- ---------------------------------------------------------------------------
--
-- All three are nullable with no default. A recurring product without an amount
-- is not "free", it is unconfigured, and the publish gate in
-- src/lib/commerce/product-money.ts refuses to activate it. A DEFAULT here
-- would be exactly the invented number CONTRADICTIONS C1 forbids.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS recurring_amount_agorot integer,
  ADD COLUMN IF NOT EXISTS billing_interval text,
  ADD COLUMN IF NOT EXISTS billing_interval_count integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_recurring_amount_positive'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_recurring_amount_positive
      CHECK (recurring_amount_agorot IS NULL OR recurring_amount_agorot > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_billing_interval_known'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_billing_interval_known
      CHECK (billing_interval IS NULL OR billing_interval IN ('monthly', 'yearly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_billing_interval_count_positive'
  ) THEN
    ALTER TABLE public.products ADD CONSTRAINT products_billing_interval_count_positive
      CHECK (billing_interval_count IS NULL OR billing_interval_count >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.products.recurring_amount_agorot IS
  'What one billing cycle charges, integer agorot. NULL until configured; a '
  'recurring product cannot be published without it. Never numeric ILS.';
COMMENT ON COLUMN public.products.billing_interval IS
  'monthly | yearly. Multiplied by billing_interval_count, so quarterly is '
  'monthly x 3 and stays anchored to the day of month rather than drifting '
  'the way "every 90 days" does.';

-- ---------------------------------------------------------------------------
-- 3. The subscriptions themselves
-- ---------------------------------------------------------------------------
--
-- platform_percent is SNAPSHOT here, not read from the product at charge time.
-- This is the same rule order_items already follows: changing a product's
-- commission must not retroactively change what a supplier is owed on a
-- subscription sold months ago under a different agreement. A subscription is
-- the longest-lived object in this system - it can bill for years - so it is
-- the place where reading the live percent would do the most damage.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id             uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_id            uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- The order that opened the subscription. Kept for support and for the first
  -- receipt; later cycles create their own payments, not orders.
  origin_order_id        uuid REFERENCES public.orders(id) ON DELETE SET NULL,

  status                 text NOT NULL DEFAULT 'active',

  -- Money. Integer agorot, all three, always.
  amount_agorot          integer NOT NULL CHECK (amount_agorot > 0),
  platform_percent       numeric(5,2) NOT NULL CHECK (platform_percent >= 0 AND platform_percent <= 100),

  billing_interval       text NOT NULL,
  billing_interval_count integer NOT NULL DEFAULT 1 CHECK (billing_interval_count >= 1),

  -- The card. ON DELETE RESTRICT: deleting a token that an active subscription
  -- bills against would leave a subscription that can never charge and never
  -- says why. The account page must cancel the subscription first.
  payment_token_id       uuid REFERENCES public.payment_tokens(id) ON DELETE RESTRICT,

  next_charge_at         timestamptz,
  last_charge_at         timestamptz,
  failed_attempts        integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  canceled_at            timestamptz,
  cancel_reason          text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscriptions_status_known
    CHECK (status IN ('active', 'past_due', 'paused', 'canceled')),
  CONSTRAINT subscriptions_interval_known
    CHECK (billing_interval IN ('monthly', 'yearly')),
  -- A cancelled subscription has a cancellation date and no future charge.
  -- Enforced here because the cron trusts next_charge_at, and a cancelled row
  -- that kept a date would be billed by any code path that forgot to also
  -- check the status.
  CONSTRAINT subscriptions_canceled_is_terminal
    CHECK (status <> 'canceled' OR (canceled_at IS NOT NULL AND next_charge_at IS NULL))
);

DROP TRIGGER IF EXISTS set_updated_at ON public.subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The cron's only query: rows that are due. Partial, because cancelled rows are
-- the majority in the long run and never appear in it.
CREATE INDEX IF NOT EXISTS subscriptions_due_idx
  ON public.subscriptions (next_charge_at)
  WHERE status IN ('active', 'past_due') AND next_charge_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_supplier_idx ON public.subscriptions (supplier_id);
CREATE INDEX IF NOT EXISTS subscriptions_product_idx ON public.subscriptions (product_id);

COMMENT ON COLUMN public.subscriptions.platform_percent IS
  'Snapshot of the agreement at signup. NEVER re-read from products at charge '
  'time: a subscription can bill for years and must not silently re-price.';

-- ---------------------------------------------------------------------------
-- 4. One row per charge attempt, and the uniqueness that prevents double billing
-- ---------------------------------------------------------------------------
--
-- `period_key` is the cycle this attempt is FOR, not the moment it ran. Two
-- cron runs that overlap - a retry, a manual trigger, a Vercel duplicate
-- delivery - produce the same key and the second INSERT loses to the unique
-- index. That is the whole double-charge defence, and it lives in the database
-- rather than in the cron, because a uniqueness rule enforced in application
-- code is enforced only as long as there is exactly one caller.

CREATE TABLE IF NOT EXISTS public.subscription_charges (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id        uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  -- The cycle being paid for, normalised to the second, e.g. 2026-03-01T00:00:00Z.
  period_key             timestamptz NOT NULL,

  status                 text NOT NULL,
  amount_agorot          integer NOT NULL CHECK (amount_agorot > 0),
  platform_fee_agorot    integer NOT NULL CHECK (platform_fee_agorot >= 0),
  supplier_due_agorot    integer NOT NULL CHECK (supplier_due_agorot >= 0),

  cardcom_transaction_id text,
  failure_code           text,
  failure_message        text,

  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT subscription_charges_status_known
    CHECK (status IN ('succeeded', 'failed')),
  -- The residual rule, enforced by the database and not only by money.ts: the
  -- two halves are exactly the charge. An independent second multiplication
  -- would fail this on the line totals where it rounds the other way.
  CONSTRAINT subscription_charges_split_is_exact
    CHECK (platform_fee_agorot + supplier_due_agorot = amount_agorot)
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_charges_one_per_cycle
  ON public.subscription_charges (subscription_id, period_key)
  WHERE status = 'succeeded';

CREATE INDEX IF NOT EXISTS subscription_charges_subscription_idx
  ON public.subscription_charges (subscription_id, created_at DESC);

COMMENT ON INDEX public.subscription_charges_one_per_cycle IS
  'Partial on succeeded: a cycle may be ATTEMPTED many times (three, per '
  'MAX_CHARGE_ATTEMPTS) but may only SUCCEED once. A plain unique index would '
  'make the second retry of a declined card fail as a duplicate.';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
--
-- A customer reads and cancels their own. They never INSERT: a subscription is
-- created by the checkout path under the service role, because its amount and
-- platform_percent are snapshots the customer must not be able to choose.
--
-- The UPDATE policy's WITH CHECK deliberately does not constrain WHICH columns
-- change, because Postgres RLS cannot express that. The column-level guard is
-- the server action, which writes status/canceled_at/next_charge_at and nothing
-- else. This is stated so the next reader does not mistake the policy for a
-- stronger guarantee than it is.

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_owner_read ON public.subscriptions;
CREATE POLICY subscriptions_owner_read ON public.subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin() OR public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS subscriptions_owner_update ON public.subscriptions;
CREATE POLICY subscriptions_owner_update ON public.subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

ALTER TABLE public.subscription_charges ENABLE ROW LEVEL SECURITY;

-- Read-only to everyone who is not the service role. A charge row is an
-- accounting record; nobody edits one after the fact, including an admin.
DROP POLICY IF EXISTS subscription_charges_owner_read ON public.subscription_charges;
CREATE POLICY subscription_charges_owner_read ON public.subscription_charges
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = subscription_charges.subscription_id
        AND (s.user_id = auth.uid() OR public.is_admin() OR public.is_supplier_member(s.supplier_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. What this file does NOT do
-- ---------------------------------------------------------------------------
--
--  * No backfill. No existing product becomes recurring; every one of them
--    keeps the type it has.
--  * No seed subscription, and no seed price. The type is inert until an admin
--    configures a product with it.
--  * No change to any existing column, constraint, policy or index.
--  * No wallet involvement. Cancellation is not a refund (see
--    cancellationNotice in src/lib/commerce/recurring.ts), so this path never
--    touches the numeric-shekel wallet columns that 142
--    is blocked on.
