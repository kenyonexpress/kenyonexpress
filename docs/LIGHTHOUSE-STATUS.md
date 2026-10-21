# Lighthouse CI Status Report

**Last Updated:** 2026-10-21 20:06 UTC (MAINTENANCE_LOOP_7, sixteenth pass)
**Measurement Method:** `LHCI_BASE_URL=http://localhost:3411 COMPARE_PRODUCT_SLUG=<slug> pnpm lhci:autorun`
(`@lhci/cli` 0.15.1 via `pnpm dlx`, Lighthouse 12.6.1, Chrome 155, `desktop` preset, 3 runs per URL, lhci median)
**Build:** commit `c6bd2d58a` (clean tree, no `src/` change since the fifteenth pass's `32a68832c`; `git log 32a68832c..c6bd2d58a -- src/ next.config.ts package.json` is empty and the eleven commits between touch only `STATE.md`, `docs/` and `logs/`), **cold** `pnpm build` exit 0 with `.next/cache/turbopack` moved to `/tmp/ke-lh16/` first, BUILD_ID `JHpX1BqW0nQ3rr5TdjYR2`, 311 static pages, `pnpm gate:chunks` clean on 243 prerendered pages before the server started, served by `pnpm start` from this worktree on port 3411 (listener pid 63223, cwd verified by `lsof` as this checkout, BUILD_ID present once in the served home HTML, port had 0 listeners beforehand, killed by pid afterwards and the port confirmed closed). `pnpm type-check` and `pnpm lint` ran clean after the measurement, not during it.
**Reports:** `.lighthouseci/reports/` (git-ignored, nothing uploaded; the 18:34 reports were moved to `/tmp/ke-lh16/prev-reports` so the manifest holds only this pass)

## Summary

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 99** on the representative runs (target ≥ 90); the nine individual runs are 98 to 99
✅ **Accessibility 100** in all nine runs (target ≥ 90), fourteenth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|----------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.5 s | 1.0 s | 0 ms | 0.010 | ✅ PASS |
| `/products` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.006 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.019 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in chronological order. Metrics are from the representative run.

No weighted audit below 0.9 in any category except `errors-in-console` under Best Practices (weight 1), which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on the https prefetch of `/login?next=/account/wishlist` against the plain-http localhost origin), checked item by item on all nine reports with the category `auditRefs` weights. No `/_next/*` request failed on any page; the only failed requests on all nine runs are the two `/_vercel/*` scripts and that one https prefetch (listed twice in the network table as two requests to one URL). Zero `runWarnings` on all nine reports.

Against the 18:34 pass: `/` 99 unchanged (its three runs read 99, 99, 99 against 99, 99, 98), `/products` moved 98 to 99 on the representative run (98, 99, 99 against 98, 99, 100), the product page moved 99 to 98 (98, 99, 98 against 99, 99, 98). **No `src/` commit landed in between**, so this is the same tree inside the localhost band described in `docs/PERFORMANCE-BUDGET.md`; the two one-point moves cancel and every individual run is 98 or 99. LCP 1.0 / 0.9 / 1.1 s on the representative runs (the nine runs span 0.8 s to 1.1 s), against 1.0 / 1.0 / 0.9 s; FCP 0.5 s on the `/` representative run against 0.5 s, 0.4 s everywhere else; TBT 0 ms in all nine runs; CLS 0.010 / 0.006 / 0.019 against 0.021 / 0.018 / 0.019, the per-run toss between two layout states the thirteenth pass described (the three `/` runs read 0.021, 0.010, 0.010 and the three `/products` runs 0.006, 0.018, 0.006 this time), all far under the 0.1 good threshold. The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for a ninth consecutive pass. Wall time for the nine runs 2 min 33 s (20:03:06 to 20:05:39 UTC, including the `pnpm dlx` resolve). The build log's 46 `reviews.read_failed 42501` lines and four Partner API bail-out lines are the documented pre-existing build-time noise (`docs/MAINT-LOG.md`), build exit 0.

