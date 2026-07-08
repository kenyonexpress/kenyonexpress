-- Migration 031: Notifications, Messaging & Marketing Automation (DRAFT - DO NOT APPLY YET)
-- ============================================================================
-- Design: docs/NOTIFICATIONS-MARKETING-ARCHITECTURE.md
-- Builds ON TOP of 029_accounts.sql (notifications_outbox,
-- user_notification_preferences, enum notification_status). Does not replace
-- or redefine anything owned by 029 (incl. fn_enqueue_coupon_expiry_reminders).
-- Prerequisites on the target DB: 011+025 (audit_log + trigger fn),
-- 019 (check_user_rate_limit), 029 (outbox + prefs).
-- No dependency on 026/027/028 drafts (references guarded).
-- Fully idempotent. Apply only via MCP apply_migration.
-- ============================================================================

-- Defensive: 001 may have stopped early on a live DB before defining this.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ---------------------------------------------------------------------------
-- 0. Hard prerequisite check: 029 must be applied first
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF to_regclass('public.notifications_outbox') IS NULL
     OR to_regclass('public.user_notification_preferences') IS NULL THEN
    RAISE EXCEPTION '031_notifications requires 029_accounts (notifications_outbox + user_notification_preferences missing)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. notification_status: new terminal states.
--    'dead'    = retries exhausted (dead-letter, admin requeue only)
--    'skipped' = consent/suppression check failed at send time (not an error)
--    ADD VALUE IF NOT EXISTS is idempotent. The new labels are deliberately
--    NEVER used in DDL (indexes, defaults, views) inside this migration, only
--    inside plpgsql bodies (resolved at runtime), so same-transaction use is safe.
-- ---------------------------------------------------------------------------

ALTER TYPE public.notification_status ADD VALUE IF NOT EXISTS 'dead';
ALTER TYPE public.notification_status ADD VALUE IF NOT EXISTS 'skipped';

