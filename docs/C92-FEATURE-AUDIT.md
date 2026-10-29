# C92 FEATURE-AUDIT (F11 F12 F13 F14)

Date: 2026-10-30. Live DB not readable: `db.sh` returns `password authentication failed` and the Supabase MCP is unauthorized in this session. "Migration applied" is judged from `migrations/applied/` only, not from the live schema.

| Feature | Routes / UI | Migrations | Tests | Status |
|---|---|---|---|---|
| F11 club tiers | `/club`, `/account/club`, `/admin/clubs`, `/admin/club-tiers`, `TierBadge` | `applied/282_club_tiers.sql`; `pending/164_club_tiers.sql` (compute_tier) NOT applied | club + tier tests pass | DONE (164 unapplied, see below) |
| F12 affiliate | `/affiliate`, `/account/affiliate` (link, QR, agorot earnings), `/admin/affiliates(/campaigns)`, cron `affiliate-payouts` to wallet, `ke_aff` cookie 30d | `applied/189`, `applied/283` | affiliate tests pass | DONE |
| F13 filter chips | `CategoryFilterChips` on `/`, `/products`, `/c/[slug]`, `/category/[slug]`; free shipping = `shipping_price_agorot = 0` | `applied/278`, `applied/284`; `pending/306_suppliers_open_weekends.sql` NOT applied | chip tests pass | FIXED |
| F14 web push | `public/sw.js`, `/api/push/subscribe` + `unsubscribe`, `/admin/push`, `BrowserPushToggle` on `/account/notifications`, `PushPrompt` post-purchase, T-7/T-1 + order status templates | `applied/290`; `applied/311`-cron per STATE | push tests pass | DONE |

## Fixed
- `src/lib/category-page.ts`: `getCategoryProducts` selected `suppliers(open_weekends)` while migration 306 is unapplied. Postgres 42703 would fail the whole select and empty every `/c/<slug>` page. Removed the column from the select. Same pattern as the earlier `verification_status` fix. Re-add it when 306 is applied.

## Not verified / still open
- Migrations 164 and 306 are not applied: DB credentials rejected. Apply one at a time through `db.sh` or MCP `apply_migration` after the keychain item `ke-supabase-db` is refreshed (same unblock as C81/C83).
- Chip UI visuals and compare.mjs not run here.

RESULT: DONE (code verified and gap fixed; 164/306 apply deferred on DB auth)
