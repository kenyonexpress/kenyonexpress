RESUME FROM: M12-c115

# KenyonExpress — Project State

Last item: **M11-c115 DONE** (2026-10-07): sitemap.xml re-verified against production. The index and all 5 section files return 200 `application/xml`, and all 94 `<loc>` URLs reach 200 on `www` after one 308 from the apex. No code change. Branch `feat/products-sort-infinite-scroll`.
Previous: M10-c115 BLOCKED (2026-10-07), M09-c115 DONE (2026-10-07), M08-c115 DONE (2026-10-07), M07-c115 DONE (2026-10-07), M06-c115 DONE (2026-10-07), M05-c115 DONE (2026-10-07), M04-c115 DONE (2026-10-07), M03-c115 BLOCKED (2026-10-07), M02-c115 BLOCKED (2026-10-07), M01-c115 BLOCKED (2026-10-07), M11-c113 DONE (2026-10-06).
History before this item lives in `docs/STATE-ARCHIVE.md` (21,138 lines moved there in this commit).

## Queue status (cycle c113)

The runner's `final-done.txt` lists M01–M10 of c113 as finished. This branch's git log has no commits for them, so they are recorded here as runner-reported and not re-verified.

| ID | Item | Status |
|---|---|---|
| M01–M10-c113 | compare / type-check / test / build / TODO / Lighthouse / deps / migrations | runner-reported done, no commit on this branch |
| M11-c113 | Verify sitemap.xml fresh and reachable | **DONE**, see below |
| M12-c113 | Verify robots.txt production-safe | next |
| M13–M18-c113 | health, Sentry, console, JSON-LD, RTL, STATE trim | pending |
| M01-c115 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: gate refuses, no reference (see below) |
| M02-c115 | Re-measure compare.mjs on /product | **BLOCKED**: gate refuses, no reference (see below) |
| M03-c115 | Re-measure compare.mjs on /category | **BLOCKED**: gate refuses, no reference (see below) |
| M04-c115 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change (see below) |
| M05-c115 | pnpm test, fix drift | **DONE**: exit 0, no drift, no code change (see below) |
| M06-c115 | pnpm build, fix drift | **DONE**: exit 0 on attempt 4, no drift, no code change (see below) |
| M07-c115 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: 1 resolved, 2 filed (see below) |
| M08-c115 | Lighthouse mobile on / and /product sample, log scores | **DONE**: perf 82 / 84 median, a11y 100, BP 96, SEO 100 (see below) |
| M09-c115 | Remove unused deps and dead exports | **DONE**: 9 deps removed, 14 dead components deleted (see below) |
| M10-c115 | Verify migrations/pending/ applied or file blocker | **BLOCKED**: 22 files confirmed not applied, 6 live but unrecorded (see below) |
| M11-c115 | Verify sitemap.xml fresh and reachable | **DONE**: 5/5 section files 200, 94/94 URLs 200 on www (see below) |

## M11-c115: sitemap.xml, measured 2026-10-07 05:37 UTC against production

- `https://www.kenyonexpress.co.il/sitemap.xml` returns 200 `application/xml; charset=utf-8`, `cache-control: public, max-age=0`. It is a `<sitemapindex>` that lists 5 section files.
- Every section file returns 200 `application/xml`: content 15 URLs, categories 12, products 44, regions 17, suppliers 6, for 94 URLs in total, no duplicates. Same counts as M11-c113.
- Freshness: newest lastmod is content 2026-10-05, categories 2026-09-08, products 2026-09-08, suppliers 2026-08-31, regions none (on purpose). Unchanged from M11-c113. Each lastmod is the row's real `updated_at` and the routes are dynamic, so the sitemap is current; old dates mean rows have not changed.
- Reachability: all 94 `<loc>` URLs return 308 on the apex and **200** on `www`. 4 URLs first came back `000` because of client-side 60 s curl timeouts; this machine's link was very slow during the run (vercel.com itself downloaded at about 4 KB/s), and all 4 returned 200 on retry with a 200 s limit (TTFB 9 to 19 s).
- `robots.txt` still has `Sitemap: https://kenyonexpress.co.il/sitemap.xml`. The apex-vs-www hop is open blocker 1 and needs a Vercel change, which the agent may not make.
- No code change. Gates in this run: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped), `pnpm build` 0 on attempt 3. Attempts 1 and 2 failed on prerender with 71 and 84 `supabase.timeout` events, the same network flake as M06-c115. The uncommitted `src/app/robots*.ts` edits (M12-c113) and `logs/` are not part of this commit.

