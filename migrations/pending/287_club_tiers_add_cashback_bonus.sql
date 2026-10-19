-- 287: Add cashback_bonus_percent to club_tiers
-- Enables tier-specific cashback bonus percentages for loyalty rewards
-- Rollback: ALTER TABLE public.club_tiers DROP COLUMN IF EXISTS cashback_bonus_percent;

ALTER TABLE public.club_tiers
ADD COLUMN IF NOT EXISTS cashback_bonus_percent numeric(5,2) NOT NULL DEFAULT 0
CHECK (cashback_bonus_percent >= 0 AND cashback_bonus_percent <= 100);

COMMENT ON COLUMN public.club_tiers.cashback_bonus_percent IS
  'Additional cashback percentage for this tier (e.g., 2.50 for 2.5% bonus). Stored as a percentage value, not decimal.';
