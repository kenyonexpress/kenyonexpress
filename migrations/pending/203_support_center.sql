-- 203_support_center.sql
--
-- The support tables exist and are applied. This is what they are missing.
--
-- WHAT IS ALREADY TRUE, MEASURED 2026-09-09. `support_tickets` and
-- `support_ticket_messages` are LIVE in production with RLS on and five
-- policies between them: the owner reads their own ticket and its messages,
-- staff read both, staff update the ticket. Both hold **zero rows**.
--
-- THE FINDING IS IN THE CHECK CONSTRAINT. `channel` already permits
-- `'contact_form'`:
--
--   CHECK (channel = ANY (ARRAY['whatsapp', 'contact_form', 'email']))
--
-- and **nothing has ever written that value**. The contact form sends mail
-- through Resend and creates no ticket, so a customer's message lives in an
-- inbox with no status, no owner and no record that it was answered. The
-- schema anticipated the feature and the code never arrived. The only writer is
-- the WhatsApp webhook.
--
-- WHAT THIS FILE ADDS, AND WHAT IT DELIBERATELY DOES NOT.
--
-- It does NOT add customer INSERT policies. A policy can express "this row is
-- yours" and nothing else; it cannot check that the order being asked about is
-- the customer's, that the ticket is still open, or that this is not the
-- fortieth message this hour. So the writes stay on the service-role client
-- behind actions that check those things, exactly as `refund_requests` in 202
-- does, and for the same reason.
--
-- It adds the columns that make a ticket answerable and measurable:
--
--   * `email`, and this one is a bug fix. A `contact_form` ticket has no
--     `user_id` (the sender may not have an account) and no `phone`. Today the
--     table can hold a ticket **nobody can reply to**, because it records no
--     way of reaching the person who opened it.
--   * `order_id`, so "help with this order" is a link and not a paragraph the
--     customer retypes and the operator re-looks-up.
--   * `priority` and `assigned_to`, because a queue with neither is a list.
--   * `first_response_at`, which is the ONLY timestamp an SLA needs that
--     cannot be derived. Everything else the SLA computes -- due, breached,
--     time remaining -- comes from `created_at` and the policy table in
--     `server/domain/support/sla.ts`, so re-tuning the targets does not need a
--     migration and does not rewrite history.
--
-- WHY THE SLA DUE TIME IS NOT A COLUMN. A stored deadline is computed once,
-- under whatever policy was in force that day, and is then wrong for every row
-- the moment the policy changes -- and it cannot be recomputed, because the
-- policy that produced it was not stored beside it. Deriving it means one
-- place decides, `docs/SUPPORT.md` states the targets, and a test compares the
-- two. The contrast is `disputes.respond_by` in 202, which IS a column,
-- because that deadline is set by somebody else and we are only recording it.

BEGIN;

-- ── support_tickets ────────────────────────────────────────────────────────

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_customer_message_at timestamptz;

-- A ticket with no way to reach the person who opened it is a ticket that
-- cannot be answered. Not enforced as NOT NULL on any single column, because
-- each channel supplies a different one: WhatsApp has a phone and no account,
-- the contact form has an email and may have no account, an in-app ticket has
-- a user and needs neither.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_reachable;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_reachable
  CHECK (user_id IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL);

-- `order_help` and `return_request` are new channels: they are not a different
-- transport, they are a different ORIGIN, and the distinction matters because
-- the canned replies and the SLA both key off it. The three existing values are
-- restated because a CHECK cannot be extended, only replaced.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel = ANY (ARRAY['whatsapp', 'contact_form', 'email', 'order_help', 'return_request']));

-- `waiting_customer` is the state the original three could not express, and its
-- absence is what makes a support queue lie: a ticket we have answered and are
-- waiting on is indistinguishable from one nobody has touched, so the oldest
-- open ticket is whichever customer is slowest to reply. It also stops the SLA
-- clock, which is the whole reason it has to exist as a status rather than as a
-- note.
--
-- `resolved` is kept distinct from `closed`: resolved is our claim, closed is
-- the end of the conversation, and a customer replying to a resolved ticket
-- reopens it.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_status_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status = ANY (ARRAY['open', 'pending', 'waiting_customer', 'resolved', 'closed']));

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_priority_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_priority_check
  CHECK (priority = ANY (ARRAY['low', 'normal', 'high', 'urgent']));

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IS NULL OR category = ANY (ARRAY[
    'order_status', 'voucher_problem', 'refund', 'payment', 'account', 'supplier', 'other']));

-- A closed ticket has a closing time, and an open one does not. Without this
-- "how long did that take" is answerable only for the rows somebody remembered
-- to stamp.
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_closed_consistent;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_closed_consistent
  CHECK ((status = 'closed') = (closed_at IS NOT NULL));

-- The queue's own query: what is open, worst first, oldest first.
CREATE INDEX IF NOT EXISTS support_tickets_open_queue_idx
  ON public.support_tickets (priority, created_at)
  WHERE status IN ('open', 'pending', 'waiting_customer');
CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON public.support_tickets (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_order_idx
  ON public.support_tickets (order_id)
  WHERE order_id IS NOT NULL;
-- The WhatsApp webhook's existing lookup, which today is a scan.
CREATE INDEX IF NOT EXISTS support_tickets_phone_open_idx
  ON public.support_tickets (phone, created_at DESC)
  WHERE phone IS NOT NULL;

-- ── support_ticket_messages ────────────────────────────────────────────────

-- `internal` is a note between operators that the customer never sees, and it
-- is a DIRECTION rather than a boolean flag so that the one place deciding what
-- a customer may read is the same place deciding which way a message went.
-- A boolean would make "outbound and private" expressible, which is a
-- contradiction that would eventually be sent.
ALTER TABLE public.support_ticket_messages
  DROP CONSTRAINT IF EXISTS support_ticket_messages_direction_check;
ALTER TABLE public.support_ticket_messages
  ADD CONSTRAINT support_ticket_messages_direction_check
  CHECK (direction = ANY (ARRAY['inbound', 'outbound', 'internal']));

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx
  ON public.support_ticket_messages (ticket_id, created_at);

-- THE POLICY THAT HAD TO CHANGE, AND IT IS A LEAK.
--
-- `support_ticket_messages_own_read` lets the owner read EVERY message on their
-- ticket. With `internal` now expressible, that policy would hand the customer
-- the operators' private notes about them the moment the first one is written.
-- Replaced with the same predicate plus the direction filter, in the same
-- statement, so the two can never be applied separately.
DROP POLICY IF EXISTS "support_ticket_messages_own_read" ON public.support_ticket_messages;
CREATE POLICY "support_ticket_messages_own_read" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    direction <> 'internal'
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_messages.ticket_id
        AND t.user_id = (SELECT auth.uid())
    )
  );

-- Staff read everything, unchanged. Restated so this file is the whole policy
-- set for the table rather than half of it.
DROP POLICY IF EXISTS "support_ticket_messages_staff_read" ON public.support_ticket_messages;
CREATE POLICY "support_ticket_messages_staff_read" ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_support());

-- NO INSERT POLICY FOR ANYONE, ON EITHER TABLE, AND THAT IS THE DESIGN.
-- Opening a ticket has to check the order is yours, the rate limit, and the
-- reachability rule; replying has to check the ticket is open and stamp
-- `first_response_at`. None of that is expressible in a policy, so every write
-- goes through a server action on the service-role client. Left explicit here
-- so the absence reads as a decision rather than as an oversight.
REVOKE INSERT, UPDATE, DELETE ON public.support_ticket_messages FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.support_tickets FROM anon, authenticated;

COMMIT;
