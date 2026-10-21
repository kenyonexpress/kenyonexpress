# Code Debt Status Report

Last updated: 2026-10-21 18:38 UTC (HEAD a9365b279 committed 2026-10-22 01:36 +07:00)
Scanned: src/ (TypeScript, TSX, JavaScript, JSX)

## Summary

**Total code debt comments: 8**
- Previous scan: 8 (2026-10-21 17:15 UTC, commit 624a75ef5, MAINTENANCE_LOOP_8 sixteenth pass)
- Current scan: 8 (2026-10-21 18:38 UTC, commit a9365b279, MAINTENANCE_LOOP_8 seventeenth pass)
- Delta: 0 (stable, no growth detected)
- Cleanup goal queued: no (count did not grow)

## Scan History

| Scan (UTC) | Commit | TODO | FIXME | HACK | Total | Delta | Cleanup queued |
|------------|--------|------|-------|------|-------|-------|----------------|
| 2026-10-20 15:57 | 48e35ab03 | 8 | 0 | 0 | 8 | baseline | no |
| 2026-10-20 16:00 | 13c54057b | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-20 16:13 | bbc6e97a1 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-20 18:17 | 43df16e43 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-20 21:19 | 9e07e3a57 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-20 22:41 | 9feda09a9 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-20 23:53 | d7badbab4 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 01:50 | 1dc0a8a18 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 09:59 | e3cbdec7e | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 08:11 | d195ad97f | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 10:19 | 025ad965a | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 11:42 | c9db7bdc1 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 13:03 | 10faafe83 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 14:31 | 611cbecbe | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 15:54 | 451801fe3 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 17:15 | 624a75ef5 | 8 | 0 | 0 | 8 | 0 | no |
| 2026-10-21 18:38 | a9365b279 | 8 | 0 | 0 | 8 | 0 | no |

Word-boundary scan (`\b(TODO|FIXME|HACK)\b`) and the loose scan below agree on 8 in every pass; no false positives from identifiers. The TODO column counts the 7 comments plus the one test stub string in src/lib/whatsapp.test.ts, as in the baseline.

Between the 16:13 and 18:17 scans the branch gained 16 commits (6d672d0b9..43df16e43). Exactly one touched src/: ee0abecc4 added two lines to src/components/CouponCardSkeleton.tsx with no debt marker.

Between the 18:17 and 21:19 scans the branch gained 21 commits (43df16e43..9e07e3a57). None touched src/ (`git log 43df16e43..HEAD -- src/` is empty).

Between the 21:19 and 22:41 scans the branch gained 16 commits (9e07e3a57..9feda09a9). None touched src/ (`git log 9e07e3a57..HEAD -- src/` is empty), so the list below is byte-identical to the previous three passes. Working tree was clean at scan time.

Between the 22:41 and 23:53 scans the branch gained 15 commits (9feda09a9..d7badbab4). None touched src/ (`git log 9feda09a9..HEAD -- src/` is empty); the list below is byte-identical for a fifth consecutive pass. Working tree was clean at scan time.

Between the 23:53 and 01:50 scans the branch gained 20 commits (d7badbab4..1dc0a8a18). Exactly one touched src/: c0a5bc67c changed src/components/ui/tabs.tsx and src/components/ui/tabs.test.tsx (29 insertions, 1 deletion) and its added lines contain no TODO, FIXME or HACK marker (`git show c0a5bc67c -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0). The list below is byte-identical for a sixth consecutive pass. Working tree was clean at scan time.

Between the 09:59 and 08:11 scans (the 09:59 stamp on the previous row is local +07:00 time, 02:59 UTC; e3cbdec7e is committed at 09:49 +07:00 and HEAD d195ad97f at 15:09 +07:00, so the two passes are five hours apart) the branch gained 23 commits (e3cbdec7e..d195ad97f). Five touched src/ (046f1ba62 F41, ff8bf9ea5 F42, f52769b0a and 5371d9ef6 F43, 2dba324b8 residual), 109 files, 2372 insertions and 877 deletions, and the added lines of all five contain no TODO, FIXME or HACK marker (per-commit `git show <c> -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0 for each). The eight hits below are byte-identical for a seventh consecutive pass. Working tree was clean at scan time.

