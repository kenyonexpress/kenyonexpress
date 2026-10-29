# G099 DEPLOY-FIX

Date: 2026-10-30. Project: kenyonexpress (kenyonexpress-projects).

## Root causes (three stacked, fixed in order)
1. `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` (deploy-fail.txt): Vercel's frozen install computed a different `pnpmfileChecksum` than the lockfile. `.pnpmfile.cjs` was a no-op (`readPackage` returns pkg), so it was deleted and the lockfile regenerated (`pnpm install --lockfile-only`; diff = the checksum line only). Commit af8e349b2.
2. `ENOENT .next/server/middleware.js.nft.json`: a stray root `middleware.ts` (added by accident in the docs commit fdf709a03) shadowed Next 16's `src/proxy.ts`, which already carries the maintenance gate. Removed. Commit 0c32f588b.
3. Preview-branch builds showed "Ambiguous app routes /c/[slug] vs /c/[code]". Not present on closeout/v1-final HEAD (only `/c/[slug]`); those were stale branch previews, no change made.

## Redeploys
- #1 p0k7cao2k: failed (pnpm checksum, still)
- #2 5ril1e7tc: failed (middleware nft ENOENT)
- #3 j3fz3922p: READY (production)

Non-blocking: Sentry source-map upload 401 (placeholder SENTRY_AUTH_TOKEN, M14 DONE-DEFERRED); it only warns.

## deploy-watch.sh
On a failure streak (two consecutive ERROR/CANCELED prod deploys) it now appends a `DEPLOYFIX-<ts>|DEPLOY-FIX|...` item to final-queue.txt, once per failing uid, instead of ntfy. It keeps a streak counter in `.deploy-watch.fails`. ntfy `hey BLOCKED deploy-watch DEPLOY-FIX` fires only when the counter reaches 3 (and every 3rd after). A READY deploy resets state. Backup: deploy-watch.sh.bak.G099.
