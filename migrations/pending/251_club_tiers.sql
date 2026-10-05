-- 251_club_tiers.sql
-- Customer club tiers (W07, 2026-10-05): the thresholds move from a constant in
-- `src/lib/club/tiers.ts` into a four-row config table an admin edits, and the
-- tier a customer held at the moment they ordered is snapshotted on the order.
--
-- WHAT ALREADY EXISTS AND IS NOT CHANGED. The tier RULE is live since Q15
-- (25.09): a step function over what the customer PAID on the site in the
-- trailing 365 days (`paid_at`, falling back to `created_at`; statuses paid,
-- partially_fulfilled, fulfilled, platform_settled), computed at read time by
-- `server/queries/club.ts` and shown on /account. No stored per-customer tier
-- and no nightly job: a stored tier would be a second copy of the rule kept in
-- step by a job that can miss a night (227's header on exactly that shape).
--
-- WHAT THIS FILE ADDS, and only this:
--
--   1. `club_tiers`: four rows, one per tier id the application knows
--      (`member`, `silver`, `gold`, `platinum`), each with `min_agorot`, the
--      twelve-month spend from which the tier applies. The ids are FIXED by a
--      CHECK: the Hebrew names live in messages/he.json under `club.tiers.<id>`
--      and a fifth id would render as a dotted key. The floor is pinned to zero
--      by a second CHECK so "everybody is at least a member" is the database's
--      rule and not only the form's. Seeded with the constants the code has
--      used since Q15 (0 / 100000 / 300000 / 1000000 agorot), ON CONFLICT DO
--      NOTHING, so re-running never resets an operator's edit.
--
--      Monotonicity (silver < gold < platinum) is enforced by the admin action
--      (`lib/admin/club-tiers-settings.ts`, a zod refine over all three rows at
--      once) and re-checked by the reader (`tiersFromRows` falls back to the
--      compiled defaults and logs if the rows are not strictly ascending). It
--      is NOT a trigger here on purpose: a function would need its own
--      EXECUTE grants audited (143/158), and the single writer is the service
--      key behind a `payments: write` guard.
--
--   2. `orders.club_tier` and `orders.club_spend_agorot`: the tier and the
--      twelve-month spend that earned it, as they were WHEN THE ORDER WAS
--      CREATED. Written by checkout in its OWN statement after the INSERT
--      (same shape as the gift columns: a missing column costs an unlabelled
--      order, never an uncreated one). Display only; no discount logic reads
--      either column. The order being created is `pending` and therefore does
--      not count towards its own snapshot.
--
-- APPLICATION BEHAVIOUR BEFORE THIS FILE IS APPLIED. `club_tiers` missing
-- (PGRST205) -> the reader uses the compiled defaults and logs
-- `club.tiers_table_missing` once; /admin/settings shows the defaults
-- read-only with this file's name. `orders.club_tier` missing -> checkout
-- logs `checkout.club_tier_not_recorded` and the order stands.
--
-- RLS. `club_tiers` is readable by `authenticated` (the thresholds are shown to
-- every signed-in customer as "next tier") and writable by nobody but the
-- service role: no INSERT/UPDATE/DELETE policy, and the table grant for the
-- client roles is SELECT only, revoked for `anon` entirely. The orders columns
-- ride the existing orders policies (owner read, service-role write).
--
-- Idempotent. No existing row changes. Depends on 010 (`set_updated_at`),
-- applied; the function is NOT redefined here (244 takes the same stance):
-- redefining a live trigger function in an unrelated migration is how a
-- search_path or a grant changes without anyone reading about it.

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

-- The snapshot on the order.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS club_tier text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS club_spend_agorot bigint;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_club_tier_known;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_club_tier_known
  CHECK (club_tier IS NULL OR club_tier IN ('member', 'silver', 'gold', 'platinum'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_club_spend_agorot_non_negative;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_club_spend_agorot_non_negative
  CHECK (club_spend_agorot IS NULL OR club_spend_agorot >= 0);

COMMENT ON COLUMN public.orders.club_tier IS
  'Club tier the customer held when the order was created (snapshot, display only). NULL on orders created before 251 or when the write failed.';
COMMENT ON COLUMN public.orders.club_spend_agorot IS
  'Trailing-12-month paid spend, in agorot, that earned club_tier at order creation. Snapshot.';
