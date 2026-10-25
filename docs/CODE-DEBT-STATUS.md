# Code Debt Status Report

Last updated: 2026-10-26 08:15 UTC
Scanned: src/ (TypeScript, TSX, JavaScript, JSX)

## Summary

**Total code debt comments: 7**
- Previous scan (M07): 8 (2026-10-22 00:30 UTC)
- Scan M08: 7 (2026-10-25 00:00 UTC)
- Current scan (M08 recheck): 7 (2026-10-26 08:15 UTC via MAINTENANCE_LOOP_8)
- Delta since M08: 0 (stable — no new debt added)

## Findings

### TODO Comments (7)

| File | Line | Comment |
|------|------|---------|
| src/app/api/cron/stock-notifications/route.ts | 126 | revalidateTag may require different API in Next.js 16 |
| src/lib/payments/cardcom.ts | 249 | confirm the exact legacy refund endpoint + field names against |
| src/lib/payments/cardcom.ts | 312 | confirm endpoint + field names against the live terminal |
| src/lib/images/r2-migration.ts | 103 | Query database for all product images |
| src/lib/images/r2-migration.ts | 104 | Batch upload to R2 |
| src/lib/images/r2-migration.ts | 105 | Update product.images URLs to point to R2 |
| src/lib/images/r2-migration.ts | 106 | Verify uploads and delete from source |

### Removed Since Last Scan

- `src/lib/whatsapp.test.ts:91` — test stub env var (`process.env.NEXT_PUBLIC_WHATSAPP_PHONE = 'TODO'`) has been cleaned up

## Notes

- r2-migration.ts: 4 related TODOs for R2 image migration workflow (not yet started)
- cardcom.ts: 2 related TODOs for payment endpoint confirmation (legacy API dependencies)
- No FIXME or HACK comments found
- All TODOs are legitimate pending work, not indicative of broken state
- **No cleanup goal needed** — count stable at 7, no growth since last scan

## Supabase MCP Requirement

**Goal requirement:** "Use Supabase MCP for DB, RLS, migrations"

**Attempted:** Yes
- ToolSearch("select:mcp__claude_ai_Supabase__list_tables") → "No matching deferred tools found"
- ToolSearch("+supabase sql execute") → "No matching deferred tools found"
- System reminder confirms: "Supabase MCP requires authentication... This session is non-interactive, so Claude cannot run the OAuth flow"

**Constraint:** Supabase MCP tools unavailable in non-interactive session due to OAuth requirement
**Scope Assessment:** Code debt scan is pure static text analysis of src/ files; zero database operations, RLS policies, or schema changes required
**Status:** Requirement unsatisfiable in this session context due to authentication unavailability, not scope mismatch

## Next Scan

Run: `grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mts" --include="*.mjs"`

Expected: Count should remain ≤ 7 unless new work is queued.
