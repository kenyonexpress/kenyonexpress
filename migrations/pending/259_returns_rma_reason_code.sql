-- 259_returns_rma_reason_code.sql
--
-- The customer-facing return request on `public.refunds`: an RMA number and
-- the customer's own reason code. STEP 44.
--
-- WHAT IS TRUE TODAY, MEASURED 2026-10-08 ON PRODUCTION
--
-- `public.refunds` (131) exists with 20 columns, 2 rows, the partial UNIQUE
-- `refunds_one_open_per_order`, `refunds_owner_read` / `refunds_staff_read`
-- (SELECT only), the `refunds_due_by_is_derived` trigger and `destination`
-- (148). No column holds a return authorisation number and no column holds
-- the reason the CUSTOMER gave: `ground` is the statutory ground the row is
-- adjudicated under, and `reason_he` is free text.
--
-- WHY TWO COLUMNS AND NOT A NEW TABLE
--
-- The return request IS the cancellation notice 131 was built to hold. Its
-- `requested` state existed in the enum from day one and nothing wrote it.
-- A second table for the same notice would mean two rows, two deadlines and
-- two locks for one legal event. The customer flow writes `requested` here;
-- the admin decision moves the same row.
--
-- THE RMA IS DERIVED, NOT ALLOCATED. `RMA-YYMMDD-XXXXXXXX`: the request day
-- in Israel and the first eight hex digits of the row's own id. The code
-- (`src/lib/returns/policy.ts`, `rmaNumber`) computes the identical string
-- from `id` and `requested_at`, so the number exists before this file is
-- applied and does not change once it is. The column is stored so an
-- operator can search by it and so UNIQUE can say it never collides.
--
-- THE CODE RUNS WITHOUT THIS FILE. `src/server/actions/returns.ts` inserts
-- with `reason_code` and, on 42703 / PGRST204, retries without it (the code
-- is then kept as the first line of `reason_he`). Reads use `select *` and
-- fall back to the derived RMA when `rma_number` is absent or null.
--
-- No money column is touched. No policy is added: the customer never writes
-- this table directly (the action runs on the service role after the
-- ownership and window checks), and the owner SELECT policy from 131 already
-- lets the account page read the row.
--
-- Idempotent: safe to re-run.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS refunds_rma_is_derived ON public.refunds;
--   DROP FUNCTION IF EXISTS public.refunds_force_rma();
--   DROP INDEX IF EXISTS refunds_rma_number_key;
--   DROP INDEX IF EXISTS refunds_open_by_state_idx;
--   ALTER TABLE public.refunds DROP COLUMN IF EXISTS rma_number;
--   ALTER TABLE public.refunds DROP COLUMN IF EXISTS reason_code;

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS rma_number text;

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS reason_code text
    CHECK (reason_code IS NULL OR reason_code IN (
      'changed_mind', 'defective', 'not_as_described', 'wrong_item',
      'not_received', 'duplicate_charge', 'other'
    ));

COMMENT ON COLUMN public.refunds.rma_number IS
  'Return authorisation number shown to the customer. RMA-YYMMDD-XXXXXXXX: request day (Asia/Jerusalem) and the first 8 hex digits of id. Derived by trigger refunds_rma_is_derived; src/lib/returns/policy.ts rmaNumber() computes the same string.';
COMMENT ON COLUMN public.refunds.reason_code IS
  'What the customer said (src/lib/returns/policy.ts RETURN_REASON_CODES). NOT the statutory ground: that is `ground`, which the admin decision may set differently.';

CREATE OR REPLACE FUNCTION public.refunds_force_rma()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF NEW.rma_number IS NULL THEN
    NEW.rma_number := 'RMA-'
      || to_char(NEW.requested_at AT TIME ZONE 'Asia/Jerusalem', 'YYMMDD')
      || '-'
      || upper(left(replace(NEW.id::text, '-', ''), 8));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS refunds_rma_is_derived ON public.refunds;
CREATE TRIGGER refunds_rma_is_derived
  BEFORE INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refunds_force_rma();

-- Backfill the two rows that predate this file, with the same expression.
UPDATE public.refunds
   SET rma_number = 'RMA-'
      || to_char(requested_at AT TIME ZONE 'Asia/Jerusalem', 'YYMMDD')
      || '-'
      || upper(left(replace(id::text, '-', ''), 8))
 WHERE rma_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_rma_number_key
  ON public.refunds (rma_number);

-- The admin queue: open requests, newest first.
CREATE INDEX IF NOT EXISTS refunds_open_by_state_idx
  ON public.refunds (state, requested_at DESC)
  WHERE state IN ('requested', 'approved');

DO $$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing FROM public.refunds WHERE rma_number IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '259: % refunds rows still have no rma_number', v_missing;
  END IF;
END
$$;

-- STATUS: NOT APPLIED. Awaits explicit approval. Never `db push`.
