-- 199_review_replies_and_reports.sql
--
-- The supplier's answer, and the reader's objection.
--
-- WHAT 154 SHIPPED AND WHAT IT DID NOT
--
-- `reviews` is applied and carries the hard parts: a verified-purchase INSERT
-- policy keyed on `order_item_id`, a moderation `status`, a soft delete, and
-- (with 189) one review per customer per product. What it has no room for is a
-- conversation.
--
-- A one-star review with no reply and a one-star review with "we are sorry, the
-- masseuse was ill that day and we have refunded you" are different documents.
-- The second is the one that makes a shopper trust the shop; the first is the
-- one that makes them leave. Nothing in the schema could hold the second.
--
-- AND NOTHING COULD BE OBJECTED TO. A moderation queue that only sees what an
-- admin happens to open is not moderation at scale. The person who notices that
-- a review names a member of staff, or is somebody's phone number, is a reader
-- -- and until now a reader had no way to say so.
--
-- MEASURED 2026-09-09: `reviews` holds 0 rows. Everything here, and everything
-- 154 shipped, is inert until the first customer writes one. That is stated
-- rather than hidden, because "the reply feature works" and "the reply feature
-- has never had a review to reply to" are different claims.
--
-- THE POLICY THAT MATTERS IS THE SUPPLIER'S
--
-- A supplier may write a reply on a review of a product THEY supply, and change
-- nothing else on the row. Two mechanisms, both needed:
--
--   * the RLS policy proves the membership, through products.supplier_id;
--   * a COLUMN GRANT restricts the UPDATE to the three reply columns.
--
-- Either alone is insufficient. The policy without the grant would let a
-- supplier edit the rating and the body of a review about them, which is the
-- single worst write this schema could permit. The grant without the policy
-- would let any supplier reply to any review.

BEGIN;

-- ------------------------------------------------------------------- reply

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS supplier_reply text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS supplier_replied_at timestamptz;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS supplier_replied_by uuid;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_supplier_reply_length;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_supplier_reply_length
  -- Bounded, and the bound is the point rather than the number: a reply is an
  -- answer to a review, not a second listing. 1000 is roughly four paragraphs.
  CHECK (supplier_reply IS NULL OR char_length(btrim(supplier_reply)) BETWEEN 2 AND 1000);

COMMENT ON COLUMN public.reviews.supplier_reply IS
  'The supplier''s public answer. Written only by a member of the supplying business, through a column grant; see docs/REVIEWS.md.';

-- ------------------------------------------------------------------ report

CREATE TABLE IF NOT EXISTS public.review_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  -- A closed list, because free text is a field nobody reads. Each value is a
  -- reason an admin would ACT on differently.
  reason      text NOT NULL CHECK (reason IN ('spam', 'offensive', 'personal_details', 'off_topic', 'other')),
  detail      text CHECK (detail IS NULL OR char_length(detail) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Set when an admin has looked. NOT a delete: "we looked and it was fine" is
  -- the answer that stops the same review being re-queued by the next report,
  -- and it is only expressible if the row survives.
  resolved_at timestamptz,
  resolved_by uuid,
  resolution  text CHECK (resolution IS NULL OR resolution IN ('upheld', 'dismissed'))
);

-- One report per person per review. A second click is the same objection, and
-- counting it twice would let one reader make a review look widely objected to.
CREATE UNIQUE INDEX IF NOT EXISTS review_reports_one_per_reporter
  ON public.review_reports (review_id, reporter_id);

-- The moderation queue's read: unresolved, newest first.
CREATE INDEX IF NOT EXISTS review_reports_open
  ON public.review_reports (created_at DESC) WHERE resolved_at IS NULL;

COMMENT ON TABLE public.review_reports IS
  'Reader objections to a published review. Resolved rather than deleted, so "we looked and it was fine" survives.';

-- ---------------------------------------------------------------------- RLS

ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;

-- A reporter may file, and may not read the queue. Deliberately asymmetric:
-- letting a reporter read their own report back tells them whether an admin has
-- acted, which turns a moderation decision into a conversation with whoever
-- objected loudest.
DROP POLICY IF EXISTS "review_reports_insert_own" ON public.review_reports;
CREATE POLICY "review_reports_insert_own"
  ON public.review_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = (SELECT auth.uid()));

REVOKE ALL ON public.review_reports FROM anon, authenticated;
GRANT INSERT ON public.review_reports TO authenticated;

-- The supplier's reply policy. The membership is proved through the product,
-- which is the only link between a review and a business.
DROP POLICY IF EXISTS "reviews_supplier_reply" ON public.reviews;
CREATE POLICY "reviews_supplier_reply"
  ON public.reviews FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.products p
        JOIN public.supplier_members m ON m.supplier_id = p.supplier_id
       WHERE p.id = reviews.product_id
         AND m.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.products p
        JOIN public.supplier_members m ON m.supplier_id = p.supplier_id
       WHERE p.id = reviews.product_id
         AND m.user_id = (SELECT auth.uid())
    )
  );

-- THE REVOKE IS NOT TIDYING. IT IS THE FIX.
--
-- `authenticated` already holds a TABLE-WIDE UPDATE grant on `reviews`, over
-- all fourteen columns. It is inert today for one reason only: there is no
-- UPDATE policy on the table, so RLS denies every UPDATE regardless of the
-- grant.
--
-- The policy above ENDS that. Adding it turns a dormant grant into a live
-- capability, and the first version of this file did exactly that -- a probe
-- against production came back `rewrite_body=ALLOWED`, meaning a supplier could
-- have rewritten the rating and the body of a review about their own business.
-- The column grant beneath was not wrong; it was simply never reached, because
-- the wider grant already covered every column.
--
-- This is the shape 172's RESTRICTIVE policies were installed for, arriving
-- from the other direction: a grant that protects nothing until somebody adds
-- a policy, at which point it protects nothing.
--
-- Safe to revoke: no policy consults it, so nothing can be relying on it.
REVOKE UPDATE ON public.reviews FROM authenticated;

-- The half the policy cannot express. Without this a supplier could rewrite the
-- rating and the body of a review about their own business, which is the single
-- worst write this schema could permit.
GRANT UPDATE (supplier_reply, supplier_replied_at, supplier_replied_by)
  ON public.reviews TO authenticated;

DO $$
DECLARE n int;
BEGIN
  -- The grant is the load-bearing half, so it is asserted rather than assumed.
  SELECT count(*) INTO n
    FROM information_schema.column_privileges
   WHERE table_schema = 'public' AND table_name = 'reviews'
     AND grantee = 'authenticated' AND privilege_type = 'UPDATE';
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected UPDATE on exactly 3 review columns for authenticated, found %', n;
  END IF;
END $$;

COMMIT;
