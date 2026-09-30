import { formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { formatDate } from '@/lib/account/format'
import {
  addressLine,
  cardLabel,
  expiryLabel,
  preferenceSummaryLine,
  summarizeAddresses,
  summarizePaymentMethods,
  summarizePreferences,
} from '@/lib/account/overview'
import { isCouponPresentable } from '@/lib/vouchers/coupon-view'
import { getMyAddresses, getMyPaymentTokens, getWalletSummary } from '@/server/queries/account'
import { getCashbackTracker } from '@/server/queries/cashback'
import { loadPreferences } from '@/server/queries/notifications'
import { getMyOrders } from '@/server/queries/orders'
import { getCustomerVouchers } from '@/server/queries/vouchers'
import Link from 'next/link'

export const metadata = { title: 'האזור האישי' }

/**
 * The overview: one tile per thing the account holds, each a sentence and a
 * link, all read through RLS on the session in one Promise.all.
 *
 * The lower grid (addresses, saved cards, notifications, privacy) is what was
 * missing: a customer landing here had no way to see that a saved card had
 * expired or that an address was set as default without opening each page.
 * The card tile shows brand and last four only; the query it reads never
 * selects the Cardcom token (src/lib/account/saved-cards.test.ts).
 */
export default async function AccountOverviewPage() {
  const [wallet, orders, coupons, cashback, addresses, tokens, preferenceRows] = await Promise.all([
    getWalletSummary(),
    getMyOrders(),
    getCustomerVouchers(),
    getCashbackTracker(),
    getMyAddresses(),
    getMyPaymentTokens(),
    loadPreferences(),
  ])

  const lastOrder = orders[0] ?? null
  // Counted through the shared presenter, so this tile, the list and the counter
  // agree. The condition here used to accept a status of `active`, which is not
  // in the voucher_status enum at all: it was left over from coupon_codes and
  // could only ever be false.
  const activeCoupons = coupons.filter((c) => isCouponPresentable(c))
  const addressSummary = summarizeAddresses(addresses)
  const cards = summarizePaymentMethods(tokens)
  const preferences = summarizePreferences(preferenceRows)

  return (
    <>
      <h1 className="account-title">האזור האישי</h1>
      <p className="account-subtitle">סקירה מהירה של החשבון שלך</p>

      <div className="wallet-balance">
        <p className="wallet-balance__label">יתרת הארנק</p>
        <p className="wallet-balance__amount">{formatIls(wallet.balanceAgorot)}</p>
        <p className="wallet-balance__note">קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.</p>
        <p style={{ marginTop: 12 }}>
          <Link className="account-btn" href="/account/wallet">
            לתנועות הארנק
          </Link>
        </p>
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

        <section className="account-card">
          <h2 className="account-card__title">הקאשבק שלי</h2>
          <p className="account-row__title">{formatIls(cashback.overview.liveAgorot)}</p>
          <p className="account-row__meta">
            {cashback.next.purchasesAway === 1
              ? `ההזמנה הבאה מזכה ב-${Math.round(cashback.next.rateBp / 100)}% קאשבק`
              : `עוד ${cashback.next.purchasesAway} הזמנות לבונוס של ${Math.round(cashback.next.rateBp / 100)}%`}
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/cashback">
              למעקב הקאשבק
            </Link>
          </p>
        </section>

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

      <h2 className="account-title" style={{ fontSize: 20, marginTop: 24 }}>
        הגדרות החשבון
      </h2>
      <p className="account-subtitle">כתובות, אמצעי תשלום, התראות ופרטיות</p>

      <div className="account-grid">
        <section className="account-card" data-tile="addresses">
          <h2 className="account-card__title">כתובות</h2>
          {addressSummary.primary ? (
            <>
              <p className="account-row__title">
                {addressLine(addressSummary.primary)}{' '}
                {addressSummary.primary.isDefault && (
                  <span className="account-chip account-chip--default">ברירת מחדל</span>
                )}
              </p>
              <p className="account-row__meta">
                {addressSummary.count === 1
                  ? 'כתובת אחת שמורה'
                  : `${addressSummary.count} כתובות שמורות`}
              </p>
            </>
          ) : (
            <p className="account-row__meta">אין כתובת שמורה. נוסיף אחת בהזמנה הבאה.</p>
          )}
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/addresses">
              לניהול הכתובות
            </Link>
          </p>
        </section>

        <section className="account-card" data-tile="payment-methods">
          <h2 className="account-card__title">אמצעי תשלום</h2>
          {cards.primary ? (
            <>
              <p className="account-row__title">
                {cardLabel(cards.primary)}{' '}
                {cards.primary.isDefault && (
                  <span className="account-chip account-chip--default">ברירת מחדל</span>
                )}
                {cards.primaryExpired && (
                  <span className="account-chip account-chip--dead">פג תוקף</span>
                )}
              </p>
              <p className="account-row__meta">
                {expiryLabel(cards.primary.expiryMonth, cards.primary.expiryYear)}
                {cards.count > 1 ? ` · ${cards.count} כרטיסים שמורים` : ''}
              </p>
            </>
          ) : (
            <p className="account-row__meta">אין כרטיס שמור. נשמרות רק 4 הספרות האחרונות.</p>
          )}
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/tokens">
              לאמצעי התשלום
            </Link>
          </p>
        </section>

        <section className="account-card" data-tile="notifications">
          <h2 className="account-card__title">התראות</h2>
          <p className="account-row__title">{preferenceSummaryLine(preferences)}</p>
          <p className="account-row__meta">
            הודעות על הזמנה ששולמה, על שובר שהונפק ועל החזר נשלחות תמיד.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/notifications">
              להעדפות ההתראות
            </Link>
          </p>
        </section>

        <section className="account-card" data-tile="privacy">
          <h2 className="account-card__title">פרטיות ונתונים</h2>
          <p className="account-row__meta">
            הורדת כל המידע שנשמר עליכם כקובץ, ניהול ההסכמה לעוגיות, ומחיקת החשבון לצמיתות.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link className="account-btn" href="/account/privacy">
              לפרטיות ומחיקת החשבון
            </Link>
          </p>
        </section>
      </div>
    </>
  )
}
