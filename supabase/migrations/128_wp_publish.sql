-- PENDING 128: publish the 19 imported WordPress drafts, retire the demo catalogue
-- ============================================================================
--
-- ✅ APPLIED to ixvwfbuvfxxsjiywhbbb on 2026-08-31 via MCP `apply_migration`,
-- after a BEGIN/ROLLBACK dry run whose counts matched the verification block at
-- the foot of this file exactly. Moved out of `migrations/pending/` for that
-- reason: that directory means "not run anywhere", and leaving an applied file
-- in it is how the inventory stops meaning anything.
--
-- Post-apply, measured: active 46, picsum 0, no-supplier 0, no-rate 0,
-- no-category 0, demo active 0, coupons without a price 0, imported active 19,
-- suppliers 6 active / 6 closed.
--
-- Idempotent by `slug` and by supplier name throughout. Every statement is an
-- UPDATE (or an INSERT guarded by NOT EXISTS) whose WHERE stops matching once
-- it has run, so a second application changes nothing. No product is inserted
-- and nothing is deleted.
--
--
-- THE STATE THIS FIXES, measured against ixvwfbuvfxxsjiywhbbb on 2026-08-31
--
--   19  products  status='draft'   type='physical'  supplier_id NULL   (WP import)
--   34  products  status='active'  attributes->>'demo' = 'true'        (seed data)
--   27  products  status='active'  real
--   30  of the 34 demo products carry picsum image URLs; ZERO real active
--       products do, so retiring the demo data is also what takes picsum out
--       of the live catalogue.
--    4  products claim `is_coupon_enabled` with no `coupon_price_ils`, which
--       `buildCouponOffer` models as unsellable. They are live products, not
--       demo data.
--
-- The shop is serving 34 invented products and hiding all 19 real ones.
--
--
-- THE MEASUREMENT THAT SAYS THIS IS SAFE FOR THE HOME PAGE
--
-- `src/lib/ke-live-deals-data.ts` is a static mirror of the live deal grid: 32
-- cards with local AVIF images, so the GRID cannot break. What can break is
-- where a card LINKS, because `/product/[slug]` reads the database. All 32
-- slugs were resolved against production:
--
--   24  active, NOT demo  -> untouched, keep working
--    6  draft             -> published here, 404 becomes 200
--    2  no row at all     -> stay 404: `reverse-withdrawal-payment` (the Dokan
--                           admin product, deliberately excluded from the
--                           import) and `קופון-טסט`
--
-- The grid goes from 24/32 reachable to 30/32, and NOT ONE of the 34 demo
-- products backs a deal card.
--
--
-- ⚠️ THE IMAGES ARE HOSTED BY THE SITE THIS PROJECT REPLACES
--
-- All 32 image URLs on the 19 drafts were fetched on 2026-08-31 and all 32
-- returned 200. Every one is `https://kenyonexpress.co.il/wp-content/uploads/...`,
-- served by the old WordPress install. That host is allowed in
-- `src/lib/images/remote-hosts.ts`, so they render today.
--
-- ON THE DAY THE DOMAIN IS POINTED AT VERCEL, ALL 32 BECOME 404. Pull them into
-- R2 BEFORE the DNS cutover, or these nineteen products go live with no picture
-- at the exact moment the shop opens. `docs/LAUNCH-RUNBOOK.md` step 7.
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. The approver
-- ---------------------------------------------------------------------------
--
-- `enforce_product_approval()` opens with `IF auth.uid() IS NULL THEN RETURN NEW`,
-- and a migration applied on the service role is exactly that. So the trigger
-- will NOT stamp the approval fields and this file has to. Read the function
-- before assuming otherwise.

CREATE TEMP TABLE _approver ON COMMIT DROP AS
SELECT id FROM public.profiles WHERE email = 'kenyonexpress@gmail.com' AND role = 'super_admin';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _approver) THEN
    RAISE EXCEPTION 'no super_admin profile for kenyonexpress@gmail.com; refusing to publish with a NULL approver';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The supplier the 19 products actually belong to
