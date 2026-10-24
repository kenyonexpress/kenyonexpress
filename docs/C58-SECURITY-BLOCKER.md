# C58 Security Blocker: Missing RLS Policies

**Status:** 🔴 BLOCKING - Feature cannot go to production without this  
**Severity:** CRITICAL  
**Date:** 2026-10-24

## Problem

C58 "how many bought" feature queries `order_items` table from anonymous users to display purchase counts. **RLS policies for `order_items` do not exist in production**, which means:

1. ❌ Anonymous users can currently access ALL order_items data (potential privacy breach)
2. ❌ Purchase count query returns 0 for anonymous users (feature broken)
3. ❌ Order history exposed if RLS isn't configured

## Evidence

```bash
# No RLS policies found in applied migrations:
$ grep -r "CREATE POLICY" migrations/applied/ | grep order_items
# (no output)

$ grep -r "ENABLE ROW LEVEL SECURITY" migrations/applied/ | grep order
# (no output)
```

Migration 134 comment mentions "order_items already has its policies" but no CREATE POLICY statements exist in the migration history.

## Required Fix

**Migration 297** created in `migrations/pending/297_order_items_purchase_count_rls.sql`:

1. **Enable RLS** on `order_items` table
2. **Anonymous policy**: Allow COUNT(*) but block SELECT rows
3. **Authenticated policy**: Users see only their own order_items
4. **Service role**: Implicit full access for admin operations

### Policy Design

```sql
-- Block anonymous row access, but allow COUNT() aggregate
CREATE POLICY anon_count_purchase_policy ON public.order_items
  FOR SELECT TO anon
  USING (false);

-- Users see only their own orders
CREATE POLICY user_view_own_order_items ON public.order_items
  FOR SELECT TO authenticated
  USING (order_id IN (SELECT id FROM orders WHERE user_id = auth.uid()));
```

## Why USING (false) Works for COUNT

PostgreSQL-specific behavior: RLS policies are evaluated before query execution. For `COUNT(*)`, the query planner uses an aggregate path that doesn't require row data, so it succeeds despite `USING (false)`. For `SELECT *`, the query needs actual rows, which RLS blocks.

**This is fragile** and may change in future PostgreSQL versions. Always verify with real anonymous client queries.

## Verification Required

Before production deployment:

1. ✅ Apply migration 297 to production via Supabase MCP (BLOCKED: OAuth unavailable)
2. ⚠️ Test with anonymous Supabase client:
   ```typescript
   const { count } = await supabase
     .from('order_items')
     .select('*', { count: 'exact', head: true })
     .eq('product_id', 'test-id')
   // Should return count > 0
   ```
3. ⚠️ Verify SELECT fails for anonymous:
   ```typescript
   const { data } = await supabase
     .from('order_items')
     .select('*')
     .eq('product_id', 'test-id')
   // Should return empty array (RLS blocks)
   ```

## Supabase MCP Limitation

**Cannot apply migration autonomously** because:
- Supabase MCP requires OAuth authentication
- Session is non-interactive (cannot complete OAuth flow)
- `apply_migration` tool unavailable

**Required manual action:**
1. Owner must authorize Supabase MCP in claude.ai connector settings
2. OR manually apply migration via Supabase dashboard
3. OR use Supabase CLI: `supabase db push`

## Impact if Not Fixed

🔴 **SECURITY**: Order details potentially exposed to anonymous users  
🔴 **BROKEN FEATURE**: Purchase count shows 0 for all products  
🔴 **COMPLIANCE**: May violate privacy regulations (GDPR, customer PII)

## Recommendation

**DO NOT deploy C58 to production** until:
1. Migration 297 is applied and verified
2. Anonymous COUNT query tested and working
3. Anonymous SELECT verified as blocked
4. Documented in MIGRATIONS-APPLIED.md

## Alternative Solutions Considered

1. **Server-side only counting**: Query with service role, return count
   - ✅ Secure
   - ❌ No realtime updates (defeats Supabase channel benefit)
   - ❌ Adds server load for every page view

2. **Materialized view with public SELECT**: Pre-aggregate counts
   - ✅ Secure (no order details exposed)
   - ✅ Fast (pre-computed)
   - ❌ Stale data (requires refresh trigger)
   - ❌ More complex migration

3. **RLS with USING (false) for anon** (chosen)
   - ✅ Allows COUNT() for anonymous
   - ✅ Blocks row SELECT for anonymous
   - ✅ Simple to implement
   - ⚠️ PostgreSQL-specific behavior (fragile)

## Files

- Migration: `migrations/pending/297_order_items_purchase_count_rls.sql`
- Query: `src/server/queries/product-purchase-count.ts` (uses anon client)
- Hook: `src/hooks/useProductPurchaseCount.ts` (uses anon client)
