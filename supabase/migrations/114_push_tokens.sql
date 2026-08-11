-- 114_push_tokens.sql
--
-- Push notifications for the mobile app, delivered through the SAME queue that
-- already carries email: `notification_outbox`.
--
-- WHY NOT A SECOND QUEUE. The outbox is filled in-transaction by the triggers
-- in 095 at the moment the event happens, and that is the only place that knows
-- an event is owed. A parallel push queue would need the same triggers to write
-- twice, and the two would drift the first time one insert failed. So a row
-- keeps carrying one logical notification and gains a SECOND transport with its
-- own status, attempt counter and backoff. Email delivery and push delivery
-- succeed and fail independently; neither masks the other.
--
-- WHY user_id ON THE OUTBOX. The queue was addressed by email, because Resend
-- is. A device is addressed by user. Rather than rewrite every trigger, the
-- 4-argument `fn_enqueue_notification` now resolves the profile itself, so
-- every existing enqueue site gains push targeting without being touched. The
-- 5-argument form exists for callers that already hold the user id and should
-- not pay for the lookup.
--
-- WHAT IS DELIBERATELY NOT HERE. No marketing push. 031 §5.2 puts marketing
-- under the full 30א consent regime and this migration carries no consent
-- column, so it must not become the transport for it. The three kinds wired to
-- push are transactional and each one is the direct consequence of something
-- the customer did: a coupon they bought, a coupon they own running out, and
-- money credited to their wallet.

-- 001 is not idempotent and may stop early on a live database, so migrations
-- 005+ re-assert this before referencing it.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. push_tokens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The Expo push token, `ExponentPushToken[...]`. Unique across the table:
  -- reinstalling on the same device mints the same token, and a second row for
  -- it would send every notification twice.
  expo_token      text        NOT NULL UNIQUE,
  platform        text        NOT NULL DEFAULT 'unknown',
  -- Stable per install. Used to retire a token when the same device reports a
  -- new one, which is what Expo does after a store update on Android.
  device_id       text,
  app_version     text,
  locale          text        NOT NULL DEFAULT 'he',
  -- A token is disabled, never deleted, when Expo answers DeviceNotRegistered:
  -- the row is the evidence for why the customer stopped getting push.
  enabled         boolean     NOT NULL DEFAULT true,
  disabled_reason text,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS disabled_reason text;
