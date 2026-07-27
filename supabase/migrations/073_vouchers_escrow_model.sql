-- 073_vouchers_escrow_model.sql
-- Applied to the hosted project 2026-07-27 as `054_vouchers_tables_escrow_model`.
--
-- ADAPTED FROM 054, NOT VERBATIM.
--
-- 054_voucher_redemption.sql was written on 2026-07-24 under the rule that a
-- coupon's whole prepayment stays with the platform. Ofir reversed that on
-- 2026-07-27 (CONTRADICTIONS C11, version b): the platform keeps
-- platform_percent of the prepayment and the remainder is held for the supplier
-- until the voucher is redeemed. Two things in the original would have
-- re-imposed the abolished rule:
--
--   1. CONSTRAINT vouchers_platform_percent_full CHECK (platform_percent = 100)
--      would reject every voucher issued under the current model. The 61 live
--      products carry 15, 25 or 30 percent, so issuing would have been
--      impossible for all of them. Replaced with a 0..100 range check.
--
--   2. platform_percent ... DEFAULT 100 is an invented default of exactly the
--      kind C1 forbids. Removed. The value is snapshotted from the product, and
--      a voucher issued without one is a bug worth failing on rather than a
--      silent 100 percent platform take.
--
-- DELIBERATELY NOT INCLUDED: redeem_voucher(), log_voucher_scan(),
-- voucher_success_payload() and the lifecycle sweeps (sections 5-7 of 054).
-- Those are the scan-time path. They are not needed to issue a voucher or close
-- an order, and hand-reproducing ~180 lines of plpgsql is how transcription
-- bugs enter a money path. Redemption stays unavailable until they are applied
-- from the original file, reviewed against this model.
--
-- Idempotent. Depends on: orders, order_items, products, suppliers, auth.users,
-- is_supplier_member (072), is_admin.

