-- PENDING 128: publish the 19 imported WordPress drafts, and retire the demo catalogue
-- ============================================================================
--
-- ⛔ NOT APPLIED. Nothing in `migrations/pending/` has been run against any
-- database. The route to production is `apply_migration` through MCP, after a
-- human approves this file. `db push` is forbidden by project rule.
--
-- Idempotent by `slug` throughout: every statement is an UPDATE with a WHERE
-- that stops matching once it has run, so a second application changes nothing.
-- No INSERT of a product and no DELETE of anything.
--
--
-- WHAT THIS FILE IS FOR
--
-- Measured against `ixvwfbuvfxxsjiywhbbb` on 2026-08-31:
--
--   19  products  status='draft'   type='physical'   supplier_id NULL   (the WP import)
--   34  products  status='active'  attributes->>'demo' = 'true'         (seed data)
--   27  products  status='active'  real
--
-- The shop is currently serving 34 invented demo products and hiding all 19
-- real ones. This file swaps that around.
--
--
-- THE MEASUREMENT THAT SAYS THIS IS SAFE FOR THE HOME PAGE
--
-- `src/lib/ke-live-deals-data.ts` is a static mirror of the live site's deal
-- grid: 32 cards with local AVIF images, so the GRID cannot break. What can
-- break is where a card LINKS, because `/product/[slug]` reads the database.
-- All 32 slugs were resolved against production:
--
--   24  active, NOT demo   -> untouched by this file, keep working
--    6  draft              -> published by this file, 404 becomes 200
--    2  no row at all      -> stay 404 (`reverse-withdrawal-payment`, the Dokan
--                            admin product deliberately excluded from the
--                            import, and `קופון-טסט`)
--
-- So the deal grid goes from 24/32 reachable to 30/32, and NOT ONE of the 34
-- demo products backs a deal card. Verified before the demo retirement below
-- was written, not after.
--
--
-- ⚠️ WHAT THIS FILE DELIBERATELY DOES NOT DO, AND WHY
--
-- 1. IT ASSIGNS NO `supplier_id`. THE DATA DOES NOT EXIST IN EITHER SOURCE.
--
--    The instruction was to take the vendor from the Dokan vendors in the WXR
--    and to fill the gaps from the live shop pages. Both were checked:
--
--      - All 48 products in `kenyonexpress-wxr-2026-07-29.xml` carry
--        `dc:creator = galofir10@gmail.com`, which is author id 1, the site
--        admin. Not one product is authored by a vendor.
--      - `_dokan_vendor_id` appears in the export 19 times and every one of
--        them is on a `shop_order`, never on a `product`. The two values are
--        `1` (the admin) and `33` (an account that is not in the export's
--        author list at all).
--      - The WXR has exactly two authors. The second is
--        `kenyonexpress@gmail.com`, display name "Vendor First Name Vendor
--        Last Name", which is the Dokan placeholder.
--      - `https://kenyonexpress.co.il/store-listing/` lists exactly ONE store,
--        `test-store`, whose page reads "Test Store" with phone 972524635550.
--
--    `platform_percent` decides who is paid what, and `supplier_id` decides
--    who is paid at all. Inventing either from a product title would be
--    inventing a commercial relationship. The 19 products publish with
--    `supplier_id` NULL, which is what they already have, and assigning them
--    is an owner task listed in `docs/FINAL-REPORT.md`.
--
-- 2. IT SETS NO `coupon_price_ils` AND CHANGES NO `type`.
--
--    There are no coupon rows among the 19: all 19 are `type='physical'`
--    today. Neither source classifies them. The WXR marks all 48 products
--    `product_type = simple`, WooCommerce's only kind here, and the live
--    product pages render a plain WooCommerce price with no coupon concept
--    anywhere on them. The coupon/physical split is an invention of the new
--    schema and exists in neither export.
--
--    That matters more than a missing field, because `type` decides the money
--    route: a `coupon` issues a QR voucher and pays the supplier on redemption,
--    a `physical` ships and splits immediately. Seventeen of these nineteen are
--    services that cannot ship (a haircut in Petah Tikva, a hotel night in
--    Tiberias, a spa treatment). Publishing them as `physical` is very probably
--    wrong, and guessing is not better than saying so: SECTION 5 below writes
--    the reclassification out in full, per slug, COMMENTED OUT, for the owner
--    to uncomment once decided.
--
-- 3. IT TOUCHES NO SUPPLIER ROW.
--
--    All 11 existing suppliers have no address and no logo. They are seed data
--    themselves ("מסעדת השף הגדול" at 03-1234567, "ספא רוגע" at 04-7654321),
--    and none of their names appears on the live site, whose only store is
--    "Test Store". There is nothing to copy from.
--
--
-- ⚠️ THE IMAGES ARE HOSTED BY THE SITE THIS PROJECT REPLACES
--
-- All 32 image URLs on the 19 drafts were fetched on 2026-08-31 and all 32
-- returned 200. Every one of them is
-- `https://kenyonexpress.co.il/wp-content/uploads/...`, served by the old
-- WordPress install. `kenyonexpress.co.il` is allowed in
-- `src/lib/images/remote-hosts.ts`, so they render today.
--
-- ON THE DAY THE DOMAIN IS POINTED AT VERCEL, ALL 32 BECOME 404. The images
-- must be pulled into R2 (`scripts/` already has the pipeline, see [56] in
-- STATE) BEFORE the DNS cutover, or these nineteen products publish with no
-- picture at the exact moment the shop goes live.
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. The approver
-- ---------------------------------------------------------------------------
--
-- `enforce_product_approval()` returns NEW unchanged when `auth.uid()` is NULL,
-- which is exactly what a migration applied on the service role is. So the
-- trigger will NOT stamp these fields and this file has to. Read the function
-- before assuming otherwise: the admin branch that fills `approved_by` is
-- behind `IF auth.uid() IS NULL THEN RETURN NEW`.
--
-- Resolved by email rather than pasted as a uuid, so this file is readable and
-- so it fails loudly against a database where that account does not exist.

