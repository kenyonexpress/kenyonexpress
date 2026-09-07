-- 173: WhatsApp Business flow: contacts (opt-in state), outbox, inbound log,
-- support tickets, and the order-status trigger that fills the outbox.
--
-- ARCHITECTURE, same shape as 095's email outbox. The database decides WHETHER
-- a message is owed, at the moment the order row changes, in-transaction; the
-- cron drain at /api/cron/whatsapp decides only WHEN it goes out. A separate
-- table rather than new columns on notification_outbox because that table's
-- kind CHECK is mirrored in three enforced places (121 + outbox-kinds.test.ts)
-- and its two delivery legs (email, push) do not describe this transport.
--
-- CONSENT IS THE GATE, NOT A PREFERENCE. fn_enqueue_whatsapp refuses to queue
-- for any phone that is not opted_in, and the drain re-checks at send time, so
-- an opt-out that lands between enqueue and drain still wins. Opt-in state
-- changes only through the inbound webhook (customer texting the keywords) or
-- an operator with the service role; no client role can write any of this.
--
-- Rollback: drop trigger tg_orders_whatsapp_status on public.orders;
--   drop function public.tg_orders_whatsapp_status(), public.fn_enqueue_whatsapp(text,text,text,jsonb),
--   public.fn_il_phone_digits(text);
--   drop table public.support_ticket_messages, public.support_tickets,
--   public.whatsapp_inbound_messages, public.whatsapp_outbox, public.whatsapp_contacts;

-- Defensive, as every migration 005+ does: 001 may stop early on a live DB.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Phone normalization, one definition for triggers and functions.
-- Same rules as normalizeIsraeliPhone in src/lib/whatsapp.ts: returns
-- international digits ("972501234567") or NULL, never a partial number.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_il_phone_digits(p_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_digits text;
  v_rest   text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_raw, '\D', '', 'g');
  IF v_digits = '' THEN RETURN NULL; END IF;

  IF left(v_digits, 3) = '972' THEN
    v_rest := regexp_replace(substr(v_digits, 4), '^0', '');
    IF length(v_rest) BETWEEN 8 AND 9 THEN RETURN '972' || v_rest; END IF;
    RETURN NULL;
  END IF;

  IF left(v_digits, 1) = '0' AND length(v_digits) BETWEEN 9 AND 10 THEN
    RETURN '972' || substr(v_digits, 2);
  END IF;

  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Contacts: one row per phone, the consent record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  phone         text        PRIMARY KEY,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'opted_in', 'opted_out')),
  source        text,
  opted_in_at   timestamptz,
  opted_out_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.whatsapp_contacts;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.whatsapp_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

-- A signed-in user may see their own consent row; all writes are service-role.
DROP POLICY IF EXISTS "whatsapp_contacts_own_read" ON public.whatsapp_contacts;
CREATE POLICY "whatsapp_contacts_own_read" ON public.whatsapp_contacts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "whatsapp_contacts_admin_read" ON public.whatsapp_contacts;
CREATE POLICY "whatsapp_contacts_admin_read" ON public.whatsapp_contacts
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_support());

-- ---------------------------------------------------------------------------
-- Outbox: one row per owed message, drained by /api/cron/whatsapp.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text        NOT NULL
                               CHECK (kind IN ('order_paid', 'order_fulfilled',
                                               'order_cancelled', 'order_refunded')),
  phone            text        NOT NULL,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key       text        NOT NULL UNIQUE,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'dead')),
  attempts         integer     NOT NULL DEFAULT 0,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_outbox_due_idx
  ON public.whatsapp_outbox (next_attempt_at)
  WHERE status = 'pending';

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_outbox_admin_read" ON public.whatsapp_outbox;
CREATE POLICY "whatsapp_outbox_admin_read" ON public.whatsapp_outbox
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Inbound log: replay protection for the Twilio webhook (MessageSid is the
-- provider's idempotency key) and the audit trail of what customers sent.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  message_sid  text        PRIMARY KEY,
  phone        text        NOT NULL,
  body         text        NOT NULL DEFAULT '',
  intent       text        NOT NULL DEFAULT 'message'
                           CHECK (intent IN ('opt_in', 'opt_out', 'message')),
  ticket_id    uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_inbound_admin_read" ON public.whatsapp_inbound_messages;
CREATE POLICY "whatsapp_inbound_admin_read" ON public.whatsapp_inbound_messages
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_support());

