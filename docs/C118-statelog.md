# C118 — state-log restore

`scripts/state/state-log.mjs` was missing on `closeout/v1-final`, so `~/ke-goals/run-final.sh` logged `STATE-LOG SKIPPED` after every item.

## What was restored
From commit `b6423f65f` (XF01, on `phase5/homepage-closeout`), by path:
- `scripts/state/state-log.mjs`
- `scripts/state/state-log-lib.mjs`
- `scripts/state/state-log.test.mjs`
- `vitest.config.ts`: re-added the `scripts/state/**/*.test.mjs` include (the test did not run without it).

`STATE.md`, `docs/STATE-ARCHIVE.md` and `docs/INDEX.md` from that commit were NOT restored; the current versions are newer.

## Verification
- `node --check` on both scripts: ok.
- `node scripts/state/state-log.mjs` with no args prints usage.
- `vitest run scripts/state`: 23/23 pass.
- `run-final.sh` looks for the script at `$REPO/scripts/state/state-log.mjs` first, so it is found again.
- No forbidden files touched.

RESULT: DONE
