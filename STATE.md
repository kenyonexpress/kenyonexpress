RESUME FROM: M09-c116

# KenyonExpress — Project State

Last item: **M08-c116 DONE** (2026-10-07): Lighthouse mobile on `/` and `/product/מוצר-לדוגמא`, 3 runs each, on a fresh local production build of HEAD `c20e54637` (plus the two uncommitted UI edits). **Median Performance: home 82, product 84**, the same as M08-c115. Accessibility 100, Best Practices 96 (local-only console errors) and SEO 100 on all 6 runs. The full table is in the archive.
Decision: c116 re-measures, so the scores were re-taken and not copied from M08-c115. No code change. Line 1 moves to `RESUME FROM: M09-c116`. The uncommitted `HeroSlider.tsx` and `SiteFooter.tsx` edits and `logs/` are still left alone.
M08-c116 gates (working tree incl. those two edits): `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6474 passed, 12 skipped), `pnpm build` 0 on attempt 1. Not a UI change, so compare.mjs does not apply (blocked anyway, blocker 0).
Previous: M07-c116 DONE, M06-c116 DONE, M05-c116 DONE, M04-c116 DONE, M03-c116 BLOCKED, M02-c116 BLOCKED, M01-c116 BLOCKED, M18-c115 DONE, M16-c115 DONE, M15-c115 DONE, M14-c115 BLOCKED, M13-c115 BLOCKED, M12-c115 DONE, M11-c115 DONE, M10-c115 BLOCKED, M09-c115 DONE, M08-c115 DONE, M07-c115 DONE, M06-c115 DONE, M05-c115 DONE, M04-c115 DONE, M03-c115 BLOCKED, M02-c115 BLOCKED, M01-c115 BLOCKED (all 2026-10-07), M11-c113 DONE (2026-10-06).
Detail for every item lives in `docs/STATE-ARCHIVE.md`.
M18-c115 gates: `pnpm type-check` 0, `pnpm lint` 0, `pnpm test` 0 (519 files, 6473 passed, 12 skipped), `pnpm build` 0 on attempt 1. These ran on the working tree, which still had the two uncommitted UI edits. Not a UI change, so compare.mjs does not apply (it is blocked anyway, blocker 0).

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
| M17-c115 | RTL | pending, no record on this branch |
| M18-c115 | Trim STATE.md under 300 lines, archive rest | **DONE**: per-item sections moved to `docs/STATE-ARCHIVE.md` |
| M01-c116 | Re-measure compare.mjs 380/768/1440 on / | **BLOCKED**: exit 5 at all three widths, gate refuses, no reference (see archive) |
| M02-c116 | Re-measure compare.mjs on /product | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M03-c116 | Re-measure compare.mjs on /category | **BLOCKED**: exit 5 at 380/768/1440, gate refuses, no reference (see archive) |
| M04-c116 | pnpm type-check, fix drift | **DONE**: exit 0, no drift, no code change (see archive) |
| M05-c116 | pnpm test, fix drift | **DONE**: exit 0, 6473 passed, no drift, no code change (see archive) |
| M06-c116 | pnpm build, fix drift | **DONE**: exit 0 on attempt 4; fixed 254 false `db.query_failed` logs from the prerender abort (see archive) |
| M07-c116 | TODO/FIXME older than 7 days: resolve or file in docs/BACKLOG.md | **DONE**: re-scan found only the 2 filed Cardcom markers (B1, B2), nothing new |
| M08-c116 | Lighthouse mobile on / and /product sample, log scores | **DONE**: median perf 82 / 84, a11y 100, BP 96, SEO 100 (see archive) |

## Open blockers

0. **The parity gate has no reference (M01-c115).** `compare.mjs` exits 5 at every width because `kenyonexpress.co.il` serves our build and `refs/ke_live_singlefile.html` does not exist. No UI item can show it is under 11% until a working reference is restored. Re-confirmed for `/product` in M02-c115 and M02-c116 and `/category` in M03-c115 and M03-c116 (see `docs/PARITY-REFERENCE.md`).
1. **Apex vs www host mismatch (known since SECTIONS 21, still open).** Vercel serves `www` and redirects the apex with a 308. The site declares the apex as canonical: every sitemap `<loc>`, the robots `Sitemap:` line, `og:url` and canonicals all use `https://kenyonexpress.co.il` (from `NEXT_PUBLIC_APP_URL`, with the `layout.tsx` default). So all 94 sitemap URLs cost one 308 hop before they reach a 200. Fixing it means either setting `NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il` in Vercel or making the apex the primary domain in Vercel. Both are Vercel env or domain changes, which the agent is not allowed to make.
2. Scheduled jobs (cron) do not run until migration 162 is applied. See the M10-c115 section in the archive.
6. **`/api/ready` is 503 in production (M13-c115).** `meilisearch: down`: `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` are set, but the host does not answer `/health`. `/api/health` is 200.
5. **Pending migrations are not applied (M10-c115).** 22 numbered files are confirmed absent from production, and 6 (`189`, `190`, `191`, `194`, `197` and `201`) are live but not recorded as applied. Only Ofir applies migrations, and the bookkeeping for the 6 needs a `schema_migrations` read, which needs the Supabase MCP or a DB URL.
3. The live catalogue has template rows and duplicates: 25 findings pinned in `supabase/catalogue-known-issues.json`. These are decisions for the operator.
4. `main` diverged: local `main` is 193 commits ahead of `origin/main` and 110 behind (L9). Production is not built from this branch: as of M14-c115 the live client bundle's Sentry release is `1e84df0e5`, the tip of `origin/audit/final-audit`, not `origin/main`, so the Sentry release does not match HEAD `b29fcbf1f`.