Between the 08:11 and 10:19 scans the branch gained 18 commits (d195ad97f..025ad965a). Exactly one touched src/: 13021b20c (E2E run 12: checkout saved-card/wallet fix, voucher supplier embeds, scan redirect, spec and helper changes) and its added lines contain no TODO, FIXME or HACK marker (`git show 13021b20c -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0). The eight hits below are byte-identical for an eighth consecutive pass. Working tree was clean at scan time.

Between the 10:19 and 11:42 scans the branch gained 22 commits (025ad965a..c9db7bdc1). None touched src/ (`git log 025ad965a..HEAD -- src/` is empty; the commits are the MAINTENANCE_LOOP_4 E2E run 13, the MAINTENANCE_LOOP_6 ninth mobile recheck, the MAINTENANCE_LOOP_7 tenth Lighthouse pass and their STATE.md, docs/ and logs/ updates), and `git diff 025ad965a..HEAD -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0. The eight hits below are byte-identical for a ninth consecutive pass. Working tree was clean at scan time.

Between the 11:42 and 13:03 scans the branch gained 14 commits (c9db7bdc1..10faafe83). None touched src/ (`git log c9db7bdc1..HEAD -- src/` is empty; the commits are the MAINTENANCE_LOOP_4 E2E run 14, the MAINTENANCE_LOOP_5 tenth cron status check, the MAINTENANCE_LOOP_6 tenth mobile recheck, the MAINTENANCE_LOOP_7 eleventh Lighthouse pass and their STATE.md, docs/ and logs/ updates), and `git diff c9db7bdc1..HEAD -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0. The eight hits below are byte-identical for a tenth consecutive pass. Working tree was clean at scan time.

Between the 13:03 and 14:31 scans the branch gained 15 commits (10faafe83..611cbecbe). None touched src/ (`git log 10faafe83..HEAD -- src/` is empty; the commits are the MAINTENANCE_LOOP_9 twelfth DB performance pass, the MAINTENANCE_LOOP_10 eighth queue append, the MAINTENANCE_LOOP_1 eighth audit pass, the MAINTENANCE_LOOP_2 tenth deps pass, the MAINTENANCE_LOOP_3 thirteenth backlog scan, the MAINTENANCE_LOOP_4 E2E run 15, the MAINTENANCE_LOOP_5 eleventh cron status check, the MAINTENANCE_LOOP_6 eleventh mobile recheck, the MAINTENANCE_LOOP_7 twelfth Lighthouse pass and their STATE.md, docs/ and logs/ updates), and `git diff 10faafe83..HEAD -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0. The eight hits below are byte-identical for an eleventh consecutive pass. Working tree was clean at scan time.

Between the 14:31 and 15:54 scans the branch gained 12 commits (611cbecbe..451801fe3). None touched src/ (`git log 611cbecbe..HEAD -- src/` is empty; the commits are the MAINTENANCE_LOOP_8 fourteenth-pass STATE.md block, the MAINTENANCE_LOOP_9 thirteenth DB performance pass, the MAINTENANCE_LOOP_10 ninth queue append, the MAINTENANCE_LOOP_1 tenth audit pass, the MAINTENANCE_LOOP_2 eleventh deps pass, the MAINTENANCE_LOOP_3 fourteenth backlog scan, the MAINTENANCE_LOOP_4 E2E run 16, the MAINTENANCE_LOOP_5 twelfth cron status check, the MAINTENANCE_LOOP_6 twelfth mobile recheck, the MAINTENANCE_LOOP_7 thirteenth Lighthouse pass and their STATE.md, docs/ and logs/ updates), and `git diff 611cbecbe..HEAD -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0. The eight hits below are byte-identical for a twelfth consecutive pass. Working tree was clean at scan time.

Between the 15:54 and 17:15 scans the branch gained 12 commits (451801fe3..624a75ef5). None touched src/ (`git log 451801fe3..HEAD -- src/` is empty; the commits are the MAINTENANCE_LOOP_8 fifteenth-pass report and STATE.md block, the MAINTENANCE_LOOP_9 fourteenth DB performance pass and its STATE.md block, the MAINTENANCE_LOOP_10 tenth queue append, the MAINTENANCE_LOOP_1 eleventh audit pass and its revert, the MAINTENANCE_LOOP_3 fifteenth backlog scan, the MAINTENANCE_LOOP_4 E2E run 17, the MAINTENANCE_LOOP_5 thirteenth cron status check, the MAINTENANCE_LOOP_6 thirteenth mobile recheck and the MAINTENANCE_LOOP_7 fourteenth Lighthouse pass), and `git diff 451801fe3..HEAD -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0. The eight hits below are byte-identical for a thirteenth consecutive pass. Working tree was clean at scan time.

Between the 17:15 and 18:38 scans the branch gained 11 commits (624a75ef5..a9365b279). None touched src/ (`git log 624a75ef5..HEAD -- src/` is empty; the commits are the MAINTENANCE_LOOP_8 sixteenth-pass report and STATE.md block, the MAINTENANCE_LOOP_9 fifteenth DB performance pass and its STATE.md block, the MAINTENANCE_LOOP_10 eleventh queue append, the MAINTENANCE_LOOP_2 twelfth deps pass, the MAINTENANCE_LOOP_3 sixteenth backlog scan, the MAINTENANCE_LOOP_4 E2E run 18, the MAINTENANCE_LOOP_5 fourteenth cron status check, the MAINTENANCE_LOOP_6 fourteenth mobile recheck and the MAINTENANCE_LOOP_7 fifteenth Lighthouse pass), and `git diff 624a75ef5..HEAD -- src/ | grep -E '^\+' | grep -cwE "TODO|FIXME|HACK"` is 0. The eight hits below are byte-identical for a fourteenth consecutive pass. Working tree was clean at scan time.

## Findings

### TODO Comments (7)

| File | Line | Comment |
|------|------|---------|
| src/app/api/cron/stock-notifications/route.ts | 125 | revalidateTag may require different API in Next.js 16 |
| src/lib/payments/cardcom.ts | 249 | confirm the exact legacy refund endpoint + field names against |
| src/lib/payments/cardcom.ts | 312 | confirm endpoint + field names against the live terminal |
| src/lib/images/r2-migration.ts | 102 | Query database for all product images |
| src/lib/images/r2-migration.ts | 103 | Batch upload to R2 |
| src/lib/images/r2-migration.ts | 104 | Update product.images URLs to point to R2 |
| src/lib/images/r2-migration.ts | 105 | Verify uploads and delete from source |

### Test Stubs (1)

| File | Line | Comment |
|------|------|---------|
| src/lib/whatsapp.test.ts | 91 | process.env.NEXT_PUBLIC_WHATSAPP_PHONE = 'TODO' |

## Notes

- r2-migration.ts: 4 related TODOs for R2 image migration workflow (not yet started)
- cardcom.ts: 2 related TODOs for payment endpoint confirmation (legacy API dependencies)
- No FIXME or HACK comments found
- All TODOs are legitimate pending work, not indicative of broken state

## Supabase MCP Requirement

**Goal requirement:** "Use Supabase MCP for DB, RLS, migrations"

**Status:** Not applicable to this goal. The scan is static text analysis of src/ with no DB, RLS or migration work, so no Supabase call was made. Earlier passes recorded the connector as unavailable in a non-interactive session; since 21.10 sibling loops (MAINTENANCE_LOOP_3, MAINTENANCE_LOOP_9) read production through the local official Supabase MCP server, so the connector gap no longer applies when a goal does need the DB.

## Next Scan

Run: `grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mts" --include="*.mjs"`

Expected: Count should remain ≤ 8 unless new work is queued.
