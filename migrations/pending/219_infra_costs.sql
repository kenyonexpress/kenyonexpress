-- 219_infra_costs.sql
--
-- What the platform pays, per provider per month, and the month's ceiling.
--
-- WHY THIS IS A TABLE AND NOT A SET OF API CALLS
--
-- Measured 2026-09-09: NONE of the four providers can be billed-queried from
-- this project. `src/lib/env.ts` declares twenty-seven variables and not one is
-- a billing credential -- no Vercel token (and no project link either), no
-- Supabase management token, no Upstash MANAGEMENT key, no Cloudflare token.
-- `src/lib/costs/providers.ts` names the exact variable each one would need.
--
-- So the manual figure is not a fallback, it is the working path, and it has to
-- persist somewhere an operator can correct. What an API pull would add later
-- is a different `source` on the same row.
--
-- MONEY IS `micro` AND NOT AGOROT, the same exception as `sms_messages` and for
-- the same two reasons: these are vendor costs in USD, quoted to five and six
-- decimal places, so agorot would need an FX rate the row does not have while
-- rounding a $0.0075 unit to 1 agora. Integer, because the half of the money
-- rule that is never relaxed is the integer half.
--
-- THE MONTH IS A `date` PINNED TO THE FIRST, NOT A text '2026-09'
--
-- A text month cannot be compared, ordered or windowed without parsing, and
-- every reader would parse it slightly differently. A date with a CHECK that it
-- is the first of a month sorts, ranges and subtracts for free, and the CHECK
-- is what stops it drifting into "the day somebody entered the figure".
--
-- ONE ROW PER PROVIDER PER MONTH PER KIND. The kind is part of the key because
-- one provider legitimately carries both: a Vercel Pro seat is fixed and its
-- bandwidth overage is not, and collapsing them would make the month-end
-- projection extrapolate a subscription -- the exact error
-- `src/lib/costs/model.ts` exists to avoid.
--
-- ROLLBACK:
--   drop table public.infra_costs;
--   drop table public.infra_budgets;

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.infra_costs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  provider     text        NOT NULL
                           CHECK (provider IN ('vercel', 'supabase', 'upstash',
                                               'cloudflare', 'twilio', 'resend')),

  -- The first of the month it belongs to. See the header.
  month        date        NOT NULL CHECK (date_trunc('month', month) = month),

  -- Fixed accrues once; variable accrues through the month and is the only
  -- part a projection may extrapolate.
  kind         text        NOT NULL CHECK (kind IN ('fixed', 'variable')),

  amount_micro bigint      NOT NULL CHECK (amount_micro >= 0),
  currency     text        NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),

  -- `manual` is a figure a person typed off a dashboard; `api` is one a pull
  -- fetched. Keeping them apart is the difference between a measurement and a
  -- recollection, and a report that mixed them without saying so would be the
  -- less useful for it.
  source       text        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'api')),

  note         text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- An operator correcting September's Vercel figure must UPDATE it, not add a
  -- second row that silently doubles the month.
  CONSTRAINT infra_costs_one_per_provider_month_kind UNIQUE (provider, month, kind)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.infra_costs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.infra_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS infra_costs_month_idx ON public.infra_costs (month DESC);

CREATE TABLE IF NOT EXISTS public.infra_budgets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One ceiling per month, so a budget can change without rewriting history.
  month        date        NOT NULL UNIQUE CHECK (date_trunc('month', month) = month),

  amount_micro bigint      NOT NULL CHECK (amount_micro >= 0),
  currency     text        NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.infra_budgets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.infra_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.infra_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infra_budgets ENABLE ROW LEVEL SECURITY;

-- THIS IS COMMERCIALLY SENSITIVE AND IS ADMIN-ONLY IN BOTH DIRECTIONS.
-- What the platform pays for infrastructure is the cost side of every margin
-- the shop makes; a supplier or a customer reading it learns what the operator
-- can afford. There is no self-read here to write, because these rows belong to
-- nobody.
--
-- The revoke is not decoration: a policy filters an existing GRANT and does not
-- create or remove one. Without it, the moment somebody adds a permissive read
-- policy, `authenticated` also gains INSERT, UPDATE and DELETE on the ledger
-- that the budget alert is computed from.
REVOKE ALL ON public.infra_costs FROM anon;
REVOKE ALL ON public.infra_costs FROM authenticated;
REVOKE ALL ON public.infra_budgets FROM anon;
REVOKE ALL ON public.infra_budgets FROM authenticated;
GRANT SELECT ON public.infra_costs TO authenticated;
GRANT SELECT ON public.infra_budgets TO authenticated;

DROP POLICY IF EXISTS "infra_costs_select_admin" ON public.infra_costs;
CREATE POLICY "infra_costs_select_admin" ON public.infra_costs
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "infra_budgets_select_admin" ON public.infra_budgets;
CREATE POLICY "infra_budgets_select_admin" ON public.infra_budgets
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- WRITES ARE SERVICE ROLE ONLY, BY OMISSION. The admin console writes through
-- a server action that has already passed `requireSection`, so an INSERT policy
-- here would be a second, weaker gate on the same act.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'infra_costs'
     AND column_name IN ('provider', 'month', 'kind', 'amount_micro', 'currency', 'source', 'note');
  IF n <> 7 THEN
    RAISE EXCEPTION 'infra_costs has % of the 7 expected columns; it exists under another shape', n;
  END IF;

  -- The integer half of the money rule, checked rather than trusted.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name IN ('infra_costs', 'infra_budgets')
       AND column_name = 'amount_micro' AND data_type NOT IN ('bigint', 'integer')
  ) THEN
    RAISE EXCEPTION 'amount_micro is not an integer type; no float goes near a cost column';
  END IF;

  IF has_table_privilege('anon', 'public.infra_costs', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read what the platform pays';
  END IF;
END $$;

COMMIT;
