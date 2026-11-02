# C174 PRODUCT PAGE (2026-11-03)

RESULT: BLOCKED supabase-down C174

## Item
"PRODUCT PAGE: text + images from refs/ke_live_singlefile.html, layout per
refs/PRODUCT-PAGE-SPEC.md and Electro single-product. Include supplier block,
QR + 8-digit redeem, Hebrew wa.me, legal block, savings percent."

## What the page already ships (audited, no code change needed)
All five required blocks are in `src/app/(store)/product/[slug]/page.tsx`:

| block | where |
|---|---|
| supplier block | `SupplierInfo` inside `<details>` "פרטי הספק", page.tsx:409-417, every product |
| QR + 8-digit redeem | `CouponQrExpiry`, page.tsx:360; copy at `CouponQrExpiry.tsx:79-80`: "בשובר מופיעים קוד QR חתום וקוד מימוש בן 8 ספרות" |
| Hebrew wa.me | `SupplierInfo` (prefilled with `productName`), `ProductQuestionLink`, `share-buttons`; number normalised to 972 in `src/lib/supplier-contact.ts` |
| legal block | `ProductLegal`, "מידע לצרכן ותנאי ביטול" (seller, validity, 14ג cancellation, returns), page.tsx:427 |
| savings percent | `discountPercent` in `ProductGallery.tsx:40` (badge) and `CouponPricing.tsx:53` |

Text and images are DB rows (`products`, `product_images`, `suppliers`), not
code, so "from ke_live_singlefile.html" is a catalogue matter, not a page edit.

```
$ pnpm exec vitest run SupplierInfo CouponQrExpiry ProductDealDetails ProductInfo ProductGallery CouponPricing ProductQuestionLink
 Test Files  5 passed (5)
      Tests  51 passed (51)
   Start at  05:17:56
```

## Why blocked
The gate (compare.mjs product at 380/768/1440 against
`refs/electro_product_{width}.png`) needs `pnpm start` on a fresh
`pnpm build`, and the build prerenders from production Supabase. Postgres and
PostgREST were both UNHEALTHY for the whole item. Other hosts answered.

```
$ curl .../v1/projects/ixvwfbuvfxxsjiywhbbb/health?services=db&services=rest
05:16:44 [{"name":"db","healthy":false,"status":"UNHEALTHY","error":"Service health check failed"},{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"}]
$ 30 s poll, waiting for 3 healthy in a row (db rest)
05:18:15 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:18:57 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:19:39 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:20:20 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:21:02 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:21:43 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:22:25 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:23:07 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:23:52 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:24:34 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:25:15 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:25:57 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:26:40 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:27:21 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:28:03 "status":"UNHEALTHY" "status":"UNHEALTHY"
05:28:24 [{"name":"db","healthy":false,"status":"UNHEALTHY",...},{"name":"rest","healthy":false,"status":"UNHEALTHY",...}]
$ curl -s -o /dev/null -w "github %{http_code}" https://api.github.com
github 200
```

C173 recorded the same build failure (503 / PGRST002 while collecting page
data) at 05:03 and 05:15. A build was not attempted again into a known-down DB.

Last measured product gate (docs/UI-PARITY-REPORT.md, 2026-11-02 15:21-15:25,
`6fe8c0ca5-dirty`): 6.40% / 4.22% / 3.25% PASS at 380 / 768 / 1440. That run
was on a dirty tree before HEAD, so it does not count as proof for this item.

No code changes; no forbidden files touched.

RESULT: BLOCKED supabase-down C174
