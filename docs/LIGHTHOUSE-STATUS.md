# Lighthouse CI Status Report

**Last Updated:** 2026-10-20 15:46 UTC (MAINTENANCE_LOOP_7, second pass)
**Measurement Method:** `LHCI_BASE_URL=http://localhost:3361 COMPARE_PRODUCT_SLUG=<slug> pnpm lhci:autorun`
(`@lhci/cli` 0.15.1 via `pnpm dlx`, Lighthouse 12.6.1, `desktop` preset, 3 runs per URL, lhci median)
**Build:** commit `10d74a69f`, BUILD_ID `U8MWokhCrYHaPNAUaxa9d`, served by `pnpm start` from this worktree on port 3361 (listener pid and cwd verified before the run)
**Reports:** `.lighthouseci/reports/` (git-ignored, nothing uploaded)

## Summary

✅ **Performance 99-100 on all three URLs** (target ≥ 90)
⚠️ **1 of 3 URLs FAILS Accessibility**: `/products` scores **87** (target ≥ 90)
✅ Best Practices 96 and SEO 100 everywhere

| URL | Performance | Accessibility | Best Practices | SEO | FCP | LCP | TBT | CLS | Status |
|-----|-------------|---------------|----------------|-----|-----|-----|-----|-----|--------|
| `/` | 100 (99, 100, 100) | 96 | 96 | 100 | 0.4 s | 0.7 s | 0 ms | 0.023 | ✅ PASS |
| `/products` | 99 (100, 99, 99) | **87** (87, 87, 87) | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.019 | ⚠️ FAIL (a11y) |
| `/product/אוזניות-איירפודס-3` | 99 (99, 99, 99) | 100 | 96 | 100 | 0.4 s | 0.9 s | 0 ms | 0.021 | ✅ PASS |

Accessibility on `/products` is deterministic: 87 in all three runs.

## Failing audits (measured, representative run)

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