-- ---------------------------------------------------------------------------
--
-- WHY ONE SELF-SUPPLIER AND NOT NINETEEN VENDOR ROWS.
--
-- This is not a shortcut, it is what every source says. Measured, three ways:
--
--   - All 48 products in `kenyonexpress-wxr-2026-07-29.xml` carry
--     `dc:creator = galofir10@gmail.com`, author id 1, the site admin. Not one
--     product is authored by a vendor.
--   - `_dokan_vendor_id` appears in the export 19 times and every occurrence is
--     on a `shop_order`, never on a `product`.
--   - The live site's `/store-listing/` contains exactly ONE store, `test-store`,
--     whose page reads "Test Store", has no address, and whose only `tel:` is
--     `6315222288`, not an Israeli number. The `/store/` links on a live product
--     page are inside the vendor REGISTRATION form, not a "sold by" attribution.
--
-- So there is no third-party vendor to attribute these to, and inventing
-- nineteen would be inventing commercial relationships: `supplier_id` decides
-- who is paid and `platform_percent` decides how much. The truthful answer is
-- that the platform is the seller of all nineteen, and that is one row.
--
-- The contact details are the only ones the live site publishes anywhere: the
-- WhatsApp number `972524635550`, which appears on the home page and the
-- contact page and is already `PUBLISHED_STORE_WHATSAPP` in the code. The email
-- is the app's own `DEFAULT_CONTACT_EMAIL`.
--
-- ⚠️ `address` AND `city` ARE LEFT NULL ON PURPOSE. The live site publishes no
-- postal address on any page that was checked (home, contact, the single store
-- page). Filling them would be fabricating a business address, which is the one
-- field on this row a customer might rely on. Setting it is an owner task and
-- is listed in `docs/FINAL-REPORT.md`.

INSERT INTO public.suppliers (name, contact_email, contact_phone, whatsapp, status, notes)
SELECT
  'קניון אקספרס',
  'info@kenyonexpress.co.il',
  '972524635550',
  '972524635550',
  'active',
  'Platform-owned catalogue. Created by migration 128: every product in the WordPress export is authored by the site admin and no Dokan vendor exists in any source. Address and city intentionally left NULL rather than invented.'
WHERE NOT EXISTS (SELECT 1 FROM public.suppliers WHERE name = 'קניון אקספרס');

-- ---------------------------------------------------------------------------
-- 2. Category, one line per product, mapped and reviewable
-- ---------------------------------------------------------------------------
--
-- Source, in order of authority: (a) the `product_cat` term on the WXR item
-- where it is a real category, which is six of the nineteen; (b) the product's
-- own NAME where the WXR term is `כללי` (uncategorized), which is thirteen.
-- Where (b) is used the name is quoted on the line, because that is an
-- editorial call and it should be checkable in one pass. It is also the
-- cheapest call here to get wrong: a category decides navigation, not money.
--
-- Three rows have a slug that disagrees with their name. They carry
-- `attributes->>'slug_title_mismatch'` from the import and the live site has
-- the same mismatch, so the SLUG must not be touched (the deal grid links to it
-- verbatim). The NAME is what the category follows.
--
-- COALESCE, not assignment: a category already chosen by a human is never
-- overwritten. Only the thirteen NULLs are filled.

UPDATE public.products p SET category_id = COALESCE(p.category_id, c.id), updated_at = now()
FROM public.categories c, (VALUES
  ('6253',                                        'vacation'),          -- "חבילת חופשה למאלדיבים - 2 טיסות"
  ('ארוחה-זוגית-עם-פלטת-קילו-בשרי-פרימיום-ו',      'restaurants-cafes'), -- meal for two
  ('ארוחת-בוקר-זוגית-בקפה-קפה',                    'restaurants-cafes'), -- breakfast for two
  ('ארוחת-שף-במסעדת-אולטרה',                       'beauty-health'),     -- slug/name mismatch; name is "טיפול פנים"
  ('חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק',        'beauty-health'),     -- couples massage, spa
  ('חבילת-גלידה',                                  'restaurants-cafes'), -- ice cream package
  ('חבילת-קוקטיילים',                              'restaurants-cafes'), -- cocktails for two
  ('חיתולי-פמפרס',                                 'baby-kids'),         -- Pampers nappies
  ('חיתולי-פמפרס-העתק',                            'baby-kids'),         -- WXR product_cat: תינוקות וילדים
  ('טיפול-פנים-עמוק',                              'beauty-health'),     -- deep facial
  ('מזקקת-ויסקי',                                  'restaurants-cafes'), -- whisky distillery tour
  ('מלון-4-כוכבים-פלוס-ארוחת-בוקר',                'vacation'),          -- 4 star hotel
  ('מלון-5-כוכבים-בטבריה',                         'vacation'),          -- 5 star hotel, Tiberias
  ('עוזרת-אישית-שירותי-משרד',                      'professionals'),     -- WXR product_cat: בעלי מקצוע
  ('עיסוי-מפנק-לגבר-45-דקות-רק-ב108',              'beauty-health'),     -- WXR product_cat: יופי בריאות וטיפוח
  ('עיסוי-משולב-מפנק-לגבר-רק-108',                 'beauty-health'),     -- WXR product_cat: יופי בריאות וטיפוח
  ('צימר-מאסטר-copy-copy',                         'restaurants-cafes'), -- WXR: מסעדות ובתי קפה; name is "פינוק גלידה"
  ('שעון-אפל-חכם-apple-watch-series-7',            'restaurants-cafes'), -- slug/name mismatch; name is a cafe breakfast
  ('תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',      'beauty-health')      -- WXR product_cat: יופי בריאות וטיפוח
) AS m(product_slug, category_slug)
WHERE p.slug = m.product_slug
  AND c.slug = m.category_slug
  AND p.deleted_at IS NULL
  AND p.status = 'draft';

