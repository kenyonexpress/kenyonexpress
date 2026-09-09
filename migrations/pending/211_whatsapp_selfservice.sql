-- 211: WhatsApp self-service: order-status lookup and refund-request intake.
--
-- Completes what 173 opened. The webhook already classifies two new inbound
-- intents ('order_status', 'refund_request'); this migration gives them their
-- schema:
--   1. the intent CHECK on whatsapp_inbound_messages learns the two values
--      (until then the webhook's audit insert falls back to 'message', so
--      replay protection never depended on this migration);
--   2. support_tickets gets a category column so the admin queue can filter
--      refund requests without parsing subjects; existing refund tickets are
--      recognized by the subject prefix the webhook writes;
--   3. fn_wa_orders_for_phone, the reverse of 173's phone resolution: given a
--      normalized phone, the customer's three most recent orders. SECURITY
--      DEFINER and service_role-only, because the caller is the webhook route
--      holding the service key; no client role may probe orders by phone.
--
-- WHAT THE LOOKUP DISCLOSES, DELIBERATELY LITTLE: order ref (8 chars), status,
-- total, date. No address, no items, no name. Possession of the WhatsApp
-- number is the authentication, verified by WhatsApp itself and by Twilio's
-- signature on the webhook; that is enough for "where is my order", and the
-- payload is kept to what that question needs.
--
-- total_agorot follows 095/173's coalesce so it keeps working whether or not
-- 138's _agorot columns are applied (production is the total_ils lineage).
--
-- Rollback: drop function public.fn_wa_orders_for_phone(text);
--   alter table public.support_tickets drop column if exists category;
--   alter table public.whatsapp_inbound_messages
--     drop constraint whatsapp_inbound_messages_intent_check;
--   alter table public.whatsapp_inbound_messages
--     add constraint whatsapp_inbound_messages_intent_check
--     check (intent in ('opt_in','opt_out','message'));
--   (only after updating rows that carry the new intents.)

-- ---------------------------------------------------------------------------
-- 1. Widen the inbound intent CHECK. Name verified against production.
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_inbound_messages
  DROP CONSTRAINT IF EXISTS whatsapp_inbound_messages_intent_check;
ALTER TABLE public.whatsapp_inbound_messages
  ADD CONSTRAINT whatsapp_inbound_messages_intent_check
  CHECK (intent IN ('opt_in', 'opt_out', 'order_status', 'refund_request', 'message'));

-- ---------------------------------------------------------------------------
-- 2. Ticket category, backfilled from the subject prefix the webhook wrote
--    while this migration was pending.
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN ('general', 'order_status', 'refund_request'));

UPDATE public.support_tickets
  SET category = 'refund_request'
  WHERE category = 'general' AND subject LIKE 'בקשת זיכוי%';

CREATE INDEX IF NOT EXISTS support_tickets_refund_open_idx
  ON public.support_tickets (created_at DESC)
  WHERE category = 'refund_request' AND status IN ('open', 'pending');

-- ---------------------------------------------------------------------------
-- 3. The lookup. Reverses 173's tg_orders_whatsapp_status phone resolution:
--    the trigger goes order -> profile/address -> phone, this goes
--    phone -> profile/address -> orders. fn_il_phone_digits is IMMUTABLE, so
--    the per-row normalization is a scan of two small tables, not a seq scan
--    per webhook burst; at this store's scale that is fine, and an expression
--    index can be added the day it is not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_wa_orders_for_phone(p_phone text)
RETURNS TABLE (order_ref text, status text, total_agorot bigint, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone text := public.fn_il_phone_digits(p_phone);
BEGIN
  IF v_phone IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    upper(left(o.id::text, 8)),
    o.status::text,
    coalesce(
      (to_jsonb(o) ->> 'total_agorot')::bigint,
      round((to_jsonb(o) ->> 'total_ils')::numeric * 100)::bigint,
      0
    ),
    o.created_at
  FROM public.orders o
  WHERE o.user_id IN (
          SELECT p.id FROM public.profiles p
          WHERE public.fn_il_phone_digits(p.phone) = v_phone
        )
     OR o.address_id IN (
          SELECT a.id FROM public.user_addresses a
          WHERE public.fn_il_phone_digits(a.phone) = v_phone
        )
  ORDER BY o.created_at DESC
  LIMIT 3;
END;
$$;

-- Grants are part of the object: CREATE OR REPLACE re-grants EXECUTE to
-- PUBLIC on a fresh function, so the revokes must follow every (re)creation.
REVOKE ALL ON FUNCTION public.fn_wa_orders_for_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_wa_orders_for_phone(text) FROM anon;
REVOKE ALL ON FUNCTION public.fn_wa_orders_for_phone(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_wa_orders_for_phone(text) TO service_role;
