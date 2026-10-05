import { clubTierName } from '@/components/account/club-tier-name'
import { formatIls } from '@/lib/account/format'
import type { ClubStanding } from '@/lib/club/tiers'
import { formatPercent } from '@/lib/i18n/format'
import { t } from '@/lib/i18n/messages'

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
 *
 * The tier name is rendered as a `.club-badge` chip (W07), the same element the
 * header's account menu and the account side nav show, so the badge is one
 * thing in three places.
 */

export { clubTierName }

export default function ClubTierCard({ standing }: { standing: ClubStanding }) {
  const tierName = clubTierName(standing.tier.id)
  return (
    <section className="account-card" data-testid="club-tier-card" data-tier={standing.tier.id}>
      <h2 className="account-card__title">{t('club.title')}</h2>
      <p className="account-row__title">
        <span className="club-badge" data-tier={standing.tier.id}>
          {tierName}
        </span>
      </p>
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
