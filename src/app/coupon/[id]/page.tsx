import WalletButtons from '@/components/coupon/WalletButtons'
import { createClient } from '@/lib/supabase/server'
import { buildSupplierContact } from '@/lib/supplier-contact'
import {
  COUPON_TONE_CLASS,
  couponMoneyView,
  couponStatusView,
  formatAgorot,
  formatCouponCode,
  formatCouponDate,
} from '@/lib/vouchers/coupon-view'
import { voucherQrDataUrl } from '@/lib/vouchers/qr-image'
import { buildRedemptionInquiryText } from '@/lib/whatsapp'
import { getCustomerVoucher } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * The coupon a customer holds up at the counter.
 *
 * Deliberately outside the /account shell. This is the one page opened with a
 * cashier waiting: the code and the QR are the whole content, and the account
 * sidebar, the cart drawer and the site footer are three things between the
 * customer and the number the cashier needs. It carries its own session guard
 * for the same reason /account has one in its layout rather than in proxy.ts.
 *
 * The id in the path is a UUID and is treated as an identifier, not a secret:
 * getCustomerVoucher filters on user_id under RLS, so somebody else's id is
 * indistinguishable from one that does not exist. noindex is set regardless,
 * because the page renders a live voucher QR.
 */

export const metadata: Metadata = {
  title: 'הקופון שלי',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ id: string }> }

/**
 * The shell is the page's background and column, nothing more: this is one
 * customer's voucher, keyed by an id in the path, and the guard that decides
 * whether they may see it is the first thing the body does. Prerendering any of
 * the card would mean prerendering somebody's coupon.
 */
export default function CouponPage(props: Props) {
  return (
    <Suspense
      fallback={<main dir="rtl" className="mx-auto min-h-screen max-w-md bg-gray-50 px-4 py-6" />}
    >
      <CouponPageBody {...props} />
    </Suspense>
  )
}

