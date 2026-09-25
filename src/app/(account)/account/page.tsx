import ClubTierCard from '@/components/account/ClubTierCard'
import FirstPurchaseBanner from '@/components/checkout/FirstPurchaseBanner'
import { formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { formatDate } from '@/lib/account/format'
import { log } from '@/lib/observability/log'
import { isPrerenderAbort } from '@/lib/observability/prerender-abort'
import { isCouponPresentable } from '@/lib/vouchers/coupon-view'
import { listPasskeys } from '@/server/actions/passkeys'
import { getWalletSummary } from '@/server/queries/account'
import { getClubStanding } from '@/server/queries/club'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

export default async function AccountOverviewPage() {
  const [wallet, orders, coupons, club, passkeys] = await Promise.all([
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
      <h1 className="account-title">האזור האישי</h1>
      <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

      {hasPaidOrder && <FirstPurchaseBanner hasPasskeys={hasPasskeys} />}

      <div className="wallet-balance">
        <p className="wallet-balance__label">יתרת הארנק</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.</p>
      </div>

      <div className="account-grid">
        <section className="account-card">
          <h2 className="account-card__title">ההזמנה האחרונה</h2>
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
                {formatDate(lastOrder.createdAt)} · {lastOrder.itemCount} פריטים
              </p>
              <p style={{ marginTop: 12 }}>
                <Link className="account-btn" href={`/account/orders/${lastOrder.id}`}>
                  לפרטי ההזמנה
                </Link>
              </p>
            </>
          ) : (
            <p className="account-row__meta">עוד לא ביצעת הזמנות.</p>
          )}
        </section>

        <section className="account-card">
          <h2 className="account-card__title">קופונים פעילים</h2>
          <p className="account-row__title">{activeCoupons.length}</p>
          <p className="account-row__meta">
            {activeCoupons.length > 0
              ? 'מוכנים לסריקה בבית העסק'
              : 'אין כרגע קופונים שממתינים למימוש'}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/coupons">
              לכל הקופונים
            </Link>
          </p>
        </section>

        {club ? <ClubTierCard standing={club} /> : null}

        <section className="account-card">
          <h2 className="account-card__title">סך ההזמנות</h2>
          <p className="account-row__title">{orders.length}</p>
          <p className="account-row__meta">היסטוריית הרכישות שלך</p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/orders">
              לכל ההזמנות
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
