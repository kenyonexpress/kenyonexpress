-- 070_product_dynamic_split.sql
--
-- Business decision 2026-07-27 (docs/ADMIN-ARCHITECTURE.md section 0):
-- there is no fixed commission. Four values are set per product by the admin,
-- none of them with a default anywhere:
--
--   platform_percent        the platform's share of the on-site charge
--   supplier_split_percent  the supplier's share of the same base
--   discount_percent        saving off the sticker price, shown to the customer
--   coupon_price_ils        absolute shekel amount charged on site for a coupon
--
-- WHY THE PAIR IS STORED RATHER THAN DERIVED
--
-- src/components/admin/ProductForm.tsx used to argue the opposite, that keeping
-- a second column pinned at 100 minus the first "invites a row where the two
-- disagree and the money owed has no single answer". That objection is answered
-- here by a CHECK constraint instead of by deletion: the pair cannot disagree
-- because the database will not store a row where it does. What the derived
-- version could not do is survive a snapshot. order_items has to be able to
-- state the supplier's agreed share for a line bought months ago without
-- recomputing it from a percent that has since changed, so both halves are
-- copied onto the order line at purchase. See section 0.4.
--
-- WHAT THIS REVOKES
--
-- 050_platform_percent_required.sql tried to make products.platform_percent
-- NOT NULL. It has never run against the hosted project and cannot: its own
-- guard raises when any live product has a NULL platform_percent, and as
-- measured on 2026-07-27 all 61 do. The live catalog has always carried its
-- split in supplier_split_percent, which 048 rejected as a design and which the
-- data adopted anyway. This migration makes the code agree with the data.
--
-- The backfill below is NOT an invented default and does not violate
-- CONTRADICTIONS C1. It derives platform_percent from supplier_split_percent,
-- a value an admin explicitly chose per product. Rows where neither is set are
-- left NULL and reported, not guessed at.
--
-- Depends on: 005 (products, price_ils, deleted_at), 027 or 047
-- (products.platform_percent, products.supplier_split_percent,
-- order_items.platform_percent), 054 section 2 (products.coupon_price_ils).
-- Idempotent, forward-only.

-- ---------------------------------------------------------------------------
-- 1. Columns on products
-- ---------------------------------------------------------------------------

-- supplier_split_percent already exists on the hosted project (all 61 rows set)
-- but not in every schema variant, so add it defensively before anything reads
-- it. coupon_price_ils and offer_valid_until repeat 054 section 2 guardedly, so
-- whichever file runs second is a no-op.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_percent       numeric(5,2),
  ADD COLUMN IF NOT EXISTS supplier_split_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS discount_percent       numeric(5,2),
  ADD COLUMN IF NOT EXISTS coupon_price_ils       numeric(12,2),
  ADD COLUMN IF NOT EXISTS offer_valid_until      timestamptz;

COMMENT ON COLUMN public.products.platform_percent IS
  'Mandatory per-product platform share of the on-site charge, set by the admin. No default. Applies to coupon and physical alike: on a coupon it splits coupon_price_ils, on a physical it splits the discounted price. Snapshotted into order_items.platform_percent at purchase.';

COMMENT ON COLUMN public.products.supplier_split_percent IS
  'Mandatory per-product supplier share of the same base as platform_percent, set by the admin. No default. Held to platform_percent + supplier_split_percent = 100 by products_split_pair_sums_to_100. Stored rather than derived so order_items can snapshot the agreed share; the money itself is always the residual base - platform_fee, never this percent applied a second time.';

COMMENT ON COLUMN public.products.discount_percent IS
  'Per-product saving off price_ils, set by the admin. No default. On a physical product it reduces the on-site charge to price_ils * (1 - discount_percent/100). On a coupon it is the displayed badge only: the billed number is always the absolute coupon_price_ils, and the form keeps the badge equal to the saving those two prices imply so the page cannot quote a discount checkout will not honour.';

COMMENT ON COLUMN public.products.coupon_price_ils IS
  'Absolute shekel amount the customer pays online for the coupon, set per product by the admin. Not a percent, no default. The balance (price_ils - coupon_price_ils) is collected in cash by the business at redemption and never passes through the platform.';

COMMENT ON COLUMN public.products.offer_valid_until IS
  'Calendar deadline of the offer. Vouchers expire automatically at this instant and the date is displayed to the customer (consumer protection).';

-- ---------------------------------------------------------------------------
-- 2. Backfill platform_percent from the split the admin already chose
-- ---------------------------------------------------------------------------

UPDATE public.products
SET platform_percent = 100 - supplier_split_percent
WHERE platform_percent IS NULL
  AND supplier_split_percent IS NOT NULL
  AND supplier_split_percent BETWEEN 0 AND 100;

