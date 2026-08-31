-- 108_gift_vouchers.sql
--
-- Buying a coupon for somebody else. Measured against production 2026-08-07
-- before a line was written; additive only, safe to re-run.
--
-- WHAT WAS THERE: NOTHING. `information_schema` returns no column matching
-- `%gift%` or `%recipient%` in any table, and grepping `src` for either word
-- finds only the WhatsApp share helper and an OG card. `vouchers.user_id` is
-- NOT NULL and is the only statement of ownership anywhere.
--
-- THE BLOCKER RECORDED FOR THIS GOAL DOES NOT APPLY, AND HERE IS WHY
--
-- STATE.md warned that "wallet ownership transfer" touches the wallet, whose
-- balance is `numeric` shekels behind `142_money_integer_fix_in_place.sql`, and that
-- the goal might have to stop at that boundary. Measured: gifting a coupon
-- moves `vouchers.user_id` from the buyer to the recipient. It does not read,
-- write or reference `wallet_accounts`, `wallet_balances`, `wallet_entries` or
-- `orders.*_ils` at all. No money moves when a gift is claimed - the sale was
-- settled at payment, and the platform's obligation is the same one to a
-- different person. The blocked column is not on this path.
--
-- WHY A CLAIM TOKEN AND NOT "SET user_id TO THE RECIPIENT"
--
-- The recipient usually has no account yet, and `user_id` is NOT NULL, so there
-- is no id to write at purchase time. The voucher therefore stays with the
-- buyer - who paid for it and is who a refund belongs to - and carries a claim
-- token. The recipient opens the link, signs in or signs up, and ownership
-- moves in one guarded UPDATE.
--
-- Only the SHA-256 of the token is stored. The raw token is in one email. A
-- read of this table therefore does not yield a working claim link for every
-- unclaimed gift in the system, which a plaintext column would - and these
-- links are bearer credentials for something bought with a card.
--
-- The unique index is partial: nulls do not collide in Postgres, but a partial
-- index also keeps the index to the handful of rows that are actually gifts.

-- ---------------------------------------------------------------------------
-- 1. orders: what the buyer asked for at checkout
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gift_recipient_name  text,
  ADD COLUMN IF NOT EXISTS gift_recipient_email text,
  ADD COLUMN IF NOT EXISTS gift_message         text;

COMMENT ON COLUMN public.orders.gift_recipient_email IS
  'Set when the order was bought as a gift. The intent is recorded per ORDER: a gift purchase is one order for one person, and per-line recipients would need the cart, the order line, the settlement snapshot and the voucher to agree about something no screen asks for.';

-- ---------------------------------------------------------------------------
-- 2. vouchers: the gift itself
-- ---------------------------------------------------------------------------

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS gift_recipient_name  text,
  ADD COLUMN IF NOT EXISTS gift_recipient_email text,
  ADD COLUMN IF NOT EXISTS gift_message         text,
  ADD COLUMN IF NOT EXISTS gift_claim_token_hash text,
  ADD COLUMN IF NOT EXISTS gift_sent_at         timestamptz,
  ADD COLUMN IF NOT EXISTS gift_claimed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS gifted_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_gift_claim_token
  ON public.vouchers (gift_claim_token_hash)
  WHERE gift_claim_token_hash IS NOT NULL;

COMMENT ON COLUMN public.vouchers.gift_claim_token_hash IS
  'SHA-256 of the claim token. The raw token exists only in the email to the recipient, so reading this table does not hand over a working claim link for every unclaimed gift.';

COMMENT ON COLUMN public.vouchers.gifted_by_user_id IS
  'Who paid. Set at the moment the gift is CLAIMED, when user_id stops being the buyer - the refund and the receipt still belong to them, and without this column that link is gone.';

-- ---------------------------------------------------------------------------
-- 3. notification_outbox: a kind for the gift email
-- ---------------------------------------------------------------------------

-- A CHECK is one whole expression, so it is replaced rather than amended, and
-- dropped and recreated together so no window exists where the queue accepts an
-- unknown kind. `voucher_gifted` is the fifth; the other four are from 095/102.
ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check CHECK (
    kind = ANY (ARRAY[
      'order_paid'::text,
      'supplier_sale'::text,
      'voucher_redeemed'::text,
      'voucher_issued'::text,
      'voucher_gifted'::text
    ])
  );

COMMENT ON CONSTRAINT notification_outbox_kind_check ON public.notification_outbox IS
  'voucher_gifted added in 108. The drain parks any kind it cannot render as dead, so the template has to exist before this constraint lets the row in.';
