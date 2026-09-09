-- 202_fraud_abuse.sql
--
-- Fraud and abuse: one column that is a live bug, and three tables.
--
-- =============================================================================
-- PART 1 IS NOT A FEATURE. IT IS A BROKEN PAYMENT PATH.
-- =============================================================================
--
-- `public.payments` in production has twenty columns and `token_id` is not one
-- of them. Measured 2026-09-09 from `information_schema.columns`:
--
--   id, order_id, kind, status, amount_ils, currency, wallet_applied_ils,
--   idempotency_key, cardcom_low_profile_id, cardcom_transaction_id,
--   raw_response, failure_code, failure_message, succeeded_at, failed_at,
--   created_at, updated_at, cardcom_account_id, refund_of_payment_id,
--   amount_ils_agorot
--
-- `026_commerce.sql` declares the column in the CREATE TABLE. It is therefore
-- believed to exist by anyone reading the file chain, and the generated types
-- do not have it either. Production is a different lineage from the file chain,
-- which is the same thing `payment-money-columns.ts` had to discover about 059.
--
-- On 2026-09-07, commit `52fe21ed4` added `token_id: token.id` to the payments
-- INSERT on the saved-card charge path. 42703 takes down the whole statement,
-- so from that commit **every purchase with a saved card fails** before Cardcom
-- is called, with "יצירת תשלום נכשלה". The hosted-page path inserts no
-- `token_id` and is unaffected, which is why this never presented as an outage.
--
-- The application no longer depends on this migration: `payment-token-column.ts`
-- probes for the column and omits it when absent, so the charge succeeds either
-- way. Applying this restores the RECORD - which card a charge rode on - and it
-- is also what makes the per-account card-velocity signal in Part 2 readable at
-- all, because without it nothing links a payment to a card.
--
-- =============================================================================
-- PART 2: WHAT REFUSES, AND WHAT ONLY ROUTES
-- =============================================================================
--
-- The velocity limits (`lib/fraud/velocity.ts`) refuse a purchase and need NO
-- table: they count declines, distinct cards and shared cards out of `payments`
-- and `payment_tokens`, which already exist. That is deliberate - the part of
-- this layer that says no works on the database as it stands today, unapplied.
--
-- `order_risk_assessments` is the part that does NOT refuse. A score is a
-- weighted sum with no measured base rate behind it (this shop has 44 active
-- products and no chargeback history), so it routes an order to a human and
-- never declines one. The table is therefore a record and a queue, not a gate,
-- and an order with no row in it is not "unscored and suspicious", it is an
-- order created before this was applied.
--
-- WHY IT IS A TABLE AND NOT A COLUMN ON `orders`. Because `orders` is the one
-- INSERT that must not grow. Naming a column the hosted database lacks in that
-- literal fails the whole statement and NO ORDER CAN BE CREATED AT ALL - the
-- lesson `order-money-columns.ts` exists to record, and the reason the gift
-- fields are written in their own separate UPDATE. A separate table means the
-- worst case of an unapplied migration is an order nobody scored, not a shop
-- that cannot sell.
--
-- =============================================================================
-- PART 3: THE REFUND CAP IS THREE PER ORDER, NOT THREE PER CUSTOMER
-- =============================================================================
--
-- Per customer punishes the good one: somebody with forty orders and four
-- genuine problems would be locked out of asking about the fifth. Per order
-- bounds the loop that actually costs something - re-submitting the same claim
-- until a tired operator approves it - and it does so where the operator can
-- see the previous two refusals sitting next to it.
--
-- ENFORCED IN THE DATABASE, not only in the action, because "the button is
-- hidden" is not a limit. The trigger is the limit; the UI reflects it.
--
-- =============================================================================
-- PART 4: DISPUTES ARE ENTERED, NOT RECEIVED
-- =============================================================================
--
-- Cardcom's legacy `/Interface/*.aspx` API, which is what this code speaks,
-- sends no chargeback notification and the webhooks are unsigned. So there is
-- no integration to write and pretending otherwise would produce a table that
-- fills itself with nothing. A dispute arrives here as an email or a phone call
-- from the acquirer and an operator types it in. What the table is FOR is the
-- deadline and the evidence: a chargeback has a response window measured in
-- days, and the money is lost by default if nobody answers in time.
--
-- WHY `status` IS text + CHECK AND NOT `public.dispute_status`. That enum
-- EXISTS in production - measured 2026-09-09 - with labels
-- `open, in_review, resolved_accepted, resolved_rejected` and **zero columns
-- using it**: an orphan left by a table that was never created. Reusing it
-- would look like consistency and would cost the distinction that matters,
-- because `resolved_accepted` cannot say WHO accepted. Losing a chargeback and
-- deciding not to contest one are the same row under that vocabulary, and they
-- are different numbers in every report anybody would build on this table. So
-- the states here are `won`, `lost` and `accepted`, and the orphan enum stays
-- orphaned rather than being bent to fit.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =============================================================================
-- 1. payments.token_id
-- =============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS token_id uuid
  REFERENCES public.payment_tokens(id) ON DELETE SET NULL;

