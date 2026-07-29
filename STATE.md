# KenyonExpress State (ke-arch worktree)

## Current Phase
Admin Dashboard Core (Fable 5). Docs channel on `arch/admin-supplier` (ke-arch).

## Last Completed
2026-07-29: `docs/ARCHITECTURE-NOTIFICATIONS.md` (docs only in ke-arch):

- Resend + Supabase Trigger + Edge Function/cron (no Make/Zapier)
- Event catalog: order.paid, coupon.issued/redeemed/expired, physical supplier alert, payout.sent, order.refunded
- Hebrew RTL templates, idempotency keys, retry/DLQ, rate limits, Ntfy admin
- `notification_log` schema draft with integer agorot; testing strategy
- Money constraints: coupon paid in full on site, no escrow, `platform_percent` snapshot on `order_items`

## In Progress
nothing

## Blocking Issues
none for this docs pass

## Next Task
Continue architecture docs as queued, or implement Admin Core on the implementation worktree.

## Working Directory
/Users/ofir/kenyonexpress-web/ke-arch

## Branch
`arch/admin-supplier`

## Models
Fable 5 (architecture) | Opus (docs/schema) | Sonnet (UI)

## Supabase Project URL
not set in this worktree STATE

---
## History

### 2026-07-29: ARCHITECTURE-NOTIFICATIONS rewrite
- Full binding notifications spec under 28.07 money rules. Docs only.

### 2026-07-29: ADMIN-PRODUCT-PAGE-SPEC
- Money/supplier/snapshot/validation spec under 28.07. Docs only.

### 2026-07-29: ARCHITECTURE-CUSTOMER-SUPPORT
- Full support/tickets architecture. Docs only.

### 2026-07-29: ARCHITECTURE-ANALYTICS rewrite (ke-arch)
- Focused goals, pipeline layers, privacy, RTL, sample queries. Docs only.

### Prior on this branch
- AI agents, checkout/fulfillment, SEO, coupon redemption, WP migration, admin, supplier portal.