ALTER TABLE public.push_tokens
  ADD COLUMN IF NOT EXISTS app_version text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_tokens_platform_check'
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_platform_check
      CHECK (platform IN ('ios', 'android', 'unknown'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS push_tokens_user_enabled_idx
  ON public.push_tokens (user_id) WHERE enabled;

CREATE INDEX IF NOT EXISTS push_tokens_device_idx
  ON public.push_tokens (user_id, device_id) WHERE device_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.push_tokens;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- A device token is as personal as an address row: the owner may see and manage
-- their own and nothing else. The drain runs as the service role and bypasses
-- all of this.
DROP POLICY IF EXISTS "push_tokens_select_own" ON public.push_tokens;
CREATE POLICY "push_tokens_select_own" ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_tokens_insert_own" ON public.push_tokens;
CREATE POLICY "push_tokens_insert_own" ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_tokens_update_own" ON public.push_tokens;
CREATE POLICY "push_tokens_update_own" ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_tokens_delete_own" ON public.push_tokens;
CREATE POLICY "push_tokens_delete_own" ON public.push_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.push_tokens IS
  'Expo push tokens per user per device. Disabled, not deleted, on DeviceNotRegistered.';

-- ---------------------------------------------------------------------------
-- 2. The outbox gains a second transport
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 'pending' means "a push is owed and not yet sent". 'none' means "this kind
-- has no push template", which the drain writes once so it never reconsiders
-- the row. The two are different facts and collapsing them would make a
-- template bug look like a delivered notification.
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS push_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS push_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS push_error text;
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS push_next_attempt_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_push_status_check'
  ) THEN
    ALTER TABLE public.notification_outbox
      ADD CONSTRAINT notification_outbox_push_status_check
      CHECK (push_status IN ('pending', 'sent', 'none', 'skipped', 'dead'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_outbox_push_due_idx
  ON public.notification_outbox (push_next_attempt_at)
  WHERE push_status = 'pending';

-- Rows that predate this migration were queued before any device existed. They
-- are settled as 'none' rather than left 'pending', so the first drain after
-- deploy does not push a backlog of stale notices at whoever installs first.
UPDATE public.notification_outbox
   SET push_status = 'none'
 WHERE push_status = 'pending'
   AND created_at < now();

-- ---------------------------------------------------------------------------
-- 3. Enqueue: same contract, now user-aware
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enqueue_notification(
  p_kind    text,
  p_email   text,
  p_dedupe  text,
  p_payload jsonb,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN;
  END IF;

  IF to_regclass('public.email_suppressions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.email_suppressions s WHERE lower(s.email) = v_email
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.notification_outbox (kind, recipient_email, dedupe_key, payload, user_id)
  VALUES (p_kind, v_email, p_dedupe, coalesce(p_payload, '{}'::jsonb), p_user_id)
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$function$;

-- The 4-argument form every trigger already calls. It resolves the profile by
-- email so those triggers gain push targeting without being rewritten. A
-- supplier alert resolves to NULL here, which is correct: suppliers do not have
-- the customer app, and their row will settle as push_status 'none'.
CREATE OR REPLACE FUNCTION public.fn_enqueue_notification(
  p_kind    text,
  p_email   text,
  p_dedupe  text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT p.id INTO v_user_id
    FROM public.profiles p
   WHERE lower(p.email) = lower(btrim(coalesce(p_email, '')))
   LIMIT 1;

  PERFORM public.fn_enqueue_notification(p_kind, p_email, p_dedupe, p_payload, v_user_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Reading the targets
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because the drain has to read tokens for a user other than
-- itself, and because the email fallback crosses into `profiles`. Returns the
-- token rows only; nothing here can be used to enumerate users, since the
-- caller must already hold either the user id or the exact email.
CREATE OR REPLACE FUNCTION public.fn_push_targets(
  p_user_id uuid,
  p_email   text
)
RETURNS TABLE (expo_token text, platform text, locale text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.expo_token, t.platform, t.locale
    FROM public.push_tokens t
   WHERE t.enabled
     AND t.user_id = COALESCE(
           p_user_id,
           (SELECT p.id FROM public.profiles p
             WHERE lower(p.email) = lower(btrim(coalesce(p_email, '')))
             LIMIT 1)
         );
$function$;

REVOKE ALL ON FUNCTION public.fn_push_targets(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_push_targets(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Expiry reminders
-- ---------------------------------------------------------------------------

-- The revenue nerve of 031 §5.2: a coupon nobody remembers is a coupon nobody
-- redeems. Queued at a fixed set of days-remaining buckets so a customer gets a
-- reminder at 7 days and again at 1, and never twice for the same bucket - the
-- dedupe key carries the bucket.
--
-- Runs against `issued` vouchers only. A redeemed or already-expired voucher
-- owes nothing, and the nightly sweep in expire-vouchers has already moved
-- anything past its deadline out of `issued` before this is called.
CREATE OR REPLACE FUNCTION public.enqueue_expiring_voucher_notices(
  p_buckets integer[] DEFAULT ARRAY[7, 1]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bucket integer;
  v_queued integer := 0;
  v_before integer;
  v_after  integer;
BEGIN
  FOREACH v_bucket IN ARRAY p_buckets LOOP
    SELECT count(*)::integer INTO v_before FROM public.notification_outbox;

    PERFORM public.fn_enqueue_notification(
      'voucher_expiring',
      pr.email,
      'voucher_expiring:' || v.id::text || ':' || v_bucket::text,
      jsonb_build_object(
        'voucher_id',     v.id,
        'code',           v.code,
        'product_name',   p.name_he,
        'supplier_name',  s.name,
        'expires_at',     v.expires_at,
        'days_remaining', v_bucket
      ),
      v.user_id
    )
    FROM public.vouchers v
    LEFT JOIN public.products  p  ON p.id = v.product_id
    LEFT JOIN public.suppliers s  ON s.id = v.supplier_id
    LEFT JOIN public.profiles  pr ON pr.id = v.user_id
    WHERE v.status = 'issued'::public.voucher_status
      AND v.expires_at IS NOT NULL
      AND pr.email IS NOT NULL
      -- The whole calendar day that is `v_bucket` days from today, in Israeli
      -- local time. Comparing timestamps directly would fire only for vouchers
      -- that happen to expire in the same minute the job runs.
      AND (v.expires_at AT TIME ZONE 'Asia/Jerusalem')::date
          = ((now() AT TIME ZONE 'Asia/Jerusalem')::date + v_bucket);

    SELECT count(*)::integer INTO v_after FROM public.notification_outbox;
    v_queued := v_queued + greatest(v_after - v_before, 0);
  END LOOP;

  RETURN v_queued;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_expiring_voucher_notices(integer[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_expiring_voucher_notices(integer[]) TO service_role;
