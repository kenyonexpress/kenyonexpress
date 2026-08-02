# KenyonExpress State (ke-docs-pack)

## Current Phase
Docs on branch `docs/final-pack` (worktree only).

## Last Completed
Expanded `docs/ARCHITECTURE-NOTIFICATIONS.md` (2026-08-03): full
transactional catalog (order confirmation, coupon+QR, redeemed, supplier
new-order, refund), Resend + Edge triggers, Hebrew RTL templates, retry,
DLQ, idempotency keys. Docs only in ke-docs-pack. Main worktree untouched.

## In Progress
nothing

## Blocking Issues
none

## Next Task
Continue docs queue when specified. No push unless asked.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-docs-pack

## Branch
`docs/final-pack`

## Supabase Project URL
not set in this worktree

## החלטות שהתקבלו אוטומטית
- Launch day starts with `CHECKOUT_ENABLED=false` until test purchase PASS.
- Canonical host documented as apex `https://kenyonexpress.co.il`.
- Cardcom secrets only in Vercel Production (four `CARDCOM_*` vars from `.env.example`).
- Mini-cart dropdown on Electro home-v7 is not painted below Bootstrap `xl`
  (~1200px); at 380/768 cart entry is header/footer link to `/cart/`. Computed
  styles of `.dropdown-menu-mini-cart` still recorded as the design contract.
- Notifications target drain = Edge `notifications-worker`; Vercel cron
  `/api/cron/notifications` is an allowed bridge while `pg_net` is absent.
- Canonical notification kinds (target): `order_confirmation`,
  `coupon_purchased`, `coupon_redeemed`, `supplier_new_order`, `refund`.
  Live 095 bridge kinds remain `order_paid`, `supplier_sale`, `voucher_redeemed`.

---

## History

### 2026-08-03: ARCHITECTURE-NOTIFICATIONS full catalog
- Five core events + QR + refund + idempotency section.

### 2026-08-03: ARCHITECTURE-NOTIFICATIONS rewrite
- Canonical notifications architecture rewritten for final-pack.

### 2026-08-03: cart-measurements
- New `refs/cart-measurements.md` from Electro home-v7 DevTools extract.

### 2026-08-03: LAUNCH-DAY
- New Hebrew runbook for cutover day.
