-- 252_whatsapp_outbox_order_shipped.sql
--
-- One more kind for the WhatsApp outbox: `order_shipped` (STEP 15, the
-- fulfilment board, 01.10).
--
-- WHAT EXISTS. 173 created `whatsapp_outbox` with an inline CHECK on `kind`
-- naming four values (order_paid, order_fulfilled, order_cancelled,
-- order_refunded), which PostgreSQL auto-named `whatsapp_outbox_kind_check`.
-- Its trigger `tg_orders_whatsapp_status` fires on the ORDER status, and
-- this schema has no order status for "shipped": the parcel's progress lives
-- on each physical line as `order_items.item_status`. So the customer's
-- "on its way" message has no trigger to come from, and the board enqueues
-- it from the application at ship time, through the consent gate
-- `fn_enqueue_whatsapp` (173), with dedupe key `wa:order_shipped:<order_id>`
-- and a `shipments` payload of carrier + tracking per line (the same shape
-- 196 gives the email).
--
-- WHAT THIS DOES. Widens the CHECK with `order_shipped`. Nothing else: no
-- trigger (the writer is `src/server/actions/admin/fulfillment.ts`), no
-- grant, no policy. Until this is applied the INSERT inside
-- `fn_enqueue_whatsapp` raises 23514 for the new kind; the action catches
-- it, logs `fulfillment.whatsapp_kind_not_accepted`, and the email still
-- goes. The renderer (`buildWhatsAppText`, src/server/whatsapp/messages.ts)
-- already knows the kind, so the drain can send rows the moment this lands.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS, then ADD. Re-running yields the
-- same constraint. Existing rows all carry one of the four old kinds, so the
-- new CHECK validates against them without a NOT VALID step.
--
-- Rollback: the reverse pair below, after deleting any `order_shipped` rows:
--   delete from public.whatsapp_outbox where kind = 'order_shipped';
--   alter table public.whatsapp_outbox drop constraint if exists whatsapp_outbox_kind_check;
--   alter table public.whatsapp_outbox add constraint whatsapp_outbox_kind_check
--     check (kind in ('order_paid', 'order_fulfilled', 'order_cancelled', 'order_refunded'));

ALTER TABLE public.whatsapp_outbox
  DROP CONSTRAINT IF EXISTS whatsapp_outbox_kind_check;

ALTER TABLE public.whatsapp_outbox
  ADD CONSTRAINT whatsapp_outbox_kind_check
  CHECK (kind IN ('order_paid', 'order_fulfilled', 'order_cancelled',
                  'order_refunded', 'order_shipped'));

COMMENT ON CONSTRAINT whatsapp_outbox_kind_check ON public.whatsapp_outbox IS
  'The kinds /api/cron/whatsapp can render. order_shipped added by 252; it is enqueued by the fulfilment board, not by a trigger.';
