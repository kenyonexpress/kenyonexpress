# KenyonExpress State (arch/admin-supplier worktree)

## Current Phase
Architecture docs for admin dashboard + supplier portal.

## Last Completed
2026-07-27: docs/ADMIN-PRODUCT-PAGE-SPEC.md (four dynamic money knobs, supplier publish gate, order_items snapshot, validation rules). Docs only; no code.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Implement admin product form against ADMIN-PRODUCT-PAGE-SPEC.md on a feature branch when ready.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch

## Supabase Project URL
not set in this worktree

---
## History

### 2026-07-27: ADMIN-PRODUCT-PAGE-SPEC
- Added docs/ADMIN-PRODUCT-PAGE-SPEC.md under ke-arch only
- Binding contract for platform_percent, supplier_split_percent, discount_percent, coupon_price_ils
- Supplier identity required on publish; snapshot columns on order_items
- Supersedes ADMIN-ARCHITECTURE.md coupon hardcoded platform_percent=100 for the product form

### 2026-07-27: ADMIN + SUPPLIER architecture
- ADMIN-ARCHITECTURE.md + SUPPLIER-PORTAL-ARCHITECTURE.md (API routes, RLS SQL, redeem flow)
