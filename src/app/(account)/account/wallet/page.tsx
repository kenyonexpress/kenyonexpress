import { formatDateTime, formatIls } from '@/lib/account/format'
import { getWalletLedger, getWalletSummary, walletReasonLabel } from '@/server/queries/account'
import Link from 'next/link'

export const metadata = { title: 'הארנק שלי' }

export default async function WalletPage() {
  const [wallet, ledger] = await Promise.all([getWalletSummary(), getWalletLedger()])

  return (
    <>
      <h1 className="account-title">הארנק שלי</h1>
      <p className="account-subtitle">קרדיט פנימי לשימוש באתר</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">היתרה שלך</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">
          הארנק משמש לתשלום חלקי או מלא באתר. אין משיכה למזומן ואין העברה למשתמש אחר.
        </p>
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
