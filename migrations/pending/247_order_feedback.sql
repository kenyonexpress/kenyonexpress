-- 247_order_feedback.sql
--
-- Private order-experience feedback, one row per paid order (STEP 11, 01.10).
--
-- MEASURED BEFORE WRITING. `grep -rn "order_feedback\|experience_rating"
-- src migrations supabase` found nothing on 2026-10-01. The only rating the
-- store keeps is `reviews` (154): per PRODUCT, per order_item, and written for
-- public display (moderated, and since 232 no longer shown, but shaped for
-- it). Nothing lets a shopper say how the ORDER went - the delivery, the
-- packaging, the counter that honoured the coupon - and nothing carries such
-- a message to the owner without publishing it.
--
-- WHAT THIS IS. A 1..5 rating and up to 2000 characters of free text, keyed
-- to the order and to the customer who placed it. It is READ BY THE OWNER
-- ONLY: the account page shows the customer their own row, the admin order
-- page shows staff the row through the service role, and the action that
-- writes it mails the shop inbox. There is no public surface, no aggregate,
-- no moderation queue, because there is nothing to moderate for: the text
-- never leaves the two people it concerns.
--
-- WHY A TABLE AND NOT A COLUMN ON ORDERS. A rating is the customer's word and
-- `orders` is the ledger's. Putting opinion next to money means every ledger
-- read carries it, every ledger policy governs it, and the account-deletion
-- purge (lib/account/deletion.ts) cannot erase the opinion while keeping the
-- money, which is exactly what it must do.
--
-- WHY INSERT-ONLY FOR THE CUSTOMER. One row per order (UNIQUE), no UPDATE
-- policy, no DELETE policy. The message is sent the moment it is written;
-- an edit after the mail has gone out would make the row and the inbox
-- disagree. Erasure comes with the account, through the purge list, on the
-- service role.
--
-- THE INSERT POLICY IS THE ELIGIBILITY CHECK. The application asks for
-- feedback only on a paid order, and this policy says so again where a
-- client cannot skip it: the row must name the caller, and the order must be
-- the caller's, paid, and not soft-deleted. A forged order_id is 42501, the
-- same refusal 154 gives an unverified review.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.order_feedback;

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_feedback (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  -- 1000 is the form limit (lib/orders/feedback.ts); the CHECK holds a harder
  -- 2000 so a copy change never needs a migration.
  body        text        CHECK (body IS NULL OR length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One word per order. A second submission is 23505, which the action
  -- answers with "already sent" rather than with a duplicate.
  UNIQUE (order_id)
);

COMMENT ON TABLE public.order_feedback IS
  'Private per-order experience feedback (1..5 + text) from the customer to the shop owner. Never public: read by the owner of the row and by staff through the service role only.';
COMMENT ON COLUMN public.order_feedback.rating IS
  '1 (bad) .. 5 (excellent), as the customer scored the whole order: delivery, packaging, the counter.';
COMMENT ON COLUMN public.order_feedback.body IS
  'Free text, at most 2000 characters, null when the customer gave a rating only.';

CREATE INDEX IF NOT EXISTS order_feedback_user_idx
  ON public.order_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_feedback_created_idx
  ON public.order_feedback (created_at DESC);


ALTER TABLE public.order_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_feedback_owner_select" ON public.order_feedback;
CREATE POLICY "order_feedback_owner_select"
  ON public.order_feedback FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "order_feedback_owner_insert_paid" ON public.order_feedback;
CREATE POLICY "order_feedback_owner_insert_paid"
  ON public.order_feedback FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_id
         AND o.user_id = (SELECT auth.uid())
         AND o.paid_at IS NOT NULL
         AND o.deleted_at IS NULL
    )
  );

-- No UPDATE and no DELETE policy on purpose: see the header.

REVOKE ALL ON public.order_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.order_feedback TO authenticated;


DO $$
DECLARE
  v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.order_feedback'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS is off on order_feedback';
  END IF;

  IF has_table_privilege('anon', 'public.order_feedback', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read order_feedback; the revoke did not take';
  END IF;

  IF has_table_privilege('authenticated', 'public.order_feedback', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.order_feedback', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated can edit order_feedback; the row is insert-only for the customer';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'order_feedback'
       AND 'anon' = ANY (roles)
  ) THEN
    RAISE EXCEPTION 'a policy on order_feedback names anon; the table is never public';
  END IF;
END $$;

COMMIT;
