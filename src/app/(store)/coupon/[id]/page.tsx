import { createClient } from '@/lib/supabase/server'
import { getCustomerVoucherById, isVoucherRedeemable } from '@/server/queries/vouchers'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'

export const metadata: Metadata = {
  title: 'הקופון שלי',
}

const STATUS_LABEL: Record<string, string> = {
  issued: 'פעיל',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
}

function formatIls(agorot: number): string {
  return `₪${(agorot / 100).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatCode(code: string): string {
  return code.length > 5 ? `${code.slice(0, 5)}-${code.slice(5, 10)}` : code
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function CustomerCouponPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/coupon/${id}`)

  const voucher = await getCustomerVoucherById(id)
  if (!voucher) notFound()

  const redeemable = isVoucherRedeemable(voucher)
  let qrDataUrl: string | null = null
  if (redeemable) {
    try {
      qrDataUrl = await QRCode.toDataURL(voucher.qr_payload, { margin: 1, width: 280 })
    } catch {
      qrDataUrl = null
    }
  }

  const productName = voucher.product?.name_he ?? 'קופון'
  const supplierName = voucher.supplier?.name ?? 'בית העסק'

  return (
    <main dir="rtl" className="coupon-page mx-auto max-w-[480px] px-4 py-8">
      <p className="mb-2 text-sm text-black/50">
        <Link href="/account/vouchers" className="underline-offset-2 hover:underline">
          ← כל השוברים
        </Link>
      </p>
      <h1 className="text-2xl font-bold text-[#333e48]">{productName}</h1>
      <p className="mt-1 text-sm text-black/60">{supplierName}</p>

      <div className="mt-4 inline-flex rounded-full bg-[#fed700] px-3 py-1 text-xs font-bold text-[#333e48]">
        {STATUS_LABEL[voucher.status] ?? voucher.status}
      </div>

      <section className="mt-6 rounded-2xl border border-black/10 bg-white p-5 text-center shadow-sm">
        <p className="font-mono text-2xl tracking-widest text-[#333e48]" dir="ltr">
          {formatCode(voucher.code)}
        </p>
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt={`קוד QR לקופון ${voucher.code}`}
            className="mx-auto mt-4 h-[280px] w-[280px]"
            width={280}
            height={280}
          />
        ) : (
          <p className="mt-6 text-sm text-black/50">
            {redeemable ? 'לא ניתן להציג QR כרגע, השתמשו בקוד' : 'הקופון אינו פעיל לסריקה'}
          </p>
        )}
      </section>

      <dl className="mt-6 space-y-3 rounded-2xl border border-black/10 bg-white p-5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">שולם באתר</dt>
          <dd className="font-semibold text-[#333e48]" dir="ltr">
            {formatIls(voucher.coupon_price_agorot)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">יתרה לתשלום בבית העסק</dt>
          <dd className="text-lg font-extrabold text-[#E4002B]" dir="ltr">
            {formatIls(voucher.remaining_amount_due_agorot)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-black/50">בתוקף עד</dt>
          <dd className="text-[#333e48]">{formatDate(voucher.expires_at)}</dd>
        </div>
        {voucher.redeemed_at && (
          <div className="flex justify-between gap-3">
            <dt className="text-black/50">מומש ב</dt>
            <dd className="text-[#333e48]">{formatDate(voucher.redeemed_at)}</dd>
          </div>
        )}
      </dl>

      <p className="mt-6 text-center text-xs leading-relaxed text-black/45">
        הציגו את הקוד או את ה-QR בבית העסק. המימוש חד-פעמי. היתרה משולמת ישירות לעסק בעת הסריקה.
      </p>
    </main>
  )
}
