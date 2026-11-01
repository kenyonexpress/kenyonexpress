# Applying Migration 300 via Supabase MCP

**Migration:** 300_c16_payment_refund_infrastructure.sql  
**Status:** Ready for application  
**Requires:** Supabase MCP with OAuth configured

## Prerequisites

1. **Supabase MCP OAuth configured**
   - Navigate to claude.ai connector settings
   - Authorize the Supabase connector
   - Verify connection to production project

2. **Preflight check passed**
   ```bash
   # Run preflight in rolled-back block
   psql < migrations/pending/preflight_300.sql
   ```

3. **Review migration contents**
   - Verify enum values match TypeScript constants (see tests)
   - Confirm all components are idempotent (IF NOT EXISTS guards)
   - Review state guard transitions

## Application Steps

### Via Supabase MCP (when available)

Once OAuth is configured, the migration can be applied using Supabase MCP tools:

1. Load the migration content
2. Execute via MCP execute_sql tool
3. Verify table creation
4. Run post-application tests

### Manual Application (alternative)

If MCP remains unavailable, apply via Supabase dashboard or CLI:

#### Option A: Supabase Dashboard
1. Navigate to SQL Editor in Supabase dashboard
2. Paste migration content from 300_c16_payment_refund_infrastructure.sql
3. Execute
4. Verify no errors

#### Option B: Supabase CLI
```bash
# Requires supabase CLI and project linked
supabase db push --file migrations/pending/300_c16_payment_refund_infrastructure.sql
```

#### Option C: psql direct connection
```bash
# Requires connection string from Supabase dashboard
psql "$DATABASE_URL" < migrations/pending/300_c16_payment_refund_infrastructure.sql
```

## Post-Application Verification

Run these queries to verify successful application:

```sql
-- 1. Verify tables exist
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('payment_events', 'refunds', 'search_index_outbox');
-- Expected: 3 rows

-- 2. Verify enums exist
SELECT typname 
FROM pg_type 
WHERE typname IN ('payment_event_type', 'refund_ground', 'refund_state', 'refund_destination');
-- Expected: 4 rows

-- 3. Verify triggers exist
SELECT tgname 
FROM pg_trigger 
WHERE tgname IN (
  'tg_orders_status_guard',
  'tg_payments_status_guard', 
  'tg_order_items_settlement_status_guard',
  'tg_products_enqueue_search_index',
  'tg_refunds_force_due_by',
  'tg_refunds_set_updated_at'
);
-- Expected: 6 rows

-- 4. Verify RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('payment_events', 'refunds', 'search_index_outbox');
-- Expected: 3 rows with rowsecurity = true

-- 5. Test a state guard (should raise 23514)
BEGIN;
  -- This should fail with illegal transition error
  INSERT INTO orders (id, status) VALUES (gen_random_uuid(), 'pending');
  UPDATE orders SET status = 'fulfilled' WHERE id = (SELECT id FROM orders ORDER BY created_at DESC LIMIT 1);
  -- Expected: ERROR 23514: illegal orders.status transition: pending -> fulfilled
ROLLBACK;
```

## Integration Verification

Verify existing code works with new tables:

```bash
# Run payment events tests
pnpm test payment-events

# Run refund record tests  
pnpm test refund-record

# Run C16 migration tests
pnpm test c16
```

All should pass without changes (code already uses these tables).

## Rollback (if needed)

See ROLLBACK section at bottom of migration file (commented out).

**WARNING:** Only rollback if migration fails during application. Do not rollback after successful application and production writes.

## Current Status

- ❌ Supabase MCP: Not authorized (requires OAuth)
- ✅ Migration file: Created and tested
- ✅ Preflight check: Available
- ✅ Tests: 26/26 passing
- ✅ Integration points: Code ready (payment-events.ts, refund-record.ts)

## Notes

- Migration is idempotent - safe to run multiple times
- All tables use service-role only (RLS + zero policies)
- Integer agorot throughout (money.ts compliance)
- Consolidates migrations 130, 131, 132, 137
