import ReferralShareCard from '@/components/account/ReferralShareCard'
import { formatDate, formatIls } from '@/lib/account/format'
import { REFERRAL_QUERY_PARAM } from '@/lib/referrals/code'
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
            {STATUS_LABELS[row.status]}
          </span>
          {row.status === 'pending' && row.qualifyBy && (
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
                אתם מקבלים {referrerBonus} לארנק, והחבר מקבל {referredBonus}.
              </li>
            </ol>
            <p className="referral-terms">
              הבונוס הוא קרדיט לשימוש באתר בלבד, ללא משיכה למזומן.
              {program.requiresManualApproval && ' כל הפניה עוברת אישור לפני הזיכוי.'}
            </p>
          </section>

          <section className="account-card">
            <h2 className="account-card__title">הקוד שלי</h2>
            <ReferralShareCard
              initialCode={summary.code}
              shareOrigin={siteUrl()}
              shareParam={REFERRAL_QUERY_PARAM}
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
