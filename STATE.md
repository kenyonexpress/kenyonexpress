# KenyonExpress State (ke-docs-pack)

## Current Phase
Docs on branch `docs/final-pack` (worktree only).

## Last Completed
Rewrote `docs/ARCHITECTURE-NOTIFICATIONS.md` (2026-08-03): Resend +
Supabase Edge Functions, three core events (order_paid, supplier_sale,
voucher_redeemed), Hebrew RTL templates, retry + DLQ, Escrow 2026-07-27
wording. Updated V2 pointer. Docs only. No code. No git push.

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
  Live kinds from migration 095: `order_paid`, `supplier_sale`, `voucher_redeemed`.

---

## History

### 2026-08-03: ARCHITECTURE-NOTIFICATIONS rewrite
- Canonical notifications architecture rewritten for final-pack.

### 2026-08-03: cart-measurements
- New `refs/cart-measurements.md` from Electro home-v7 DevTools extract.

### 2026-08-03: LAUNCH-DAY
- New Hebrew runbook for cutover day.
