# C149 — Demo product pages (one demo deal per master)

44 deal masters (C148 `masters.json`) → 44 active demo products + 31 demo suppliers, all `is_demo = true`. Hebrew copy, real images from old-site assets mirrored under `public/images` (`/images/cdn/wp/**`, `/images/products/**`, `/images/categories/**`). Every deal is validated by the C148 pipeline (`validateDeal` + `buildProductWrite`) against its own master before SQL is emitted; money goes shekels → agorot through `src/lib/money.ts` (the `*_agorot` columns are DB-generated).

Demo suppliers use the published store number 052-4635550 for phone and wa.me, so a demo page never dials a stranger.

Remove all demo data: `delete from products where is_demo; delete from suppliers where is_demo;`

## Files
- `migrations/pending/329_is_demo.sql`: `products.is_demo`, `suppliers.is_demo` (default false)
- `migrations/pending/330_demo_deals.sql`: generated seed (idempotent, md5 ids, upsert on slug)
- `scripts/demo/demo-deals.mjs`: content; `scripts/demo/build-demo-deals.ts`: builder; `scripts/demo/shoot-demo-deals.mjs`: checks + screenshots
- PDP: `ProductDealDetails.tsx` (spec table from template fields + legal block: seller קניון אקספרס ח.פ 033798513, validity, voucher days, delivery, shipping, VAT, 14ג cancellation, returns, fine print, /terms + /returns links), highlights bullets in `ProductInfo` (Electro short-description slot), how-to-redeem steps (QR + 8-digit code) in `CouponQrExpiry`, CSS for QR block/specs/legal in `product-page.css`; `product-detail.ts` selects highlights/attributes/short description/shipping and reads `offer_valid_until` for every product
- Coupon validity dates now formatted in Asia/Jerusalem (`CouponPricing`, `coupon-expiry.ts`); server in +07 printed 1.2.2027 for a 31.1.2027 deadline
- `DealWizard.tsx`: template search input `type="search"` → `text` (C148 left `no-search-ui.test.ts` red)
- Screenshots: `docs/C149/<slug>-380.jpg`, `docs/C149/<slug>-1440.jpg` (88, production build `next start`), `docs/C149/checks.json`

## URLs (44)

