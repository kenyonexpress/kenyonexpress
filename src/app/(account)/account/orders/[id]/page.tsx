import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { COUPON_TONE_CHIP, couponStatusView } from '@/lib/vouchers/coupon-view'
import { getOrderDetail } from '@/server/queries/orders'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'פרטי הזמנה' }

type Props = { params: Promise<{ id: string }> }

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  // getOrderDetail scopes to the signed-in user, so a foreign id is a 404 and
  // never a leak.
  const order = await getOrderDetail(id)
  if (!order) notFound()

  return (
    <>
      <h1 className="account-title">הזמנה מתאריך {formatDate(order.createdAt)}</h1>
      <p className="account-subtitle">
        <span className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}>
          {orderStatusLabel(order.settlementStatus)}
        </span>
      </p>

      <section className="account-card">
        <h2 className="account-card__title">סיכום</h2>
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__meta">סכום ביניים</p>
          </div>
          <div className="account-row__actions">{formatIls(order.subtotalAgorot)}</div>
        </div>
        {order.walletAppliedAgorot > 0 && (
          <div className="account-row">
            <div className="account-row__main">
              <p className="account-row__meta">שולם מהארנק</p>
            </div>
            <div className="account-row__actions">-{formatIls(order.walletAppliedAgorot)}</div>
          </div>
        )}
        <div className="account-row">
          <div className="account-row__main">
            <p className="account-row__title">סך הכל שולם באתר</p>
          </div>
          <div className="account-row__actions">
            <strong>{formatIls(order.totalAgorot)}</strong>
          </div>
        </div>
      </section>

      <section className="account-card">
        <h2 className="account-card__title">פריטים</h2>
        {order.lines.map((line) => (
          <div className="account-row" key={line.id}>
            <div className="account-row__main">
              <p className="account-row__title">
                {line.productSlug ? (
                  <Link href={`/product/${line.productSlug}`}>{line.productName}</Link>
                ) : (
                  line.productName
                )}
              </p>
              <p className="account-row__meta">
                {line.quantity} יחידות · {formatIls(line.unitPriceAgorot)} ליחידה
                {line.productType === 'coupon' && line.balanceDueAgorot > 0
                  ? ` · ${formatIls(line.balanceDueAgorot)} לתשלום בבית העסק`
                  : ''}
              </p>
              {line.supplier && (
                <p className="account-row__meta">
                  {line.supplier.name}
                  {line.supplier.city ? ` · ${line.supplier.city}` : ''}
                  {line.supplier.phone ? ` · ${line.supplier.phone}` : ''}
                </p>
              )}

              {line.vouchers.length > 0 && (
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  {line.vouchers.map((voucher) => {
                    // Through the shared presenter, so this chip cannot say
                    // `פעיל` about a coupon the counter has already stopped
                    // accepting: the expiry sweep is a cron, and a lapsed row
                    // sits at `issued` until it runs. A missing deadline reads
                    // as expired for the same reason.
                    const status = couponStatusView({
                      status: voucher.status,
                      expires_at: voucher.expiresAt ?? '',
                      redeemed_at: voucher.usedAt,
                    })
                    return (
                      <div className="coupon-card" key={voucher.code}>
                        {voucher.qrDataUrl && (
                          <img
                            src={voucher.qrDataUrl}
                            alt={`קוד QR לקופון ${voucher.code}`}
                            width={120}
                            height={120}
                          />
                        )}
                        <div>
                          <p className="coupon-card__code">{voucher.code}</p>
                          <p className="account-row__meta">
                            <span
                              className={`account-chip account-chip--${COUPON_TONE_CHIP[status.tone]}`}
                            >
                              {status.label}
                            </span>
                            {voucher.expiresAt
                              ? ` · בתוקף עד ${formatDate(voucher.expiresAt)}`
                              : ''}
                          </p>
                          {voucher.collectAmountAgorot != null &&
                            voucher.collectAmountAgorot > 0 && (
                              <p className="account-row__meta">
                                לתשלום בבית העסק: {formatIls(voucher.collectAmountAgorot)}
                              </p>
                            )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="account-row__actions">{formatIls(line.totalAgorot)}</div>
          </div>
        ))}
      </section>

      <p>
        <Link className="account-btn" href="/account/orders">
          חזרה להזמנות
        </Link>
      </p>
    </>
  )
}
