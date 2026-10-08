RESUME FROM: M05-c120

# KenyonExpress — Project State

Last item: **M04-c120 DONE** (2026-10-08): `pnpm type-check` (`tsc --noEmit`) exit 0 at HEAD `e3f417fa2`. No drift, no code change. Unchanged from M04-c119.
M04-c120 gates (working tree, uncommitted `HeroSlider.tsx` and `SiteFooter.tsx` UI edits left unstaged): type-check 0, lint 0, test 0 (519 files, 6474 passed, 12 skipped), build 0 on attempt 1 (0 `supabase.timeout`). Not a UI item and no UI change committed, so compare.mjs was not run (it still refuses, blocker 0).
Previous: M03-c120 BLOCKED, M02-c120 BLOCKED, M01-c120 BLOCKED, M18-c119 DONE, M17-c119 BLOCKED, M16-c119 DONE, M15-c119 DONE, M14-c119 BLOCKED, M13-c119 BLOCKED, M12-c119 DONE, M11-c119 DONE, M10-c119 BLOCKED, M09-c119 DONE, M08-c119 DONE, M07-c119 DONE, M06-c119 DONE, M05-c119 DONE, M04-c119 DONE, M03-c119 BLOCKED, M02-c119 BLOCKED, M01-c119 BLOCKED, M18-c118 DONE, M17-c118 BLOCKED, M16-c118 DONE, M15-c118 DONE, M14-c118 BLOCKED, M13-c118 BLOCKED, M12-c118 DONE, M11-c118 DONE, M10-c118 BLOCKED, M09-c118 DONE, M08-c118 DONE, M07-c118 DONE, M06-c118 DONE, M05-c118 BLOCKED, M04-c118 DONE, M03-c118 BLOCKED, M02-c118 BLOCKED, M01-c118 BLOCKED, M18-c117 DONE, M17-c117 BLOCKED, M16-c117 DONE, M15-c117 DONE, M14-c117 BLOCKED, M13-c117 BLOCKED, M12-c117 DONE, M11-c117 DONE, M10-c117 BLOCKED, M09-c117 DONE, M08-c117 DONE, M07-c117 DONE, M06-c117 DONE, M05-c117 DONE, M04-c117 DONE, M03-c117 BLOCKED, M02-c117 BLOCKED, M01-c117 BLOCKED, M18-c116 DONE, M17-c116 BLOCKED, M16-c116 DONE, M15-c116 DONE, M14-c116 BLOCKED, M13-c116 BLOCKED, M12-c116 DONE, M11-c116 DONE, M10-c116 BLOCKED, M09-c116 DONE, M08-c116 DONE, M07-c116 DONE, M06-c116 DONE, M05-c116 DONE, M04-c116 DONE, M03-c116 BLOCKED, M02-c116 BLOCKED, M01-c116 BLOCKED, M18-c115 DONE, M16-c115 DONE, M15-c115 DONE, M14-c115 BLOCKED, M13-c115 BLOCKED, M12-c115 DONE, M11-c115 DONE, M10-c115 BLOCKED, M09-c115 DONE, M08-c115 DONE, M07-c115 DONE, M06-c115 DONE, M05-c115 DONE, M04-c115 DONE, M03-c115 BLOCKED, M02-c115 BLOCKED, M01-c115 BLOCKED (all 2026-10-07), M11-c113 DONE (2026-10-06).
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
| M04-c118 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change |
| M05-c118 | pnpm test, fix drift | **BLOCKED**: test exit 0, 6474 passed, no drift; build gate failed on all 9 attempts with Supabase timeouts during prerender (see archive) |
| M06-c118 | pnpm build, fix drift | **DONE**: exit 0 on attempt 1, no drift, no code change; 4 recoverable `fetch failed` reads logged (see archive) |
| M07-c118 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: re-scan found only the 2 filed Cardcom markers (B1, B2), nothing new |
| M08-c118 | Lighthouse mobile on / and /product sample, log scores | **DONE**: median perf 78 / 84, a11y 100, BP 96, SEO 100; home run 3 TBT outlier 60 (see archive) |
| M09-c118 | Remove unused deps and dead exports | **DONE**: no source change since M09-c117; 0 deps to drop, 0 dead components, same 39 kept exports, nothing deleted (see archive) |
| M10-c118 | Verify migrations/pending/ applied or file blocker | **BLOCKED**: re-probe unchanged from M10-c117, 6 live but unrecorded, 22 not applied, 231 not applied (anon reviews 401); needs Ofir (see archive) |
| M11-c118 | Verify sitemap.xml fresh and reachable | **DONE**: 5/5 section files 200, 94/94 URLs 200 on www, lastmods unchanged (see archive) |
| M12-c118 | Verify robots.txt production-safe | **DONE**: live file matches source, 0/94 sitemap URLs blocked, credential paths disallowed + noindex, unchanged from M12-c117 (see archive) |
| M13-c118 | Verify /api/health and /api/ready return 200 with real deps | **BLOCKED**: health 200, ready 503 on `meilisearch: down`, unchanged from M13-c117 (see archive) |
| M14-c118 | Verify Sentry release matches HEAD commit | **BLOCKED**: prod release still `1e84df0` (audit/final-audit), HEAD `0b7c489`, unchanged from M14-c117 (see archive) |
| M15-c118 | Verify no console errors on / and /product sample | **DONE**: prod 0 errors on both pages at 380 and 1440, unchanged from M15-c117; local errors are env-only (see archive) |
| M16-c118 | Verify all product pages have JSON-LD Product and BreadcrumbList | **DONE**: 44/44 prod, 46/46 HEAD, both nodes valid; same 3 image-less rows lack `image`, unchanged from M16-c117 (see archive) |
| M17-c118 | Verify RTL on / and /product sample, no LTR leaks | **BLOCKED**: 42/42 runs RTL-clean except the same footer newsletter placeholder, flush left in prod; uncommitted fix clean locally but compare.mjs refuses (exit 5 x6, blocker 0) (see archive) |
| M18-c118 | Trim STATE.md under 300 lines, archive rest | **DONE**: already 117 lines at start, no trim needed; 2 M17-c118 status lines moved to `docs/STATE-ARCHIVE.md` |
| M01-c119 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: exit 5 at all three widths, gate refuses, no reference (see archive) |
| M02-c119 | Re-measure compare.mjs on /product | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M03-c119 | Re-measure compare.mjs on /category | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M04-c119 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change |
| M05-c119 | pnpm test, fix drift | **DONE**: exit 0, 6474 passed, 12 skipped, no drift, no code change |
| M06-c119 | pnpm build, fix drift | **DONE**: exit 0 on attempt 1, no drift, no code change; 1 transient `fetch failed` on `reviews` recovered |
| M07-c119 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: re-scan found only the 2 filed Cardcom markers (B1, B2), nothing new |
| M08-c119 | Lighthouse mobile on / and /product sample, log scores | **DONE**: median perf 79 / 84, a11y 100, BP 96, SEO 100; home run 2 TBT outlier 65; build needed 5 attempts (see archive) |
| M09-c119 | Remove unused deps and dead exports | **DONE**: no source change since M09-c118; 0 deps to drop, 0 dead components, same 39 kept exports, nothing deleted (see archive) |
| M10-c119 | Verify migrations/pending/ applied or file blocker | **BLOCKED**: re-probe unchanged from M10-c118, 6 live but unrecorded, 22 not applied, 231 not applied (anon reviews 401); needs Ofir (see archive) |
| M11-c119 | Verify sitemap.xml fresh and reachable | **DONE**: 5/5 section files 200, 94/94 URLs 200 on www first pass, lastmods unchanged (see archive) |
| M12-c119 | Verify robots.txt production-safe | **DONE**: live file matches source, 0/94 sitemap URLs blocked, credential paths disallowed + noindex, unchanged from M12-c118 (see archive) |
| M13-c119 | Verify /api/health and /api/ready return 200 with real deps | **BLOCKED**: health 200, ready 503 on `meilisearch: down`, unchanged from M13-c118 (see archive) |
| M14-c119 | Verify Sentry release matches HEAD commit | **BLOCKED**: `www` release still `1e84df0` (audit/final-audit), HEAD `1a72557`; new `kenyonexpress-prod` project deploys `main@3969d3e` but is not what `www` serves (see archive) |
| M15-c119 | Verify no console errors on / and /product sample | **DONE**: prod 0 errors on both pages at 380 and 1440, unchanged from M15-c118; local errors are env-only (see archive) |
| M16-c119 | Verify all product pages have JSON-LD Product and BreadcrumbList | **DONE**: 44/44 prod, 46/46 HEAD, both nodes valid; same 3 image-less rows lack `image`, unchanged from M16-c118 (see archive) |
| M17-c119 | Verify RTL on / and /product sample, no LTR leaks | **BLOCKED**: 42/42 runs RTL-clean except the same footer newsletter placeholder, flush left in prod; uncommitted fix clean locally but compare.mjs refuses (exit 5 x6, blocker 0) (see archive) |
| M18-c119 | Trim STATE.md under 300 lines, archive rest | **DONE**: already 135 lines at start, no trim needed; 2 M17-c119 status lines moved to `docs/STATE-ARCHIVE.md` |
| M01-c120 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: exit 5 at all three widths, gate refuses, no reference (see archive) |
| M02-c120 | Re-measure compare.mjs on /product | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference; build gate also failed 6/6 on Supabase timeouts (see archive) |
| M03-c120 | Re-measure compare.mjs on /category | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference; build gate also failed 3/3 on Supabase timeouts (see archive) |
| M04-c120 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change; build 0 on attempt 1 |

