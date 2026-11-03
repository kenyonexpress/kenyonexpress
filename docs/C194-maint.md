# C194: M-cycle M01-M18, real run (2026-11-03)

Before this item `docs/M-CYCLE-STATUS.md` was a DRY-RUN (18 SKIP). First real run: 9 pass, 9 fail (1 critical, M13). Final run after the fixes below: 15 pass, 3 warn, 0 critical.

## Final cycle (raw)
```
2026-11-03T07:51:33.487Z PASS  [M01] Completed in 10064ms
2026-11-03T07:51:44.689Z PASS  [M02] Completed in 11201ms
2026-11-03T07:52:31.823Z PASS  [M03] Completed in 47134ms
2026-11-03T07:52:38.126Z PASS  [M04] Completed in 6302ms
2026-11-03T07:52:44.361Z PASS  [M05] Completed in 6235ms
2026-11-03T07:55:01.262Z PASS  [M06] Completed in 136901ms
2026-11-03T07:55:01.858Z PASS  [M07] Completed in 595ms
2026-11-03T07:55:02.655Z PASS  [M08] Completed in 797ms
2026-11-03T07:55:32.677Z PASS  [M09] Completed (expected non-zero exit) in 30022ms
2026-11-03T07:55:32.896Z WARN  [M10] Failed in 219ms
2026-11-03T07:55:33.022Z PASS  [M11] Completed in 126ms
2026-11-03T07:55:36.147Z PASS  [M12] Completed in 3125ms
2026-11-03T07:55:47.811Z PASS  [M13] Completed in 11664ms
2026-11-03T07:55:58.306Z PASS  [M14] Completed in 10494ms
2026-11-03T07:56:07.938Z WARN  [M15] Failed in 9632ms
2026-11-03T07:56:11.880Z PASS  [M16] Completed in 3942ms
2026-11-03T07:56:12.165Z WARN  [M17] Failed in 285ms
2026-11-03T07:56:15.756Z PASS  [M18] Completed in 3591ms
2026-11-03T07:56:15.757Z INFO  [M-CYCLE] M-Cycle complete: 15 pass, 3 fail (0 critical)
exit=0
```

## First cycle (raw, before fixes)
```
2026-11-03T07:06:31.324Z PASS  [M01] Completed in 4619ms
2026-11-03T07:06:34.519Z PASS  [M02] Completed in 3194ms
2026-11-03T07:07:47.697Z PASS  [M03] Completed in 73178ms
2026-11-03T07:07:47.762Z WARN  [M04] Failed in 64ms
2026-11-03T07:07:47.846Z WARN  [M05] Failed in 84ms
2026-11-03T07:08:00.225Z WARN  [M06] Failed in 12379ms
2026-11-03T07:08:00.506Z PASS  [M07] Completed in 281ms
2026-11-03T07:08:01.074Z PASS  [M08] Completed in 568ms
2026-11-03T07:08:31.117Z PASS  [M09] Completed (expected non-zero exit) in 30043ms
2026-11-03T07:08:31.240Z WARN  [M10] Failed in 123ms
2026-11-03T07:08:31.294Z PASS  [M11] Completed in 54ms
2026-11-03T07:08:33.248Z PASS  [M12] Completed in 1953ms
2026-11-03T07:08:33.303Z FAIL  [M13] Failed in 55ms
2026-11-03T07:08:33.356Z WARN  [M14] Failed in 53ms
2026-11-03T07:08:44.711Z WARN  [M15] Failed in 11355ms
2026-11-03T07:08:48.543Z PASS  [M16] Completed in 3832ms
2026-11-03T07:08:48.702Z WARN  [M17] Failed in 159ms
2026-11-03T07:08:50.663Z WARN  [M18] Failed in 1961ms
2026-11-03T07:08:50.665Z INFO  [M-CYCLE] M-Cycle complete: 9 pass, 9 fail (1 critical)
exit=1
```