## Previous pass (2026-10-21 18:34 UTC, MAINTENANCE_LOOP_7, fifteenth pass)

Build: commit `32a68832c`, BUILD_ID `zIrfmtc1R4HbtK0Z0ohz5` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages, served on port 3401).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 99** on the representative runs (target ≥ 90); the nine individual runs are 98 to 100
✅ **Accessibility 100** in all nine runs (target ≥ 90), thirteenth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|----------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.5 s | 1.0 s | 0 ms | 0.021 | ✅ PASS |
| `/products` | 98 (98, 99, 100) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.018 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (99, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in chronological order. Metrics are from the representative run.

No weighted audit below 0.9 in any category except `errors-in-console` under Best Practices (weight 1), which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on the https prefetch of `/login?next=/account/wishlist` against the plain-http localhost origin), checked item by item on all nine reports with the category `auditRefs` weights. No `/_next/*` request failed on any page; the only failed requests on all nine runs are the two `/_vercel/*` scripts and that one https prefetch (listed twice in the network table as two requests to one URL).

Against the 17:12 pass: `/` 99 unchanged (its three runs read 99, 99, 98 against 99, 99, 100), `/products` moved 99 to 98 on the representative run while its three runs read 98, 99, 100 against 99, 99, 99 (the 100 is the second one since the ninth pass), the product page 99 unchanged (99, 99, 98 against 98, 99, 99). **No `src/` commit landed in between**, so this is the same tree inside the localhost band described in `docs/PERFORMANCE-BUDGET.md`. LCP 1.0 / 1.0 / 0.9 s on the representative runs (the nine runs span 0.8 s to 1.1 s), against 0.9 / 0.9 / 0.9 s; FCP 0.5 s on the `/` representative run against 0.4 s, 0.4 s everywhere else; TBT 0 ms in all nine runs; CLS 0.021 / 0.018 / 0.019 against 0.010 / 0.006 / 0.019, which is the per-run toss between two layout states the thirteenth pass described (the three `/` runs read 0.021, 0.021, 0.010 this time), all far under the 0.1 good threshold. The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for an eighth consecutive pass. Wall time for the nine runs 2 min 29 s (18:32:18 to 18:34:47 UTC, including the `pnpm dlx` resolve). The build log's `reviews.read_failed 42501` and Partner API bail-out lines are the documented pre-existing build-time noise (`docs/MAINT-LOG.md`), build exit 0.

## Previous pass (2026-10-21 17:12 UTC, MAINTENANCE_LOOP_7, fourteenth pass)

Build: commit `f618f1080`, BUILD_ID `tCyaHvVXOURQNeBcK-qjc` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages, served on port 3391).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 99** on all three representative runs (target ≥ 90); the nine individual runs are 98 to 100
✅ **Accessibility 100** in all nine runs (target ≥ 90), twelfth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|----------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 100) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.010 | ✅ PASS |
| `/products` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.006 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in chronological order. Metrics are from the representative run.

No weighted audit below 0.9 in any category except `errors-in-console` under Best Practices (weight 1), which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on the https prefetch of `/login?next=/account/wishlist` against the plain-http localhost origin), checked item by item on all three representative reports with the category `auditRefs` weights. No `/_next/*` request failed on any page; the only failed requests on all three pages are the two `/_vercel/*` scripts and that one https prefetch (listed twice in the network table as two requests to one URL).

