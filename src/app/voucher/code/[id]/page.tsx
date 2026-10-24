import { createClient } from '@/lib/supabase/server'
import { formatRedemptionCode } from '@/lib/voucher-code'
import {
  COUPON_TONE_CLASS,
  couponMoneyView,
  couponStatusView,
  formatAgorot,
  formatCouponDate,
} from '@/lib/vouchers/coupon-view'
import { voucherQrDataUrl } from '@/lib/vouchers/qr-image'
import { getCustomerVoucher } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'

/**
 * Voucher display with QR code and 8-digit redemption code.
 *
 * This route displays vouchers with BOTH redemption methods:
 *   - QR code for scanning at the counter
 *   - 8-digit numeric code for phone/SMS entry
 *
 * Like /coupon/[id], this is outside the account shell for fast counter access.
 * The 8-digit code is simpler for phone entry than the 10-character alphanumeric.
 */

export const metadata: Metadata = {
  title: 'קוד פדיון',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ id: string }> }

export default function VoucherCodePage(props: Props) {
  return (
    <Suspense
      fallback={<main dir="rtl" className="mx-auto min-h-screen max-w-md bg-gray-50 px-4 py-6" />}
    >
      <VoucherCodeBody {...props} />
    </Suspense>
  )
}

async function VoucherCodeBody({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/voucher/code/${id}`)}`)

  const voucher = await getCustomerVoucher(id)
  if (!voucher) notFound()

  const status = couponStatusView(voucher)
  const money = couponMoneyView(voucher)

  // Generate QR for scannable redemption
  const qrDataUrl = status.presentable ? await voucherQrDataUrl(voucher.qr_payload) : null

  // Format the 8-digit redemption code from database
  const displayCode = voucher.redemption_code ? formatRedemptionCode(voucher.redemption_code) : null

  return (
    <main dir="rtl" className="mx-auto min-h-screen max-w-md bg-gray-50 px-4 py-6">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/account/coupons" className="hover:text-gray-900">
          ← לכל הקופונים שלי
        </Link>
      </nav>

      <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {/* Header */}
        <header className="border-b border-gray-100 bg-gray-50 px-5 py-4">
          <h1 className="text-lg font-semibold text-gray-900">קוד פדיון</h1>
          <p className="mt-1 text-sm text-gray-600">{voucher.product?.name_he ?? 'קופון'}</p>
        </header>

        {/* QR Code Section */}
        {qrDataUrl && (
          <section className="border-b border-gray-100 bg-white px-5 py-6">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-lg border-2 border-gray-200 bg-white p-3">
                <img
                  src={qrDataUrl}
                  alt="קוד QR לסריקה"
                  width={240}
                  height={240}
                  className="rounded-xl"
                />
              </div>
              <p className="text-center text-sm text-gray-600">סרוק את הקוד בקופה</p>
            </div>
          </section>
        )}

        {/* 8-Digit Code Section */}
        {displayCode && status.presentable && (
          <section className="border-b border-gray-100 bg-gray-50 px-5 py-6">
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-medium text-gray-700">או הקלד את הקוד:</p>
              <div className="rounded-lg bg-white px-6 py-4 shadow-sm ring-1 ring-gray-200">
                <code className="text-3xl font-mono font-bold tracking-wider text-gray-900">
                  {displayCode}
                </code>
              </div>
              <p className="text-center text-xs text-gray-500">8 ספרות לפדיון ידני</p>
            </div>
          </section>
        )}

        {/* Status Badge */}
        <div className="px-5 py-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              status.presentable
                ? 'bg-green-100 text-green-800'
                : (COUPON_TONE_CLASS[status.tone] ?? 'bg-gray-100 text-gray-800')
            }`}
          >
            {status.label}
          </span>
        </div>

        {/* Money Details */}
        <section className="border-t border-gray-100 px-5 py-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">ערך נקוב:</dt>
              <dd className="font-semibold text-gray-900">{formatAgorot(money.faceValueAgorot)}</dd>
            </div>
            {money.dueAtBusinessAgorot > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-600">לתשלום בבית העסק:</dt>
                <dd className="font-semibold text-gray-900">
                  {formatAgorot(money.dueAtBusinessAgorot)}
                </dd>
              </div>
            )}
            {voucher.expires_at && (
              <div className="flex justify-between">
                <dt className="text-gray-600">תוקף:</dt>
                <dd className="text-gray-900">{formatCouponDate(voucher.expires_at)}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Supplier Info */}
        {voucher.supplier?.name && (
          <section className="border-t border-gray-100 px-5 py-4">
            <h2 className="mb-2 text-sm font-medium text-gray-700">בית העסק</h2>
            <p className="text-gray-900">{voucher.supplier.name}</p>
            {voucher.product?.city && (
              <p className="mt-1 text-sm text-gray-600">{voucher.product.city}</p>
            )}
          </section>
        )}

        {/* Footer */}
        <footer className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-center">
          <p className="text-xs text-gray-500">
            {status.presentable
              ? 'הצג מסך זה לקופאי לפדיון הקופון'
              : 'קופון זה לא ניתן יותר לפדיון'}
          </p>
        </footer>
      </article>
    </main>
  )
}