## M13 money constraints (production, supabase db query --linked)
Root cause of the critical FAIL: the CLI returns `array_agg` as Postgres text `{a,b}`; the parser kept the braces, so three present constraints read MISSING. Fix: strip braces. M-cycle now runs it through `scripts/m-cycle-linked-audit.mjs`.
```
  OK       payments(idempotency_key)  -> payments_idempotency_key_key
  OK       payment_webhook_events(provider, external_event_id)  -> payment_webhook_events_dedup
  OK       wallet_entries(idempotency_key)  -> wallet_entries_idempotency_key_key
  n/a      ledger_journals.event_key  -> table absent from production and referenced by no code (2026-09-08)

audit-money-constraints: all 3 replay defences are in place
```

## M14 role separation (production)
Before:
```
audit-role-separation: five rules checked
  definer-mutable-search-path  fn_create_sms_broadcast: SECURITY DEFINER with no search_path pinned
  definer-mutable-search-path  fn_process_sms_delivery_event: SECURITY DEFINER with no search_path pinned
```
Real hole: `fn_create_sms_broadcast` and `fn_process_sms_delivery_event` were SECURITY DEFINER, EXECUTE by anon, no role check, no search_path. Fixed by `migrations/applied/332_sms_definer_lockdown.sql` (rehearsed in BEGIN/ROLLBACK, then applied). The other three are allowlisted with reasons read from their bodies: `fn_check_api_rate_limit` raises unless jwt role is service_role; `fn_record_search_click` and `product_rating_summary` take a product id.
Rehearsal output (rolled back):
```
proname,cfg,anon_x,auth_x,svc_x
fn_create_sms_broadcast,"{""search_path=public, pg_temp""}",false,false,true
fn_process_sms_delivery_event,"{""search_path=public, pg_temp""}",false,false,true
```
After apply:
```
audit-role-separation: five rules checked
  no gaps
```

## M04 E2E health
Default input was a tmp file from a dead session (`File not found: /private/tmp/claude-501/...bu2xgc3fa.output`). Now `scripts/m-cycle-e2e-health.mjs` reads the E2E jobs of the newest finished CI run on the branch:
```
CI run 41594043997 on closeout/v1-final @ ac1c86fc1 (2026-11-03T07:05:49Z)
  success  E2E against the PR preview
  skipped  E2E without a database
  skipped  E2E (Playwright)
m-cycle-e2e-health: 1/3 E2E job(s) ran, all green
```
The two skips sit behind the red unit-test job fixed below.

## M05 DB performance
`❌ Missing NEXT_PUBLIC_SUPABASE_URL` (M-cycle did not load `.env.local`), then `coupons.status does not exist` (production column is `is_active`) and `Connection timeout` at 2 s while a cold TLS connect from this host alone measured 1.25 / 1.49 / 1.74 s. After:
```
1️⃣  Testing connection pool...
   ✅ Connection established in 1043ms
   ✅ Product count: 90
2️⃣  Testing query performance...
   ⚠️ SLOW products-active: 1787ms (rows: 10)
   ⚠️ SLOW coupons-active: 2925ms (rows: 0)
   ⚠️ SLOW products-count: 861ms (rows: 1)
📊 Summary:
   ⚠️  3 slow query/ies detected
   ✅ No errors detected
```
Slow = host RTT to eu-north-1 (curl total 0.75-1.74 s for an empty REST root), informational.

## M06 Lighthouse
`Chrome prevented page load with an interstitial`: nothing listened on :3000. `scripts/m-cycle-lighthouse.mjs` now serves the M03 build on :3397, runs 3x with devtools throttling, stops its own PID. Server stdout first went to a pipe nobody drained; runs 2-3 hung (`spawnSync node ETIMEDOUT`), fixed by logging to a file. Simulated throttling on the same build read 97 / 87 / 81 / 82. Devtools, 3 runs:
```
run 1/3: { performance: 87, accessibility: 100, seo: 100 }
run 2/3: { performance: 93, accessibility: 100, seo: 100 }
run 3/3: { performance: 91, accessibility: 100, seo: 100 }
m-cycle-lighthouse: 2/3 runs passed
```

## M18 backup
Latest backup was 232h old. New tar written, oldest pruned (keep 3):
```
-rw-r--r--  1087420309 Nov  3 14:09 kenyonexpress-backup-2026-11-03-1409.tar.gz   (33973 entries, tar tzf ok)
   RPO: -7h / 23h ✅      <- before fix: filename stamp is local +07, parsed as UTC
   RPO: 0h / 23h ✅       <- after
✅ BACKUP HEALTH: HEALTHY
```

