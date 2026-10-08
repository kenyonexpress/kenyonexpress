-- 261_loyalty_tiers.sql
--
-- Loyalty tiers (STEP 47): bronze, silver and gold by trailing twelve-month
-- spend, tier-only discount codes, and an upgrade notification.
--
-- MEASURED BEFORE WRITING (production, 2026-10-08, read-only through the
-- management API): `public.loyalty_tiers` absent; `discount_campaigns` has
-- no `min_loyalty_tier`; no `fn_refresh_loyalty_tier`; `orders.user_id`,
-- `paid_at`, `status` (order_status: pending, paid, partially_fulfilled,
-- fulfilled, cancelled, refunded, platform_settled) and `total_ils_agorot`
-- (bigint, 224's generated twin) all present; `notifications` has
-- user_id, kind (text, no CHECK), title_he, body_he, href;
-- `fn_enqueue_notification` exists in its 4- and 5-argument forms;
-- `notification_outbox_kind_check` holds the seventeen names of the
-- 2026-09-10 measurement (253, pending, adds `order_delivered`). Twenty-eight
-- paid orders in the window across two buyers, the larger at ₪1,480, so one
-- account is silver on the day this applies and none is gold.
--
-- WHAT THIS DOES.
--
-- 1. `public.loyalty_tiers`: one row per customer remembering the tier they
--    were LAST TOLD ABOUT, the spend it was computed from, and since when.
--    Owner SELECT only; every write is the function below on the service
--    role. The application does not read the tier from here to decide
--    anything: the window rolls daily, so the page, the badge and the cart
--    compute the tier live from the customer's own paid orders
--    (`src/lib/loyalty/tiers.ts`), and this row exists so an upgrade is
--    announced exactly once and a downgrade is never announced.
--
-- 2. `discount_campaigns.min_loyalty_tier` (NULL, 'silver' or 'gold'): a
--    tier-only deal is a campaign code the cart refuses below that tier.
--    The gate is in `evaluateDiscount` (src/lib/growth/discount.ts), which
--    receives the shopper's live tier; the column is only data. NULL keeps
--    every existing campaign open to everyone, so nothing changes on apply.
--
-- 3. `fn_refresh_loyalty_tier(uuid)`: called by the payment finalize path
--    after every paid order (src/server/loyalty/refresh.ts). Sums the
--    window, decides the tier with the SAME thresholds tiers.ts carries
--    (tiers.test.ts reads this file and fails if they drift), upserts the
--    row, and when the tier ROSE writes the bell row and enqueues
--    `loyalty_tier_upgraded` through `fn_enqueue_notification` under dedupe
--    `loyalty:<user>:<tier>:<date>`. A tier that fell is recorded quietly.
--    Service role only. The bell row is written here and not by 231's
--    fanout: 231's CASE is pinned to an exact list by
--    bell-fanout-migration-guards.test.ts, and a kind it does not name stays
--    in its ELSE by design.
--
-- 4. `notification_outbox_kind_check` widened with `loyalty_tier_upgraded`.
--    NOT by restating a list: the live constraint is READ, its names kept,
--    and the one name appended, so this file is correct whether 253 has
--    been applied before it or not. (If 253 is applied AFTER this file, 253
--    restates eighteen names and drops this one; APPLY-ORDER says 253 first.)
--    The renderer (`buildLoyaltyTierUpgradedEmail`) already knows the kind.
--
-- Idempotent: IF NOT EXISTS on the table and the column, CREATE OR REPLACE
-- on the function, DROP/CREATE on the policy, and the constraint rebuild
-- appends only when the name is absent. Re-running yields the same objects.
--
-- AFTER APPLYING: re-measure the constraint, move `loyalty_tier_upgraded`
-- from PENDING_KINDS to CHECK_ACCEPTS in src/lib/email/outbox-kinds.test.ts,
-- add loyalty_tiers to supabase/rls-manifest.json from `node
-- scripts/check-rls.mjs`, and move this file to migrations/applied/.
--
-- ROLLBACK:
--   delete from public.notification_outbox where kind = 'loyalty_tier_upgraded';
--   delete from public.notifications where kind = 'loyalty_tier_upgraded';
--   drop function if exists public.fn_refresh_loyalty_tier(uuid);
--   drop table if exists public.loyalty_tiers;
--   alter table public.discount_campaigns drop column if exists min_loyalty_tier;
--   -- then re-run the constraint block of 253 (or 234 if 253 is not applied)
--   -- to restate the kind list without loyalty_tier_upgraded.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The remembered tier
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier             text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold')),
  -- Integer agorot, the on-site totals of the paid orders inside the window
  -- at the moment of the last refresh. Informational: the live figure is
  -- recomputed on every read.
  spend_12m_agorot bigint NOT NULL DEFAULT 0 CHECK (spend_12m_agorot >= 0),
  tier_since       timestamptz NOT NULL DEFAULT now(),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loyalty_tiers IS
  'STEP 47. The loyalty tier each customer was last told about, written by fn_refresh_loyalty_tier after a paid order. The live tier is computed from orders at read time (src/lib/loyalty/tiers.ts); this row exists so an upgrade is announced once.';

ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_tiers_select_own" ON public.loyalty_tiers;
CREATE POLICY "loyalty_tiers_select_own"
  ON public.loyalty_tiers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- REVOKE ALL first (258's lesson): the default privileges hand authenticated
-- REFERENCES and TRIGGER along with the DML.
REVOKE ALL ON public.loyalty_tiers FROM anon;
REVOKE ALL ON public.loyalty_tiers FROM authenticated;
GRANT SELECT ON public.loyalty_tiers TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tier-only deals
-- ---------------------------------------------------------------------------

ALTER TABLE public.discount_campaigns
  ADD COLUMN IF NOT EXISTS min_loyalty_tier text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'discount_campaigns_min_loyalty_tier_check'
       AND conrelid = 'public.discount_campaigns'::regclass
  ) THEN
    ALTER TABLE public.discount_campaigns
      ADD CONSTRAINT discount_campaigns_min_loyalty_tier_check
      CHECK (min_loyalty_tier IN ('silver', 'gold'));
  END IF;
END $$;

COMMENT ON COLUMN public.discount_campaigns.min_loyalty_tier IS
  'STEP 47. NULL: open to everyone. silver/gold: the cart refuses the code below this loyalty tier (evaluateDiscount, src/lib/growth/discount.ts). Bronze is the floor, so it is never a minimum.';

-- ---------------------------------------------------------------------------
-- 3. The outbox kind, appended to whatever the live constraint holds
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def   text;
  v_names text[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'notification_outbox_kind_check'
     AND conrelid = 'public.notification_outbox'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '261: notification_outbox_kind_check is missing; the outbox has no kind list to widen';
  END IF;

  SELECT array_agg(m[1]) INTO v_names
    FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') AS m;
  IF v_names IS NULL OR array_length(v_names, 1) < 17 THEN
    RAISE EXCEPTION '261: read % names out of the live constraint, expected at least 17: %',
      coalesce(array_length(v_names, 1), 0), v_def;
  END IF;

  IF NOT ('loyalty_tier_upgraded' = ANY (v_names)) THEN
    v_names := array_append(v_names, 'loyalty_tier_upgraded');
    EXECUTE 'ALTER TABLE public.notification_outbox DROP CONSTRAINT notification_outbox_kind_check';
    -- Rebuilt in the ARRAY['a','b']::text[] spelling every earlier restatement
    -- used, so pg_get_constraintdef keeps showing one quoted name per kind
    -- and 253's self-check, this file's, and the hand measurement in
    -- outbox-kinds.test.ts all keep reading it. (A %L array literal renders as
    -- '{a,b}' and breaks all three; measured in the 2026-10-08 rehearsal.)
    EXECUTE 'ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check CHECK (kind = ANY (ARRAY['
      || (SELECT string_agg(quote_literal(n), ', ') FROM unnest(v_names) AS n)
      || ']::text[]))';
  END IF;
END $$;

COMMENT ON CONSTRAINT notification_outbox_kind_check ON public.notification_outbox IS
  'The kinds buildNotification (src/lib/email/notifications.ts) can render. loyalty_tier_upgraded appended by 261 (enqueued by fn_refresh_loyalty_tier); order_delivered by 253.';

-- ---------------------------------------------------------------------------
-- 4. The refresh
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_refresh_loyalty_tier(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  -- The two thresholds, integer agorot. src/lib/loyalty/tiers.ts carries the
  -- same two and its test reads this file: change both or neither.
  v_silver constant bigint := 100000;
  v_gold   constant bigint := 300000;

  v_spend     bigint;
  v_tier      text;
  v_prev      text;
  v_since     timestamptz;
  v_rank      int;
  v_prev_rank int;
  v_upgraded  boolean := false;
  v_email     text;
  v_name      text;
  v_label     text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;

  -- The window. paid_at IS NOT NULL is the site's own definition of a
  -- purchase that counts (fn_cashback_order_bonus, fn_claim_referral);
  -- cancelled and refunded orders are money that went back.
  SELECT coalesce(sum(o.total_ils_agorot), 0)
    INTO v_spend
    FROM public.orders o
   WHERE o.user_id = p_user_id
     AND o.paid_at IS NOT NULL
     AND o.deleted_at IS NULL
     AND o.status NOT IN ('cancelled', 'refunded')
     AND o.paid_at >= now() - interval '365 days'
     AND o.paid_at <= now();

  v_tier := CASE
    WHEN v_spend >= v_gold   THEN 'gold'
    WHEN v_spend >= v_silver THEN 'silver'
    ELSE 'bronze'
  END;
  v_rank := CASE v_tier WHEN 'gold' THEN 2 WHEN 'silver' THEN 1 ELSE 0 END;

  SELECT t.tier, t.tier_since
    INTO v_prev, v_since
    FROM public.loyalty_tiers t
   WHERE t.user_id = p_user_id
     FOR UPDATE;

  IF v_prev IS NULL THEN
    v_since := now();
    INSERT INTO public.loyalty_tiers (user_id, tier, spend_12m_agorot, tier_since, computed_at, updated_at)
    VALUES (p_user_id, v_tier, v_spend, v_since, now(), now());
    -- A first row already above the floor is a rise from bronze: the
    -- customer was bronze by definition before anyone wrote this row.
    v_prev := 'bronze';
    v_prev_rank := 0;
  ELSE
    v_prev_rank := CASE v_prev WHEN 'gold' THEN 2 WHEN 'silver' THEN 1 ELSE 0 END;
    IF v_tier <> v_prev THEN
      v_since := now();
    END IF;
    UPDATE public.loyalty_tiers
       SET tier             = v_tier,
           spend_12m_agorot = v_spend,
           tier_since       = v_since,
           computed_at      = now(),
           updated_at       = now()
     WHERE user_id = p_user_id;
  END IF;

  v_upgraded := v_rank > v_prev_rank;

  IF v_upgraded THEN
    v_label := CASE v_tier WHEN 'gold' THEN 'זהב' WHEN 'silver' THEN 'כסף' ELSE 'ברונזה' END;

    SELECT p.email, p.full_name INTO v_email, v_name
      FROM public.profiles p
     WHERE p.id = p_user_id;

    -- The bell. Same vocabulary as the outbox, same relative href rule (198).
    INSERT INTO public.notifications (user_id, kind, title_he, body_he, href)
    VALUES (
      p_user_id,
      'loyalty_tier_upgraded',
      'עלית לדרגת ' || v_label,
      'ההטבות של דרגת ' || v_label || ' פתוחות לך מעכשיו',
      '/account/loyalty'
    );

    -- The mail. Deduped per user, tier and day, so a replayed finalize
    -- enqueues nothing twice and a customer who drops and climbs back a
    -- year later is told again.
    IF v_email IS NOT NULL THEN
      PERFORM public.fn_enqueue_notification(
        'loyalty_tier_upgraded',
        v_email,
        'loyalty:' || p_user_id::text || ':' || v_tier || ':' || to_char(v_since, 'YYYY-MM-DD'),
        jsonb_build_object(
          'tier', v_tier,
          'previous_tier', v_prev,
          'spend_12m_agorot', v_spend,
          'full_name', v_name
        ),
        p_user_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'tier', v_tier,
    'previous_tier', v_prev,
    'spend_12m_agorot', v_spend,
    'upgraded', v_upgraded
  );
END;
$$;

COMMENT ON FUNCTION public.fn_refresh_loyalty_tier(uuid) IS
  'STEP 47. Recomputes the trailing-365-day spend, upserts loyalty_tiers, and on a rise writes the bell row and enqueues loyalty_tier_upgraded. Service role only; called by src/server/loyalty/refresh.ts after each paid order.';

REVOKE ALL ON FUNCTION public.fn_refresh_loyalty_tier(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_loyalty_tier(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Self-check
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
BEGIN
  IF to_regclass('public.loyalty_tiers') IS NULL THEN
    RAISE EXCEPTION '261: loyalty_tiers was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'loyalty_tiers' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION '261: loyalty_tiers has RLS off';
  END IF;
  IF has_table_privilege('anon', 'public.loyalty_tiers', 'SELECT') THEN
    RAISE EXCEPTION '261: anon can read loyalty_tiers';
  END IF;
  IF has_table_privilege('authenticated', 'public.loyalty_tiers', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION '261: authenticated can write loyalty_tiers';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'discount_campaigns'
       AND column_name = 'min_loyalty_tier'
  ) THEN
    RAISE EXCEPTION '261: discount_campaigns.min_loyalty_tier is missing';
  END IF;
  IF to_regprocedure('public.fn_refresh_loyalty_tier(uuid)') IS NULL THEN
    RAISE EXCEPTION '261: fn_refresh_loyalty_tier is missing';
  END IF;
  IF has_function_privilege('anon', 'public.fn_refresh_loyalty_tier(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_refresh_loyalty_tier(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '261: a client role can execute fn_refresh_loyalty_tier';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'notification_outbox_kind_check'
     AND conrelid = 'public.notification_outbox'::regclass;
  IF v_def IS NULL OR position('''loyalty_tier_upgraded''' IN v_def) = 0 THEN
    RAISE EXCEPTION '261: constraint lacks loyalty_tier_upgraded: %', v_def;
  END IF;
  IF position('''order_paid''' IN v_def) = 0 OR position('''gift_card_issued''' IN v_def) = 0 THEN
    RAISE EXCEPTION '261: constraint rebuild lost a prior kind: %', v_def;
  END IF;

  RAISE NOTICE '261: loyalty_tiers, min_loyalty_tier, fn_refresh_loyalty_tier and the kind all present';
END $$;

COMMIT;
