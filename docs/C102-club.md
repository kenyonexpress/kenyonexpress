# C102 F11 CLUB TIERS

## Tiers
`club_tiers` (bronze / silver / gold / platinum) from 12-month paid spend in integer agorot:
bronze 0, silver 50000, gold 200000, platinum 500000. Already in `applied/282_club_tiers.sql`
(`v_user_tier` view) and `pending/164_club_tiers.sql` (`compute_tier(uuid)`).

## Benefits (new)
`migrations/pending/318_club_tier_benefits.sql` adds `club_tier_benefits`, one row per tier:
- `cashback_percent` smallint 0-100 (whole percent)
- `early_access_hours` integer 0-720
- `gift_value_agorot` bigint >= 0 (shekels typed in admin, converted once via `ilsToAgorot`)

RLS: read for active tiers only; writes via service role from the admin action. Preflight: `preflight_318.sql`.

## Admin
`/admin/club-tiers` (section `discounts`) now edits name, threshold, order, active, the free-text
benefit list and the three benefit values. Saves write an audit log row.

## Personal area header
`AccountNav` head shows the tier chip (`TierBadge`) under the email, fed by `getMyTier()` in
`src/app/(account)/layout.tsx`. No locked file touched.

## Not done / notes
- 318 is NOT applied: the Supabase MCP needs OAuth, unavailable in this session, and `db.sh` was rejected
  earlier (see C83). Until applied, the benefit inputs show 0 and saving a tier reports `save_failed`
  after the tier row itself is updated.
- Nothing in checkout grants cashback, early access or gifts yet, so the storefront does not advertise them.
- Also added missing README rows and preflights for 316/317 so the pending-inventory test passes (10/10).

Checks: `tsc --noEmit` clean, biome clean on touched files, inventory test 10/10.