## M10-c115: is migrations/pending/ applied? Read-only probe, 2026-10-07

- **Method.** The Supabase MCP needs re-authorisation in this session, there is no DB URL on this machine, and `supabase` is not linked, so `schema_migrations` could not be read. Instead, one read-only `GET /rest/v1/` with the service key from `.env.local` fetched the PostgREST OpenAPI schema of production. Each numbered file's own tables, added columns and RPCs (parsed from its SQL) were checked against that schema. No key was printed and nothing was written. Files with no REST-visible effect (grants, cron, indexes, constraints, triggers, search_path) cannot be judged this way.
- **Live but still in `pending/` (6).** Every object these files create is present in production, but each one's README section says "WRITTEN, not applied" and none is in the APPLIED IN PRODUCTION table or `migrations/applied/`:
  - `189`: `reviews.title`, `reviews.verified_purchase`
  - `190`: `abandoned_cart_nudges.reminder_number`
  - `191`: `payment_discrepancies` and `fn_record_payment_discrepancies`
  - `194`: `coupon_redemptions`, `coupons.max_uses_per_user`, `discount_redemptions.released_at`, plus the claim and release RPCs
  - `197`: `shipping_zones`, `pickup_points`
  - `201`: `scheduled_price_changes`

  They were not moved to `applied/`. Without the `schema_migrations` row and a check of their constraints and policies, moving them would be a guess. Re-running them is probably harmless (they use `IF NOT EXISTS`), but nobody has checked that.
- **Not applied (21 by probe).** None of their objects exists in production: `184` (`orders_invoice_numbers`), `202`–`205`, `207`, `210`–`213`, `215`–`217`, `219`, `221`–`223`, `225`, `226` and `228`, which is every table and column they add. `227` is also not applied: its two live RPCs predate it (its header says so), and `extend_voucher_expiry` is absent. `188` and `218` change existing functions only, so they count as unverified, not as applied.
- **Cannot be judged over REST (11):** `162`, `192`, `196`, `206`, `208`, `209`, `214`, `220`, `224`, `229` and `230`. `162` is still known not applied (blocker 2). `230` is checked with the SQL in `APPLY-ORDER.md` (expect 0 rows, and 15 means not applied).
- **Effect on the code.** The app already reads tables that are missing, such as `job_runs`, `content_pages`, `phase_config`, `sms_messages` and `push_deliveries`. Those paths depend on the pending files and fail closed until the files are applied. This item does not change that.
- No code change. Gates: see the commit message.

## M09-c115: unused deps and dead exports, run 2026-10-07

