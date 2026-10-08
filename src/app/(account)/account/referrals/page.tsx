import ReferralShareCard from '@/components/account/ReferralShareCard'
import { formatDate, formatIls } from '@/lib/account/format'
import { CASHBACK_LIFETIME_MONTHS } from '@/lib/cashback/expiry'
import { agorot } from '@/lib/money'
import { siteUrl } from '@/lib/site-url'
import type { ReferralRow, ReferralStatus } from '@/server/queries/referrals'
import { getMyReferralSummary } from '@/server/queries/referrals'
import { getReferralProgram } from '@/server/referrals/program'

export const metadata = { title: 'חבר מביא חבר' }

/**
 * Hebrew for the four states a referral can be in.
 *
 * `flagged` is deliberately NOT described to the customer as suspicion. The
 * admin queue is told the truth (the fraud guard matched a device, a card or an
 * IP), because a person has to judge it; the referrer is told it is being
 * checked, because an accusation is not something to hand out on a similarity.
 * Families share a card and a household shares an address, and both of those
 * look exactly like this.
 */
const STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: 'ממתין לרכישה הראשונה',
  flagged: 'בבדיקה',
  completed: 'הבונוס זוכה',
  rejected: 'לא אושר',
}

/**
 * `pending` with a first order on the row: the friend bought, the bonus is
 * snapshotted, and only the wallet credit is outstanding. Telling that customer
 * "waiting for the first purchase" next to a fixed sum is a contradiction on
 * the screen, so it gets its own sentence.
 */
const QUALIFIED_LABEL = 'הרכישה בוצעה, הבונוס בדרך לארנק'

function statusLabel(row: ReferralRow): string {
  return row.status === 'pending' && row.qualified ? QUALIFIED_LABEL : STATUS_LABELS[row.status]
}

const STATUS_TONE: Record<ReferralStatus, string> = {
  pending: 'warn',
  flagged: 'warn',
  completed: 'ok',
  rejected: 'dead',
}

function ReferralListRow({
  row,
  fallbackBonus,
}: { row: ReferralRow; fallbackBonus: string | null }) {
  return (
    <li className="account-row">
      <div className="account-row__main">
        {/* Only a date. The other person's name and address are not readable
            here and are not meant to be: `profiles_select_unified` allows a
            customer their own row and nothing else, and reaching around it with
            the service key would be inventing a disclosure the policy exists to
            prevent. */}
        <p className="account-row__title">הצטרפות מתאריך {formatDate(row.createdAt)}</p>
        <p className="account-row__meta">
          <span className={`referral-status referral-status--${STATUS_TONE[row.status]}`}>
            {statusLabel(row)}
          </span>
          {row.status === 'pending' && !row.qualified && row.qualifyBy && (
            <span> יש זמן לרכישה עד {formatDate(row.qualifyBy)}</span>
          )}
        </p>
      </div>
      <div className="account-row__actions">
        {/* The snapshot on a settled row, the programme's current terms on one
            that has not settled. They are not the same number and must not be
            printed as if they were: a bonus that was paid is history, and the
            terms can change afterwards. */}
        {row.bonusAgorot !== null ? (
          <span className="referral-bonus">{formatIls(row.bonusAgorot)}</span>
        ) : fallbackBonus ? (
          <span className="referral-bonus referral-bonus--pending">עד {fallbackBonus}</span>
        ) : null}
      </div>
    </li>
  )
}