Against the 15:51 pass: `/` 99 unchanged, `/products` 99 unchanged, the product page moved 98 to 99 (its three runs read 98, 99, 99 against 99, 98, 98). **No `src/` commit landed in between**, so this is the same tree inside the localhost band described in `docs/PERFORMANCE-BUDGET.md`. LCP 0.9 s on all three representative runs (the nine runs span 0.7 s to 1.1 s), against 1.0 / 1.0 / 1.1 s; FCP 0.4 s and TBT 0 ms in all nine runs; CLS 0.010 / 0.006 / 0.019 against 0.021 / 0.018 / 0.019, which is the per-run toss between two layout states the thirteenth pass described (the three `/` runs read 0.010, 0.021, 0.010 and the three `/products` runs 0.018, 0.006, 0.006), all far under the 0.1 good threshold. The `/` third run scored 100, the first 100 since the ninth pass. The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for a seventh consecutive pass. Wall time for the nine runs 2 min 27 s (17:09:40 to 17:12:07 UTC, including the `pnpm dlx` resolve). The build log's `reviews.read_failed 42501` and Partner API bail-out lines are the documented pre-existing build-time noise (`docs/MAINT-LOG.md`), build exit 0.

## Previous pass (2026-10-21 15:51 UTC, MAINTENANCE_LOOP_7, thirteenth pass)

Build: commit `a138af7c5`, BUILD_ID `zv404qzyU-zyLLMF2iIy3` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages, served on port 3381).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 99** on the representative runs (target ≥ 90); the nine individual runs are 98 to 99
✅ **Accessibility 100** in all nine runs (target ≥ 90), eleventh consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|----------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.5 s | 1.0 s | 0 ms | 0.021 | ✅ PASS |
| `/products` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.018 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (99, 98, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.019 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in chronological order. Metrics are from the representative run.

No weighted audit below 0.9 in any category except `errors-in-console` under Best Practices (weight 1), which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on the https prefetch of `/login?next=/account/wishlist` against the plain-http localhost origin), checked item by item on all three representative reports with the category `auditRefs` weights. No `/_next/*` request failed on any page; the only failed requests on all three pages are the two `/_vercel/*` scripts and that one https prefetch (listed twice in the network table as two requests to one URL).

Against the 14:27 pass: `/` 99 unchanged, `/products` moved 98 to 99, the product page 98 unchanged. **No `src/` commit landed in between**, so this is the same tree inside the localhost band described in `docs/PERFORMANCE-BUDGET.md`. LCP 1.0 s on `/` and `/products`, 1.1 s on the product page, identical to the twelfth pass; FCP 0.5 s on `/` against 0.4 s; TBT 0 ms in all nine runs; CLS 0.021 / 0.018 / 0.019 against 0.010 / 0.006 / 0.007, the same values the eleventh pass recorded for `/` and `/products`, and all far under the 0.1 good threshold (the three `/products` runs read 0.018, 0.018, 0.006, so the layout shift is a per-run toss between two states, not a trend). The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for a sixth consecutive pass. Wall time for the nine runs 2 min 32 s (15:48:17 to 15:50:49 UTC, including the `pnpm dlx` resolve).

## Previous pass (2026-10-21 14:27 UTC, MAINTENANCE_LOOP_7, twelfth pass)

Build: commit `4177a590b`, BUILD_ID `oK6kDT4D5LdyHVHWebe1x` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages, served on port 3371).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 99** on the representative runs (target ≥ 90); the nine individual runs are 98 to 99
✅ **Accessibility 100** in all nine runs (target ≥ 90), tenth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|----------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.010 | ✅ PASS |
| `/products` | 98 (98, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.006 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.007 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in chronological order. Metrics are from the representative run.

No weighted audit below 0.9 in any category except `errors-in-console` under Best Practices (weight 1), which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on the https prefetch of `/login?next=/account/wishlist` against the plain-http localhost origin), checked item by item on all three representative reports with the category `auditRefs` weights. No `/_next/*` request failed on any page; the only failed requests on all three pages are the two `/_vercel/*` scripts and that one https prefetch (listed twice in the network table as two requests to one URL).

Against the 13:01 pass: `/` 99 unchanged, `/products` moved 99 to 98, the product page 98 unchanged. **No `src/` commit landed in between**, so this is the same tree inside the localhost band described in `docs/PERFORMANCE-BUDGET.md`. LCP 1.0 s on `/` and `/products`, 1.1 s on the product page, FCP 0.4 s and TBT 0 ms in all nine runs, CLS 0.010 / 0.006 / 0.007 (all far under the 0.1 good threshold). The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for a fifth consecutive pass. Wall time for the nine runs 2 min 27 s (14:24:45 to 14:27:12 UTC).

