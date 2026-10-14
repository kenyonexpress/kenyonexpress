import type { ClubTierId } from '@/lib/club/tiers'

/**
 * The Hebrew name of each club tier. On the production branch these are
 * message-catalogue keys (`club.tiers.<id>`); this line has no catalogue, so
 * the four strings live here, in the one place every caller reads them from.
 */
const TIER_NAME: Record<ClubTierId, string> = {
  member: 'חבר מועדון',
  silver: 'כסף',
  gold: 'זהב',
  platinum: 'פלטינה',
}

export function clubTierName(id: ClubTierId): string {
  return TIER_NAME[id]
}