CREATE TEMP TABLE _approver ON COMMIT DROP AS
SELECT id FROM public.profiles WHERE email = 'kenyonexpress@gmail.com' AND role = 'super_admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _approver) THEN
    RAISE EXCEPTION 'no super_admin profile for kenyonexpress@gmail.com; refusing to publish products with a NULL approver';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Category, one line per product, mapped and reviewable
-- ---------------------------------------------------------------------------
--
-- Source of the mapping, in order of authority:
--   (a) the `product_cat` term on the item in the WXR, where it is a real
--       category. Six of the nineteen have one.
--   (b) the product's own NAME, where the WXR term is `כללי` (uncategorized),
--       which is thirteen of them.
--
-- Where (b) is used the name is quoted on the line, because that is an
-- editorial call and the reviewer should be able to check it in one pass. It
-- is also the cheapest call in this file to get wrong: a category decides
-- navigation, not money.
--
-- NOTE the three rows whose slug and name disagree. They carry
-- `attributes->>'slug_title_mismatch' = true` from the import and the live site
-- has the same mismatch, so the SLUG must not be touched (the deal grid links
-- to it verbatim). The NAME is what the category follows.
--
-- COALESCE, not assignment: a category already chosen by a human is never
-- overwritten. Only the thirteen NULLs are filled.

