# Health

Measured 2026-10-16 06:25 (local time) on closeout/v1-final, tag v2.0.0-rc4.

| check | result |
|---|---|
| `pnpm test` | 394 files, 4692 passed, 25 skipped |
| `pnpm type-check` | clean in `src/`; errors only in git-ignored `.next/types` |
| `pnpm build` | compiles |
| `biome check` on `src/` | clean for touched files; `biome check .` fails only on `.claude/worktrees/*` copies (not part of the app) |
| compare.mjs home 1440 | 9.3% (gate 11%) |
| compare.mjs home 380 | 30.24% (known structural gap, KNOWN-ISSUES 3) |
| E2E without a database | run 1: 255 passed, 0 failed; run 2: 253 passed, 2 failed on the per-IP cart limiter |
| Mobile 380, 390, 430 | 14 pages, 0 horizontal overflow (`docs/MOBILE-AUDIT.md`) |

## Backlog

Every item in `docs/BACKLOG.md` is gated on a date or an external event that has not
happened (group-deals re-evaluation 2026-10-23, ten sales, post-launch, post-revenue,
Phase 2). None is executable today.
