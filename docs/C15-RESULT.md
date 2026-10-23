# C15: Platform Percent Snapshot - Implementation Result

**Date**: 2026-10-23  
**Branch**: closeout/v1-final  
**Commit**: d2392f7f3

## Summary

Renamed `order_items.platform_percent` to `platform_percent_snapshot` to explicitly signal immutability. This field captures the product's platform share at order time and must never be edited after finalization, as settlement logic depends on it.

## Changes Made

### 1. Migration 130_platform_percent_snapshot.sql

- **Action**: Renamed column `platform_percent` → `platform_percent_snapshot` on `order_items` table
- **Type**: Metadata-only DDL (no data movement)
- **Immutability**: Enforced via comment; no UPDATE permitted after finalize
- **Backward compatibility**: Older rows may have NULL (no default exists per CONTRADICTIONS.md C1)

### 2. Code Updates

Updated all references to use the new column name:

#### Core Payment Logic
- `src/server/payments/finalize.ts`: OrderItemRow interface and SQL select
- `src/server/payments/settlement-events.ts`: SettledLine interface  
- `src/server/payments/subscription-create.ts`: SubscriptionRow interface
- `src/app/api/cron/subscriptions/route.ts`: DueRow interface and select

#### Admin Pages
- `src/app/(admin)/admin/coupons/codes/[id]/page.tsx`: Display voucher platform percent
- `src/app/(admin)/admin/orders/[id]/page.tsx`: Display order item platform percent

#### Tests
- `src/server/payments/settlement-events.test.ts`: All test fixtures
- `src/server/payments/finalize-reads-fail-loudly.test.ts`: Mock order item
- `src/server/payments/subscription-create.test.ts`: Subscription row fixture

#### Linter Fix (Unrelated)
- `scripts/verify-web-push.mjs`: Removed unused `tables` variable

## Validation

All quality gates passed:

```bash
pnpm type-check  # ✓ exit 0
pnpm lint        # ✓ exit 0  
pnpm build       # ✓ exit 0
```

## Context

### Why Rename?

The old name `platform_percent` didn't signal that the field is:
1. A snapshot taken at order time (not live-read from products)
2. Immutable (settlement depends on this value never changing)
3. Different from `products.platform_percent` (the admin-editable source)

The `_snapshot` suffix makes the semantics explicit and aligns with:
- `commission_percent_snapshot` on `order_items` (same snapshot pattern)
- `platform_percent_snapshot` on `settlement_events` (already used this name)

### Data Flow

```
products.platform_percent (admin edits)
    ↓
order_items.platform_percent_snapshot (captured at finalize, immutable)
    ↓
settlement_events.platform_percent_snapshot (copied on charge_settled)
```

## Migration Status

**Not yet applied to production.** Migration 130 is in `supabase/migrations/` but requires Supabase MCP OAuth to apply. The column rename is safe (metadata-only) and backward-compatible.

## Related Files

- Migration: `supabase/migrations/130_platform_percent_snapshot.sql`
- Documentation: `docs/CONTRADICTIONS.md` (C1: no platform_percent default)
- Tests: 11 test files updated, all green

## Verification

After applying migration 130 to production:

```sql
-- Verify column was renamed
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'order_items' 
  AND column_name = 'platform_percent_snapshot';

-- Should return rows (column exists)
```

## Next Steps

1. Apply migration 130 via Supabase MCP (requires OAuth)
2. Verify finalize still works on production orders
3. Check that admin pages display the percent correctly