-- The mirror case, for schema variants that carry platform_percent but not the
-- split. Same reasoning in the other direction.
UPDATE public.products
SET supplier_split_percent = 100 - platform_percent
WHERE supplier_split_percent IS NULL
  AND platform_percent IS NOT NULL
  AND platform_percent BETWEEN 0 AND 100;

-- Repair any pre-existing row whose pair does not sum to 100. platform_percent
-- is treated as authoritative because it is what the settlement engine bills
-- from; supplier_split_percent is the snapshot of the agreement.
UPDATE public.products
SET supplier_split_percent = 100 - platform_percent
WHERE platform_percent IS NOT NULL
  AND supplier_split_percent IS NOT NULL
  AND platform_percent + supplier_split_percent <> 100;

-- Derive the coupon badge from the two prices that already decide it. This is a
-- restatement of what the product page renders today, not a new number.
UPDATE public.products
SET discount_percent = round((1 - (coupon_price_ils / price_ils)) * 100, 2)
WHERE discount_percent IS NULL
  AND coupon_price_ils IS NOT NULL
  AND price_ils > 0
  AND coupon_price_ils <= price_ils;

-- Report, do not invent. A product with no split at all cannot be priced, and
-- the admin has to choose. Deliberately a NOTICE and not an EXCEPTION: refusing
-- to apply the migration would leave the schema unable to express the model at
-- all, which is worse than a catalog the admin must finish filling in.
DO $$
DECLARE
  no_split integer;
  no_discount integer;
BEGIN
  SELECT count(*) INTO no_split
  FROM public.products
  WHERE deleted_at IS NULL
    AND (platform_percent IS NULL OR supplier_split_percent IS NULL);

  SELECT count(*) INTO no_discount
  FROM public.products
  WHERE deleted_at IS NULL AND discount_percent IS NULL;

  IF no_split > 0 THEN
    RAISE NOTICE
      '070: % live products still have no split pair. Set platform_percent and supplier_split_percent per product in admin; no default will be applied.',
      no_split;
  END IF;

  IF no_discount > 0 THEN
    RAISE NOTICE
      '070: % live products still have no discount_percent. Set it per product in admin.',
      no_discount;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Constraints on products
-- ---------------------------------------------------------------------------

