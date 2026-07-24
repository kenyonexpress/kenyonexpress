-- ============================================================================
-- 067_coupon_layer_data.sql
--
-- Second half of 066 (see the note there on the enum two-transaction rule):
-- uses the values 066 added, and pins down the binding snapshot semantics.
--
-- Idempotent: conditional UPDATEs and COMMENTs only.
-- ============================================================================

-- 1. Legacy 'service' rows become 'subscription' (schema-only type for now).
-- Fresh databases build the enum without 'service' at all, so even naming the
-- literal must be guarded: pg_enum decides, dynamic SQL keeps the parser out.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'product_type' AND e.enumlabel = 'service'
  ) THEN
    EXECUTE $sql$
      UPDATE public.products
      SET type = 'subscription'::public.product_type
      WHERE type = 'service'::public.product_type
    $sql$;
    EXECUTE $sql$
      UPDATE public.order_items
      SET product_type = 'subscription'::public.product_type
      WHERE product_type = 'service'::public.product_type
    $sql$;
  END IF;
END $$;

-- 2. Binding money semantics, stated where the schema lives. After the agorot
-- family (059) these columns carry converted names, so each comment lands only
-- where its column actually exists.
DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('products', 'platform_percent',
       'Mandatory per-product split percent for PHYSICAL lines, set by the admin on the product page. No default exists anywhere. Snapshotted into order_items at purchase; settlement never re-reads this live value. Coupon pricing never uses it.'),
      ('order_items', 'platform_percent',
       'Immutable purchase-time snapshot of the product split percent (physical lines) or 100 (coupon lines: the whole on-site charge stays with the platform). Frozen once the order is paid.'),
      ('products', 'coupon_price_ils',
       'Absolute shekel amount the customer pays online for a coupon product, set per product by the admin. Not a percent, no default; a coupon product without it cannot be sold. The balance is collected by the business at redemption, and the voucher then expires.'),
      ('products', 'coupon_price_agorot',
       'Agorot twin of coupon_price_ils after the money-unit conversion; same binding semantics: absolute admin-set on-site price for a coupon product.')
    ) AS t(tbl, col, remark)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = pair.tbl AND column_name = pair.col
    ) THEN
      EXECUTE format('COMMENT ON COLUMN public.%I.%I IS %L', pair.tbl, pair.col, pair.remark);
    END IF;
  END LOOP;
END $$;

-- 3. The retired escrow leg: keep history readable.
COMMENT ON TYPE public.settlement_status IS
  'Line settlement lifecycle. Final model: pending -> paid -> platform_settled (coupon) | split_executed (physical) -> refunded. escrow_held / escrow_released exist only on rows written before the 2026-07-24 no-escrow cutover.';
