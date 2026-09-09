-- 214_settlement_gap_kind.sql
--
-- One notification kind, so the split reconciler can reach a human.
--
-- WHAT IS BEING ALERTED ABOUT, AND WHY IT NEEDS ITS OWN NAME
--
-- `/api/cron/reconcile` asks Cardcom what it charged and diffs that against
-- `payments`. It answers "did the right total move" and enqueues
-- `reconciliation_gap` when it did not. `/api/cron/settlement-reconcile`,
-- new in this section, asks the question that comes AFTER: of that total, how
-- much was the platform's and how much was the supplier's.
--
-- They are different failures. A wrong total is a customer complaint within
-- the hour. A wrong split is a supplier paid the wrong amount for months while
-- the terminal and the ledger agree with each other perfectly, because the
-- terminal never knew about the split.
--
-- IT CANNOT SHARE `reconciliation_gap`. The outbox dedupes on
-- `admin:<kind>:<day>`, so two jobs enqueuing one kind on one day means the
-- second one's alert is swallowed as a duplicate of the first. Both run at
-- 04:00-ish. Sharing the name would make whichever job lost the race silent,
-- and silent is exactly what both of them exist to stop.
--
-- THE CONSTRAINT IS RESTATED IN FULL, WHICH IS WHERE THE DANGER IS
--
-- `notification_outbox_kind_check` cannot be extended, only dropped and
-- recreated, so every restatement risks dropping a name it did not know about.
-- 183 shipped with twelve names while the live constraint carried fourteen and
-- would have deleted `account_deleted`; its preflight caught it.
--
-- THE SIXTEEN BELOW WERE READ OUT OF PRODUCTION ON 2026-09-09 with
-- `pg_get_constraintdef`, not copied from any file in this repository:
--
--   order_paid, supplier_sale, voucher_redeemed, voucher_issued,
--   voucher_gifted, voucher_expiring, cashback_credited, invoice_dead,
--   low_stock, reconciliation_gap, refund_completed, welcome,
--   account_deleted, order_shipped, price_drop, back_in_stock
--
-- READING THEM CORRECTED THE REPOSITORY. `migrations/pending/README.md` said
-- 200 was written and not applied, and `src/lib/email/outbox-kinds.test.ts`
-- listed `price_drop` and `back_in_stock` as kinds the live constraint still
-- rejects. Both are live. 200 was applied to production at some point after it
-- was written and nothing recorded it. That is fixed in the same commit as
-- this file.
--
-- 200 IS NOW A FILE THAT WILL REFUSE TO RUN, and deliberately so: its guard
-- rejects any live name it does not restate, and the live constraint now
-- carries the two names 200 itself added. If somebody applies it out of the
-- pending directory it raises rather than silently dropping anything. Do not
-- apply 200. This file supersedes it and carries its two names forward.
--
-- APPLY ORDER: after any other pending file that restates this constraint.
-- Today that is 200, which must NOT be applied at all. If a later file
-- restates the constraint, the later of the two wins and this file's name
-- disappears from it.

BEGIN;

DO $$
DECLARE
  v_live text;
  v_known text[] := ARRAY[
    'order_paid', 'supplier_sale', 'voucher_redeemed', 'voucher_issued',
    'voucher_gifted', 'voucher_expiring', 'cashback_credited', 'invoice_dead',
    'low_stock', 'reconciliation_gap', 'refund_completed', 'welcome',
    'account_deleted', 'order_shipped', 'price_drop', 'back_in_stock',
    -- New here, so re-applying this file is not a guard failure.
    'settlement_gap'
  ];
  v_name text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_live
    FROM pg_constraint WHERE conname = 'notification_outbox_kind_check';

  IF v_live IS NULL THEN
    RAISE EXCEPTION 'notification_outbox_kind_check does not exist; this database is not the one this file was written against';
  END IF;

  -- Every name the LIVE constraint mentions must be one this file restates. A
  -- name here that is not in `v_known` was added after 2026-09-09, and
  -- recreating the constraint without it would start rejecting those
  -- notifications with a 23514 that only shows up as unsent mail.
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
    'price_drop'::text,
    'back_in_stock'::text,
    -- New here. An order line's money does not match the split its own
    -- `platform_percent` describes, or the money journal disagrees with the
    -- line, or a completed refund never reached the journal.
    'settlement_gap'::text
  ]));

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM (SELECT (regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''::text', 'g'))[1]
            FROM pg_constraint WHERE conname = 'notification_outbox_kind_check') t;
  IF n <> 17 THEN
    RAISE EXCEPTION 'expected 17 accepted kinds, found %', n;
  END IF;
END $$;

COMMIT;
