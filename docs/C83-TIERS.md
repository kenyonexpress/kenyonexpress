# C83 CLUB-TIERS-CLOSE (closes C25)

## Already in place (from C11, commit 732edfc8b)
- `migrations/pending/164_club_tiers.sql`: `club_tiers` table, seed bronze 0 / silver 50000 / gold 200000 / platinum 500000 agorot (12-month spend), `compute_tier(uuid)` (SECURITY INVOKER, integer agorot only).
- `computeTier` server fn and `ClubTierBadge` on `/account`, `/account/club` and the checkout heading (signed-in only).
- Tier tests: `npx vitest run -t tier` -> 9 files, 20 tests passed (2026-10-30).

## Not done
- Migration 164 is NOT applied. `db.sh` fails with `password authentication failed for user "postgres"` (same cause as C80/C82) and the Supabase MCP needs OAuth, which is unavailable in this non-interactive session.
- So `club_tiers`, the seed and `compute_tier` are unverified on the live DB (project ixvwfbuvfxxsjiywhbbb).

## Unblock
Store the current DB password in keychain `ke-supabase-db`, or authorize the Supabase MCP, then apply `164_club_tiers.sql` and move it to `applied/`.

RESULT: BLOCKED migration 164 not applied (db.sh password rejected, Supabase MCP unauthorized)