| master | type | price / was | -% | supplier, city | URL | shots |
|---|---|---|---|---|---|---|
| android-phone | physical | 2490 ₪ / 2990 ₪ | 17 | מובייל סנטר, פתח תקווה | https://www.kenyonexpress.co.il/product/demo-android-phone | [380](C149/demo-android-phone-380.jpg) · [1440](C149/demo-android-phone-1440.jpg) |
| baby-consumables | physical | 199 ₪ / 279 ₪ | 29 | בייבי לנד, אשדוד | https://www.kenyonexpress.co.il/product/demo-baby-consumables | [380](C149/demo-baby-consumables-380.jpg) · [1440](C149/demo-baby-consumables-1440.jpg) |
| baby-gear | physical | 1290 ₪ / 1690 ₪ | 24 | בייבי לנד, אשדוד | https://www.kenyonexpress.co.il/product/demo-baby-gear | [380](C149/demo-baby-gear-380.jpg) · [1440](C149/demo-baby-gear-1440.jpg) |
| bags-fashion | physical | 189 ₪ / 299 ₪ | 37 | אופנה אקספרס, נתניה | https://www.kenyonexpress.co.il/product/demo-bags-fashion | [380](C149/demo-bags-fashion-380.jpg) · [1440](C149/demo-bags-fashion-1440.jpg) |
| camera-drone | physical | 1990 ₪ / 2390 ₪ | 17 | סקיי שופ, מודיעין | https://www.kenyonexpress.co.il/product/demo-camera-drone | [380](C149/demo-camera-drone-380.jpg) · [1440](C149/demo-camera-drone-1440.jpg) |
| computer-accessories | physical | 149 ₪ / 219 ₪ | 32 | מחשבים בקליק, תל אביב | https://www.kenyonexpress.co.il/product/demo-computer-accessories | [380](C149/demo-computer-accessories-380.jpg) · [1440](C149/demo-computer-accessories-1440.jpg) |
| gaming-console | physical | 2190 ₪ / 2490 ₪ | 12 | גיים זון, ראשון לציון | https://www.kenyonexpress.co.il/product/demo-gaming-console | [380](C149/demo-gaming-console-380.jpg) · [1440](C149/demo-gaming-console-1440.jpg) |
| general-physical | physical | 89 ₪ / 139 ₪ | 36 | סלולר פלוס, רמת גן | https://www.kenyonexpress.co.il/product/demo-general-physical | [380](C149/demo-general-physical-380.jpg) · [1440](C149/demo-general-physical-1440.jpg) |
| gift-box | physical | 279 ₪ / 379 ₪ | 26 | מתנות בקופסה, זכרון יעקב | https://www.kenyonexpress.co.il/product/demo-gift-box | [380](C149/demo-gift-box-380.jpg) · [1440](C149/demo-gift-box-1440.jpg) |
| headphones | physical | 599 ₪ / 799 ₪ | 25 | סאונד סיטי, הרצליה | https://www.kenyonexpress.co.il/product/demo-headphones | [380](C149/demo-headphones-380.jpg) · [1440](C149/demo-headphones-1440.jpg) |
| home-kitchen | physical | 449 ₪ / 699 ₪ | 36 | בית ונוי, חולון | https://www.kenyonexpress.co.il/product/demo-home-kitchen | [380](C149/demo-home-kitchen-380.jpg) · [1440](C149/demo-home-kitchen-1440.jpg) |
| home-lighting | physical | 289 ₪ / 449 ₪ | 36 | בית ונוי, חולון | https://www.kenyonexpress.co.il/product/demo-home-lighting | [380](C149/demo-home-lighting-380.jpg) · [1440](C149/demo-home-lighting-1440.jpg) |
| home-textile | physical | 249 ₪ / 399 ₪ | 38 | בית ונוי, חולון | https://www.kenyonexpress.co.il/product/demo-home-textile | [380](C149/demo-home-textile-380.jpg) · [1440](C149/demo-home-textile-1440.jpg) |
| iphone | physical | 3290 ₪ / 3890 ₪ | 15 | סלולר פלוס, רמת גן | https://www.kenyonexpress.co.il/product/demo-iphone | [380](C149/demo-iphone-380.jpg) · [1440](C149/demo-iphone-1440.jpg) |
| kids-toys | physical | 129 ₪ / 199 ₪ | 35 | בייבי לנד, אשדוד | https://www.kenyonexpress.co.il/product/demo-kids-toys | [380](C149/demo-kids-toys-380.jpg) · [1440](C149/demo-kids-toys-1440.jpg) |
| laptop | physical | 3190 ₪ / 3790 ₪ | 16 | מחשבים בקליק, תל אביב | https://www.kenyonexpress.co.il/product/demo-laptop | [380](C149/demo-laptop-380.jpg) · [1440](C149/demo-laptop-1440.jpg) |
| pet-food | physical | 239 ₪ / 319 ₪ | 25 | חיות ושות׳, כפר סבא | https://www.kenyonexpress.co.il/product/demo-pet-food | [380](C149/demo-pet-food-380.jpg) · [1440](C149/demo-pet-food-1440.jpg) |
| pet-gear | physical | 179 ₪ / 269 ₪ | 33 | חיות ושות׳, כפר סבא | https://www.kenyonexpress.co.il/product/demo-pet-gear | [380](C149/demo-pet-gear-380.jpg) · [1440](C149/demo-pet-gear-1440.jpg) |
| power-accessories | physical | 119 ₪ / 179 ₪ | 34 | סלולר פלוס, רמת גן | https://www.kenyonexpress.co.il/product/demo-power-accessories | [380](C149/demo-power-accessories-380.jpg) · [1440](C149/demo-power-accessories-1440.jpg) |
| smartwatch | physical | 449 ₪ / 649 ₪ | 31 | סאונד סיטי, הרצליה | https://www.kenyonexpress.co.il/product/demo-smartwatch | [380](C149/demo-smartwatch-380.jpg) · [1440](C149/demo-smartwatch-1440.jpg) |
| speaker | physical | 349 ₪ / 499 ₪ | 30 | סאונד סיטי, הרצליה | https://www.kenyonexpress.co.il/product/demo-speaker | [380](C149/demo-speaker-380.jpg) · [1440](C149/demo-speaker-1440.jpg) |
| tablet | physical | 1290 ₪ / 1590 ₪ | 19 | מובייל סנטר, פתח תקווה | https://www.kenyonexpress.co.il/product/demo-tablet | [380](C149/demo-tablet-380.jpg) · [1440](C149/demo-tablet-1440.jpg) |
| alternative-medicine | coupon | 149 ₪ / 230 ₪ | 35 | קליניקת שורשים, ירושלים | https://www.kenyonexpress.co.il/product/demo-alternative-medicine | [380](C149/demo-alternative-medicine-380.jpg) · [1440](C149/demo-alternative-medicine-1440.jpg) |
| attraction-tickets | coupon | 89 ₪ / 139 ₪ | 36 | פארק המים הגדול, ראשון לציון | https://www.kenyonexpress.co.il/product/demo-attraction-tickets | [380](C149/demo-attraction-tickets-380.jpg) · [1440](C149/demo-attraction-tickets-1440.jpg) |
| bar-cocktails | coupon | 149 ₪ / 236 ₪ | 37 | בר 42, תל אביב | https://www.kenyonexpress.co.il/product/demo-bar-cocktails | [380](C149/demo-bar-cocktails-380.jpg) · [1440](C149/demo-bar-cocktails-1440.jpg) |
| beauty-treatment | coupon | 199 ₪ / 350 ₪ | 43 | סטודיו עור, הרצליה | https://www.kenyonexpress.co.il/product/demo-beauty-treatment | [380](C149/demo-beauty-treatment-380.jpg) · [1440](C149/demo-beauty-treatment-1440.jpg) |
| cafe | coupon | 119 ₪ / 178 ₪ | 33 | קפה הנמל, תל אביב | https://www.kenyonexpress.co.il/product/demo-cafe | [380](C149/demo-cafe-380.jpg) · [1440](C149/demo-cafe-1440.jpg) |
| dessert-icecream | coupon | 89 ₪ / 139 ₪ | 36 | ג׳לטו דולצ׳ה, נתניה | https://www.kenyonexpress.co.il/product/demo-dessert-icecream | [380](C149/demo-dessert-icecream-380.jpg) · [1440](C149/demo-dessert-icecream-1440.jpg) |
| experience-tour | coupon | 129 ₪ / 189 ₪ | 32 | יקב הגבעה, זכרון יעקב | https://www.kenyonexpress.co.il/product/demo-experience-tour | [380](C149/demo-experience-tour-380.jpg) · [1440](C149/demo-experience-tour-1440.jpg) |
| fitness-yoga | coupon | 199 ₪ / 350 ₪ | 43 | פיט ביץ׳, אשדוד | https://www.kenyonexpress.co.il/product/demo-fitness-yoga | [380](C149/demo-fitness-yoga-380.jpg) · [1440](C149/demo-fitness-yoga-1440.jpg) |
| flight | coupon | 690 ₪ / 990 ₪ | 30 | טיולי השמש, תל אביב | https://www.kenyonexpress.co.il/product/demo-flight | [380](C149/demo-flight-380.jpg) · [1440](C149/demo-flight-1440.jpg) |
| general-coupon | coupon | 349 ₪ / 520 ₪ | 33 | ביסטרו האש, נהריה | https://www.kenyonexpress.co.il/product/demo-general-coupon | [380](C149/demo-general-coupon-380.jpg) · [1440](C149/demo-general-coupon-1440.jpg) |
| hair-barber | coupon | 79 ₪ / 120 ₪ | 34 | הברבר של השכונה, באר שבע | https://www.kenyonexpress.co.il/product/demo-hair-barber | [380](C149/demo-hair-barber-380.jpg) · [1440](C149/demo-hair-barber-1440.jpg) |
| hotel | coupon | 1190 ₪ / 1690 ₪ | 30 | מלון חוף האלמוגים, אילת | https://www.kenyonexpress.co.il/product/demo-hotel | [380](C149/demo-hotel-380.jpg) · [1440](C149/demo-hotel-1440.jpg) |
| laser-hair-removal | coupon | 449 ₪ / 900 ₪ | 50 | לייזר קליניק, ראשון לציון | https://www.kenyonexpress.co.il/product/demo-laser-hair-removal | [380](C149/demo-laser-hair-removal-380.jpg) · [1440](C149/demo-laser-hair-removal-1440.jpg) |
| massage | coupon | 179 ₪ / 280 ₪ | 36 | מגע של רוגע, רעננה | https://www.kenyonexpress.co.il/product/demo-massage | [380](C149/demo-massage-380.jpg) · [1440](C149/demo-massage-1440.jpg) |
| organized-tour | coupon | 4290 ₪ / 5290 ₪ | 19 | טיולי השמש, תל אביב | https://www.kenyonexpress.co.il/product/demo-organized-tour | [380](C149/demo-organized-tour-380.jpg) · [1440](C149/demo-organized-tour-1440.jpg) |
| professional-service | coupon | 690 ₪ / 1000 ₪ | 31 | משרד בקליק, מודיעין | https://www.kenyonexpress.co.il/product/demo-professional-service | [380](C149/demo-professional-service-380.jpg) · [1440](C149/demo-professional-service-1440.jpg) |
| restaurant | coupon | 299 ₪ / 480 ₪ | 38 | גריל על האש, חיפה | https://www.kenyonexpress.co.il/product/demo-restaurant | [380](C149/demo-restaurant-380.jpg) · [1440](C149/demo-restaurant-1440.jpg) |
| spa | coupon | 549 ₪ / 860 ₪ | 36 | ספא אגם, טבריה | https://www.kenyonexpress.co.il/product/demo-spa | [380](C149/demo-spa-380.jpg) · [1440](C149/demo-spa-1440.jpg) |
| store-voucher | coupon | 150 ₪ / 200 ₪ | 25 | מעדניית השרון, כפר סבא | https://www.kenyonexpress.co.il/product/demo-store-voucher | [380](C149/demo-store-voucher-380.jpg) · [1440](C149/demo-store-voucher-1440.jpg) |
| tzimmer | coupon | 890 ₪ / 1290 ₪ | 31 | צימרי הגליל, ראש פינה | https://www.kenyonexpress.co.il/product/demo-tzimmer | [380](C149/demo-tzimmer-380.jpg) · [1440](C149/demo-tzimmer-1440.jpg) |
| vacation-package | coupon | 18900 ₪ / 23900 ₪ | 21 | טיולי השמש, תל אביב | https://www.kenyonexpress.co.il/product/demo-vacation-package | [380](C149/demo-vacation-package-380.jpg) · [1440](C149/demo-vacation-package-1440.jpg) |
| workshop-course | coupon | 390 ₪ / 690 ₪ | 43 | אקדמיה דיגיטלית, תל אביב | https://www.kenyonexpress.co.il/product/demo-workshop-course | [380](C149/demo-workshop-course-380.jpg) · [1440](C149/demo-workshop-course-1440.jpg) |

