# C137 — HOME DESIGN LOCK (decisions 15.10, 25.10, 28.10, 01.11, 02.11.2026)

Production build (`pnpm build`, exit 0) served by `next start -p 3317`, live Supabase.

## Done
- **Prices, whole shekels on every surface.** `money-format.ts` (`shekels`, `shekelsPlain`, `shekelsFromIls*`), `commerce/money.ts` `formatIls` (via `roundToWholeShekels`), `utils.formatPrice`, SMS templates, invoice PDF `formatAmountForPdf`, RFM, admin coupon/order pages, gift card form, ProductForm preview. Rounding is half away from zero on integer agorot. Storage is still agorot. Admin and checkout shekel inputs use `step="1"`.
- **Hero.** The city cards strip is gone: `CitiesRow.tsx` now re-exports `HeroBrandBanners` (locked `HeroSection.tsx` untouched). The Apple and Tesla products banners use real images: the old site's own Apple and Tesla ad-block marks (uploads 6450/6472, converted to `public/images/hero/brands/*.webp`) and the iPhone 13 catalogue photo. They appear in the 768+ strip, the 1440 side column (`HeroPromoBanners`, replacing grey `BrandPlaceholder`) and the phone carousel (`HeroMobile`). The welcome slide's image inset moved from 11.8 to 3 so it no longer covers the title.
- **Logo.** `public/images/logo.svg` is a true vector: cart mark as paths, text outlined from `src/assets/fonts/Heebo-*.ttf`. Also `logo.png`, `logo@2x.png`, `logo@3x.png`, and `logo-light*` for the dark footer bar. Header uses it via `LOGO` in `lib/assets.ts`; footer uses `<BrandLogo>` (SVG plus 1x/2x/3x PNG srcset).
- **Categories row** comes from `KE_LIVE_SPEC.md` (the live menu, in order) in `lib/home-categories.ts`. The DB orphans `electronics` and `e2e-test-category` no longer show.
- **Header:** wishlist, account, cart at every breakpoint (account icon rendered by `HeaderCart`). The yellow counter always shows, including 0. No "0 ₪" beside the cart. The masthead icon gap is 20px, which fixes the 1440 sideways scroll (scrollWidth 1452 → 1440).
- **Card label** is centred on home, `/c/<slug>`, `/category`, and the `/product` eyebrow and related cards. Coupon products show city + pin; physical products show the category.
- **Filter chips** appear on `/c/<slug>` only, open-weekend and free-shipping only. Removed from `/category/<slug>` and `/products`.
- **No reviews** (PDP star rating removed). **No social links** (footer icon row and legacy footer removed).
- **Hot coupons** now render. The query also matches `is_coupon_enabled` opt-ins, and the card no longer reads the clock during prerender.
- **Section order** at all widths: hero, deal of day, categories, featured, hot coupons, brands, newsletter, all deals (infinite), then footer.

