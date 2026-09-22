-- 238_whatsapp_inbound_order_match.sql
--
-- OWNER DECISIONS, 2026-09-23: "auto-respond with order summary if order_id
-- found" on an inbound WhatsApp message. The inbound webhook
-- (src/app/api/webhooks/whatsapp/route.ts) already exists, already verifies
-- Twilio's signature, already classifies opt-in/opt-out/free-text and already
-- opens a support ticket for free text -- built and tested well before this
-- request arrived. What it could not do is say which order (if any) the
-- sender's phone belongs to, because `whatsapp_inbound_messages` (created by
-- an earlier, unnumbered migration this repo's history does not carry a file
-- for) has no column to hold that match.
--
-- One nullable column, no new table. The matching itself is done in
-- TypeScript (src/server/whatsapp/orders.ts), the same way
-- `attachPhoneToExistingAccount` in src/server/actions/auth.ts already matches
-- a phone to a profile: SQL cannot normalise "050-1234567" vs "+972501234567"
-- vs "972501234567" against each other, so a suffix filter narrows the
-- candidates and the exact comparison happens after normalising both sides in
-- code. This column only records the outcome.
--
-- ON DELETE SET NULL, not CASCADE: an order being deleted must not delete the
-- record that a support conversation happened, only its link to an order that
-- no longer exists. IDEMPOTENT.

BEGIN;

ALTER TABLE public.whatsapp_inbound_messages
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_inbound_messages_order_id_idx
  ON public.whatsapp_inbound_messages (order_id)
  WHERE order_id IS NOT NULL;

COMMIT;