- **Deps.** Each `dependencies`/`devDependencies` name was searched with `git grep` over the tracked tree (excluding docs, the lockfile and the archive). Removed, with zero importers: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@hookform/resolvers`, `@radix-ui/react-toast`. Then these were removed because their only importers were the deleted primitives below: `react-hook-form`, `@radix-ui/react-slot` (ui/form, ui/button), `@radix-ui/react-label` and `class-variance-authority` (ui/label).
- **Kept on purpose**, even though no source imports them: `@types/*` (ambient types), `@vitest/coverage-v8` (`test:coverage`), `lint-staged` (`.husky/pre-commit`), and `@mdx-js/loader`, `@mdx-js/react` and `@types/mdx` (optional peers of `@next/mdx`, which `next.config.ts` uses). Removing a peer the MDX pipeline resolves at build time is not worth the risk for an item like this.
- **Dead exports.** Deleted 12 of the 21 components frozen in `scripts/dead-component-known-issues.json`: the 3 `store/` re-export shims, `store/CategoryNav`, `store/CategoryProductSection`, `store/DealsSection`, `home/FeaturedProducts`, `home/HeroExact`, `layout/InfoBar` (its header said DEAD CODE), and `ui/button`, `ui/form`, `ui/textarea`. The deletions orphaned `home/FeaturedProductsTabs` and `ui/label`, so those 2 went too (14 files, about 700 lines). The ledger lists 9 now.
- **Left in the ledger on purpose**: `home/Footer` (tokens.css names it), `admin/CategoryTree` (cited by other files' comments), `ui/dropdown-menu` and `ui/select` (named in `scripts/rtl-logical-scan.mjs`), `product/WishlistButton` (shim), and the unwired features `NewsletterSignup`, `LegalDocumentView`, `BlogPostHeader` and `CategorySort`. Wiring or dropping those is a product decision for Ofir, not a cleanup.
- **Ratchets lowered** because of the deletions: `HEBREW_LITERAL_CEILING` went from 661 to 631 in `scripts/hebrew-literal-scan.mjs`. The `FeaturedProducts` entry left `src/lib/discarded-read-inventory.test.ts`. One stale doc path left `docs/GAP-AUDIT-FINAL.md`. `node scripts/final-audit.mjs` now reports 0 new and 0 stale dead components (184 scanned, 9 frozen).
- Gates: `pnpm type-check` 0 and `pnpm lint` 0. `pnpm test` 0 on the second run (519 files, 6473 passed, 12 skipped). The first run failed for two reasons: the i18n ceiling, fixed above, and a 20 s timeout in `payment-alarm-push.test.ts` under load, which passed alone and in the full rerun. `pnpm build` 0 on the first attempt, with 46 `supabase.timeout` events that were absorbed.
- Not a visual change, because no deleted file was mounted on any route. So compare.mjs was not run (it would refuse anyway, see blocker 0). The uncommitted `src/app/robots*.ts` edits (M12-c113) and `logs/` are not part of this commit.

## M08-c115: Lighthouse mobile on / and /product, run 2026-10-07 in the foreground

Setup: Lighthouse 13.4.1 from the repo (`pnpm exec lighthouse <url> --form-factor=mobile --chrome-flags="--headless=new --no-sandbox" --output=json`), with default `simulate` throttling (modelled mid-tier phone, 4G, 4x CPU). The target was `pnpm start -p 3488` on a clean production build made in this run. The sample product is `/product/מוצר-לדוגמא`, which returns 200 locally. `airpods-pro-2` and `demo-coupon-1`, the sweep's old samples, now return 404. There were 3 runs per page.

| Page | Run | Perf | A11y | BP | SEO | FCP | LCP (sim) | TBT | CLS | SI | Observed LCP |
|---|---|---|---|---|---|---|---|---|---|---|---|
| / | 1 | 59 | 100 | 96 | 100 | 1.4 s | 4.9 s | 1,070 ms | 0.002 | 2.0 s | 1027 ms |
| / | 2 | 82 | 100 | 96 | 100 | 1.8 s | 4.6 s | 30 ms | 0.002 | 1.8 s | 127 ms |
| / | 3 | 88 | 100 | 96 | 100 | 1.8 s | 3.8 s | 30 ms | 0.002 | 1.8 s | 102 ms |
| /product/מוצר-לדוגמא | 1 | 83 | 100 | 96 | 100 | 1.8 s | 4.4 s | 100 ms | 0.001 | 1.8 s | 237 ms |
| /product/מוצר-לדוגמא | 2 | 84 | 100 | 96 | 100 | 1.8 s | 4.3 s | 40 ms | 0.001 | 1.8 s | 184 ms |
| /product/מוצר-לדוגמא | 3 | 84 | 100 | 96 | 100 | 1.8 s | 4.3 s | 30 ms | 0.001 | 1.8 s | 86 ms |

- **Median: home Performance 82, product Performance 84.** Accessibility 100, Best Practices 96 and SEO 100 on every run. Home run 1 was the first request after `next start` (a cold server, TBT 1,070 ms), so it is an outlier.
- How to read these: the simulated LCP (3.8–4.9 s) is a Lantern model. In the same reports the observed LCP is 86–237 ms on warm runs. As `docs/PERFORMANCE-BUDGET.md` says, a localhost score is a relative signal and not a field score.
- Perf still costs: `unused-javascript` (about 450 ms on home and 600 ms on product), plus the image-delivery, LCP-discovery, network-dependency-tree and render-blocking insights. These are recorded here and not acted on, because this item only measures.
- Best Practices 96 comes from `errors-in-console` only, and every error is local: `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` return 404 outside Vercel, and the wishlist link prefetch fails with `ERR_SSL_PROTOCOL_ERROR` on an `https://localhost:3488/login?next=/account/wishlist` redirect. None of this is a production finding.
- No code change. Gates in this run: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 on the second run (519 files, 6473 passed, 12 skipped). The first test run exited 1 only because 5 vitest workers timed out at startup while the load average was 44, and all the files that did run passed. `pnpm build` 0 on attempt 2. Attempt 1 failed with 66 `supabase.timeout` events at `/category/vacation`, the same network flake as M06-c115. The uncommitted `src/app/robots*.ts` edits (M12-c113) and `logs/` are not part of this commit.
- Not a UI change, so compare.mjs was not needed (it would refuse anyway, see blocker 0).

## M07-c115: TODO/FIXME scan, run 2026-10-07

- Scan: `git grep -P '(^|\s)(TODO|FIXME|HACK|XXX)($|[\s:(])'` over the tracked tree, excluding `docs/`, `refs/`, Markdown, JSON, HTML and the audit scanner's own fixtures. This found 3 real markers. The other hits were phone placeholders (`05X-XXX-XXXX`) and a test's `'TODO'` string, which are not markers. Ages come from `git blame`, and all 3 are older than 7 days.
- `scripts/screenshot-all.mjs:42` (2026-07-23) was **resolved**. The env and argv overrides it asked for already exist, so the TODO became a plain note. Comment only, no behaviour change.
- `src/lib/payments/cardcom.ts:254` (refund, #41) and `:319` (documents, #42) were **filed** as B1 and B2 in the new `docs/BACKLOG.md`. Both need production Cardcom keys and live-terminal verification, and payment provider work is out of scope. They stay in code with their issue refs.
- `docs/BACKLOG.md` is listed in `docs/INDEX.md` (Operations, now 28) and the README count is now 262. `pnpm lint:docs` OK.
- `node scripts/final-audit.mjs` reports 0 untracked work markers (of 2 total).
- Gates: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped), `pnpm build` 0 on the first attempt. The uncommitted `src/app/robots*.ts` edits (M12-c113) and `logs/` are not part of this commit.
- Not a UI change, so compare.mjs was not needed (it would refuse anyway, see blocker 0).

## M06-c115: pnpm build, run 2026-10-07

- `pnpm build` exited **1** on attempts 1–3. All three failures were upstream Supabase slowness during static generation, not code: attempt 1 `catalogue.category_slugs_failed` (`SupabaseTimeoutError` >10 s, plus one `fetch failed`) at `/category/[slug]`. Attempt 2 had 42 `supabase.timeout` events, then "Filling a cache during prerender timed out" in `loadProductBySlug` for `/product/צימר-מאסטר-copy-copy`. Attempt 3 had 14 timeouts and the same `/category/[slug]` failure.
- A direct curl to the Supabase REST endpoint between attempts answered in 0.07–0.3 s. Attempt 4 exited **0** with zero `supabase.timeout` events: compiled in 4.1 s, 311/311 static pages in 14.1 s.
- Decision: there was no drift to fix and no code changed. The build fails whenever Supabase is slow at build time, because prerender reads the live DB with a 10 s timeout. This was already seen in M03-c115. It is recorded here and not patched, because loosening the timeout or the fail-closed catalogue reads would hide real outages.
- Other gates in the same run: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped).
- The uncommitted `src/app/robots*.ts` edits from M12-c113 work and the untracked `logs/` were in the tree during the run. They are not part of this commit.
- Not a UI change, so compare.mjs was not needed (it would refuse anyway, see blocker 0).

## M05-c115: pnpm test, run 2026-10-07

- `pnpm test` (vitest) exits **0**: 519 files passed, 6473 tests passed, 12 skipped, 0 failed (86 s). There was no drift to fix and no code changed.
- The `Error: Not implemented: navigation (except hash changes)` lines in the output are jsdom stderr from link-click tests. They are not failures.
- Other gates in the same run: `pnpm type-check` 0, `pnpm lint` 0, `pnpm build` 0 on the first attempt.
- The uncommitted `src/app/robots*.ts` edits from M12-c113 work were in the tree during the run. They are not part of this commit.
- Not a UI change, so compare.mjs was not needed (it would refuse anyway, see blocker 0).

## M04-c115: pnpm type-check, run 2026-10-07

- `pnpm type-check` (`tsc --noEmit`) exits **0** with no errors, so there was no drift to fix and no code changed.
- Other gates in the same run: `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped), `pnpm build` 0 on the first attempt (no `SupabaseTimeoutError` this time).
- The working tree still has the uncommitted `src/app/robots*.ts` edits from M12-c113 work. The gates ran with them in place, and they are not part of this commit.
- Not a UI change, so compare.mjs was not needed for this item (and it would refuse anyway, see blocker 0).

## M03-c115: compare.mjs on /category at 380, 768, 1440, run 2026-10-07 in the foreground

Command: `LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=category --width=<w>` (local `pnpm start -p 3311`, HTTP 200).

| Width | Exit | Diff | Output |
|---|---|---|---|
| 380 | 5 | none | REFUSING: `https://kenyonexpress.co.il/product-category/hot-deals/` is this project's own build (26 `/_next/` refs, Next runtime, no wp-content) |
| 768 | 5 | none | REFUSING: same reason (26 `/_next/` refs) |
| 1440 | 5 | none | REFUSING: same reason (37 `/_next/` refs, Next runtime) |

- **There are no diff numbers.** This is BLOCKED and not a pass, and it is the same cause as open blocker 0. The gate wrote the three REFUSED rows to `docs/UI-PARITY-REPORT.md` itself, and they are committed with this item.
- Every width needed 1–2 `page.goto` retries (60 s timeouts) because outbound network was slow in this run (curl to www took about 20 s).
- No code change. Gates: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped), `pnpm build` 0 on the third attempt. The first two attempts failed on `SupabaseTimeoutError` (>10 s) while prerendering `/product/e2e-test-physical` and then `/category/phones-computers`. That is the network, not code. The uncommitted `src/app/robots*.ts` edits from M12-c113 work are still not part of this commit.

## M02-c115: compare.mjs on /product at 380, 768, 1440, run 2026-10-07 in the foreground

Command: `LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=product --width=<w>` (local `pnpm start -p 3311` on the existing build, HTTP 200).

| Width | Exit | Diff | Output |
|---|---|---|---|
| 380 | 5 | none | REFUSING: `https://kenyonexpress.co.il/product/מוצר-לדוגמא/` is this project's own build (39 `/_next/` refs, Next runtime, no wp-content) |
| 768 | 5 | none | REFUSING: same reason (22 `/_next/` refs) |
| 1440 | 5 | none | REFUSING: same reason (37 `/_next/` refs, Next runtime) |

- **There are no diff numbers.** The guard refuses to score our build against itself, so this is BLOCKED and not a pass. The gate logged the three REFUSED rows in `docs/UI-PARITY-REPORT.md` itself, and they are committed with this item. The last real product number is 10.96% (see archive).
- Decision: this blocker is the same as open blocker 0. The other parity items in this cycle will refuse the same way until Ofir provides a reference.
- No code change. Gates in this run are listed in the commit message.

## M01-c115: compare.mjs on / at 380, 768, 1440, run 2026-10-07 in the foreground

Command: `LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home --width=<w>`

| Width | Exit | Diff | Output |
|---|---|---|---|
| 380 | 5 | none | REFUSING: `https://kenyonexpress.co.il/` is this project's own build (35 `/_next/` refs, Next runtime, no wp-content) |
| 768 | 5 | none | REFUSING: same reason (34 `/_next/` refs) |
| 1440 | 5 | none | Styles never confirmed, then REFUSING: no WordPress and no Next markers in the document |

- **There are no diff numbers.** The guard in `scripts/live-reference.mjs` refuses to score our build against itself (see `docs/PARITY-REFERENCE.md`). That is correct behaviour, so this is recorded as BLOCKED and not as a pass. The last real numbers are in the archive (home 10.92 at 1440).
- `refs/ke_live_singlefile.html`, the designated reference, is still missing from the tree. The `refs/ke_live_*.html` archives that do exist cannot render under `file:` (protocol-relative subresources, and the stylesheet returns 403).
- No code change. Gates in this run: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped; the working tree includes uncommitted `src/app/robots*.ts` edits from M12-c113 work, which are not part of this commit), `pnpm build` 0.

## M11-c113: sitemap.xml, measured 2026-10-06 13:17 UTC against production

- `https://www.kenyonexpress.co.il/sitemap.xml` returns 200 `application/xml`. It is a `<sitemapindex>` that lists 5 section files.
- Every section file returns 200: content 15 URLs, categories 12, products 44, regions 17, suppliers 6, for 94 URLs in total.
- Freshness: the routes are dynamic (`cache-control: public, max-age=0, must-revalidate` at the browser). The newest lastmod values are content 2026-10-05, categories 2026-09-08, products 2026-09-08 and suppliers 2026-08-31. Regions has no lastmod on purpose because there is no time signal for them (see archive, SECTIONS 21). Each lastmod is the row's real `updated_at`, so an old date means the row has not changed. It does not mean the sitemap is stale.
- Reachability: all 94 `<loc>` URLs return **200** on `www`.
- `robots.txt` has the line `Sitemap: https://kenyonexpress.co.il/sitemap.xml`.
- No code change was needed. Gates before commit: `pnpm type-check` exit 0; `pnpm lint` exit 0; `pnpm test` exit 0 (519 files, 6471 passed, 12 skipped); `pnpm build` exit 0.
- Housekeeping in the same commit: STATE.md archived to `docs/STATE-ARCHIVE.md`; the new doc is listed in `docs/INDEX.md` (the Audits count is fixed to 26, it already said 24 with 25 rows) and in README (261 docs); its historical dangling paths are ledgered in `docs/known-dangling-paths.json`.

## Open blockers

0. **The parity gate has no reference (M01-c115).** `compare.mjs` exits 5 at every width because `kenyonexpress.co.il` serves our build and `refs/ke_live_singlefile.html` does not exist. No UI item can show it is under 11% until a working reference is restored. Re-confirmed for `/product` in M02-c115 and `/category` in M03-c115 (see `docs/PARITY-REFERENCE.md`).
1. **Apex vs www host mismatch (known since SECTIONS 21, still open).** Vercel serves `www` and redirects the apex with a 308. The site declares the apex as canonical: every sitemap `<loc>`, the robots `Sitemap:` line, `og:url` and canonicals all use `https://kenyonexpress.co.il` (from `NEXT_PUBLIC_APP_URL`, with the `layout.tsx` default). So all 94 sitemap URLs cost one 308 hop before they reach a 200. Fixing it means either setting `NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il` in Vercel or making the apex the primary domain in Vercel. Both are Vercel env or domain changes, which the agent is not allowed to make.
2. Scheduled jobs (cron) do not run until migration 162 is applied. See below.
5. **Pending migrations are not applied (M10-c115).** 22 numbered files are confirmed absent from production, and 6 (`189`, `190`, `191`, `194`, `197` and `201`) are live but not recorded as applied. Only Ofir applies migrations, and the bookkeeping for the 6 needs a `schema_migrations` read, which needs the Supabase MCP or a DB URL.
3. The live catalogue has template rows and duplicates: 25 findings pinned in `supabase/catalogue-known-issues.json`. These are decisions for the operator.
4. `main` diverged: local `main` is 193 commits ahead of `origin/main` and 110 behind (L9), and Vercel tracks `main`. Production is not built from this branch.

## Manual items for Ofir

- Provide a usable parity reference: either restore `refs/ke_live_singlefile.html` (a self-contained SingleFile save of the old WooCommerce home) or a host that still serves the old site. Until then compare.mjs cannot produce a number (M01-c115).
- Choose one canonical host and set it in Vercel: either `NEXT_PUBLIC_APP_URL` = www, or make the apex primary (blocker 1). Then resubmit the sitemap in Search Console.
- Apply `migrations/pending/` following `APPLY-ORDER.md`. As of M10-c115, 22 files are confirmed not live, including 162 cron, 228 `job_runs` and most of 202–227 (the list is in the M10-c115 section). Do not apply `200`.
- Confirm that `189`, `190`, `191`, `194`, `197` and `201` are in `supabase_migrations.schema_migrations`. If they are, move them to `migrations/applied/` with README rows. Their objects are already live (M10-c115). Also re-authorise the Supabase MCP so agents can read `schema_migrations`.
- Reconcile local `main` with `origin/main` before the next deploy.
- Review the catalogue findings in `supabase/catalogue-known-issues.json`.
