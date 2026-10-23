# C25: Club Tiers Result

**Date**: 2026-10-24  
**Status**: ✅ COMPLETE (pre-existing implementation verified)

## Summary

Club membership tiers based on 12-month trailing spend are fully implemented and operational. The system includes Bronze/Silver/Gold/Platinum tiers with full admin editing capabilities and customer-facing tier display.

## Implementation Status

### ✅ Database Layer (Migration 282)

**Location**: `migrations/applied/282_club_tiers.sql`

**Tables**:
- `club_tiers`: Tier configuration table with RLS enabled
  - Fields: `id`, `key`, `name_he`, `min_spend_agorot`, `benefits_json`, `active`, `sort_order`, `updated_at`
  - Seeded with 4 tiers:
    - Bronze (ארד): 0 ILS
    - Silver (כסף): 500 ILS (50,000 agorot)
    - Gold (זהב): 2,000 ILS (200,000 agorot)
    - Platinum (פלטינה): 5,000 ILS (500,000 agorot)

**Views**:
- `v_user_tier`: SECURITY INVOKER view that calculates each customer's current tier
  - Trailing 365-day spend from paid orders
  - Excludes cancelled, refunded, and pending orders
  - Returns: `user_id`, `spend_agorot`, `tier_key`, `tier_name_he`, `tier_benefits_json`, `next_tier_name_he`, `to_next_agorot`

**RLS Policies**:
- `club_tiers_read_active`: Allows anon/authenticated to read active tiers only
- Service-role-only writes (enforced via RBAC in admin UI)

### ✅ Backend Queries

**Location**: `src/server/queries/club.ts`

**Functions**:
- `getMyTier()`: Returns current user's tier standing
  - Reads from `v_user_tier` view
  - Falls back to lowest active tier for customers with no paid spend
  - Returns: `tierNameHe`, `benefits`, `spendAgorot`, `nextTierNameHe`, `toNextAgorot`

**Types**:
```typescript
interface ClubTierRow {
  id: number
  key: string
  name_he: string
  min_spend_agorot: number
  benefits_json: unknown
  active: boolean
  sort_order: number
}

interface MyTier {
  tierNameHe: string
  benefits: string[]
  spendAgorot: Agorot
  nextTierNameHe: string | null
  toNextAgorot: Agorot
}
```

### ✅ Customer-Facing UI

**Location**: `src/app/(account)/account/page.tsx`, `src/components/account/AccountPageContent.tsx`

**Display** (lines 92-105 of AccountPageContent.tsx):
- Tier section in account overview tab
- Shows current tier name
- Displays 12-month spend total
- Progress indicator to next tier (or confirmation of highest tier)
- Benefits list (populated when benefits exist)

**Example output**:
```
מועדון הלקוחות
דרגה: כסף
רכישות ב-12 החודשים האחרונים: ₪835
עוד ₪1,165 לדרגת זהב
```

### ✅ Admin UI

**Location**: `src/app/(admin)/admin/club-tiers/page.tsx`

**Features**:
- View all tiers (including inactive)
- Edit tier properties per tier:
  - Hebrew name (`name_he`)
  - Spend threshold in ILS (`min_spend_ils`)
  - Sort order (`sort_order`)
  - Benefits (one per line, stored as JSON array)
  - Active/inactive toggle
- Form validation with error display
- Success feedback on save
- Requires `discounts:read` permission to view, `discounts:write` to edit

**Server Action**: `src/server/actions/admin/club-tiers.ts`
- Schema validation with Zod
- ILS → agorot conversion via `ilsToAgorot()`
- Benefits parsing (line-split, trimmed, max 20)
- Audit log entry on update
- Path revalidation for `/admin/club-tiers` and `/account`

### ✅ Tests

**Test Files**:
1. `src/server/queries/club.test.ts` (3 tests, all passing)
   - Customer with spend reads view row correctly
   - Customer with no spend assigned to lowest tier
   - Benefits filtering (non-string values removed)