## Manual items for Ofir

- Provide a usable parity reference: either restore `refs/ke_live_singlefile.html` (a self-contained SingleFile save of the old WooCommerce home) or a host that still serves the old site. Until then compare.mjs cannot produce a number (M01-c115, re-confirmed M01-c116, M02-c116 and M03-c116).
- Choose one canonical host and set it in Vercel: either `NEXT_PUBLIC_APP_URL` = www, or make the apex primary (blocker 1). Then resubmit the sitemap in Search Console.
- Apply `migrations/pending/` following `APPLY-ORDER.md`. As of M10-c115, 22 files are confirmed not live, including 162 cron, 228 `job_runs` and most of 202–227 (the list is in the M10-c115 section of the archive). Do not apply `200`.
- Confirm that `189`, `190`, `191`, `194`, `197` and `201` are in `supabase_migrations.schema_migrations`. If they are, move them to `migrations/applied/` with README rows. Their objects are already live (M10-c115). Also re-authorise the Supabase MCP so agents can read `schema_migrations`.
- Fix Meilisearch for `/api/ready` (M13-c115). Either bring the configured instance back up, or remove `MEILISEARCH_HOST` and `MEILISEARCH_API_KEY` from Vercel production so search falls back to Postgres. Then re-probe `/api/ready` and expect 200.
- Reconcile local `main` with `origin/main` before the next deploy.
- Decide which branch production deploys from. Live is `audit/final-audit@1e84df0e5` (M14-c115). Deploy the branch you want live, then re-check that the client bundle's Sentry release equals that commit SHA. If you want server-side proof, look up the release list in the Sentry UI.
- Review the catalogue findings in `supabase/catalogue-known-issues.json`.
- Add at least one image to `מזקקת-ויסקי`. Without it, its JSON-LD `Product` has no `image` and Google Merchant listings skip it (M16-c115).
- Set `e2e-test-physical` and `e2e-test-coupon` to draft, or exclude test fixtures from the sitemap, before the next deploy. They are active in the live DB and HEAD's sitemap lists them (M16-c115).
