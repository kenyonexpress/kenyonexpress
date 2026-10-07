RESUME FROM: M04-c118

# KenyonExpress — Project State

Last item: **M03-c118 BLOCKED** (2026-10-07): compare.mjs on `/category` exits 5 (REFUSED, no diff number) at 380, 768 and 1440. `https://kenyonexpress.co.il/product-category/hot-deals/` is our own build (38 `/_next/` refs, 0 wp-content) and `refs/ke_live_singlefile.html` is still absent. Unchanged from M03-c117; open blocker 0. No code change. Detail in `docs/STATE-ARCHIVE.md`.
M03-c118 gates (working tree, uncommitted UI edits unstaged): type-check 0, lint 0, test 0 (519 files, 6474 passed, 12 skipped), build 0 on attempt 1.
Previous: M02-c118 BLOCKED, M01-c118 BLOCKED, M18-c117 DONE, M17-c117 BLOCKED, M16-c117 DONE, M15-c117 DONE, M14-c117 BLOCKED, M13-c117 BLOCKED, M12-c117 DONE, M11-c117 DONE, M10-c117 BLOCKED, M09-c117 DONE, M08-c117 DONE, M07-c117 DONE, M06-c117 DONE, M05-c117 DONE, M04-c117 DONE, M03-c117 BLOCKED, M02-c117 BLOCKED, M01-c117 BLOCKED, M18-c116 DONE, M17-c116 BLOCKED, M16-c116 DONE, M15-c116 DONE, M14-c116 BLOCKED, M13-c116 BLOCKED, M12-c116 DONE, M11-c116 DONE, M10-c116 BLOCKED, M09-c116 DONE, M08-c116 DONE, M07-c116 DONE, M06-c116 DONE, M05-c116 DONE, M04-c116 DONE, M03-c116 BLOCKED, M02-c116 BLOCKED, M01-c116 BLOCKED, M18-c115 DONE, M16-c115 DONE, M15-c115 DONE, M14-c115 BLOCKED, M13-c115 BLOCKED, M12-c115 DONE, M11-c115 DONE, M10-c115 BLOCKED, M09-c115 DONE, M08-c115 DONE, M07-c115 DONE, M06-c115 DONE, M05-c115 DONE, M04-c115 DONE, M03-c115 BLOCKED, M02-c115 BLOCKED, M01-c115 BLOCKED (all 2026-10-07), M11-c113 DONE (2026-10-06).
Detail for every item lives in `docs/STATE-ARCHIVE.md`.

## Queue status (cycle c113)

The runner's `final-done.txt` lists M01–M10 of c113 as finished. This branch's git log has no commits for them, so they are recorded here as runner-reported and not re-verified.

