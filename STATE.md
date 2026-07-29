# KenyonExpress State (ke-arch worktree)

## Current Phase
Admin Dashboard Core (Fable 5). Docs channel on `arch/admin-supplier` (ke-arch).

## Last Completed
2026-07-30: `docs/ARCHITECTURE-AI-AGENTS.md` (docs only in ke-arch):

- Agents: product_copy (Claude Hebrew), price_monitor, wp_migration, support_chat (RLS), admin_whatsapp_copilot
- Hebrew prompt templates, cost controls (`cost_agorot`), eval golden sets, human-approval write gate
- Constraints: coupon paid in full on site, no escrow, snapshotted `platform_percent`, money in agorot

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

### 2026-07-30: ARCHITECTURE-AI-AGENTS
- Full AI agents phase spec (five agents + eval + approval rails). Docs only.

### 2026-07-29: SEO-PERFORMANCE + MOBILE-APP
- Next.js 15 SEO/perf + Expo super-app on shared Supabase. Docs only.

### 2026-07-29: ARCHITECTURE-NOTIFICATIONS rewrite
- Resend + triggers + Edge worker; agorot log; no escrow coupon rules. Docs only.

### 2026-07-29: ADMIN-PRODUCT-PAGE-SPEC
- Money/supplier/snapshot/validation under 28.07. Docs only.

### 2026-07-29: ARCHITECTURE-CUSTOMER-SUPPORT
- Support/tickets architecture. Docs only.

### Prior on this branch
- Analytics, checkout/fulfillment, coupon redemption, WP migration, admin, supplier portal.
