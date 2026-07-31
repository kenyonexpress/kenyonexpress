-- 096_discount_campaigns.sql
--
-- Site-wide discount codes, and the ledger that makes their limits real.
--
-- WHY A NEW TABLE AND NOT public.coupons
--
-- public.coupons is supplier-scoped: it carries vendor_id and product_id and it
-- predates the split-payment model. A marketing campaign is a different object
-- with a different owner and a different funding source. Overloading one table
-- with both would mean every query has to remember which kind of row it is
-- looking at, and the first time one forgets, a platform-funded campaign gets
-- charged to a supplier who never agreed to it.
--
-- WHOSE MONEY THIS IS
--
-- The discount comes out of the platform's commission and never the supplier's
-- share, exactly as 05a181a established. The supplier did not offer the code.
-- That rule is enforced in the pricing engine, not here, but it is why these
-- amounts are recorded separately from anything on order_items: a campaign is a
-- platform marketing cost, and it has to be reportable as one.
--
-- WHAT THIS FIXES THAT WAS BROKEN
--
-- 05a181a documented its own gap honestly: nothing ever incremented
-- coupons.used_count, so max_uses was enforced by reading a counter that no
-- code path advanced. A "limited to 100 uses" campaign was unlimited. That is
-- not fixable with an UPDATE somewhere, because two concurrent checkouts would
-- both read 99 and both write 100. It needs a ledger with a uniqueness
-- constraint and a claim that runs inside the charging transaction, which is
-- what discount_redemptions and fn_claim_discount are.

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
-- 1. Types
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.discount_kind AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. discount_campaigns
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.discount_campaigns (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stored already normalised: trimmed, spaces removed, uppercased. The client
  -- normalises the typed input the same way before lookup, so the comparison is
  -- an equality on an indexed column rather than an ILIKE that cannot use one.
  code               text NOT NULL,
  name               text NOT NULL,
  description        text,

  kind               public.discount_kind NOT NULL,

  -- Basis points, not a percentage. 10% is 1000, and 12.5% is 1250 with no
  -- float anywhere. A numeric percent column invites 0.125 vs 12.5 confusion
  -- and there is no way to tell them apart after the fact.
  percent_bp         integer,

  -- Agorot, per the goal and per the rest of this codebase. The old
  -- coupons.discount_value held SHEKELS for a fixed discount and a PERCENTAGE
  -- for a percentage one, in one numeric column, which is the ambiguity this
  -- pair of columns exists to remove.
  amount_agorot      integer,

  min_order_agorot   integer NOT NULL DEFAULT 0,

  -- A ceiling for percentage campaigns: "20% off, up to 50 shekels". Without
  -- it a percentage code on an unusually large cart can exceed the commission
  -- the discount is funded from.
  max_discount_agorot integer,

  starts_at          timestamptz,
  expires_at         timestamptz,

  -- NULL means unlimited. used_count is a maintained cache of
  -- discount_redemptions; the ledger is the source of truth.
  max_uses           integer,
  max_uses_per_user  integer NOT NULL DEFAULT 1,
  used_count         integer NOT NULL DEFAULT 0,

  -- OFF by default, per the goal. Stacking is the setting that turns a
  -- 20% code and a 30% code into a 50% one, and a default of true is how a
  -- campaign nobody reviewed ends up giving the store away. Opting in is a
  -- deliberate act recorded per campaign.
  allow_stacking     boolean NOT NULL DEFAULT false,

  is_active          boolean NOT NULL DEFAULT true,

  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

DO $$
BEGIN
  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_code_unique UNIQUE (code);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;

  -- The shape of the row must match its kind. A percent campaign with an
  -- amount and no percentage is a campaign that silently discounts nothing,
  -- and it looks correct in the admin list.
  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_kind_shape CHECK (
        (kind = 'percent' AND percent_bp IS NOT NULL AND amount_agorot IS NULL)
        OR
        (kind = 'fixed'  AND amount_agorot IS NOT NULL AND percent_bp IS NULL)
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_percent_range
      CHECK (percent_bp IS NULL OR (percent_bp > 0 AND percent_bp <= 10000));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Every money column is a non-negative integer of agorot. A negative
  -- discount is a surcharge, which is not a thing this table may express.
  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_amounts_non_negative CHECK (
        (amount_agorot       IS NULL OR amount_agorot       > 0)
        AND (max_discount_agorot IS NULL OR max_discount_agorot > 0)
        AND min_order_agorot >= 0
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_limits_sane CHECK (
        (max_uses IS NULL OR max_uses > 0)
        AND max_uses_per_user >= 1
        AND used_count >= 0
      );
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_window_ordered
      CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;

  -- Codes are matched on an equality, so they must be stored in the form the
  -- client normalises to. Enforcing it here means a row inserted by hand in the
  -- SQL editor cannot become a code that exists but can never be redeemed.
  BEGIN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_code_normalised
      CHECK (code = upper(btrim(code)) AND code !~ '\s' AND length(code) BETWEEN 3 AND 40);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS discount_campaigns_active_idx
  ON public.discount_campaigns (code)
  WHERE is_active AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS discount_campaigns_window_idx
  ON public.discount_campaigns (starts_at, expires_at)
  WHERE is_active AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.discount_campaigns;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.discount_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.discount_campaigns ENABLE ROW LEVEL SECURITY;

-- Deliberately NO public read policy.
--
-- A shopper never needs to list campaigns; they type one code and the server
-- tells them what it is worth. A readable table is a scraper enumerating every
-- unreleased campaign, its percentage and its start date, which is both a
-- marketing leak and a way to use a code before it launches.
DROP POLICY IF EXISTS discount_campaigns_admin_read ON public.discount_campaigns;
CREATE POLICY discount_campaigns_admin_read ON public.discount_campaigns
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Writes go through the service-role client after requireAdminSession, like
-- every other admin mutation. No client write policy.

COMMENT ON TABLE public.discount_campaigns IS
  'Site-wide, platform-funded discount codes. Separate from public.coupons, '
  'which is supplier-scoped. The discount is funded from the platform '
  'commission and never from the supplier share. Not readable by shoppers: a '
  'code is validated server-side, never listed.';

-- ---------------------------------------------------------------------------
-- 3. discount_redemptions: the ledger the limits are actually enforced by
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.discount_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES public.discount_campaigns(id) ON DELETE RESTRICT,
  user_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id       uuid REFERENCES public.orders(id) ON DELETE RESTRICT,

  -- What the discount was actually worth on this order, in agorot. Recorded
  -- rather than recomputed: a campaign edited next month must not change what
  -- last month's orders report, which is the same rule C10 applies to
  -- platform_percent.
  amount_agorot  integer NOT NULL,

  created_at     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  -- The replay barrier. One order can consume a campaign exactly once, so a
  -- retried webhook or a double-submitted checkout cannot spend the same code
  -- twice against the same order.
  BEGIN
    ALTER TABLE public.discount_redemptions
      ADD CONSTRAINT discount_redemptions_once_per_order UNIQUE (campaign_id, order_id);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER TABLE public.discount_redemptions
      ADD CONSTRAINT discount_redemptions_amount_positive CHECK (amount_agorot > 0);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS discount_redemptions_campaign_user_idx
  ON public.discount_redemptions (campaign_id, user_id);

CREATE INDEX IF NOT EXISTS discount_redemptions_order_idx
  ON public.discount_redemptions (order_id);

ALTER TABLE public.discount_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_redemptions_owner_read ON public.discount_redemptions;
CREATE POLICY discount_redemptions_owner_read ON public.discount_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS discount_redemptions_admin_read ON public.discount_redemptions;
CREATE POLICY discount_redemptions_admin_read ON public.discount_redemptions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Append-only from the client's point of view: no insert, update or delete
-- policy. The only writer is fn_claim_discount.

COMMENT ON TABLE public.discount_redemptions IS
  'One row per campaign use. The source of truth for max_uses and '
  'max_uses_per_user; discount_campaigns.used_count is a maintained cache. '
  'Append-only, written only by fn_claim_discount.';

-- ---------------------------------------------------------------------------
-- 4. fn_claim_discount: the atomic claim
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_claim_discount(
  p_code          text,
  p_user_id       uuid,
  p_order_id      uuid,
  p_amount_agorot integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign public.discount_campaigns%rowtype;
  v_user_uses integer;
BEGIN
  IF p_amount_agorot IS NULL OR p_amount_agorot <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_discount');
  END IF;

  -- FOR UPDATE is the whole point of this function.
  --
  -- Without the row lock, two checkouts finishing in the same millisecond both
  -- read used_count = 99 against a max_uses of 100 and both write 100, and the
  -- campaign is used 101 times. That is the bug 05a181a documented and could
  -- not fix in application code, because no amount of care in JS closes a
  -- read-then-write window across two connections.
  SELECT * INTO v_campaign
  FROM public.discount_campaigns
  WHERE code = upper(btrim(p_code))
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND                              THEN RETURN jsonb_build_object('ok', false, 'reason', 'unknown'); END IF;

  -- Replay check FIRST, before any limit is evaluated.
  --
  -- This order is not cosmetic. When a webhook retries an order that already
  -- claimed, the per-user check below sees the redemption this very order
  -- created and answers 'per_user_limit'. The caller is in the charging
  -- transaction and reads that as "the discount is no longer valid", so a
  -- retry of a payment that already succeeded fails. An order that has already
  -- claimed is idempotent success and nothing else, so it has to be answered
  -- before anything can mistake it for a new attempt.
  IF p_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.discount_redemptions
    WHERE campaign_id = v_campaign.id AND order_id = p_order_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_claimed',
                              'campaign_id', v_campaign.id);
  END IF;

  IF NOT v_campaign.is_active               THEN RETURN jsonb_build_object('ok', false, 'reason', 'inactive'); END IF;
  IF v_campaign.starts_at  IS NOT NULL AND v_campaign.starts_at  > now()
                                            THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_started'); END IF;
  IF v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()
                                            THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired'); END IF;

  IF v_campaign.max_uses IS NOT NULL AND v_campaign.used_count >= v_campaign.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  -- Per-user limit, counted from the ledger and not from a cache. A guest
  -- checkout has no user_id and therefore cannot be limited per user; that is
  -- a real hole and it is closed by policy rather than here, by requiring a
  -- session before a code can be applied.
  IF p_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_user_uses
    FROM public.discount_redemptions
    WHERE campaign_id = v_campaign.id AND user_id = p_user_id;

    IF v_user_uses >= v_campaign.max_uses_per_user THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'per_user_limit');
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.discount_redemptions (campaign_id, user_id, order_id, amount_agorot)
    VALUES (v_campaign.id, p_user_id, p_order_id, p_amount_agorot);
  EXCEPTION WHEN unique_violation THEN
    -- This order already claimed this campaign. Idempotent success: a retried
    -- webhook must not fail the payment, and it must not double-count either.
    RETURN jsonb_build_object('ok', true, 'reason', 'already_claimed',
                              'campaign_id', v_campaign.id);
  END;

  UPDATE public.discount_campaigns
     SET used_count = used_count + 1
   WHERE id = v_campaign.id;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', v_campaign.id,
    'amount_agorot', p_amount_agorot
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_discount(text, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_claim_discount(text, uuid, uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.fn_claim_discount(text, uuid, uuid, integer) IS
  'Atomically claims one use of a campaign for an order. Locks the campaign '
  'row, so concurrent checkouts cannot both pass a max_uses check. Idempotent '
  'per (campaign, order). service_role only: it is called from the charging '
  'transaction, never from a browser.';

-- ---------------------------------------------------------------------------
-- 5. Release, for a cancelled or refunded order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_release_discount(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_released integer := 0;
  r record;
BEGIN
  -- An order that never completes must give its use back, or a campaign is
  -- exhausted by carts that were abandoned after the claim.
  FOR r IN
    SELECT id, campaign_id FROM public.discount_redemptions WHERE order_id = p_order_id
  LOOP
    DELETE FROM public.discount_redemptions WHERE id = r.id;
    UPDATE public.discount_campaigns
       SET used_count = greatest(0, used_count - 1)
     WHERE id = r.campaign_id;
    v_released := v_released + 1;
  END LOOP;
  RETURN v_released;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_release_discount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_release_discount(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Campaign performance, for the admin dashboard
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_discount_campaign_performance AS
SELECT
  c.id,
  c.code,
  c.name,
  c.kind,
  c.is_active,
  c.starts_at,
  c.expires_at,
  c.max_uses,
  c.max_uses_per_user,
  c.allow_stacking,
  c.used_count,
  count(r.id)                              AS redemptions,
  count(DISTINCT r.user_id)                AS distinct_users,
  COALESCE(sum(r.amount_agorot), 0)::bigint AS total_discount_agorot,
  -- The cache and the ledger must agree. When they do not, something wrote
  -- used_count outside fn_claim_discount and the limits are no longer real.
  (c.used_count <> count(r.id))            AS counter_drift,
  max(r.created_at)                        AS last_redeemed_at
FROM public.discount_campaigns c
LEFT JOIN public.discount_redemptions r ON r.campaign_id = c.id
WHERE c.deleted_at IS NULL
GROUP BY c.id;
