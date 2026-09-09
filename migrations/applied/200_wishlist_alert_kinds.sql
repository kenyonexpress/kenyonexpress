-- 200_wishlist_alert_kinds.sql
--
-- Two notification kinds, so a wishlist can be worth having.
--
-- WHAT A WISHLIST IS FOR
--
-- 154 shipped the table and SECTIONS 24 shipped the heart, the guest list, the
-- merge on login and the move-to-cart. What none of it does is TELL anybody
-- anything. A saved product that gets cheaper, or comes back into stock, is the
-- entire reason a shopper saved it -- and the shop knew both facts and said
-- nothing.
--
-- Both alerts are now possible because the data arrived in the last two
-- migrations rather than because anything new is being invented here:
--
--   `price_history` (193)   one row per product per day. A price drop is a
--                           comparison between two of its rows.
--   `stock_waitlist` (195)  who asked to be told when a product returns.
--
-- This file adds only the two `kind` values the outbox has to accept.
--
-- THE CONSTRAINT IS RESTATED IN FULL, AND THAT IS WHERE THE DANGER IS
--
-- `notification_outbox_kind_check` cannot be extended; it can only be dropped
-- and recreated. 183 shipped with a list of twelve names reconstructed from
-- the file that came before it, while the LIVE constraint already carried
-- fourteen -- so applying it verbatim would have DROPPED `account_deleted` and
-- turned every account-deletion notification into a 23514. Its preflight is
-- what caught it.
--
-- The fourteen below were read out of PRODUCTION on 2026-09-09 with
-- `pg_get_constraintdef`, not copied from any file:
--
--   order_paid, supplier_sale, voucher_redeemed, voucher_issued,
--   voucher_gifted, voucher_expiring, cashback_credited, invoice_dead,
--   low_stock, reconciliation_gap, refund_completed, welcome,
--   account_deleted, order_shipped
--
-- APPLY ORDER: after any other pending file that restates this constraint.
-- There is none today; if one appears, the later of the two wins and the
-- earlier one's names disappear.
--
-- THE GUARD BELOW IS THE POINT. It refuses to run if the live constraint has
-- grown a name this file does not know about, which is the exact failure 183
-- had. A migration that restates a list is only as current as the day it was
-- written, so it checks the day it runs.

BEGIN;

DO $$
DECLARE
  v_live text;
  v_known text[] := ARRAY[
    'order_paid', 'supplier_sale', 'voucher_redeemed', 'voucher_issued',
    'voucher_gifted', 'voucher_expiring', 'cashback_credited', 'invoice_dead',
    'low_stock', 'reconciliation_gap', 'refund_completed', 'welcome',
    'account_deleted', 'order_shipped'
  ];
  v_name text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_live
    FROM pg_constraint WHERE conname = 'notification_outbox_kind_check';

  IF v_live IS NULL THEN
    RAISE EXCEPTION 'notification_outbox_kind_check does not exist; this database is not the one this file was written against';
  END IF;

  -- Every name the LIVE constraint mentions must be one this file will
  -- restate. A name here that is not in `v_known` is a kind somebody added
  -- after 2026-09-09, and recreating the constraint without it would start
  -- rejecting those notifications with a 23514.
  FOR v_name IN
    SELECT (regexp_matches(v_live, '''([a-z_]+)''::text', 'g'))[1]
  LOOP
    IF NOT (v_name = ANY (v_known)) THEN
      RAISE EXCEPTION
        'the live constraint carries "%", which this file does not restate. Add it to the list before applying.',
        v_name;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check CHECK (kind = ANY (ARRAY[
    'order_paid'::text,
    'supplier_sale'::text,
    'voucher_redeemed'::text,
    'voucher_issued'::text,
    'voucher_gifted'::text,
    'voucher_expiring'::text,
    'cashback_credited'::text,
    'invoice_dead'::text,
    'low_stock'::text,
    'reconciliation_gap'::text,
    'refund_completed'::text,
    'welcome'::text,
    'account_deleted'::text,
    'order_shipped'::text,
    -- New here. A saved product got cheaper.
    'price_drop'::text,
    -- New here. A saved product, or one somebody asked to be told about, is
    -- back on the shelf.
    'back_in_stock'::text
  ]));

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM (SELECT (regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''::text', 'g'))[1]
            FROM pg_constraint WHERE conname = 'notification_outbox_kind_check') t;
  IF n <> 16 THEN
    RAISE EXCEPTION 'expected 16 accepted kinds, found %', n;
  END IF;
END $$;

COMMIT;
