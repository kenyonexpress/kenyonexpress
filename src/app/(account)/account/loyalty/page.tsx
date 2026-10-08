import LoyaltyBadge from '@/components/account/LoyaltyBadge'
import { formatDate, formatIls } from '@/lib/account/format'
import {
  LOYALTY_TIERS,
  LOYALTY_WINDOW_DAYS,
  TIER_BENEFITS_HE,
  TIER_LABEL_HE,
  TIER_THRESHOLDS_AGOROT,
  tierRank,
} from '@/lib/loyalty/tiers'
import { getMyLoyalty, getTierDeals } from '@/server/queries/loyalty'
import Link from 'next/link'

export const metadata = { title: 'מועדון הלקוחות' }

/**
 * The loyalty page (STEP 47): the customer's tier, how it was earned, how
 * far the next one is, what each tier is worth, and the tier-only codes.
 *
 * Everything on it is computed from the customer's own paid orders at
 * request time (`getMyLoyalty`), which is why the tier here can be one
 * step ahead of the last upgrade mail: the mail is sent once by the
 * database, the page is always current. A locked deal shows its name and
 * the tier it needs and never its code.
 */
export default async function LoyaltyPage() {
  const standing = await getMyLoyalty()
  const deals = await getTierDeals(standing?.tier ?? null)

  if (!standing) {
    return (
      <>
        <h1 className="account-title">מועדון הלקוחות</h1>
        <p className="account-empty">יש להתחבר כדי לראות את הדרגה שלך.</p>
      </>
    )
  }

  const { tier, spendAgorot, progress } = standing
  const unlocked = deals.filter((d) => d.unlocked)
  const locked = deals.filter((d) => !d.unlocked)

  return (
    <>
      <h1 className="account-title">מועדון הלקוחות</h1>
      <p className="account-subtitle">
        הדרגה נקבעת לפי הרכישות שלך ב-{LOYALTY_WINDOW_DAYS} הימים האחרונים ומתעדכנת בכל רכישה
      </p>

      <div className={`loyalty-hero loyalty-hero--${tier}`}>
        <LoyaltyBadge tier={tier} size="lg" />
        <p className="loyalty-hero__spend">
          רכישות בשנה האחרונה: <strong>{formatIls(spendAgorot)}</strong>
          {standing.paidOrderCount > 0 && <span> · {standing.paidOrderCount} הזמנות</span>}
        </p>
        {standing.tierSince && standing.announcedTier === tier && (
          <p className="loyalty-hero__since">בדרגה הזו מאז {formatDate(standing.tierSince)}</p>
        )}
        {progress.next ? (
          <div className="loyalty-progress">
            <progress
              className="loyalty-progress__bar"
              aria-label={`התקדמות לדרגת ${TIER_LABEL_HE[progress.next]}`}
              value={progress.percent}
              max={100}
            />
            <p className="loyalty-progress__label">
              עוד {formatIls(progress.remainingAgorot)} לדרגת {TIER_LABEL_HE[progress.next]}
            </p>
          </div>
        ) : (
          <p className="loyalty-progress__label">הגעת לדרגה הגבוהה ביותר</p>
        )}
      </div>

      <section className="account-card">
        <h2 className="account-card__title">המבצעים של הדרגה שלך</h2>
        {deals.length === 0 ? (
          <p className="account-empty">
            אין כרגע קודים שמורים לחברי המועדון. כשיתווספו, הם יופיעו כאן.
          </p>
        ) : (
          <ul className="loyalty-deals">
            {unlocked.map((deal) => (
              <li key={deal.id} className="account-row">
                <div className="account-row__main">
                  <p className="account-row__title">{deal.name}</p>
                  <p className="account-row__meta">
                    <LoyaltyBadge tier={deal.minTier} />
                    {deal.expiresAt && <span> · בתוקף עד {formatDate(deal.expiresAt)}</span>}
                  </p>
                </div>
                <div className="account-row__actions">
                  <code className="loyalty-deal__code" dir="ltr">
                    {deal.code}
                  </code>
                </div>
              </li>
            ))}
            {locked.map((deal) => (
              <li key={deal.id} className="account-row loyalty-deal--locked">
                <div className="account-row__main">
                  <p className="account-row__title">{deal.name}</p>
                  <p className="account-row__meta">{deal.lockedLabel}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {unlocked.length > 0 && (
          <p className="loyalty-deals__hint">
            מזינים את הקוד בעגלה. הקוד אישי לחברי הדרגה ולא ניתן להעברה.
          </p>
        )}
      </section>

      <section className="account-card">
        <h2 className="account-card__title">הדרגות וההטבות</h2>
        <ol className="loyalty-ladder">
          {LOYALTY_TIERS.map((rung) => {
            const reached = tierRank(rung) <= tierRank(tier)
            return (
              <li
                key={rung}
                className={`loyalty-ladder__rung${reached ? ' is-reached' : ''}${rung === tier ? ' is-current' : ''}`}
              >
                <div className="loyalty-ladder__head">
                  <LoyaltyBadge tier={rung} />
                  <span className="loyalty-ladder__threshold">
                    {rung === 'bronze'
                      ? 'מהרכישה הראשונה'
                      : `מ-${formatIls(TIER_THRESHOLDS_AGOROT[rung])} בשנה`}
                  </span>
                </div>
                <ul className="loyalty-ladder__perks">
                  {TIER_BENEFITS_HE[rung].map((perk) => (
                    <li key={perk}>{perk}</li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ol>
        <p className="referral-terms">
          הדרגה מחושבת מסכום ההזמנות ששולמו באתר ב-{LOYALTY_WINDOW_DAYS} הימים האחרונים, ללא הזמנות
          שבוטלו או זוכו. ירידה בדרגה מתעדכנת בשקט; על עלייה תקבלו הודעה.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link className="account-btn" href="/account/orders">
            להזמנות שלי
          </Link>
        </p>
      </section>
    </>
  )
}