-- ---------------------------------------------------------------------------
-- 3. Supplier and commercial terms on the nineteen
-- ---------------------------------------------------------------------------
--
-- The rates are not invented. Measured across the 61 active products:
--
--   type      platform_percent  commission_percent  commission_type
--   physical  30.00             5.00                physical_percent   26 rows
--   physical  15.00             10.00               physical_percent   15 rows  (demo)
--   coupon    25.00             5.00                coupon_absolute    15 rows  (demo)
--
-- 30/5 is the real physical pattern; the 15/10 group is entirely demo data and
-- is retired in section 6. All nineteen are `type='physical'`, so 30 applies.
-- Section 7 carries the coupon reclassification, commented out.
--
-- `platform_percent` is NULL on all nineteen today, and NULL does not resolve
-- to something safe downstream: it is snapshotted onto `order_items` at
-- purchase, so a sale would record a split with no platform share.

UPDATE public.products SET
  supplier_id        = (SELECT id FROM public.suppliers WHERE name = 'קניון אקספרס'),
  platform_percent   = 30.00,
  commission_percent = 5.00,
  commission_type    = 'physical_percent',
  updated_at         = now()
WHERE deleted_at IS NULL
  AND status = 'draft'
  AND attributes->>'imported_from' = 'kenyonexpress-wxr-2026-07-29';

-- ---------------------------------------------------------------------------
-- 4. Publish
-- ---------------------------------------------------------------------------
--
-- `published_at` and `approved_at` are set only where NULL, so a re-run does
-- not restamp a publication date and reorder a "newest first" listing.

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
-- 5. The four coupons with no coupon price
-- ---------------------------------------------------------------------------
--
-- These are LIVE products, not demo data, and all four claim
-- `is_coupon_enabled` with `coupon_price_ils` NULL, which `buildCouponOffer`
-- correctly models as unsellable. So four things on the site say "coupon" and
-- cannot be bought.
--
-- The price comes from the live page, via `src/lib/ke-live-deals-data.ts`,
-- which mirrors the live deal grid verbatim:
--
--   barbecue-2          live kenyon 180, full 199   DB price_ils 180.00  -> match
--   restaurants-meat-3  live kenyon 1,   full 400   DB price_ils   1.00  -> match
--   ארוחה-בשרית-זוגית    not in the grid             DB price_ils 230.00
--   restaurants-meat-2  live card shows NO price     DB price_ils   0.00
--
-- For the first three the on-site coupon price IS `price_ils`: that is what the
-- live page charges, and the two that appear in the grid agree with it to the
-- shekel. So the price is copied rather than chosen.
--
-- `restaurants-meat-2` is handled separately below and deliberately gets NO
-- price. Its live card shows none and its stored price is 0.00; writing
-- `coupon_price_ils = 0` would create a coupon that is free to buy, which is
-- worse than one that is unsellable.

UPDATE public.products SET
  coupon_price_ils = price_ils,
  updated_at       = now()
WHERE deleted_at IS NULL
  AND (type = 'coupon' OR is_coupon_enabled)
  AND coupon_price_ils IS NULL
  AND price_ils > 0;

-- The zero-priced one stops claiming to be a coupon, rather than being given a
-- price nobody published. It remains a normal product and remains for sale.
UPDATE public.products SET
  is_coupon_enabled = false,
  updated_at        = now()
WHERE deleted_at IS NULL
  AND slug = 'restaurants-meat-2'
  AND coupon_price_ils IS NULL
  AND price_ils <= 0;

-- ---------------------------------------------------------------------------
-- 6. Retire the demo catalogue
-- ---------------------------------------------------------------------------
--
-- `draft`, never deleted. Four orders exist in this database and demo products
-- are reachable from `order_items`; a DELETE would either cascade into order
-- history or fail on a foreign key, and neither is what "hide the demo data"
-- means.
--
-- This is also what removes picsum from the live catalogue: 30 active products
-- carry picsum URLs and all 30 are demo.
--
-- ⚠️ All 15 active COUPON-type products are demo, so after this the catalogue
-- contains zero products of `type='coupon'`. The coupon flow, `/coupon/[id]`,
-- `/scan` and the voucher issuer stay fully built and tested and will have
-- nothing to sell until section 7 is uncommented or a real coupon product is
-- created in the admin. That is the deliberate consequence of retiring invented
-- data, not an oversight.

UPDATE public.products SET status = 'draft', updated_at = now()
WHERE deleted_at IS NULL
  AND status = 'active'
  AND attributes->>'demo' = 'true';

