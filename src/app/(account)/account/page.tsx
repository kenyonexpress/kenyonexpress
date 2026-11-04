import ClubTierCard from '@/components/account/ClubTierCard'
import FirstPurchaseBanner from '@/components/checkout/FirstPurchaseBanner'
import { formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { formatDate } from '@/lib/account/format'
import { t } from '@/lib/i18n/messages'
import { log } from '@/lib/observability/log'
import { isPrerenderAbort } from '@/lib/observability/prerender-abort'
import { isCouponPresentable } from '@/lib/vouchers/coupon-view'
import { signOut } from '@/server/actions/auth'
import { listPasskeys } from '@/server/actions/passkeys'
import { getAccountProfile, getWalletSummary } from '@/server/queries/account'
import { getClubStanding } from '@/server/queries/club'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

export default async function AccountOverviewPage() {
  const [profile, wallet, orders, coupons, club, passkeys] = await Promise.all([
    getAccountProfile(),
    getWalletSummary(),
    getMyOrders(),
    getCustomerVouchers(),
    getClubStanding(),
    // Best-effort, same call as the side nav: the banner below only decides
    // whether to show its passkey link, and a failed read means "show it".
    listPasskeys().catch((cause): Awaited<ReturnType<typeof listPasskeys>> => {
      // `cookies()` rejects when a prerender completes first; that is the
      // static shell, not a passkey outage.
      if (!isPrerenderAbort(cause)) {
        log.warn('passkey.list_threw', {
          message: cause instanceof Error ? cause.message : String(cause),
        })
      }
      return { error: 'unavailable' }
    }),
  ])

  const lastOrder = orders[0] ?? null
  // The name WooCommerce greets with; the email's local part when no name is set.
  const displayName = profile?.fullName || profile?.email?.split('@')[0] || t('account.greeting')
  // The after-first-purchase banner (Q17) belongs to a customer who has paid
  // at least once. The confirmation page shows it on the first paid order;
  // here it comes back after the thirty-day "not now" lapses, and it stops
  // suggesting a passkey once one exists.
  const hasPaidOrder = orders.some((o) => o.paidAt !== null)
  const hasPasskeys = 'available' in passkeys && passkeys.available && passkeys.passkeys.length > 0
  // Counted through the shared presenter, so this tile, the list and the counter
  // agree. The condition here used to accept a status of `active`, which is not
  // in the voucher_status enum at all: it was left over from coupon_codes and
  // could only ever be false.
  const activeCoupons = coupons.filter((c) => isCouponPresentable(c))

  return (
    <>
      <h1 className="account-title">{t('account.dashboard.title')}</h1>
      <p className="account-subtitle">{t('account.dashboard.subtitle')}</p>

      {/* WooCommerce's dashboard paragraph: the greeting, the not-you sign
        out, and what the tabs above hold. */}
      <div className="account-hello" data-testid="account-hello">
        {/* A div, not a p: a <form> cannot sit inside a paragraph. */}
        <div className="account-hello__line">
          <strong>{t('account.hello.greeting').replace('{name}', displayName)}</strong> (
          {t('account.hello.notYou').replace('{name}', displayName)}{' '}
          <form action={signOut}>
            <button type="submit" className="account-hello__out">
              {t('account.hello.signOut')}
            </button>
          </form>
          )
        </div>
        <p>{t('account.hello.intro')}</p>
      </div>

      {hasPaidOrder && <FirstPurchaseBanner hasPasskeys={hasPasskeys} />}

      <div className="wallet-balance">
        <p className="wallet-balance__label">{t('account.dashboard.walletLabel')}</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">{t('account.dashboard.walletNote')}</p>
      </div>

      <div className="account-grid">
        <section className="account-card">
          <h2 className="account-card__title">{t('account.dashboard.lastOrder')}</h2>
          {lastOrder ? (
            <>
              <p className="account-row__title">
                {formatIls(lastOrder.totalAgorot)}{' '}
                <span
                  className={`account-chip account-chip--${orderStatusTone(lastOrder.settlementStatus)}`}
                >
                  {orderStatusLabel(lastOrder.settlementStatus)}
                </span>
              </p>
              <p className="account-row__meta">
                {formatDate(lastOrder.createdAt)} ·{' '}
                {t('account.dashboard.items').replace('{count}', String(lastOrder.itemCount))}
              </p>
              <p style={{ marginTop: 12 }}>
                <Link className="account-btn" href={`/account/orders/${lastOrder.id}`}>
                  {t('account.dashboard.lastOrderCta')}
                </Link>
              </p>
            </>
          ) : (
            <p className="account-row__meta">{t('account.dashboard.noOrders')}</p>
          )}
        </section>

        <section className="account-card">
          <h2 className="account-card__title">{t('account.dashboard.activeCoupons')}</h2>
          <p className="account-row__title">{activeCoupons.length}</p>
          <p className="account-row__meta">
            {activeCoupons.length > 0
              ? t('account.dashboard.couponsReady')
              : t('account.dashboard.couponsNone')}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/coupons">
              {t('account.dashboard.couponsCta')}
            </Link>
          </p>
        </section>

        {club ? <ClubTierCard standing={club} /> : null}

        <section className="account-card">
          <h2 className="account-card__title">{t('account.dashboard.ordersTotal')}</h2>
          <p className="account-row__title">{orders.length}</p>
          <p className="account-row__meta">{t('account.dashboard.ordersHistory')}</p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/orders">
              {t('account.dashboard.ordersCta')}
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
