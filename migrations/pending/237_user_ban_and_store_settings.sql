-- 237_user_ban_and_store_settings.sql
--
-- Two things the admin panel had no place to write.
--
-- 1. A USER BAN. The panel could change a customer's role and nothing else
--    about their standing. The lock itself lives where sessions are minted:
--    `auth.users.banned_until`, set by the server action through the Auth
--    admin API (`ban_duration`). GoTrue refuses a banned user's token refresh
--    and its /user endpoint, and `proxy.ts` calls `auth.getUser()` on every
--    request, so an existing session dies on its next page load with no
--    column of ours involved. What THIS file adds is the panel's record of
--    the fact: when, why and by whom, on `profiles`, where the user list and
--    the user 360 page already read. `auth.users` is not readable through
--    PostgREST, so without these three columns a banned customer looks
--    identical to any other row in every admin list.
--
--    The columns are protected by their own trigger rather than by editing
--    181b's `enforce_profile_privilege_columns`. That body was read off
--    production on 2026-09-17 and is NOT what 090's file in this repo says
--    it is; restating it here would be the 183 shape (a CREATE OR REPLACE
--    over a live body from a stale copy). A second BEFORE UPDATE trigger
--    costs nothing and cannot overwrite the first. The rule it enforces:
--    `profiles_update_unified` lets an owner UPDATE their own row, so
--    without the guard a banned customer with a still-valid session could
--    clear `banned_at` themselves. The lie would only reach the admin UI
--    (the auth-level ban still holds) but a record that its subject can
--    edit is not a record.
--
-- 2. STORE SETTINGS. A single-row table for the handful of operator knobs
--    that today are either environment variables (a Vercel redeploy to
--    change a phone number) or constants in the tree. Singleton by CHECK
--    (id = 1): a settings table with two rows has no meaning, and the
--    application upserts on that id. The storefront reads it through
--    `src/lib/store-settings/load.ts`, which falls back to the compiled
--    defaults whenever the table is missing (42P01) or unreadable, so the
--    site renders identically before and after this file is applied. The
--    one behavioural consumer is `checkout_enabled`: `beginCheckout`
--    refuses with CHECKOUT_DISABLED when it is false, after the existing
--    env kill switch and before any read of the cart. It fails OPEN on a
--    read error, same as the fraud rail beside it.
--
--    Writes are server-only (zero write policies; the action holds the
--    service role after `requireSection('settings', 'write')`). Reads are
--    granted to the panel tiers through `is_support()`, which already
--    means "support, read_only, admin, super_admin" in production, so a
--    read_only observer sees the settings page and content_uploader does
--    not, matching `permissions.ts`.
--
-- Money: the two thresholds are integer agorot, `bigint`, non-negative.
--
-- Idempotent: safe to re-run.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS enforce_profile_ban_columns ON public.profiles;
--   DROP FUNCTION IF EXISTS public.enforce_profile_ban_columns();
--   DROP INDEX IF EXISTS public.profiles_banned_at_idx;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS banned_by;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS ban_reason;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS banned_at;
--   DROP TABLE IF EXISTS public.store_settings;
--   (auth.users.banned_until is not touched by this file; unban through the
--    panel or the Auth admin API.)

-- ------------------------------------------------------------------ 1. ban

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ban_reason text
    CHECK (ban_reason IS NULL OR char_length(ban_reason) <= 500);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.banned_at IS
  'When an admin banned this account. The lock itself is auth.users.banned_until; this is the panel''s record of it. NULL = not banned.';
COMMENT ON COLUMN public.profiles.ban_reason IS
  'Operator-written reason shown in the admin panel. Never rendered to the customer.';
COMMENT ON COLUMN public.profiles.banned_by IS
  'The admin who set the ban. SET NULL if that account is later deleted.';

-- The user list filters on "banned" and almost every row is not.
CREATE INDEX IF NOT EXISTS profiles_banned_at_idx
  ON public.profiles (banned_at)
  WHERE banned_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_profile_ban_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Service role and internal jobs: the admin server actions run here after
  -- their own requireAdminSession gate.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.banned_at IS DISTINCT FROM OLD.banned_at
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.banned_by IS DISTINCT FROM OLD.banned_by THEN
    RAISE EXCEPTION 'profiles ban columns may only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_ban_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_profile_ban_columns ON public.profiles;
CREATE TRIGGER enforce_profile_ban_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_ban_columns();

-- ------------------------------------------------------- 2. store settings

CREATE TABLE IF NOT EXISTS public.store_settings (
  id                              smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name                      text        NOT NULL DEFAULT 'KenyonExpress'
                                              CHECK (char_length(store_name) BETWEEN 1 AND 80),
  support_email                   text        CHECK (support_email IS NULL OR char_length(support_email) <= 120),
  support_phone                   text        CHECK (support_phone IS NULL OR support_phone ~ '^972[0-9]{8,9}$'),
  whatsapp_phone                  text        CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^972[0-9]{8,9}$'),
  address_he                      text        CHECK (address_he IS NULL OR char_length(address_he) <= 200),
  min_order_agorot                bigint      NOT NULL DEFAULT 0 CHECK (min_order_agorot >= 0),
  free_shipping_threshold_agorot  bigint      CHECK (free_shipping_threshold_agorot IS NULL OR free_shipping_threshold_agorot >= 0),
  checkout_enabled                boolean     NOT NULL DEFAULT true,
  maintenance_mode                boolean     NOT NULL DEFAULT false,
  maintenance_message_he          text        CHECK (maintenance_message_he IS NULL OR char_length(maintenance_message_he) <= 300),
  updated_by                      uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_settings IS
  'Singleton (id = 1). Operator knobs the storefront reads through lib/store-settings/load.ts with compiled defaults as fallback. Written only by the admin settings action via service role.';

-- set_updated_at exists in production (read 2026-09-17: SET search_path TO '',
-- assigns now()); restated defensively the way every table migration here does.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.store_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- The row the application upserts on. ON CONFLICT keeps a re-run from
-- resetting values an operator has since changed.
INSERT INTO public.store_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.store_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.store_settings TO authenticated;

-- Panel tiers read. Nobody but the service role writes: there is
-- deliberately no INSERT/UPDATE/DELETE policy.
DROP POLICY IF EXISTS "store_settings: panel select" ON public.store_settings;
CREATE POLICY "store_settings: panel select" ON public.store_settings
  FOR SELECT
  TO authenticated
  USING (public.is_support());
