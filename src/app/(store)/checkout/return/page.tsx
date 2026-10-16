import { OrderVoucherCard } from '@/components/checkout/OrderVoucherCard'
import { SuccessPageShell } from '@/components/checkout/SuccessPageShell'
import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { WALLET_AMOUNT_CANDIDATES, readFirstAvailableColumn } from '@/lib/supabase/optional-columns'
import { voucherQrDataUrl } from '@/lib/vouchers/qr-image'
import { buildOrderInquiryText, storeWhatsAppNumber, waChatLink } from '@/lib/whatsapp'
import { reconcileOrderReturn } from '@/server/actions/payments/checkout'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import AutoRefresh from './AutoRefresh'
import '@/styles/checkout-page.css'
import '@/styles/success-page.css'

export const metadata: Metadata = {
  title: 'אישור הזמנה',
}

type Props = {
  searchParams: Promise<{ order_id?: string }>
}

/**
 * The shell is the pending state this page already renders while the settlement
 * is being verified, minus the auto-refresh. That is the right fallback and not
 * a placeholder chosen to fill space: the first thing a shopper who has just
 * paid sees is "we are verifying", whether the verification takes 30ms or two
 * seconds, instead of a blank tab for the length of `reconcileOrderReturn`.
 */
export default function CheckoutReturnPage(props: Props) {
  return (
    <Suspense
      fallback={
        <SuccessPageShell>
          <div className="checkout-page">
            <div className="checkout-pending">
              <h1 className="success-heading">מאמתים את התשלום...</h1>
              <p className="success-subtext">
                ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית.
              </p>
            </div>
          </div>
        </SuccessPageShell>
      }
    >
      <CheckoutReturnBody {...props} />
    </Suspense>
  )
}

async function CheckoutReturnBody({ searchParams }: Props) {
  const sp = await searchParams
  const orderId = sp.order_id
  if (!orderId) notFound()

  const result = await reconcileOrderReturn(orderId)
  if (result.status === 'not_found') notFound()
  if (result.status === 'failed') redirect(`/checkout/failed?order_id=${orderId}`)

  if (result.status === 'pending') {
    return (
      <SuccessPageShell>
        <div className="checkout-page">
          <AutoRefresh />
          <div className="checkout-pending">
            <h1 className="success-heading">מאמתים את התשלום...</h1>
            <p className="success-subtext">
              ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית.
            </p>
          </div>
        </div>
      </SuccessPageShell>
    )
  }

  // Paid: load the order snapshot for display.
  const admin = createAdminClient()
  const generation = await resolveOrderGeneration(moneyColumnProbe(admin as never, 'orders'))
  const [{ data: orderRow }, { data: vouchers }, cashbackAgorot] = await Promise.all([
    admin
      .from('orders')
      .select(`id, paid_at, ${orderMoneySelect(generation)}`)
      .eq('id', orderId)
      .maybeSingle(),
    admin
      .from('vouchers')
      .select(
        `id, code, qr_payload, expires_at,
         face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
         products(name_he),
         suppliers(name, address, contact_phone, opening_hours)`,
      )
      .eq('order_id', orderId)
      .order('issued_at', { ascending: true }),
    readFirstAvailableColumn<number>(
      (select, ids) =>
        admin.from('wallet_entries').select(select).in('idempotency_key', ids) as never,
      WALLET_AMOUNT_CANDIDATES,
      [`order:${orderId}:cashback`],
      'checkout return cashback',
    ).then((rows) => [...rows.values()][0] ?? 0),
  ])
  const order = orderRow as unknown as (Record<string, unknown> & { id: string }) | null
  if (!order) notFound()
  const orderMoney = readOrderMoney(generation, order)

  const couponsWithQr = await Promise.all(
    (vouchers ?? []).map(async (voucher) => ({
      ...voucher,
      collect_amount_agorot: voucher.remaining_amount_due_agorot,
      qrDataUrl: await voucherQrDataUrl(voucher.qr_payload, { width: 300 }),
    })),
  )

  const cashbackAmount = agorot(cashbackAgorot ?? 0)

  // Format order number as KE-ORD-XXXXXX
  const formattedOrderId = `KE-ORD-${order.id.slice(0, 6).toUpperCase()}`

  return (
    <SuccessPageShell>
      <div className="checkout-page">
        <div className="success-page">
          {/* Success heading with checkmark animation already shown by SuccessPageShell */}
          <h1 className="success-heading">ההזמנה אושרה!</h1>
          <p className="success-subtext">
            הזמנה {formattedOrderId} · שולם באתר {shekels(agorot(orderMoney.totalAgorot))}
          </p>

          {couponsWithQr.length > 0 && (
            <section aria-label="הקופונים שלך" className="success-vouchers-section">
              <h2 className="success-section-title">הקופונים שלך</h2>
              <div className="success-vouchers-grid">
                {couponsWithQr.map((coupon) => {
                  const productName = Array.isArray(coupon.products)
                    ? coupon.products[0]?.name_he
                    : (coupon.products as { name_he: string } | null)?.name_he

                  const supplierInfo = Array.isArray(coupon.suppliers)
                    ? coupon.suppliers[0]
                    : coupon.suppliers

                  return (
                    <OrderVoucherCard
                      key={coupon.id}
                      id={coupon.id}
                      code={coupon.code}
                      qrDataUrl={coupon.qrDataUrl}
                      expiresAt={coupon.expires_at}
                      collectAmountAgorot={coupon.collect_amount_agorot}
                      productName={productName}
                      supplierInfo={supplierInfo ?? undefined}
                      siteUrl={process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'}
                    />
                  )
                })}
              </div>
              <p className="success-vouchers-note">
                <Link href="/account/coupons" className="success-link">
                  הקופונים שמורים גם באזור האישי
                </Link>
              </p>
            </section>
          )}

          {cashbackAmount > 0 && (
            <p className="success-cashback-note">נוסף לארנק שלך: {shekels(cashbackAmount)} קאשבק</p>
          )}

          {/* Receipt PDF link */}
          <p className="success-receipt-link">
            <a href={`/account/orders/${order.id}/receipt`} className="success-link">
              📥 הורדת אישור הזמנה (PDF)
            </a>
          </p>

          {/* WhatsApp support link */}
          {(() => {
            const storePhone = storeWhatsAppNumber()
            if (!storePhone) return null
            const href = waChatLink(storePhone, buildOrderInquiryText(formattedOrderId))
            if (!href) return null
            return (
              <p className="success-whatsapp-support">
                <a href={href} target="_blank" rel="noopener noreferrer" className="success-link">
                  <WhatsAppIcon size={18} />
                  לעדכונים על ההזמנה דברו איתנו בוואטסאפ
                </a>
              </p>
            )
          })()}

          {/* Continue shopping and My Orders buttons */}
          <div className="success-cta-buttons">
            <Link href="/products" className="success-btn success-btn--primary">
              🛍️ המשיכו לקנות
            </Link>
            <Link href="/account/orders" className="success-btn success-btn--secondary">
              📦 הזמנות שלי
            </Link>
          </div>
        </div>
      </div>
    </SuccessPageShell>
  )
}
