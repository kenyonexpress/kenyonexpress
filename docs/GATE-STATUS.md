# Mobile Gate Status

**Last Check:** 2026-10-21 21:22-21:28 UTC (MAINTENANCE_LOOP_6, sixteenth recheck; local time 2026-10-22 04:22-04:28 UTC+7)
**Page:** home
**Commit:** `db8cd91d4` (clean tree at measurement, 0/0 against `origin/autopilot` after fetch; HEAD of `autopilot`. `git log e8ae3776e..HEAD -- src/ scripts/compare.mjs refs/` is empty: nothing under `src/`, the gate script or the reference changed since the fifteenth recheck, so this is the eleventh measurement of the same rendered tree; the last `src/` commit is still `13021b20c` at 09:51 UTC; the one commit between touches only STATE.md and docs/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 7864, cwd verified by `/usr/sbin/lsof -p`, the only node listener on the machine, port had 0 listeners before start, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 21:20 UTC, 23 seconds after the LOOP_5 commit, by that loop item's post-commit build (BUILD_ID `0dzG_R4KHgrXDAmhZW9vl`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk).
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched (44 lines, head MAINTENANCE_LOOP_7).

| Viewport | Score | Status | Previous (fifteenth recheck, 19:52-19:58 UTC, `e8ae3776e`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 21:23 | home | 380 | 8.53% | PASS | `db8cd91d4` | ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 21:25 | home | 768 | 9.79% | PASS | `db8cd91d4-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 21:26 | home | 1440 | 8.08% | PASS | `db8cd91d4-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 sixteenth recheck notes (21:28 UTC)

- **Eleventh consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh through fifteenth rechecks and this one). No `src/` commit landed between the fifteenth recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall read 141 / 96 / 96**, a count not seen before at 380: 101 scripts instead of the usual 113 (cold archive) or 57 (warm), with the 37 fonts, 2 stylesheets and 1 xhr unchanged. The 768 and 1440 widths read the deterministic 96 (57 scripts + 37 fonts + 1 stylesheet + 1 xhr) of the fourteenth recheck. The 380 reference document came back at 380x17790 (the fifteenth recheck's height). Neither figure moved any score or any band by a hundredth, consistent with the dropped resources sitting outside the compared 2600px window; the shortfall is the archive's remote resources failing on a file:// origin, not a layout input.
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x17790; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **380 worst bands:** y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%, y1000-1100 9.2%. **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%, y2400-2500 17.5%, y500-600 17.4%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%, y1600-1700 16.2%. Same floors as the eighth through fifteenth rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took 5 minutes 31 seconds wall time (21:22:42 to 21:28:13) including the 380 archive cold load. Run log kept at `/tmp/ke-gate-l6-run16.log`, server log at `/tmp/ke-gate-l6-run16-server.log` (outside the repo, per the test-results wipe rule).
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; sixteen consecutive runs agree to the hundredth at 380.

**Last Check:** 2026-10-21 19:52-19:58 UTC (MAINTENANCE_LOOP_6, fifteenth recheck; local time 2026-10-22 02:52-02:58 UTC+7)
**Page:** home
**Commit:** `e8ae3776e` (clean tree at measurement, 0/0 against `origin/autopilot` after fetch; HEAD of `autopilot`. `git log e87e3177b..HEAD -- src/ scripts/compare.mjs refs/` is empty: nothing under `src/`, the gate script or the reference changed since the fourteenth recheck, so this is the tenth measurement of the same rendered tree; the last `src/` commit is still `13021b20c` at 09:51 UTC; the five commits between touch only STATE.md, docs/ and logs/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 57712, cwd verified by `/usr/sbin/lsof -p`, the only node listener on the machine, port had 0 listeners before start, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 19:51 UTC by the previous loop item's build gate (BUILD_ID `DyEG49Oh433CcU0LMHMDO`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk).
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched (44 lines, head MAINTENANCE_LOOP_7).

| Viewport | Score | Status | Previous (fourteenth recheck, 18:21-18:27 UTC, `e87e3177b`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 19:53 | home | 380 | 8.53% | PASS | `e8ae3776e` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 19:55 | home | 768 | 9.79% | PASS | `e8ae3776e-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 19:56 | home | 1440 | 8.08% | PASS | `e8ae3776e-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 fifteenth recheck notes (19:58 UTC)

- **Tenth consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh through fourteenth rechecks and this one). No `src/` commit landed between the fourteenth recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall read 153 at all three widths** (113 scripts, 37 fonts, 2 stylesheets, 1 xhr), the thirteenth recheck's pattern rather than the fourteenth's 153 / 96 / 96. The 380 reference document came back at 380x17790 (the earlier height, not the 18146 of the thirteenth and fourteenth). Neither figure moved any score or any band by a hundredth, consistent with the dropped resources and the extra height sitting outside the compared 2600px window.
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x17790; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **380 worst bands:** y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%, y1000-1100 9.2%. **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%, y2400-2500 17.5%, y500-600 17.4%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%, y1600-1700 16.2%. Same floors as the eighth through fourteenth rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took about 5 minutes 29 seconds wall time (19:52:44 to 19:58:13) including the 380 archive cold load. Run log kept at `/tmp/ke-gate-l6-run15.log`, server log at `/tmp/ke-gate-l6-run15-server.log` (outside the repo, per the test-results wipe rule).
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; fifteen consecutive runs agree to the hundredth at 380.

**Last Check:** 2026-10-21 18:21-18:27 UTC (MAINTENANCE_LOOP_6, fourteenth recheck; local time 2026-10-22 01:21-01:27 UTC+7)
**Page:** home
**Commit:** `e87e3177b` (clean tree at measurement, 0/0 against `origin/autopilot` after fetch; HEAD of `autopilot`. `git log d55b0deac..HEAD -- src/ scripts/compare.mjs refs/` is empty: nothing under `src/`, the gate script or the reference changed since the thirteenth recheck, so this is the ninth measurement of the same rendered tree; the five commits between touch only STATE.md, docs/ and logs/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 6997, cwd verified by `/usr/sbin/lsof -p`, the only node listener on the machine before the run, port had 0 listeners before start, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 18:19 UTC by the previous loop item's build gate (BUILD_ID `HMxA3-8mOTvuCS1YmKI8n`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk). The last `src/` commit (`13021b20c`, 09:51 UTC) predates the build.
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched (44 lines, head MAINTENANCE_LOOP_7).

| Viewport | Score | Status | Previous (thirteenth recheck, 16:59-17:05 UTC, `d55b0deac`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 18:22 | home | 380 | 8.53% | PASS | `e87e3177b` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 18:23 | home | 768 | 9.79% | PASS | `e87e3177b-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 18:25 | home | 1440 | 8.08% | PASS | `e87e3177b-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 fourteenth recheck notes (18:27 UTC)

- **Ninth consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh through thirteenth rechecks and this one). No `src/` commit landed between the thirteenth recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall went back to the 153 / 96 / 96 pattern** (cold archive at 380, deterministic 57 scripts + 37 fonts at 768 and 1440), where the thirteenth recheck read 153 at all three widths. The 380 reference document stayed at 380x18146 (the thirteenth recheck's height, not the earlier 17790). Neither figure moved any score or any band by a hundredth, consistent with the dropped resources sitting outside the compared 2600px window.
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x18146; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **380 worst bands:** y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%, y1000-1100 9.2%. **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%, y2400-2500 17.5%, y500-600 17.4%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%, y1600-1700 16.2%. Same floors as the eighth through thirteenth rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took about 5 minutes 35 seconds wall time (18:21:32 to 18:27:06) including the 380 archive cold load. Run log kept at `/tmp/ke-gate-l6-run14.log` (outside the repo, per the test-results wipe rule).
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; fourteen consecutive runs agree to the hundredth at 380.

**Last Check:** 2026-10-21 16:59-17:05 UTC (MAINTENANCE_LOOP_6, thirteenth recheck; local time 23:59-00:05 UTC+7)
**Page:** home
**Commit:** `d55b0deac` (clean tree at measurement, 0/0 against `origin/autopilot` after fetch; HEAD of `autopilot`. `git log 6a96520cc..HEAD -- src/ scripts/compare.mjs refs/` is empty: nothing under `src/`, the gate script or the reference changed since the twelfth recheck, so this is the eighth measurement of the same rendered tree; the twelve commits between touch only STATE.md, docs/ and logs/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 60783, cwd verified by `lsof -p`, the only node listener on the machine before the run, port had 0 listeners before start, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 16:56 UTC by the previous loop item's build gate (BUILD_ID `0Uk4GULmNN3iFan1hkn8L`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk). The last `src/` commit (`13021b20c`, 09:51 UTC) predates the build.
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched.

| Viewport | Score | Status | Previous (twelfth recheck, 15:37-15:43 UTC, `6a96520cc`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 17:00 | home | 380 | 8.53% | PASS | `d55b0deac` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 17:01 | home | 768 | 9.79% | PASS | `d55b0deac-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 17:03 | home | 1440 | 8.08% | PASS | `d55b0deac-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 thirteenth recheck notes (17:05 UTC)

- **Eighth consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh through twelfth rechecks and this one). No `src/` commit landed between the twelfth recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall was the cold-archive figure at all three widths this time, not only at 380:** 153 dropped (113 scripts, 37 fonts, 2 stylesheets, 1 xhr) at 380, 768 and 1440, where the twelfth recheck read 153 / 96 / 96. The reference document at 380 also measured 380x18146 against 17790 on every earlier recheck (768 and 1440 heights unchanged at 9152 and 5492). Neither moved any score or any band by a hundredth, which is the same evidence as before that the dropped resources sit outside the compared 2600px window.
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x18146; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **380 worst bands:** y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%, y1000-1100 9.2%. **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%, y2400-2500 17.5%, y500-600 17.4%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%, y1600-1700 16.2%. Same floors as the eighth through twelfth rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took about 5 minutes 30 seconds wall time (16:59:38 to 17:05:08) including the archive cold load.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; thirteen consecutive runs agree to the hundredth at 380, and this run shows the shortfall count (96 or 153) does not move the score.

**Last Check:** 2026-10-21 15:37-15:43 UTC (MAINTENANCE_LOOP_6, twelfth recheck; local time 22:37-22:43 UTC+7)
**Page:** home
**Commit:** `6a96520cc` (clean tree at measurement, 0/0 against `origin/autopilot` after fetch; HEAD of `autopilot`. `git log 5181a83a4..HEAD -- src/ scripts/compare.mjs refs/` is empty: nothing under `src/`, the gate script or the reference changed since the eleventh recheck, so this is the seventh measurement of the same rendered tree; the three commits between touch only STATE.md, docs/ and e2e/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 14573, cwd verified by `lsof`, the only node listener on the machine before the run, port had 0 listeners before start, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 15:35 UTC by the previous loop item's build gate (BUILD_ID `RT5bMD813gxa-aieJ0vD6`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk). The last `src/` commit (`13021b20c`, 09:51 UTC) predates the build.
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched (44 lines).

| Viewport | Score | Status | Previous (eleventh recheck, 14:12-14:19 UTC, `5181a83a4`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 15:38 | home | 380 | 8.53% | PASS | `6a96520cc` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 15:40 | home | 768 | 9.79% | PASS | `6a96520cc-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 15:42 | home | 1440 | 8.08% | PASS | `6a96520cc-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 twelfth recheck notes (15:43 UTC)

- **Seventh consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh through eleventh rechecks and this one). No `src/` commit landed between the eleventh recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall was the cold first-load pattern at 380 and the deterministic one after:** 153 dropped at 380 (113 scripts, the same cold-archive figure as the tenth recheck) and 96 (57 scripts, 37 fonts) at 768 and 1440. Scores did not move against either figure. Every 380 band matches the eleventh recheck (y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%).
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x17790; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%, y2400-2500 17.5%, y500-600 17.4%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%, y1600-1700 16.2%. Same floors as the eighth through eleventh rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took about 5 minutes 35 seconds wall time (15:37:52 to 15:43:28) including the 380 archive cold load.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; twelve consecutive runs agree to the hundredth at 380.

**Last Check:** 2026-10-21 14:12-14:19 UTC (MAINTENANCE_LOOP_6, eleventh recheck; local time 21:12-21:19 UTC+7)
**Page:** home
**Commit:** `5181a83a4` (clean tree at measurement; HEAD of `autopilot`. `git log e8c9ff899..HEAD -- src/` is empty: nothing under `src/` changed since the tenth recheck, so this is the sixth measurement of the same rendered tree; the ten commits between touch only STATE.md, docs/ and logs/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 66727, cwd verified by `lsof`, the only node listener on the machine before the run, port had 0 listeners before start, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 14:11 UTC by the previous loop item's build gate (BUILD_ID `DC3-5pmlVf3nACRsMccLJ`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk). The last `src/` commit predates the build.
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched.

| Viewport | Score | Status | Previous (tenth recheck, 12:46-12:52 UTC, `e8c9ff899`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 14:13 | home | 380 | 8.53% | PASS | `5181a83a4` | ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 14:15 | home | 768 | 9.79% | PASS | `5181a83a4-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 14:17 | home | 1440 | 8.08% | PASS | `5181a83a4-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 eleventh recheck notes (14:19 UTC)

- **Sixth consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh through tenth rechecks and this one). No `src/` commit landed between the tenth recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall was the cold first-load pattern at 380 and the deterministic one after:** 141 dropped at 380 (101 scripts, the same cold-archive figure as the eighth recheck) and 96 (57 scripts, 37 fonts) at 768 and 1440. Scores did not move against either figure. Every 380 band matches the tenth recheck (y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%).
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x17790; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%, y2400-2500 17.5%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%. Same floors as the eighth through tenth rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took 5 minutes 31 seconds wall time (14:13:28 to 14:18:59) including the 380 archive cold load.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; eleven consecutive runs agree to the hundredth at 380.

**Last Check:** 2026-10-21 12:46-12:52 UTC (MAINTENANCE_LOOP_6, tenth recheck; local time 19:46-19:52 UTC+7)
**Page:** home
**Commit:** `e8c9ff899` (clean tree at measurement; HEAD of `autopilot`. `git log 3425ca36f..HEAD -- src/` is empty: nothing under `src/` changed since the ninth recheck, so this is the fifth measurement of the same rendered tree; the commits between touch only STATE.md, docs/ and logs/cron/)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 18601, cwd verified by `lsof`, the only node listener on the machine, stopped by pid afterwards, port free after) on the `pnpm build` of this same HEAD written at 12:44 UTC by the previous loop item's build gate (BUILD_ID `qVjnRFNtrsL_GjqY1JHTW`, present in the served HTML), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk). The last `src/` commit predates the build (09:51 UTC).
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched.

| Viewport | Score | Status | Previous (ninth recheck, 11:27-11:30 UTC, `3425ca36f`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 12:47 | home | 380 | 8.53% | PASS | `e8c9ff899` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 12:48 | home | 768 | 9.79% | PASS | `e8c9ff899-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 12:50 | home | 1440 | 8.08% | PASS | `e8c9ff899-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 tenth recheck notes (12:52 UTC)

- **Fifth consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh, eighth, ninth and this recheck). No `src/` commit landed between the ninth recheck and this one, so an identical score is the expected result. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall went back to the first-load pattern:** 153 dropped at 380 (the cold archive load, 113 scripts) and the deterministic 96 (57 scripts, 37 fonts) at 768 and 1440, the same split as the fifth to eighth rechecks. The ninth recheck's 113-script figure on all three widths did not recur. Scores did not move against either figure, and every 380 band is identical to the ninth recheck (y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%).
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x17790; the compared window is the first 2600px). At 768 ours is 768x9124 against 768x9152, at 1440 ours is 1440x5464 against 1440x5492.
- **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%. Same floors as the eighth and ninth rechecks.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took 5 minutes 32 seconds wall time including the 380 archive cold load.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; ten consecutive runs agree to the hundredth at 380.

**Last Check:** 2026-10-21 11:27-11:30 UTC (MAINTENANCE_LOOP_6, ninth recheck; local time 18:27-18:30 UTC+7)
**Page:** home
**Commit:** `3425ca36f` (clean tree at measurement; HEAD of `autopilot`. `git log 26b9673fa..HEAD -- src/` is empty: nothing under `src/` changed since the eighth recheck, so this is the fourth measurement of the same rendered tree)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 73150, cwd verified by `lsof`, the only node listener on the machine, stopped by pid afterwards) on the `pnpm build` of this same HEAD written at 11:25 UTC by the previous loop item's build gate (BUILD_ID `3Cux8fLs-MV9eLIjAPn7x`), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk).
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued; `~/ke-goals/queue.txt` untouched.

| Viewport | Score | Status | Previous (eighth recheck, 10:04-10:08 UTC, `26b9673fa`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 11:27 | home | 380 | 8.53% | PASS | `3425ca36f` | ref 145 failed to load (113 script, 29 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 11:28 | home | 768 | 9.79% | PASS | `3425ca36f-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 11:30 | home | 1440 | 8.08% | PASS | `3425ca36f-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 ninth recheck notes (11:30 UTC)

- **Fourth consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh, eighth and this recheck). No `src/` commit landed between the eighth recheck and this one, so an identical score is the expected result, not a coincidence. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **Reference shortfall moved and the scores did not.** The archive dropped 145 resources at 380 and 153 at 768 and 1440 against 141 / 96 / 96 last time; the script count is 113 on all three widths where the deterministic figure since the fifth recheck was 57 (101 on a cold first load). Every band at 380 is identical to the eighth recheck (y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%), so the extra dropped scripts paint nothing in the first 2600px. The 29 fonts at 380 against 37 later is the same first-load pattern as before. Recorded as an archive-side observation; not an action item for this loop.
- **Gate-hardening caveat silent again:** our side dropped 6 / 6 / 5 resources, all on the expected local origin, no `OURS dropped` or `OURS ... wide` words in any row. Our document was 380 wide at 380 (380x18394 against the reference's 380x17790; the compared window is the first 2600px).
- **768 worst bands:** y400-500 49.3%, y2500-2600 34.1%, y200-300 33.2%, y100-200 30.9%. **1440 worst bands:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%. Same floors as the eighth recheck.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **No UNMEASURED row.** Three widths took 3 minutes 40 seconds wall time including the 380 archive cold load.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; nine consecutive runs agree to the hundredth at 380.


**Last Check:** 2026-10-21 10:04-10:08 UTC (MAINTENANCE_LOOP_6, eighth recheck; local time 17:04-17:08 UTC+7)
**Page:** home
**Commit:** `26b9673fa` (clean tree at measurement; HEAD of `autopilot`, one `src/` commit after the MOBILE_FIX_GATE row's `d8d14274a`: `13021b20c`, the E2E run 12 product fixes to checkout saved card/wallet, vouchers suppliers embeds and the scan redirect, none on the home page)
**Server:** `pnpm start` on port 3351 from this worktree (listener pid 24763, cwd verified by `lsof`, stopped by pid afterwards) on the `pnpm build` of this same HEAD written at 10:02 UTC by the previous loop item's build gate (BUILD_ID `g0ShL3lKnGaKr3xKu55Xi`), `pnpm gate:chunks` clean before the run (243 prerendered pages, every referenced chunk on disk). No other `next start` was running on the machine.
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued.

| Viewport | Score | Status | Previous (seventh recheck, 07:44-07:48 UTC, `9825db2e6`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC), in run order:

```
| 2026-10-21 10:04 | home | 380 | 8.53% | PASS | `26b9673fa` | ref 141 failed to load (101 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 10:06 | home | 768 | 9.79% | PASS | `26b9673fa-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 10:08 | home | 1440 | 8.08% | PASS | `26b9673fa-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 eighth recheck notes (10:08 UTC)

- **Third consecutive run reading 8.53 / 9.79 / 8.08 to the hundredth** (F43 ledger, seventh recheck, this run), and the first measurement of the E2E run 12 tree. `git log d8d14274a..HEAD -- src/` lists only `13021b20c`; its files (checkout wizard, vouchers reads, `next.config.ts` redirect, return page test ids) do not render on the home page, and the scores confirm it. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **The gate-hardening caveat added at 08:38 stayed silent**, which is the healthy case: our side dropped 6 / 6 / 5 resources, all on the expected local origin, and no `OURS dropped` or `OURS ... wide` words appear in any row. Our document was 380 wide at 380.
- **Reference shortfall was 141 on the first archive load (380) and the deterministic 96 on the two later widths**, the same first-load pattern as the fifth, sixth and seventh rechecks. Scores did not move against either figure.
- **The `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write** (the 380 row modifies docs/UI-PARITY-REPORT.md before the two later children run). `git status` after the run listed that one file; `src/` was clean throughout.
- **Band profile at 380 unchanged:** y200-300 55.7%, y300-400 34.1%, y1700-1800 20.1%, y2500-2600 15.1%, y100-200 14.9%. Each is a documented floor below (hero phone photograph, row-four archive image).
- **No UNMEASURED row.** Three widths took 4 minutes 30 seconds wall time including the 380 archive cold load.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; eight consecutive runs agree to the hundredth at 380.


**Last Check:** 2026-10-21 08:34-08:38 UTC (MOBILE_FIX_GATE, 1440 fix goal; local time 15:34-15:38 UTC+7)
**Page:** home
**Commit:** `d8d14274a` (HEAD of `autopilot`, clean `src/` since the seventh recheck's `9825db2e6`; the first row is on the clean tree, the second reads `-dirty` because it was run on the gate-script edit below plus the first row's own ledger write)
**Server:** cold `pnpm build` after `rm -rf .next` (BUILD_ID `3uX7sNvIjx2SDDcdo99Hj`), `pnpm gate:chunks` clean (243 prerendered pages, every referenced chunk on disk), `pnpm start` on port 3351 from this worktree (listener pid 75431, cwd verified by `lsof`, stopped by pid afterwards). A stale `pnpm start` from another session on 3417 was left alone.
**Threshold:** 11%
**Verdict:** 1440 PASS at 8.08%, twice (08:34 on the clean tree, 08:38 with the gate-script edit). The goal's 23.91% is not this tree's number; see below. No CSS or layout change was made, because none was measured as needed.

| Viewport | Score | Status | Goal's figure | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 1440 | **8.08%** | **PASS** | 23.91% | -15.83 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (UTC):

```
| 2026-10-21 08:34 | home | 1440 | 8.08% | PASS | `d8d14274a` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 08:38 | home | 1440 | 8.08% | PASS | `d8d14274a-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MOBILE_FIX_GATE notes (08:38 UTC): where the 23.91% came from

The goal quotes 23.91% at 1440 with worst bands y1100-1200 67.5%, y1200-1300 63.1% and y1600-1700 61.5%. On this tree those three bands read **6.2%, 2.7% and 16.2%**. The 23.91% row (ledger 08:27 UTC, commit `3e4bb1859-dirty`) was measured in the main checkout on `closeout/v1-final`, not on `autopilot`, and three things about that run are visible in its own report (`ac25c3440:docs/GATE-STATUS.md`):

1. **It is a different source tree.** `closeout/v1-final` and `autopilot` diverged at `446cd3105`. Every home-page fix since (`3494b7478` 380 47.23% to 8.76%, `10d74a69f` 768 and 1440, `f7d8e9c90`, F41, F42, F43: 130 files in `src/`) is on `autopilot` only. The three `closeout/v1-final` commits after the fork (`be8c10640`, `3cda36807`, `f2a9d7f0c`, product-card padding and height) were written against that measurement; they are not on this branch and were not measured here.
2. **Our page in that run was not hydrated.** Its report says "Local: 1490x5562px" at a 1440 viewport and "3 resources failed locally (2 scripts, 1 fetch)". Two dropped scripts on a local origin are a prerendered page's own chunks 404ing, the warm Turbopack cache defect `scripts/prerender-chunk-gate.mjs` was written for in `d195ad97f`. An unhydrated home is 50px wider than the viewport (the mega menu overflow recorded in step 3 of the 380 table below is a hydration-time fix) and the bands from the grid down slide against the reference. The same tree cold-built and hydrated is the 8.08% above.
3. **Its reference dropped 48 images** (201 failed against the deterministic 96 here), so `refs/live-assets` was not resolving on that side either.

**Gate hardening, so the next such row names itself.** `scripts/load-shortfall.mjs` gains `ownSideCaveat()`: when OUR side drops a script or stylesheet that is not in the expected local-origin set, or when our document is wider than the viewport it was shot at, compare.mjs prints a `WARNING:` line and the ledger row carries `OURS dropped N script (unhydrated, not a fidelity score)` and/or `OURS 1490px wide at 1440 (overflow)`. The caveat sits before the reference shortfall in the row because the notes cell clips at 160 characters. `scripts/compare.mjs` now reads `document.documentElement.scrollWidth` on our side before the shot. Healthy runs add no words: the two rows above are byte-identical in shape to the seventh recheck's. Nine tests in `scripts/load-shortfall.test.mjs`.

**y1600-1800 at 1440, looked at again (refs/_diffmap.mjs, refs/_crop.mjs on this run's shots).** Per 40px column the diff is 70-97% across x440-700 and 1-47% elsewhere. x440-700 is row two's second card: live's archive paints a blank where ours paints the facial-treatment photograph (the same broken archive image the 768 row-four note records, `naturalWidth 0`). Cards one, three and four are codec-noise residual (JPEG against AVIF of one file). Neither is a layout offset; the band is a reference floor and nothing in CSS moves it without blanking our own image.


**Last Check:** 2026-10-21 07:44-07:48 UTC (MAINTENANCE_LOOP_6, seventh recheck; local time 14:44-14:48 UTC+7)
**Page:** home
**Commit:** `9825db2e6` (clean tree at measurement; HEAD of `autopilot`, five `src/` commits after the sixth recheck's `c0a5bc67c`: F41, F42, F43 and the residual)
**Server:** `pnpm start` on port 3313 from this worktree (listener pid 45467, verified by `lsof`, killed by pid afterwards) on the `pnpm build` of this same HEAD written one minute before the run (BUILD_ID `Lmby_umlo2MjrjiU5wKoh`, 14:41 local, by the previous loop item's build gate). A stale `pnpm start` from 12:42 local was found on port 3417 and left alone; it was not the measured origin.
**Threshold:** 11%
**Verdict:** 380 PASS at 8.53%, 768 PASS at 9.79%, 1440 PASS at 8.08%. No mobile fix goal requeued.

| Viewport | Score | Status | Previous (F43 ledger, 04:11-04:17 UTC, `f52769b0a-dirty`) | Delta | Margin to 11% |
|---|---|---|---|---|---|
| 380 | **8.53%** | **PASS** | 8.53% | +0.00 | 2.47 |
| 768 | **9.79%** | **PASS** | 9.79% | +0.00 | 1.21 |
| 1440 | **8.08%** | **PASS** | 8.08% | +0.00 | 2.92 |

Ledger rows, verbatim from docs/UI-PARITY-REPORT.md (timestamps there are UTC), in run order:

```
| 2026-10-21 04:11 | home | 380 | 8.53% | PASS | `f52769b0a-dirty` | baseline electro-v7-380.png (frozen PNG, 2026-10-21T04:11:40.679Z), not a fresh archive shot |
| 2026-10-21 04:13 | home | 768 | 9.79% | PASS | `f52769b0a-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 04:17 | home | 1440 | 8.08% | PASS | `f52769b0a-dirty` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 07:44 | home | 380 | 8.53% | PASS | `9825db2e6` | ref 153 failed to load (113 script, 37 font, 2 stylesheet, 1 xhr) |
| 2026-10-21 07:46 | home | 768 | 9.79% | PASS | `9825db2e6-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
| 2026-10-21 07:48 | home | 1440 | 8.08% | PASS | `9825db2e6-dirty` | ref 96 failed to load (57 script, 37 font, 1 stylesheet, 1 xhr) |
```

## MAINTENANCE_LOOP_6 seventh recheck notes (07:48 UTC)

- **First recheck of the F43 tree, and it repeats the F43 commit's own numbers to the hundredth at every width:** 8.53 / 9.79 / 8.08. The five `src/` commits since the sixth recheck (`046f1ba62` F41, `ff8bf9ea5` F42, `f52769b0a` and `5371d9ef6` F43, `2dba324b8` residual) are all measured here for the first time on a clean committed tree; the F43 ledger rows were `-dirty`. The 768 margin is 1.21 points, the narrowest of the three, unchanged.
- **The ledger's `-dirty` suffix on the 768 and 1440 rows is the gate's own ledger write**, not a source change: the 380 row lands first and modifies docs/UI-PARITY-REPORT.md, so the two later children see a dirty tree. `git status` at the end of the run lists that one file.
- **Reference shortfall was 153 on the first archive load (380) and the deterministic 96 on the two later widths**, the same first-load pattern recorded at 18:05, 21:03 and 22:31 on 20.10. Scores did not move against either shortfall figure.
- **No UNMEASURED row.** Three widths took 5 minutes 30 seconds wall time, the 1440 archive load included.
- **Timestamps:** the ledger writes UTC. The sixth recheck's header above the fold read "09:46-09:55 UTC" but those were local (UTC+7) clock readings; its ledger row is not in this worktree's ledger at all (the tail before this run ended at the F43 rows and the 04:19 cart row). This header states both clocks explicitly.
- **Band profile at 1440 unchanged:** y500-600 25.2%, y200-300 24.1%, y1700-1800 19.4%, y300-400 18.7%, y600-700 17.2%, y1600-1700 16.2%, y0-100 11.2%. Each is a documented floor below (hero side columns, row-two photographs, masthead search field). At 768 the two bands read off this run's output are y2400 17.5% and y2500 34.1%, the row-four floor, unchanged; the earlier 768 bands scrolled out of the captured output and were not re-read.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged open item; with seven consecutive runs agreeing to the hundredth at 380 it remains ledger noise, not a gate risk.

## MAINTENANCE_LOOP_6 sixth recheck notes (09:55)

- **Fresh measurement on c0a5bc67c** (E2E test run 10 and all MAINTENANCE_LOOP updates to STATE.md committed). `git diff da214d37d c0a5bc67c -- src/` is empty (all changes between commits are docs and STATE). The 1440 row landed at 8.1% against 8.10% at 01:36, unchanged to the tenth of a percent. Margin to threshold remains 2.9 points.
- **The reference shortfall was 141 at 1440** (101 scripts, 37 fonts, 2 stylesheets, 1 xhr), consistent with earlier measurements. Score unchanged despite the 12-script shortfall difference (153 at 01:36).
- **No UNMEASURED row this loop.** The 1440 archive load finished in under 60s. Single-width measurement wall time was about 2 minutes.
- **No mobile fix goal queued.** Score is well under 11% threshold. Gate passes.

## MAINTENANCE_LOOP_6 fifth recheck notes (01:36)

- **One `src/` change since the fourth recheck, and it does not touch the home page.** `git diff d413c5528 da214d37d --stat -- src/` lists only `src/components/ui/tabs.tsx` and its test (the active TabsTrigger ink moved off brand yellow for the login a11y fix in MAINTENANCE_LOOP_4). The only non-test importer of Tabs is `src/components/auth/LoginModal.tsx`, which is closed at capture and paints nothing, so this is the fifth measurement of one home-page tree, and the second exact repeat: 8.51 / 9.80 / 8.10 to the hundredth at every width. Across five runs the 380 row has spanned 0.02 points, 768 0.55 and 1440 0.43; the 768 margin to the threshold is 1.20 points.
- **The reference shortfall was 153 at all three widths** (113 scripts, 37 fonts, 2 stylesheets, 1 xhr), with no image on the 380 row this time (the fourth recheck's 380 row read 154 with 1 image). Scores unchanged against both the 96-shortfall runs and the 153-shortfall runs, so the extra 57 script and 1 stylesheet failures are still re-issued requests to the dead `wp-content/` origin and not assets that paint.
- **No UNMEASURED row this loop**, third loop in a row. All three archive loads finished under the 60s `page.goto` budget. Total wall time for three widths was about 4 minutes.
- **Band profile unchanged at every width**, same bands and same percentages as the 23:42 run: 380 y200-300 hero floor (55.6%, 34.1%), y1700 (20.1%), y2500 (15.1%); 768 y100-200 (31%, 33.2%), y400-500 (49.3%, 17.4%), y2400-2500 (17.5%, 34.1%); 1440 y200-300 (24.1%, 18.7%), y500-600 (25.1%, 17.2%), y1600-1700 (16.2%, 19.4%). Each is a documented floor below.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged from the previous four loops; with two consecutive exact repeats, the shortfall is a ledger-noise item and not a gate risk.

## MAINTENANCE_LOOP_6 fourth recheck notes (23:42)

- **Fourth measurement of one source tree, and the first exact repeat.** `git log 450762eda..d413c5528 -- src/` is empty (the two commits in between are CRON-STATUS and STATE). All three widths landed on the previous run to the hundredth: 8.51 / 9.80 / 8.10. Across the four runs of this tree the 380 row has spanned 0.02 points, 768 0.55 and 1440 0.43; the 768 margin to the threshold is 1.20 points.
- **The reference shortfall was 153 at all three widths this time (113 scripts, 2 stylesheets), not the deterministic 96.** The 380 row also lists 1 image, a figure the ledger has carried on six earlier 380 rows. The scores did not move against the 96-shortfall run at 22:29-22:31, so for this page the extra 57 script and 1 stylesheet failures are re-issued requests to the dead `wp-content/` origin and not assets that paint. The 768 row at 9.80 with a 153 shortfall weakens the 22:31 note's font-re-issue reading: the 190-shortfall run (74 fonts) read 9.78 and both 96- and 153-shortfall runs read 9.80, so the half-point 768 mover (10.33 at 18:05) is still not isolated to a request class.
- **No UNMEASURED row this loop**, second loop in a row. All three archive loads finished under the 60s `page.goto` budget. Total wall time for three widths was about 4 minutes.
- **Band profile unchanged at every width**, same bands and same percentages as the 22:31 run: 380 y200-300 hero floor (55.6%, 34.1%), y1700 (20.1%), y2500 (15.1%); 768 y100-200 (31%, 33.2%), y400-500 (49.3%, 17.4%), y2400-2500 (17.5%, 34.1%); 1440 y200-300 (24.1%, 18.7%), y500-600 (25.1%, 17.2%), y1600-1700 (16.2%, 19.4%). Each is a documented floor below.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall. Unchanged from the previous three loops; with four runs now agreeing to the hundredth at 380, the shortfall is a ledger-noise item and not a gate risk.
## MAINTENANCE_LOOP_6 third recheck notes (22:31)

- **Still no home-page source change.** `git log e887e9334..450762eda -- src/` is empty; the eight commits in between are STATE, E2E-STATUS, CRON-STATUS and GATE-STATUS. This is therefore the third measurement of one source tree, and it lands exactly on the 15:31-15:36 run (8.50 / 9.80 / 8.10) rather than on the 17:53-18:05 run (8.51 / 10.33 / 8.53) or the 20:51-21:03 run (8.52 / 9.78 / 8.39). Three runs of the same page span 0.55 points at 768 and 0.43 at 1440, and 0.02 at 380. The 768 margin is 1.20 points on this run.
- **The reference shortfall was the deterministic 96 on both the 768 and 1440 runs** for the first time in three loops. Only the 380 run, the first archive load in the session, reported more (141: 101 scripts, 2 stylesheets). The 380 score moved 0.01 against the previous 152-shortfall run, so the extra failures are still re-issued requests and not assets that paint. With the 768 shortfall back at 96, the 768 score came back to 9.80, the value of the other 96-shortfall run at 15:31; the 9.78 at 20:55 was the 190-shortfall run. That is consistent with the font re-issue being the half-point mover at 768, but one pair is not an isolation.
- **No UNMEASURED row this loop.** All three archive loads finished under the 60s `page.goto` budget; the previous two loops each lost one run to that timeout. Total wall time for three widths was 4 minutes 20 seconds.
- **Band profile unchanged at every width.** 380: y200-300 hero floor (55.6%, 34.1%), y1700 card-three photograph (20.1%), y2500 tab bar (15.1%). 768: y100-200 hero (31%, 33.2%), y400-500 strip (49.3%, 17.4%), y2400-2500 row four (17.5%, 34.1%). 1440: y200-300 (24.1%, 18.7%) and y500-600 (25.1%, 17.2%) hero side columns, y1600-1700 row-two photographs (16.2%, 19.4%). Each is a documented floor below.
- **Not done this loop:** serving the reference from a local origin to pin the shortfall, the gate's own open item. Unchanged from the previous two loops.

## MAINTENANCE_LOOP_6 second recheck notes (21:03)

- **No home-page source change between the two checks.** The last commit touching `src/` is `ee0abecc4` (00:07 local on 21.10, E2E spec budgets); every commit after `6cccd8359` is docs or STATE. The 768 row still moved by 0.55 points (10.33 to 9.78) and the 1440 row by 0.14, with 380 unchanged to the hundredth. Both moved toward the previous run's values (9.80 and 8.10 at 15:31-15:34), so the 17:53-18:05 pair was the outlier, not this one. The spread between runs of the same source at 768 is therefore about half a point, which is the same width parity-log.mjs treats as "a real layout regression". The 768 margin is 1.22 points.
- **The reference side failed 190 requests at 768, not 96 or 153.** 74 fonts instead of 37: the archive re-issued its font requests once. The 380 run reports 152 (112 scripts), a repeat of last loop's 153 at first load. Neither changed what the page painted: 380 is at 8.52 against 8.51 and 8.50 on 96-shortfall runs. Cause still not isolated; the failing requests are all to the dead `kenyonexpress.co.il/wp-content/` origin.
- **One 1440 run was UNMEASURED** on the 60s `page.goto` timeout loading `refs/localized/ke_live_home.html`. Last loop it was the 768 run. The retry loaded in the usual time with the usual 96-request shortfall. The row stays in the ledger as the script wrote it. Two loops, two timeouts, one per loop, on different widths: the archive load is the slow side, not our server.
- **Band profile at 380 is unchanged from both previous runs:** y200-400 hero floor (55.8%, 34.1%), y1700 card-three photograph (20.1%), y2500 tab bar (15.1%), y100 header icons (14.9%). At 1440 the bands over 15% are the same eight as before: y200-700 hero side columns and strip (17-26%), y1600-1800 row-two photographs (16%, 19%), y0 masthead 11.3%.
- **Not done this loop:** isolating what moves 768 half a point between identical builds. The candidates are the reference's font re-issue (74 vs 37) and the archive's lazy images; a run that pins the shortfall would need the reference served from a local origin, which is the gate's own open item.

## MAINTENANCE_LOOP_6 recheck notes (18:05)

- **The 768 margin is now 0.67 points, down from 1.20.** Two commits touched the home page between the two checks: `10d74a69f` is the one that landed the 15:31 measurement itself, and `f7d8e9c90` (a11y: HeroSlider dot targets, DealChips, CategoryProductCard, category-page.css) is the only home-page change measured for the first time here. The 1440 row moved by a similar amount (+0.43), the 380 row did not move, so the drift is in the slider or chip layout at tablet and desktop widths, not in the phone block. Not isolated band by band in this loop; the gate is a check, not a fix.
- **One 768 run was UNMEASURED** on a 60s `page.goto` timeout loading `refs/localized/ke_live_home.html`, the reference side. The immediate retry loaded in the usual time with the usual 96-request shortfall. The row stays in the ledger as the script wrote it.
- **The 380 run reports 153 failed reference requests, not 96** (113 scripts and 2 stylesheets instead of 57 and 1). It was the first load of the archive in this session; the two later runs answered the usual 96. Cause not isolated. The pixel score did not move against the 96-shortfall run at 15:36 (8.51 vs 8.50), so the extra failures are requests the page re-issued, not assets that painted differently.
- **Band profile at 380 is unchanged from 15:36:** y200-400 hero floor (55.6%, 34.1%), y1700 card-three photograph (20.1%), y2500 tab bar (15.1%), y100 header icons (14.9%). All four are the documented floors below.

## What moved 768 from 41.82% to 9.80% and 1440 from 30.05% to 8.10%

Every cause was probed with a getBoundingClientRect dump on both sides (refs/_probe-range.mjs, refs/_probe-deep.mjs, refs/_probe-sel.mjs, refs/_probe-img.mjs; untracked, refs/ is gitignored) before any CSS changed. Measured builds in order: 12.15% (768) after steps 1-5, 12.11% after 6-7, 9.80% after 8-9; 1440 8.23% after 1-7 and 8.10% after 8-9; 380 8.50% throughout.

| Step | Measured cause | Change |
|---|---|---|
| 1 | The "vertical category list over the right half of the hero" was the CLOSED MobileDrawer. `end-0` under dir="rtl" is the LEFT edge (computed `left: 0`), and `translate-x-full` then pushed the panel RIGHT into the page: x350 w350 at 768, x280 w280 at 380 (100px on screen). Live's closed panel is at x769. | `start-0` |
| 2 | Header 84px at 768 off the `h-header-handheld` token; live's header#masthead is y38 h49 at 768 (hero at y88). Ours opened at y122 and the whole page sat 35px low. | `h-header-phone` through xl; token left in place, marked unused |
| 3 | Grid item padding 72px at every width from 768 up. Live's `.jet-listing-grid__item` is 501 around a 485 card at 768 AND 1440: 8px, same as 380. Ours was 629; p_con at y826/y970 against live's y727/y906, every later row 128px low. | `padding: 8px 0` in the base rule |
| 4 | CitiesRow `w-1/2` below lg: two 384px cells where live's li.category is 146px at 768 exactly as at 1440. | `md:w-[20%]` |
| 5 | BenefitBar `sm:w-1/2` wrapped into three rows of two and spilled 75px under the 134px band. Live at 768: `.features-list` x39 w690, five 180px `.feature` right-to-left, the fifth clipped at x-172. | one clipped row, 180px cells at md, fifths at lg, 690px list at md |
| 6 | Hero column x0 w768 at 768; live's slider is x40 w728 (40px white on the left, inline-end in RTL). `pe-10` resolved to 35px off this root font size, so it is a token. | `md:pe-hero-inset-tablet` (40px) |
| 7 | WhatsApp circle bottom-LEFT (`end-5`) where live's is bottom-right at all three widths; both the missing circle and the extra one count. 380 y2500 band 18.8% -> 15.1%. | `start-5`; the spec says only "bottom corner" |
| 8 | Card 3 (ke-deal-8893): live's browser picks the 600x600 WordPress crop at 768 (245x245 at x115) and the portrait original at 380 and 1440. Ours rendered the portrait (196x245) everywhere; the two bands it spans read 26%. A hard crop is the centre of the image, so `cover` from the centre on a 245px square paints the same pixels from the same file. | `KE_LIVE_DEAL_TABLET_SQUARE` -> `data-thumb-md="square"` -> 768-1023 rule |
| 9 | Feature items 4px high at 768 AND 1440: live's list starts 30px into the band (not centred) and is 81.4 tall with the 68px items centred in it (y619 / y798); ours were at y615 / y794. | `md:pt-usp-offset`, `min-h-usp-list`, items-center |

Also in this change: the slider tint is white below lg too (live's rs-module/rs-slide/rs-sbg are transparent on a white column at 768 and 1440). Measured pixel-neutral: #eef4f7 against white is 17/11/8 per channel, under diff-bands' 24 tolerance.

Checked and ruled out: serving the card photographs at the original resolution (in-page swap, refs/_probe-imgtest.mjs). Rows 1 and 3 already match live at 0.6% and 1.9%; originals move the page from 12.2% to 11.6% at the cost of 735px downloads for 286px slots. Not done.

## Remaining 768 bands above 15%

1. **y100-300 (31%, 33%): the hero.** Live's copy renders in the archive's serif fallback (its web fonts are in the 96 failed requests) at 51px lines, beside the same phone photograph the 380 note describes. Font and photograph are both floors on our side.
2. **y400 (49%), y500 (17%): the category strip and the slider's bottom edge.** Live paints four product photographs and one text cell in the strip; ours paints the city illustrations in grey rounded boxes. Content, not geometry: the cells are 146px on both sides.
3. **y2400-2500 (17.5%, 34%): row four.** Live's eighth card has a broken image in the archive at 768 (naturalWidth 0, the compare.mjs "3 such images" note); ours shows the facial photograph. The WhatsApp circles now coincide.

## Remaining 1440 bands above 15%

- **y200-300 (24%, 19%) and y500-600 (25%, 17%): the hero's side columns.** Promo column placeholder art against live's three product-shot banners, and the strip's city art against live's product photographs (asset gate). Geometry matches to the pixel (sidebar x1064 w241, slider x336 w728, strip cells 146).
- **y0-100 (11.3%): the masthead.** The row of twelve category links sits where live has a 534px search field, a locations dropdown and five header icons. Standing rule: no search UI. This is the recorded pixel cost: 11.3% of the first band and 8.8% of the second, about 0.8 points of the 8.10%.
- **y1600-1700 (16%, 19%): row two's photographs**, the same codec-noise residual the 768 row-two right card shows (live serves a JPEG, ours an AVIF of the same file).

## What moved 380 from 47.23% to 8.76%, in the order it was measured

Each step was built, served on 3341 and measured before the next one.

| Step | Change | 380 after |
|---|---|---|
| 0 | baseline, f90f38679 | 47.23% |
| 1 | rc5 F03 phone block removed from product-card-deals.css (two-column grid, compact cards, clamp hero slot, yellow 56px masthead); TopBar back at every width; hero chips `hidden md:block`; hero section `h-hero-mobile`; compare.mjs presets `ke_consent` on the local capture | 44.55% |
| 2 | header row 48px below md (live 49 incl. border, was 84); item padding 8px top/bottom below 768 (live 8, was 72); hero slider on white below 768 (live rgb 255) | 11.40% |
| 3 | phone logo at x205 (`max-md:me-auto`); grid opens at y408 (`.home-deals` 2px top, was 3); price row 27.4px start-aligned, footer gap 20, cart circle at inline-start; mega menu item padding px-2 (was overflowing the 1440 page to 1490px) | 8.76% |

Step 3 shows 9.33% in the ledger at 14:30 for the version where the footer rules were placed BEFORE the base block and lost on source order (same specificity); 8.76% is the same change placed after it.

## Remaining 380 bands above 15%

1. **y 200-400 (56.1%, 34.5%): the hero.** Live paints one phone photograph about 200x170 centred on white (x60-260, y185-355). Every pixel of that photograph differs from anything we can paint there (the template imagery is quarantined by the asset gate), so these two bands have a floor of about 53% and 35% whatever our hero shows. Our text hero adds about 3 points over that floor. Not actionable on our side.
2. **y 1700-1800 (20.1%): card three's pool photograph.** Live's item pitch is 548.4px fractional; ours is 548.4 now too, but live's grid opens at y408.4 and rounds differently from our y408, so the third photograph sits one pixel off. A high-detail photograph one pixel off reads as 20%. Card one and two (lower-contrast photographs) read 1-9% at the same offset.
3. **y 2500-2600 (18.8%): the fixed bottom tab bar** (MobileNavBar, 56px) pinned to the bottom of the 2600px capture viewport, plus our WhatsApp circle sitting bottom-LEFT where live's sits bottom-RIGHT. Real UI, not a measurement artefact; left alone.
4. **y 100-200 (15.4%): the handheld header icons.** Live has five 22px icons (search, compare, wishlist, account, cart) overflowing to x-15; ours has two. The logo now overlaps live's exactly (x206 vs x205).

## 768 and 1440: the 14:41 / 14:43 causes, now closed

The four causes read off the failing screenshots (drawer over the hero, two 384px city cells, wrapped feature bar, 72px item padding at 768; placeholder art, the menu row and a 90px-low grid at 1440) are the rows of the table above. The grid was low at both widths for one reason, the 72px padding, plus the 35px header at 768.

## Measurement notes

- compare.mjs now presets `ke_consent=denied.<CONSENT_WORDING_VERSION>` on the LOCAL capture only, reading the version from src/lib/analytics/consent.ts. The reference is a WordPress archive without the banner and the cookie is scoped to the local host. Locked by three tests in scripts/compare-reference.test.mjs.
- Reference shortfall stays 96 (57 scripts, 37 fonts, 1 stylesheet, 1 xhr): the known deterministic baseline of the single-file archive with refs/live-assets present.
- Live's 380 body height moved from 17790 to 18146 between runs with no change on our side; this is Revolution Slider phase in the archive and does not reach the first 2600px.
