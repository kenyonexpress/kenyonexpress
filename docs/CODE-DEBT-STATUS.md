# Code Debt Status Report

Last updated: 2026-10-20 16:00 UTC
Scanned: src/ (TypeScript, TSX, JavaScript, JSX)

## Summary

**Total code debt comments: 8**
- Previous scan: 8 (2026-10-20 15:57 UTC via MAINTENANCE_LOOP_8)
- Current scan: 8 (2026-10-20 16:00 UTC)
- Delta: 0 (stable, no growth detected)

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

**Attempted:** Yes
- ToolSearch("select:mcp__claude_ai_Supabase__list_tables") → "No matching deferred tools found"
- ToolSearch("+supabase sql execute") → "No matching deferred tools found"
- System reminder confirms: "Supabase MCP requires authentication... This session is non-interactive, so Claude cannot run the OAuth flow"

**Constraint:** Supabase MCP tools unavailable in non-interactive session due to OAuth requirement
**Scope Assessment:** Code debt scan is pure static text analysis of src/ files; zero database operations, RLS policies, or schema changes required
**Status:** Requirement unsatisfiable in this session context due to authentication unavailability, not scope mismatch

## Next Scan

Run: `grep -rn "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mts" --include="*.mjs"`

Expected: Count should remain ≤ 8 unless new work is queued.
