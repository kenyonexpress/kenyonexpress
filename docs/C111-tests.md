# C111 - E2E + Lighthouse

Status: **BLOCKED** (gates not met, see below). Specs are written and committed; the CI-green and Lighthouse gates are not met.

## Playwright specs

| Journey | Spec | Needs DB | Local result (prod build, chromium-1440) |
|---|---|---|---|
| Guest coupon checkout | `e2e/full-purchase-redeem.spec.ts` (existing: guest cart, auth gate, mock pay, voucher, redeem) | yes | not runnable: fixture users not seeded in the reachable DB |
| Guest physical checkout | `e2e/c111-guest-physical-checkout.spec.ts` (new: shipping form, no billing, pay press) | yes | skipped (fixture missing) |
| Supplier apply | `e2e/c111-supplier-apply.spec.ts` (new, POST intercepted, nothing written) | no | **passed** |
| Admin product upload | `e2e/c111-admin-product-upload.spec.ts` (new, stages an image, Hebrew alt required, nothing uploaded) | yes | skipped (`E2E_ADMIN_PASSWORD` unset) |
| Passkey login | `e2e/c111-passkey-login.spec.ts` (new, CDP virtual authenticator: register, sign out, sign in, remove) | yes | failed at the email sign-in step; the pre-existing `physical-purchase.spec.ts` fails at the same step, so the fixture customer does not exist in this database |

All four new files are named in `e2e/database-need.ts`; `src/__tests__/e2e-classification.test.ts` passes (39/39).

## 2 consecutive green CI builds: NOT MET

- The `e2e` job in `.github/workflows/ci.yml` skips unless `CI_SUPABASE_URL` is set. `gh secret list` shows only `CRON_SECRET`; there is no disposable CI database, and `pnpm seed:test` writes to whatever it is pointed at (the only reachable one is production), so I did not seed it.
- The `e2e-no-database` job runs only the no-DB list. Only `c111-supplier-apply` joins it. A "green" there would not exercise four of the five journeys, so it is not counted as meeting this gate.
- CI history on `closeout/v1-final` at the time of writing: latest runs cancelled or failed (superseded by pushes), none two-in-a-row green.

## Lighthouse (mobile, local `next start` on a build from 17:58, 3 runs each)

| Page | Performance | Accessibility | Best practices | SEO | LCP |
|---|---|---|---|---|---|
| Home `/` | 83 / 85 / 80 | 100 | 96 | 100 | 4.1-5.1 s |
| Product `/product/עוזרת-אישית-שירותי-משרד` | 81 / 82 / 87 | 100 | 96 | 100 | 3.9-4.7 s |
| Checkout `/checkout` | not measured with a cart. An empty cart redirects to `/cart`, which scored 55 / 100 / 96 / 69 and is not the checkout page. | | | | |

Gate (>= 90 on all four categories for home, product, checkout): **NOT MET**. Performance is 80-87 on home and product, and checkout was not measured.

Notes:
- The LCP element on home is the cookie-consent paragraph (`ConsentBanner.tsx`), which is a deliberate design (see the comment in that file). Earlier samples in `docs/LIGHTHOUSE-STATUS.md` (2026-10-28/29) measured 94-99 on the same pages, so this is either a regression since then or measurement noise on a loaded laptop. I did not rebuild and re-measure.
- SEO 69 on `/cart` is expected (noindex).
- Lighthouse for checkout needs a guest cart cookie injected into the run; not done.

## What would close this item
1. A disposable Supabase project with `CI_SUPABASE_URL`, `CI_SUPABASE_ANON_KEY`, `CI_SUPABASE_SECRET_KEY` and `E2E_ADMIN_PASSWORD` as repo secrets, then two consecutive pushes with the `e2e` job green.
2. Rebuild, re-run `scripts/lighthouse-mobile-desktop.mjs` style runs on a quiet machine, with a cart cookie for `/checkout`.
