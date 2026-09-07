# W14 Internal links

Code-agent spec. SEO crawl paths, not a new sitemap generator (feeds already: `/feed.xml`, `/merchant.xml`).

---

## What the wave builds

1. Category ↔ product ↔ supplier ↔ city links that match live WP information architecture where this tree already copied it.
2. `seo_redirects` for leftover WordPress URLs (proxy already redirects GET/HEAD only; POST is not redirected).
3. Noindex on account, scan, checkout, wishlist, offline.

---

## Tables

`seo_redirects`, `categories`, `products`.

---

## RLS

Redirects: public SELECT of published rows. Writes admin only.

---

## Money invariants

Merchant feed prices must be the sellable integer agorot path (`src/lib/feeds/merchant.ts`). Coupon: on-site price. Unsellable rows omitted.

---

## Tests

`src/lib/feeds/merchant.test.ts`, `rss.test.ts`, `src/lib/seo/normalize-path.test.ts`. Redirect loop test. POST `/api/payments/cardcom/webhook` never matches a WP redirect.

---

## Feature flag

None.

---

## Close

Sitemap URLs 200 or 301 to canonical. Payment POST still hits Next.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
