# C108 — SEO + accessibility

Most of this item was already shipped in earlier cycles. C108 verified each piece and closed the gaps.

| Requirement | State | Where |
|---|---|---|
| Product + Offer JSON-LD per product page | existed | `src/lib/seo/json-ld.ts` `buildProductJsonLd`, used in `src/app/(store)/product/[slug]/page.tsx` |
| No AggregateRating | **hardened**: the `rating` input and the `aggregateRating` branch are removed, so it cannot be emitted | `json-ld.ts` |
| LocalBusiness per business page | existed | `buildLocalBusinessJsonLd`, `src/app/(store)/s/[id]/page.tsx` |
| Dynamic sitemap.xml | existed | `src/app/sitemap.ts` (+ test) |
| robots.txt | existed: `allow: /` for all agents. Private paths (`/account`, `/admin`, `/redeem`, `/coupon`, `/api`, ...) stay disallowed on purpose, since they are voucher tokens and sessions | `src/app/robots.ts` |
| 301 redirects, old WP slugs | **map file added** at `docs/redirects.map.ts`; `src/lib/seo/wp-legacy.ts` now reads it. Added `/cart-2`, `/checkout-2`, `/terms-and-conditions`, `/privacy-policy`, `/refund_returns`, `/cancellation-policy` (these were 308 in next.config; the proxy now answers 301 first) | proxy → `seo_redirects` table → map |
| Skip-to-content | existed | `src/components/a11y/SkipLink.tsx`, target `#main-content` |
| focus-visible rings | existed, guarded by `src/styles/focus-visible.test.ts` | `globals.css` |
| Keyboard-only flow | e2e specs exist: `e2e/keyboard-navigation.spec.ts`, `a11y.spec.ts` | **not run in C108** |

## Not done / caveats
- Playwright a11y/keyboard specs and the compare.mjs gate were not run. No markup or CSS changed, so the visual gate is unaffected.
- Contrast and aria-label coverage were not re-audited. See `docs/A11Y-SWEEP-REPORT.md` for the last sweep.
- `buildProductJsonLd` still takes shekel floats (`priceIls`) and formats them with `toFixed(2)`. It's display-only and predates this item. Converting it to agorot via `src/lib/money.ts` is a follow-up.
- Forbidden files: none touched.

## Tests
`vitest run src/lib/seo src/app/sitemap.test.ts src/app/robots.test.ts src/styles`: 157 pass. `tsc` reports no errors in the touched files.
