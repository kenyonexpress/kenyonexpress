# C129 — MAINTENANCE CONTINUE (cycle c343, 2026-11-01/02)

C128 gate recheck: `git tag -l 'v2.1.0'` empty (only v2.1.0-rc1); origin has no v2.1.0; ~/ke-goals/LAUNCH.flag missing -> C128 stays BLOCKED.
MEILISEARCH_ENABLED=false: Meili items skipped (optional).

## M04 type-check
`pnpm exec tsc --noEmit` -> TSC_EXIT=0, 0 error lines. DONE, no drift.

## M05 test
`pnpm test` -> Test Files 8 failed | 855 passed | 2 skipped (865); Tests 17 failed | 9546 passed | 28 skipped (9591); Errors 16.
Failing files: migration-location-gate, migration-manifest-matches-disk, migration-references-point-where-the-file-is,
pending-migrations-inventory (migrations/pending layout), app/api/push/subscribe/route, lib/backup/backup-pointer,
lib/push/send, proxy-auth-cache-headers. No fix attempted this cycle (same 17 as C126). BLOCKED.

## M11 / M12 (https://www.kenyonexpress.co.il)
sitemap.xml 200 (lastmod 2026-10-27, still emits apex https://kenyonexpress.co.il/ URLs; set NEXT_PUBLIC_APP_URL to www). robots.txt 200, Allow /, Disallow /api/ /admin/ /checkout /cart etc. DONE.

## M13
/api/health 503 {"ok":false,"database":"ok","search":"down","search_detail":"unknown_error","latency_ms":240}
/api/ready 503 {"ok":false,"checks":{"database":"ok","redis":"ok","meilisearch":"down","r2":"ok","cardcom":"ok"}}
Only meilisearch down (paused by owner). DONE-DEFERRED.

M01-M03 skipped: no category reference, same as c340. M10/M14: Supabase/Sentry MCP unauthenticated, DONE-DEFERRED/BLOCKED as in c342.
No code changes; no forbidden files touched.

RESULT: BLOCKED M05 test (17 failing, migration-gate tests + push/backup/proxy); C128 still BLOCKED
