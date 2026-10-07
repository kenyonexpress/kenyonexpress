RESUME FROM: M02-c115

# KenyonExpress — Project State

Last item: **M01-c115 BLOCKED** (2026-10-07): compare.mjs refuses at 380, 768 and 1440 because the live host is our own build, so there is no reference to diff against. Branch `feat/products-sort-infinite-scroll`.
Previous: M11-c113 DONE (2026-10-06).
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

0. **The parity gate has no reference (M01-c115).** `compare.mjs` exits 5 at every width because `kenyonexpress.co.il` serves our build and `refs/ke_live_singlefile.html` does not exist. No UI item can show it is under 11% until a working reference is restored (see `docs/PARITY-REFERENCE.md`).
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
