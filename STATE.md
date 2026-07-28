# KenyonExpress State (ke-admin worktree)

## Current Phase
Admin Dashboard Core (Fable 5). Docs channel open on `arch/admin-supplier`.

## Last Completed
2026-07-28: Three architecture docs written (docs only):

1. `docs/ARCHITECTURE-SEO-PERFORMANCE.md` (meta, hreflang he-IL, sitemap, JSON-LD, R2/next/image, ISR, CWV, Hebrew SEO)
2. `docs/ARCHITECTURE-COUPON-REDEMPTION.md` (signed QR, scan PWA, state machine, races, offline, redemption_events, fraud, migrations 077+)
3. `docs/ARCHITECTURE-WP-MIGRATION.md` (WP inventory, field maps, R2 media, 301s, dry-run, rollback, DNS cutover)

Money rules embedded everywhere: dynamic `platform_percent` (no default), coupon online `coupon_price_ils` + till remainder, physical immediate split, platform never a supplier, PDP shows supplier.

## In Progress
Admin Dashboard Core goal (Fable 5). Docs channel on `arch/admin-supplier`.

## Blocking Issues
none for this docs pass

## Next Task
Implement Admin Core surfaces (RBAC shell → product money editor → …) using the three new specs plus `ARCHITECTURE-ADMIN.md`.

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