DO $$ BEGIN
  CREATE TYPE public.voucher_status AS ENUM ('issued','redeemed','expired','cancelled','refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_scan_outcome AS ENUM (
    'success','already_redeemed','expired','cancelled','refunded','wrong_supplier',
    'not_found','invalid_signature','invalid_request','unauthorized','rate_limited');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.vouchers (
  id                       uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text                  NOT NULL UNIQUE,
  qr_payload               text                  NOT NULL,
  qr_key_id                text                  NOT NULL DEFAULT 'v1',

  order_id                 uuid                  NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id            uuid                  NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_id               uuid                  NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_id              uuid                  NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  user_id                  uuid                  NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  status                   public.voucher_status NOT NULL DEFAULT 'issued'::public.voucher_status,

  face_value_agorot            integer           NOT NULL CHECK (face_value_agorot >= 0),
  coupon_price_agorot          integer           NOT NULL CHECK (coupon_price_agorot >= 0),
  remaining_amount_due_agorot  integer           NOT NULL CHECK (remaining_amount_due_agorot >= 0),
  platform_percent             numeric(5,2)      NOT NULL,

  offer_valid_until        timestamptz           NOT NULL,
  expires_at               timestamptz           NOT NULL,
  issued_at                timestamptz           NOT NULL DEFAULT now(),

  redeemed_at              timestamptz,
  redeemed_by_supplier_id  uuid                  REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  redeemed_by_user_id      uuid                  REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_amount_collected_agorot integer       CHECK (redeemed_amount_collected_agorot IS NULL OR redeemed_amount_collected_agorot >= 0),

  cancelled_at             timestamptz,
  refunded_at              timestamptz,
  status_reason            text,

  created_at               timestamptz           NOT NULL DEFAULT now(),
  updated_at               timestamptz           NOT NULL DEFAULT now(),

  CONSTRAINT vouchers_conservation
    CHECK (face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot),
  CONSTRAINT vouchers_platform_percent_range
    CHECK (platform_percent >= 0 AND platform_percent <= 100),
  CONSTRAINT vouchers_code_format
    CHECK (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  CONSTRAINT vouchers_expires_within_offer
    CHECK (expires_at <= offer_valid_until),
  CONSTRAINT vouchers_redeemed_fields
    CHECK (
      (status = 'redeemed'::public.voucher_status
        AND redeemed_at IS NOT NULL AND redeemed_by_supplier_id IS NOT NULL AND redeemed_by_user_id IS NOT NULL)
      OR
      (status <> 'redeemed'::public.voucher_status
        AND redeemed_at IS NULL AND redeemed_by_supplier_id IS NULL AND redeemed_by_user_id IS NULL)
    )
);

COMMENT ON TABLE public.vouchers IS
  'Absolute-price coupon vouchers. coupon_price_agorot was charged online and splits by platform_percent: the platform keeps its share, the rest is held for the supplier until redemption (C11 version b, 2026-07-27). remaining_amount_due_agorot is collected in cash by the business at scan and never reaches the platform.';
COMMENT ON COLUMN public.vouchers.platform_percent IS
  'Snapshot of products.platform_percent at issue. No default: a voucher whose split was never set is a bug, not a 100 percent platform take.';

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_code_idx ON public.vouchers (code);
CREATE INDEX IF NOT EXISTS vouchers_user_status_idx ON public.vouchers (user_id, status, issued_at DESC);
CREATE INDEX IF NOT EXISTS vouchers_supplier_status_idx ON public.vouchers (supplier_id, status);
CREATE INDEX IF NOT EXISTS vouchers_order_item_idx ON public.vouchers (order_item_id);
CREATE INDEX IF NOT EXISTS vouchers_order_idx ON public.vouchers (order_id);
CREATE INDEX IF NOT EXISTS vouchers_active_expiry_idx ON public.vouchers (expires_at)
  WHERE status = 'issued'::public.voucher_status;
CREATE INDEX IF NOT EXISTS vouchers_redeemed_by_supplier_idx ON public.vouchers (redeemed_by_supplier_id, redeemed_at DESC)
  WHERE status = 'redeemed'::public.voucher_status;

DROP TRIGGER IF EXISTS set_updated_at ON public.vouchers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id                      uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id              uuid                        REFERENCES public.vouchers(id) ON DELETE SET NULL,
  code_entered            text                        NOT NULL,
  supplier_id             uuid                        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  scanned_by              uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  scan_method             text                        CHECK (scan_method IN ('camera','manual')),
  outcome                 public.voucher_scan_outcome NOT NULL,
  idempotency_key         text,
  amount_collected_agorot integer                     CHECK (amount_collected_agorot IS NULL OR amount_collected_agorot >= 0),
  metadata                jsonb                       NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz                 NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voucher_redemptions IS
  'Append-only audit of every voucher scan attempt, successful or not. This is what a dispute is settled with.';

CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_one_success_per_voucher
  ON public.voucher_redemptions (voucher_id)
  WHERE outcome = 'success'::public.voucher_scan_outcome AND voucher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_idempotency_key_idx
  ON public.voucher_redemptions (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS voucher_redemptions_voucher_idx ON public.voucher_redemptions (voucher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voucher_redemptions_supplier_idx ON public.voucher_redemptions (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voucher_redemptions_scanner_idx ON public.voucher_redemptions (scanned_by, created_at DESC);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- Read-only for everybody. Issuing runs in the service role path and redemption
-- will run inside redeem_voucher() (SECURITY DEFINER), so no INSERT, UPDATE or
-- DELETE policy is granted on purpose: a compromised supplier session has no
-- statement that can flip a status.

DROP POLICY IF EXISTS vouchers_owner_read ON public.vouchers;
CREATE POLICY vouchers_owner_read ON public.vouchers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS vouchers_supplier_read_redeemed ON public.vouchers;
CREATE POLICY vouchers_supplier_read_redeemed ON public.vouchers
  FOR SELECT TO authenticated
  USING (redeemed_by_supplier_id IS NOT NULL AND public.is_supplier_member(redeemed_by_supplier_id));

DROP POLICY IF EXISTS vouchers_admin_read ON public.vouchers;
CREATE POLICY vouchers_admin_read ON public.vouchers
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS voucher_redemptions_owner_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_owner_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (voucher_id IN (SELECT id FROM public.vouchers WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS voucher_redemptions_supplier_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_supplier_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS voucher_redemptions_admin_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_admin_read ON public.voucher_redemptions
  FOR SELECT TO authenticated USING (public.is_admin());
