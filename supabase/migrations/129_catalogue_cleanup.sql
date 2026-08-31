-- PENDING 129: catalogue cleanup, scoped to what the data actually supports
-- ============================================================================
--
-- ✅ APPLIED to ixvwfbuvfxxsjiywhbbb on 2026-09-01 via MCP `apply_migration`,
-- after a BEGIN/ROLLBACK dry run whose counts matched the verification block
-- below exactly. Moved out of `migrations/pending/` for that reason: that
-- directory means "not run anywhere", and an applied file left in it is how the
-- inventory stops meaning anything (`pending-migrations-inventory.test.ts`
-- fails on exactly this, which is how it was caught).
--
-- Post-apply, measured: active 45, zero_priced 0, no_supplier 0, no_category 0,
-- picsum 0, platform supplier logo set.
--
-- Idempotent by `slug` and by supplier name. Every statement is an UPDATE whose
-- WHERE stops matching once it has run. Nothing is deleted.
--
--
-- THE SCAN, run against ixvwfbuvfxxsjiywhbbb on 2026-09-01, 46 active products
--
--   blank name .................. 0
--   missing images .............. 0
--   BROKEN images ............... 0   <- all 46 first images fetched, all 200
--   missing supplier ............ 0
--   missing category ............ 0
--   zero or negative price ...... 1   <- the finding
--   missing description ......... 41
--
-- The image result is worth stating plainly because it is the one most likely
-- to be assumed rather than checked: every active product's first image was
-- fetched individually. 19 are served from the old WordPress host and 27 from
-- `/images/products/` on the deployment, and all 46 answered 200.
--
-- ⚠️ Those 19 are still a live dependency on `kenyonexpress.co.il`. They pass
-- today because that host still serves WordPress. They 404 the moment the DNS
-- cutover happens. That is a launch-order problem, not a data problem, and this
-- migration cannot fix it: the images have to be pulled into R2 first.
--
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A live product priced at zero
-- ---------------------------------------------------------------------------
--
-- `restaurants-meat-2` ("בשר במסעדה") is active with `price_ils = 0.00`, and
-- the production page renders ₪0 today. It is a physical product, so nothing
-- downstream refuses it the way `buildCouponOffer` refuses an unpriced coupon:
-- it can be added to a cart and carried into an order whose total is zero.
--
-- It goes to `draft`, not to a price, because no source has one. Its card on
-- the live site shows no price at all, and 128 already removed its
-- `is_coupon_enabled` flag for the same reason: inventing a number here is
-- inventing what the business charges.
--
-- THE TRADE-OFF, STATED. This slug is one of the 32 in
-- `src/lib/ke-live-deals-data.ts`, so drafting it takes the home page's deal
-- grid from 30/32 resolving to 29/32. A dead card is a worse link and a better
-- outcome than an order for ₪0. Give it a price in the admin and it comes back
-- with one statement.

UPDATE public.products SET status = 'draft', updated_at = now()
WHERE deleted_at IS NULL
  AND status = 'active'
  AND slug = 'restaurants-meat-2'
  AND (price_ils IS NULL OR price_ils <= 0);

-- ---------------------------------------------------------------------------
-- 2. The platform supplier's logo
-- ---------------------------------------------------------------------------
--
-- `קניון אקספרס` is the row 128 created for the 19 imported products, and it
-- carries the only contact detail the live site publishes anywhere (the
-- WhatsApp number). Its `logo_url` was NULL.
--
-- `/images/logo.webp` is the site's own logo, already in `public/` and verified
-- serving 200 on the deployment. Using it for the platform's own supplier row
-- is not invented data: it is the same mark the header renders.
--
-- COALESCE, so a logo somebody uploads later is never overwritten.

UPDATE public.suppliers
   SET logo_url = COALESCE(logo_url, '/images/logo.webp'), updated_at = now()
 WHERE deleted_at IS NULL
   AND name = 'קניון אקספרס'
   AND logo_url IS NULL;

COMMIT;

-- ============================================================================
-- ⛔ WHAT THIS FILE DELIBERATELY DOES NOT DO
-- ============================================================================
--
-- 1. IT WRITES NO PRODUCT DESCRIPTIONS. 41 of 46 active products have an empty
--    `description_he`. That is real and it costs SEO, and it is 41 pieces of
--    copy about specific hotels, treatments and restaurants. A migration that
--    generated them would be publishing invented claims about real businesses.
--
-- 2. IT INVENTS NO SUPPLIER CONTACT DETAILS. Five seed suppliers hold 27 of the
--    46 active products between them:
--
--      ביוטי לאב 8 | טעמים גורמה 6 | ספורט מקס 6 | טק וורלד 4 | סטייל הבית 3
--
--    All five have NULL phone, whatsapp, logo, address and city, and not one of
--    their names appears anywhere on the live site. They are seed rows that
--    ended up owning real products. Filling them in would be fabricating five
--    businesses, and `suppliers.contact_phone` is what a customer is told to
--    call about an order.
--
--    ⚠️ THIS IS THE LARGEST OPEN ITEM IN THE CATALOGUE and it needs a person:
--    either enter the real details, or reassign those 27 products to a supplier
--    that exists.
--
-- 3. IT DOES NOT TOUCH THE SIX `closed` SUPPLIERS. 128 closed them because they
--    own nothing active. Four of them carry seed phone numbers (03-1234567,
--    04-7654321, 08-5556666, 09-1112222) which are visibly fake, but they are
--    not reachable from the storefront and rewriting history is not cleanup.
--
-- ============================================================================
-- VERIFICATION (expected after applying)
-- ============================================================================
--
--   SELECT count(*) FILTER (WHERE status='active')                        AS active,        -- 45
--          count(*) FILTER (WHERE status='active' AND price_ils <= 0)     AS zero_priced,   -- 0
--          count(*) FILTER (WHERE status='active' AND supplier_id IS NULL) AS no_supplier   -- 0
--     FROM public.products WHERE deleted_at IS NULL;
--
--   SELECT count(*) FROM public.suppliers
--    WHERE deleted_at IS NULL AND status='active' AND logo_url IS NULL;                     -- 5
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
--   BEGIN;
--   UPDATE public.products SET status='active' WHERE slug='restaurants-meat-2';
--   UPDATE public.suppliers SET logo_url=NULL
--    WHERE name='קניון אקספרס' AND logo_url='/images/logo.webp';
--   COMMIT;
