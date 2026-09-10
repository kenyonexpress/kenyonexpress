-- 233_wishlist_alerts.sql
--
-- The two small tables that let the wishlist alerts of 200 actually run.
--
-- 200 (applied 2026-09-09) taught the outbox to ACCEPT `price_drop` and
-- `back_in_stock`, and 231 (applied 2026-09-10) taught the bell to ring for
-- them, but nothing PRODUCES them: no cron compares prices, nothing watches
-- stock come back, and a customer has no way to say "stop" or "also send me a
-- weekly summary". This file adds the two pieces of state that the producer
-- (/api/cron/wishlist-alerts and /api/cron/wishlist-digest) needs and cannot
-- reconstruct from data that already exists:
--
--   wishlist_alert_prefs   per-user toggles. AN ABSENT ROW IS THE DEFAULT
--                          (drops on, restocks on, digest OFF): the alerts
--                          ride on a list the user built by hand, while the
--                          weekly digest is marketing cadence and is opt-in,
--                          written only by an explicit act in the account
--                          area or turned off by the signed unsubscribe link.
--
--   wishlist_stock_state   the last in-stock flag the cron saw per product.
--                          A restock is a TRANSITION, and nothing else
--                          records one: `products.stock_quantity` is only
--                          the present, `price_history` (193) records prices
--                          and not stock, and `stock_waitlist` (195) covers
--                          only people who pressed the button while it was
--                          gone. Without this table a wishlist owner whose
--                          product returned would either never hear (no
--                          signal) or hear every day (no memory).
--
-- WHY NOT COLUMNS ON `profiles`: the prefs are wishlist-scoped, default-true
-- semantics live in the reader, and `profiles` is selected all over the app;
-- three marketing toggles do not belong on every profile read.

BEGIN;

-- ---------------------------------------------------------------- the prefs

CREATE TABLE IF NOT EXISTS public.wishlist_alert_prefs (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  price_drop    boolean NOT NULL DEFAULT true,
  back_in_stock boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wishlist_alert_prefs IS
  'Per-user wishlist alert toggles. Absent row = drops on, restocks on, digest off. Written by the owner in the account area or by the signed unsubscribe link (service role).';

-- The 183/226 lesson: never restate a shared function. Create it only if the
-- database somehow lacks it; production already carries the live body.
DO $$
BEGIN
  IF to_regproc('public.set_updated_at') IS NULL THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS wishlist_alert_prefs_updated_at ON public.wishlist_alert_prefs;
CREATE TRIGGER wishlist_alert_prefs_updated_at
  BEFORE UPDATE ON public.wishlist_alert_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wishlist_alert_prefs ENABLE ROW LEVEL SECURITY;

-- The owner manages their own row; nobody reads anybody else's. No DELETE
-- policy: turning everything off IS the delete, and keeping the row keeps the
-- evidence of the choice. The unsubscribe link's write arrives with the
-- service role and bypasses RLS.
DROP POLICY IF EXISTS "wishlist_alert_prefs_owner_select" ON public.wishlist_alert_prefs;
CREATE POLICY "wishlist_alert_prefs_owner_select"
  ON public.wishlist_alert_prefs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wishlist_alert_prefs_owner_insert" ON public.wishlist_alert_prefs;
CREATE POLICY "wishlist_alert_prefs_owner_insert"
  ON public.wishlist_alert_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "wishlist_alert_prefs_owner_update" ON public.wishlist_alert_prefs;
CREATE POLICY "wishlist_alert_prefs_owner_update"
  ON public.wishlist_alert_prefs FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.wishlist_alert_prefs FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wishlist_alert_prefs TO authenticated;

-- ---------------------------------------------------- the last-seen stock bit

CREATE TABLE IF NOT EXISTS public.wishlist_stock_state (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  in_stock   boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wishlist_stock_state IS
  'The in-stock flag /api/cron/wishlist-alerts last observed per product. A false-to-true transition is a restock. Server-only; not customer data, but no client has any business writing it.';

DROP TRIGGER IF EXISTS wishlist_stock_state_updated_at ON public.wishlist_stock_state;
CREATE TRIGGER wishlist_stock_state_updated_at
  BEFORE UPDATE ON public.wishlist_stock_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The 195 shape: RESTRICTIVE deny-all, so a permissive policy added later
-- cannot outvote it, plus the grants revoked so a policy is never even asked.
ALTER TABLE public.wishlist_stock_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wishlist_stock_state_deny_all_client_roles" ON public.wishlist_stock_state;
CREATE POLICY "wishlist_stock_state_deny_all_client_roles"
  ON public.wishlist_stock_state
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.wishlist_stock_state FROM anon, authenticated;

-- ------------------------------------------------------------------- checks

DO $$
DECLARE
  v_prefs_rls  boolean;
  v_state_rls  boolean;
  v_auth_state boolean;
BEGIN
  SELECT relrowsecurity INTO v_prefs_rls FROM pg_class WHERE oid = 'public.wishlist_alert_prefs'::regclass;
  SELECT relrowsecurity INTO v_state_rls FROM pg_class WHERE oid = 'public.wishlist_stock_state'::regclass;
  IF NOT v_prefs_rls OR NOT v_state_rls THEN
    RAISE EXCEPTION 'RLS is off on a table this file just created';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.wishlist_stock_state', 'SELECT') INTO v_auth_state;
  IF v_auth_state THEN
    RAISE EXCEPTION 'authenticated can read wishlist_stock_state; the revoke did not take';
  END IF;
END $$;

COMMIT;
