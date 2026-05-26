-- Migration 010: Referrals & Affiliates schema
-- Implements §19.1 (referral program) and §19.2 (affiliate infrastructure).

-- Defensive: 001 may have stopped early on a live DB before defining this function.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. ENUMs
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.referral_status AS ENUM ('pending', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.affiliate_status AS ENUM (
    'pending_review', 'approved', 'rejected', 'suspended'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. referrals
--
-- One row per referrer→referred pair (unique constraint enforces no duplicates).
-- bonus_paid_amount_ils records what was actually credited to the referrer's
-- wallet after the referred user completes their first order.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referrals (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  referred_user_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  referral_code         text          NOT NULL,
  status                public.referral_status NOT NULL DEFAULT 'pending',
  completed_at          timestamptz,
  bonus_paid_amount_ils numeric(10,2) NOT NULL DEFAULT 0 CHECK (bonus_paid_amount_ils >= 0),
  referred_first_order_id uuid        REFERENCES public.orders(id) ON DELETE SET NULL,
  rejection_reason      text,
  deleted_at            timestamptz,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT referrals_unique_pair UNIQUE (referrer_user_id, referred_user_id)
);

-- ---------------------------------------------------------------------------
-- 3. affiliates
--
-- Infrastructure-only for now (§19.2): stores the code and payout details.
-- Full dashboard + click/conversion tracking added after 50 customers.
-- payout_method is constrained to the three supported channels.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliates (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  affiliate_code      text          NOT NULL UNIQUE,
  status              public.affiliate_status NOT NULL DEFAULT 'pending_review',
  payout_method       text          CHECK (payout_method IN ('bit', 'bank_transfer', 'paypal')),
  payout_details      jsonb         NOT NULL DEFAULT '{}'::jsonb,
  channel_description text,
  channel_urls        jsonb         NOT NULL DEFAULT '[]'::jsonb,
  approved_at         timestamptz,
  approved_by         uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  total_clicks        int           NOT NULL DEFAULT 0 CHECK (total_clicks >= 0),
  total_conversions   int           NOT NULL DEFAULT 0 CHECK (total_conversions >= 0),
  total_earnings_ils  numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_earnings_ils >= 0),
  deleted_at          timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Add affiliate_code to profiles for 30-day cookie attribution (§19.2)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS affiliate_code text;

CREATE INDEX IF NOT EXISTS idx_profiles_affiliate_code
  ON public.profiles (affiliate_code)
  WHERE affiliate_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status
  ON public.referrals (referrer_user_id, status);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_user
  ON public.referrals (referred_user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON public.referrals (referral_code);

CREATE INDEX IF NOT EXISTS idx_affiliates_code
  ON public.affiliates (affiliate_code);

CREATE INDEX IF NOT EXISTS idx_affiliates_status
  ON public.affiliates (status);

CREATE INDEX IF NOT EXISTS idx_affiliates_user_id
  ON public.affiliates (user_id);

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_updated_at ON public.referrals;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.affiliates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.affiliates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.referrals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

-- referrals: users see rows where they are the referrer or the referred party
DROP POLICY IF EXISTS referrals_user_read ON public.referrals;
CREATE POLICY referrals_user_read
  ON public.referrals FOR SELECT TO authenticated
  USING (
    (referrer_user_id = auth.uid() OR referred_user_id = auth.uid())
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS referrals_admin_all ON public.referrals;
CREATE POLICY referrals_admin_all
  ON public.referrals FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- affiliates: users SELECT and UPDATE their own row; admins do everything
DROP POLICY IF EXISTS affiliates_user_select ON public.affiliates;
CREATE POLICY affiliates_user_select
  ON public.affiliates FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS affiliates_user_update ON public.affiliates;
CREATE POLICY affiliates_user_update
  ON public.affiliates FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS affiliates_admin_all ON public.affiliates;
CREATE POLICY affiliates_admin_all
  ON public.affiliates FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
