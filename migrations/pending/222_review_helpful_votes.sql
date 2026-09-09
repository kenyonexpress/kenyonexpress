-- 222_review_helpful_votes.sql
--
-- "Was this review helpful?", and the counter that makes it sortable.
--
-- =============================================================================
-- WHY A TABLE AND NOT A COLUMN
-- =============================================================================
--
-- A bare `helpful_count` on `reviews` that anyone can increment is a number
-- anyone can invent. The vote has to be attributable to hold up at all, and
-- once it is attributable the row IS the record: one vote per person per
-- review, enforced by the primary key rather than by the code that writes it.
--
-- `(review_id, user_id)` is the primary key. That is the whole anti-abuse
-- design and it is worth more than any rate limit, because a rate limit slows
-- a second vote down and a primary key makes it impossible.
--
-- AUTHENTICATED ONLY, no anonymous votes. An anonymous vote can only be keyed
-- by something forgeable - a cookie, an IP - so it is not one-per-person, it is
-- one-per-thing-the-voter-controls. Sorting by a number like that is worse than
-- not sorting, because it looks like a signal.
--
-- =============================================================================
-- THE COUNTER IS CACHED, FOR THE SAME REASON AS 221
-- =============================================================================
--
-- `reviews.helpful_count`, maintained by trigger. Sorting by helpfulness means
-- ORDER BY on this column; computing it per-review at read time turns one query
-- into a count per row, and PostgREST cannot order by an aggregate of an
-- embedded resource anyway.
--
-- A vote is deleted when the voter takes it back, so the trigger handles
-- INSERT and DELETE. There is no UPDATE path: unvoting is a delete, and voting
-- again is a fresh row.
--
-- =============================================================================
-- WHAT A READER MAY SEE
-- =============================================================================
--
-- The COUNT is public, on the review. The individual VOTES are not readable by
-- anyone through the API: who found what helpful is a behavioural trace and
-- publishing it would let anyone build a profile of any customer from the
-- catalogue. A voter can read and delete their OWN row, which is what the UI
-- needs to show the button as already pressed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_helpful_votes (
  review_id  uuid NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (review_id, user_id)
);

COMMENT ON TABLE public.review_helpful_votes IS
  'One row per person per review. The primary key is the anti-abuse design; see 222.';

-- The counter's own index is on `reviews` (below). This one serves "which
-- reviews did I find helpful", the read the UI makes to paint pressed states.
CREATE INDEX IF NOT EXISTS review_helpful_votes_user_idx
  ON public.review_helpful_votes (user_id);

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS helpful_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_helpful_count_sane;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_helpful_count_sane CHECK (helpful_count >= 0);

COMMENT ON COLUMN public.reviews.helpful_count IS
  'Cached count of review_helpful_votes; maintained by trg_review_helpful_count (222).';

CREATE OR REPLACE FUNCTION public.fn_review_helpful_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.reviews SET helpful_count = helpful_count + 1 WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.reviews SET helpful_count = helpful_count - 1 WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

-- SECURITY DEFINER for the same reason as 221: the voter holds no UPDATE on
-- `reviews` and must not. 199 scoped the only UPDATE grant on that table to the
-- three supplier_reply columns, and this must not widen it.
REVOKE ALL ON FUNCTION public.fn_review_helpful_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_review_helpful_count ON public.review_helpful_votes;
CREATE TRIGGER trg_review_helpful_count
  AFTER INSERT OR DELETE ON public.review_helpful_votes
  FOR EACH ROW EXECUTE FUNCTION public.fn_review_helpful_count();

-- Sorting the review list for one product by helpfulness. Approved and
-- undeleted only, because that is the only list anyone sorts.
CREATE INDEX IF NOT EXISTS reviews_helpful_idx
  ON public.reviews (product_id, helpful_count DESC, created_at DESC)
  WHERE status = 'approved' AND deleted_at IS NULL;

ALTER TABLE public.review_helpful_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "review_helpful_votes_own_select" ON public.review_helpful_votes;
CREATE POLICY "review_helpful_votes_own_select"
  ON public.review_helpful_votes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "review_helpful_votes_own_insert" ON public.review_helpful_votes;
CREATE POLICY "review_helpful_votes_own_insert"
  ON public.review_helpful_votes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "review_helpful_votes_own_delete" ON public.review_helpful_votes;
CREATE POLICY "review_helpful_votes_own_delete"
  ON public.review_helpful_votes FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- The grant is the boundary; the policies only narrow it. No UPDATE at all:
-- there is nothing in a vote to change, and its absence means a voter cannot
-- reassign a row to somebody else.
REVOKE ALL ON public.review_helpful_votes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.review_helpful_votes TO authenticated;

-- Backfill, idempotent: assigns rather than adds.
UPDATE public.reviews r
   SET helpful_count = COALESCE(v.c, 0)
  FROM (SELECT review_id, COUNT(*)::integer AS c FROM public.review_helpful_votes GROUP BY review_id) v
 WHERE v.review_id = r.id AND r.helpful_count <> v.c;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.reviews r
   WHERE r.helpful_count <> (SELECT count(*) FROM public.review_helpful_votes v WHERE v.review_id = r.id);
  IF n <> 0 THEN
    RAISE EXCEPTION 'helpful_count disagrees with the votes table on % review(s)', n;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='review_helpful_votes'
       AND grantee='authenticated' AND privilege_type='UPDATE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not hold UPDATE on review_helpful_votes';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- PROBED AGAINST PRODUCTION, ROLLED BACK, 2026-09-09
-- =============================================================================
--
-- Scratch tables of the same shape, inside a `DO` block that raises at the end.
--
--   one_vote                   = 1   trigger increments
--   two_voters                 = 2
--   double_vote                = refused (unique_violation)
--   after_unvote               = 1   trigger decrements
--   votes_after_review_delete  = 0   the CASCADE takes them
--
-- The third line is the one worth having: the second vote from the same person
-- is refused by the PRIMARY KEY, not by application code, so there is no path
-- through the API that inflates a count. `to_regclass` returned null for both
-- scratch tables afterwards.
