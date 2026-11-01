import { clubTierName } from '@/components/account/club-tier-name'
import { formatIls } from '@/lib/account/format'
import type { ClubStanding } from '@/lib/club/tiers'

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
      <h2 className="account-card__title">מועדון הלקוחות</h2>
      <p className="account-row__title">
        <span className="club-badge" data-tier={standing.tier.id}>
          {tierName}
        </span>
      </p>
      <p className="account-row__meta">
        רכישות ב-12 החודשים האחרונים: {formatIls(standing.spendAgorot)}
      </p>
      {standing.nextTier ? (
        <>
          <div
            className="club-progress"
            aria-hidden="true"
            data-progress={standing.progressPercent}
          >
            <div
              className="club-progress__bar"
              style={{ inlineSize: `${standing.progressPercent}%` }}
            />
          </div>
          <p className="account-row__meta">
            עוד {formatIls(standing.remainingAgorot)} לדרגת {clubTierName(standing.nextTier.id)} (
            {standing.progressPercent}% מהדרך)
          </p>
        </>
      ) : (
        <p className="account-row__meta">הגעת לדרגה הגבוהה ביותר</p>
      )}
      <p className="account-row__meta">
        הדרגה מחושבת לפי סכום הרכישות ששולמו באתר ב-12 החודשים האחרונים. הדרגה מוצגת בלבד, ואין לה
        עדיין הטבות.
      </p>
    </section>
  )
}
