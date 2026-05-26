-- Migration 006: Wallet & Cashback schema
-- Supersedes the wallets + wallet_transactions tables from 001 with the
-- authoritative design from ARCHITECTURE.md §2.4, §2.5, §3.1.

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
-- 1. Drop 001 wallet tables (clears FK dependency on the old enum)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.wallet_transactions CASCADE;
DROP TABLE IF EXISTS public.wallets CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Replace wallet_tx_type enum with the authoritative value set
-- ---------------------------------------------------------------------------

DROP TYPE IF EXISTS public.wallet_tx_type;

DO $$ BEGIN
  CREATE TYPE public.wallet_tx_type AS ENUM ('earn', 'redeem', 'expire', 'refund');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- source is only meaningful on earn rows (cashback purchase, referral, admin credit)
DO $$ BEGIN
  CREATE TYPE public.wallet_tx_source AS ENUM ('cashback', 'referral', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 3. wallet_balances  (one row per user, soft-deleted per §3.2 financial rule)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallet_balances (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid          NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_ils           numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_ils >= 0),
  lifetime_earned_ils   numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_earned_ils >= 0),
  lifetime_redeemed_ils numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_redeemed_ils >= 0),
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

-- ---------------------------------------------------------------------------
-- 4. wallet_transactions  (append-only ledger, soft-deleted per §3.2)
--
-- amount_ils is always positive; direction is implied by type:
--   earn / refund  → credit  (+)
--   redeem / expire → debit  (-)
--
-- Profit-share cap audit trail (§2.5):
--   gross_amount_ils      — amount before cap: price * cashback_percent
--   profit_share_cap_percent — cap ceiling applied
--   amount_ils            — final credited amount:
--                           min(gross_amount_ils, profit * profit_share_cap_percent)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                       uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id                uuid                    NOT NULL REFERENCES public.wallet_balances(id) ON DELETE CASCADE,
  user_id                  uuid                    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                     public.wallet_tx_type   NOT NULL,
  source                   public.wallet_tx_source,
  amount_ils               numeric(12,2)           NOT NULL CHECK (amount_ils > 0),
  related_order_id         uuid                    REFERENCES public.orders(id) ON DELETE SET NULL,
  cashback_percent         numeric(5,2),
  profit_share_cap_percent numeric(5,2),
  gross_amount_ils         numeric(12,2),
  notes                    text,
  created_at               timestamptz             NOT NULL DEFAULT now(),
  updated_at               timestamptz             NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_wallet_balances_user_id
  ON public.wallet_balances (user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id
  ON public.wallet_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id
  ON public.wallet_transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order_id
  ON public.wallet_transactions (related_order_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at
  ON public.wallet_transactions (created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_updated_at ON public.wallet_balances;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.wallet_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.wallet_transactions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. RLS — users read their own non-deleted rows; only admins write
-- ---------------------------------------------------------------------------

ALTER TABLE public.wallet_balances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_balances_user_read ON public.wallet_balances;
CREATE POLICY wallet_balances_user_read
  ON public.wallet_balances FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS wallet_balances_admin_all ON public.wallet_balances;
CREATE POLICY wallet_balances_admin_all
  ON public.wallet_balances FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS wallet_transactions_user_read ON public.wallet_transactions;
CREATE POLICY wallet_transactions_user_read
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

DROP POLICY IF EXISTS wallet_transactions_admin_all ON public.wallet_transactions;
CREATE POLICY wallet_transactions_admin_all
  ON public.wallet_transactions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
