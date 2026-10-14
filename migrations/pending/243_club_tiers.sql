-- 243_club_tiers.sql
--
-- Customer club thresholds as a table an operator can edit (closeout L10,
-- row 23). The first half of the production branch's 251_club_tiers.sql,
-- renumbered above this line's 242 (the two lines' numbers collide from 211
-- on, see claude/STATE.md).
--
-- WHAT THIS LINE ALREADY DOES WITHOUT IT. `src/lib/club/tiers.ts` computes a
-- customer's tier from what they paid on the site in the trailing 365 days,
-- at read time, against compiled thresholds (0 / 1,000 / 3,000 / 10,000 ILS)
-- and `/account` shows it. `src/lib/club/tiers-config.ts` reads this table
-- when it exists and falls back to those constants, logging once, when it
-- does not (PGRST205). So applying this file changes nothing a customer sees
-- until somebody edits a row.
--
-- WHAT IS LEFT OUT, ON PURPOSE. The production file also adds
-- `orders.club_tier` and `orders.club_spend_agorot`, a snapshot written by
-- checkout. This line does not port that checkout write, so the columns would
-- have no writer; they are not added here.
--
-- RLS. Readable by `authenticated` (the next tier's threshold is shown to
-- every signed-in customer), writable by the service role only, nothing for
-- `anon`. The grant is the boundary, not only the policy (144/230).
--
-- Idempotent. No existing row changes. Depends on 010 (`set_updated_at`),
-- applied; the function is not redefined here.
--
-- ROLLBACK
--   drop table if exists public.club_tiers;

CREATE TABLE IF NOT EXISTS public.club_tiers (
  id          text        PRIMARY KEY,
  rank        smallint    NOT NULL UNIQUE,
  min_agorot  bigint      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_tiers_id_known
    CHECK (id IN ('member', 'silver', 'gold', 'platinum')),
  CONSTRAINT club_tiers_min_agorot_non_negative
    CHECK (min_agorot >= 0),
  CONSTRAINT club_tiers_floor_is_zero
    CHECK ((id = 'member') = (min_agorot = 0))
);

COMMENT ON TABLE public.club_tiers IS
  'Customer club thresholds: the trailing-12-month paid spend (integer agorot) from which each tier applies. Four fixed ids; names live in messages/he.json. Edited from /admin/settings.';
COMMENT ON COLUMN public.club_tiers.min_agorot IS
  'Twelve-month spend, in agorot, from which this tier applies. member is pinned to 0.';

DROP TRIGGER IF EXISTS set_updated_at ON public.club_tiers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.club_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The constants src/lib/club/tiers.ts has carried since Q15. DO NOTHING so a
-- re-run never undoes an operator's edit.
INSERT INTO public.club_tiers (id, rank, min_agorot) VALUES
  ('member',   0,         0),
  ('silver',   1,   100000),
  ('gold',     2,   300000),
  ('platinum', 3,  1000000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.club_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS club_tiers_authenticated_read ON public.club_tiers;
CREATE POLICY club_tiers_authenticated_read
  ON public.club_tiers
  FOR SELECT
  TO authenticated
  USING (true);

-- The policy alone is not the boundary (144/230): the grant is.
REVOKE ALL ON public.club_tiers FROM anon;
REVOKE ALL ON public.club_tiers FROM authenticated;
GRANT SELECT ON public.club_tiers TO authenticated;
