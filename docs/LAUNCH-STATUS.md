# Launch status

Measured 2026-10-16 on branch closeout/v1-final.

## WORKS (verified green)

- Unit and integration tests: `pnpm test` passes, 413 files, 4941 tests (25 skipped for missing DB env, 1 file skipped).
- Type-check: `pnpm type-check` reports no error in `src/`. The only errors are in the stale, git-ignored `.next/types/validator.ts`, which regenerates on build.
- Dependency audit: zero known vulnerabilities as of the last audit logged in `docs/BRANCH-AUDIT.md`.
- Migration pending set is reviewed and ordered in `docs/MIGRATION-REVIEW.md` and `docs/RUNBOOK.md`.

## REQUIRES-OFIR

- Cardcom production credentials.
- DNS nameservers at box.co.il, if not Vercel.
- Meta WhatsApp business verification.
- Israeli lawyer review after the first 10 sales.