## Previous pass (2026-10-21 13:01 UTC, MAINTENANCE_LOOP_7, eleventh pass)

Build: commit `a41d6a005`, BUILD_ID `ssCwFEP6KVH1qXJjDI-ps` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages, served on port 3361).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 99** on the representative runs (target ≥ 90); the nine individual runs are 98 to 99
✅ **Accessibility 100** in all nine runs (target ≥ 90), ninth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|----------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.021 | ✅ PASS |
| `/products` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.018 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.007 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in chronological order. Metrics are from the representative run.

No weighted audit below 0.9 in any category except `errors-in-console` under Best Practices (weight 1), which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on the https prefetch of `/login?next=/account/wishlist` against the plain-http localhost origin), checked item by item on all three representative reports with the category `auditRefs` weights. No `/_next/*` request failed on any page; the only failed requests on all three pages are the two `/_vercel/*` scripts and that one https prefetch (listed twice in the network table as two requests to one URL). The unweighted diagnostics at 0.5 or 0 (`uses-long-cache-ttl`, `render-blocking-resources`, `unused-javascript`, `dom-size`, the `*-insight` rows) carry weight 0 and do not move the score.

Against the 11:38 pass: `/` 99 unchanged, `/products` moved 98 to 99, the product page 98 unchanged. **No `src/` commit landed in between**, so this is the same tree inside the localhost band described in `docs/PERFORMANCE-BUDGET.md`. LCP on `/` is 1.0 s again, FCP and TBT unchanged, CLS on `/` 0.021 against 0.010 (both far under the 0.1 good threshold, and the three home runs agree on 0.021). TBT was 0 ms in all nine runs. The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for a fourth consecutive pass.

## Previous pass (2026-10-21 11:38 UTC, MAINTENANCE_LOOP_7, tenth pass)

Build: commit `a24964753`, BUILD_ID `qw6qJEGvOLDddXUYx7TQe` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 99** on the representative runs (target ≥ 90); the nine individual runs are 98 to 99
✅ **Accessibility 100** in all nine runs (target ≥ 90), eighth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
✅ Chunk gate clean before measuring, so the scores are for pages that hydrate (see the eighth pass for the failure this guards)

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.010 | ✅ PASS |
| `/products` | 98 (98, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.006 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 98, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.019 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in order. Metrics are from the representative run.

No weighted audit scores below 0.9 in any category except `errors-in-console` under Best Practices, which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on an https request to the plain-http localhost origin), checked item by item on all three representative reports. No `/_next/*` request failed on any page, and the only failed requests on all three pages are the two `/_vercel/*` scripts and that one https prefetch.

Against the 10:16 pass: `/` moved 100 to 99, `/products` moved 99 to 98, the product page moved 99 to 98. **No `src/` commit landed in between** (`git log b4b948d44..a24964753 -- src/ next.config.ts package.json` is empty; the 22 commits since touch only `STATE.md`, `docs/` and `logs/`, the residual `3425ca36f` included), so the same tree measured one point lower on each URL. That is the localhost band described in `docs/PERFORMANCE-BUDGET.md`, and it is the same direction on all three pages because the three were measured back to back on one machine state; LCP on `/` is 1.0 s against 0.7 s, with FCP, TBT and CLS unchanged. TBT was 0 ms in all nine runs. The `CHROME_INTERSTITIAL_ERROR` of the 02:59 UTC attempt did not reproduce for a third consecutive pass.

## Previous pass (2026-10-21 10:16 UTC, MAINTENANCE_LOOP_7, ninth pass)

