import { t } from '@/lib/i18n/messages'

/**
 * Electro's `woocommerce-order-overview`: the four facts a buyer screenshots
 * after paying, in one row from 768 and as a two-column grid below it.
 *
 * A `<dl>` rather than Electro's `<ul><li>label<strong>` because the pairs ARE
 * terms and values, and a screen reader then says "מספר הזמנה, 9E9A14E3"
 * instead of reading a list item that happens to contain both.
 */
export default function OrderOverview({
  orderNumber,
  date,
  total,
  email,
}: {
  orderNumber: string
  date: string
  total: string
  email: string | null
}) {
  return (
    <dl className="confirm-overview" aria-label={t('checkout.confirm.overviewLabel')}>
      <div className="confirm-overview__item">
        <dt>{t('checkout.confirm.orderNumber')}</dt>
        <dd dir="ltr" data-testid="order-number">
          {orderNumber}
        </dd>
      </div>
      {date && (
        <div className="confirm-overview__item">
          <dt>{t('checkout.confirm.date')}</dt>
          <dd>{date}</dd>
        </div>
      )}
      <div className="confirm-overview__item">
        <dt>{t('checkout.confirm.total')}</dt>
        <dd data-testid="order-total">{total}</dd>
      </div>
      {email && (
        <div className="confirm-overview__item">
          <dt>{t('checkout.confirm.email')}</dt>
          <dd dir="ltr">{email}</dd>
        </div>
      )}
    </dl>
  )
}
