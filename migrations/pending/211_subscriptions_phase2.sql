-- 211_subscriptions_phase2.sql
--
-- An invoice for a cycle charge, and the phase switch for [90].
--
-- =============================================================================
-- WHAT IS ALREADY BUILT, MEASURED BEFORE ANYTHING WAS WRITTEN
-- =============================================================================
--
-- `135b_recurring_subscriptions.sql` is applied. `subscriptions` (18 columns)
-- and `subscription_charges` (11) both exist in production, holding no rows,
-- and the machinery around them is real rather than scaffolding:
--
--   MAX_CHARGE_ATTEMPTS = 3          lib/commerce/recurring.ts, [90]'s dunning
--   status paused                    understood by `dueSubscriptions`
--   cancelSubscription               server/actions/subscriptions.ts
--   the charge cron                  app/api/cron/subscriptions/route.ts
--   /account/subscriptions           a page with a list
--   subscription_charges_one_per_cycle  a unique index that makes a cycle
--                                       payable exactly once
--
-- So [90] is mostly done. What it is missing, measured against its own list:
--
--   pause and resume    the STATUS exists and NOTHING CAN SET IT. `paused` is a
--                       state the code understands, `dueSubscriptions` skips,
--                       and no code path produces. `cancelSubscription` is the
--                       only exported action.
--   invoices per charge zero mentions of an invoice anywhere on the charge path
--   admin console       no /admin/subscriptions route exists
--   feature flag off    210 seeds every type ENABLED, `recurring` included
--
-- =============================================================================
-- WHY `invoices.order_id` HAS TO BECOME NULLABLE
-- =============================================================================
--
-- `invoices.order_id` is NOT NULL, and a subscription cycle charge creates no
-- order. That is not an oversight in the charge path; it is a decision the cron
-- states in its own header:
--
--   "It does not move money into the wallet or create an order. A cycle charge
--    is a payment against a token ... Building orders per cycle would create a
--    second, competing definition of what an order is."
--
-- That reasoning is correct and this file does not overturn it. An invoice has
-- to point at SOMETHING, so the column becomes nullable and a second reference
-- is added, with a CHECK that exactly one of them is set. An invoice for
-- nothing, or for both, is a document nobody can trace.
--
-- SAFE TO WIDEN: `invoices` holds zero rows. Every existing writer sets
-- `order_id`, and the CHECK keeps them correct rather than merely allowed.
--
-- =============================================================================
-- WHY THE PHASE SWITCH IS TURNED OFF HERE AND NOT IN 210
-- =============================================================================
--
-- 210 seeds every product type ENABLED, deliberately, so that applying it
-- changes nothing a shopper sees. [90] asks for its feature flag OFF, which is
-- a different statement: it is about this feature, not about the shape of the
-- table.
--
-- Each phase-2 section owning its own switch is also the pattern 91 and 92
-- need, and it keeps 210's verification intact rather than editing a file whose
-- probe is already recorded.

BEGIN;

-- =============================================================================
-- 1. An invoice can belong to a cycle charge
-- =============================================================================

ALTER TABLE public.invoices ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subscription_charge_id uuid
  REFERENCES public.subscription_charges(id) ON DELETE CASCADE;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_one_subject_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_one_subject_check
  CHECK (num_nonnulls(order_id, subscription_charge_id) = 1);

-- One invoice per charge, the same guarantee `subscription_charges_one_per_cycle`
-- gives the charge itself. Without it a retried invoice job issues a second tax
-- document for one payment, which is a reporting error and not a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_subscription_charge
  ON public.invoices (subscription_charge_id)
  WHERE subscription_charge_id IS NOT NULL;

-- The lookup the account page and the admin console both make.
CREATE INDEX IF NOT EXISTS invoices_subscription_charge_idx
  ON public.invoices (subscription_charge_id)
  WHERE subscription_charge_id IS NOT NULL;

-- =============================================================================
-- 2. The phase switch, off
-- =============================================================================
--
-- `ON CONFLICT DO UPDATE` and not `DO NOTHING`, unlike 210's seed: 210 has
-- almost certainly already created this row, and the point of this statement is
-- to change it. `enabled_at` is left alone, so if the type is ever turned on
-- and off again the original date survives - the rule `set_phase_enabled`
-- enforces, restated here because this is the one write that does not go
-- through it.

INSERT INTO public.phase_config (product_type, phase, is_enabled, enabled_at, note)
VALUES ('recurring', 2, false, NULL,
        'שלב 2, כבוי לפי [90]. המנגנון בנוי ואין מוצרי מנוי פעילים.')
ON CONFLICT (product_type) DO UPDATE
  SET is_enabled = false,
      note = excluded.note;

COMMIT;