export default async function ReferralsPage() {
  const [program, summary] = await Promise.all([getReferralProgram(), getMyReferralSummary()])

  const referrerBonus = program ? formatIls(program.referrerBonus) : null
  const referredBonus = program ? formatIls(program.referredBonus) : null
  const completed = summary.asReferrer.filter((r) => r.status === 'completed')
  const bought = summary.asReferrer.filter((r) => r.status === 'completed' || r.qualified)
  const earnedAgorot = agorot(completed.reduce((sum, r) => sum + (r.bonusAgorot ?? 0), 0))

  return (
    <>
      <h1 className="account-title">חבר מביא חבר</h1>
      <p className="account-subtitle">שתפו את הקוד שלכם, ושניכם מקבלים קרדיט לארנק</p>

      {/*
        THE PROGRAMME BEING OFF IS A REAL SCREEN, NOT AN EDGE CASE.

        `referral_program_settings` is seeded with no row on purpose, so that
        nobody has to guess what the bonus is worth, and as of 2026-08-31 that
        table is empty in production. Until the owner enters the amounts, a
        share link would be a promise the database refuses to keep:
        `fn_claim_referral` answers `program_inactive` and no referral is ever
        recorded. So the code and the link are not offered at all here, rather
        than offered next to a bonus of zero.
      */}
      {!program ? (
        <section className="account-card">
          <h2 className="account-card__title">התוכנית עדיין לא פעילה</h2>
          <p className="account-empty">
            תוכנית ההפניות תיפתח בקרוב. ברגע שהיא תופעל, יופיע כאן קוד אישי לשיתוף והמעקב אחרי
            הבונוסים שצברתם.
          </p>
        </section>
      ) : (
        <>
          <section className="account-card">
            <h2 className="account-card__title">איך זה עובד</h2>
            <ol className="referral-steps">
              <li>שולחים לחבר את הקישור האישי שלכם.</li>
              <li>
                החבר נרשם דרך הקישור ומבצע רכישה ראשונה של {formatIls(program.minOrder)} ומעלה, תוך{' '}
                {program.qualifyWindowDays} ימים.
              </li>
              <li>
                {/* The friend's clause only when the friend gets something.
                    250 seeds the referred side at ₪10 since STEP 46; a row a
                    person entered at zero must not print "your friend gets
                    ₪0.00" in front of anyone. */}
                {program.referredBonus > 0
                  ? `אתם מקבלים ${referrerBonus} קאשבק לארנק, והחבר מקבל ${referredBonus}.`
                  : `אתם מקבלים ${referrerBonus} קאשבק לארנק.`}
              </li>
            </ol>
            <p className="referral-terms">
              הבונוס הוא קאשבק לשימוש באתר בלבד, ללא משיכה למזומן, ותקף ל-
              {CASHBACK_LIFETIME_MONTHS} חודשים מיום הזיכוי כמו כל קאשבק.
              {program.requiresManualApproval && ' כל הפניה עוברת אישור לפני הזיכוי.'}
            </p>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">הקוד שלי</h2>
            <ReferralShareCard
              initialCode={summary.code}
              shareOrigin={siteUrl()}
              friendBonusLabel={program.referredBonus > 0 ? referredBonus : null}
              minOrderLabel={formatIls(program.minOrder)}
            />
          </section>
        </>
      )}

      {summary.asReferred && (
        <section className="account-card">
          <h2 className="account-card__title">הצטרפתם דרך המלצה</h2>
          <ul className="account-list">
            <ReferralListRow row={summary.asReferred} fallbackBonus={referredBonus} />
          </ul>
        </section>
      )}

      <section className="account-card">
        <h2 className="account-card__title">
          החברים שהבאתם
          {completed.length > 0 && (
            <span className="referral-count"> ({completed.length} זוכו)</span>
          )}
        </h2>

        {/* The referrer's own funnel: how many joined, how many bought, what
            was credited. Three counts from rows RLS already handed over; no
            extra read and nothing about who the friends are. */}
        {summary.asReferrer.length > 0 && (
          <dl className="referral-stats" data-testid="referral-stats">
            <div>
              <dt>הצטרפו</dt>
              <dd>{summary.asReferrer.length}</dd>
            </div>
            <div>
              <dt>קנו</dt>
              <dd>{bought.length}</dd>
            </div>
            <div>
              <dt>זוכה לארנק</dt>
              <dd>{formatIls(earnedAgorot)}</dd>
            </div>
          </dl>
        )}

        {summary.asReferrer.length === 0 ? (
          <p className="account-empty">עדיין לא הצטרף אף אחד דרך הקוד שלכם.</p>
        ) : (
          <ul className="account-list">
            {summary.asReferrer.map((row) => (
              <ReferralListRow key={row.id} row={row} fallbackBonus={referrerBonus} />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
