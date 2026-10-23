# C16: Payment & Refund Infrastructure - RESULT

**Status:** COMPLETE  
**Date:** 2026-10-23  
**Migration:** `migrations/pending/300_c16_payment_refund_infrastructure.sql`  
**Branch:** autopilot

## Summary

Consolidated migration providing complete payment event tracking, refund management, search indexing, and state transition guards. All components use idempotent IF NOT EXISTS guards and are ready for production deployment.

## Components Delivered

### 1. Payment Events Table (`payment_events`)

**Purpose:** Append-only lifecycle journal for payment operations.

**Features:**
- 38-value `payment_event_type` enum covering entire payment flow
- Unique constraint on `external_event_id` for webhook deduplication
- Integer agorot amounts (never float, never shekels)
- JSONB detail field for extensibility
- Actor tracking (ID + role)
- Environment tagging
- Service-role only (RLS enabled, zero policies)

**Integration:** Written by `src/server/payments/payment-events.ts`

**Use Cases:**
- Detect webhook replays (23505 on external_event_id)
- Reconstruct payment timeline for debugging
- Distinguish provider failures from verification contradictions
- Join with Sentry alarms via `stage` field

### 2. Refunds Table (`refunds`)

**Purpose:** Statutory refund record per Consumer Protection Law (14ג, 14ה).

**Features:**
- State machine: requested → approved/rejected → executing → completed/failed
- Statutory ground classification (distance_sale_14d, defect, duplicate_charge, etc.)
- 14-day deadline enforcement via trigger (refund_due_by = requested_at + 14 days)
- 5% cancellation fee cap (max ₪100), enforced by CHECK constraint
- Zero fee requirement for wallet refunds (CHECK constraint)
- Destination tracking (original_method | wallet)
- Integer agorot amounts throughout

**Integration:** Written by `src/server/payments/refund-record.ts`

**Constraints:**
- `refunds_wallet_has_no_fee`: wallet destination → fee must be 0
- `refunds_granted_le_requested`: granted cannot exceed requested
- `refunds_fee_le_5pct_capped_100`: fee ≤ min(requested×5%, ₪10000)

### 3. Search Index Outbox (`search_index_outbox`)

**Purpose:** Durable product reindex queue (floor under Supabase webhook).

**Features:**
- Product NOT foreign key (deleted products still owe delete jobs)
- Operations: upsert | delete
- Exponential backoff via `next_try_at`
- Attempt tracking and error logging
- Claim function with SKIP LOCKED for concurrent drains
- Automatic enqueue on product INSERT/UPDATE/DELETE

**Integration:**
- Trigger: `tg_products_enqueue_search_index`
- Claim: `fn_claim_search_index_jobs(p_limit)`
- Drain: `/api/cron/search-index-drain` (hypothetical)

**Smart Enqueue Logic:**
- Soft delete → `delete` operation
- `status != 'active'` → `delete` operation
- Active product → `upsert` operation

### 4. State Transition Guards

**Purpose:** Prevent illegal status transitions at database level.

#### Orders Status Guard (`fn_orders_status_guard`)

Allowed transitions:
```
pending → cancelled | paid
paid → fulfilled | partially_fulfilled | platform_settled | refunded
partially_fulfilled → fulfilled | refunded
fulfilled → platform_settled | refunded
platform_settled → refunded
```

Terminal states: `cancelled`, `refunded`

#### Payments Status Guard (`fn_payments_status_guard`)

Allowed transitions:
```
initiated → redirected | succeeded | failed
redirected → succeeded | failed
succeeded → platform_settled | refunded
platform_settled → refunded
```

Terminal states: `failed`, `refunded`

#### Order Items Settlement Status Guard (`fn_order_items_settlement_status_guard`)

Allowed transitions (18 total):
```
pending → cancelled | paid | refunded | split_executed
paid → cancelled | platform_settled | redeemed | refunded | split_executed
split_executed → redeemed | refunded
platform_settled → redeemed | refunded
escrow_held → escrow_released | redeemed | refunded
escrow_released → redeemed | refunded
```

Terminal states: `cancelled`, `redeemed`, `refunded`

