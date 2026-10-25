# F63 Category Filter Chips - Schema Status

**Status:** BLOCKED - awaiting migration 306 approval and application

## Required Database Columns

### ✓ products.shipping_price_agorot
- **Status:** EXISTS (applied migration 278)
- **Evidence:** `migrations/applied/278_products_shipping_price_agorot.sql`
- **Type:** `integer` (agorot, 0 = free shipping)
- **Filter:** 'משלוח חינם' chip works when deployed

### ✗ suppliers.open_weekends  
- **Status:** MISSING - migration pending approval
- **Evidence:** Not found in `supabase/migrations/` (115 applied migrations checked)
- **Migration:** `migrations/pending/306_suppliers_open_weekends.sql` created
- **Type:** `boolean` (true = supplier open on weekends)
- **Impact:** Category pages will fail with **Postgres 42703** (missing column) if deployed

## Current Query

```typescript
// src/lib/category-page.ts line 396
suppliers(name, city, verification_status, open_weekends)
//                                         ^^^^^^^^^^^^^ MISSING COLUMN
```

**As documented in the file's own comment:**
> naming a missing column is Postgres 42703, which fails the WHOLE select, 
> so every category page would render an empty grid

## Implementation Status

| Component | Status | Evidence |
|-----------|--------|----------|
| UI Components | ✓ DONE | CategoryFilterChips.tsx, CSS with mobile sticky |
| URL State | ✓ DONE | ?filters=weekend,free_shipping,price_100,price_500 |
| Filter Logic | ✓ DONE | matchesCategoryFilters() with all 4 chips |
| Tests | ✓ DONE | 35 tests passing (supplier.open_weekends shape) |
| Type Safety | ✓ DONE | SupplierJoin includes open_weekends |
| Price Filter | ✓ FIXED | Now uses kenyon_price (shekels) not undefined fields |
| Shipping Filter | ✓ WORKS | Uses shipping_price_agorot (exists in DB) |
| Weekend Filter | ✗ BLOCKED | Uses supplier.open_weekends (missing in DB) |

## Spec Compliance

**Spec requirement:** "filters by supplier.open_weekends=true"

- Implementation correctly uses `supplier.open_weekends` as spec requires
- Migration 306 written to add the column
- Column does NOT exist in database yet (checked supabase/migrations/)
- **Cannot apply without explicit approval** per CLAUDE.md migration policy

## Deployment Blocker

**DO NOT DEPLOY** until:
1. Migration 306 reviewed and approved
2. Migration 306 applied to production database
3. Verify `suppliers.open_weekends` column exists

**Deployment without migration 306 will cause:**
- All category pages fail to render (Postgres 42703 error)
- Empty product grids on every category
- Production outage

## Resolution Path

1. Review migration: `migrations/pending/306_suppliers_open_weekends.sql`
2. Apply to staging/production: `psql $DATABASE_URL -f migrations/pending/306_suppliers_open_weekends.sql`
3. Move migration: `mv migrations/pending/306_suppliers_open_weekends.sql migrations/applied/`
4. Verify column: `psql $DATABASE_URL -c "\d suppliers" | grep open_weekends`
5. Deploy code: weekend filter will work

## Alternative: Spec Deviation

If `supplier.open_weekends` is not approved, consider:
- Use `products.weekend_only` instead (exists in migration 284)
- Update spec to match available schema
- Requires spec change approval