-- ---------------------------------------------------------------------------
-- 2. notification_templates: versioned message templates.
--    Exactly one active version per (template_key, channel, locale).
--    WhatsApp bodies live at Meta (pre-approved); we store the registered name.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key           text        NOT NULL,  -- e.g. 'order_paid', 'abandoned_cart_1'
  channel                text        NOT NULL CHECK (channel IN ('email', 'inapp', 'push', 'sms', 'whatsapp')),
  locale                 text        NOT NULL DEFAULT 'he' CHECK (locale IN ('he', 'en')),
  version                int         NOT NULL CHECK (version > 0),
  subject                text,                  -- email subject / inapp title
  body_text              text,                  -- sms / inapp / email plaintext
  body_html              text,                  -- email html (dir="rtl" rules per doc 3.5)
  whatsapp_template_name text,                  -- Meta-registered template name
  variables              jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- expected placeholders
  is_active              boolean     NOT NULL DEFAULT false,
  notes                  text,
  created_by             uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_key_version_uq UNIQUE (template_key, channel, locale, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_one_active_idx
  ON public.notification_templates (template_key, channel, locale)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS notification_templates_key_idx
  ON public.notification_templates (template_key, channel);

DROP TRIGGER IF EXISTS set_updated_at ON public.notification_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic version switch: deactivate siblings, activate the target.
CREATE OR REPLACE FUNCTION public.fn_activate_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tpl public.notification_templates%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_tpl FROM public.notification_templates
  WHERE id = p_template_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  UPDATE public.notification_templates
     SET is_active = false
   WHERE template_key = v_tpl.template_key
     AND channel = v_tpl.channel
     AND locale = v_tpl.locale
     AND is_active = true
     AND id <> p_template_id;

  UPDATE public.notification_templates
     SET is_active = true
   WHERE id = p_template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_activate_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_activate_template(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. notification_events: append-only domain events (facts, not deliveries).
--    Written only by triggers below via fn_emit_notification_event.
--    Fan-out (section 10) turns events into outbox rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text        NOT NULL,  -- 'order_paid' | 'order_refunded' | 'order_item_shipped' | 'order_item_delivered' | 'coupon_delivered' | 'coupon_refunded'
  entity_type  text        NOT NULL,  -- 'order' | 'order_item' | 'coupon_code'
  entity_id    uuid        NOT NULL,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- ids + facts only, NO PII
  dedupe_key   text        NOT NULL UNIQUE,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_events_unprocessed_idx
  ON public.notification_events (occurred_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS notification_events_entity_idx
  ON public.notification_events (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.fn_emit_notification_event(
  p_dedupe      text,
  p_event_type  text,
  p_entity_type text,
  p_entity_id   uuid,
  p_user_id     uuid,
  p_payload     jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_events
    (dedupe_key, event_type, entity_type, entity_id, user_id, payload)
  VALUES
    (p_dedupe, p_event_type, p_entity_type, p_entity_id, p_user_id, COALESCE(p_payload, '{}'::jsonb))
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_emit_notification_event(text, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Event triggers on core tables (live: orders 007, order_items 007,
--    coupon_codes 008). Payload carries ids and money facts only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_orders_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'paid'::public.order_status THEN
      PERFORM public.fn_emit_notification_event(
        'order_paid:' || NEW.id::text,
        'order_paid', 'order', NEW.id, NEW.user_id,
        jsonb_build_object('order_id', NEW.id, 'total_ils', NEW.total_ils,
                           'invoice_number', NEW.invoice_number));
    ELSIF NEW.status = 'refunded'::public.order_status THEN
      PERFORM public.fn_emit_notification_event(
        'order_refunded:' || NEW.id::text,
        'order_refunded', 'order', NEW.id, NEW.user_id,
        jsonb_build_object('order_id', NEW.id, 'total_ils', NEW.total_ils));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_orders_events ON public.orders;
CREATE TRIGGER notify_orders_events
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_orders_notification_events();

CREATE OR REPLACE FUNCTION public.trg_order_items_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.item_status IS DISTINCT FROM OLD.item_status THEN
    SELECT o.user_id INTO v_user_id FROM public.orders o WHERE o.id = NEW.order_id;

    IF NEW.item_status = 'shipped'::public.order_item_status THEN
      PERFORM public.fn_emit_notification_event(
        'order_item_shipped:' || NEW.id::text,
        'order_item_shipped', 'order_item', NEW.id, v_user_id,
        jsonb_build_object('order_item_id', NEW.id, 'order_id', NEW.order_id,
                           'product_id', NEW.product_id));
    ELSIF NEW.item_status = 'delivered'::public.order_item_status
          AND OLD.item_status = 'shipped'::public.order_item_status THEN
      PERFORM public.fn_emit_notification_event(
        'order_item_delivered:' || NEW.id::text,
        'order_item_delivered', 'order_item', NEW.id, v_user_id,
        jsonb_build_object('order_item_id', NEW.id, 'order_id', NEW.order_id,
                           'product_id', NEW.product_id));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_items_events ON public.order_items;
CREATE TRIGGER notify_order_items_events
  AFTER UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_items_notification_events();

CREATE OR REPLACE FUNCTION public.trg_coupon_codes_notification_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'issued'::public.coupon_status THEN
      PERFORM public.fn_emit_notification_event(
        'coupon_delivered:' || NEW.id::text,
        'coupon_delivered', 'coupon_code', NEW.id, NEW.user_id,
        jsonb_build_object('coupon_code_id', NEW.id, 'product_id', NEW.product_id,
                           'expires_at', NEW.expires_at));
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'refunded'::public.coupon_status
       AND OLD.status = 'issued'::public.coupon_status THEN
      PERFORM public.fn_emit_notification_event(
        'coupon_refunded:' || NEW.id::text,
        'coupon_refunded', 'coupon_code', NEW.id, NEW.user_id,
        jsonb_build_object('coupon_code_id', NEW.id, 'product_id', NEW.product_id));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_coupon_codes_events ON public.coupon_codes;
CREATE TRIGGER notify_coupon_codes_events
  AFTER INSERT OR UPDATE ON public.coupon_codes
  FOR EACH ROW EXECUTE FUNCTION public.trg_coupon_codes_notification_events();

-- NOTE: no trigger on payments (026 draft). Payment receipt content is carried
-- by 'order_paid' (invoice_number in payload), so 031 has no dependency on 026.

-- ---------------------------------------------------------------------------
-- 5. notifications_outbox extensions (029 table).
--    Delivery mechanics: retries, worker claim, provider echo, attribution.
-- ---------------------------------------------------------------------------

ALTER TABLE public.notifications_outbox
  ADD COLUMN IF NOT EXISTS event_id            uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_key        text,
  ADD COLUMN IF NOT EXISTS template_id         uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_marketing        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS journey_key         text,
  ADD COLUMN IF NOT EXISTS attempts            int         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at           timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by           text,
  ADD COLUMN IF NOT EXISTS provider            text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS to_address          text;       -- snapshot at send time (email/phone actually used)

-- Widen the channel CHECK (029 shipped without 'whatsapp')
DO $$ BEGIN
  ALTER TABLE public.notifications_outbox
    DROP CONSTRAINT IF EXISTS notifications_outbox_channel_check;
  ALTER TABLE public.notifications_outbox
    ADD CONSTRAINT notifications_outbox_channel_check
    CHECK (channel IN ('email', 'inapp', 'push', 'sms', 'whatsapp'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Claim path: due queued rows ('queued' is a pre-existing enum label, safe in DDL)
CREATE INDEX IF NOT EXISTS notifications_outbox_due_idx
  ON public.notifications_outbox (next_attempt_at)
  WHERE status = 'queued'::public.notification_status;

CREATE INDEX IF NOT EXISTS notifications_outbox_journey_idx
  ON public.notifications_outbox (journey_key, created_at DESC)
  WHERE journey_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_outbox_marketing_freq_idx
  ON public.notifications_outbox (user_id, created_at DESC)
  WHERE is_marketing = true;

-- ---------------------------------------------------------------------------
-- 6. user_notification_preferences extensions: WhatsApp channels.
--    All default FALSE: WhatsApp requires explicit per-user opt-in
--    (Meta policy for all message classes; anti-spam law 30A for marketing).
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS order_updates_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coupon_expiry_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_whatsapp     boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 7. consent_events: append-only legal evidence for anti-spam law 30A.
--    State lives in user_notification_preferences; history lives here.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.consent_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel         text        NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'all')),
  topic           text        NOT NULL CHECK (topic IN ('marketing', 'order_updates', 'coupon_expiry', 'wallet')),
  action          text        NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
  source          text        NOT NULL CHECK (source IN
                    ('account_page', 'checkout', 'unsubscribe_link', 'sms_reply',
                     'whatsapp_reply', 'complaint_webhook', 'admin')),
  wording_version text,
  ip              inet,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS consent_events_user_idx
  ON public.consent_events (user_id, created_at DESC);

ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;

-- Owner + admin read; NO write policies: writes go only through the
-- SECURITY DEFINER functions below (append-only, no UPDATE/DELETE for anyone).
DROP POLICY IF EXISTS "consent_events: owner select" ON public.consent_events;
CREATE POLICY "consent_events: owner select"
  ON public.consent_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "consent_events: admin select" ON public.consent_events;
CREATE POLICY "consent_events: admin select"
  ON public.consent_events FOR SELECT TO authenticated
  USING (public.is_admin());

-- Self-service consent switch (account page / checkout opt-in).
CREATE OR REPLACE FUNCTION public.fn_set_marketing_consent(
  p_channel text,               -- 'email' | 'sms' | 'whatsapp' | 'all'
  p_granted boolean,
  p_source  text DEFAULT 'account_page',
  p_wording text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_channel NOT IN ('email', 'sms', 'whatsapp', 'all') THEN
    RAISE EXCEPTION 'invalid channel: %', p_channel;
  END IF;

  IF p_source NOT IN ('account_page', 'checkout') THEN
    RAISE EXCEPTION 'invalid source for self-service consent: %', p_source;
  END IF;

  IF NOT public.check_user_rate_limit(v_uid, 'consent_change', 20, 3600) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  UPDATE public.user_notification_preferences
     SET marketing_email    = CASE WHEN p_channel IN ('email', 'all')    THEN p_granted ELSE marketing_email    END,
         marketing_sms      = CASE WHEN p_channel IN ('sms', 'all')      THEN p_granted ELSE marketing_sms      END,
         marketing_whatsapp = CASE WHEN p_channel IN ('whatsapp', 'all') THEN p_granted ELSE marketing_whatsapp END
   WHERE user_id = v_uid;

  INSERT INTO public.consent_events (user_id, channel, topic, action, source, wording_version)
  VALUES (v_uid, p_channel, 'marketing',
          CASE WHEN p_granted THEN 'opt_in' ELSE 'opt_out' END,
          p_source, p_wording);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_marketing_consent(text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_marketing_consent(text, boolean, text, text) TO authenticated;

-- Unsubscribe without login (signed-link route, SMS reply, WhatsApp STOP,
-- provider complaint). Service role only: the app route verifies the HMAC
-- token and calls this with the resolved user_id.
CREATE OR REPLACE FUNCTION public.fn_unsubscribe_marketing(
  p_user_id uuid,
  p_channel text DEFAULT 'all',
  p_source  text DEFAULT 'unsubscribe_link'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_channel NOT IN ('email', 'sms', 'whatsapp', 'all') THEN
    RAISE EXCEPTION 'invalid channel: %', p_channel;
  END IF;

  UPDATE public.user_notification_preferences
     SET marketing_email    = CASE WHEN p_channel IN ('email', 'all')    THEN false ELSE marketing_email    END,
         marketing_sms      = CASE WHEN p_channel IN ('sms', 'all')      THEN false ELSE marketing_sms      END,
         marketing_whatsapp = CASE WHEN p_channel IN ('whatsapp', 'all') THEN false ELSE marketing_whatsapp END
   WHERE user_id = p_user_id;

  INSERT INTO public.consent_events (user_id, channel, topic, action, source)
  VALUES (p_user_id, p_channel, 'marketing', 'opt_out', p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_unsubscribe_marketing(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. channel_suppressions: hard-bounce / complaint / STOP blocklist.
--    Checked by the send worker before every dispatch.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.channel_suppressions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel    text        NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  address    text        NOT NULL,  -- email address or E.164 phone
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reason     text        NOT NULL CHECK (reason IN ('hard_bounce', 'complaint', 'manual', 'stop_reply')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_suppressions_channel_address_uq UNIQUE (channel, address)
);

ALTER TABLE public.channel_suppressions ENABLE ROW LEVEL SECURITY;

-- Admin read; writes only via service role / fn_ingest_delivery_event.
DROP POLICY IF EXISTS "suppressions: admin select" ON public.channel_suppressions;
CREATE POLICY "suppressions: admin select"
  ON public.channel_suppressions FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "suppressions: admin delete" ON public.channel_suppressions;
CREATE POLICY "suppressions: admin delete"
  ON public.channel_suppressions FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9. notification_delivery_events: provider webhooks (delivered / bounced /
--    complained / read / clicked). Same replay-guard pattern as
--    payment_webhook_events (026): UNIQUE (provider, external_event_id).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_delivery_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text        NOT NULL,  -- 'resend' | 'meta_whatsapp' | 'sms_il' | ...
  external_event_id text        NOT NULL,
  outbox_id         uuid        REFERENCES public.notifications_outbox(id) ON DELETE SET NULL,
  event             text        NOT NULL CHECK (event IN
                      ('delivered', 'bounced', 'complained', 'opened', 'clicked', 'read', 'failed')),
  payload           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  received_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_events_dedup UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS notification_delivery_events_outbox_idx
  ON public.notification_delivery_events (outbox_id);

ALTER TABLE public.notification_delivery_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_events: admin select" ON public.notification_delivery_events;
CREATE POLICY "delivery_events: admin select"
  ON public.notification_delivery_events FOR SELECT TO authenticated
  USING (public.is_admin());

-- Single ingest path: dedup + side effects (delivered_at, suppression,
-- complaint = automatic marketing opt-out). Called by the webhook route
-- (service role) AFTER provider signature verification.
CREATE OR REPLACE FUNCTION public.fn_ingest_delivery_event(
  p_provider          text,
  p_external_event_id text,
  p_outbox_id         uuid,
  p_event             text,
  p_payload           jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      uuid;
  v_outbox  public.notifications_outbox%ROWTYPE;
  v_address text;
BEGIN
  INSERT INTO public.notification_delivery_events
    (provider, external_event_id, outbox_id, event, payload)
  VALUES
    (p_provider, p_external_event_id, p_outbox_id, p_event, COALESCE(p_payload, '{}'::jsonb))
  ON CONFLICT (provider, external_event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN NULL;  -- replayed webhook: no-op
  END IF;

  IF p_outbox_id IS NULL THEN
    RETURN v_id;
  END IF;

  SELECT * INTO v_outbox FROM public.notifications_outbox WHERE id = p_outbox_id;
  IF NOT FOUND THEN
    RETURN v_id;
  END IF;

  v_address := COALESCE(v_outbox.to_address, p_payload->>'address');

  IF p_event = 'delivered' THEN
    UPDATE public.notifications_outbox
       SET delivered_at = COALESCE(delivered_at, now())
     WHERE id = p_outbox_id;

  ELSIF p_event IN ('bounced', 'complained') AND v_address IS NOT NULL THEN
    INSERT INTO public.channel_suppressions (channel, address, user_id, reason)
    VALUES (v_outbox.channel, v_address, v_outbox.user_id,
            CASE WHEN p_event = 'bounced' THEN 'hard_bounce' ELSE 'complaint' END)
    ON CONFLICT (channel, address) DO NOTHING;

    -- A spam complaint IS an unsubscribe. Immediate, automatic, logged.
    IF p_event = 'complained' THEN
      PERFORM public.fn_unsubscribe_marketing(v_outbox.user_id, 'all', 'complaint_webhook');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ingest_delivery_event(text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. Marketing policy helpers: quiet hours + frequency caps.
--     Marketing window: 09:00-21:00 Asia/Jerusalem; none from Friday 15:00
--     until Saturday 20:30. Transactional messages ignore all of this.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_in_marketing_window(p_at timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_local timestamp := p_at AT TIME ZONE 'Asia/Jerusalem';
  v_dow   int := EXTRACT(dow FROM v_local)::int;   -- 0=Sunday .. 5=Friday, 6=Saturday
  v_min   int := EXTRACT(hour FROM v_local)::int * 60 + EXTRACT(minute FROM v_local)::int;
BEGIN
  IF v_dow = 6 THEN
    RETURN v_min >= 20 * 60 + 30 AND v_min < 21 * 60;   -- Saturday: 20:30-21:00 only
  END IF;
  IF v_dow = 5 AND v_min >= 15 * 60 THEN
    RETURN false;                                        -- Friday: nothing after 15:00
  END IF;
  RETURN v_min >= 9 * 60 AND v_min < 21 * 60;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_next_marketing_window(p_from timestamptz DEFAULT now())
RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v timestamptz;
BEGIN
  IF public.fn_in_marketing_window(p_from) THEN
    RETURN p_from;
  END IF;
  v := date_trunc('hour', p_from);
  FOR i IN 1..400 LOOP                                   -- 30-min steps, > 8 days horizon
    v := v + interval '30 minutes';
    IF public.fn_in_marketing_window(v) THEN
      RETURN v;
    END IF;
  END LOOP;
  RETURN p_from;                                         -- unreachable fallback
END;
$$;

-- Cap: at most 1 marketing message per 24h and 3 per 7 days, counted on
-- CREATED outbox rows (incl. queued) so a double cron run cannot bypass it.
CREATE OR REPLACE FUNCTION public.fn_marketing_frequency_ok(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day  int;
  v_week int;
BEGIN
  SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours'),
         count(*) FILTER (WHERE created_at > now() - interval '7 days')
    INTO v_day, v_week
  FROM public.notifications_outbox
  WHERE user_id = p_user_id
    AND is_marketing = true
    AND status <> 'cancelled'::public.notification_status;

  RETURN v_day < 1 AND v_week < 3;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_in_marketing_window(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_next_marketing_window(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_marketing_frequency_ok(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 11. Fan-out: events -> outbox rows, applying the routing matrix (doc 2.3)
--     plus preferences and phone presence. Transactional only; marketing
--     journeys enqueue directly (sections 13-14). Runs on a 1-minute cron.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_fanout_notification_events(p_batch int DEFAULT 200)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_evt   record;
  v_phone text;
  v_count int := 0;
BEGIN
  FOR v_evt IN
    SELECT e.* FROM public.notification_events e
    WHERE e.processed_at IS NULL
    ORDER BY e.occurred_at
    LIMIT p_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_evt.user_id IS NOT NULL THEN
      SELECT phone INTO v_phone FROM public.profiles WHERE id = v_evt.user_id;

      -- in-app bell: always, for every transactional event
      INSERT INTO public.notifications_outbox
        (user_id, kind, channel, payload, dedupe_key, is_marketing, template_key, event_id)
      VALUES
        (v_evt.user_id, v_evt.event_type, 'inapp', v_evt.payload,
         v_evt.dedupe_key || ':inapp', false, v_evt.event_type, v_evt.id)
      ON CONFLICT (dedupe_key) DO NOTHING;

      -- email: refund events always (financial document); the rest per prefs
      IF v_evt.event_type IN ('order_refunded', 'coupon_refunded')
         OR (v_evt.event_type IN ('order_paid', 'coupon_delivered', 'order_item_shipped')
             AND EXISTS (SELECT 1 FROM public.user_notification_preferences p
                         WHERE p.user_id = v_evt.user_id AND p.order_updates_email))
      THEN
        INSERT INTO public.notifications_outbox
          (user_id, kind, channel, payload, dedupe_key, is_marketing, template_key, event_id)
        VALUES
          (v_evt.user_id, v_evt.event_type, 'email', v_evt.payload,
           v_evt.dedupe_key || ':email', false, v_evt.event_type, v_evt.id)
        ON CONFLICT (dedupe_key) DO NOTHING;
      END IF;

      -- whatsapp: utility updates, only with opt-in and a phone on file
      IF v_phone IS NOT NULL
         AND v_evt.event_type IN ('order_paid', 'coupon_delivered',
                                  'order_item_shipped', 'order_item_delivered')
         AND EXISTS (SELECT 1 FROM public.user_notification_preferences p
                     WHERE p.user_id = v_evt.user_id AND p.order_updates_whatsapp)
      THEN
        INSERT INTO public.notifications_outbox
          (user_id, kind, channel, payload, dedupe_key, is_marketing, template_key, event_id)
        VALUES
          (v_evt.user_id, v_evt.event_type, 'whatsapp', v_evt.payload,
           v_evt.dedupe_key || ':whatsapp', false, v_evt.event_type, v_evt.id)
        ON CONFLICT (dedupe_key) DO NOTHING;
      END IF;
    END IF;

    UPDATE public.notification_events SET processed_at = now() WHERE id = v_evt.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fanout_notification_events(int) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Worker surface: claim / mark sent / mark failed / mark skipped / requeue.
--     All service-role except requeue (admin, checked inside).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_claim_notification_batch(
  p_worker text,
  p_limit  int DEFAULT 50
) RETURNS SETOF public.notifications_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notifications_outbox o
     SET locked_at = now(), locked_by = p_worker
   WHERE o.id IN (
     SELECT i.id FROM public.notifications_outbox i
     WHERE i.status = 'queued'::public.notification_status
       AND i.scheduled_for <= now()
       AND i.next_attempt_at <= now()
       AND (i.locked_at IS NULL OR i.locked_at < now() - interval '10 minutes')
     ORDER BY i.scheduled_for
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_mark_notification_sent(
  p_id                  uuid,
  p_provider            text,
  p_provider_message_id text DEFAULT NULL,
  p_template_id         uuid DEFAULT NULL,   -- exact template version used
  p_to_address          text DEFAULT NULL    -- address actually dispatched to
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications_outbox
     SET status              = 'sent'::public.notification_status,
         sent_at             = now(),
         provider            = p_provider,
         provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
         template_id         = COALESCE(p_template_id, template_id),
         to_address          = COALESCE(p_to_address, to_address),
         locked_at           = NULL,
         locked_by           = NULL,
         error               = NULL
   WHERE id = p_id
     AND status = 'queued'::public.notification_status;
END;
$$;

-- Exponential backoff: 5min * 2^attempts, capped at 6h; dead after 5 attempts.
CREATE OR REPLACE FUNCTION public.fn_mark_notification_failed(
  p_id    uuid,
  p_error text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications_outbox
     SET attempts        = attempts + 1,
         error           = p_error,
         locked_at       = NULL,
         locked_by       = NULL,
         status          = CASE WHEN attempts + 1 >= 5
                                THEN 'dead'::public.notification_status
                                ELSE status END,
         next_attempt_at = now() + LEAST(
                             make_interval(mins => (5 * power(2, attempts))::int),
                             interval '6 hours')
   WHERE id = p_id
     AND status = 'queued'::public.notification_status;
END;
$$;

-- Consent/suppression rejected the message at send time. Success of the
-- consent system, not a delivery error: kept out of failure metrics.
CREATE OR REPLACE FUNCTION public.fn_mark_notification_skipped(
  p_id     uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notifications_outbox
     SET status    = 'skipped'::public.notification_status,
         error     = p_reason,
         locked_at = NULL,
         locked_by = NULL
   WHERE id = p_id
     AND status = 'queued'::public.notification_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_requeue_dead_notification(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.notifications_outbox
     SET status          = 'queued'::public.notification_status,
         attempts        = 0,
         next_attempt_at = now(),
         locked_at       = NULL,
         locked_by       = NULL,
         error           = NULL
   WHERE id = p_id
     AND status = 'dead'::public.notification_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification not found or not dead';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_claim_notification_batch(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_notification_sent(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_notification_failed(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_mark_notification_skipped(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_requeue_dead_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_requeue_dead_notification(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 13. Journey: abandoned cart (marketing, opt-in only).
--     Touch 1 at 1h (email + whatsapp if opted in), touch 2 at 24h (email).
--     Suppressed by: purchase after cart update, frequency cap, quiet hours
--     (scheduled_for pushed to the next allowed window).
--     NOTE: reads carts.items jsonb (live 001 schema). After the 026
--     cart_items cutover this function is updated in a later migration.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enqueue_abandoned_cart_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int := 0;
  v_batch int;
  v_sched timestamptz := public.fn_next_marketing_window();
BEGIN
  -- Touch 1: cart idle 1h-24h, email
  WITH candidates AS (
    SELECT c.id AS cart_id, c.profile_id AS user_id, c.updated_at
    FROM public.carts c
    JOIN public.user_notification_preferences p ON p.user_id = c.profile_id
    WHERE c.profile_id IS NOT NULL
      AND jsonb_array_length(COALESCE(c.items, '[]'::jsonb)) > 0
      AND c.updated_at BETWEEN now() - interval '24 hours' AND now() - interval '1 hour'
      AND p.marketing_email
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = c.profile_id
          AND o.created_at > c.updated_at
          AND o.status IN ('paid'::public.order_status,
                           'partially_fulfilled'::public.order_status,
                           'fulfilled'::public.order_status,
                           'refunded'::public.order_status)
      )
      AND public.fn_marketing_frequency_ok(c.profile_id)
  ), ins AS (
    INSERT INTO public.notifications_outbox
      (user_id, kind, channel, payload, dedupe_key, is_marketing, journey_key,
       template_key, scheduled_for)
    SELECT user_id, 'abandoned_cart_1', 'email',
           jsonb_build_object('cart_id', cart_id),
           'abandoned_cart_1:' || cart_id::text || ':'
             || ((updated_at AT TIME ZONE 'Asia/Jerusalem')::date)::text,
           true, 'abandoned_cart', 'abandoned_cart_1', v_sched
    FROM candidates
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch, 0);

  -- Touch 1: whatsapp variant (separate opt-in + phone on file)
  WITH candidates AS (
    SELECT c.id AS cart_id, c.profile_id AS user_id, c.updated_at
    FROM public.carts c
    JOIN public.user_notification_preferences p ON p.user_id = c.profile_id
    JOIN public.profiles pr ON pr.id = c.profile_id AND pr.phone IS NOT NULL
    WHERE c.profile_id IS NOT NULL
      AND jsonb_array_length(COALESCE(c.items, '[]'::jsonb)) > 0
      AND c.updated_at BETWEEN now() - interval '24 hours' AND now() - interval '1 hour'
      AND p.marketing_whatsapp
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = c.profile_id
          AND o.created_at > c.updated_at
          AND o.status IN ('paid'::public.order_status,
                           'partially_fulfilled'::public.order_status,
                           'fulfilled'::public.order_status,
                           'refunded'::public.order_status)
      )
      AND public.fn_marketing_frequency_ok(c.profile_id)
  ), ins AS (
    INSERT INTO public.notifications_outbox
      (user_id, kind, channel, payload, dedupe_key, is_marketing, journey_key,
       template_key, scheduled_for)
    SELECT user_id, 'abandoned_cart_1', 'whatsapp',
           jsonb_build_object('cart_id', cart_id),
           'abandoned_cart_1:whatsapp:' || cart_id::text || ':'
             || ((updated_at AT TIME ZONE 'Asia/Jerusalem')::date)::text,
           true, 'abandoned_cart', 'abandoned_cart_1', v_sched
    FROM candidates
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch, 0);

  -- Touch 2: cart idle 24h-72h, email only. Last touch, ever, for this cart.
  WITH candidates AS (
    SELECT c.id AS cart_id, c.profile_id AS user_id, c.updated_at
    FROM public.carts c
    JOIN public.user_notification_preferences p ON p.user_id = c.profile_id
    WHERE c.profile_id IS NOT NULL
      AND jsonb_array_length(COALESCE(c.items, '[]'::jsonb)) > 0
      AND c.updated_at BETWEEN now() - interval '72 hours' AND now() - interval '24 hours'
      AND p.marketing_email
      AND NOT EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = c.profile_id
          AND o.created_at > c.updated_at
          AND o.status IN ('paid'::public.order_status,
                           'partially_fulfilled'::public.order_status,
                           'fulfilled'::public.order_status,
                           'refunded'::public.order_status)
      )
      AND public.fn_marketing_frequency_ok(c.profile_id)
  ), ins AS (
    INSERT INTO public.notifications_outbox
      (user_id, kind, channel, payload, dedupe_key, is_marketing, journey_key,
       template_key, scheduled_for)
    SELECT user_id, 'abandoned_cart_2', 'email',
           jsonb_build_object('cart_id', cart_id),
           'abandoned_cart_2:' || cart_id::text || ':'
             || ((updated_at AT TIME ZONE 'Asia/Jerusalem')::date)::text,
           true, 'abandoned_cart', 'abandoned_cart_2', v_sched
    FROM candidates
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_batch FROM ins;
  v_count := v_count + COALESCE(v_batch, 0);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_enqueue_abandoned_cart_reminders() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 14. Journey: win-back (marketing, opt-in only, quarterly cap per user).
--     Coupon expiry reminders stay in 029 (fn_enqueue_coupon_expiry_reminders);
--     031 deliberately does not touch them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enqueue_winback_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_sched timestamptz := public.fn_next_marketing_window();
BEGIN
  WITH last_orders AS (
    SELECT o.user_id, max(o.created_at) AS last_order_at
    FROM public.orders o
    WHERE o.status IN ('paid'::public.order_status,
                       'partially_fulfilled'::public.order_status,
                       'fulfilled'::public.order_status)
    GROUP BY o.user_id
  ), candidates AS (
    SELECT lo.user_id
    FROM last_orders lo
    JOIN public.user_notification_preferences p ON p.user_id = lo.user_id
    WHERE lo.last_order_at < now() - interval '90 days'
      AND p.marketing_email
      AND public.fn_marketing_frequency_ok(lo.user_id)
  ), ins AS (
    INSERT INTO public.notifications_outbox
      (user_id, kind, channel, payload, dedupe_key, is_marketing, journey_key,
       template_key, scheduled_for)
    SELECT user_id, 'winback', 'email', '{}'::jsonb,
           'winback:' || user_id::text || ':'
             || to_char(now() AT TIME ZONE 'Asia/Jerusalem', 'YYYY-"Q"Q'),
           true, 'winback', 'winback', v_sched
    FROM candidates
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_enqueue_winback_reminders() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 15. Revenue attribution: notification_conversions.
--     Written by the payment webhook (service role) when the order carries a
--     notification attribution cookie (last-touch, 7-day window, app-side).
--     UNIQUE order_id: an order is attributed to at most one message.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_conversions (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id   uuid          NOT NULL REFERENCES public.notifications_outbox(id) ON DELETE CASCADE,
  order_id    uuid          NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  journey_key text,
  amount_ils  numeric(12,2) NOT NULL CHECK (amount_ils >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_conversions_journey_idx
  ON public.notification_conversions (journey_key, created_at DESC);

ALTER TABLE public.notification_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversions: admin select" ON public.notification_conversions;
CREATE POLICY "conversions: admin select"
  ON public.notification_conversions FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 16. RLS on remaining new tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- events: admin read only; writes via SECURITY DEFINER triggers
DROP POLICY IF EXISTS "notification_events: admin select" ON public.notification_events;
CREATE POLICY "notification_events: admin select"
  ON public.notification_events FOR SELECT TO authenticated
  USING (public.is_admin());

-- templates: admin manages; nobody else reads (bodies may embed internal notes)
DROP POLICY IF EXISTS "notification_templates: admin all" ON public.notification_templates;
CREATE POLICY "notification_templates: admin all"
  ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 17. Observability views. security_invoker: the caller's RLS applies, so
--     only admins (who pass the underlying policies) get rows.
--     Status labels compared as text on purpose: 'dead'/'skipped' are added
--     in this same transaction and must not be resolved as enum in DDL.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_notification_kpis
WITH (security_invoker = true) AS
SELECT date_trunc('day', o.created_at)                          AS day,
       o.channel,
       o.kind,
       o.is_marketing,
       count(*)                                                 AS created_count,
       count(*) FILTER (WHERE o.status::text = 'sent')          AS sent_count,
       count(*) FILTER (WHERE o.delivered_at IS NOT NULL)       AS delivered_count,
       count(*) FILTER (WHERE o.read_at IS NOT NULL)            AS read_count,
       count(*) FILTER (WHERE o.status::text = 'failed')        AS failed_count,
       count(*) FILTER (WHERE o.status::text = 'dead')          AS dead_count,
       count(*) FILTER (WHERE o.status::text = 'skipped')       AS skipped_count,
       count(*) FILTER (WHERE o.status::text = 'cancelled')     AS cancelled_count
FROM public.notifications_outbox o
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW public.v_journey_revenue
WITH (security_invoker = true) AS
SELECT date_trunc('month', c.created_at)                        AS month,
       COALESCE(c.journey_key, o.journey_key, o.kind, 'direct') AS journey_key,
       count(*)                                                 AS conversions,
       sum(c.amount_ils)                                        AS revenue_ils
FROM public.notification_conversions c
LEFT JOIN public.notifications_outbox o ON o.id = c.outbox_id
GROUP BY 1, 2;

-- ---------------------------------------------------------------------------
-- 18. Audit triggers (025 fn -> audit_log) on admin-managed state
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_notification_templates ON public.notification_templates;
CREATE TRIGGER audit_notification_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.notification_templates
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