-- Added NOT VALID so applying this to a live table cannot fail on a row that
-- predates it. Step 2 leaves every repairable row compliant, so the VALIDATE
-- below normally succeeds; when it cannot, it says so instead of aborting.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_split_pair_sums_to_100'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_split_pair_sums_to_100
      CHECK (
        platform_percent IS NULL
        OR supplier_split_percent IS NULL
        OR platform_percent + supplier_split_percent = 100
      ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_supplier_split_percent_range'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_supplier_split_percent_range
      CHECK (
        supplier_split_percent IS NULL
        OR (supplier_split_percent >= 0 AND supplier_split_percent <= 100)
      ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_discount_percent_range'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_discount_percent_range
      CHECK (
        discount_percent IS NULL
        OR (discount_percent >= 0 AND discount_percent <= 100)
      ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_coupon_price_within_price'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_coupon_price_within_price
      CHECK (
        coupon_price_ils IS NULL
        OR (coupon_price_ils > 0 AND coupon_price_ils <= price_ils)
      ) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'products_split_pair_sums_to_100',
    'products_supplier_split_percent_range',
    'products_discount_percent_range',
    'products_coupon_price_within_price'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.products VALIDATE CONSTRAINT %I', c);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE
        '070: constraint %  stays NOT VALID, existing rows violate it. New and updated rows are still checked.',
        c;
    END;
  END LOOP;
END $$;

-- 4. Retire commission_percent as a knob. 050 tried this and never ran; the
--    DEFAULT 5 is the last fixed commission left in the schema.
ALTER TABLE public.products ALTER COLUMN commission_percent DROP DEFAULT;

COMMENT ON COLUMN public.products.commission_percent IS
  'DEPRECATED (2026-07-24, restated 2026-07-27). Superseded by the platform_percent / supplier_split_percent pair. Kept read-only so pre-070 order snapshots keep resolving; do not write.';

-- 5. Drop the last invented default in SQL. 027 defined this function as
--    COALESCE(product, supplier, 10), and the literal 10 is exactly the fixed
--    commission the model forbids. No supplier fallback either: the product is
--    the only place a split lives.
CREATE OR REPLACE FUNCTION public.product_platform_percent(p_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT pr.platform_percent FROM public.products pr WHERE pr.id = p_product_id
$$;

COMMENT ON FUNCTION public.product_platform_percent(uuid) IS
  'Mandatory per-product platform percent. No default and no supplier fallback: returns NULL when the product does not exist or the admin has not set the split yet, and callers must refuse the sale rather than substitute a constant.';

-- COMMENT ON has no IF EXISTS, and these two supplier columns exist on the
-- hosted project but not in every schema variant, so guard on the catalog.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers'
      AND column_name = 'commission_percent'
  ) THEN
    COMMENT ON COLUMN public.suppliers.commission_percent IS
      'NOT a default and NOT a fallback. An agreement percent shown as a suggestion while creating a product for this supplier; never read at checkout or settlement.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers'
      AND column_name = 'default_split_percent'
  ) THEN
    COMMENT ON COLUMN public.suppliers.default_split_percent IS
      'NOT a default and NOT a fallback, despite the name. Prefills the product form for a new product under this supplier; the value that bills is always products.supplier_split_percent.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Snapshot columns on order_items
--
-- Every one of these is a VALUE copied at purchase, never a live read back to
-- products or suppliers. Editing a product or a supplier must not move a single
-- past row, which is the whole reason the supplier identity is duplicated here
-- rather than joined.
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS supplier_split_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS discount_percent       numeric(5,2),
  ADD COLUMN IF NOT EXISTS coupon_price_ils       numeric(12,2),
  ADD COLUMN IF NOT EXISTS supplier_name          text,
  ADD COLUMN IF NOT EXISTS supplier_phone         text,
  ADD COLUMN IF NOT EXISTS supplier_address       text,
  ADD COLUMN IF NOT EXISTS supplier_logo_url      text;

COMMENT ON COLUMN public.order_items.platform_percent IS
  'Immutable snapshot of products.platform_percent at purchase. Since 070 it is the product''s own value on coupon lines too; before 070 coupon lines stored a hardcoded 100.';
COMMENT ON COLUMN public.order_items.supplier_split_percent IS
  'Immutable snapshot of products.supplier_split_percent at purchase. Reporting reads this for the supplier''s agreed share; the money paid is supplier_payout_ils, computed as the residual so no agorot is created by rounding.';
COMMENT ON COLUMN public.order_items.discount_percent IS
  'Immutable snapshot of products.discount_percent at purchase.';
COMMENT ON COLUMN public.order_items.coupon_price_ils IS
  'Immutable snapshot of products.coupon_price_ils at purchase, per unit. NULL on physical lines.';
COMMENT ON COLUMN public.order_items.supplier_name IS
  'Supplier identity as it stood at purchase, copied by value. Renaming the supplier later must not rewrite this order.';
COMMENT ON COLUMN public.order_items.supplier_phone IS 'Supplier phone as it stood at purchase, copied by value.';
COMMENT ON COLUMN public.order_items.supplier_address IS 'Supplier address as it stood at purchase, copied by value.';
COMMENT ON COLUMN public.order_items.supplier_logo_url IS 'Supplier logo as it stood at purchase, copied by value.';

-- Backfill the split snapshot for lines that predate the column. platform_percent
-- is what those rows were actually billed at, so its complement is the only
-- honest supplier share to record.
UPDATE public.order_items
SET supplier_split_percent = 100 - platform_percent
WHERE supplier_split_percent IS NULL
  AND platform_percent IS NOT NULL
  AND platform_percent BETWEEN 0 AND 100;

-- Supplier identity on pre-070 lines is genuinely unknown as of purchase time,
-- so it is copied from the supplier's current row and nothing pretends
-- otherwise. Only rows that have no snapshot at all are touched.
UPDATE public.order_items oi
SET supplier_name     = s.name,
    supplier_phone    = s.contact_phone,
    supplier_address  = s.address,
    supplier_logo_url = s.logo_url
FROM public.suppliers s
WHERE s.id = oi.supplier_id
  AND oi.supplier_name IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_items'::regclass
      AND conname = 'order_items_split_pair_sums_to_100'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_split_pair_sums_to_100
      CHECK (
        platform_percent IS NULL
        OR supplier_split_percent IS NULL
        OR platform_percent + supplier_split_percent = 100
      ) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.order_items'::regclass
      AND conname = 'order_items_discount_percent_range'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_discount_percent_range
      CHECK (
        discount_percent IS NULL
        OR (discount_percent >= 0 AND discount_percent <= 100)
      ) NOT VALID;
  END IF;
END $$;

DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'order_items_split_pair_sums_to_100',
    'order_items_discount_percent_range'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.order_items VALIDATE CONSTRAINT %I', c);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE
        '070: constraint %  stays NOT VALID, existing order lines violate it. New lines are still checked.',
        c;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Index supporting the admin product list filter on incomplete pricing,
--    which is how an admin finds the products the publish gate will refuse.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS products_needs_pricing_idx
  ON public.products (updated_at DESC)
  WHERE deleted_at IS NULL
    AND (platform_percent IS NULL
      OR supplier_split_percent IS NULL
      OR discount_percent IS NULL);

CREATE INDEX IF NOT EXISTS products_offer_valid_until_idx
  ON public.products (offer_valid_until)
  WHERE offer_valid_until IS NOT NULL AND deleted_at IS NULL;
