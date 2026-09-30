import { formatDate, formatDateTime, formatIls } from '@/lib/account/format'
import { CASHBACK_LIFETIME_MONTHS } from '@/lib/cashback/expiry'
import { MIN_WALLET_REDEMPTION_AGOROT } from '@/lib/cashback/redemption'
import { cashbackOverview, ledgerRowExpiresAt } from '@/lib/cashback/tracker'
import { REFERRAL_CASHBACK_AGOROT } from '@/lib/referrals/terms'
import {
  type WalletLedgerRow,
  getWalletLedger,
  getWalletSummary,
  walletReasonLabel,
} from '@/server/queries/account'
import { getReferralProgram } from '@/server/referrals/program'
import Link from 'next/link'

/**
 * The cashback wallet: balance, what lapses next, and every movement with
 * the day it stops being spendable.
 *
 * ONE VIEW, TWO DOORS. `/wallet` (STEP 13) and `/account/wallet` (the account
 * nav) render this same component, so the number a customer sees from the
 * push notification and the number in the side nav are one read, not two.
 *
 * THE DATABASE OWNS EVERY RULE SHOWN HERE. The 10% / 5% award is
 * `fn_cashback_order_bonus` (177), the twelve-month expiry is
 * `fn_cashback_expire` (215), the ₪20 referral reward is the row 250 seeds
 * and `fn_complete_referral` (098) pays. This component only reads the
 * ledger the way those functions write it: `cashbackOverview` walks the same
 * FIFO the sweep walks, and `ledgerRowExpiresAt` adds the same twelve months.
 * Every amount is integer agorot through `money.ts` until `formatIls`.
 *
 * `getReferralProgram` reads the live terms on the admin client (see its
 * header for why); the seeded constant is only used to say what the reward
 * is worth while that row is absent, and the sentence says "soon" in that
 * case rather than promising a payout `fn_claim_referral` would refuse.
 */

const SOON_DAYS = 30

function ExpiryCell({ row }: { row: WalletLedgerRow }) {
  const expiresAt = ledgerRowExpiresAt(row)
  if (!expiresAt) return <span className="account-row__meta">-</span>
  return <span>{formatDate(expiresAt.toISOString())}</span>
}

export default async function WalletView() {
  const [wallet, ledger, program] = await Promise.all([
    getWalletSummary(),
    getWalletLedger(500),
    getReferralProgram(),
  ])
  // After the awaits: the reads above go through cookies(), which is what
  // marks this render request-time. A clock read before them is what the
  // prerender step refuses as unstable (same note as getCashbackTracker).
  const overview = cashbackOverview(ledger, new Date(), SOON_DAYS)
  const referralReward = program ? program.referrerBonus : REFERRAL_CASHBACK_AGOROT

  return (
    <>
      <h1 className="account-title">הארנק שלי</h1>
      <p className="account-subtitle">קאשבק וקרדיט פנימי לשימוש באתר</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">היתרה שלך</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">
          הארנק משמש לתשלום חלקי או מלא בקופה, מסכום של {formatIls(MIN_WALLET_REDEMPTION_AGOROT)}{' '}
          ומעלה. אין משיכה למזומן ואין העברה למשתמש אחר.
        </p>
      </div>

      <div className="account-grid">
        <section className="account-card" data-testid="wallet-expiry-policy">
          <h2 className="account-card__title">תוקף הקאשבק</h2>
          <p className="account-row__meta">
            כל זיכוי קאשבק תקף ל-{CASHBACK_LIFETIME_MONTHS} חודשים מיום שנכנס לארנק. יתרה שלא נוצלה
            עד אז פוקעת. שימוש בארנק מנצל תמיד את הקאשבק הוותיק ביותר קודם.
          </p>
          {overview.nextToExpire ? (
            <p className="account-row__title" style={{ marginTop: 8 }}>
              הקרוב לפקיעה: {formatIls(overview.nextToExpire.remainingAgorot)} ב-
              {formatDate(overview.nextToExpire.expiresAt.toISOString())}
            </p>
          ) : (
            <p className="account-row__meta" style={{ marginTop: 8 }}>
              אין כרגע קאשבק שממתין לשימוש.
            </p>
          )}
          {overview.expiringSoonAgorot > 0 ? (
            <p className="account-row__meta">
              <span className="account-chip account-chip--warn">
                {formatIls(overview.expiringSoonAgorot)} פוקע ב-{SOON_DAYS} הימים הקרובים
              </span>
            </p>
          ) : null}
        </section>

        <section className="account-card" data-testid="wallet-referral-reward">
          <h2 className="account-card__title">חבר מביא חבר</h2>
          <p className="account-row__meta">
            {program
              ? `על כל חבר שמצטרף דרך הקישור שלכם ומבצע רכישה ראשונה של ${formatIls(program.minOrder)} ומעלה, נכנס לארנק קאשבק של ${formatIls(referralReward)}.`
              : `בקרוב: ${formatIls(referralReward)} קאשבק על כל חבר שיצטרף דרך הקישור שלכם ויבצע רכישה ראשונה.`}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/referrals">
              לקישור האישי
            </Link>
          </p>
        </section>
      </div>

      <section className="account-card">
        <h2 className="account-card__title">תנועות</h2>

        {ledger.length === 0 ? (
          <p className="account-empty">עדיין אין תנועות בארנק.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wallet-ledger">
              <thead>
                <tr>
                  <th scope="col">תאריך</th>
                  <th scope="col">פעולה</th>
                  <th scope="col">סכום</th>
                  <th scope="col">תוקף עד</th>
                  <th scope="col">הזמנה</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td>{walletReasonLabel(row.reason)}</td>
                    <td className={`wallet-ledger__amount wallet-ledger__amount--${row.direction}`}>
                      {row.direction === 'credit' ? '+' : '-'}
                      {formatIls(row.amountAgorot)}
                    </td>
                    <td>
                      <ExpiryCell row={row} />
                    </td>
                    <td>
                      {row.orderId ? (
                        <Link href={`/account/orders/${row.orderId}`}>לצפייה</Link>
                      ) : (
                        <span className="account-row__meta">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
