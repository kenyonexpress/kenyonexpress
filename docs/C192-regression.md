# C192 FINAL REGRESSION: Playwright on the production URL

Measured 2026-11-03, 06:00-07:01 UTC, closeout/v1-final. Outputs copied from the terminal.

RESULT: BLOCKED prod Turnstile rejects headless sign-in by design, and a 2172-test pass takes about 6 h on this link, so two consecutive green passes cannot be produced honestly

## What this item found and fixed first: production was stuck on a day-old build

Run 1 against production failed on a11y defects that HEAD had already fixed
(`efc401580`, hot-coupon contrast). Production was serving a deploy from
2026-11-02 08:04 +07, and every deploy since then had failed:

```
$ vercel inspect https://kenyonexpress-bay6rf359-kenyonexpress-projects.vercel.app --logs
Error: Module not found: Can't resolve '../../../docs/redirects.map'
Error: Module not found: Can't resolve '../../../refs/electro-checkout-text.json'
Error: [BUILD_UTILS_SPAWN_1] Command "pnpm build" exited with 1
```

Cause: `243c52522` added `/refs/` and `/docs/` to `.vercelignore`, and the build
imports one file from each (`src/lib/checkout/electro-content.ts`,
`src/lib/seo/wp-legacy.ts`). `pnpm build` stayed green locally because the
files are on disk.

Fix: `c1053be84` + `40fef5311`. The rules are now `/refs/*` + `!/refs/electro-checkout-text.json`
and `/docs/*` + `!/docs/redirects.map.ts`, and there is a new gate
`src/__tests__/vercelignore-keeps-build-imports.test.ts`. It derives every
relative import that leaves `src/` and checks it with `git check-ignore`:

```
old .vercelignore:  Tests  1 failed | 2 passed (3)
new .vercelignore:  Tests  3 passed (3)
```

Git preview of 40fef5311: `kenyonexpress-ebv0pjqd9` ● Ready, 2m.

CLI uploads from this hotspot failed twice (`Error: fetch failed`, 896.9MB from
the working tree, then 46.4MB from a clean `git archive`). The third route
rebuilt the git-sourced preview with the production target, so nothing was uploaded:

```
$ vercel redeploy https://kenyonexpress-ebv0pjqd9-kenyonexpress-projects.vercel.app --target=production
  Production      https://kenyonexpress-gojm0taal-kenyonexpress-projects.vercel.app
▲ Aliased         https://www.kenyonexpress.co.il
✓ Ready in 2m

api.vercel.com/v13/deployments: dpl_EcdU7yVeAzvBovipjTAoBXTE4AMm production READY 40fef53116940c02f9db3521cc1dae4694b4b796 closeout/v1-final
www + vercel.app both serve dpl=dpl_EcdU7yVeAzvBovipjTAoBXTE4AMm
/api/health {"ok":true,"database":"ok","search":"not_configured","latency_ms":363}
/ 200   /checkout 200   /product/אייפון-13 200   /c 200
```

Rollback target, if needed: `dpl_GdcJPfgRRWLQGmfGt9KWWZ4PQXp3` (the 02.11 build).

## Scope of the regression run

The repo's own classification (`e2e/database-need.ts`) says the order, refund,
voucher and admin specs "must not point at a live commerce database". The prod
run is therefore the 24 `NO_DATABASE_SPECS` + `production-smoke` + `search`
(read-only), over all six projects:

```
$ E2E_BASE_URL=https://kenyonexpress.vercel.app playwright test --list <26 anchored files>
Total: 2172 tests in 26 files
```

It ran against the `vercel.app` alias, which serves the same deployment id as
www and sits outside the custom domain's Security Checkpoint.

## Run 1 on the fresh deploy (4 workers): stopped at 72/2172, 6 failed

```
[72/2172]
1) [chromium-380] a11y.spec.ts:380 product pages ... the first product in the catalogue   -> page.goto: Test timeout of 30000ms exceeded
2) [chromium-380] a11y.spec.ts:485 the checkout wizard, step by step                    -> add-to-cart did not stick: the header badge went 0 -> 0. No error toast
3) [chromium-380] a11y.spec.ts:760 account pages ... account overview                   -> page.waitForURL: Timeout 45000ms exceeded (auth-session.ts:55)
4) [chromium-380] a11y.spec.ts:773 account pages ... orders page                        -> same
5) [chromium-380] a11y.spec.ts:786 account pages ... wallet page                        -> same
6) [chromium-380] a11y.spec.ts:799 account pages ... coupons page                       -> same
```

Failures 3-6: the login screenshot shows `אימות האנושיות נכשל. נסו שוב.`
Production Turnstile refuses headless Chromium. That is the bot defence working,
not a regression. Making it pass would mean a captcha bypass in production auth,
which this item will not add.

Failure 1: the same page answers fine by curl (`200 ttfb=0.92-1.51 total=1.9-2.8s`).
The 30 s budget runs out on asset loading over the link (ping avg 527-644 ms).

Failure 2 is not the limiter:

```
$ supabase db query --linked "select * from rate_limits where key like 'cart_write:ip:203.159.81.237%'"
  "attempts": 3, "key": "cart_write:ip:203.159.81.237", "window_start": "2026-11-03 06:54:29.723119+00"
```

## Isolated cart probe, serial, chromium-1440

```
$ E2E_WORKERS=1 E2E_BASE_URL=https://kenyonexpress.vercel.app playwright test /production-smoke.spec.ts /cart.spec.ts --project=chromium-1440
  2 failed
    [chromium-1440] cart.spec.ts:38:7 add to cart from product page then see it in the cart
    [chromium-1440] cart.spec.ts:74:7 lowering the quantity puts the badge back
  2 skipped
  10 passed (3.7m)
```

Both production-smoke tests passed: a guest puts a real product in the cart and
reaches the checkout form. The other cart adds in the same file passed. The two
failures are the same "0 -> 0, no toast" with no limiter hit, so the click
landed before the client was ready on this link. Same build, intermittent:
this is flake, not a broken path.

## Throughput

On the stale build at 2 workers: 29 tests in about 6 min. On the fresh build at
4 workers: 72 in about 12 min. Either way that is about 6 h per 2172-test pass,
or 12 h or more for two consecutive green passes, and any red restarts the count.

## Verdict

Not DONE. The gate is "2x consecutive green, zero flaky" on prod, and this run
has deterministic Turnstile reds (by design) plus link-driven flakes. Shipped
along the way: production is current again (40fef5311), and the deploy-breaking
`.vercelignore` is gated. The prod-safe subset needs a fast link, a
non-Turnstile origin for the sign-in specs (the staging branch build in
`STATE.md`), or both.

tsc 0, lint 0, pnpm test: Test Files 876 passed | 3 skipped (879), Tests 9674 passed | 39 skipped (9713).