Build: commit `b4b948d44`, BUILD_ID `1JyKi5zx2YDf-1UfkZEuu` (cold build, `.next/cache/turbopack` moved aside first, chunk gate clean on 243 pages).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 99 to 100** on the representative runs (target ≥ 90); the nine individual runs are 98 to 100
✅ **Accessibility 100** in all nine runs (target ≥ 90), seventh consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 100 (100, 100, 100) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.7 s | 0 ms | 0.010 | ✅ PASS |
| `/products` | 99 (99, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.006 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ✅ PASS |

Against the 08:06 pass: `/` identical at 100, `/products` identical at 99, the product page 98 to 99. One `src/` commit in between (E2E run 12, `13021b20c`, 13 files) and none of it renders on the three measured pages. The only weighted audit under 0.9 was the same `errors-in-console` set of five local items.

## Previous pass (2026-10-21 08:06 UTC, MAINTENANCE_LOOP_7, eighth pass)

Build: commit `4d08a6515`, BUILD_ID `TYMhcyjg71hC5vYivmt-y` (cold build, `.next/cache/turbopack` moved aside first).

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued; `~/ke-goals/queue.txt` untouched.
✅ **Performance 98 to 100** on the representative runs (target ≥ 90); the nine individual runs are 98 to 100
✅ **Accessibility 100** in all nine runs (target ≥ 90), sixth consecutive pass holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere
⚠️ **The first run of this pass measured a build that did not hydrate, and scored it 99.** Discarded, root-caused, gated. Details below.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 100 (99, 100, 100) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.7 s | 0 ms | 0.021 | ✅ PASS |
| `/products` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.006 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.007 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in order. Metrics are from the representative run.

No weighted audit scores below 0.9 in any category except `errors-in-console` under Best Practices, which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on an https request to the plain-http localhost origin), checked item by item on all three representative reports. No `/_next/*` request failed on any page.

Against the 01:46 pass: `/` moved 99 to 100, `/products` is identical at 99, the product page is identical at 98. Five `src/` commits landed in between (F41 business registration number, F42 legal pages and reviews removal, F43 deal card title and body tracking, plus a residual), 111 files, and all three measured pages render different markup: the deals card title module on `/` and `/products`, the reviews block removed from the product page. The scores did not move outside the localhost band described in `docs/PERFORMANCE-BUDGET.md`. TBT was 0 ms in all nine runs.

### Stale build cache: a 99 for a page that never hydrated

The first `pnpm build` of this pass (BUILD_ID `jJ5wuG-zZd9m308zWyTfy`, 14:54 local) reused the Turbopack filesystem cache that Next 16 keeps on by default for builds (`experimental.turbopackFileSystemCacheForBuild`, `.next/cache/turbopack`, created by a build at 12:24 and shared by the 12:42, 14:52 and 14:54 builds). Its prerendered HTML for `/` and `/product/[slug]` listed a client chunk, `/_next/static/chunks/1k-r7teo-59oi.js`, that the same build did not write to `.next/static/chunks/`. The reference appeared nowhere else: not in any manifest, not in any other chunk, only in the four prerendered `route-cache` HTML and meta files.

Measured consequences on that build, with a Playwright probe on the served pages:

| Page | HTML source | `/_next/*` failures | Buttons with a React handler | Lighthouse perf |
|------|-------------|---------------------|------------------------------|-----------------|
| `/` | prerendered at build | 1 (404 `text/plain`, Chrome refused to execute) | **0 of 53** | 99 |
| `/products` | rendered at request time | 0 | 50 of 50 | 99 |
| `/product/אוזניות-איירפודס-3` | prerendered at build | 1 (same chunk) | **0 of 31** | 100 |

The home page and the product page were a dead storefront: no add-to-cart, no menu, no cart drawer. Lighthouse scored them 99 and 100 with TBT 0 ms, because no JavaScript ran. `/products` was fine because its HTML comes from the live module graph at request time, not from the cached one.

Fix applied for this pass: `.next/cache/turbopack` moved to `/tmp` (not deleted), cold `pnpm build` (27 s), and the same probe on the new build: 54 of 54, 50 of 50, 32 of 32 buttons hydrated, zero `/_next/*` failures. The table above is that build. The stale-cache lhci run (perf 99 / 99 / 100) is kept at `/tmp/ke-lh7/stale-cache-reports` and is not in the ledger.

