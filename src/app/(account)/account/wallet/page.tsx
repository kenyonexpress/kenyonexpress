import { formatDateTime, formatIls } from '@/lib/account/format'
import { createClient } from '@/lib/supabase/server'
import { getWithdrawalRequests } from '@/lib/wallet'
import { getWalletLedger, getWalletSummary, walletReasonLabel } from '@/server/queries/account'
import Link from 'next/link'
import TransactionFilter from './TransactionFilter'
import WithdrawButton from './WithdrawButton'
import WithdrawalRequestsList from './WithdrawalRequestsList'

export const metadata = { title: 'הארנק שלי' }

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <div>נדרשת התחברות</div>
  }

  const params = await searchParams
  const filter = params.filter || 'all'

  const [wallet, allLedger, withdrawalRequests] = await Promise.all([
    getWalletSummary(),
    getWalletLedger(),
    getWithdrawalRequests(user.id),
  ])

  // Filter transactions
  const ledger =
    filter === 'credit'
      ? allLedger.filter((t) => t.direction === 'credit')
      : filter === 'debit'
        ? allLedger.filter((t) => t.direction === 'debit')
        : allLedger

  return (
    <>
      <h1 className="account-title">הארנק שלי</h1>
      <p className="account-subtitle">קרדיט פנימי לשימוש באתר + קאשבק על רכישות</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">היתרה שלך</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <div className="flex gap-2 mt-4">
          <WithdrawButton balanceAgorot={wallet.balanceAgorot} userId={user.id} />
        </div>
        <p className="wallet-balance__note mt-4">
          הארנק משמש לתשלום חלקי או מלא באתר. ניתן למשוך יתרה החל מ-50 ₪ דרך כפתור המשיכה למעלה.
        </p>
      </div>

      {withdrawalRequests.length > 0 && (
        <section className="account-card">
          <h2 className="account-card__title">בקשות משיכה</h2>
          <WithdrawalRequestsList requests={withdrawalRequests} />
        </section>
      )}

      <section className="account-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="account-card__title">תנועות</h2>
          <TransactionFilter currentFilter={filter} />
        </div>

        {ledger.length === 0 ? (
          <p className="account-empty">
            {filter === 'all' ? 'עדיין אין תנועות בארנק.' : 'אין תנועות מסוג זה.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="wallet-ledger">
              <thead>
                <tr>
                  <th scope="col">תאריך</th>
                  <th scope="col">פעולה</th>
                  <th scope="col">סכום</th>
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
