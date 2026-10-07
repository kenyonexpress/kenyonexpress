RESUME FROM: M08-c115

# KenyonExpress — Project State

Last item: **M07-c115 DONE** (2026-10-07): TODO/FIXME scan. 3 real markers, all older than 7 days. 1 resolved in code, 2 (Cardcom, #41/#42) filed in the new `docs/BACKLOG.md`. Branch `feat/products-sort-infinite-scroll`.
Previous: M06-c115 DONE (2026-10-07), M05-c115 DONE (2026-10-07), M04-c115 DONE (2026-10-07), M03-c115 BLOCKED (2026-10-07), M02-c115 BLOCKED (2026-10-07), M01-c115 BLOCKED (2026-10-07), M11-c113 DONE (2026-10-06).
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
3. The live catalogue has template rows and duplicates: 25 findings pinned in `supabase/catalogue-known-issues.json`. These are decisions for the operator.
4. `main` diverged: local `main` is 193 commits ahead of `origin/main` and 110 behind (L9), and Vercel tracks `main`. Production is not built from this branch.

## Manual items for Ofir

- Provide a usable parity reference: either restore `refs/ke_live_singlefile.html` (a self-contained SingleFile save of the old WooCommerce home) or a host that still serves the old site. Until then compare.mjs cannot produce a number (M01-c115).
- Choose one canonical host and set it in Vercel: either `NEXT_PUBLIC_APP_URL` = www, or make the apex primary (blocker 1). Then resubmit the sitemap in Search Console.
- Apply `migrations/pending/` (38+ files, including 162 cron, 209 advisors and 220). The agent never applies them.
- Reconcile local `main` with `origin/main` before the next deploy.
- Review the catalogue findings in `supabase/catalogue-known-issues.json`.