-- ---------------------------------------------------------------------------
-- Support tickets. First real ticket store in the schema; the contact form
-- (src/server/actions/contact.ts) mails and keeps no row, so 'contact_form'
-- and 'email' are reserved channels for when those flows start writing here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  channel     text        NOT NULL DEFAULT 'whatsapp'
                          CHECK (channel IN ('whatsapp', 'contact_form', 'email')),
  subject     text,
  status      text        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'pending', 'closed')),
  closed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.support_tickets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS support_tickets_phone_open_idx
  ON public.support_tickets (phone, created_at DESC)
  WHERE status IN ('open', 'pending');

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_own_read" ON public.support_tickets;
CREATE POLICY "support_tickets_own_read" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "support_tickets_staff_read" ON public.support_tickets;
CREATE POLICY "support_tickets_staff_read" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_support());

DROP POLICY IF EXISTS "support_tickets_staff_update" ON public.support_tickets;
CREATE POLICY "support_tickets_staff_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_support())
  WITH CHECK (public.is_admin() OR public.is_support());

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  direction    text        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body         text        NOT NULL,
  message_sid  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON public.support_ticket_messages (ticket_id, created_at);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_ticket_messages_own_read" ON public.support_ticket_messages;
CREATE POLICY "support_ticket_messages_own_read" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "support_ticket_messages_staff_read" ON public.support_ticket_messages;
CREATE POLICY "support_ticket_messages_staff_read" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_support());

-- ---------------------------------------------------------------------------
-- Enqueue, consent-gated. Mirrors fn_enqueue_notification (095): SECURITY
-- DEFINER so the order trigger can insert past RLS, ON CONFLICT DO NOTHING so
-- a status that flaps queues one message per (order, kind).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enqueue_whatsapp(
  p_kind    text,
  p_phone   text,
  p_dedupe  text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone text := public.fn_il_phone_digits(p_phone);
BEGIN
  IF v_phone IS NULL OR p_dedupe IS NULL OR p_dedupe = '' THEN
    RETURN;
  END IF;

  -- No consent row, or anything but opted_in, means no message. 'pending' is
  -- not consent: it only records that the phone has been seen.
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_contacts c
    WHERE c.phone = v_phone AND c.status = 'opted_in'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.whatsapp_outbox (kind, phone, dedupe_key, payload)
  VALUES (p_kind, v_phone, p_dedupe, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- The order trigger. Fires on the four transitions a customer cares about and
-- resolves the phone the same way support would: the profile first, then the
-- shipping address on the order. total_agorot follows 095's coalesce so it
-- keeps working whether or not 138's _agorot columns are applied.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_orders_whatsapp_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row          jsonb := to_jsonb(NEW);
  v_kind         text;
  v_phone        text;
  v_name         text;
  v_total_agorot bigint;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_kind := CASE NEW.status::text
    WHEN 'paid'      THEN 'order_paid'
    WHEN 'fulfilled' THEN 'order_fulfilled'
    WHEN 'cancelled' THEN 'order_cancelled'
    WHEN 'refunded'  THEN 'order_refunded'
    ELSE NULL
  END;
  IF v_kind IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT public.fn_il_phone_digits(p.phone), p.full_name
    INTO v_phone, v_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  IF v_phone IS NULL AND NEW.address_id IS NOT NULL THEN
    SELECT public.fn_il_phone_digits(a.phone), coalesce(v_name, a.full_name)
      INTO v_phone, v_name
    FROM public.user_addresses a WHERE a.id = NEW.address_id;
  END IF;

  IF v_phone IS NULL THEN
    RETURN NEW;
  END IF;

  v_total_agorot := coalesce(
    (v_row->>'total_agorot')::bigint,
    round((v_row->>'total_ils')::numeric * 100)::bigint,
    0
  );

  PERFORM public.fn_enqueue_whatsapp(
    v_kind,
    v_phone,
    'wa:' || v_kind || ':' || NEW.id::text,
    jsonb_build_object(
      'order_id',      NEW.id,
      'order_ref',     upper(left(NEW.id::text, 8)),
      'customer_name', v_name,
      'status',        NEW.status,
      'total_agorot',  v_total_agorot
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_orders_whatsapp_status ON public.orders;
CREATE TRIGGER tg_orders_whatsapp_status
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_whatsapp_status();
