# C02 — Electro v7 product page parity

Result: BLOCKED gate-fail. No page code was changed.

## Path note
The task names `apps/web/app/(shop)/product/[slug]/page.tsx`; it does not exist. The product route is
`src/app/(store)/product/[slug]/page.tsx` (364 lines). It is not a locked file.

## What the page already has
Breadcrumbs, gallery, price/old price, variants, CTA (ProductInfo), description/shipping/supplier band,
related products. Reference is `refs/electro-product-fresh.html` (+ PNG/computed JSON at 380/768/1440).

## Measured 2026-10-29 (dev :3000, 200)
`compare.mjs --page=product --width=W --live=file://refs/electro-product-fresh.html`
(COMPARE_ALLOW_GRID_MISMATCH=1 COMPARE_ALLOW_PENDING_IMAGES=1, indicative only), first 2600px:

| width | diff | gate |
|---|---|---|
| 380 | 35.07% | fail (<11%) |
| 768 | no OVERALL line printed on the re-run; first run showed 11-92% bands | fail |
| 1440 | 19.95% (first run crashed: browser closed mid-shot) | fail |

Earlier runs today (M02-c266): 23.33 / 21.93 / 16.5. Run-to-run spread is large because dev compiles on
demand, so these numbers are noisy.

Lighthouse mobile /product from earlier items: 65-86, median ~85 (LCP 4.2-4.4s). Below the >=90 gate.
Not re-run here.

## Why it is blocked
1. `SUPABASE_SERVICE_ROLE_KEY` is rejected by the project (HTTP 401, env.probe_failed), and CMS reads
   fail with "Invalid API key". Real catalogue data and images do not load, so the grid count and image
   boxes differ from the reference. A pixel gate cannot be met until the key is replaced (C51 recovery).
2. Mobile LCP is 4.2s+ on image-bound content; the gate needs it under ~3s.
3. The reference has a different grid count than our related-products block (grid-mismatch override
   needed on every run).

## Also noted
`<Reviews>` (review submission) is still rendered by this page. Brand rules say no reviews UI. It was
left in place because removing it is outside a parity rebuild that cannot pass; flag for a follow-up item.

No forbidden files edited. No migrations. No money code touched.
