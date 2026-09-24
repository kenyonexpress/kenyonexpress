import { formatIls } from '@/lib/account/format'
import type { ClubStanding, ClubTierId } from '@/lib/club/tiers'
import { formatPercent } from '@/lib/i18n/format'
import { type MessageKey, t } from '@/lib/i18n/messages'

/**
 * The customer's club tier on the account overview: the tier, what they paid
 * over the last twelve months, and the gap to the next tier as a bar.
 *
 * Server component, no state: the standing is computed by `getClubStanding`
 * and this only presents it. The bar's fill is a percentage width, so under
 * the page's RTL direction it grows from the right edge with no positional
 * CSS at all. The bar is decorative (`aria-hidden`): the same percentage is
 * in the sentence under it, which is what a screen reader gets, so the bar
 * needs no progressbar role and no focus stop.
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

export default function ClubTierCard({ standing }: { standing: ClubStanding }) {
  const tierName = clubTierName(standing.tier.id)
  return (
    <section className="account-card" data-testid="club-tier-card" data-tier={standing.tier.id}>
      <h2 className="account-card__title">{t('club.title')}</h2>
      <p className="account-row__title">{tierName}</p>
      <p className="account-row__meta">
        {t('club.spend').replace('{amount}', formatIls(standing.spendAgorot))}
      </p>
      {standing.nextTier ? (
        <>
          <div
            className="club-progress"
            aria-hidden="true"
            data-progress={standing.progressPercent}
          >
            <div className="club-progress__bar" style={{ width: `${standing.progressPercent}%` }} />
          </div>
          <p className="account-row__meta">
            {t('club.toNext')
              .replace('{amount}', formatIls(standing.remainingAgorot))
              .replace('{tier}', clubTierName(standing.nextTier.id))
              .replace('{percent}', formatPercent(standing.progressPercent))}
          </p>
        </>
      ) : (
        <p className="account-row__meta">{t('club.top')}</p>
      )}
      <p className="account-row__meta">{t('club.window')}</p>
    </section>
  )
}
