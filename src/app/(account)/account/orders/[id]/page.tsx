import OrderHelpForm from '@/components/account/OrderHelpForm'
import RefundRequestForm from '@/components/account/RefundRequestForm'
import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { COUPON_TONE_CHIP, couponStatusView } from '@/lib/vouchers/coupon-view'
import { refundRequestStatus } from '@/server/actions/refund-requests'
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

  // Read here rather than inside the client component: the decision needs the
  // order's status and the existing rows, both of which are server-only reads,
  // and a client that fetched them would render the form before knowing whether
  // it is allowed.
  const refund = await refundRequestStatus(id)

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
        {order.invoice && (
          <div className="account-row">
            <div className="account-row__main">
              <p className="account-row__meta">
                חשבונית מס / קבלה
                {order.invoice.documentNumber ? ` ${order.invoice.documentNumber}` : ''}
              </p>
            </div>
            <div className="account-row__actions">
              {/* The href is this route, never the provider's URL: the document
                  is served only after the session is re-checked. */}
              <Link className="account-btn" href={`/account/orders/${order.id}/invoice`}>
                הורדת חשבונית
              </Link>
            </div>
          </div>
        )}
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
                {line.productType === 'physical' && line.itemStatus === 'shipped' ? ' · נשלח' : ''}
                {line.productType === 'physical' && line.itemStatus === 'delivered'
                  ? ' · נמסר'
                  : ''}
              </p>
              {/*
                The tracking line, and the reason it exists at the top of this
                file's history: the shipped email says "למעקב אחרי ההזמנה" and
                links here, and this page used to answer with the word "נשלח"
                and nothing else. The number was captured by the admin, stored
                by 155, and shown to nobody.

                The number is printed whether or not a link could be built. A
                carrier with no verified tracking URL still gets its name and
                its number, because that is enough to phone with -- and it is
                the one fact the customer opened the page for.
              */}
              {line.tracking && (
                <p className="account-row__meta">
                  {line.tracking.carrierLabel}
                  {line.tracking.trackingNumber ? (
                    <>
                      {line.tracking.carrierLabel ? ' · ' : ''}
                      <span dir="ltr" className="font-mono">
                        {line.tracking.trackingNumber}
                      </span>
                    </>
                  ) : null}
                  {line.tracking.url && (
                    <>
                      {' · '}
                      <a
                        href={line.tracking.url}
                        target="_blank"
                        // `noreferrer` as well as `noopener`: the target is a
                        // third party and the path a customer arrived by is
                        // not theirs to read.
                        rel="noopener noreferrer"
                      >
                        מעקב אצל השליח
                      </a>
                    </>
                  )}
                </p>
              )}

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

      <OrderHelpForm orderId={id} />

      <RefundRequestForm
        orderId={id}
        allowed={refund.allowed}
        blockedMessage={refund.message}
        remaining={refund.remaining}
        requests={refund.requests}
      />

      <p>
        <Link className="account-btn" href="/account/orders">
          חזרה להזמנות
        </Link>
      </p>
    </>
  )
}