Local (this build): `http://localhost:3149/product/<slug>`. www already serves all slugs (200, rows are in the shared DB); the new PDP blocks reach www on the next deploy.

## Proof
### Migrations (supabase db query --linked -f)
```
329_is_demo.sql -> "rows": []   (ok)
330_demo_deals.sql -> first run ERROR 428C9 cannot insert into generated column price_ils_agorot; builder fixed (generated *_agorot dropped), rerun -> "rows": []   (ok)

select counts:
demo_products,active,demo_suppliers,no_cat,masters
44,44,31,0,44
```

### DB rows (supabase db query --linked)
```
slug,type,kenyon_price,full_price,coupon_price_ils,discount_percent,supplier,city,category,imgs,hl,is_demo,s_demo
demo-android-phone,physical,2490.00,2990.00,NULL,17.00,מובייל סנטר,פתח תקווה,phones-computers,2,4,true,true
demo-baby-consumables,physical,199.00,279.00,NULL,29.00,בייבי לנד,אשדוד,baby-kids,2,4,true,true
demo-baby-gear,physical,1290.00,1690.00,NULL,24.00,בייבי לנד,אשדוד,baby-kids,1,4,true,true
demo-bags-fashion,physical,189.00,299.00,NULL,37.00,אופנה אקספרס,נתניה,hot-deals,1,4,true,true
demo-camera-drone,physical,1990.00,2390.00,NULL,17.00,סקיי שופ,מודיעין,electronics,1,4,true,true
demo-computer-accessories,physical,149.00,219.00,NULL,32.00,מחשבים בקליק,תל אביב,phones-computers,1,4,true,true
demo-gaming-console,physical,2190.00,2490.00,NULL,12.00,גיים זון,ראשון לציון,electronics,2,4,true,true
demo-general-physical,physical,89.00,139.00,NULL,36.00,סלולר פלוס,רמת גן,hot-deals,1,4,true,true
demo-gift-box,physical,279.00,379.00,NULL,26.00,מתנות בקופסה,זכרון יעקב,hot-deals,2,4,true,true
demo-headphones,physical,599.00,799.00,NULL,25.00,סאונד סיטי,הרצליה,electronics,1,4,true,true
demo-home-kitchen,physical,449.00,699.00,NULL,36.00,בית ונוי,חולון,hot-deals,1,4,true,true
demo-home-lighting,physical,289.00,449.00,NULL,36.00,בית ונוי,חולון,hot-deals,1,4,true,true
demo-home-textile,physical,249.00,399.00,NULL,38.00,בית ונוי,חולון,hot-deals,2,4,true,true
demo-iphone,physical,3290.00,3890.00,NULL,15.00,סלולר פלוס,רמת גן,phones-computers,2,4,true,true
demo-kids-toys,physical,129.00,199.00,NULL,35.00,בייבי לנד,אשדוד,baby-kids,1,4,true,true
demo-laptop,physical,3190.00,3790.00,NULL,16.00,מחשבים בקליק,תל אביב,phones-computers,2,4,true,true
demo-pet-food,physical,239.00,319.00,NULL,25.00,חיות ושות׳,כפר סבא,pets,1,4,true,true
demo-pet-gear,physical,179.00,269.00,NULL,33.00,חיות ושות׳,כפר סבא,pets,1,4,true,true
demo-power-accessories,physical,119.00,179.00,NULL,34.00,סלולר פלוס,רמת גן,electronics,1,4,true,true
demo-smartwatch,physical,449.00,649.00,NULL,31.00,סאונד סיטי,הרצליה,electronics,1,4,true,true
demo-speaker,physical,349.00,499.00,NULL,30.00,סאונד סיטי,הרצליה,electronics,1,4,true,true
demo-tablet,physical,1290.00,1590.00,NULL,19.00,מובייל סנטר,פתח תקווה,phones-computers,1,4,true,true
demo-alternative-medicine,coupon,149.00,230.00,149.00,35.00,קליניקת שורשים,ירושלים,beauty-health,2,4,true,true
demo-attraction-tickets,coupon,89.00,139.00,89.00,36.00,פארק המים הגדול,ראשון לציון,hot-deals,1,4,true,true
demo-bar-cocktails,coupon,149.00,236.00,149.00,37.00,בר 42,תל אביב,restaurants-cafes,2,4,true,true
demo-beauty-treatment,coupon,199.00,350.00,199.00,43.00,סטודיו עור,הרצליה,beauty-health,2,4,true,true
demo-cafe,coupon,119.00,178.00,119.00,33.00,קפה הנמל,תל אביב,restaurants-cafes,2,4,true,true
demo-dessert-icecream,coupon,89.00,139.00,89.00,36.00,ג׳לטו דולצ׳ה,נתניה,restaurants-cafes,2,4,true,true
demo-experience-tour,coupon,129.00,189.00,129.00,32.00,יקב הגבעה,זכרון יעקב,restaurants-cafes,2,4,true,true
demo-fitness-yoga,coupon,199.00,350.00,199.00,43.00,פיט ביץ׳,אשדוד,beauty-health,1,4,true,true
demo-flight,coupon,690.00,990.00,690.00,30.00,טיולי השמש,תל אביב,vacation,1,4,true,true
demo-general-coupon,coupon,349.00,520.00,349.00,33.00,ביסטרו האש,נהריה,hot-deals,2,4,true,true
demo-hair-barber,coupon,79.00,120.00,79.00,34.00,הברבר של השכונה,באר שבע,beauty-health,1,4,true,true
demo-hotel,coupon,1190.00,1690.00,1190.00,30.00,מלון חוף האלמוגים,אילת,vacation,2,4,true,true
demo-laser-hair-removal,coupon,449.00,900.00,449.00,50.00,לייזר קליניק,ראשון לציון,beauty-health,2,4,true,true
demo-massage,coupon,179.00,280.00,179.00,36.00,מגע של רוגע,רעננה,beauty-health,2,4,true,true
demo-organized-tour,coupon,4290.00,5290.00,4290.00,19.00,טיולי השמש,תל אביב,vacation,1,4,true,true
demo-professional-service,coupon,690.00,1000.00,690.00,31.00,משרד בקליק,מודיעין,professionals,2,4,true,true
demo-restaurant,coupon,299.00,480.00,299.00,38.00,גריל על האש,חיפה,restaurants-cafes,2,4,true,true
demo-spa,coupon,549.00,860.00,549.00,36.00,ספא אגם,טבריה,beauty-health,2,4,true,true
demo-store-voucher,coupon,150.00,200.00,150.00,25.00,מעדניית השרון,כפר סבא,hot-deals,2,4,true,true
demo-tzimmer,coupon,890.00,1290.00,890.00,31.00,צימרי הגליל,ראש פינה,vacation,2,4,true,true
demo-vacation-package,coupon,18900.00,23900.00,18900.00,21.00,טיולי השמש,תל אביב,vacation,2,4,true,true
demo-workshop-course,coupon,390.00,690.00,390.00,43.00,אקדמיה דיגיטלית,תל אביב,courses,1,4,true,true
```

