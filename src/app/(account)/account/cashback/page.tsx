import { formatDate, formatDateTime, formatIls } from '@/lib/account/format'
import {
  BONUS_EVERY_N_PURCHASES,
  CASHBACK_LIFETIME_MONTHS,
  cashbackEntryLabel,
} from '@/lib/cashback/tracker'
import { agorot } from '@/lib/money'
import { getCashbackTracker } from '@/server/queries/cashback'
import Link from 'next/link'

export const metadata = { title: 'הקאשבק שלי' }

function rateLabel(bp: number): string {
  // Basis points to a whole percent for display only; never a money value.
  return `${Math.round(bp / 100)}%`
}

export default async function CashbackPage() {
  const tracker = await getCashbackTracker()
  const { overview, next, paidOrderCount, history } = tracker

  return (
    <>
      <h1 className="account-title">הקאשבק שלי</h1>
      <p className="account-subtitle">
        10% על הרכישה הראשונה, 5% על כל רכישה {BONUS_EVERY_N_PURCHASES}-ית. הקאשבק נכנס לארנק ותקף
        ל-{CASHBACK_LIFETIME_MONTHS} חודשים.
      </p>

      <div className="account-grid">
        <section className="account-card">
          <h2 className="account-card__title">קאשבק פעיל</h2>
          <p className="account-row__title">{formatIls(overview.liveAgorot)}</p>
          <p className="account-row__meta">
            {overview.nextToExpire
              ? `הקרוב לפקיעה: ${formatIls(overview.nextToExpire.remainingAgorot)} ב-${formatDate(overview.nextToExpire.expiresAt.toISOString())}`
              : 'אין כרגע קאשבק שממתין לשימוש'}
          </p>
          {overview.expiringSoonAgorot > 0 ? (
            <p className="account-row__meta">
              <span className="account-chip account-chip--warn">
                {formatIls(overview.expiringSoonAgorot)} פוקע בחודש הקרוב
              </span>
            </p>
          ) : null}
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/wallet">
              לארנק
            </Link>
          </p>
        </section>

        <section className="account-card">
          <h2 className="account-card__title">נצבר מאז ומתמיד</h2>
          <p className="account-row__title">{formatIls(overview.lifetimeEarnedAgorot)}</p>
          <p className="account-row__meta">כל הקאשבק שנכנס לארנק, כולל מה שכבר נוצל או פקע</p>
        </section>

        <section className="account-card">
          <h2 className="account-card__title">הבונוס הבא</h2>
          <p className="account-row__title">
            {rateLabel(next.rateBp)}{' '}
            <span className="account-chip account-chip--default">
              רכישה מספר {next.purchaseNumber}
            </span>
          </p>
          <p className="account-row__meta">
            {next.purchasesAway === 1
              ? 'ההזמנה הבאה שלך מזכה בבונוס'
              : `עוד ${next.purchasesAway} הזמנות עד הבונוס`}
            {paidOrderCount > 0 ? ` · ${paidOrderCount} הזמנות ששולמו` : ''}
          </p>
          <progress
            className="cashback-progress"
            value={next.progressPercent}
            max={100}
            aria-label="התקדמות לבונוס הבא"
          >
            {next.progressPercent}%
          </progress>
        </section>
      </div>

      <section className="account-card">
        <h2 className="account-card__title">היסטוריית הקאשבק</h2>
        {history.length === 0 ? (
          <p className="account-empty">עדיין לא נצבר קאשבק. הרכישה הראשונה מזכה ב-10%.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wallet-ledger">
              <thead>
                <tr>
                  <th scope="col">תאריך</th>
                  <th scope="col">סוג</th>
                  <th scope="col">סכום</th>
                  <th scope="col">חישוב</th>
                  <th scope="col">הזמנה</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const direction = row.amountAgorot < 0 ? 'debit' : 'credit'
                  const magnitude = agorot(Math.abs(row.amountAgorot))
                  return (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.createdAt)}</td>
                      <td>
                        {cashbackEntryLabel(row.entryType)}
                        {row.reason ? (
                          <span className="account-row__meta"> · {row.reason}</span>
                        ) : null}
                      </td>
                      <td className={`wallet-ledger__amount wallet-ledger__amount--${direction}`}>
                        {direction === 'credit' ? '+' : '-'}
                        {formatIls(magnitude)}
                      </td>
                      <td>
                        {row.percentBp != null && row.basisAgorot != null
                          ? `${rateLabel(row.percentBp)} מתוך ${formatIls(row.basisAgorot)}`
                          : '-'}
                      </td>
                      <td>
                        {row.orderId ? (
                          <Link href={`/account/orders/${row.orderId}`}>לצפייה</Link>
                        ) : (
                          <span className="account-row__meta">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
