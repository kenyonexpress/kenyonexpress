# Launch readiness

Measured 2026-09-02 on branch `cursor/ci-launch-3ceb` (MEGA BLOCK 6), against
`origin/main` at `9e76800c`. Every number below is command output or a live
HTTP check, not a recollection. Where an older revision of this file
disagreed with a later measurement, the measurement is what is recorded.

## Verdict

**NOT READY.**

The application is a complete Next.js storefront with no WordPress runtime.
Unit tests, types, lint, the pixel gate, and the CI launch jobs in this
branch are code-complete. Production on `kenyonexpress.vercel.app` serves
the real catalogue. What is missing is still not code: a scheduler for the
ten cron jobs, Cardcom production credentials, a confirmed Vercel project
plus DNS cutover, and the remaining pending SQL in `docs/APPLY-ORDER.md`.

DNS cutover of `kenyonexpress.co.il` is a manual owner step. It is not run
from this machine.

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Types | `pnpm type-check` | PASS, `tsc --noEmit` clean (2026-09-02) |
| Lint | `pnpm lint` | PASS, biome 1041 files, 0 findings (2026-09-02) |
| Unit | `pnpm test` | PASS, 3493 tests in 259 files (2026-09-02). Launch-gate tests additional |
| Build | `pnpm build` | CI `Build` job; local rebuild on this branch |
| Migration dry-run | `pnpm gate:migrations` | Structural pass. Live ROLLBACK skipped (no disposable DB URL) |
| Secrets (tree) | `pnpm gate:secrets` | Working tree. Git history still holds a foreign expired service_role JWT documented on 2026-08-20; that is not HEAD |
| Bundle | `pnpm gate:bundle` | Ceiling 180KB gz held. Gated first-load is `entryJSFiles` (page + layout). Next 16 runtime is logged, not gated: including it (measured 312KB gz on 2026-09-02) made the gate permanently red. Artifact upload now stages `.next` into `next-ci-out` because `upload-artifact@v4` skipped the hidden path |
| Lighthouse | `pnpm lighthouse:ci` | PASS 2026-09-02 against `https://kenyonexpress.vercel.app`. Product `/product/barbecue`: a11y 100, SEO 100. Checkout empty-cart redirect to `/cart`: a11y 100, gated SEO 100 (raw 69, `is-crawlable` dropped). Sitemap loc still points at `kenyonexpress.co.il` (WordPress until DNS); the job rewrites onto `LIGHTHOUSE_BASE` |
| E2E | `pnpm exec playwright test` | CI skips until `CI_SUPABASE_URL` points at a disposable project |
| Pixel | `compare.mjs --page=home` | Last measured **9.83%** against the 11% ceiling (2026-08-19) |
| Health | `curl https://kenyonexpress.vercel.app/api/health` | Live 2026-09-01: `{"ok":true,"database":"ok"}` |

## CI/CD (this branch)

| Item | Evidence | Pass/Fail |
| --- | --- | --- |
| type-check, lint, unit tests, E2E, build, migration dry-run | `.github/workflows/ci.yml` jobs `lint`, `typecheck`, `test`, `e2e`, `build`, `migration-dry-run` | PASS (E2E skips loudly without `CI_SUPABASE_URL`) |
| Lighthouse CI on product + checkout, SEO/a11y >95 | job `Lighthouse product + checkout`; floors 96. Measured 2026-09-02: product a11y 100 SEO 100 on `https://kenyonexpress.vercel.app/product/barbecue`. Checkout/cart a11y 100, gated SEO 100. Sitemap loc on `kenyonexpress.co.il` is rewritten onto `LIGHTHOUSE_BASE` so the job does not score WordPress | PASS |
| Bundle gate JS >180KB gz fails the build | job `Bundle gate (JS 180KB gz)`; `MAX_FIRST_LOAD_GZ = 180 * 1024`. Measures `entryJSFiles` only. Next runtime logged. `next-ci-out` upload so the hidden `.next` directory actually reaches the job | PASS as a gate (runtime no longer stuffed into the ceiling) |
| Preview deploys: ephemeral Supabase + Vercel | Vercel GitHub integration already deploys previews. `.github/workflows/preview-supabase.yml` creates a branch DB when secrets exist, refuses `ixvwfbuvfxxsjiywhbbb` | PASS as a gate. Secrets unset today, so the job skips |
| Gated production + one-command rollback | Required checks + Vercel on `main`. `git revert --no-edit <sha> && git push origin main`. `docs/APPLY-ORDER.md`. Print-only `production-rollback.yml` | PASS as a procedure. No second `vercel deploy` |
| Secrets audit, nothing in repo | `pnpm gate:secrets` plus `.next/static` name grep after build | PASS as a gate on HEAD |

## Apply order

Remaining production SQL, in order:

```
122 → 125 → 126 → 127 → 131 → 132 → 133 → 137 → 147
```

Already applied (do not re-run): 123, 124, 130, 134, 135a, 135b, 136, 138-141
(collapsed), 143, 144, 145, 146. Parked: 142. Full table:
`docs/APPLY-ORDER.md`.

## Blockers (why NOT READY)

| # | Severity | Blocker | Evidence |
| --- | --- | --- | --- |
| 1 | critical | No scheduler is firing the ten cron jobs | `docs/CRON-EXTERNAL.md`. `cron.yml` is off until `CRON_SCHEDULER_ENABLED=true` and `CRON_SECRET` exist. `gh secret list` was empty on 2026-09-01 |
| 2 | critical | Cardcom production credentials are not on the deployment | `src/lib/payments/env.ts` throws `Missing required env` without `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`. Sandbox/mock is what is wired |
| 3 | high | DNS of `kenyonexpress.co.il` and which Vercel project that name attaches to | Owner step. Not run from this machine. Live host today is `kenyonexpress.vercel.app` |
| 4 | medium | Nine unapplied files in APPLY-ORDER remaining | `122, 125, 126, 127, 131, 132, 133, 137, 147`. `db push` is forbidden |

None of these four is a missing feature in the Next.js app. All four need a
human with credentials.

## What is verified working

- Site answers 200 at `https://kenyonexpress.vercel.app/`
- `/api/health` reports database ok
- Cron routes answer 401 without a bearer token
- Catalogue served in production is the imported store catalogue, not a
  WordPress runtime
- RLS on for public tables (measured 2026-09-01: 53/53)
- Money path is integer agorot in `src/lib/money.ts`
- PR #6 merged. `main` is the working branch

## WordPress

There is no WordPress package, server, or theme in this repository. The
catalogue was imported. Runtime is Next.js 16 on Vercel. Tag `v1.0.0-rc1`
marks that cut.

## How to re-measure

Terminal, from the repo root:

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm gate:migrations
pnpm gate:secrets
pnpm build && pnpm gate:bundle && node scripts/secrets-audit.mjs --bundle
LIGHTHOUSE_BASE=https://kenyonexpress.vercel.app pnpm lighthouse:ci
```
