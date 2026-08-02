# KenyonExpress State (ke-docs-pack)

## Current Phase
Docs on branch `arch/docs-queue` (worktree only).

## Last Completed
Four architecture docs written in sequence (2026-08-03), each committed and
pushed to `arch/docs-queue`. Main worktree untouched.

1. `docs/ARCHITECTURE-NOTIFICATIONS.md` (de2df1d)
2. `docs/ARCHITECTURE-SEO-PERFORMANCE.md` (fbc3a9c)
3. `docs/ARCHITECTURE-MOBILE-APP.md` (5295e05)
4. `docs/ARCHITECTURE-E2E-TESTING.md` (this commit / next)

## In Progress
nothing

## Blocking Issues
none

## Next Task
Continue docs queue when specified.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-docs-pack

## Branch
`arch/docs-queue`

## Supabase Project URL
not set in this worktree

## החלטות שהתקבלו אוטומטית
- Docs queue for this sprint lands on `arch/docs-queue`, not main worktree.
- Notifications kinds (target): order_confirmation, coupon_purchased,
  coupon_redeemed, supplier_new_order, refund.
- Mobile is future Expo super-app on the same Supabase project as web.
- E2E: Playwright; full Cardcom/redeem only under `@staging` with seed.

---

## History

### 2026-08-03: docs queue (notifications, SEO, mobile, e2e)
- Four binding architecture docs pushed to `arch/docs-queue`.

### 2026-08-03: ARCHITECTURE-NOTIFICATIONS full catalog
- Five core events + QR + refund + idempotency section.

### 2026-08-03: cart-measurements
- New `refs/cart-measurements.md` from Electro home-v7 DevTools extract.

### 2026-08-03: LAUNCH-DAY
- New Hebrew runbook for cutover day.