**Guard Behavior:**
- NULL status on either side → allowed (INSERT and non-participating updates)
- Same old/new status → allowed (no-op updates)
- Unlisted transition → 23514 exception with descriptive message

## Security Model

All three new tables:
- RLS ENABLED
- Zero policies (service-role only)
- REVOKE ALL FROM anon, authenticated

This is the "zero-policy lock" pattern: RLS with no policies denies every client role, and the service key bypasses RLS.

## Money Handling

**Integer Agorot Only** (src/lib/money.ts rule):
- `payment_events.amount_agorot`: bigint
- `refunds.requested_agorot`: bigint
- `refunds.granted_agorot`: bigint
- `refunds.cancellation_fee_agorot`: bigint

Never `numeric`, never shekels. Non-integer amounts are logged and dropped to NULL rather than silently rounded.

## Idempotency

All components use:
- `DO $$ BEGIN IF NOT EXISTS...` for enums
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION`
- `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`

Safe to apply multiple times. Already-existing components are skipped without error.

## Testing

**Test Coverage:**

1. **c16-schema.test.ts** (12 tests)
   - Enum value alignment with TypeScript constants
   - Table structure verification
   - Constraint existence checks
   - RLS and permission verification

2. **c16-state-guards.test.ts** (13 tests)
   - All valid transitions declared
   - Invalid transitions forbidden
   - NULL and no-op handling
   - Error code verification (23514)

3. **Existing integration tests:**
   - `payment-events.test.ts`: 38-value enum parsing
   - `refund-record.test.ts`: fee constraints, state transitions
   - `refund-wallet.test.ts`: wallet destination fee validation

**Run:** `pnpm test c16`

## Files Changed

### New Files
- `migrations/pending/300_c16_payment_refund_infrastructure.sql` (656 lines)
- `migrations/pending/preflight_300.sql` (preflight checks)
- `src/lib/migrations/c16-schema.test.ts` (schema verification)
- `src/lib/migrations/c16-state-guards.test.ts` (guard logic verification)
- `docs/C16-RESULT.md` (this file)

### Integration Points
- `src/server/payments/payment-events.ts` (already exists, uses payment_events table)
- `src/server/payments/refund-record.ts` (already exists, uses refunds table)
- Search drain worker will use `fn_claim_search_index_jobs()` when implemented

## Deployment

**Prerequisites:**
1. Base tables must exist: `orders`, `payments`, `products`, `order_items`
2. Supabase MCP OAuth configured (for migration application)

**Application:**
```bash
# 1. Run preflight checks
psql < migrations/pending/preflight_300.sql

# 2. Apply via Supabase MCP
# (requires OAuth, see docs/SUPABASE-MCP.md)

# 3. Verify
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('payment_events', 'refunds', 'search_index_outbox');
```

**Rollback:** See ROLLBACK section at bottom of migration file (commented out).

## Quality Gates

✅ All tests pass:
```bash
pnpm test c16  # 25/25 tests green
```

✅ Type-check clean:
```bash
pnpm type-check  # 0 errors
```

✅ Lint clean:
```bash
pnpm lint  # 0 errors
```

✅ Build succeeds:
```bash
pnpm build  # successful production build
```

## Production Readiness

**Status:** READY FOR MCP APPLICATION

**Blockers:** None (migration is idempotent)

**Known Limitations:**
1. payment_events and refunds tables declared in migrations 130/131 but never applied
2. search_index_outbox already applied (migration 132)
3. State guards already applied (migration 137)
4. This migration consolidates all four for completeness

**Next Steps:**
1. Apply migration 300 via Supabase MCP
2. Verify table creation in production
3. Monitor payment_events writes in production logs
4. Set up search drain cron job to consume search_index_outbox

## References

- Original migrations: 130, 131, 132, 137 (in `migrations/applied/`)
- State machine: `src/lib/checkout/state-machine.ts`
- Money rules: `src/lib/money.ts`
- Consumer Protection Law: תקנות הגנת הצרכן (ביטול עסקה), תשע"א-2010

---

**Autonomous Completion:** 2026-10-23 by Claude Sonnet 4.5  
**Attribution:** Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
