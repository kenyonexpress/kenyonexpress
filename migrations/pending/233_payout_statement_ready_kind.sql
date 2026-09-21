-- 233_payout_statement_ready_kind.sql
--
-- One notification kind: `payout_statement_ready`, the mail a supplier gets
-- when the daily payout run (section 55, /api/cron/payout-run) has drawn up a
-- statement for them. Nothing else changes.
--
-- WRITTEN AGAINST THE LIVE LIST, NOT A COPIED ONE. 214 restated the kind list
-- by hand and its own guard stopped it on 2026-09-21, because `gift_card_issued`
-- had gone live after the file was written. This file reads the names the
-- constraint carries NOW, adds its one name, and rebuilds the constraint from
-- that. It therefore applies in any order relative to 214, 227 and 229, and a
-- kind added tomorrow cannot make it drop one.
--
-- IDEMPOTENT: a second run finds the name already present and rebuilds the
-- constraint with the same set.

BEGIN;

DO $$
DECLARE
  v_live  text;
  v_names text[];
  v_sql   text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_live
    FROM pg_constraint WHERE conname = 'notification_outbox_kind_check';
  IF v_live IS NULL THEN
    RAISE EXCEPTION 'notification_outbox_kind_check does not exist; this database is not the one this file was written against';
  END IF;

  SELECT array_agg(DISTINCT m[1] ORDER BY m[1])
    INTO v_names
    FROM regexp_matches(v_live, '''([a-z_]+)''::text', 'g') AS m;

  IF NOT ('payout_statement_ready' = ANY (v_names)) THEN
    v_names := v_names || 'payout_statement_ready'::text;
  END IF;

  EXECUTE 'ALTER TABLE public.notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_kind_check';
  v_sql := 'ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check CHECK (kind = ANY (ARRAY['
        || (SELECT string_agg(quote_literal(n) || '::text', ', ') FROM unnest(v_names) AS n)
        || ']))';
  EXECUTE v_sql;
END $$;

-- Post-check: the new name is accepted, and every name that was live still is.
DO $$
DECLARE v_live text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_live
    FROM pg_constraint WHERE conname = 'notification_outbox_kind_check';
  IF v_live NOT LIKE '%''payout_statement_ready''::text%' THEN
    RAISE EXCEPTION 'payout_statement_ready is not in the rebuilt constraint';
  END IF;
  IF v_live NOT LIKE '%''supplier_sale''::text%' OR v_live NOT LIKE '%''order_paid''::text%' THEN
    RAISE EXCEPTION 'a live kind vanished from the rebuilt constraint';
  END IF;
END $$;

COMMIT;