async function CouponPageBody({ params }: Props) {
  const { id } = await params

  // No session and no voucher are different situations, and getCustomerVoucher
  // collapses both to null: a signed-out customer who followed a link from an
  // email deserves a login round trip back to this page, not a 404.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/coupon/${id}`)}`)

  const voucher = await getCustomerVoucher(id)
  if (!voucher) notFound()

  const status = couponStatusView(voucher)
  const money = couponMoneyView(voucher)

  // Rendered only for a voucher that can still be scanned. A QR beside a spent
  // or lapsed coupon invites a cashier to try, and it then fails in front of
  // the customer.
  const qrDataUrl = status.presentable ? await voucherQrDataUrl(voucher.qr_payload) : null

  // Same builder as the product page. The links used to be assembled inline
  // here, and `wa.me/${whatsapp.replace(/[^0-9]/g, '')}` keeps the leading zero
  // of a local number: `wa.me/0524635550` opens WhatsApp's "not on WhatsApp"
  // screen with the cashier waiting. See lib/supplier-contact.ts.
  const contact = buildSupplierContact(voucher.supplier, {
    whatsappMessage: buildRedemptionInquiryText(voucher.product?.name_he ?? null),
  })

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-md bg-gray-50 px-4 py-6">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/account/coupons" className="hover:text-gray-900">
          ← לכל הקופונים שלי
        </Link>
      </nav>

      <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h1 className="text-lg font-bold leading-snug text-gray-900">
              {voucher.product?.name_he ?? 'שובר'}
            </h1>
            {contact.name && <p className="mt-0.5 text-sm text-gray-500">{contact.name}</p>}
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${COUPON_TONE_CLASS[status.tone]}`}
          >
            {status.label}
          </span>
        </header>

        <div className="px-5 py-5">
          {status.presentable ? (
            <div className="flex flex-col items-center gap-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR של שובר ${formatCouponCode(voucher.code)}`}
                  width={240}
                  height={240}
                  className="rounded-xl"
                />
              ) : (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי.
                </p>
              )}
              <p
                dir="ltr"
                className="font-mono text-3xl font-bold tracking-widest text-gray-900"
                data-testid="coupon-code"
              >
                {formatCouponCode(voucher.code)}
              </p>
              <p className="text-xs text-gray-400">הציגו את הקוד בבית העסק</p>
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 py-8 text-center">
              <p className="text-base font-semibold text-gray-700">{status.label}</p>
              {voucher.status === 'redeemed' && voucher.redeemed_at && (
                <p className="mt-1 text-sm text-gray-500">
                  מומש ב־{formatCouponDate(voucher.redeemed_at)}
                </p>
              )}
              {voucher.status === 'refunded' && (
                <p className="mt-1 text-sm text-gray-500">הסכום ששולם באתר הוחזר לאמצעי התשלום.</p>
              )}
              <p dir="ltr" className="mt-3 font-mono text-lg tracking-widest text-gray-400">
                {formatCouponCode(voucher.code)}
              </p>
            </div>
          )}

          <WalletButtons voucher={voucher} presentable={status.presentable} />

          {status.presentable && status.expiringSoon && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-800">
              {status.daysLeft === 0
                ? 'הקופון פג היום'
                : `נותרו ${status.daysLeft} ימים לניצול הקופון`}
            </p>
          )}

          <dl className="mt-5 space-y-2 text-sm">
            <Row label="שולם באתר" value={formatAgorot(money.paidOnlineAgorot)} />
            <Row
              label="לתשלום בבית העסק"
              value={formatAgorot(money.dueAtBusinessAgorot)}
              emphasis
            />
            <Row label="מחיר מלא" value={formatAgorot(money.faceValueAgorot)} muted />
            <div className="flex items-center justify-between border-t border-gray-100 pt-2">
              <dt className="text-gray-500">בתוקף עד</dt>
              <dd className="font-medium text-gray-900">{formatCouponDate(voucher.expires_at)}</dd>
            </div>
          </dl>

          {!money.conserved && (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700">
              יש אי התאמה בפירוט התשלום של השובר. בבית העסק ייגבה הסכום הרשום כאן, ואם משהו נראה לא
              תקין פנו לשירות הלקוחות לפני המימוש.
            </p>
          )}
        </div>

        {contact.hasAny && (
          <footer className="border-t border-gray-100 bg-gray-50 px-5 py-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">פרטי בית העסק</h2>
            <dl className="space-y-1.5 text-sm">
              {contact.name && <Row label="שם" value={contact.name} />}
              {contact.addressLine && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">כתובת</dt>
                  <dd className="text-end font-medium text-gray-900">
                    {contact.addressLine}
                    {/* Navigation only when a street address exists: the
                        alternative sends a customer to a city centre. */}
                    {contact.wazeHref && (
                      <a
                        href={contact.wazeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ms-2 font-semibold text-gray-900 underline"
                      >
                        ניווט ב-Waze
                      </a>
                    )}
                  </dd>
                </div>
              )}
              {contact.telHref && (
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">טלפון</dt>
                  <dd>
                    <a
                      dir="ltr"
                      href={contact.telHref}
                      className="font-medium text-gray-900 underline"
                    >
                      {contact.phoneDisplay}
                    </a>
                  </dd>
                </div>
              )}
              {contact.whatsappHref && (
                <div className="flex items-center justify-between">
                  <dt className="text-gray-500">וואטסאפ</dt>
                  <dd>
                    <a
                      href={contact.whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-gray-900 underline"
                    >
                      שליחת הודעה
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </footer>
        )}
      </article>

      <p className="mt-4 text-center text-xs text-gray-400">
        הונפק ב־{formatCouponDate(voucher.issued_at)}
      </p>
    </main>
  )
}

function Row({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string
  value: string
  emphasis?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={
          emphasis
            ? 'font-bold text-gray-900'
            : muted
              ? 'text-gray-500'
              : 'font-medium text-gray-900'
        }
      >
        {value}
      </dd>
    </div>
  )
}
