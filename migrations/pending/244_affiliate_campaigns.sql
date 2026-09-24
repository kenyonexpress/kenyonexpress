-- 244_affiliate_campaigns.sql
--
-- Q16 (final-queue, 2026-09-25): the affiliate programme's two missing tables.
-- Customers share a deal with their code on the link, the admin sets a
-- commission PER CAMPAIGN, a paid order attributed to that code earns the
-- commission into the affiliate's wallet, and a set of fraud checks decides
-- whether it pays at once, waits for a person, or is refused.
--
-- WHAT ALREADY EXISTS AND IS REUSED, so this file adds only what is missing:
--
--   affiliates (010)              the application row: code, status, payout
--                                 details, running counters. The admin console
--                                 at /admin/affiliates approves, rejects and
--                                 suspends it and has done since 010.
--   profiles.referral_code (098)  the one code a customer holds. The affiliate
--                                 code IS the referral code: one code on one
--                                 link serves both programmes, and the
--                                 database decides which of them pays.
--   orders.affiliate_code (010)   the attribution snapshot. Never written
--                                 before this queue item; checkout writes it
--                                 now from the `ke_ref` cookie the proxy set.
--   referral_signals (098)        device / ip / card fingerprints per user,
--                                 and fn_referral_fraud_signals(a, b) which
--                                 says whether two users look like one person.
--                                 Reused as-is for the affiliate-buyer pair.
--   wallet_accounts + fn_wallet_transfer (026/046)
--                                 the payout. Debit `platform:cashback_reserve`
--                                 (the account fn_pay_referral already debits),
--                                 credit the affiliate's own wallet, reason
--                                 `affiliate_commission`, idempotency
--                                 `affiliate:<conversion id>`.
--
-- TWO NEW TABLES, NOTHING ALTERED. Every statement is idempotent. No function
-- and no trigger beyond set_updated_at, which 010 already defines: the
-- decision logic lives in src/lib/affiliates/commission.ts, where it runs
-- through src/lib/money.ts (integer agorot, basis points, half-up rounding)
-- and is unit-tested, rather than in a second copy in plpgsql.
--
-- MONEY IS INTEGER AGOROT. commission is `commission_bp` (basis points,
-- 0..5000 = 0%..50%), amounts are integer agorot columns with CHECKs. No
-- numeric shekel column is added anywhere.
--
-- WHO CAN READ WHAT
--
--   affiliate_campaigns    admins (is_admin()) through their own session on
--                          the console. Customers see the live campaigns on
--                          /account/affiliate through the SERVICE ROLE, the
--                          same way referral_program_settings is read for
--                          them (server/referrals/program.ts): the terms are
--                          the same for every visitor, so nothing is scoped.
--   affiliate_conversions  the affiliate reads the rows that are theirs
--                          (through affiliates.user_id = auth.uid()); admins
--                          read all. Buyer identity is on the row for the
--                          operator; the affiliate's page never renders it.
--
-- WHO CAN WRITE: nobody but service_role. No INSERT/UPDATE/DELETE grant to any
-- client role, no write policy. Campaigns are written by
-- server/actions/admin/affiliate-campaigns.ts after requireSection
-- ('affiliates','write') + writeAuditLog; conversions by the order finalize
-- path and by the admin decision actions, all on the service key.
--
-- ORDERING: independent of every other pending file. Depends on 010 and 098,
-- both applied.
--
-- THE CODE RUNS WITHOUT THIS FILE. Every reader catches 42P01 (relation does
-- not exist): the account page shows "the programme is not open yet", the
-- share links still carry the code, checkout still snapshots it onto the
-- order, and finalize logs `affiliates.campaigns_table_missing` and pays
-- nothing. Applying it later makes conversions start from the next paid
-- order; orders paid before have their affiliate_code but no conversion row,
-- which is the honest state (no campaign existed to pay them under).
--
-- ROLLBACK
--   DROP TABLE IF EXISTS public.affiliate_conversions;
--   DROP TABLE IF EXISTS public.affiliate_campaigns;
-- Nothing else references either table. Wallet entries already written stay,
-- as ledger entries must.
--
-- Rehearse with BEGIN ... ROLLBACK per docs/RUNBOOK.md.
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. affiliate_campaigns: what the admin sets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliate_campaigns (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text        NOT NULL,
  -- Basis points. 1000 = 10%. Capped at 50%: a campaign paying more than half
  -- the order is a typo, not a decision.
  commission_bp            integer     NOT NULL,
  -- Orders below this (paid on site, in-scope lines) earn nothing.
  min_order_agorot         integer     NOT NULL DEFAULT 0,
  -- Per-conversion ceiling on the commission. NULL = no ceiling.
  max_commission_agorot    integer,
  -- Total the campaign may pay out across all affiliates. NULL = unbounded.
  budget_agorot            integer,
  -- More conversions than this for ONE affiliate in 24h flags the rest for
  -- review (velocity). It does not refuse them: a good day is not fraud.
  max_conversions_per_day  integer     NOT NULL DEFAULT 20,
  -- When true every conversion waits in the queue, even a clean one.
  require_manual_approval  boolean     NOT NULL DEFAULT false,
  starts_at                timestamptz NOT NULL DEFAULT now(),
  ends_at                  timestamptz,
  is_active                boolean     NOT NULL DEFAULT true,
  -- Scope. Both NULL = every product. product_id wins over category_id when
  -- several live campaigns match (commission.ts, selectCampaign).
  category_id              uuid        REFERENCES public.categories(id) ON DELETE SET NULL,
  product_id               uuid        REFERENCES public.products(id)   ON DELETE SET NULL,
  created_by               uuid        REFERENCES auth.users(id)        ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

COMMENT ON TABLE public.affiliate_campaigns IS
  'Admin-set affiliate commission per campaign (basis points, integer agorot caps, scope, window). See 244 and src/lib/affiliates/commission.ts.';

ALTER TABLE public.affiliate_campaigns DROP CONSTRAINT IF EXISTS affiliate_campaigns_name_shape;
ALTER TABLE public.affiliate_campaigns ADD CONSTRAINT affiliate_campaigns_name_shape
  CHECK (length(btrim(name)) BETWEEN 2 AND 80);

ALTER TABLE public.affiliate_campaigns DROP CONSTRAINT IF EXISTS affiliate_campaigns_commission_range;
ALTER TABLE public.affiliate_campaigns ADD CONSTRAINT affiliate_campaigns_commission_range
  CHECK (commission_bp BETWEEN 0 AND 5000);

ALTER TABLE public.affiliate_campaigns DROP CONSTRAINT IF EXISTS affiliate_campaigns_amounts;
ALTER TABLE public.affiliate_campaigns ADD CONSTRAINT affiliate_campaigns_amounts
  CHECK (
    min_order_agorot >= 0
    AND (max_commission_agorot IS NULL OR max_commission_agorot > 0)
    AND (budget_agorot IS NULL OR budget_agorot > 0)
    AND max_conversions_per_day BETWEEN 1 AND 1000
  );

ALTER TABLE public.affiliate_campaigns DROP CONSTRAINT IF EXISTS affiliate_campaigns_window;
ALTER TABLE public.affiliate_campaigns ADD CONSTRAINT affiliate_campaigns_window
  CHECK (ends_at IS NULL OR ends_at > starts_at);

CREATE INDEX IF NOT EXISTS idx_affiliate_campaigns_live
  ON public.affiliate_campaigns (starts_at, ends_at)
  WHERE is_active AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.affiliate_campaigns;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.affiliate_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_campaigns_admin_read ON public.affiliate_campaigns;
CREATE POLICY affiliate_campaigns_admin_read
  ON public.affiliate_campaigns FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.affiliate_campaigns FROM PUBLIC, anon;
GRANT SELECT ON public.affiliate_campaigns TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. affiliate_conversions: one row per attributed paid order
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        uuid        NOT NULL REFERENCES public.affiliates(id)          ON DELETE RESTRICT,
  campaign_id         uuid        NOT NULL REFERENCES public.affiliate_campaigns(id) ON DELETE RESTRICT,
  -- UNIQUE: one conversion per order, ever. A replayed finalize gets 23505 and
  -- reads it as "already recorded".
  order_id            uuid        NOT NULL UNIQUE REFERENCES public.orders(id)     ON DELETE RESTRICT,
  buyer_user_id       uuid        NOT NULL REFERENCES auth.users(id)               ON DELETE RESTRICT,
  -- The in-scope amount the buyer paid on site, integer agorot: the base.
  order_agorot        integer     NOT NULL,
  -- What the campaign pays on that base after the ceiling, integer agorot.
  commission_agorot   integer     NOT NULL,
  status              text        NOT NULL DEFAULT 'pending',
  -- Why it waits (same_device, same_ip, same_card, velocity, manual_approval)
  -- or why it was refused (self_purchase, referral_bonus_paid).
  flagged_reasons     text[],
  rejection_reason    text,
  reviewed_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.affiliate_conversions IS
  'A paid order attributed to an affiliate code under one campaign, with the commission it earned and where it stands. See 244 and src/server/affiliates/convert.ts.';

ALTER TABLE public.affiliate_conversions DROP CONSTRAINT IF EXISTS affiliate_conversions_status_known;
ALTER TABLE public.affiliate_conversions ADD CONSTRAINT affiliate_conversions_status_known
  CHECK (status IN ('pending', 'flagged', 'paid', 'rejected'));

ALTER TABLE public.affiliate_conversions DROP CONSTRAINT IF EXISTS affiliate_conversions_amounts;
ALTER TABLE public.affiliate_conversions ADD CONSTRAINT affiliate_conversions_amounts
  CHECK (order_agorot >= 0 AND commission_agorot >= 0);

ALTER TABLE public.affiliate_conversions DROP CONSTRAINT IF EXISTS affiliate_conversions_paid_complete;
ALTER TABLE public.affiliate_conversions ADD CONSTRAINT affiliate_conversions_paid_complete
  CHECK ((status = 'paid') = (paid_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_affiliate_created
  ON public.affiliate_conversions (affiliate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_campaign_status
  ON public.affiliate_conversions (campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_flagged
  ON public.affiliate_conversions (created_at DESC)
  WHERE status = 'flagged';

DROP TRIGGER IF EXISTS set_updated_at ON public.affiliate_conversions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.affiliate_conversions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS affiliate_conversions_own_read ON public.affiliate_conversions;
CREATE POLICY affiliate_conversions_own_read
  ON public.affiliate_conversions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
       WHERE a.id = affiliate_conversions.affiliate_id
         AND a.user_id = auth.uid()
         AND a.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS affiliate_conversions_admin_read ON public.affiliate_conversions;
CREATE POLICY affiliate_conversions_admin_read
  ON public.affiliate_conversions FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.affiliate_conversions FROM PUBLIC, anon;
GRANT SELECT ON public.affiliate_conversions TO authenticated;

COMMIT;

-- What to check after applying:
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename IN ('affiliate_campaigns', 'affiliate_conversions');
--   -- expect exactly three SELECT policies and no other cmd
--   SELECT table_name, grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_name IN ('affiliate_campaigns', 'affiliate_conversions')
--      AND grantee IN ('anon', 'authenticated');
--   -- expect only (authenticated, SELECT) rows, nothing for anon