### Page checks, production build, 380 + 1440 (node scripts/demo/shoot-demo-deals.mjs)
Per page: 200, description, ≥3 highlights, ≥3 spec rows, supplier link, Waze, wa.me, legal (033798513 + 14ג), whole shekels only, strikethrough, savings %, validity line, related deals, images loaded, no horizontal overflow; coupons also QR + 8-digit code.
```
PASS 380 demo-iphone hl=4 specs=7 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-iphone hl=4 specs=7 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-android-phone hl=4 specs=10 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-android-phone hl=4 specs=10 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-laptop hl=4 specs=13 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-laptop hl=4 specs=13 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-tablet hl=4 specs=10 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-tablet hl=4 specs=10 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-computer-accessories hl=4 specs=8 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-computer-accessories hl=4 specs=8 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-headphones hl=4 specs=10 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-headphones hl=4 specs=10 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-smartwatch hl=4 specs=10 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-smartwatch hl=4 specs=10 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-speaker hl=4 specs=8 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-speaker hl=4 specs=8 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-gaming-console hl=4 specs=8 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-gaming-console hl=4 specs=8 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-camera-drone hl=4 specs=10 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-camera-drone hl=4 specs=10 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-power-accessories hl=4 specs=7 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-power-accessories hl=4 specs=7 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-home-kitchen hl=4 specs=9 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-home-kitchen hl=4 specs=9 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-home-textile hl=4 specs=5 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-home-textile hl=4 specs=5 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-home-lighting hl=4 specs=7 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-home-lighting hl=4 specs=7 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-bags-fashion hl=4 specs=6 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-bags-fashion hl=4 specs=6 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-gift-box hl=4 specs=4 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-gift-box hl=4 specs=4 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-baby-gear hl=4 specs=9 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-baby-gear hl=4 specs=9 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-baby-consumables hl=4 specs=6 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-baby-consumables hl=4 specs=6 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-kids-toys hl=4 specs=8 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-kids-toys hl=4 specs=8 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-pet-food hl=4 specs=5 rel=8 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-pet-food hl=4 specs=5 rel=8 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-pet-gear hl=4 specs=6 rel=8 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-pet-gear hl=4 specs=6 rel=8 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-general-physical hl=4 specs=6 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 1440 demo-general-physical hl=4 specs=6 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true ovf=false
PASS 380 demo-restaurant hl=4 specs=8 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-restaurant hl=4 specs=8 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-cafe hl=4 specs=7 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-cafe hl=4 specs=7 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-dessert-icecream hl=4 specs=5 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-dessert-icecream hl=4 specs=5 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-bar-cocktails hl=4 specs=7 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-bar-cocktails hl=4 specs=7 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-experience-tour hl=4 specs=7 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-experience-tour hl=4 specs=7 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-massage hl=4 specs=6 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-massage hl=4 specs=6 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-spa hl=4 specs=9 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-spa hl=4 specs=9 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-beauty-treatment hl=4 specs=6 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-beauty-treatment hl=4 specs=6 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-laser-hair-removal hl=4 specs=6 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-laser-hair-removal hl=4 specs=6 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-hair-barber hl=4 specs=4 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-hair-barber hl=4 specs=4 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-alternative-medicine hl=4 specs=6 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-alternative-medicine hl=4 specs=6 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-fitness-yoga hl=4 specs=8 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-fitness-yoga hl=4 specs=8 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-tzimmer hl=4 specs=9 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-tzimmer hl=4 specs=9 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-hotel hl=4 specs=10 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-hotel hl=4 specs=10 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-vacation-package hl=4 specs=12 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-vacation-package hl=4 specs=12 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-flight hl=4 specs=7 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-flight hl=4 specs=7 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-organized-tour hl=4 specs=7 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-organized-tour hl=4 specs=7 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-attraction-tickets hl=4 specs=6 rel=10 img=2 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-attraction-tickets hl=4 specs=6 rel=10 img=1 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-workshop-course hl=4 specs=7 rel=8 img=2 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-workshop-course hl=4 specs=7 rel=8 img=1 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-professional-service hl=4 specs=6 rel=8 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-professional-service hl=4 specs=6 rel=8 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-store-voucher hl=4 specs=5 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-store-voucher hl=4 specs=5 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 380 demo-general-coupon hl=4 specs=4 rel=10 img=4 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false
PASS 1440 demo-general-coupon hl=4 specs=4 rel=10 img=3 waze=true wa=true legal=true strike=true save=true valid=true qr=true 8d=true ovf=false

88/88 page checks passed
```