UPDATE public.products p SET category_id = COALESCE(p.category_id, c.id), updated_at = now()
FROM public.categories c, (VALUES
  -- slug                                        category slug        basis
  ('6253',                                        'vacation'),        -- name: "חבילת חופשה למאלדיבים - 2 טיסות"
  ('ארוחה-זוגית-עם-פלטת-קילו-בשרי-פרימיום-ו',      'restaurants-cafes'), -- name: meal for two
  ('ארוחת-בוקר-זוגית-בקפה-קפה',                    'restaurants-cafes'), -- name: breakfast for two
  ('ארוחת-שף-במסעדת-אולטרה',                       'beauty-health'),   -- slug/name mismatch; name is "טיפול פנים"
  ('חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק',        'beauty-health'),   -- name: couples massage, spa
  ('חבילת-גלידה',                                  'restaurants-cafes'), -- name: ice cream package
  ('חבילת-קוקטיילים',                              'restaurants-cafes'), -- name: cocktails for two
  ('חיתולי-פמפרס',                                 'baby-kids'),       -- name: Pampers nappies
  ('חיתולי-פמפרס-העתק',                            'baby-kids'),       -- WXR product_cat: תינוקות וילדים
  ('טיפול-פנים-עמוק',                              'beauty-health'),   -- name: deep facial
  ('מזקקת-ויסקי',                                  'restaurants-cafes'), -- name: whisky distillery tour
  ('מלון-4-כוכבים-פלוס-ארוחת-בוקר',                'vacation'),        -- name: 4 star hotel
  ('מלון-5-כוכבים-בטבריה',                         'vacation'),        -- name: 5 star hotel, Tiberias
  ('עוזרת-אישית-שירותי-משרד',                      'professionals'),   -- WXR product_cat: בעלי מקצוע
  ('עיסוי-מפנק-לגבר-45-דקות-רק-ב108',              'beauty-health'),   -- WXR product_cat: יופי בריאות וטיפוח
  ('עיסוי-משולב-מפנק-לגבר-רק-108',                 'beauty-health'),   -- WXR product_cat: יופי בריאות וטיפוח
  ('צימר-מאסטר-copy-copy',                         'restaurants-cafes'), -- WXR: מסעדות ובתי קפה; name is "פינוק גלידה"
  ('שעון-אפל-חכם-apple-watch-series-7',            'restaurants-cafes'), -- slug/name mismatch; name is a cafe breakfast
  ('תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',      'beauty-health')    -- WXR product_cat: יופי בריאות וטיפוח
) AS m(product_slug, category_slug)
WHERE p.slug = m.product_slug
  AND c.slug = m.category_slug
  AND p.deleted_at IS NULL
  AND p.status = 'draft';

-- ---------------------------------------------------------------------------
-- 2. The commercial terms, from the pattern already in the table
-- ---------------------------------------------------------------------------
--
-- Not invented. Measured on the 61 active products:
--
--   type      platform_percent  commission_percent  commission_type
--   physical  30.00             5.00                physical_percent   26 rows
--   physical  15.00             10.00               physical_percent   15 rows  (demo)
--   coupon    25.00             5.00                coupon_absolute    15 rows  (demo)
--
-- 30/5 is the real physical pattern; the 15/10 group is entirely demo data and
-- is retired in section 4. All 19 of these are `type='physical'` today, so 30
-- is the rate that applies. See the warning at the head of this file about
-- whether `type` is right at all.
--
-- `platform_percent` is NULL on all nineteen right now, and NULL is not a
-- default that resolves to something safe downstream: it is snapshotted onto
-- `order_items` at purchase, so a sale of one of these would record a split
-- with no platform share.

UPDATE public.products SET
  platform_percent  = 30.00,
  commission_percent = 5.00,
  commission_type   = 'physical_percent',
  updated_at        = now()
WHERE deleted_at IS NULL
  AND status = 'draft'
  AND attributes->>'imported_from' = 'kenyonexpress-wxr-2026-07-29'
  AND platform_percent IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Publish
-- ---------------------------------------------------------------------------
--
-- `published_at` is set only where it is NULL, so re-running does not restamp
-- a product's publication date and move it in any "newest first" ordering.

UPDATE public.products SET
  status          = 'active',
  approval_status = 'approved',
  approved_by     = (SELECT id FROM _approver),
  approved_at     = COALESCE(approved_at, now()),
  published_at    = COALESCE(published_at, now()),
  updated_at      = now()
WHERE deleted_at IS NULL
  AND status = 'draft'
  AND attributes->>'imported_from' = 'kenyonexpress-wxr-2026-07-29';

-- ---------------------------------------------------------------------------
-- 4. Retire the demo catalogue
-- ---------------------------------------------------------------------------
--
-- `draft`, never deleted. Four orders exist in this database and demo products
-- are reachable from `order_items`; a delete would either cascade into an order
-- history or fail on a foreign key, and neither is what "hide the demo data"
-- means.
--
-- ⚠️ READ THIS BEFORE APPLYING. All 15 active COUPON products are demo, so
-- after this statement the catalogue contains ZERO products of `type='coupon'`.
-- The coupon purchase flow, `/coupon/[id]`, `/scan` and the voucher issuer stay
-- fully built and fully tested, and they will have nothing to sell until either
-- section 5 is uncommented or a real coupon product is created in the admin.
-- That is a deliberate consequence of retiring invented data, not an oversight.

