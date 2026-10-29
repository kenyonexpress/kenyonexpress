# C11 - Club tiers

Four tiers by trailing-12-month spend: bronze, silver, gold, platinum.

| Tier | Hebrew | Min spend (agorot) | Min spend (ILS) |
|------|--------|-------------------:|----------------:|
| bronze | ברונזה | 0 | 0 |
| silver | כסף | 200000 | 2,000 |
| gold | זהב | 500000 | 5,000 |
| platinum | פלטינום | 1500000 | 15,000 |

## Database - `migrations/pending/164_club_tiers.sql`

- `club_tiers(code, name_he, min_spend_agorot integer, rank)`: RLS on, public read, seeded with the table above. Integer agorot only.
- `fn_club_spend_12mo(user)`: sum of `customer_pays_now_agorot + wallet_applied_agorot` over orders in `paid` / `partially_fulfilled` / `fulfilled` with `paid_at` in the last 12 months. Cancelled and refunded orders do not count. Callable only for the caller's own id or by service_role.
- `fn_club_tier(user)`: highest-rank tier whose threshold the spend reaches.
- `compute_tier(user_id)`: the spec entry point, returns the tier code. Execute granted to `authenticated` and `service_role`, revoked from `anon`.
- Supersedes the unapplied `243_club_tiers.sql` draft (3 tiers), moved to `migrations/cancelled/`.
- Rollback is in the migration header.

## Server

- `src/server/queries/club.ts`: `computeTier(userId)` calls `compute_tier`; `getMyClubTier()` maps it to a display tier; `getMyClubStanding()` (spend, next tier, progress) is unchanged.
- `src/lib/club/tiers.ts`: `DEFAULT_CLUB_TIERS` mirrors the seed (the table is the source of truth); `clubStanding` does integer progress math.

## UI

- `src/components/account/ClubTierBadge.tsx` + `src/styles/club-tier-badge.css`: inline pill, logical properties only.
- Profile: next to the title on `/account`, and on `/account/club`.
- Checkout: inline in the `h1`, rendered only for signed-in shoppers after the data loads, so guests and the pixel-gated layout are unchanged and no line moves.
- A failed read (e.g. 164 not yet applied) renders no badge; nothing breaks.

## Status

- tsc, biome and `src/lib/club` tests pass.
- 164 is in `migrations/pending/` and is NOT applied: the Supabase MCP needs authorization in this session. Apply with MCP `apply_migration` on project ixvwfbuvfxxsjiywhbbb; the badge appears once it is applied.
- No forbidden files touched.