-- The card-velocity read is "distinct token_id for these order ids in 24h", so
-- it is the index that makes the signal cheap rather than a scan of payments.
CREATE INDEX IF NOT EXISTS payments_token_id_created_idx
  ON public.payments (token_id, created_at DESC)
  WHERE token_id IS NOT NULL;

-- The other half of the same question, asked of the card instead of the
-- account: which profiles hold this Cardcom token. Not UNIQUE - two profiles
-- legitimately holding one family card is precisely the row we want to count,
-- not one we want to refuse.
CREATE INDEX IF NOT EXISTS payment_tokens_cardcom_token_idx
  ON public.payment_tokens (cardcom_token);

-- =============================================================================
-- 2. order_risk_assessments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_risk_assessments (
  -- The order IS the key. One assessment per order, written once at creation:
  -- a score that moves after the fact is a different claim (a re-review), and
  -- that belongs in the review columns below rather than in a second row.
  order_id      uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  score         integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  band          text NOT NULL CHECK (band IN ('low', 'elevated', 'review')),
  -- The reasons that fired, heaviest first. Text and not an enum: the weights
  -- and the reason list live in `lib/fraud/risk-score.ts` and are expected to
  -- move as chargebacks are observed, and an ALTER TYPE per tuning round is a
  -- migration for a change of opinion.
  reasons       text[] NOT NULL DEFAULT '{}',
  -- The raw counts behind the score. Kept because a score without its inputs
  -- cannot be re-derived after the weights change, and re-deriving old scores
  -- under new weights is the only way to find out whether a change was an
  -- improvement.
  signals       jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Nullable: with no proxy in front, `getClientIp` returns 'unknown', which is
  -- not an address and must not be stored as one.
  client_ip     inet,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- The review half. Null everywhere until a human opens the queue.
  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_outcome text CHECK (review_outcome IN ('cleared', 'refunded', 'blocked')),
  review_note   text,

  -- A decision is a person, a time and an outcome or it is not a decision.
  CONSTRAINT order_risk_review_complete CHECK (
    (reviewed_at IS NULL AND review_outcome IS NULL)
    OR (reviewed_at IS NOT NULL AND review_outcome IS NOT NULL)
  )
);

-- The queue's own query: unreviewed, band 'review', newest first.
CREATE INDEX IF NOT EXISTS order_risk_open_queue_idx
  ON public.order_risk_assessments (created_at DESC)
  WHERE reviewed_at IS NULL AND band = 'review';

ALTER TABLE public.order_risk_assessments ENABLE ROW LEVEL SECURITY;

-- LOCKED TO CLIENT ROLES, AND NOT BY OMISSION.
--
-- A customer must not read their own risk row. It names the reasons we flagged
-- them, which is a list of what to avoid next time; publishing it to the person
-- being scored converts every control in `risk-score.ts` into documentation for
-- evading it. Admins read this through the service-role client in
-- `/admin/fraud`, which does not consult RLS at all.
--
-- RESTRICTIVE rather than "no policies", for the reason 172 established:
-- permissive policies are ORed, so zero policies stops protecting a table the
-- moment somebody adds one. A RESTRICTIVE false cannot be outvoted.
DROP POLICY IF EXISTS "deny_all_client_roles" ON public.order_risk_assessments;
CREATE POLICY "deny_all_client_roles" ON public.order_risk_assessments
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- The grant, not only the policy. A permissive read added later would otherwise
-- carry INSERT, UPDATE and DELETE with it.
REVOKE ALL ON public.order_risk_assessments FROM anon, authenticated;

