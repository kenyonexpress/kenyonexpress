-- 261: refund_requests, the table behind the customer's s.14C cancellation form.
--
-- S27 (05.11.2026) measured it absent in production: PostgREST answers PGRST205
-- for `refund_requests`, so `requestRefund` (src/server/actions/refund-requests.ts)
-- could only ever return its "table missing" sentence, and no customer could
-- file a cancellation from /account/orders/[id]. The table was written in
-- 202_fraud_abuse.sql, which was never applied and also carries the fraud
-- scoring and disputes tables. This file is section 3 of 202, verbatim, so the
-- cancellation path can go live without the rest of 202. 202 stays pending;
-- every statement here is IF NOT EXISTS / OR REPLACE / DROP IF EXISTS, so
-- applying 202 later re-runs this section as a no-op.
--
-- Depends on objects that exist in production (rehearsed in BEGIN/ROLLBACK):
-- public.orders, public.profiles, public.payments, public.set_updated_at(),
-- public.is_admin(), public.is_support().

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

