# W27 SEO

Code-agent spec. Sitemap, JSON-LD, merchant feed, OG (W12 leftover). `noindex` account/scan/checkout/wishlist/offline.

---

## What it builds

1. Canonical legal vs store aliases without duplicate-content wars (`hreflang` he-IL only until W10).
2. Merchant feed sellable agorot, omit unsellable.
3. WP redirects GET/HEAD only. POST webhook never redirected.
4. No `aggregateRating` until W03 has published rows.

---

## Tables

`seo_redirects`, `products`, `categories`.

---

## RLS

Public redirects published only.

---

## Money invariants

Feed price = sellable on-site, coupon absolute. No face as price.

---

## Tests before close

`feeds/merchant.test.ts`, `rss.test.ts`, `normalize-path.test.ts`, architecture test no aggregateRating.

---

## Feature flag

None.

---

## Docs updated

`INTERNAL-LINKS` leftover, `CUSTOMER-FAQ` no.

---

## Edge cases

32 product images still on `kenyonexpress.co.il/wp-content` until R2 pull (DNS last).

---

## Hebrew UX strings

Titles/descriptions stay Hebrew. No English title tags at launch.

---

## Open questions

| Q | Best answer |
|---|---|
| Index `/search`? | **noindex** or canonical to queryless? Prefer noindex for empty/query pages. |

---

## Second pass (JSON-LD)

- `aggregateRating` off until published reviews exist (W03 + H6).
- Wishlist `/wishlist` noindex (W04). Account noindex.
- Titles Hebrew. og:locale `he_IL`.
- Do not index the ₪1 master as a deal. Canonical PDP only for `active` and not deleted.

