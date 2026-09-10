import PostPurchasePushPrompt from '@/components/pwa/PostPurchasePushPrompt'
import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import { giftHeldCopy } from '@/lib/gifts/held-copy'
import { agorot } from '@/lib/money'
import { shekels } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { WALLET_AMOUNT_CANDIDATES, readFirstAvailableColumn } from '@/lib/supabase/optional-columns'
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
import { isGiftedAway } from '@/server/payments/voucher-email'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import AutoRefresh from './AutoRefresh'
import '@/styles/checkout-page.css'

export const metadata: Metadata = {
  // NOINDEX, and the canonical is the reason rather than the crawl budget.
  // The root layout declares `alternates.canonical: '/'` and Next inherits
  // metadata, so a page that sets neither tells Google it IS the home page -
  // measured 2026-09-10 on sixteen public routes, this one among them. A
  // duplicate-content signal pointing at the home page from a login form is
  // worse than the page being crawled at all. robots.txt disallows several of
  // these too, and that stops the crawl, not the indexing of a URL somebody
  // links to.
  robots: { index: false, follow: true },
  // A SELF-CANONICAL BESIDE THE NOINDEX, and the pair is deliberate. Without it
  // this page inherits the root layout's canonical of '/', and noindex plus a
  // canonical pointing at ANOTHER url is a contradiction Google resolves by
  // following the canonical - which would aim the noindex at the home page. The
  // same url in both fields says exactly one thing: do not index this, and it
  // stands for nothing else.
  alternates: { canonical: '/checkout/return' },
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
        // The gift columns are from 108, which is APPLIED (measured against
        // production 2026-09-10), so naming them here cannot 42703. `226`'s
        // `gift_deliver_at` is deliberately NOT named: it is pending, and the
        // whole select would fail on a database without it - on the page a
        // customer lands on straight after paying.
        `id, code, qr_payload, expires_at,
         face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
         gift_claim_token_hash, gift_claimed_at, gift_sent_at,
         gift_recipient_name, gift_recipient_email,
         products(name_he)`,
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
    (vouchers ?? []).map(async (voucher) => {
      /**
       * A gift the buyer just bought shows what it is, not the code.
       *
       * This page is the FIRST place the leak reached: it renders seconds after
       * the charge, with the code in large type and a WhatsApp share button
       * beside it. Whatever the account pages did afterwards, the buyer had
       * already seen and could already forward the coupon they had just paid to
       * give away.
       *
       * The same rule as the account reads, spelled by the same helper, because
       * this page reads `vouchers` directly rather than through
       * `getCustomerVoucher` - it runs on the service role before the customer
       * is necessarily signed in on this device.
       */
      const held = isGiftedAway(voucher as unknown as Record<string, string | null>)
      const gift = held
        ? giftHeldCopy({
            recipientName:
              (voucher as unknown as { gift_recipient_name: string | null }).gift_recipient_name ??
              null,
            recipientEmail:
              (voucher as unknown as { gift_recipient_email: string | null })
                .gift_recipient_email ?? null,
            deliverAt: null,
            queuedAt: (voucher as unknown as { gift_sent_at: string | null }).gift_sent_at ?? null,
          })
        : null

      return {
        ...voucher,
        gift,
        code: held ? '' : voucher.code,
        // Agorot all the way to the formatter now. This used to divide by 100
        // here and hand shekel floats to a PRIVATE `shekels()` defined at the top
        // of this file -- the same private-formatter-per-component pattern that
        // `pricing.test.ts` exists to prevent, on the one page whose whole job is
        // telling a customer what they were just charged.
        collect_amount_agorot: agorot(voucher.remaining_amount_due_agorot),
        // No QR for a withheld gift. `qr_payload` is still populated on the row
        // here - this read is not the one that blanks it - so the guard has to
        // be explicit rather than inherited.
        qrDataUrl: held ? null : await voucherQrDataUrl(voucher.qr_payload, { width: 264 }),
      }
    }),
  )

  const cashbackAmount = agorot(cashbackAgorot ?? 0)

  return (
    <div className="checkout-page">
      <div className="checkout-success">
        <h1 className="checkout-success__title">התשלום הצליח!</h1>
        <p className="checkout-success__sub">
          הזמנה {order.id.slice(0, 8).toUpperCase()} · שולם באתר{' '}
          {shekels(agorot(orderMoney.totalAgorot))}
        </p>

        {/*
          THE ONE MOMENT WORTH ASKING FOR NOTIFICATION PERMISSION IN, and the
          reason it is not on the landing page: a Block is permanent and cannot
          be asked past. Here the order has just gone through and the customer
          is waiting for a coupon or a parcel. It renders nothing for anybody
          who has already answered, and it does not open the browser dialog
          itself -- it links to the page where a button does.
        */}
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
                  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il',
                }),
              )
              return (
                <article className="coupon-card" key={coupon.id}>
                  <div>
                    {productName && <div className="coupon-card__collect">{productName}</div>}
                    {/*
                      A gift shows where it went instead of the code. The share
                      link below is dropped with it: a WhatsApp message built
                      from a blank code is a message offering nothing, and one
                      built from a real code would hand the buyer the coupon
                      they just paid to give away.
                    */}
                    {coupon.gift ? (
                      <>
                        <div className="coupon-card__collect">{coupon.gift.headline}</div>
                        <div className="coupon-card__note">{coupon.gift.explanation}</div>
                      </>
                    ) : (
                      <div className="coupon-card__code" dir="ltr">
                        {formatVoucherCode(coupon.code)}
                      </div>
                    )}
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
                    {!coupon.gift && (
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
                    )}
                  </div>
                  {coupon.qrDataUrl && (
                    <div className="coupon-card__qr">
                      <img src={coupon.qrDataUrl} alt={`קוד QR לקופון ${coupon.code}`} />
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
