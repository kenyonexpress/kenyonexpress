# C11: Club tiers (bronze / silver / gold / platinum)

Tier = trailing-12-month paid spend, integer agorot only (no floats, no numeric columns).

| Tier | Key | Threshold |
|------|-----|-----------|
| ארד | bronze | 0 |
| כסף | silver | 500 ILS (50,000 agorot) |
| זהב | gold | 2,000 ILS (200,000 agorot) |
| פלטינה | platinum | 5,000 ILS (500,000 agorot) |

Spend = orders with `paid_at` in the last 365 days, status not cancelled / refunded / pending, `deleted_at` null, summed from `orders.total_ils_agorot`.

## What shipped

- `migrations/pending/164_club_tiers.sql`: idempotent `club_tiers` table + seed (same as applied 282) and `public.compute_tier(p_user_id uuid)` returning `tier_key, tier_name_he, spend_agorot, next_tier_key, to_next_agorot`. SECURITY INVOKER, `search_path = ''`, execute revoked from public/anon, granted to authenticated. Orders RLS means a customer only ever sees their own spend. Rollback: `drop function if exists public.compute_tier(uuid);`
- `src/components/club/TierBadge.tsx` + `src/styles/tier-badge.css`: chip, logical properties only, tone per tier key.
- Profile (`AccountPageContent`): badge replaces the plain-text tier name.
- Checkout (`src/app/(store)/checkout/page.tsx`): "חבר/ת מועדון" line with the badge under the title, shown to signed-in non-anonymous customers only.
- `getMyTier()` now returns `tierKey` (from `v_user_tier.tier_key`, or the lowest `club_tiers` row when there is no spend). Tests updated.

## Verification

- `tsc --noEmit`: clean.
- vitest: `club.test.ts`, `src/components/account`, `src/styles` pass except `tokens.test.ts` "no raw hex" (`#dee2e6` in product-page CSS), which fails identically without these changes.
- No forbidden file touched. Home / product / /c / /c/<slug> not edited, so compare.mjs numbers are unchanged by this item.

## Not done

- Migration 164 is **not applied**: the Supabase MCP is unauthenticated in this session (same as C06/C10). Until it is applied, the UI keeps working through the already-applied `v_user_tier` view (282); `compute_tier` has no caller in app code yet.
- Benefits stay empty by design: nothing in checkout grants one, so none are advertised.
