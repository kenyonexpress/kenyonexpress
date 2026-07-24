import {
  type CustomerVoucher,
  getCustomerVouchers,
  isVoucherRedeemable,
} from '@/server/queries/vouchers'
import QRCode from 'qrcode'

export const metadata = { title: 'השוברים שלי' }

const STATUS_LABEL: Record<CustomerVoucher['status'], string> = {
  issued: 'פעיל',
  redeemed: 'מומש',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
}

const STATUS_CLASS: Record<CustomerVoucher['status'], string> = {
  issued: 'bg-green-100 text-green-700',
  redeemed: 'bg-gray-200 text-gray-600',
  expired: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-blue-100 text-blue-700',
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

export default async function AccountVouchersPage() {
  const vouchers = await getCustomerVouchers()

  // Pre-render QR images server-side, only for vouchers that can still be used.
  const qrByVoucher = new Map<string, string>()
  await Promise.all(
    vouchers
      .filter((v) => isVoucherRedeemable(v))
      .map(async (v) => {
        try {
          qrByVoucher.set(v.id, await QRCode.toDataURL(v.qr_payload, { margin: 1, width: 240 }))
        } catch {
          // A QR failure must not blank the whole page; the code stays usable.
        }
      }),
  )

  return (
    <section dir="rtl" className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900">השוברים שלי 🎟</h1>

      {vouchers.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
          <p className="mb-2 text-3xl">🎟</p>
          <p>אין לך שוברים עדיין</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {vouchers.map((v) => {
            const redeemable = isVoucherRedeemable(v)
            const qr = qrByVoucher.get(v.id)
            return (
              <li
                key={v.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                  <div>
                    <p className="font-bold text-gray-900">{v.product?.name_he ?? 'שובר'}</p>
                    {v.supplier?.name && <p className="text-xs text-gray-500">{v.supplier.name}</p>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[v.status]}`}
                  >
                    {STATUS_LABEL[v.status]}
                  </span>
                </div>

                <div className="px-5 py-4">
                  {redeemable && qr ? (
                    <div className="flex flex-col items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered data URI */}
                      <img
                        src={qr}
                        alt={`QR של שובר ${formatCode(v.code)}`}
                        width={200}
                        height={200}
                        className="rounded-xl"
                      />
                      <p
                        dir="ltr"
                        className="font-mono text-2xl font-bold tracking-widest text-gray-900"
                      >
                        {formatCode(v.code)}
                      </p>
                      <p className="text-xs text-gray-400">הצג קוד זה בבית העסק</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-gray-50 py-6 text-center text-sm text-gray-500">
                      {v.status === 'redeemed'
                        ? `מומש ב־${v.redeemed_at ? formatDate(v.redeemed_at) : ''}`
                        : STATUS_LABEL[v.status]}
                    </div>
                  )}

                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">שולם באתר</dt>
                      <dd className="font-medium text-gray-900">
                        {formatIls(v.coupon_price_agorot)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">לתשלום בבית העסק</dt>
                      <dd className="font-bold text-gray-900">
                        {formatIls(v.remaining_amount_due_agorot)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-gray-500">מחיר מלא</dt>
                      <dd className="text-gray-500">{formatIls(v.face_value_agorot)}</dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                      <dt className="text-gray-500">בתוקף עד</dt>
                      <dd className="font-medium text-gray-900">
                        {formatDate(v.offer_valid_until)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
