import OrderFeedbackForm from '@/components/account/OrderFeedbackForm'
import ReorderButton from '@/components/account/ReorderButton'
import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import { summarizeShipping } from '@/lib/orders/shipping-summary'
import { readPaymentProviderGate } from '@/lib/payments/provider-gate'
import { resolveCarrier } from '@/lib/shipping/carriers'
import { COUPON_TONE_CHIP, couponStatusView } from '@/lib/vouchers/coupon-view'
import { getMyOrderFeedback } from '@/server/queries/order-feedback'
import { getOrderDetail } from '@/server/queries/orders'
import { getReorderOffer } from '@/server/queries/reorder'
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
  // Only a paid order is offered again; the offer itself (which card, what the
  // click replaces) is read once here and re-checked by the action on click.
  // Both reads are the customer's, both only matter once money has moved,
  // and neither depends on the other.
  const [reorder, feedback] = order.paidAt
    ? await Promise.all([getReorderOffer(), getMyOrderFeedback(order.id)])
    : [null, { available: false, feedback: null }]
  const paymentGate = readPaymentProviderGate()
  const shipping = summarizeShipping(order.lines)

  return (
    <>
      <h1 className="account-title">הזמנה מתאריך {formatDate(order.createdAt)}</h1>
      <p className="account-subtitle">
        <span className={`account-chip account-chip--${orderStatusTone(order.settlementStatus)}`}>
          {orderStatusLabel(order.settlementStatus)}
        </span>
        {order.paidAt && shipping.label && (
          <>
            {' '}
            <span className={`account-chip account-chip--${shipping.tone}`}>{shipping.label}</span>
          </>
        )}
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
        {order.paidAt && (
          <div className="account-row">
            <div className="account-row__main">
              <p className="account-row__meta">אישור הזמנה להדפסה</p>
            </div>
            <div className="account-row__actions">
              {/* Rendered per request behind the session; there is no stored
                  file to leak. Not the tax document: that row is below. */}
              <a className="account-btn" href={`/account/orders/${order.id}/receipt`}>
                הורדת אישור הזמנה (PDF)
              </a>
            </div>
          </div>
        )}
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
              </p>
              {line.productType === 'physical' &&
                (() => {
                  // The shipping line: status, carrier and tracking, all from
                  // order_items. resolveCarrier only links couriers it knows,
                  // so an unrecognised carrier renders as text and never as a
                  // link to the wrong site.
                  const shipping = resolveCarrier(line.carrier, line.trackingNumber)
                  const status =
                    line.itemStatus === 'delivered'
                      ? `נמסר${line.deliveredAt ? ` ב-${formatDate(line.deliveredAt)}` : ''}`
                      : line.itemStatus === 'shipped'
                        ? `נשלח${line.shippedAt ? ` ב-${formatDate(line.shippedAt)}` : ''}`
                        : null
                  if (!status && !shipping && !line.trackingNumber) return null
                  return (
                    <p className="account-row__meta">
                      {status}
                      {shipping ? `${status ? ' · ' : ''}${shipping.label}` : ''}
                      {line.trackingNumber && (
                        <>
                          {' · מספר מעקב: '}
                          <span dir="ltr">{line.trackingNumber}</span>
                        </>
                      )}
                      {shipping?.url && (
                        <>
                          {' · '}
                          <a href={shipping.url} target="_blank" rel="noopener noreferrer">
                            למעקב אצל חברת המשלוחים
                          </a>
                        </>
                      )}
                    </p>
                  )
                })()}
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

      {order.paidAt && feedback.available && (
        <section className="account-card" data-section="order-feedback">
          <h2 className="account-card__title">חוויית ההזמנה</h2>
          {/* Private by construction: the row is owner-scoped (247), the copy
              goes to the shop inbox, and nothing renders it to anyone else.
              Hidden entirely while the table is unapplied, rather than
              offering a form whose submit would answer "not open yet". */}
          <OrderFeedbackForm
            orderId={order.id}
            existing={feedback.feedback}
            existingDate={feedback.feedback ? formatDate(feedback.feedback.createdAt) : null}
          />
        </section>
      )}

      {reorder && (
        <section className="account-card">
          <h2 className="account-card__title">להזמין שוב</h2>
          <ReorderButton
            orderId={order.id}
            card={reorder.card}
            cartItemCount={reorder.cartItemCount}
            paymentGateOpen={paymentGate.live}
          />
        </section>
      )}

      <p>
        <Link className="account-btn" href="/account/orders">
          חזרה להזמנות
        </Link>
      </p>
    </>
  )
}