| ID | Item | Status |
|---|---|---|
| M01–M10-c113 | compare / type-check / test / build / TODO / Lighthouse / deps / migrations | runner-reported done, no commit on this branch |
| M11-c113 | Verify sitemap.xml fresh and reachable | **DONE**, see archive |
| M12-c113 | Verify robots.txt production-safe | superseded by M12-c115 |
| M13–M18-c113 | health, Sentry, console, JSON-LD, RTL, STATE trim | pending |
| M01-c115 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: gate refuses, no reference (see archive) |
| M02-c115 | Re-measure compare.mjs on /product | **BLOCKED**: gate refuses, no reference (see archive) |
| M03-c115 | Re-measure compare.mjs on /category | **BLOCKED**: gate refuses, no reference (see archive) |
| M04-c115 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change (see archive) |
| M05-c115 | pnpm test, fix drift | **DONE**: exit 0, no drift, no code change (see archive) |
| M06-c115 | pnpm build, fix drift | **DONE**: exit 0 on attempt 4, no drift, no code change (see archive) |
| M07-c115 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: 1 resolved, 2 filed (see archive) |
| M08-c115 | Lighthouse mobile on / and /product sample, log scores | **DONE**: perf 82 / 84 median, a11y 100, BP 96, SEO 100 (see archive) |
| M09-c115 | Remove unused deps and dead exports | **DONE**: 9 deps removed, 14 dead components deleted (see archive) |
| M10-c115 | Verify migrations/pending/ applied or file blocker | **BLOCKED**: 22 files confirmed not applied, 6 live but unrecorded (see archive) |
| M11-c115 | Verify sitemap.xml fresh and reachable | **DONE**: 5/5 section files 200, 94/94 URLs 200 on www (see archive) |
| M12-c115 | Verify robots.txt production-safe | **DONE**: 0/94 sitemap URLs blocked, credential paths disallowed, robots edits committed (see archive) |
| M13-c115 | Verify /api/health and /api/ready return 200 with real deps | **BLOCKED**: health 200, ready 503 on `meilisearch: down` (see archive) |
| M14-c115 | Verify Sentry release matches HEAD commit | **BLOCKED**: prod release `1e84df0` (audit/final-audit), HEAD `b29fcbf` (see archive) |
| M15-c115 | Verify no console errors on / and /product sample | **DONE**: prod 0 errors on both pages at 380 and 1440; local errors come only from the environment (see archive) |
| M16-c115 | Verify all product pages have JSON-LD Product and BreadcrumbList | **DONE**: 44/44 prod, 46/46 HEAD, both nodes valid; 3 image-less rows have no `image` (see archive) |
| M17-c115 | RTL | superseded by M17-c116 |
| M18-c115 | Trim STATE.md under 300 lines, archive rest | **DONE**: per-item sections moved to `docs/STATE-ARCHIVE.md` |
| M01-c116 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: exit 5 at all three widths, gate refuses, no reference (see archive) |
| M02-c116 | Re-measure compare.mjs on /product | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M03-c116 | Re-measure compare.mjs on /category | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M04-c116 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change (see archive) |
| M05-c116 | pnpm test, fix drift | **DONE**: exit 0, 6473 passed, no drift, no code change (see archive) |
| M06-c116 | pnpm build, fix drift | **DONE**: exit 0 on attempt 4; fixed 254 false `db.query_failed` logs from the prerender abort (see archive) |
| M07-c116 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: re-scan found only the 2 filed Cardcom markers (B1, B2), nothing new |
| M08-c116 | Lighthouse mobile on / and /product sample, log scores | **DONE**: median perf 82 / 84, a11y 100, BP 96, SEO 100 (see archive) |
| M09-c116 | Remove unused deps and dead exports | **DONE**: 0 deps to drop; 4 dead modules and 9 dead exports deleted (see archive) |
| M10-c116 | Verify migrations/pending/ applied or file blocker | **BLOCKED**: re-probe unchanged, 6 live but unrecorded, 22 not applied; needs Ofir (see archive) |
| M11-c116 | Verify sitemap.xml fresh and reachable | **DONE**: 5/5 section files 200, 94/94 URLs 200 on www, lastmods unchanged (see archive) |
| M12-c116 | Verify robots.txt production-safe | **DONE**: live file matches source, 0/94 sitemap URLs blocked, credential paths disallowed + noindex (see archive) |
| M13-c116 | Verify /api/health and /api/ready return 200 with real deps | **BLOCKED**: health 200, ready 503 on `meilisearch: down`, unchanged from M13-c115 (see archive) |
| M14-c116 | Verify Sentry release matches HEAD commit | **BLOCKED**: prod release still `1e84df0` (audit/final-audit), HEAD `bf55da2`, unchanged from M14-c115 (see archive) |
| M15-c116 | Verify no console errors on / and /product sample | **DONE**: prod 0 errors on both pages at 380 and 1440, unchanged from M15-c115; local errors are env-only (see archive) |
| M16-c116 | Verify all product pages have JSON-LD Product and BreadcrumbList | **DONE**: 44/44 prod, 46/46 HEAD, both nodes valid; same 3 image-less rows lack `image`, unchanged from M16-c115 (see archive) |
| M17-c116 | Verify RTL on / and /product sample, no LTR leaks | **BLOCKED**: one leak, the footer newsletter placeholder is flush left in an LTR field; the uncommitted fix cannot pass compare.mjs (exit 5, blocker 0) (see archive) |
| M18-c116 | Trim STATE.md under 300 lines, archive rest | **DONE**: already 80 lines at start, no trim needed; 3 stale status lines moved to `docs/STATE-ARCHIVE.md` |
| M01-c117 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: exit 5 at all three widths, gate refuses, no reference (see archive) |
| M02-c117 | Re-measure compare.mjs on /product | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M03-c117 | Re-measure compare.mjs on /category | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M04-c117 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change |
| M05-c117 | pnpm test, fix drift | **DONE**: exit 0, 6474 passed, 12 skipped, no drift, no code change |
| M06-c117 | pnpm build, fix drift | **DONE**: exit 0; anon 42501 on `reviews` found, fix written as pending 231 (see archive) |
| M07-c117 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: re-scan found only the 2 filed Cardcom markers (B1, B2), nothing new |
| M08-c117 | Lighthouse mobile on / and /product sample, log scores | **DONE**: median perf 80 / 84, a11y 100, BP 96, SEO 100; home run 1 cold outlier 59 (see archive) |
| M09-c117 | Remove unused deps and dead exports | **DONE**: 0 deps to drop; `lib/search.ts` and 2 dead exports deleted (see archive) |
| M10-c117 | Verify migrations/pending/ applied or file blocker | **BLOCKED**: re-probe unchanged, 6 live but unrecorded, 22 not applied, new 231 not applied (anon reviews 401); needs Ofir (see archive) |
| M11-c117 | Verify sitemap.xml fresh and reachable | **DONE**: 5/5 section files 200, 94/94 URLs 200 on www, lastmods unchanged (see archive) |
| M12-c117 | Verify robots.txt production-safe | **DONE**: live file matches source, 0/94 sitemap URLs blocked, credential paths disallowed + noindex, unchanged from M12-c116 (see archive) |
| M13-c117 | Verify /api/health and /api/ready return 200 with real deps | **BLOCKED**: health 200, ready 503 on `meilisearch: down`, unchanged from M13-c116 (see archive) |
| M14-c117 | Verify Sentry release matches HEAD commit | **BLOCKED**: prod release still `1e84df0` (audit/final-audit), HEAD `cbe88c5`, unchanged from M14-c116 (see archive) |
| M15-c117 | Verify no console errors on / and /product sample | **DONE**: prod 0 errors on both pages at 380 and 1440, unchanged from M15-c116; local errors are env-only (see archive) |
| M16-c117 | Verify all product pages have JSON-LD Product and BreadcrumbList | **DONE**: 44/44 prod, 46/46 HEAD, both nodes valid; same 3 image-less rows lack `image`, unchanged from M16-c116 (see archive) |
| M17-c117 | Verify RTL on / and /product sample, no LTR leaks | **BLOCKED**: 42/42 runs RTL-clean except the same footer newsletter placeholder, flush left; uncommitted fix still cannot pass compare.mjs (exit 5 x6, blocker 0) (see archive) |
| M18-c117 | Trim STATE.md under 300 lines, archive rest | **DONE**: already 98 lines at start, no trim needed; 2 M17-c117 status lines moved to `docs/STATE-ARCHIVE.md` |
| M01-c118 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: exit 5 at all three widths, gate refuses, no reference (see archive) |
| M02-c118 | Re-measure compare.mjs on /product | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M03-c118 | Re-measure compare.mjs on /category | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |

## Open blockers

0. **The parity gate has no reference (M01-c115).** `compare.mjs` exits 5 at every width because `kenyonexpress.co.il` serves our build and `refs/ke_live_singlefile.html` does not exist. No UI item can show it is under 11% until a working reference is restored. Re-confirmed for `/product` in M02-c115, M02-c116, M02-c117 and M02-c118 and `/category` in M03-c115, M03-c116, M03-c117 and M03-c118 (see `docs/PARITY-REFERENCE.md`). It also blocks committing the footer newsletter placeholder RTL fix (M17-c116, re-confirmed M17-c117).
1. **Apex vs www host mismatch (known since SECTIONS 21, still open).** Vercel serves `www` and redirects the apex with a 308. The site declares the apex as canonical: every sitemap `<loc>`, the robots `Sitemap:` line, `og:url` and canonicals all use `https://kenyonexpress.co.il` (from `NEXT_PUBLIC_APP_URL`, with the `layout.tsx` default). So all 94 sitemap URLs cost one 308 hop before they reach a 200. Fixing it means either setting `NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il` in Vercel or making the apex the primary domain in Vercel. Both are Vercel env or domain changes, which the agent is not allowed to make.
2. Scheduled jobs (cron) do not run until migration 162 is applied. See the M10-c115 section in the archive.
6. **`/api/ready` is 503 in production (M13-c115).** `meilisearch: down`: `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are set, but the host does not answer `/health`. `/api/health` is 200. Re-confirmed unchanged in M13-c116 and M13-c117.
5. **Pending migrations are not applied (M10-c115, re-confirmed M10-c116 and M10-c117).** 22 numbered files are confirmed absent from production, plus `231` (written in M06-c117), and 6 (`189`, `190`, `191`, `194`, `197` and `201`) are live but not recorded as applied. Only Ofir applies migrations, and the bookkeeping for the 6 needs a `schema_migrations` read, which needs the Supabase MCP or a DB URL.
3. The live catalogue has template rows and duplicates: 25 findings pinned in `supabase/catalogue-known-issues.json`. These are decisions for the operator.
4. `main` diverged: local `main` is 193 commits ahead of `origin/main` and 110 behind (L9). Production is not built from this branch: as of M14-c115 the live client bundle's Sentry release is `1e84df0e5`, the tip of `origin/audit/final-audit`, not `origin/main`, so the Sentry release does not match HEAD `b29fcbf1f`. Re-confirmed in M14-c116 against HEAD `bf55da262` and in M14-c117 against HEAD `cbe88c536`.

## Manual items for Ofir

- Apply `migrations/pending/231_reviews_anon_select.sql` after 189 and 222 (M06-c117). Production `anon` cannot read `reviews` (42501), so guests see no ratings once reviews exist. Check: the anon key on `/rest/v1/reviews?select=id,rating&status=eq.approved&limit=1` returns 200.
- Decide on the uncommitted `SiteFooter.tsx` edit. It fixes the one RTL leak M17-c116 found (still live in M17-c117): the footer email placeholder renders flush left and, on HEAD, in flipped order. The agent cannot commit it while compare.mjs has no reference. Commit it yourself, or restore the reference first.

- Provide a usable parity reference: either restore `refs/ke_live_singlefile.html` (a self-contained SingleFile save of the old WooCommerce home) or a host that still serves the old site. Until then compare.mjs cannot produce a number (M01-c115, re-confirmed M01-c116, M01-c117, M01-c118, M02-c116, M02-c117, M02-c118, M03-c116, M03-c117 and M03-c118).
- Choose one canonical host and set it in Vercel: either `NEXT_PUBLIC_APP_URL` = www, or make the apex primary (blocker 1). Then resubmit the sitemap in Search Console.
- Apply `migrations/pending/` following `APPLY-ORDER.md`. As of M10-c115, 22 files are confirmed not live, including 162 cron, 228 `job_runs` and most of 202–227 (the list is in the M10-c115 section of the archive). Do not apply `200`.
- Confirm that `189`, `190`, `191`, `194`, `197` and `201` are in `supabase_migrations.schema_migrations`. If they are, move them to `migrations/applied/` with README rows. Their objects are already live (M10-c115). Also re-authorise the Supabase MCP so agents can read `schema_migrations`.
- Fix Meilisearch for `/api/ready` (M13-c115). Either bring the configured instance back up, or remove `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` from Vercel production so search falls back to Postgres. Then re-probe `/api/ready` and expect 200.
- Reconcile local `main` with `origin/main` before the next deploy.
- Decide which branch production deploys from. Live is `audit/final-audit@1e84df0e5` (M14-c115). Deploy the branch you want live, then re-check that the client bundle's Sentry release equals that commit SHA. If you want server-side proof, look up the release list in the Sentry UI.
- Review the catalogue findings in `supabase/catalogue-known-issues.json`.
- Add at least one image to `מזקקת-ויסקי`. Without it, its JSON-LD `Product` has no `image` and Google Merchant listings skip it (M16-c115).
- Set `e2e-test-physical` and `e2e-test-coupon` to draft, or exclude test fixtures from the sitemap, before the next deploy. They are active in the live DB and HEAD's sitemap lists them (M16-c115).