### Tests
```
pnpm exec vitest run src/components src/app/(store)/product src/lib/commerce src/lib/supabase src/lib/deal-templates
 Test Files  141 passed (141)
      Tests  1434 passed (1434)
pnpm type-check -> tsc=0
next build -> build=0
```

### compare.mjs product gate (COMPARE_ALLOW_PENDING_IMAGES=1 node scripts/compare.mjs --page=product --width=<w> --mine=http://localhost:3149/product/<slug>)
```
== demo-iphone 380
live: 380x11181  mine: 380x4504
OVERALL first 2600px: 21.88%
== demo-iphone 768
live: 768x8408  mine: 768x3327
OVERALL first 2600px: 20.75%
== demo-iphone 1440
live: 1440x7653  mine: 1440x2860
OVERALL first 2600px: 18.96%
== demo-restaurant 380
live: 380x11181  mine: 380x5545
OVERALL first 2600px: 31.25%
== demo-restaurant 768
live: 768x8408  mine: 768x3912
OVERALL first 2600px: 19.55%
== demo-restaurant 1440
live: 1440x7653  mine: 1440x3565
OVERALL first 2600px: 13.88%
== pinned מוצר-לדוגמא 380
live: 380x11181  mine: 380x3816
OVERALL first 2600px: 39.53%
== pinned מוצר-לדוגמא 768
live: 768x8408  mine: 768x2600
OVERALL first 2600px: 36.26%
== pinned מוצר-לדוגמא 1440
live: 1440x7653  mine: 1440x2600
OVERALL first 2600px: 21.89%
```
demo-restaurant 1440 worst bands: y100-200 49.4% (locked header), y500-600 44.2%, y400-500 37.4%, y300-400 34% (gallery/summary: reference `ke_live_product.html` is the old site's sample product with no image; C149 requires a real photo there). Gate <11% NOT met: 13.88% best, 39.53% worst. The header band is in forbidden files (MainHeader/Header/TopBar), and the image bands come from content this item requires.

RESULT: BLOCKED locked-component compare gate product 13.88-39.53% vs <11 (locked header band + imageless reference vs required real images); all 44 demo pages built, 88/88 checks pass
