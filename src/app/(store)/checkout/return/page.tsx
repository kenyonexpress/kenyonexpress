import PostPurchasePushPrompt from '@/components/pwa/PostPurchasePushPrompt'
import PasskeyBanner from '@/components/auth/PasskeyBanner'
import LocationPin from '@/components/product/LocationPin'
import PushPrompt from '@/components/push/PushPrompt'
import PurchaseMarker from '@/components/pwa/PurchaseMarker'
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
import { createClient } from '@/lib/supabase/server'
import { voucherQrDataUrl } from '@/lib/vouchers/qr-image'
import {
  buildCouponShareText,
  buildOrderInquiryText,
  storeWhatsAppNumber,
  waChatLink,
  waShareLink,
} from '@/lib/whatsapp'
import { reconcileOrderReturn } from '@/server/actions/payments/checkout'
import { formatVoucherCode } from '@/server/domain/vouchers/code'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import AutoRefresh from './AutoRefresh'
import SaveWithGoogle from './SaveWithGoogle'
import '@/styles/checkout-page.css'

export const metadata: Metadata = {
  title: 'אישור הזמנה',
  // The one on this list that matters most: this URL carries `order_id` and
  // renders "התשלום הצליח". An indexed confirmation URL puts somebody's order
  // id in a search result. robots.txt disallows the path, and a disallow stops
  // the crawl rather than the indexing, so the meta is the half that actually
  // says "not this one".
  robots: { index: false, follow: false },
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
        <div className="checkout-page">
          <div className="checkout-pending">
            <h1 className="checkout-success__title">מאמתים את התשלום...</h1>
            <p className="checkout-success__sub">
              ההזמנה נקלטה ואנחנו ממתינים לאישור הסליקה. העמוד יתעדכן אוטומטית.
            </p>
          </div>
        </div>
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

  // Paid: load the order snapshot for display.
  //
  // The vouchers table is the one finalize.ts issues into. This page used to
  // read coupon_codes, the pre-voucher instance table, which no code has
  // written since the voucher subsystem landed: every real coupon purchase
  // showed a confirmation page with no coupon on it, and the customer's only
  // route to their QR was to find /account/vouchers unprompted.
  const admin = createAdminClient()
  // Naming the post-059 money columns on a database that does not have them
  // failed the WHOLE select with 42703, `order` came back null, and this page
  // called notFound() on somebody who had just been charged. Resolved instead.
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
         products(name_he, city, latitude, longitude)`,
      )
      .eq('order_id', orderId)
      .order('issued_at', { ascending: true }),
    // wallet_entries carries amount_ils here and amount_agorot after 059, and
    // the same 42703 rule applies, so it is read through the candidate reader.
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
      ...productGeo(voucher.products),
      // Agorot all the way to the formatter now. This used to divide by 100
      // here and hand shekel floats to a PRIVATE `shekels()` defined at the top
      // of this file -- the same private-formatter-per-component pattern that
      // `pricing.test.ts` exists to prevent, on the one page whose whole job is
      // telling a customer what they were just charged.
      collect_amount_agorot: agorot(voucher.remaining_amount_due_agorot),
      qrDataUrl: await voucherQrDataUrl(voucher.qr_payload, { width: 264 }),
    })),
  )

  const cashbackAmount = agorot(cashbackAgorot ?? 0)

  const {
    data: { user: viewer },
  } = await (await createClient()).auth.getUser()
  const isGuestBuyer = viewer?.is_anonymous === true

  return (
    <div className="checkout-page">
      <div className="checkout-success">
        <PurchaseMarker />
        <h1 className="checkout-success__title">התשלום הצליח!</h1>
        <PushPrompt />
        {isGuestBuyer ? (
          <SaveWithGoogle next={`/checkout/return?order_id=${encodeURIComponent(orderId)}`} />
        ) : (
          <PasskeyBanner />
        )}
        <p className="checkout-success__sub">
          הזמנה {order.id.slice(0, 8).toUpperCase()} · שולם באתר{' '}
          {shekels(agorot(orderMoney.totalAgorot))}
        </p>

        {/* A link to the notifications page, never a permission dialog. It
            renders nothing unless push is possible, undecided and unasked. */}
        <PostPurchasePushPrompt />

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
                  collectAmountAgorot: coupon.collect_amount_agorot,
                  expiresAt: coupon.expires_at,
                  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kenyonexpress.co.il',
                }),
              )
              return (
                <article className="coupon-card" key={coupon.id}>
                  <div>
                    {productName && <div className="coupon-card__collect">{productName}</div>}
                    <LocationPin
                      location={{
                        city: coupon.productCity,
                        latitude: coupon.productLatitude,
                        longitude: coupon.productLongitude,
                      }}
                    />
                    {/* The two test ids are the money journey's handle on the
                        voucher it just bought (e2e/full-purchase-redeem.spec.ts
                        reads the code here and types it into the supplier
                        scanner). They were on this card in e486b868e and fell
                        off in a redesign; measured 2026-10-21, the spec reached
                        this page with a paid order and a rendered card and
                        failed on `getByTestId('coupon-code')`. Same ids as
                        app/coupon/[id]/page.tsx. */}
                    <div className="coupon-card__code" dir="ltr" data-testid="coupon-code">
                      {formatVoucherCode(coupon.code)}
                    </div>
                    {coupon.collect_amount_agorot > 0 && (
                      <div className="coupon-card__collect">
                        לתשלום בעסק במימוש: {shekels(coupon.collect_amount_agorot)}
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
                        color: 'var(--color-whatsapp-ink)',
                      }}
                    >
                      <WhatsAppIcon size={16} />
                      שתפו את הקופון בוואטסאפ
                    </a>
                  </div>
                  {coupon.qrDataUrl && (
                    <div className="coupon-card__qr" data-testid="coupon-qr">
                      <Image
                        src={coupon.qrDataUrl}
                        alt={`קוד QR לקופון ${coupon.code}`}
                        width={200}
                        height={200}
                        unoptimized
                      />
                    </div>
                  )}
                </article>
              )
            })}
            <p style={{ marginTop: 12, fontSize: 13 }}>
              <Link href="/account/coupons" style={{ fontWeight: 600 }}>
                הקופונים שמורים גם באזור האישי
              </Link>
            </p>
          </section>
        )}

        {cashbackAmount > 0 && (
          <p className="checkout-wallet-note">נוסף לארנק שלך: {shekels(cashbackAmount)} קאשבק</p>
        )}

        <p style={{ marginTop: 16, fontSize: 14 }}>
          <a href={`/account/orders/${order.id}/invoice`} style={{ fontWeight: 600 }}>
            הורדת חשבונית מס
          </a>
        </p>

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
                  color: 'var(--color-whatsapp-ink)',
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

type ProductGeo = { city?: string | null; latitude?: number | null; longitude?: number | null }

/** `products` arrives as an object or a one-element array depending on the join. */
function productGeo(products: unknown): {
  productCity: string | null
  productLatitude: number | null
  productLongitude: number | null
} {
  const p = (Array.isArray(products) ? products[0] : products) as ProductGeo | null | undefined
  return {
    productCity: p?.city ?? null,
    productLatitude: p?.latitude ?? null,
    productLongitude: p?.longitude ?? null,
  }
}