-- The eleven seed supplier rows own only demo products, so after the statement
-- above they own nothing that is for sale. `closed`, not deleted: `suppliers`
-- is referenced by `products` and by settlement history, and the enum offers
-- exactly `active | suspended | closed`.
--
-- They are seed data on their face: "מסעדת השף הגדול" at 03-1234567, "ספא רוגע"
-- at 04-7654321, "עולם הילד" at 08-5556666, and all eleven have no address and
-- no logo. Nothing on the live site carries any of these names, so there was
-- nothing to backfill them from.
UPDATE public.suppliers SET status = 'closed', updated_at = now()
WHERE deleted_at IS NULL
  AND status = 'active'
  AND name <> 'קניון אקספרס'
  AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.supplier_id = suppliers.id
      AND p.deleted_at IS NULL
      AND p.status = 'active'
  );

-- ---------------------------------------------------------------------------
-- 7. ⛔ COMMENTED OUT: reclassify the services as coupons
-- ---------------------------------------------------------------------------
--
-- Seventeen of the nineteen cannot be shipped (a haircut in Petah Tikva, a
-- hotel night in Tiberias, a spa treatment). If they are to be sold as vouchers
-- redeemed at the supplier, this is the statement. It needs the owner first,
-- because `type` decides the money route: a coupon issues a QR voucher and pays
-- on redemption, a physical ships and splits immediately.
--
-- Neither source classifies them. The WXR marks all 48 products
-- `product_type = simple`, WooCommerce's only kind here, and the live pages
-- render a plain price with no coupon concept. `coupon_expiry_days` has no
-- source at all, which is the other reason this stays commented.
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
--     '6253', 'ארוחה-זוגית-עם-פלטת-קילו-בשרי-פרימיום-ו', 'ארוחת-בוקר-זוגית-בקפה-קפה',
--     'ארוחת-שף-במסעדת-אולטרה', 'חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק', 'חבילת-גלידה',
--     'חבילת-קוקטיילים', 'טיפול-פנים-עמוק', 'מזקקת-ויסקי', 'מלון-4-כוכבים-פלוס-ארוחת-בוקר',
--     'מלון-5-כוכבים-בטבריה', 'עוזרת-אישית-שירותי-משרד', 'עיסוי-מפנק-לגבר-45-דקות-רק-ב108',
--     'עיסוי-משולב-מפנק-לגבר-רק-108', 'צימר-מאסטר-copy-copy',
--     'שעון-אפל-חכם-apple-watch-series-7', 'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה'
--   );
--
-- The two NOT in that list are the two that genuinely ship: `חיתולי-פמפרס` and
-- `חיתולי-פמפרס-העתק`.

COMMIT;

-- ============================================================================
-- VERIFICATION (run inside BEGIN; ... ROLLBACK; first, then for real)
-- ============================================================================
--
--   SELECT
--     count(*) FILTER (WHERE status='active')                                   AS active_total,         -- expect 46
--     count(*) FILTER (WHERE status='active' AND images::text ILIKE '%picsum%') AS active_picsum,        -- expect 0
--     count(*) FILTER (WHERE status='active' AND supplier_id IS NULL)           AS active_no_supplier,   -- expect 0
--     count(*) FILTER (WHERE status='active' AND platform_percent IS NULL)      AS active_no_rate,       -- expect 0
--     count(*) FILTER (WHERE status='active' AND category_id IS NULL)           AS active_no_category,   -- expect 0
--     count(*) FILTER (WHERE status='active' AND attributes->>'demo'='true')    AS demo_active,          -- expect 0
--     count(*) FILTER (WHERE (type='coupon' OR is_coupon_enabled)
--                        AND coupon_price_ils IS NULL)                          AS coupons_no_price      -- expect 0
--   FROM public.products WHERE deleted_at IS NULL;
--
--   SELECT count(*) FROM public.suppliers
--    WHERE deleted_at IS NULL AND status='active';                              -- expect 1
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
--   BEGIN;
--   UPDATE public.products SET status='draft', approved_at=NULL, approved_by=NULL,
--          published_at=NULL, platform_percent=NULL, commission_percent=0.00,
--          supplier_id=NULL
--    WHERE deleted_at IS NULL AND attributes->>'imported_from' = 'kenyonexpress-wxr-2026-07-29';
--   UPDATE public.products SET status='active'
--    WHERE deleted_at IS NULL AND attributes->>'demo' = 'true';
--   UPDATE public.suppliers SET status='active'
--    WHERE deleted_at IS NULL AND name <> 'קניון אקספרס';
--   COMMIT;
--
-- `category_id` and `coupon_price_ils` are deliberately NOT rolled back: both
-- were filled with COALESCE semantics, and undoing them would also clear values
-- a human had already set.
