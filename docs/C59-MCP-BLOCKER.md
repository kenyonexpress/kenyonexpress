# C59: Supabase MCP OAuth Blocker

## Issue

C59 requires "Use Supabase MCP for DB, RLS, migrations" but Supabase MCP cannot be used in this autonomous non-interactive session.

## Evidence

1. **System reminder states:**
   ```
   The following MCP servers require authentication before their tools can be used:
   claude.ai Supabase
   
   This session is non-interactive, so Claude cannot run the OAuth flow here.
   ```

2. **ToolSearch attempts failed:**
   ```
   ToolSearch(query="supabase", max_results=10) → "No matching deferred tools found"
   ToolSearch(query="select:mcp__claude_ai_Supabase__query,mcp__claude_ai_Supabase__execute_sql") 
     → "No matching deferred tools found"
   ```

3. **Project documentation requires MCP:**
   - ARCHITECTURE-OVERVIEW.md: "applying to production goes through MCP `apply_migration`"
   - Multiple docs specify: "להחיל רק דרך MCP `apply_migration`"
   - RUNBOOK.md: MCP is the required path for all migration application

## Work Completed Without MCP

### Migration Created
- ✅ `migrations/pending/298_voucher_8digit_redemption_codes.sql`
- ✅ Adds `redemption_code` and `redemption_code_signature` columns
- ✅ Includes all constraints: format validation, uniqueness, pairing
- ✅ Safe to apply: nullable columns, idempotent, no destructive operations

### Code Integration Complete
- ✅ `src/lib/voucher-code.ts`: generation and signing library
- ✅ `src/server/domain/vouchers/issue.ts`: integrated into voucher creation
- ✅ `src/server/queries/vouchers.ts`: queries include redemption_code
- ✅ `src/app/voucher/code/[id]/page.tsx`: displays stored redemption codes
- ✅ All tests passing (46/46)
- ✅ All quality gates passing (type-check, lint, build)

### What Cannot Be Done Autonomously

**Migration application requires:**
1. Supabase MCP with OAuth authentication, OR
2. Manual application via Supabase dashboard, OR
3. Manual `supabase db push` with proper credentials

**None of these are available in non-interactive autonomous mode.**

## Migration Application Procedure (Manual)

When Supabase MCP becomes available or manual application is authorized:

```sql
-- Execute migrations/pending/298_voucher_8digit_redemption_codes.sql
-- against the production database

-- Verification queries:
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'vouchers' 
  AND column_name IN ('redemption_code', 'redemption_code_signature');

SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'vouchers' 
  AND constraint_name LIKE '%redemption%';
```

## Status

**Code: COMPLETE** ✅  
**Database: BLOCKED on OAuth** ⚠️  
**Tests: PASSING** ✅  
**Quality Gates: PASSING** ✅

Migration 298 awaits manual application or OAuth-enabled MCP session.
