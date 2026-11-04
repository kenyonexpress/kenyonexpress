import { formatDateTime, formatIls } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { getWalletLedger, getWalletSummary, walletReasonLabel } from '@/server/queries/account'
import Link from 'next/link'

export const metadata = { title: 'הארנק שלי' }

export default async function WalletPage() {
  const [wallet, ledger] = await Promise.all([getWalletSummary(), getWalletLedger()])
  const col = {
    date: t('account.walletPage.colDate'),
    action: t('account.walletPage.colAction'),
    amount: t('account.walletPage.colAmount'),
    order: t('account.walletPage.colOrder'),
  }

  return (
    <>
      <h1 className="account-title">{t('account.wallet')}</h1>
      <p className="account-subtitle">{t('account.walletPage.subtitle')}</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">{t('account.walletPage.label')}</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">{t('account.walletPage.note')}</p>
      </div>

      <section className="account-card">
        <h2 className="account-card__title">{t('account.walletPage.ledger')}</h2>

        {ledger.length === 0 ? (
          <p className="account-empty">{t('account.walletPage.empty')}</p>
        ) : (
          <table className="account-table wallet-ledger" data-testid="wallet-ledger">
            <thead>
              <tr>
                <th scope="col">{col.date}</th>
                <th scope="col">{col.action}</th>
                <th scope="col">{col.amount}</th>
                <th scope="col">{col.order}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((row) => (
                <tr key={row.id}>
                  <td data-title={col.date}>{formatDateTime(row.createdAt)}</td>
                  <td data-title={col.action}>{walletReasonLabel(row.reason)}</td>
                  <td
                    data-title={col.amount}
                    className={`wallet-ledger__amount wallet-ledger__amount--${row.direction}`}
                  >
                    {row.direction === 'credit' ? '+' : '-'}
                    {formatIls(row.amountAgorot)}
                  </td>
                  <td data-title={col.order}>
                    {row.orderId ? (
                      <Link href={`/account/orders/${row.orderId}`}>
                        {t('account.walletPage.viewOrder')}
                      </Link>
                    ) : (
                      <span className="account-row__meta">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}
