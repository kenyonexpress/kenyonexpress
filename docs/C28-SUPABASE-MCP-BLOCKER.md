# C28: Supabase MCP Blocker

**Date:** 2026-10-24  
**Goal:** C28|Expiry reminders T-7 + T-1 via pg_cron. Push + email per prefs. **Use Supabase MCP for DB, RLS, migrations.**  
**Status:** BLOCKED - Supabase MCP unavailable

## Blocker Evidence

### ToolSearch Attempt

```
ToolSearch("select:mcp__claude_ai_Supabase__execute_sql,mcp__claude_ai_Supabase__query_database,mcp__claude_ai_Supabase__apply_migration")
→ "No matching deferred tools found"
```

### System Reminder

```
The following MCP servers require authentication before their tools can be used:
- claude.ai Supabase

This session is non-interactive, so Claude cannot run the OAuth flow here.
```

### What Cannot Be Done Without Supabase MCP

1. **Verify migration 114 applied status** - `enqueue_expiring_voucher_notices` function
2. **Verify migration 162 applied status** - pg_cron job `ke-expire-vouchers`
3. **Apply migrations if not applied** - goal explicitly requires using Supabase MCP
4. **Verify RLS policies** - check push_tokens, notification_outbox policies
5. **Query production data** - confirm function exists, cron job scheduled

## Migration Status (File System Only)

### Migration 114: enqueue_expiring_voucher_notices

**Location:** `supabase/migrations/114_push_tokens.sql`  
**Status:** NOT in `migrations/applied/`, NOT in `migrations/pending/`  
**Evidence:** File exists in legacy `supabase/migrations/` directory

**Function signature:**
```sql
CREATE OR REPLACE FUNCTION public.enqueue_expiring_voucher_notices(
  p_buckets integer[] DEFAULT ARRAY[7, 1]
)
RETURNS integer
```

### Migration 162: pg_cron schedule

**Location:** `migrations/pending/162_cron_schedule.sql`  
**Status:** File header says "NOT APPLIED" (line 3)  
**Conflicting evidence:** `docs/MIGRATIONS-APPLIED.md` line 71 lists 162 as applied in C02 batch

**Job definition:**
```sql
('ke-expire-vouchers', '15 23 * * *', '/api/cron/expire-vouchers')
```

## Code Verification (Without DB Access)

### ✅ Cron Endpoint Exists

**File:** `src/app/api/cron/expire-vouchers/route.ts`

Calls three RPCs in order:
1. `expire_vouchers()` - flip expired vouchers
2. `credit_expired_vouchers()` - credit wallets
3. `enqueue_expiring_voucher_notices([7, 1])` - queue T-7/T-1 reminders

### ✅ Templates Exist

- Email: `src/lib/email/notifications.ts` (buildVoucherExpiringEmail)
- Push: `src/lib/push/templates.ts` (couponExpiring)
- Typed: `src/emails/expiry-reminders.ts` (buildVoucherExpiryEmail)

### ✅ Tests Exist

- `src/lib/reminders/plan.test.ts` (7 tests)
- `src/app/api/cron/expire-vouchers/route.test.ts`
- `src/lib/push/templates.test.ts`
- `src/emails/emails.test.ts`

## What IS Verified

1. ✅ Code structure is correct
2. ✅ Templates render Hebrew RTL
3. ✅ Tests pass
4. ✅ Quality gates clean (type-check, lint, build)
5. ✅ Cron endpoint calls correct RPC with [7, 1]

## What CANNOT Be Verified

1. ❌ Migration 114 applied to production
2. ❌ Migration 162 applied to production
3. ❌ RLS policies active
4. ❌ pg_cron job actually scheduled
5. ❌ Function exists in production database

## Recommendation

This goal cannot be completed as stated because:
- Goal explicitly requires: "Use Supabase MCP for DB, RLS, migrations"
- Supabase MCP requires OAuth
- OAuth unavailable in non-interactive sessions
- Same blocker as C25, C22, C17, C26

**Options:**
1. Mark as BLOCKED pending Supabase MCP OAuth
2. Redefine goal to exclude Supabase MCP requirement
3. Run in interactive session where OAuth is available

## Related Blockers

- C26: Affiliate system verification - same Supabase MCP blocker
- C25: (unknown, referenced in STATE.md)
- C22: (unknown, referenced in STATE.md)
- C17: (unknown, referenced in STATE.md)
