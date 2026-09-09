-- 210_product_phases.sql
--
-- Which product types the shop is currently selling.
--
-- =============================================================================
-- THE MEASUREMENT THAT SHAPES THIS FILE
-- =============================================================================
--
-- [89] describes phase 1 as "coupons + full-charge products with partial
-- supplier transfer" and phase 2 as "physical, courses, subscriptions, cabins",
-- toggled on by the admin after 10 sales.
--
-- Read off production 2026-09-09:
--
--   type      status   count
--   --------  -------  -----
--   coupon    draft       15
--   physical  active      44
--   physical  draft       21
--
--   orders total 4, of which sold 2.  vouchers 0.
--
-- SO EVERY ACTIVE PRODUCT ON THIS SITE IS `physical`, WHICH THE SECTION PUTS IN
-- PHASE 2. Enforcing phase 1 as written would hide 44 of 44 active products and
-- leave an empty shop. There are no active coupons at all: all 15 are drafts.
-- And the toggle's condition is 10 sales, against 2.
--
-- That does not make the feature wrong. It makes the DEFAULT wrong, and this
-- file therefore separates two things the section says in one breath:
--
--   `phase`       which phase a type BELONGS to. The section's answer, recorded.
--   `is_enabled`  whether it is sellable RIGHT NOW. Seeded true for every type.
--
-- Applying this file changes nothing a shopper sees. The phase column is
-- advice; the boolean is the switch, and turning one off is a decision an
-- operator makes while looking at the count of what it will hide - which is
-- what `/admin/phases` prints next to each row.
--
-- =============================================================================
-- WHY A TABLE AND NOT AN ENVIRONMENT VARIABLE
-- =============================================================================
--
-- `lib/admin/feature-flags.ts` says it plainly: "There is no flags table. An
-- agent cannot apply a migration, so a deploy-free admin toggle does not
-- exist." That is true of the four kill switches, which are operational and
-- belong to a deploy.
--
-- This is not that. [89] asks for a toggle the ADMIN flips after ten sales, and
-- an environment variable is not something an admin flips - it is a redeploy,
-- which on this project is a step nobody has been able to take since 31.08.
-- A table with an admin screen is the only version of this feature that the
-- person it is for can actually use.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.phase_config (
  -- The `product_type` enum value this row governs. TEXT and not the enum, on
  -- purpose: 91 and 92 add course and cabin types, and a text key lets a row be
  -- seeded for a type before the enum has it - which is the order those
  -- sections need, since the phase must be OFF before the type exists.
  product_type text PRIMARY KEY CHECK (length(btrim(product_type)) BETWEEN 2 AND 40),

  -- 1 or 2, as [89] assigns them. ADVICE, not enforcement: nothing reads this
  -- to decide whether a product is sellable. It is what the admin screen prints
  -- so an operator knows which switch belongs to which launch.
  phase integer NOT NULL CHECK (phase IN (1, 2)),

  -- The switch. Seeded TRUE for every type that exists today, so applying this
  -- file changes nothing. See the header.
  is_enabled boolean NOT NULL DEFAULT true,

  -- Set the first time a type is turned on, and never moved. "Since when has
  -- this been sellable" is a different question from "when was this row last
  -- edited", which `updated_at` answers.
  enabled_at timestamptz,

  -- Why it is off, shown to the operator and to nobody else. A switch with no
  -- reason is a switch nobody dares flip back.
  note text CHECK (note IS NULL OR length(note) <= 500),

  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- An enabled type has a date. The pair is what lets the admin screen say
  -- "selling since 4 August" rather than "on".
  CONSTRAINT phase_config_enabled_has_date
    CHECK (NOT is_enabled OR enabled_at IS NOT NULL)
);

DROP TRIGGER IF EXISTS phase_config_set_updated_at ON public.phase_config;
CREATE TRIGGER phase_config_set_updated_at
  BEFORE UPDATE ON public.phase_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.phase_config ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ, and it has to be. The storefront filters the catalogue by this
-- table on every uncached read, through the anon client. There is nothing
-- private in it: which product types a shop sells is visible by looking at the
-- shop.
DROP POLICY IF EXISTS phase_config_public_read ON public.phase_config;
CREATE POLICY phase_config_public_read ON public.phase_config
  FOR SELECT TO anon, authenticated USING (true);

-- No write policy for anybody. The admin action goes through the service role,
-- like every other write in this repository's admin panel.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.phase_config FROM anon, authenticated;

-- =============================================================================
-- THE SEED, AND IT IS THE ONE PLACE THIS FILE INSERTS ROWS
-- =============================================================================
--
-- Unlike 205, this file DOES seed - because the rows are not copy, they are the
-- four values of an enum this database already has, and a missing row would
-- have to mean something. `ON CONFLICT DO NOTHING` so re-applying is safe and
-- so an operator's later edit is never overwritten by a re-run.
--
-- EVERY ONE IS ENABLED. `physical` is phase 2 by the section's own assignment
-- and is the only type with active products, so seeding it disabled would
-- empty the shop the moment this file is applied.

INSERT INTO public.phase_config (product_type, phase, is_enabled, enabled_at, note)
VALUES
  ('coupon',    1, true, now(), 'שלב 1. אין כרגע קופונים פעילים; כל 15 הם טיוטות.'),
  ('physical',  2, true, now(), 'שלב 2 לפי הסעיף, אבל כל 44 המוצרים הפעילים הם מסוג זה. כיבוי מרוקן את החנות.'),
  ('service',   2, true, now(), 'שלב 2. אין שורות מסוג זה.'),
  ('recurring', 2, true, now(), 'שלב 2. אין שורות מסוג זה. מנויים נבנים ב-90.')
ON CONFLICT (product_type) DO NOTHING;

-- =============================================================================
-- set_phase_enabled
-- =============================================================================

/**
 * Turn a product type on or off.
 *
 * A FUNCTION rather than an UPDATE from the client, for one reason:
 * `enabled_at` is set on the FIRST enable and never moved afterwards, which is
 * a read-then-write the client cannot express. The rest could have been an
 * update; keeping it together means the rule cannot be forgotten by the second
 * caller.
 *
 * It does NOT refuse to disable a type that has active products. That refusal
 * belongs in the admin screen, where the operator can see the count and decide,
 * not in the database, where it would be a rule nobody could override on the
 * day they need to pull a whole category off the site.
 */
CREATE OR REPLACE FUNCTION public.set_phase_enabled(
  p_product_type text,
  p_enabled      boolean,
  p_actor        uuid,
  p_note         text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.phase_config SET
    is_enabled = p_enabled,
    enabled_at = CASE WHEN p_enabled THEN coalesce(enabled_at, now()) ELSE enabled_at END,
    note       = coalesce(p_note, note),
    updated_by = p_actor
  WHERE product_type = p_product_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown product type %', p_product_type USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_phase_enabled(text, boolean, uuid, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
