import { couponStatusLabel, couponStatusTone, formatDate, formatIls } from '@/lib/account/format'
import { getMyCoupons } from '@/server/queries/account'

export const metadata = { title: 'הקופונים שלי' }

export default async function CouponsPage() {
  const coupons = await getMyCoupons()

  return (
    <>
      <h1 className="account-title">הקופונים שלי</h1>
      <p className="account-subtitle">הצגת הקוד בבית העסק. היתרה משולמת שם בזמן הסריקה.</p>

      <section className="account-card">
        {coupons.length === 0 ? (
          <p className="account-empty">עדיין לא רכשת קופונים.</p>
        ) : (
          coupons.map((coupon) => (
            <div className="account-row" key={coupon.code}>
              <div className="account-row__main">
                <p className="coupon-card__code">{coupon.code}</p>
                <p className="account-row__title">{coupon.productName ?? 'קופון'}</p>
                <p className="account-row__meta">
                  <span className={`account-chip account-chip--${couponStatusTone(coupon.status)}`}>
                    {couponStatusLabel(coupon.status)}
                  </span>
                  {' · '}בתוקף עד {formatDate(coupon.expiresAt)}
                  {coupon.redeemedAt ? ` · מומש ב-${formatDate(coupon.redeemedAt)}` : ''}
                </p>
                <p className="account-row__meta">
                  שולם באתר {formatIls(coupon.platformPaidIls)}
                  {coupon.collectAmountIls > 0
                    ? ` · לתשלום בבית העסק ${formatIls(coupon.collectAmountIls)}`
                    : ''}
                </p>
              </div>
              <div className="account-row__actions">{formatIls(coupon.faceValueIls)}</div>
            </div>
          ))
        )}
      </section>
    </>
  )
}
