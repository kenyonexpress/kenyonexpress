# C121 — Console errors zero (2026-11-01)

Pages: `/`, `/product/אוזניות-איירפודס-3` (first `active` product; the first row by created_at, `samsung-galaxy-s24`, is `draft` and 404s by design), `/c/hot-deals` (307 -> `/category/hot-deals`), `/cart`, `/checkout`. Viewports 380 and 1440. Playwright captures `console.error`, `pageerror`, `requestfailed`, HTTP >= 400.

## Before

| Target | Result |
|---|---|
| Live www (prod build, real CSP) | `/` at 380 and 1440: 3 errors each: React error #418 (hydration HTML mismatch), `/monitoring` (Sentry tunnel) HTTP 429 (+ its console line). Other 4 pages: 0 / 0. |
| Local HEAD, `next dev` :3121 | 0 real errors. Only dev-mode artifacts: `eval() is not supported` (dev React needs unsafe-eval), `/api/cart` ERR_ABORTED (StrictMode double-effect aborts the first CartBootstrap fetch), RSC prefetch ERR_ABORTED. No missing images, no hydration warnings, no CSP blocks. |

## After

No code changed. Not at zero on live `/`.

## Why not fixed

- #418 on live `/` does not reproduce on HEAD in dev, so no root cause can be pinned to a HEAD file. Non-minified message is unavailable on prod. SSR-vs-DOM text diff shows only client-inserted `תפריט` (header, locked), `סוף שבוע`, `משלוח חינם` (DealChips), plus nbsp serialization noise. Candidates sit in or beside locked components.
- The 429 on `/monitoring` is Sentry's tunnel rate-limiting the #418 reports; it clears when #418 does.
- Prod verification of HEAD is impossible: `pnpm build` fails type-check on HEAD (merge 788c1af1a lost definitions): `getSupplierMemberships` (redeem/route.ts), `CONSENT_GRANTED_EVENT` not exported (ThirdPartyTags.tsx), `upsertProductNoRedirect`/`createAdminClient`/`log` (product-import.ts), `UpsertOptions`/`REDIRECT_AFTER_UPSERT` (products.ts), `getSupabaseFlags` (checkout.ts), `readAttributionSnapshot` not exported (track.ts), `liveChargeAllowed` (card-verification.ts). Parent `788c1af1a^1` has the good versions; repair is a separate item.

Scripts: /tmp/c121/crawl.mjs, diff.mjs (not committed).