UPDATE public.products SET status = 'draft', updated_at = now()
WHERE deleted_at IS NULL
  AND status = 'active'
  AND attributes->>'demo' = 'true';

-- ---------------------------------------------------------------------------
-- 5. ⛔ COMMENTED OUT: reclassify the services as coupons
-- ---------------------------------------------------------------------------
--
-- Seventeen of the nineteen cannot be shipped. If they are meant to be sold as
-- vouchers redeemed at the supplier, this is the statement, and it needs the
-- owner to say so first, because it changes who is paid and when.
--
-- `coupon_expiry_days` has no source either and must be a decision, not a
-- guess; 180 below is a placeholder and is why this stays commented.
-- `coupon_price_ils` is what the customer pays on the site and equals
-- `price_ils` for every one of these, since neither export carries a second
-- price.
--
-- UPDATE public.products SET
--   type               = 'coupon',
--   is_coupon_enabled  = true,
--   requires_shipping  = false,
--   platform_percent   = 25.00,
--   commission_percent = 5.00,
--   commission_type    = 'coupon_absolute',
--   coupon_price_ils   = price_ils,
--   coupon_expiry_days = 180,          -- DECIDE THIS. 180 is a placeholder.
--   updated_at         = now()
-- WHERE deleted_at IS NULL
--   AND slug IN (
--     '6253',                                   -- Maldives package
--     'ארוחה-זוגית-עם-פלטת-קילו-בשרי-פרימיום-ו',
--     'ארוחת-בוקר-זוגית-בקפה-קפה',
--     'ארוחת-שף-במסעדת-אולטרה',
--     'חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק',
--     'חבילת-גלידה',
--     'חבילת-קוקטיילים',
--     'טיפול-פנים-עמוק',
--     'מזקקת-ויסקי',
--     'מלון-4-כוכבים-פלוס-ארוחת-בוקר',
--     'מלון-5-כוכבים-בטבריה',
--     'עוזרת-אישית-שירותי-משרד',
--     'עיסוי-מפנק-לגבר-45-דקות-רק-ב108',
--     'עיסוי-משולב-מפנק-לגבר-רק-108',
--     'צימר-מאסטר-copy-copy',
--     'שעון-אפל-חכם-apple-watch-series-7',
--     'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה'
--   );
--
-- The two that are NOT in that list are the two that genuinely ship:
-- `חיתולי-פמפרס` and `חיתולי-פמפרס-העתק`.

COMMIT;

-- ============================================================================
-- VERIFICATION, to run after applying
-- ============================================================================
--
-- Expected: 19 active imported, 0 of them with platform_percent NULL,
-- 0 active demo, 46 active in total.
--
--   SELECT
--     count(*) FILTER (WHERE status='active' AND attributes->>'imported_from' IS NOT NULL) AS imported_active,
--     count(*) FILTER (WHERE status='active' AND attributes->>'imported_from' IS NOT NULL
--                        AND platform_percent IS NULL)                                     AS imported_no_rate,
--     count(*) FILTER (WHERE status='active' AND attributes->>'demo'='true')                AS demo_active,
--     count(*) FILTER (WHERE status='active')                                               AS active_total
--   FROM public.products WHERE deleted_at IS NULL;
--
-- And the home page's deal links, expected 30 of 32 resolving:
--
--   SELECT count(*) FROM public.products
--    WHERE deleted_at IS NULL AND status='active'
--      AND slug IN ( ...the 32 slugs in src/lib/ke-live-deals-data.ts... );
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
--   BEGIN;
--   UPDATE public.products SET status='draft', approved_at=NULL, approved_by=NULL,
--          published_at=NULL, platform_percent=NULL, commission_percent=0.00
--    WHERE deleted_at IS NULL AND attributes->>'imported_from' = 'kenyonexpress-wxr-2026-07-29';
--   UPDATE public.products SET status='active'
--    WHERE deleted_at IS NULL AND attributes->>'demo' = 'true';
--   COMMIT;
--
-- `category_id` is deliberately NOT rolled back: it was filled with COALESCE
-- and undoing it would also clear the seven categories a human had already set.
