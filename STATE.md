RESUME FROM: M12-c113

# KenyonExpress — Project State

Last item: **M11-c113 DONE** (2026-10-06). Branch `feat/products-sort-infinite-scroll`.
History before this item lives in `docs/STATE-ARCHIVE.md` (21,138 lines moved there in this commit).

## Queue status (cycle c113)

The runner's `final-done.txt` lists M01–M10 of c113 as finished. This branch's git log has no commits for them, so they are recorded here as runner-reported and not re-verified.

| ID | Item | Status |
|---|---|---|
| M01–M10-c113 | compare / type-check / test / build / TODO / Lighthouse / deps / migrations | runner-reported done, no commit on this branch |
| M11-c113 | Verify sitemap.xml fresh and reachable | **DONE**, see below |
| M12-c113 | Verify robots.txt production-safe | next |
| M13–M18-c113 | health, Sentry, console, JSON-LD, RTL, STATE trim | pending |

## M11-c113: sitemap.xml, measured 2026-10-06 13:17 UTC against production

- `https://www.kenyonexpress.co.il/sitemap.xml` returns 200 `application/xml`. It is a `<sitemapindex>` that lists 5 section files.
- Every section file returns 200: content 15 URLs, categories 12, products 44, regions 17, suppliers 6, for 94 URLs in total.
- Freshness: the routes are dynamic (`cache-control: public, max-age=0, must-revalidate` at the browser). The newest lastmod values are content 2026-10-05, categories 2026-09-08, products 2026-09-08 and suppliers 2026-08-31. Regions has no lastmod on purpose because there is no time signal for them (see archive, SECTIONS 21). Each lastmod is the row's real `updated_at`, so an old date means the row has not changed. It does not mean the sitemap is stale.
- Reachability: all 94 `<loc>` URLs return **200** on `www`.
- `robots.txt` has the line `Sitemap: https://kenyonexpress.co.il/sitemap.xml`.
- No code change was needed. Gates before commit: `pnpm type-check` exit 0; `pnpm lint` exit 0; `pnpm test` exit 0 (519 files, 6471 passed, 12 skipped); `pnpm build` exit 0.
- Housekeeping in the same commit: STATE.md archived to `docs/STATE-ARCHIVE.md`; the new doc is listed in `docs/INDEX.md` (the Audits count is fixed to 26, it already said 24 with 25 rows) and in README (261 docs); its historical dangling paths are ledgered in `docs/known-dangling-paths.json`.

## Open blockers

1. **Apex vs www host mismatch (known since SECTIONS 21, still open).** Vercel serves `www` and redirects the apex with a 308. The site declares the apex as canonical: every sitemap `<loc>`, the robots `Sitemap:` line, `og:url` and canonicals all use `https://kenyonexpress.co.il` (from `NEXT_PUBLIC_APP_URL`, with the `layout.tsx` default). So all 94 sitemap URLs cost one 308 hop before they reach a 200. Fixing it means either setting `NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il` in Vercel or making the apex the primary domain in Vercel. Both are Vercel env or domain changes, which the agent is not allowed to make.
2. Scheduled jobs (cron) do not run until migration 162 is applied. See below.
3. The live catalogue has template rows and duplicates: 25 findings pinned in `supabase/catalogue-known-issues.json`. These are decisions for the operator.
4. `main` diverged: local `main` is 193 commits ahead of `origin/main` and 110 behind (L9), and Vercel tracks `main`. Production is not built from this branch.

## Manual items for Ofir

- Choose one canonical host and set it in Vercel: either `NEXT_PUBLIC_APP_URL` = www, or make the apex primary (blocker 1). Then resubmit the sitemap in Search Console.
- Apply `migrations/pending/` (38+ files, including 162 cron, 209 advisors and 220). The agent never applies them.
- Reconcile local `main` with `origin/main` before the next deploy.
- Review the catalogue findings in `supabase/catalogue-known-issues.json`.
