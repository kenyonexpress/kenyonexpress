-- Migration 029: Customer Account & Identity (DRAFT - DO NOT APPLY YET)
-- Design: docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
-- Notification preferences, account deletion (Israeli privacy/tax retention),
-- notifications outbox + coupon expiry reminders, payment_tokens hardening,
-- race-safe guest cart merge.
-- Prerequisites on the live DB: 001 (profiles/carts/payment_tokens), 003 (is_admin),
-- 008 (coupon_codes), 009 (user_addresses), 019 (check_user_rate_limit),
-- 025 (audit_log + audit_log_trigger_fn). No dependency on 026/027/028.
-- Fully idempotent. Apply only via MCP apply_migration.

-- Defensive: 001 may have stopped early on a live DB before defining this function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ===========================================================================
-- 1. ENUMs
-- ===========================================================================

DO $$ BEGIN
  CREATE TYPE public.deletion_request_status AS ENUM ('pending', 'cancelled', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM ('queued', 'sent', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===========================================================================
-- 2. profiles: anonymization marker
-- ===========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

-- ===========================================================================
-- 3. user_notification_preferences
--    Marketing channels default FALSE (anti-spam law 30A: opt-in only).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id               uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  order_updates_email   boolean     NOT NULL DEFAULT true,
  coupon_expiry_email   boolean     NOT NULL DEFAULT true,
  coupon_expiry_inapp   boolean     NOT NULL DEFAULT true,
  wallet_activity_email boolean     NOT NULL DEFAULT false,
  marketing_email       boolean     NOT NULL DEFAULT false,
  marketing_sms         boolean     NOT NULL DEFAULT false,
  locale                text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.user_notification_preferences;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create a row per new profile (separate trigger; handle_new_user stays
-- untouched so this migration does not collide with 026's redefinition).
CREATE OR REPLACE FUNCTION public.create_default_notification_prefs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_notification_prefs ON public.profiles;
CREATE TRIGGER create_notification_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_prefs();

-- Backfill existing users
INSERT INTO public.user_notification_preferences (user_id)
SELECT id FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_prefs: owner select" ON public.user_notification_preferences;
CREATE POLICY "notification_prefs: owner select"
  ON public.user_notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_prefs: owner insert" ON public.user_notification_preferences;
CREATE POLICY "notification_prefs: owner insert"
  ON public.user_notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_prefs: owner update" ON public.user_notification_preferences;
CREATE POLICY "notification_prefs: owner update"
  ON public.user_notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_prefs: admin select" ON public.user_notification_preferences;
CREATE POLICY "notification_prefs: admin select"
  ON public.user_notification_preferences FOR SELECT TO authenticated
  USING (public.is_admin());

-- ===========================================================================
-- 4. account_deletion_requests
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id                 uuid                            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid                            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status             public.deletion_request_status  NOT NULL DEFAULT 'pending',
  reason             text,
  cancel_deadline_at timestamptz                     NOT NULL,   -- grace window end (default now()+30d, set by fn)
  cancelled_at       timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz                     NOT NULL DEFAULT now(),
  updated_at         timestamptz                     NOT NULL DEFAULT now()
);

-- One live (pending) request per user
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_pending_idx
  ON public.account_deletion_requests (user_id)
  WHERE status = 'pending'::public.deletion_request_status;

CREATE INDEX IF NOT EXISTS account_deletion_due_idx
  ON public.account_deletion_requests (cancel_deadline_at)
  WHERE status = 'pending'::public.deletion_request_status;

DROP TRIGGER IF EXISTS set_updated_at ON public.account_deletion_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Owner + admin read; ALL writes go through the definer functions below.
DROP POLICY IF EXISTS "deletion_requests: owner select" ON public.account_deletion_requests;
CREATE POLICY "deletion_requests: owner select"
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "deletion_requests: admin select" ON public.account_deletion_requests;
CREATE POLICY "deletion_requests: admin select"
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (public.is_admin());

-- ===========================================================================
-- 5. notifications_outbox (generic delivery queue: email / push / in-app)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.notifications_outbox (
  id            uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid                        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind          text                        NOT NULL,   -- 'coupon_expiry_7d' | 'coupon_expiry_48h' | 'order_update' | ...
  channel       text                        NOT NULL CHECK (channel IN ('email', 'inapp', 'push', 'sms')),
  payload       jsonb                       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key    text                        NOT NULL UNIQUE,
  status        public.notification_status  NOT NULL DEFAULT 'queued',
  scheduled_for timestamptz                 NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  read_at       timestamptz,                -- in-app: marked read by owner
  error         text,
  created_at    timestamptz                 NOT NULL DEFAULT now(),
  updated_at    timestamptz                 NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_outbox_queue_idx
  ON public.notifications_outbox (scheduled_for)
  WHERE status = 'queued'::public.notification_status;

CREATE INDEX IF NOT EXISTS notifications_outbox_user_idx
  ON public.notifications_outbox (user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.notifications_outbox;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notifications_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notifications_outbox ENABLE ROW LEVEL SECURITY;

-- Owner reads own (in-app bell); owner may only flip read_at via UPDATE limited
-- to own rows (app updates read_at only; other columns are service-side).
DROP POLICY IF EXISTS "outbox: owner select" ON public.notifications_outbox;
CREATE POLICY "outbox: owner select"
  ON public.notifications_outbox FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "outbox: owner mark read" ON public.notifications_outbox;
CREATE POLICY "outbox: owner mark read"
  ON public.notifications_outbox FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "outbox: admin select" ON public.notifications_outbox;
CREATE POLICY "outbox: admin select"
  ON public.notifications_outbox FOR SELECT TO authenticated
  USING (public.is_admin());

-- Column-level: authenticated may update read_at ONLY.
REVOKE UPDATE ON public.notifications_outbox FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications_outbox TO authenticated;

-- ===========================================================================
-- 6. payment_tokens hardening
--    001 shipped a single "owner all" policy: clients could read the raw
--    cardcom_token and write rows. Replace with read-own/delete-own, no client
--    INSERT/UPDATE, and column-level denial of cardcom_token to browser roles.
-- ===========================================================================

DROP POLICY IF EXISTS "payment_tokens: owner all" ON public.payment_tokens;

DROP POLICY IF EXISTS "payment_tokens: owner select" ON public.payment_tokens;
CREATE POLICY "payment_tokens: owner select"
  ON public.payment_tokens FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "payment_tokens: owner delete" ON public.payment_tokens;
CREATE POLICY "payment_tokens: owner delete"
  ON public.payment_tokens FOR DELETE TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "payment_tokens: admin select" ON public.payment_tokens;
CREATE POLICY "payment_tokens: admin select"
  ON public.payment_tokens FOR SELECT TO authenticated
  USING (public.is_admin());

-- No INSERT/UPDATE policies on purpose: rows are written by the service role
-- (Cardcom webhook) only; is_default flips via fn_set_default_payment_token.

-- Column-level grants: raw token is invisible to every browser role.
-- NOTE: client code must select explicit columns; SELECT * now fails (42501).
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payment_tokens FROM anon;
REVOKE SELECT, INSERT, UPDATE ON public.payment_tokens FROM authenticated;
GRANT SELECT (id, profile_id, last_4, card_brand, expiry_month, expiry_year, is_default, created_at)
  ON public.payment_tokens TO authenticated;

-- Default-card switch: atomic, ownership-checked, keeps the partial unique
-- index (one default per profile) satisfied.
CREATE OR REPLACE FUNCTION public.fn_set_default_payment_token(p_token_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_tokens WHERE id = p_token_id AND profile_id = v_uid
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.payment_tokens SET is_default = false
   WHERE profile_id = v_uid AND is_default = true AND id <> p_token_id;
  UPDATE public.payment_tokens SET is_default = true
   WHERE id = p_token_id AND profile_id = v_uid;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_default_payment_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_default_payment_token(uuid) TO authenticated;

-- Dedicated audit trigger that never records the raw token (the generic 025
-- trigger fn would have serialized the whole row into audit_log.changes).
CREATE OR REPLACE FUNCTION public.audit_payment_tokens_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row    record;
  v_action public.audit_action;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; v_action := 'deleted'::public.audit_action;
  ELSIF TG_OP = 'UPDATE' THEN v_row := NEW; v_action := 'updated'::public.audit_action;
  ELSE v_row := NEW; v_action := 'created'::public.audit_action;
  END IF;

  INSERT INTO public.audit_log (actor_id, actor_role, action, entity_type, entity_id, changes)
  VALUES (
    auth.uid(),
    COALESCE(public.current_user_role()::text, 'service'),
    v_action,
    'payment_tokens',
    v_row.id,
    jsonb_build_object(
      'profile_id', v_row.profile_id,
      'last_4',     v_row.last_4,
      'card_brand', v_row.card_brand,
      'is_default', v_row.is_default
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_payment_tokens ON public.payment_tokens;
CREATE TRIGGER audit_payment_tokens
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_tokens
  FOR EACH ROW EXECUTE FUNCTION public.audit_payment_tokens_fn();

-- ===========================================================================
-- 7. Carts: one cart per signed-in user + race-safe guest merge
-- ===========================================================================

-- 7a. Dedupe any existing multi-cart users (keep the most recently updated),
--     then enforce uniqueness going forward.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.carts
    WHERE profile_id IS NOT NULL
    GROUP BY profile_id HAVING count(*) > 1
  ) THEN
    DELETE FROM public.carts c
    USING public.carts newer
    WHERE c.profile_id IS NOT NULL
      AND newer.profile_id = c.profile_id
      AND newer.id <> c.id
      AND (newer.updated_at, newer.id) > (c.updated_at, c.id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS carts_one_per_profile_idx
  ON public.carts (profile_id) WHERE profile_id IS NOT NULL;

-- 7b. Atomic merge. Item shape matches src/server/actions/cart.ts CartItem:
--     { product_id, variant_id (nullable), quantity } keyed by product+variant.
CREATE OR REPLACE FUNCTION public.fn_merge_guest_cart(p_session_id text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_guest  public.carts%ROWTYPE;
  v_user   public.carts%ROWTYPE;
  v_merged jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Serialize all merges for this user (double-submit, multiple tabs).
  PERFORM pg_advisory_xact_lock(hashtextextended('cart_merge:' || v_uid::text, 0));

  SELECT * INTO v_user
  FROM public.carts
  WHERE profile_id = v_uid
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF p_session_id IS NULL OR length(p_session_id) = 0 THEN
    RETURN v_user.id;
  END IF;

  SELECT * INTO v_guest
  FROM public.carts
  WHERE session_id = p_session_id AND profile_id IS NULL
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_guest.id IS NULL THEN
    RETURN v_user.id;   -- nothing to merge
  END IF;

  IF v_user.id IS NULL THEN
    -- Atomic claim: the guest cart becomes the user cart.
    UPDATE public.carts
       SET profile_id = v_uid,
           session_id = NULL,
           expires_at = now() + interval '30 days'
     WHERE id = v_guest.id AND profile_id IS NULL;
    RETURN v_guest.id;
  END IF;

  -- Merge jsonb item arrays by (product_id, variant_id), summing quantities.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'product_id', m.product_id,
               'variant_id', m.variant_id,
               'quantity',   LEAST(m.qty, 99)
             )
           ),
           '[]'::jsonb
         )
    INTO v_merged
  FROM (
    SELECT e.product_id, e.variant_id, SUM(e.quantity)::int AS qty
    FROM (
      SELECT elem->>'product_id'                       AS product_id,
             elem->>'variant_id'                       AS variant_id,
             GREATEST(COALESCE((elem->>'quantity')::int, 1), 1) AS quantity
      FROM jsonb_array_elements(
             COALESCE(v_user.items, '[]'::jsonb) || COALESCE(v_guest.items, '[]'::jsonb)
           ) elem
      WHERE elem ? 'product_id'
    ) e
    GROUP BY e.product_id, e.variant_id
  ) m;

  UPDATE public.carts
     SET items      = v_merged,
         expires_at = now() + interval '30 days'
   WHERE id = v_user.id;

  DELETE FROM public.carts WHERE id = v_guest.id;

  RETURN v_user.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_merge_guest_cart(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_merge_guest_cart(text) TO authenticated;

-- ===========================================================================
-- 8. Account deletion functions
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.fn_request_account_deletion(p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.check_user_rate_limit(v_uid, 'account_deletion', 3, 86400) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.account_deletion_requests (user_id, reason, cancel_deadline_at)
  VALUES (v_uid, p_reason, now() + interval '30 days')
  ON CONFLICT (user_id) WHERE status = 'pending'::public.deletion_request_status
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.account_deletion_requests
    WHERE user_id = v_uid AND status = 'pending'::public.deletion_request_status;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cancel_account_deletion()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.account_deletion_requests
     SET status = 'cancelled'::public.deletion_request_status,
         cancelled_at = now()
   WHERE user_id = v_uid
     AND status = 'pending'::public.deletion_request_status
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_request_account_deletion(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_request_account_deletion(text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_cancel_account_deletion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cancel_account_deletion() TO authenticated;

-- PII scrub. SERVICE ROLE ONLY (cron): revoked from every browser role.
-- Financial records (orders, payments, wallet ledger, coupons, redemptions)
-- are retained per Israeli bookkeeping rules (7 years), pseudonymized.
-- App-side prerequisites before calling: revoke Cardcom tokens via API,
-- ban + tombstone the auth.users email via supabase.auth.admin.
CREATE OR REPLACE FUNCTION public.fn_execute_account_deletion(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.account_deletion_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
  FROM public.account_deletion_requests
  WHERE user_id = p_user_id
    AND status = 'pending'::public.deletion_request_status
  FOR UPDATE;

  IF v_req.id IS NULL OR v_req.cancel_deadline_at > now() THEN
    RETURN false;   -- no due pending request (grace window still open)
  END IF;

  -- 1. profiles: strip PII, keep the row (orders reference the user)
  UPDATE public.profiles
     SET email          = 'deleted-' || substr(md5(id::text), 1, 12) || '@removed.invalid',
         full_name      = 'משתמש שנמחק',
         phone          = NULL,
         avatar_url     = NULL,
         affiliate_code = NULL,
         anonymized_at  = now()
   WHERE id = p_user_id;

  -- 2. Pure-PII rows: hard delete
  DELETE FROM public.user_addresses WHERE user_id = p_user_id;
  DELETE FROM public.payment_tokens WHERE profile_id = p_user_id;
  DELETE FROM public.carts WHERE profile_id = p_user_id;
  DELETE FROM public.user_notification_preferences WHERE user_id = p_user_id;

  -- 3. Pending notifications are cancelled, history rows keep no payload PII
  UPDATE public.notifications_outbox
     SET status = 'cancelled'::public.notification_status
   WHERE user_id = p_user_id
     AND status = 'queued'::public.notification_status;

  -- 4. audit_log carried old PII inside changes (including the scrub UPDATE
  --    above, which the profiles audit trigger just logged). Clean it last.
  UPDATE public.audit_log
     SET changes    = '{}'::jsonb,
         metadata   = metadata || jsonb_build_object('pii_scrubbed', true),
         ip_address = NULL,
         user_agent = NULL
   WHERE actor_id = p_user_id
      OR (entity_type = 'profiles' AND entity_id = p_user_id)
      OR changes->>'profile_id' = p_user_id::text
      OR changes->>'user_id'    = p_user_id::text;

  UPDATE public.account_deletion_requests
     SET status = 'completed'::public.deletion_request_status,
         completed_at = now()
   WHERE id = v_req.id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_execute_account_deletion(uuid) FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 9. Coupon expiry reminders (daily cron -> outbox; dedupe makes re-runs no-ops)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.fn_enqueue_coupon_expiry_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_batch int;
BEGIN
  -- 7-day email reminders
  WITH ins AS (
    INSERT INTO public.notifications_outbox (user_id, kind, channel, payload, dedupe_key)
    SELECT c.user_id,
           'coupon_expiry_7d',
           'email',
           jsonb_build_object('coupon_code_id', c.id, 'expires_at', c.expires_at),
           'coupon_expiry_7d:' || c.id::text
    FROM public.coupon_codes c
    JOIN public.user_notification_preferences p ON p.user_id = c.user_id
    WHERE c.status = 'issued'::public.coupon_status
      AND c.deleted_at IS NULL
      AND c.expires_at BETWEEN now() AND now() + interval '7 days'
      AND p.coupon_expiry_email
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch, 0);

  -- 48-hour reminders: email + in-app
  WITH ins AS (
    INSERT INTO public.notifications_outbox (user_id, kind, channel, payload, dedupe_key)
    SELECT c.user_id,
           'coupon_expiry_48h',
           ch.channel,
           jsonb_build_object('coupon_code_id', c.id, 'expires_at', c.expires_at),
           'coupon_expiry_48h:' || ch.channel || ':' || c.id::text
    FROM public.coupon_codes c
    JOIN public.user_notification_preferences p ON p.user_id = c.user_id
    CROSS JOIN (VALUES ('email'), ('inapp')) AS ch(channel)
    WHERE c.status = 'issued'::public.coupon_status
      AND c.deleted_at IS NULL
      AND c.expires_at BETWEEN now() AND now() + interval '48 hours'
      AND ((ch.channel = 'email' AND p.coupon_expiry_email)
        OR (ch.channel = 'inapp' AND p.coupon_expiry_inapp))
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch, 0);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_enqueue_coupon_expiry_reminders() FROM PUBLIC, anon, authenticated;

-- ===========================================================================
-- 10. Audit trigger on deletion requests (025 fn -> audit_log)
-- ===========================================================================

DROP TRIGGER IF EXISTS audit_account_deletion_requests ON public.account_deletion_requests;
CREATE TRIGGER audit_account_deletion_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.account_deletion_requests
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
