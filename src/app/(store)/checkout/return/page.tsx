import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildCouponShareText,
  buildOrderInquiryText,
  storeWhatsAppNumber,
  waChatLink,
  waShareLink,
} from '@/lib/whatsapp'
import { reconcileOrderReturn } from '@/server/actions/payments/checkout'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
import AutoRefresh from './AutoRefresh'
import '@/styles/checkout-page.css'

export const metadata: Metadata = {
  title: 'אישור הזמנה',
}

function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

type Props = {
  searchParams: Promise<{ order_id?: string }>
}

export default async function CheckoutReturnPage({ searchParams }: Props) {
  const sp = await searchParams
  const orderId = sp.order_id
  if (!orderId) notFound()

  const result = await reconcileOrderReturn(orderId)
  if (result.status === 'not_found') notFound()
  if (result.status === 'failed') redirect(`/checkout/failed?order_id=${orderId}`)

  if (result.status === 'pending') {
    return (
      <div className="checkout-page">
        <AutoRefresh />
        <div className="checkout-pending">
          <h1 className="checkout-success__title">מאמתים את התשלום...</h1>
          <p className="checkout-success__sub">
            ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית.
          </p>
        </div>
      </div>
    )
  }

  // Paid: load the order snapshot for display
  const admin = createAdminClient()
  const [{ data: order }, { data: coupons }, { data: cashbackEntry }] = await Promise.all([
    admin
      .from('orders')
      .select('id, total_ils, subtotal_ils, paid_at')
      .eq('id', orderId)
      .maybeSingle(),
    admin
      .from('coupon_codes')
      .select(
        'id, code, qr_token, expires_at, face_value_ils, collect_amount_ils, products(name_he)',
      )
      .in(
        'order_item_id',
        (await admin.from('order_items').select('id').eq('order_id', orderId)).data?.map(
          (r) => r.id,
        ) ?? [],
      )
      .order('created_at', { ascending: true }),
    admin
      .from('wallet_entries')
      .select('amount_ils')
      .eq('idempotency_key', `order:${orderId}:cashback`)
      .maybeSingle(),
  ])
  if (!order) notFound()

  const couponsWithQr = await Promise.all(
    (coupons ?? []).map(async (coupon) => ({
      ...coupon,
      qrDataUrl: await QRCode.toDataURL(coupon.qr_token, { margin: 1, width: 264 }),
    })),
  )

  const cashback = Number(cashbackEntry?.amount_ils ?? 0)

  return (
    <div className="checkout-page">
      <div className="checkout-success">
        <h1 className="checkout-success__title">התשלום הצליח!</h1>
        <p className="checkout-success__sub">
          הזמנה {order.id.slice(0, 8).toUpperCase()} · שולם באתר {shekels(Number(order.total_ils))}
        </p>

        {couponsWithQr.length > 0 && (
          <section aria-label="הקופונים שלך" style={{ maxWidth: 640, marginInline: 'auto' }}>
            <h2 className="checkout-section__title">הקופונים שלך</h2>
            {couponsWithQr.map((coupon) => {
              const productName = Array.isArray(coupon.products)
                ? coupon.products[0]?.name_he
                : (coupon.products as { name_he: string } | null)?.name_he
              const shareHref = waShareLink(
                buildCouponShareText({
                  productName: productName ?? null,
                  code: coupon.code,
                  collectAmountIls: Number(coupon.collect_amount_ils),
                  expiresAt: coupon.expires_at,
                  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il',
                }),
              )
              return (
                <article className="coupon-card" key={coupon.id}>
                  <div>
                    {productName && <div className="coupon-card__collect">{productName}</div>}
                    <div className="coupon-card__code">{coupon.code}</div>
                    {Number(coupon.collect_amount_ils) > 0 && (
                      <div className="coupon-card__collect">
                        לתשלום בעסק במימוש: {shekels(Number(coupon.collect_amount_ils))}
                      </div>
                    )}
                    <div className="coupon-card__note">
                      בתוקף עד{' '}
                      {new Date(coupon.expires_at).toLocaleDateString('he-IL', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                      {' · '}הציגו את הקוד או את ה-QR בבית העסק
                    </div>
                    <a
                      href={shareHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="coupon-card__share"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#128c7e',
                      }}
                    >
                      <WhatsAppIcon size={16} />
                      שתפו את הקופון בוואטסאפ
                    </a>
                  </div>
                  <div className="coupon-card__qr">
                    <img src={coupon.qrDataUrl} alt={`קוד QR לקופון ${coupon.code}`} />
                  </div>
                </article>
              )
            })}
          </section>
        )}

        {cashback > 0 && (
          <p className="checkout-wallet-note">נוסף לארנק שלך: {shekels(cashback)} קאשבק</p>
        )}

        {(() => {
          const storePhone = storeWhatsAppNumber()
          if (!storePhone) return null
          const href = waChatLink(
            storePhone,
            buildOrderInquiryText(order.id.slice(0, 8).toUpperCase()),
          )
          if (!href) return null
          return (
            <p style={{ marginTop: 20 }}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#128c7e',
                }}
              >
                <WhatsAppIcon size={18} />
                לעדכונים על ההזמנה דברו איתנו בוואטסאפ
              </a>
            </p>
          )
        })()}

        <p style={{ marginTop: 28 }}>
          <Link href="/products" className="checkout-pay-btn" style={{ display: 'inline-flex' }}>
            המשך לקניות
          </Link>
        </p>
      </div>
    </div>
  )
}
