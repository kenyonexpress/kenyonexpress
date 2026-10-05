import type { ClubTierId } from '@/lib/club/tiers'
import { type MessageKey, t } from '@/lib/i18n/messages'

/**
 * The Hebrew name of a club tier, from the catalog.
 *
 * Shared by the server-rendered card on /account and the client-side account
 * menu in the header, so one table decides what each id is called. Keyed by
 * the fixed ids in `lib/club/tiers.ts`: a new tier would need a row here and
 * in messages/he.json before it could exist, which is the point.
 */
const TIER_NAME: Record<ClubTierId, MessageKey> = {
  member: 'club.tiers.member',
  silver: 'club.tiers.silver',
  gold: 'club.tiers.gold',
  platinum: 'club.tiers.platinum',
}

export function clubTierName(id: ClubTierId): string {
  return t(TIER_NAME[id])
}