-- =============================================================================
-- 3. refund_requests
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.refund_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Denormalised from the order on purpose: RLS reads it on every row, and a
  -- policy that joins to `orders` to find the owner is a join per row.
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason_code   text NOT NULL CHECK (reason_code IN (
                  'not_as_described', 'not_received', 'defective',
                  'changed_mind', 'duplicate_charge', 'other')),
  reason_text   text NOT NULL CHECK (length(btrim(reason_text)) BETWEEN 10 AND 2000),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_note text,
  -- Set when an approval actually moved money, so the queue can tell "approved"
  -- from "approved and the refund went through".
  refund_payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,

  CONSTRAINT refund_request_decision_complete CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS refund_requests_order_idx
  ON public.refund_requests (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_user_idx
  ON public.refund_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refund_requests_pending_idx
  ON public.refund_requests (created_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS set_updated_at ON public.refund_requests;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/**
 * THE CAP. Three requests per order, counted in the database.
 *
 * A withdrawn request still counts. Otherwise the cap is bypassed by opening,
 * withdrawing and reopening, which is the same loop it exists to bound - and
 * withdrawing is free, so an uncounted withdrawal would make the limit
 * decorative for anyone who noticed.
 *
 * A REJECTED request also counts, and that is the point: three refusals on one
 * order is where the conversation moves to support rather than continuing
 * through a form. `docs/SUPPORT.md` is where it goes next.
 *
 * Counted in a BEFORE INSERT trigger rather than as a CHECK, because a CHECK
 * cannot see the other rows. Not race-free against two concurrent inserts by
 * construction; the row lock below makes it so, by taking the order's other
 * requests under a predicate lock in the same transaction.
 */
CREATE OR REPLACE FUNCTION public.fn_refund_request_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- FOR UPDATE on the sibling rows serialises two concurrent inserts for the
  -- same order: the second waits, then counts three and is refused. Without it
  -- both read two and both insert, and the order ends with four.
  SELECT count(*) INTO v_count
  FROM (
    SELECT 1 FROM public.refund_requests
    WHERE order_id = NEW.order_id
    FOR UPDATE
  ) locked;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'refund request cap reached for order %', NEW.order_id
      USING ERRCODE = 'check_violation',
            HINT = 'שלוש בקשות החזר לאותה הזמנה הן המקסימום. פנו לתמיכה.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refund_request_cap ON public.refund_requests;
CREATE TRIGGER refund_request_cap BEFORE INSERT ON public.refund_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_refund_request_cap();

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

-- The customer reads their own requests, and that is what makes the count
-- visible to them: the UI can say "בקשה 3 מתוך 3" only if it can read the rows.
DROP POLICY IF EXISTS "own_refund_requests_read" ON public.refund_requests;
CREATE POLICY "own_refund_requests_read" ON public.refund_requests
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- INSERT is NOT granted to the customer, and this is the asymmetry worth
-- naming. The action has to verify that the order is theirs, that it is in a
-- state a refund can be asked about, and that it is inside the window; a policy
-- can express ownership and nothing else, so a client-side INSERT would create
-- rows against orders that are not refundable and land them in the queue. The
-- write goes through `requestRefund` on the service-role client.
DROP POLICY IF EXISTS "admin_refund_requests_all" ON public.refund_requests;
CREATE POLICY "admin_refund_requests_all" ON public.refund_requests
  FOR ALL TO authenticated
  USING (public.is_admin() OR public.is_support())
  WITH CHECK (public.is_admin() OR public.is_support());

REVOKE INSERT, DELETE ON public.refund_requests FROM anon, authenticated;
GRANT SELECT ON public.refund_requests TO authenticated;

-- =============================================================================
-- 4. disputes
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.disputes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  -- RESTRICT above and here: a disputed order is evidence in a case that may
  -- still be open, and a cascade would delete the record of the money we are
  -- arguing about.
  payment_id    uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  -- The acquirer's own case number, typed in by whoever took the call. UNIQUE
  -- so entering the same case twice from two emails is refused rather than
  -- producing two deadlines for one chargeback.
  provider_ref  text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('chargeback', 'retrieval', 'pre_arbitration', 'inquiry')),
  status        text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'evidence_submitted', 'won', 'lost', 'accepted')),
  reason_code   text,
  amount_agorot bigint NOT NULL CHECK (amount_agorot >= 0),
  opened_at     timestamptz NOT NULL DEFAULT now(),
  -- The whole reason this table exists. A chargeback answered late is lost
  -- money with no argument, so this is NOT NULL: a case with no deadline is a
  -- case nobody will notice going quiet.
  respond_by    timestamptz NOT NULL,
  resolved_at   timestamptz,
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT disputes_provider_ref_unique UNIQUE (provider_ref),
  CONSTRAINT disputes_resolution_complete CHECK (
    (status IN ('open', 'evidence_submitted') AND resolved_at IS NULL)
    OR (status IN ('won', 'lost', 'accepted') AND resolved_at IS NOT NULL)
  )
);

-- "What is due and not answered", which is the only query that matters here.
CREATE INDEX IF NOT EXISTS disputes_open_deadline_idx
  ON public.disputes (respond_by)
  WHERE status IN ('open', 'evidence_submitted');
CREATE INDEX IF NOT EXISTS disputes_order_idx ON public.disputes (order_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.disputes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Locked to client roles for the same reason as the risk table: a dispute
-- record names what we intend to argue and what evidence we hold, and the
-- counterparty is the account holder.
DROP POLICY IF EXISTS "deny_all_client_roles" ON public.disputes;
CREATE POLICY "deny_all_client_roles" ON public.disputes
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

REVOKE ALL ON public.disputes FROM anon, authenticated;

COMMIT;
