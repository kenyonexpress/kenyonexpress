# Lighthouse CI Status Report

**Last Updated:** 2026-10-20 18:14 UTC (MAINTENANCE_LOOP_7, third pass)
**Measurement Method:** `LHCI_BASE_URL=http://localhost:3361 COMPARE_PRODUCT_SLUG=<slug> pnpm lhci:autorun`
(`@lhci/cli` 0.15.1 via `pnpm dlx`, Lighthouse 12.6.1, `desktop` preset, 3 runs per URL, lhci median)
**Build:** commit `973c0abda` (clean tree), fresh `pnpm build` exit 0, BUILD_ID `lviikQdz_PELTAnyZo-Or`, served by `pnpm start` from this worktree on port 3361 (listener pid 98925, cwd verified as this checkout before the run, no other node listener on the port)
**Reports:** `.lighthouseci/reports/` (git-ignored, nothing uploaded; the 16:03 reports were moved aside so the manifest holds only this pass)

## Summary

✅ **Every category at or above 90 on all three URLs, in all nine runs.** No optimisation goal queued.
✅ **Performance 99-100** (target ≥ 90)
✅ **Accessibility 100** in all nine runs (target ≥ 90), holding the A11Y_FIX_PRODUCTS_LIGHTHOUSE result
✅ Best Practices 96 and SEO 100 everywhere

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 100 (99, 99, 100) | 100 (100, 100, 100) | 96 | 100 | 0.5 s | 0.8 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (98, 99, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.008 | ✅ PASS |
| `/product/אוזניות-איירפודס-3` | 99 (99, 98, 99) | 100 (100, 100, 100) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.021 | ✅ PASS |

The first number is lhci's representative (median) run, the bracket lists all three runs in order. Metrics are from the representative run.

No weighted audit scores below 0.9 in any category except `errors-in-console` under Best Practices, which is the same five local-environment items as every previous pass (two `/_vercel/*` 404s, two "Refused to execute" on their `text/plain` answer, one `ERR_SSL_PROTOCOL_ERROR` on an https request to the plain-http localhost origin). Nothing to fix in the tree.

Against the 16:03 pass on the same laptop: `/` moved from 98 to 100 (LCP 1.1 s to 0.8 s) and the other two held at 99 with LCP 1.0-1.1 s to 0.9 s. The only commits since are docs and ledger rows (GATE-STATUS, CRON-STATUS, STATE.md), so the shift is the localhost run-to-run band described in `docs/PERFORMANCE-BUDGET.md`, not a code change.

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
PORT=3361 pnpm start &
/usr/sbin/lsof -nP -iTCP:3361 -sTCP:LISTEN        # confirm the listener is this checkout
LHCI_BASE_URL=http://localhost:3361 COMPARE_PRODUCT_SLUG='אוזניות-איירפודס-3' pnpm lhci:autorun
node -e 'for (const r of require("./.lighthouseci/reports/manifest.json")) console.log(r.isRepresentativeRun?"*":" ", r.url, r.summary)'
```