Guard added so this cannot pass silently again: `scripts/prerender-chunk-gate.mjs` (`pnpm gate:chunks`) scans every `.html` under `.next/server/app` and `.next/server/route-cache` and exits 1 if any referenced `/_next/static/chunks/*` is absent from `.next/static/chunks/`. Unit tests in `scripts/prerender-chunk-gate.test.mjs` pin the exact shape of this defect (11 tests). The "How to rerun" block below runs it before starting the server. It is not wired into `pnpm build` or CI yet: Vercel persists `.next/cache` between builds too, so whether production is exposed to the same cache behaviour is an open question that needs a deployed build to answer (`scripts/audit-deployed-build.mjs` territory), not a localhost one.

Two leftovers found and left alone: a `pnpm start` from 12:42 local on port 3417 (this worktree, orphaned, no connections, now serving chunks from a BUILD_ID that no longer exists on disk) and a Lighthouse Chrome from 19.10 (pid 33615). Neither was mine to kill.

## Previous pass (2026-10-21 01:46 UTC, MAINTENANCE_LOOP_7, seventh pass)

Build: commit `3548a74dc`, BUILD_ID `y_c6WB3ZaWssk9wRjl0jf`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.5 s | 1.0 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (98, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (99, 98, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.021 | ✅ PASS |

All nine runs at or above 90; nothing was queued. The only `src/` change against the 23:50 pass was the Tabs trigger ink (LOOP_4 a11y fix), not rendered on the measured pages; the one-point moves were the localhost band. A 09:59 UTC attempt between the seventh and eighth passes failed with `CHROME_INTERSTITIAL_ERROR` on every run and produced no scores (recorded in `STATE.md`); it did not reproduce here.

## Previous pass (2026-10-20 23:50 UTC, MAINTENANCE_LOOP_7, sixth pass)

Build: commit `d40dcc729`, BUILD_ID `1GOAUu-1wqcwPGGvPXG2q`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 98 (98, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.011 | ✅ PASS |
| `/products` | 99 (98, 99, 100) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.008 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (99, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.010 | ✅ PASS |

All nine runs at or above 90; nothing was queued. The 22:36 to 23:50 shifts (`/` 99 to 98, product page 98 to 99) were the same localhost band; the only non-zero TBT (70 ms, first run on `/`) did not become the representative run.

## Previous pass (2026-10-20 22:36 UTC, MAINTENANCE_LOOP_7, fifth pass)

Build: commit `dea5b5d6a`, BUILD_ID `bQ2YvEbrGNi9s2Vv5VFYi`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.010 | ✅ PASS |

All nine runs at or above 90; nothing was queued. The 21:15 to 22:36 shift (product page 99 to 98) was the same localhost band.

## Previous pass (2026-10-20 21:15 UTC, MAINTENANCE_LOOP_7, fourth pass)

Build: commit `e351b0bff`, BUILD_ID `6VXpEKDDcEzaZbvv-RHeP`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (99, 100, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (99, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.021 | ✅ PASS |

All nine runs at or above 90; nothing was queued. The 18:14 to 21:15 shift (`/` 100 to 99) was the same localhost band.

## Previous pass (2026-10-20 18:14 UTC, MAINTENANCE_LOOP_7, third pass)

Build: commit `973c0abda`, BUILD_ID `lviikQdz_PELTAnyZo-Or`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 100 (99, 99, 100) | 100 (100, 100, 100) | 96 | 100 | 0.5 s | 0.8 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.008 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (99, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.021 | ✅ PASS |

All nine runs at or above 90; nothing was queued. The 16:03 to 18:14 shift (`/` 98 to 100) was the same localhost band.

## Previous pass (2026-10-20 16:03 UTC, A11Y_FIX_PRODUCTS_LIGHTHOUSE)

Build: the A11Y_FIX_PRODUCTS_LIGHTHOUSE tree on top of `84b18715d`, BUILD_ID `p1WRLxM6-YqBY2AbC5N4V`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 98 (98, 99, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.0 s | 0 ms | 0.008 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 98 (98, 98, 98) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 1.1 s | 0 ms | 0.010 | ✅ PASS |

No accessibility audit failed on any URL (was 87 on `/products` and 96 on `/` before the fix). The 1-2 point Performance drop against the 15:46 pass was LCP 0.7-0.9 s to 1.0-1.1 s on the same laptop with the same preset, inside the localhost run-to-run band documented in `docs/PERFORMANCE-BUDGET.md`; nothing on the render path changed.

## What was fixed (A11Y_FIX_PRODUCTS_LIGHTHOUSE, 2026-10-20)

| Audit | Fix | Measured after |
|-------|-----|----------------|
| `aria-allowed-attr` | `DealChips.tsx`: the two filter links carry `aria-current="true"` when applied instead of `aria-pressed`, which the link role does not allow. The `--on` class still paints the state. | Attribute absent on the off chips, audit passes. |
| `color-contrast` | `category-page.css`: `.category-pagination-mode-btn` reads `--cat-switcher` (#495057, 7.11:1 on the #efefef bar) instead of `--cat-muted` (#657888, 3.97:1). Same token as the view switcher beside it. | Computed colour rgb(73, 80, 87) on the idle button; audit passes. |
| `target-size` (`/products`) | `category-page.css`: the two stacked `input[type=range]` are 24px tall and centred on the 4px track (`top: -16px` against the wrapper that sits 2px under the track). They stay `pointer-events: none` with only the thumbs live, and axe does not count a `pointer-events: none` sibling as obscuring. | Both inputs 280x24; audit passes. |
| `image-redundant-alt` | `CategoryProductCard.tsx`: the thumbnail inside the titled link has `alt=""`. The link's accessible name is the `h2` beside the image. | Audit passes on all 10 cards. |
| `target-size` (`/`) | `HeroSlider.tsx`: the dot gap is derived from the hit box (`DOT_GAP = 2 * inset = 16px`, inline) so every 24x24 button touches its neighbour and never overlaps it. `gap-4` could not be used: the spacing unit is 3.5px, so it is 14px and measured a 2px overlap. Visible dots move 1px per gap on desktop (15 to 16) and the phone row keeps its 24px pitch. | All five buttons 24x24 at 1350 and at 380; audit passes. `hero-dot-target.test.ts` pins the arithmetic. |

Pixel-parity gate after the change, `scripts/compare.mjs --page=home` against the same server (ledger rows in `docs/UI-PARITY-REPORT.md`):

| Width | Before | After |
|-------|--------|-------|
| 380 | 8.50% | 8.51% PASS |
| 768 | 9.80% | 9.80% PASS |
| 1440 | 8.10% | 8.10% PASS |

## Previous pass (2026-10-20 15:46 UTC, MAINTENANCE_LOOP_7, second pass)

Build: commit `10d74a69f`, BUILD_ID `U8MWokhCrYHaPNAUaxa9d`.

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 100 (99, 100, 100) | 96 | 96 | 100 | 0.4 s | 0.7 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (100, 99, 99) | **87** (87, 87, 87) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ⚠️ FAIL (a11y) |
| `/product/אוזניות-איירפודס-3` | 99 (99, 99, 99) | 100 | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.021 | ✅ PASS |

Accessibility on `/products` was deterministic: 87 in all three runs. The audits it reported, now fixed, were:

### `/products` Accessibility 87, four audits

| Audit | Weight | Elements | What Lighthouse reports |
|-------|--------|----------|-------------------------|
| `aria-allowed-attr` | 10 | 2 | `nav.deal-chips > a.deal-chips__chip` carries `aria-pressed="false"` on an `<a>` (links `?weekend=1`, `?free_shipping=1`); `aria-pressed` is not allowed on the link role. Use `aria-current` or render the toggle chips as buttons. |
| `color-contrast` | 7 | 1 | `button.category-pagination-mode-btn` (aria-label "עמודים"): `#657888` on `#efefef` is 3.97:1, needs 4.5:1. |
| `target-size` | 7 | 2 | The two `input[type=range]` price-slider thumbs (`price-slider__input--min` / `--max`) are 280x10px; the hit box must be at least 24x24. |
| `image-redundant-alt` | 1 | 10 | `category-card__thumb > img` alt text repeats the card title that follows it. Empty alt on the thumbnail inside the titled link. |

### `/` Accessibility 96, one audit

| Audit | Weight | Elements | What Lighthouse reports |
|-------|--------|----------|-------------------------|
| `target-size` | 7 | 4 | Hero slider dots (`aria-label="שקופית 2..5"`) are 16x24px with negative margins; need 24x24 of hit area. |

### Best Practices 96 everywhere, one audit

`errors-in-console`: five console errors on every page, all local-environment artefacts and not page defects:
`/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` answer `text/plain` outside Vercel (two "Refused to execute" plus two 404s), and one `ERR_SSL_PROTOCOL_ERROR` from a resource requested over https on the plain-http localhost origin.

### Performance 99-100

No metric fails. The 0 or 0.5 "diagnostics" (`uses-long-cache-ttl`, `render-blocking-resources`, `unused-javascript`, `dom-size`, `image-delivery-insight`) are unweighted hints. `uses-long-cache-ttl` is a local `next start` artefact (no CDN headers).

## Action taken

Per the loop rule ("If any score below 90 queue optimization goal"), goal **A11Y_FIX_PRODUCTS_LIGHTHOUSE** was inserted at the head of `~/ke-goals/queue.txt` with the four audits above as its work list. Performance needs no goal.

## Comparison with the previous pass (2026-10-20 09:38 UTC)

The first MAINTENANCE_LOOP_7 pass could not run `pnpm lhci:autorun` (the script did not exist, `@lhci/cli` is not a dependency) and used `pnpm lighthouse:weekly` (mobile simulated throttling, 1 run per page) instead. It reported Performance 81-87 on 8 of 9 pages and queued a performance goal. That is the localhost simulated-throttling noise documented in `docs/PERFORMANCE-BUDGET.md` and `scripts/lighthouse-smoke.mjs`, not a regression: the same tree measured with the committed `.lighthouserc.cjs` (desktop preset) is 99-100 with FCP 0.4 s, LCP 0.7-0.9 s and TBT 0 ms. The earlier report is kept below for the record; its per-page numbers are not comparable to this table.

<details>
<summary>Previous pass, 2026-10-20 09:38 UTC (pnpm lighthouse:weekly, mobile preset, 1 run)</summary>

| Page | Performance | Accessibility | SEO |
|------|-------------|----------------|-----|
| / (Homepage) | 87 | 96 | 100 |
| /products | 85 | 92 | 100 |
| /category/hot-deals | 86 | 95 | 91 |
| /search | 85 | 97 | 92 |
| /cart | 92 | 100 | 69 |
| /contact | 85 | 100 | 100 |
| /account/affiliate | 87 | 96 | 100 |
| /privacy-policy | 81 | 100 | 100 |
| /terms-and-conditions | 81 | 100 | 92 |

</details>

## How to rerun

```bash
pnpm build
pnpm gate:chunks                                   # every chunk the prerendered HTML asks for must be on disk; if not, move .next/cache/turbopack aside and build cold
PORT=3361 pnpm start &
/usr/sbin/lsof -nP -iTCP:3361 -sTCP:LISTEN        # confirm the listener is this checkout
LHCI_BASE_URL=http://localhost:3361 COMPARE_PRODUCT_SLUG='אוזניות-איירפודס-3' pnpm lhci:autorun
node -e 'for (const r of require("./.lighthouseci/reports/manifest.json")) console.log(r.isRepresentativeRun?"*":" ", r.url, r.summary)'
```
