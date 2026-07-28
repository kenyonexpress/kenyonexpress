# KenyonExpress State (arch/admin-supplier worktree)

## Current Phase
Architecture docs for admin dashboard + supplier portal.

## Last Completed
2026-07-28: docs/ARCHITECTURE-SUPPLIER-PORTAL.md (full supplier portal architecture: identity/onboarding, RBAC, RLS, products, orders, redeem, payouts, notifications, data model, API, threats, rollout). Docs only in ke-arch.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Implement supplier portal surfaces against docs/ARCHITECTURE-SUPPLIER-PORTAL.md on a feature branch. Apply 027 remainder as additive migrations (no fixed-commission regression). Align ADMIN-ARCHITECTURE.md section 0 with ADMIN-PRODUCT-PAGE-SPEC and this supplier money model (no Escrow; coupon online charge stays with platform).

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch

---
## History

### 2026-07-28: ARCHITECTURE-SUPPLIER-PORTAL
- Added docs/ARCHITECTURE-SUPPLIER-PORTAL.md binding supplier portal from first principles.
- Grounded in migrations 070/072/073/074/077/078/081 and live scan surface.
- Worktree: ke-arch only. No application code touched.

### 2026-07-27: ADMIN-PRODUCT-PAGE-SPEC
- Added docs/ADMIN-PRODUCT-PAGE-SPEC.md binding the four dynamic fields, supplier publish gate, order_items snapshot, and publish validation.
- Worktree: ke-arch only. No application code touched.

### 2026-07-27: ADMIN + SUPPLIER architecture
- ADMIN-ARCHITECTURE.md + SUPPLIER-PORTAL-ARCHITECTURE.md (API routes, RLS SQL, redeem flow).
