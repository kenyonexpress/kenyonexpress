# Code Debt Status Report

Last updated: 2026-10-26 05:55 UTC
Scanned: src/ (TypeScript, TSX, JavaScript, JSX)

## Summary

**Total code debt comments: 13**
- Previous scan: 8 (2026-10-22 00:30 UTC)
- Current scan: 13 (2026-10-26 05:55 UTC via MAINTENANCE_LOOP_8)
- **Delta: +5 (GROWTH DETECTED — cleanup goal queued)**

## Findings

### TODO Comments (13)

| File | Line | Comment |
|------|------|---------|
| src/app/api/cron/stock-notifications/route.ts | 126 | revalidateTag may require different API in Next.js 16 |
| src/lib/payments/cardcom.ts | 249 | confirm the exact legacy refund endpoint + field names against |
| src/lib/payments/cardcom.ts | 312 | confirm endpoint + field names against the live terminal |
| src/lib/images/r2-migration.ts | 103 | Query database for all product images |
| src/lib/images/r2-migration.ts | 104 | Batch upload to R2 |
| src/lib/images/r2-migration.ts | 105 | Update product.images URLs to point to R2 |
| src/lib/images/r2-migration.ts | 106 | Verify uploads and delete from source |
| src/lib/whatsapp.test.ts | 91 | process.env.NEXT_PUBLIC_WHATSAPP_PHONE = 'TODO' |
| src/lib/wallet/cardcom-refund.ts | 29 | Production implementation |
| src/lib/wallet/integration.test.ts | 12 | Requires Supabase connection |
| src/lib/wallet/integration.test.ts | 20 | Requires Supabase connection |
| src/lib/wallet/integration.test.ts | 28 | Requires Supabase connection |
| src/lib/wallet/integration.test.ts | 37 | Requires Supabase connection with RLS enabled |

## New Since Last Scan (2026-10-22 → 2026-10-26)

Five new code debt markers added:
1. `src/lib/wallet/cardcom-refund.ts:29` — Production implementation
2-5. `src/lib/wallet/integration.test.ts:12,20,28,37` — Four test stubs requiring Supabase connection

## Notes

- r2-migration.ts: 4 related TODOs for R2 image migration workflow (not yet started)
- cardcom.ts: 2 related TODOs for payment endpoint confirmation (legacy API dependencies)
- wallet/: 5 new TODOs (cardcom-refund production impl + integration test stubs)
- No FIXME or HACK comments found
- **Count growth:** +5 items since 2026-10-22 — cleanup goal **QUEUED** per MAINTENANCE_LOOP_8 rules

## Next Steps

**Cleanup goal queued:** `CODE_DEBT_CLEANUP_1`
- Target: Retire at least 3 of the 13 TODOs
- Focus: wallet/cardcom-refund (1), wallet/integration.test (4 in tests, low priority), r2-migration (4 infrastructure tasks)
- Threshold: Keep total ≤ 10 by end of cleanup goal

## Supabase MCP Requirement

**Goal requirement:** "Use Supabase MCP for DB, RLS, migrations"

**Attempted:** Yes
- ToolSearch("select:mcp__claude_ai_Supabase__list_tables") → "No matching deferred tools found"
- ToolSearch("+supabase sql execute") → "No matching deferred tools found"
- System reminder confirms: "Supabase MCP requires authentication... This session is non-interactive, so Claude cannot run the OAuth flow"

**Constraint:** Supabase MCP tools unavailable in non-interactive session due to OAuth requirement
**Scope Assessment:** Code debt scan is pure static text analysis of src/ files; zero database operations, RLS policies, or schema changes required
**Status:** Requirement unsatisfiable in this session context due to authentication unavailability, not scope mismatch

## Run Scan Command

```bash
grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mts" --include="*.mjs"
```

Expected: Keep count ≤ 10 after cleanup goal completion.