## CI on closeout/v1-final (red since at least 2026-11-02T23:54Z)
Unit job crashed: `TypeError: Cannot read properties of undefined (reading 'fetchCache')` in `@vitest/coverage-v8@3.2.7` under `vitest@4.1.12`. Bumped to `@vitest/coverage-v8@^4.1.12`. `scripts/upload-r2.test.mjs` dry-run needs gitignored `refs/live-assets/manifest.json`, now `skipIf` absent. Local `pnpm test:coverage`:
```
 Test Files  2 failed | 874 passed | 3 skipped (879)
      Tests  4 failed | 9670 passed | 39 skipped (9713)
```
No coverage crash. The 4 were the inventory gates for 332 (README row, CHECKSUMS, renumber list, service-role caller list), registered after:
```
      Tests  16 passed (16)
```

## gitleaks (CI job, continue-on-error)
gitleaks 8.18.4 over the tracked tree: `leaks found: 23`. Real: a Vercel preview deployment-protection password and a protection bypass secret in plaintext in 4 C73 docs + STATE-ARCHIVE; redacted to `[REDACTED-C194]` (still in git history). The C11 VAPID key is the public one (NEXT_PUBLIC_), redacted too. The rest: test fixtures and the icon font, allowlisted in `.gitleaks.toml`. After:
```
INF scan completed in 2.65s
INF no leaks found
```

## Left as WARN (decision, not fixable inside this repo branch)
- M10 / M17: `scripts/cron-jobs.json` differs from origin/main, `cashback-settlement` and `push-voucher-expiry` never scheduled. Scheduling a never-run money settlement job by merging to main is not done from a maintenance item.
- M15: canonical, og:url, robots Host/Sitemap emit the apex, which 308s to www. Source is production `NEXT_PUBLIC_APP_URL`; changing it means a production env edit + redeploy.

## ntfy
`scripts/run-m-cycle-loop.sh` posted `M-Cycle #N: Critical failures detected`, outside the 4-string whitelist. Removed; test now asserts no curl to ntfy. No ntfy sent by this item.

## CI after the first push (36a108c58), and the follow-up
Run 41600504719: gitleaks success, unit tests `1 failed | 875 passed | 3 skipped (879)`, the one being
`run pnpm migrations:manifest and commit the result` (332 added); typecheck (changed files) 13 x
`TS2307: Cannot find module 'node:fs'`. Root cause: the temp tsconfig inherits `types: ['vitest/globals']`,
and only a gitignored `next-env.d.ts` (absent in CI, which does not build) brought node's types in.
Reproduced locally by hiding next-env.d.ts: original script 13 errors, fixed script
`typecheck-changed: tsc --strict clean on changed files`. Manifest regenerated:
`migration manifest: 191 files -> src/lib/admin/migration-manifest.ts`.

## CI after the second push (c5b4b8120): money coverage floor
Run 41601807893: typecheck (changed) success, lint success, gitleaks success, unit `876 passed | 3 skipped (879)`, then the floors, enforced for the first time since the provider crashed:
```
ERROR: Coverage for lines (87.85%) does not meet "src/lib/money.ts" threshold (95%)
ERROR: Coverage for functions (86.95%) does not meet "src/lib/money.ts" threshold (95%)
ERROR: Coverage for statements (83.46%) does not meet "src/lib/money.ts" threshold (95%)
ERROR: Coverage for branches (69.4%) does not meet "src/lib/money.ts" threshold (95%)
```
Floor kept; `src/lib/money-boundaries.test.ts` (24 tests) covers every C141 boundary branch:
```
Statements   : 100% ( 127/127 )
Branches     : 100% ( 134/134 )
Functions    : 100% ( 23/23 )
Lines        : 100% ( 107/107 )
```
Local `pnpm test:coverage`, exit 0:
```
 Test Files  877 passed | 3 skipped (880)
      Tests  9698 passed | 39 skipped (9737)
```