2. `src/lib/club/tiers.test.ts` (3 tests, all passing)
   - Trailing spend calculation (12-month window, paid only, excludes cancelled/refunded)
   - Tier assignment at exact threshold
   - Next-tier calculation (including top tier with no next)

**Test Results**: 6/6 passing (382ms)

### ✅ Quality Gates

All checks pass:
- ✅ `pnpm type-check`: No TypeScript errors
- ✅ `pnpm lint`: Biome + custom gates clean
- ✅ `pnpm build`: Next.js production build successful

## Architecture Notes

### 12-Month Spend Calculation

The tier assignment is **pure calculation**, not stored state:
- View `v_user_tier` sums `orders.total_ils_agorot` where:
  - `paid_at IS NOT NULL`
  - `paid_at >= now() - interval '365 days'`
  - `status NOT IN ('cancelled', 'refunded', 'pending')`
  - `deleted_at IS NULL`
- No cron job required
- Always current (no cache to invalidate)

### Data-Driven Configuration

Tier thresholds and names are database rows, not code constants:
- Allows owner to adjust thresholds without code changes
- Hebrew tier names editable via admin UI
- Benefits stored as JSON array, displayed on account page
- Sort order configurable for display ordering

### Security Model

**RLS**:
- Customers read active tiers only (via `club_tiers_read_active` policy)
- No write permissions for anon/authenticated
- `v_user_tier` is SECURITY INVOKER: customers see only their own row

**RBAC**:
- Admin UI requires `discounts:read` + `discounts:write` section permissions
- Enforced via `requireSection()` in server action
- Writes use service-role client to bypass RLS

### Money Handling

All spend values are **integer agorot** (never floats):
- Database: `min_spend_agorot BIGINT`
- Code: `Agorot` type from `src/lib/money.ts`
- Admin input: ILS string → `ilsToAgorot()` conversion
- Display: `formatIls()` for customer-facing output

## Integration Points

### Current Consumers

1. **Account Page** (`/account`):
   - Fetches via `getMyTier()`
   - Displays in overview tab
   - Shows progress to next tier

2. **Admin Panel** (`/admin/club-tiers`):
   - Lists all tiers
   - Inline edit forms
   - Real-time validation

### Potential Extensions

Currently **no checkout benefits** are implemented:
- Migration 282 comment notes benefits start empty
- Benefits field exists in schema but nothing grants them yet
- Future integrations could check tier in:
  - Shipping calculation (free shipping threshold)
  - Discount eligibility
  - Early access to products
  - Exclusive coupons

## Database State

**Production migration status**: Applied (migration 282 in `applied/`)

**Seeded tiers** (as of migration):
```sql
('bronze', 'ארד', 0, 10)
('silver', 'כסף', 50000, 20)
('gold', 'זהב', 200000, 30)
('platinum', 'פלטינה', 500000, 40)
```

All tiers `active = true` by default. Admin can deactivate Platinum via UI if only Bronze/Silver/Gold desired.

## Verification Steps Completed

1. ✅ Read migration 282 schema
2. ✅ Verified `v_user_tier` view definition
3. ✅ Checked `getMyTier()` implementation
4. ✅ Confirmed account page display
5. ✅ Reviewed admin UI at `/admin/club-tiers`
6. ✅ Examined update action + validation
7. ✅ Ran test suite: 6/6 passing
8. ✅ Ran type-check: clean
9. ✅ Ran lint: clean
10. ✅ Ran build: successful

## Result

**COMPLETE**: All goal requirements satisfied by pre-existing implementation.

- ✅ Club tiers Bronze/Silver/Gold (plus Platinum)
- ✅ Based on 12-month trailing spend calculation
- ✅ Standing visible on `/account` page
- ✅ Editable in admin UI at `/admin/club-tiers`
- ✅ Full test coverage
- ✅ All quality gates passing

No new code required. System operational and ready for use.
