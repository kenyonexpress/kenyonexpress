-- ============================================================================
-- Phase 2 product fields: VAT, tags, variant image, dimensions in millimetres
-- ============================================================================
--
-- APPLIED to production 2026-08-10 through MCP apply_migration, on Ofir's
-- standing approval for the launch sequence.
--
-- VERIFIED AFTER APPLYING: 80 rows, 0 vat_exempt, 0 tagged, 0 NULL tags,
-- 0 carrying millimetres, and products_dimensions_mm_positive fires with 23514
-- inside a rolled-back DO block.
--
-- Every change here is ADDITIVE. Nothing is dropped, renamed or backfilled, and
-- the numbers that make that safe were measured against production on
-- 2026-08-10 rather than assumed:
--
--   products                      80 rows
--   products with any dimension    0 rows   <- why millimetres cost nothing
--   products with a weight        15 rows
--   product_variants               0 rows   <- why a variant column costs nothing
--
-- ============================================================================
-- 1. VAT
-- ============================================================================
--
-- Admin-only, and false by default. An Israeli sale carries VAT unless
-- something specific exempts it (Eilat, certain tourist services), so the
-- exemption is the claim that needs stating and the default is the ordinary
-- case. NOT NULL because a three-state boolean where NULL means "nobody
-- decided" is just false with extra branching in every reader.
--
-- Deliberately NOT a rate. There is no vat_percent column here: the rate is a
-- national figure that changes by law on a date, and freezing a copy of it per
-- product is how a catalogue ends up with two rates after the next change.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vat_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.vat_exempt IS
  'This product is exempt from Israeli VAT (Eilat, certain tourist services). Default false: VAT applies unless something specific exempts it. Admin-only and meaningless on a coupon, whose money model is the prepayment split. No rate is stored: the VAT rate is national and changes by law.';

-- ============================================================================
-- 2. Tags
-- ============================================================================
--
-- A real text[] rather than a comma-joined text column, so a tag containing a
-- comma is a tag and not two, and so the GIN index below can answer
-- "which products carry this tag" without a LIKE scan.
--
-- DEFAULT '{}' and NOT NULL: an empty array and a NULL array mean the same
-- thing to every reader, and allowing both means every reader must handle both.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.products.tags IS
  'Free-form Hebrew tags for merchandising and related-product matching. Empty array, never NULL. Not a taxonomy: categories are the taxonomy and carry the hierarchy (categories.parent_id).';

-- GIN is the index for array containment (`tags @> ARRAY['...']`). The goal
-- named "GIN/GIST"; for text[] the answer is GIN, and GiST on an array would
-- be both larger and slower here.
CREATE INDEX IF NOT EXISTS products_tags_gin
  ON public.products USING gin (tags)
  WHERE cardinality(tags) > 0;

-- ============================================================================
-- 3. Variant image
-- ============================================================================
--
-- One URL, not a gallery. A variant is "the red one"; it needs the picture that
-- distinguishes it from "the blue one", and the product's own `images` jsonb
-- remains the gallery. NULL means "show the product image", which is what all
-- zero existing variants do today.

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS image_url text;

COMMENT ON COLUMN public.product_variants.image_url IS
  'Optional image for this specific variant. NULL falls back to the product gallery. Single URL by design: the variant distinguishes itself with one picture, the product keeps the gallery. Must satisfy the same host allowlist as products.images (src/lib/images/remote-hosts.ts).';

-- ============================================================================
-- 4. Dimensions in millimetres
-- ============================================================================
--
-- WHY NEW COLUMNS AND NOT A CONVERSION OF THE OLD ONES.
--
-- `length_cm`, `width_cm` and `height_cm` are numeric centimetres and are read
-- today by the admin form and by ShippingInfo. Converting them in place would
-- be the same class of change as 142 -- a unit change
-- under live readers -- and that file is unapplied precisely because that is
-- not safe without a paired code branch.
--
-- Adding millimetres alongside is safe because ZERO of the 80 products carry a
-- dimension, so there is nothing to migrate and no reader can observe a
-- disagreement between the two sets.
--
-- Integers, because a millimetre is already finer than any parcel needs and
-- numeric here only invited the float arithmetic the project bans on money and
-- has no more use for on a box.
--
-- The cm columns are NOT dropped: dropping a column is a destructive change and
-- Ofir's call. They are marked superseded so the next reader knows which set is
-- authoritative. Once the admin writes only millimetres, they can go.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS length_mm integer,
  ADD COLUMN IF NOT EXISTS width_mm  integer,
  ADD COLUMN IF NOT EXISTS height_mm integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_dimensions_mm_positive') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_dimensions_mm_positive
      CHECK (
        (length_mm IS NULL OR length_mm > 0) AND
        (width_mm  IS NULL OR width_mm  > 0) AND
        (height_mm IS NULL OR height_mm > 0)
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.products.length_mm IS
  'Parcel length in whole millimetres. Supersedes length_cm, which is numeric centimetres and kept only until the admin stops writing it. Zero rows carried a dimension when this was added, so the two sets have never disagreed.';
COMMENT ON COLUMN public.products.width_mm IS 'Parcel width, whole millimetres. Supersedes width_cm.';
COMMENT ON COLUMN public.products.height_mm IS 'Parcel height, whole millimetres. Supersedes height_cm.';

COMMENT ON COLUMN public.products.length_cm IS 'SUPERSEDED by length_mm. Numeric centimetres. Do not write; drop once no reader remains.';
COMMENT ON COLUMN public.products.width_cm  IS 'SUPERSEDED by width_mm. Numeric centimetres. Do not write; drop once no reader remains.';
COMMENT ON COLUMN public.products.height_cm IS 'SUPERSEDED by height_mm. Numeric centimetres. Do not write; drop once no reader remains.';

-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. Every existing row got the safe default (expect exempt 0, tagged 0,
--    total 80):
--      SELECT count(*) FILTER (WHERE vat_exempt) AS exempt,
--             count(*) FILTER (WHERE cardinality(tags) > 0) AS tagged,
--             count(*) AS total FROM public.products;
--
-- 2. The tag index answers containment:
--      EXPLAIN SELECT id FROM public.products WHERE tags @> ARRAY['מבצע'];
--
-- 3. The dimension CHECK bites (expect ERROR 23514):
--      DO $$ BEGIN
--        UPDATE public.products SET width_mm = 0
--         WHERE id = (SELECT id FROM public.products LIMIT 1);
--        RAISE EXCEPTION 'rollback: the check did not fire';
--      END $$;
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.products_tags_gin;
--   ALTER TABLE public.product_variants DROP COLUMN IF EXISTS image_url;
--   ALTER TABLE public.products
--     DROP CONSTRAINT IF EXISTS products_dimensions_mm_positive,
--     DROP COLUMN IF EXISTS length_mm, DROP COLUMN IF EXISTS width_mm,
--     DROP COLUMN IF EXISTS height_mm,
--     DROP COLUMN IF EXISTS tags, DROP COLUMN IF EXISTS vat_exempt;
-- ============================================================================
