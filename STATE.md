# KenyonExpress State (ke-admin worktree)

## Current Phase
Admin Dashboard Core (Fable 5). Docs channel open on `arch/admin-supplier`.

## Last Completed
2026-07-28: Checkout + fulfillment architecture pair (docs only):

1. `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md` (guest→pay, IL postal, Cardcom multi-account, webhook, idempotency, settlement_events, test matrix)
2. `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md` (supplier notify, portal orders, ship/deliver/refund machine, coupon QR/PDF delivery)

### החלטות שהתקבלו אוטומטית
- Prompt “Escrow until QR / Escrow on delivery” mapped to binding **no third-party Escrow**: coupon till is outside platform; prepaid may be internal `held`; physical split is immediate at `payment_settled`; delivery is fulfillment-only (payout remains T+3).

## In Progress
Admin Dashboard Core goal (Fable 5). Docs channel on `arch/admin-supplier`.

## Blocking Issues
none for this docs pass

## Next Task
Implement Admin Core surfaces (RBAC shell → product money editor → …) with checkout/fulfillment specs available for money snapshots and supplier notify hooks.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-admin

## Branch
`arch/admin-supplier`

## Models
Fable 5 (architecture / Admin Core) | Opus (docs/schema) | Sonnet (UI edits)

## Supabase Project URL
not set in this worktree STATE

---
## History

### 2026-07-28: Checkout Cardcom + fulfillment workflow
- Added `ARCHITECTURE-CHECKOUT-CARDCOM.md` and `ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`.
- Worktree: ke-admin. Docs only.

### 2026-07-28: SEO + coupon redemption + WP migration trio
- Wrote/rewrote `ARCHITECTURE-SEO-PERFORMANCE.md`, `ARCHITECTURE-COUPON-REDEMPTION.md`, `ARCHITECTURE-WP-MIGRATION.md`.
- Worktree: ke-admin. Docs only. No application code.

### 2026-07-28: ARCHITECTURE-SEO-PERFORMANCE (prior)
- Earlier SEO rewrite on this branch before the trio pass.

### 2026-07-28: Admin Dashboard Core opened
- Storefront goal closed on `phase5/homepage` (`40dae12`).
- Added `docs/ARCHITECTURE-ADMIN.md` as Core goal entry doc.
- Worktree: ke-admin. Docs only.

### Prior (inherited from arch docs on this branch)
- ARCHITECTURE-ADMIN-DASHBOARD, NOTIFICATIONS, SEO, MOBILE, SECURITY, SUPPLIER-PORTAL, ADMIN-PRODUCT-PAGE-SPEC.