## Playwright checks (docs/C137/*.png)
```
home@380: status=200 sections=['מבצעים', 'דיל היום', 'קטגוריות', 'מוצרים מומלצים', 'קופונים חמים', 'מותגים', 'הרשמה לניוזלטר', 'כל הדילים'] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=['apple', 'tesla'] brokenImgs=[] chips=[] labels=[['טיפוח בריאות ויופי', False, 'center'], ['מסעדות ובתי קפה', False, 'center'], ['טיפוח בריאות ויופי', False, 'center']]
home-end@380: footerVisible=True
c-slug@380: status=200 sections=[] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=['פתוח בסופ״ש', 'משלוח חינם'] labels=[['צימרים מלונות ונופש', False, 'center'], ['טיפוח בריאות ויופי', False, 'center'], ['צימרים מלונות ונופש', False, 'center']]
product@380: status=200 sections=['משלוח ואספקה', 'פרטי ספק'] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=[] labels=[['טלפונים ואלקטרוניקה', False, 'center'], ['חיפה', True, 'center'], ['פתח תקווה', True, 'center']]
category@380: status=200 sections=[] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=[] labels=[['טיפוח בריאות ויופי', False, 'center'], ['טיפוח בריאות ויופי', False, 'center'], ['טיפוח בריאות ויופי', False, 'center']]
home@768: status=200 sections=['אזור ראשי', 'דיל היום', 'קטגוריות', 'מוצרים מומלצים', 'קופונים חמים', 'מותגים', 'הרשמה לניוזלטר', 'כל הדילים'] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=['apple', 'tesla'] brokenImgs=[] chips=[] labels=[['טיפוח בריאות ויופי', False, 'center'], ['מסעדות ובתי קפה', False, 'center'], ['טיפוח בריאות ויופי', False, 'center']]
home-end@768: footerVisible=True
c-slug@768: status=200 sections=[] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=['פתוח בסופ״ש', 'משלוח חינם'] labels=[['צימרים מלונות ונופש', False, 'center'], ['טיפוח בריאות ויופי', False, 'center'], ['צימרים מלונות ונופש', False, 'center']]
product@768: status=200 sections=['משלוח ואספקה', 'פרטי ספק'] overlaps=1 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=[] labels=[['טלפונים ואלקטרוניקה', False, 'center'], ['חיפה', True, 'center'], ['פתח תקווה', True, 'center']]
category@768: status=200 sections=[] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=[] labels=[['טיפוח בריאות ויופי', False, 'center'], ['טיפוח בריאות ויופי', False, 'center'], ['טיפוח בריאות ויופי', False, 'center']]
home@1440: status=200 sections=['אזור ראשי', 'דיל היום', 'קטגוריות', 'מוצרים מומלצים', 'קופונים חמים', 'מותגים', 'הרשמה לניוזלטר', 'כל הדילים'] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=['apple', 'tesla'] brokenImgs=[] chips=[] labels=[['טיפוח בריאות ויופי', False, 'center'], ['מסעדות ובתי קפה', False, 'center'], ['טיפוח בריאות ויופי', False, 'center']]
home-end@1440: footerVisible=True
c-slug@1440: status=200 sections=[] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=['פתוח בסופ״ש', 'משלוח חינם'] labels=[['צימרים מלונות ונופש', False, 'center'], ['טיפוח בריאות ויופי', False, 'center'], ['צימרים מלונות ונופש', False, 'center']]
product@1440: status=200 sections=['משלוח ואספקה', 'פרטי ספק'] overlaps=1 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=[] labels=[['טלפונים ואלקטרוניקה', False, 'center'], ['חיפה', True, 'center'], ['פתח תקווה', True, 'center']]
category@1440: status=200 sections=[] overlaps=0 hscroll=False decimalPrices=[] headerIcons=['המועדפים שלי', 'החשבון שלי', 'cart'] counter=[['0', 'rgb(254, 215, 0)']] social=0 reviews=False locationUI=False cityRow=False heroBanners=[] brokenImgs=[] chips=[] labels=[['טיפוח בריאות ויופי', False, 'center'], ['טיפוח בריאות ויופי', False, 'center'], ['טיפוח בריאות ויופי', False, 'center']]
```

## Tests / types / build
```
$ npx vitest run src
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 6 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  4 failed | 812 passed | 3 skipped (819)
      Tests  6 failed | 9024 passed | 39 skipped (9069)
(the 6 failures are the migration-inventory files: migration-location-gate, migration-manifest-matches-disk, migration-references-point-where-the-file-is, pending-migrations-inventory x3; C136 baseline)
$ npx tsc --noEmit
tsc exit 0
$ pnpm build
build exit 0
$ git diff --name-only -- <all locked/forbidden paths> | wc -l
0
```

## Gate: compare.mjs (NOT MET)
```
$ COMPARE_ALLOW_PENDING_IMAGES=1 node scripts/compare.mjs --page=home --width=380 --mine=http://localhost:3317/
OVERALL first 2600px: 45.73%
$ ... --width=768
OVERALL first 2600px: 40.31%
$ ... --width=1440
OVERALL first 2600px: 27.53%
```
C130 measured 46.26 / 41.03 / 27.97. Root cause: the home baseline (`refs/electro-home-v7_*`) is Electro's English demo, `lang="en-US"`, left-to-right. Its first 2600px are a deals carousel, a tablet banner, a popular-categories grid, and Headphones / Smartphones tab rails. The locked rules require a mirrored RTL layout, Hebrew old-site content, and a different section order (deal of day, categories, featured, hot coupons, brands, newsletter, infinite deals). The header and hero bands are locked files. Getting under 11% would mean copying the demo's structure and content, which the same rules forbid. So this is not a defect a code change can close.

RESULT: BLOCKED compare.mjs home 45.73/40.31/27.53 vs <11 (LTR English Electro baseline vs required RTL Hebrew section order; header/hero locked)
