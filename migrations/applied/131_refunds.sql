-- ============================================================================
-- PENDING 121: refunds, the cancellation notice and its adjudication
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- MEASURED BEFORE WRITING (2026-08-19, against src/types/database.ts, which is
-- what describes production; supabase/migrations/ does not):
--   payments        : exists, with kind ('charge'|'refund') and, since 106,
--                     refund_of_payment_id.
--   payments.amount : the column is amount_ils. PRE-059 LINEAGE.
--   settlement_events : exists (094), append-only, carries supplier_debit.
--   audit_log       : exists.
--   There is no table named refunds and no column holding a cancellation
--   notice timestamp anywhere.
--
-- THIS TABLE HOLDS NO MONEY TRUTH. payments stays the authority for what was
-- credited. This is the paperwork: who asked, when, under which statutory
-- ground, what we decided, and when the clock runs out.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_ground') THEN
    -- The statutory ground, because the fee and the deadline depend on it.
    -- 'defect' is the one that zeroes the fee; 'goodwill' is outside the
    -- statute entirely and is where a wallet credit usually lands.
    CREATE TYPE public.refund_ground AS ENUM (
      'distance_sale_14d',      -- 14ג, the ordinary case
      'defect',                 -- non-conformity / breach. Fee is ZERO.
      'service_not_provided',
      'duplicate_charge',       -- our fault. Fee is ZERO.
      'extended_window',        -- disability / senior citizen / new immigrant
      'goodwill'                -- discretionary. Not a statutory cancellation.
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_state') THEN
    CREATE TYPE public.refund_state AS ENUM (
      'requested',   -- the notice. The 14-day clock starts HERE.
      'approved',
      'rejected',
      'executing',   -- provider call in flight
      'completed',
      'failed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.refunds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,

  -- NULL until the money actually moves. A rejected refund never gets one, and
  -- that is the point: this table records refusals too.
  payment_id    uuid REFERENCES public.payments(id) ON DELETE SET NULL,

  state         public.refund_state  NOT NULL DEFAULT 'requested',
  ground        public.refund_ground NOT NULL,

  -- THE CLOCK. Section 14ה: the money must be returned within 14 days of the
  -- notice. Defaulting to now() is deliberate: the notice is recorded when the
  -- customer presses the button, not when an operator gets to it.
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  completed_at  timestamptz,

  -- The deadline. Forced by a trigger, not generated.
  --
  -- WHY NOT `GENERATED ALWAYS AS (requested_at + interval '14 days') STORED`,
  -- which is what this was: PostgreSQL rejects it. A generation expression must
  -- be IMMUTABLE, and `timestamptz + interval` is only STABLE, because adding
  -- an interval to a timestamptz depends on the session TimeZone setting. The
  -- migration failed at apply time on exactly this line.
  --
  -- `refunds_force_due_by()` below overwrites this column on every INSERT and
  -- every UPDATE, so the guarantee is unchanged: nobody can quietly extend the
  -- deadline. What changes is the error a writer gets. A generated column
  -- rejects the write with 428C9; the trigger accepts it and silently replaces
  -- the value. Both end with the correct date stored.
  refund_due_by timestamptz,

  -- Who pressed cancel. NULL means the platform initiated it (duplicate charge,
  -- supplier withdrawal), which is a real and different case from "the customer
  -- asked".
  requested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Integer agorot, all three. NEVER numeric, never shekels. The whole-agorot
  -- rule, src/lib/money.ts. requested may exceed granted; that difference is
  -- the fee plus anything refused, and both are worth being able to read back.
  requested_agorot        bigint NOT NULL,
  cancellation_fee_agorot bigint NOT NULL DEFAULT 0,
  granted_agorot          bigint,

  -- The plan's own decision, stored so a later audit can tell a cancellation
  -- from a credit without re-deriving the clearing day.
  cancel_only   boolean NOT NULL DEFAULT false,

  -- Hebrew, shown to the customer as-is. A rejection the customer cannot read
  -- is not a rejection that was communicated.
  reason_he     text,
  internal_note text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT refunds_amounts_are_whole_agorot CHECK (
    requested_agorot        >= 0 AND
    cancellation_fee_agorot >= 0 AND
    (granted_agorot IS NULL OR granted_agorot >= 0)
  ),
  -- The statutory cap, in the database rather than only in TypeScript. The
  -- lower of 5% or 10000 agorot. A fee above this is not a rounding error, it
  -- is an unlawful charge, and it should be impossible to store one.
  --
  -- CEILING, not floor: (x + 19) / 20 is ceil(x/20) in integer arithmetic.
  -- computeCancellationFee() rounds half-up, so on 10050 agorot it returns 503
  -- while floor(10050/20) is 502. A floor here would reject a fee the
  -- application legitimately computed and fail the refund AFTER Cardcom moved
  -- the money -- the exact 42703 shape that 106_refund_flow.sql exists to
  -- undo. The one-agora slack is the price of the two layers agreeing.
  CONSTRAINT refunds_fee_within_statutory_cap CHECK (
    cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)
  ),
  -- A defect or a duplicate charge is OUR fault and carries no fee. Encoding it
  -- here means the rule survives a caller that forgets isDefectClaim.
  CONSTRAINT refunds_no_fee_when_our_fault CHECK (
    ground NOT IN ('defect','duplicate_charge') OR cancellation_fee_agorot = 0
  ),
  CONSTRAINT refunds_completed_has_money CHECK (
    state <> 'completed' OR (granted_agorot IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT refunds_decided_has_decider CHECK (
    state NOT IN ('approved','rejected') OR decided_at IS NOT NULL
  )
);

COMMENT ON TABLE public.refunds IS
  'The cancellation notice and its adjudication. NOT the money movement: payments(kind=refund) is. requested_at starts the statutory 14-day refund deadline.';
COMMENT ON COLUMN public.refunds.refund_due_by IS
  'Forced by trigger refunds_due_by_is_derived to requested_at + 14 days. Consumer Protection Law. Not a generated column: timestamptz + interval is STABLE, not IMMUTABLE, so PostgreSQL rejects it as a generation expression.';

-- The trigger that replaces the generation expression. `SET search_path TO ''`
-- because this is a definer-shaped function in everything but name: it runs on
-- every write to the table and must not resolve an unqualified name against a
-- caller-controlled search_path.
CREATE OR REPLACE FUNCTION public.refunds_force_due_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.refund_due_by := NEW.requested_at + interval '14 days';
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS refunds_due_by_is_derived ON public.refunds;
CREATE TRIGGER refunds_due_by_is_derived
  BEFORE INSERT OR UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.refunds_force_due_by();

-- One open refund per order at a time. A second cancellation request while one
-- is in flight is a double-click, and a partial unique index says so without
-- forbidding a legitimate second refund after the first completes.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_one_open_per_order
  ON public.refunds (order_id)
  WHERE state IN ('requested','approved','executing');

-- "What is about to breach the deadline." This is the only query ops runs daily.
CREATE INDEX IF NOT EXISTS refunds_due_idx
  ON public.refunds (refund_due_by)
  WHERE state IN ('requested','approved','executing');

CREATE INDEX IF NOT EXISTS refunds_order_idx ON public.refunds (order_id, requested_at DESC);

-- ---------------------------------------------------------------------------
-- RLS. auth.uid() only. There is no tenant_id in this schema.
-- ---------------------------------------------------------------------------
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

-- The customer may SEE their own refunds. They may not write this table
-- directly; the cancellation control goes through a server action, because the
-- notice timestamp has to be the server's clock, not the browser's.
-- (SELECT auth.uid()) not auth.uid(): InitPlan once, not once per row.
DROP POLICY IF EXISTS refunds_owner_read ON public.refunds;
CREATE POLICY refunds_owner_read ON public.refunds
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = refunds.order_id AND o.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS refunds_staff_read ON public.refunds;
CREATE POLICY refunds_staff_read ON public.refunds
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','super_admin','support'));

REVOKE ALL ON public.refunds FROM anon;
GRANT SELECT ON public.refunds TO authenticated;

-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. The statutory cap bites:
--      INSERT INTO public.refunds (order_id, ground, requested_agorot,
--                                  cancellation_fee_agorot)
--      VALUES ((SELECT id FROM public.orders LIMIT 1), 'distance_sale_14d',
--              100000, 6000);
--    Expect 23514: 5% of 100000 is 5000, and 6000 exceeds it.
--
-- 2. A defect carries no fee:
--      ... VALUES (..., 'defect', 100000, 1);   -> expect 23514.
--
-- 3. refund_due_by cannot be set by the writer:
--      ... (requested_at, refund_due_by) VALUES (now(), now())
--      -> the INSERT succeeds, and refund_due_by comes back as
--         requested_at + 14 days, not now(). The trigger overwrites it.
--      (This expected 428C9 when the column was generated. It is a trigger now,
--       so the write is accepted and corrected rather than refused.)
--
-- 4. Two open refunds on one order:
--      insert twice with state 'requested'      -> expect 23505 on the second.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS refunds_due_by_is_derived ON public.refunds;
--   DROP FUNCTION IF EXISTS public.refunds_force_due_by();
--   DROP TABLE IF EXISTS public.refunds;
--   DROP TYPE  IF EXISTS public.refund_state;
--   DROP TYPE  IF EXISTS public.refund_ground;
-- ============================================================================
