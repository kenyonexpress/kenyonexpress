import OrderCardDisclosure from '@/components/account/OrderCardDisclosure'
import ReorderButton from '@/components/account/ReorderButton'
import SmartImage from '@/components/ui/SmartImage'
import { formatDate, formatIls, orderStatusLabel, orderStatusTone } from '@/lib/account/format'
import {
  canReorder,
  itemCountPhrase,
  linePreview,
  lineStatusView,
  orderBadges,
} from '@/lib/account/order-card'
import { orderShortId } from '@/lib/help/order-links'
import { resolveCarrier } from '@/lib/shipping/carriers'
import type { OrderSummary } from '@/server/queries/orders'
import type { ReorderOffer } from '@/server/queries/reorder'
import Link from 'next/link'

/**
 * One order on /account/orders (UX19).
 *
 * The head carries the order number, the date and the status chips; the
 * body the product preview, the count and the total; the disclosure opens
 * the lines in place (name, count × unit price, line total, the line's own
 * chip, tracking); the foot holds "order again" and the link to the full
 * page. The row this replaces put a 257px actions column beside the text and
 * left the text 35px at 380, so every phrase wrapped word by word; the card
 * stacks instead and the actions take the full width on a phone.
 */
export interface OrderCardProps {
  order: OrderSummary
  reorder: ReorderOffer | null
  paymentGateOpen: boolean
}

export default function OrderCard({ order, reorder, paymentGateOpen }: OrderCardProps) {
  const badges = orderBadges(order, {
    label: orderStatusLabel(order.settlementStatus),
    tone: orderStatusTone(order.settlementStatus),
  })
  const thumbs = order.lines.filter((line) => line.productImage).slice(0, 3)
  const tracked = order.paidAt ? order.shipping.tracked : []

  return (
    <article
      className="order-card"
      data-status={order.settlementStatus}
      aria-labelledby={`order-${order.id}-title`}
    >
      <header className="order-card__head">
        <div className="order-card__id">
          <h2 className="order-card__number" id={`order-${order.id}-title`}>
            הזמנה <span dir="ltr">#{orderShortId(order.id)}</span>
          </h2>
          <time className="order-card__date" dateTime={order.createdAt}>
            {formatDate(order.createdAt)}
          </time>
        </div>
        <ul className="order-card__badges" aria-label="סטטוס ההזמנה">
          {badges.map((chip) => (
            <li className={`account-chip account-chip--${chip.tone}`} key={chip.label}>
              {chip.label}
            </li>
          ))}
        </ul>
      </header>

      <div className="order-card__body">
        {thumbs.length > 0 && (
          <ul className="order-card__thumbs" aria-hidden="true">
            {thumbs.map((line) => (
              <li className="order-card__thumb" key={line.id}>
                <SmartImage
                  src={line.productImage as string}
                  alt=""
                  width={56}
                  height={56}
                  className="order-card__thumb-img"
                  fallbackClassName="order-card__thumb-img"
                  iconSize={20}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="order-card__summary">
          <p className="order-card__preview">{linePreview(order.lines)}</p>
          <p className="order-card__meta">
            {itemCountPhrase(order.itemCount)}
            {order.hasVouchers ? ' · כולל קופונים' : ''}
          </p>
        </div>
        <p className="order-card__total">
          <span className="order-card__total-label">סך הכל</span>
          <strong className="order-card__total-value">{formatIls(order.totalAgorot)}</strong>
        </p>
      </div>

      <OrderCardDisclosure lineCount={order.lines.length}>
        <ul className="order-card__lines">
          {order.lines.map((line) => {
            const status = lineStatusView(line)
            return (
              <li className="order-card__line" key={line.id}>
                <div className="order-card__line-main">
                  <p className="order-card__line-name">
                    {line.productSlug ? (
                      <Link href={`/product/${line.productSlug}`}>{line.productName}</Link>
                    ) : (
                      line.productName
                    )}
                  </p>
                  <p className="order-card__line-meta">
                    {line.quantity} × {formatIls(line.unitPriceAgorot)}
                    {line.productType === 'coupon' ? ' · קופון' : ''}
                  </p>
                </div>
                <div className="order-card__line-side">
                  <span className="order-card__line-total">{formatIls(line.totalAgorot)}</span>
                  {status && (
                    <span className={`account-chip account-chip--${status.tone}`}>
                      {status.label}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {tracked.length > 0 && (
          <ul className="order-card__tracking">
            {tracked.map((parcel) => {
              const carrier = resolveCarrier(parcel.carrier, parcel.trackingNumber)
              return (
                <li className="order-card__meta" key={parcel.trackingNumber}>
                  {'מספר מעקב: '}
                  {carrier?.url ? (
                    <a dir="ltr" href={carrier.url} target="_blank" rel="noopener noreferrer">
                      {parcel.trackingNumber}
                    </a>
                  ) : (
                    <span dir="ltr">{parcel.trackingNumber}</span>
                  )}
                  {carrier ? ` · ${carrier.label}` : ''}
                </li>
              )
            })}
          </ul>
        )}
      </OrderCardDisclosure>

      <footer className="order-card__actions">
        {reorder && canReorder(order) && (
          <ReorderButton
            orderId={order.id}
            card={reorder.card}
            cartItemCount={reorder.cartItemCount}
            paymentGateOpen={paymentGateOpen}
            variant="compact"
          />
        )}
        <Link className="account-btn" href={`/account/orders/${order.id}`}>
          לעמוד ההזמנה
        </Link>
      </footer>
    </article>
  )
}
