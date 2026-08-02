import StatusBadge from '@/components/admin/StatusBadge'
import { requireSection } from '@/lib/admin/rbac'
import {
  VOUCHER_STATUS_LABELS,
  VOUCHER_STATUS_VARIANTS,
  type VoucherStatus,
  formatVoucherCode,
  isLapsedButUnswept,
  isScannable,
} from '@/lib/admin/voucher-view'
import { createAdminClient } from '@/lib/supabase/admin'
import { AlertTriangle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import QRCode from 'qrcode'

export const metadata = { title: 'שובר' }

/**
 * One voucher, with the QR the supplier scans.
 *
 * The QR is rendered ONLY for a voucher that is still scannable. Showing it next
 * to a redeemed or lapsed voucher invites a supplier to try, and the scan then
 * fails at the counter in front of a customer. The payload is `qr_payload`, the
 * signed value the scanner verifies; it is never rebuilt from the code here,
 * because a locally reconstructed payload would carry no signature and fail.
 */

interface Props {
  params: Promise<{ id: string }>
}

interface VoucherDetail {
  id: string
  code: string
  qr_payload: string
  qr_key_id: string
  status: VoucherStatus
  face_value_agorot: number
  coupon_price_agorot: number
  remaining_amount_due_agorot: number
  platform_percent: number
  offer_valid_until: string
  expires_at: string
  issued_at: string
  redeemed_at: string | null
  redeemed_by_supplier_id: string | null
  cancelled_at: string | null
  refunded_at: string | null
  status_reason: string | null
  order_id: string
  order_item_id: string
  product: { name_he: string | null } | null
  supplier: { name: string | null; contact_phone: string | null } | null
}

function ils(agorotValue: number | null | undefined): string {
  if (agorotValue === null || agorotValue === undefined) return '—'
  return `₪${(agorotValue / 100).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function dateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('he-IL')
}

export default async function AdminVoucherDetailPage({ params }: Props) {
  const { id } = await params
  await requireSection('catalog')

  const admin = createAdminClient()
  const { data } = await admin
    .from('vouchers')
    .select(
      `id, code, qr_payload, qr_key_id, status, face_value_agorot, coupon_price_agorot,
       remaining_amount_due_agorot, platform_percent, offer_valid_until, expires_at,
       issued_at, redeemed_at, redeemed_by_supplier_id, cancelled_at, refunded_at,
       status_reason, order_id, order_item_id,
       product:products(name_he), supplier:suppliers(name, contact_phone)`,
    )
    .eq('id', id)
    .single()

  if (!data) notFound()
  const voucher = data as unknown as VoucherDetail

  const scannable = isScannable(voucher)
  const lapsed = isLapsedButUnswept(voucher)

  // A QR failure must not blank the page: the code below it stays readable and
  // a supplier can key it in.
  let qrDataUrl: string | null = null
  if (scannable) {
    try {
      qrDataUrl = await QRCode.toDataURL(voucher.qr_payload, { margin: 1, width: 320 })
    } catch {
      qrDataUrl = null
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900" dir="ltr">
          {formatVoucherCode(voucher.code)}
        </h1>
        <StatusBadge
          label={VOUCHER_STATUS_LABELS[voucher.status]}
          variant={VOUCHER_STATUS_VARIANTS[voucher.status]}
        />
      </div>

      {lapsed && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            השובר עבר את תאריך התוקף אך עדיין רשום כמונפק. טאטוא התוקף עוד לא רץ עליו. הוא אינו ניתן
            לסריקה.
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="font-semibold text-gray-800 mb-3">QR לסריקה</h2>
          {scannable && qrDataUrl ? (
            <div className="flex flex-col items-center gap-2">
              <Image
                src={qrDataUrl}
                alt={`QR של שובר ${formatVoucherCode(voucher.code)}`}
                width={240}
                height={240}
                unoptimized
                className="rounded-lg border border-gray-200"
              />
              <p className="text-xs text-gray-500 text-center">
                לשחזור מול בית העסק כשהלקוח לא מצליח להציג את השובר.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {scannable
                ? 'יצירת ה-QR נכשלה. אפשר להקליד את הקוד ידנית בסורק.'
                : 'השובר אינו ניתן לסריקה, ולכן אין QR להצגה.'}
            </p>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
          <h2 className="font-semibold text-gray-800 mb-1">כסף</h2>
          <Row label="ערך מלא" value={ils(voucher.face_value_agorot)} />
          <Row label="שולם באתר" value={ils(voucher.coupon_price_agorot)} />
          <Row label="לגבייה בבית העסק" value={ils(voucher.remaining_amount_due_agorot)} />
          <Row label="אחוז פלטפורמה בעת הרכישה" value={`${voucher.platform_percent}%`} />
          <p className="pt-2 text-xs text-gray-500">
            היתרה נגבית במזומן בבית העסק ואינה עוברת דרכנו.
          </p>
        </section>
      </div>

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold text-gray-800 mb-1">סטטוס סריקה</h2>
        <Row label="הונפק" value={dateTime(voucher.issued_at)} />
        <Row label="נסרק" value={dateTime(voucher.redeemed_at)} />
        <Row label="תוקף השובר" value={dateTime(voucher.expires_at)} />
        <Row label="תוקף המבצע" value={dateTime(voucher.offer_valid_until)} />
        {voucher.cancelled_at && <Row label="בוטל" value={dateTime(voucher.cancelled_at)} />}
        {voucher.refunded_at && <Row label="הוחזר" value={dateTime(voucher.refunded_at)} />}
        {voucher.status_reason && <Row label="סיבה" value={voucher.status_reason} />}
      </section>

      <section className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold text-gray-800 mb-1">שיוך</h2>
        <Row label="מוצר" value={voucher.product?.name_he ?? '—'} />
        <Row label="ספק" value={voucher.supplier?.name ?? '—'} />
        <Row label="טלפון הספק" value={voucher.supplier?.contact_phone ?? '—'} />
        <div className="pt-2">
          <Link
            href={`/admin/orders/${voucher.order_id}`}
            className="text-sm text-brand hover:underline"
          >
            להזמנה
          </Link>
        </div>
      </section>

      <Link
        href="/admin/coupons/codes"
        className="inline-block text-sm text-gray-500 hover:underline"
      >
        חזרה לרשימת השוברים
      </Link>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-50 py-1.5 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 text-end" dir="auto">
        {value}
      </span>
    </div>
  )
}