## Open blockers

0. **The parity gate has no reference (M01-c115).** `compare.mjs` exits 5 at every width because `kenyonexpress.co.il` serves our build and `refs/ke_live_singlefile.html` does not exist. No UI item can show it is under 11% until a working reference is restored. Re-confirmed for `/` in M01-c119 and M01-c120, for `/product` in M02-c115, M02-c116, M02-c117, M02-c118, M02-c119 and M02-c120 and `/category` in M03-c115, M03-c116, M03-c117, M03-c118, M03-c119 and M03-c120 (see `docs/PARITY-REFERENCE.md`). It also blocks committing the footer newsletter placeholder RTL fix (M17-c116, re-confirmed M17-c117, M17-c118 and M17-c119).
1. **Apex vs www host mismatch (known since SECTIONS 21, still open).** Vercel serves `www` and redirects the apex with a 308. The site declares the apex as canonical: every sitemap `<loc>`, the robots `Sitemap:` line, `og:url` and canonicals all use `https://kenyonexpress.co.il` (from `NEXT_PUBLIC_APP_URL`, with the `layout.tsx` default). So all 94 sitemap URLs cost one 308 hop before they reach a 200. Fixing it means either setting `NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il` in Vercel or making the apex the primary domain in Vercel. Both are Vercel env or domain changes, which the agent is not allowed to make.
2. Scheduled jobs (cron) do not run until migration 162 is applied. See the M10-c115 section in the archive.
6. **`/api/ready` is 503 in production (M13-c115).** `meilisearch: down`: `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are set, but the host does not answer `/health`. `/api/health` is 200. Re-confirmed unchanged in M13-c116, M13-c117, M13-c118 and M13-c119.
7. **The build gate fails on Supabase reachability (M05-c118).** `pnpm build` prerenders against live Supabase. On 2026-10-07 all 9 attempts failed on `SupabaseTimeoutError` or `fetch failed`, at `/product/e2e-test-physical`, `/coupons/[id]` and the content_pages, product_detail and product_seo reads. A bare `curl` to the REST root took 10.5s once and then about 1.5s. Retry the build when the network is stable. No code change is indicated. M06-c118 (2026-10-08) built cleanly on the first attempt, so this is intermittent. Keep it open and watch the next build gate. M06-c119 (2026-10-08) also built cleanly on attempt 1. M02-c120 (2026-10-08) failed all 6 attempts on Supabase timeouts (13 to 150 `supabase.timeout` per attempt; a bare REST `curl` took 3.6 s). M03-c120 (2026-10-08) failed all 3 attempts on Supabase timeouts (4, 28 and 86 per attempt). M04-c120 (2026-10-08) built cleanly on attempt 1 with 0 timeouts. M08-c119 (2026-10-08) needed 5 attempts: 2 failed on Supabase timeouts at `/coupons/[id]` and 2 on `next/font` failing to reach Google Fonts, so the flakiness is the network and not only Supabase.
5. **Pending migrations are not applied (M10-c115, re-confirmed M10-c116, M10-c117, M10-c118 and M10-c119).** 22 numbered files are confirmed absent from production, plus `231` (written in M06-c117), and 6 (`189`, `190`, `191`, `194`, `197` and `201`) are live but not recorded as applied. Only Ofir applies migrations, and the bookkeeping for the 6 needs a `schema_migrations` read, which needs the Supabase MCP or a DB URL.
3. The live catalogue has template rows and duplicates: 25 findings pinned in `supabase/catalogue-known-issues.json`. These are decisions for the operator.
4. `main` diverged: local `main` is 193 commits ahead of `origin/main` and 110 behind (L9). Production is not built from this branch: as of M14-c115 the live client bundle's Sentry release is `1e84df0e5`, the tip of `origin/audit/final-audit`, not `origin/main`, so the Sentry release does not match HEAD `b29fcbf1f`. Re-confirmed in M14-c116 against HEAD `bf55da262` in M14-c117 against HEAD `cbe88c536`, in M14-c118 against HEAD `0b7c489a0` and in M14-c119 against HEAD `1a72557ca`. M14-c119 found a second Vercel project, `kenyonexpress-prod`, deploying `main` to production (`3969d3e25`, 2026-10-07); `www` still serves `kenyonexpress@1e84df0e5`.

## Manual items for Ofir

- Apply `migrations/pending/231_reviews_anon_select.sql` after 189 and 222 (M06-c117). Production `anon` cannot read `reviews` (42501), so guests see no ratings once reviews exist. Check: the anon key on `/rest/v1/reviews?select=id,rating&status=eq.approved&limit=1` returns 200.
- Decide on the uncommitted `SiteFooter.tsx` edit. It fixes the one RTL leak M17-c116 found (still live in M17-c117, M17-c118 and M17-c119): the footer email placeholder renders flush left and, on HEAD, in flipped order. The agent cannot commit it while compare.mjs has no reference. Commit it yourself, or restore the reference first.

- Provide a usable parity reference: either restore `refs/ke_live_singlefile.html` (a self-contained SingleFile save of the old WooCommerce home) or a host that still serves the old site. Until then compare.mjs cannot produce a number (M01-c115, re-confirmed M01-c116, M01-c117, M01-c118, M01-c119, M01-c120, M02-c116, M02-c117, M02-c118, M02-c119, M02-c120, M03-c116, M03-c117, M03-c118, M03-c119 and M03-c120).
- Choose one canonical host and set it in Vercel: either `NEXT_PUBLIC_APP_URL` = www, or make the apex primary (blocker 1). Then resubmit the sitemap in Search Console.
- Apply `migrations/pending/` following `APPLY-ORDER.md`. As of M10-c115, 22 files are confirmed not live, including 162 cron, 228 `job_runs` and most of 202–227 (the list is in the M10-c115 section of the archive). Do not apply `200`.
- Confirm that `189`, `190`, `191`, `194`, `197` and `201` are in `supabase_migrations.schema_migrations`. If they are, move them to `migrations/applied/` with README rows. Their objects are already live (M10-c115). Also re-authorise the Supabase MCP so agents can read `schema_migrations`.
- Fix Meilisearch for `/api/ready` (M13-c115). Either bring the configured instance back up, or remove `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` from Vercel production so search falls back to Postgres. Then re-probe `/api/ready` and expect 200.
- Reconcile local `main` with `origin/main` before the next deploy.
- Decide which branch production deploys from. Live is `audit/final-audit@1e84df0e5` (M14-c115, still so in M14-c119). Vercel project `kenyonexpress-prod` now deploys `main` to production (`3969d3e25`); if that is the intended production, move the `www` domain to it. Deploy the branch you want live, then re-check that the client bundle's Sentry release equals that commit SHA. If you want server-side proof, look up the release list in the Sentry UI.
- Review the catalogue findings in `supabase/catalogue-known-issues.json`.
- Add at least one image to `מזקקת-ויסקי`. Without it, its JSON-LD `Product` has no `image` and Google Merchant listings skip it (M16-c115).
- Set `e2e-test-physical` and `e2e-test-coupon` to draft, or exclude test fixtures from the sitemap, before the next deploy. They are active in the live DB and HEAD's sitemap lists them (M16-c115).
