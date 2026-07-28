import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { buildOrderUpdateText, waChatLink } from '@/lib/whatsapp'
import { describeRefundBlockers } from '@/server/domain/orders/refund'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import OrderStatusClient from './OrderStatusClient'

export const metadata = { title: 'פרטי הזמנה' }

/**
 * Order detail.
 *
 * Every number and every name below comes from the `order_items` snapshot, not
 * from a live join back to `products` or `suppliers`. That is the whole point of
 * the snapshot (ADMIN-ARCHITECTURE.md section 0.4 and section 4): a line bought
 * at 70/30 has to keep reading 70/30 after the product moves to 85/15, and an
 * order has to keep naming the business it was bought from after that business
 * is renamed. This page used to join `products(name_he), suppliers(name)`, so
 * renaming a supplier silently rewrote history on every past order.
 *
 * The product id is still carried, as a link only, so an admin can jump to the
 * product as it is TODAY. It is never the source of a displayed value.
 */

interface Props {
  params: Promise<{ id: string }>
}

type BadgeVariant = 'green' | 'yellow' | 'red' | 'gray' | 'blue'

interface OrderItemRow {
  id: string
  product_id: string | null
  product_type: 'physical' | 'coupon'
  quantity: number
  unit_price_ils: number
  total_price_ils: number
  settlement_status: string
  item_status: string
  platform_percent: number | null
  supplier_split_percent: number | null
  discount_percent: number | null
  coupon_price_ils: number | null
  supplier_name: string | null
  supplier_phone: string | null
  supplier_payout_ils: number | null
}

interface VoucherRow {
  id: string
  code: string
  status: 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'
  order_item_id: string | null
  redeemed_at: string | null
  expires_at: string
}

const VOUCHER_STATUS_LABELS: Record<
  VoucherRow['status'],
  { label: string; variant: BadgeVariant }
> = {
  issued: { label: 'הונפק', variant: 'blue' },
  redeemed: { label: 'מומש', variant: 'green' },
  expired: { label: 'פג', variant: 'red' },
  cancelled: { label: 'בוטל', variant: 'gray' },
  refunded: { label: 'הוחזר', variant: 'gray' },
}

function ils(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `₪${Number(value).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Number(value)}%`
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  await requireSection('orders', 'read')
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, profiles(full_name, email, phone), order_items(*)')
    .eq('id', id)
    .single()

  if (!order) notFound()

  const items = (Array.isArray(order.order_items) ? order.order_items : []) as OrderItemRow[]

  // Vouchers are keyed off the order's coupon lines. Service role: coupon_codes
  // has no permissive select policy for `authenticated`.
  const couponItemIds = items.filter((i) => i.product_type === 'coupon').map((i) => i.id)
  const { data: voucherRows } =
    couponItemIds.length > 0
      ? await admin
          .from('coupon_codes')
          .select('id, code, status, order_item_id, redeemed_at, expires_at')
          .in('order_item_id', couponItemIds)
      : { data: [] }
  const vouchers = (voucherRows ?? []) as VoucherRow[]

  const blockers = describeRefundBlockers({
    lines: items.map((i) => ({
      orderItemId: i.id,
      productType: i.product_type,
      settlementStatus: i.settlement_status as never,
    })),
    vouchers: vouchers.map((v) => ({ voucherId: v.id, status: v.status })),
  })

  const badge = orderStatusBadge(order.status)
  const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles

  const couponLines = items.filter((i) => i.product_type === 'coupon')
  const physicalLines = items.filter((i) => i.product_type === 'physical')

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900" dir="ltr">
          {order.invoice_number ?? order.id.slice(0, 8)}
        </h1>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-800">פרטי לקוח</h2>
          <InfoRow label="שם" value={profile?.full_name ?? '—'} />
          <InfoRow label="אימייל" value={profile?.email ?? '—'} />
          <InfoRow label="טלפון" value={profile?.phone ?? '—'} />
          {(() => {
            const href = profile?.phone
              ? waChatLink(
                  profile.phone,
                  buildOrderUpdateText({
                    customerName: profile?.full_name ?? null,
                    orderShortId: order.invoice_number ?? order.id.slice(0, 8).toUpperCase(),
                    statusLabel: badge.label,
                  }),
                )
              : null
            if (!href) return null
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-whatsapp-ink hover:text-whatsapp-ink-hover pt-1"
              >
                <WhatsAppIcon size={16} />
                שליחת עדכון הזמנה בוואטסאפ
              </a>
            )
          })()}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-gray-800">סיכום כספי</h2>
          <InfoRow label="סכום ביניים" value={ils(order.subtotal_ils)} />
          <InfoRow label="הנחה" value={ils(order.discount_ils)} />
          <InfoRow label="קאשבק שמומש" value={ils(order.cashback_applied_ils)} />
          <InfoRow label="סה״כ" value={ils(order.total_ils)} bold />
          <InfoRow
            label="הרכב"
            value={`${couponLines.length} קופונים · ${physicalLines.length} פיזיים`}
          />
        </div>
      </div>

      {blockers.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="flex items-center gap-2 font-semibold text-amber-900 mb-2">
            <AlertTriangle size={16} />
            החזר לכרטיס חסום
          </h2>
          <ul className="list-disc ps-5 space-y-1 text-sm text-amber-900">
            {blockers.map((b) => (
              <li key={b.message}>{b.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            זיכוי לארנק הוא תנועת כסף אחרת ואינו חסום על ידי הכללים האלה.
          </p>
        </div>
      )}

      {couponLines.length > 0 && (
        <LineTable
          title={`שורות קופון (${couponLines.length})`}
          items={couponLines}
          isCoupon
          vouchers={vouchers}
        />
      )}

      {physicalLines.length > 0 && (
        <LineTable
          title={`שורות פיזיות (${physicalLines.length})`}
          items={physicalLines}
          isCoupon={false}
          vouchers={[]}
        />
      )}

      {items.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400">
          אין פריטים בהזמנה
        </div>
      )}

      <p className="text-xs text-gray-500">
        כל הערכים בטבלאות הם עותק שנשמר ברגע הרכישה. עריכת המוצר או הספק אחרי הרכישה אינה משנה שורה
        קיימת.
      </p>

      <OrderStatusClient orderId={order.id} currentStatus={order.status} />
    </div>
  )
}

function LineTable({
  title,
  items,
  isCoupon,
  vouchers,
}: {
  title: string
  items: OrderItemRow[]
  isCoupon: boolean
  vouchers: VoucherRow[]
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 font-medium text-start">ספק (בעת הרכישה)</th>
              <th className="px-4 py-2.5 font-medium text-start">כמות</th>
              <th className="px-4 py-2.5 font-medium text-start">
                {isCoupon ? 'שולם באתר' : 'מחיר יחידה'}
              </th>
              <th className="px-4 py-2.5 font-medium text-start">סכום</th>
              <th className="px-4 py-2.5 font-medium text-start">פלטפורמה</th>
              <th className="px-4 py-2.5 font-medium text-start">ספק</th>
              <th className="px-4 py-2.5 font-medium text-start">הנחה</th>
              <th className="px-4 py-2.5 font-medium text-start">סטטוס סליקה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const lineVouchers = vouchers.filter((v) => v.order_item_id === item.id)
              return (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3 text-gray-800">
                    <div>{item.supplier_name ?? '—'}</div>
                    {item.supplier_phone && (
                      <div className="text-xs text-gray-400" dir="ltr">
                        {item.supplier_phone}
                      </div>
                    )}
                    {item.product_id && (
                      <Link
                        href={`/admin/products/${item.product_id}/edit`}
                        className="text-xs text-brand hover:underline"
                      >
                        המוצר היום
                      </Link>
                    )}
                    {lineVouchers.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {lineVouchers.map((v) => {
                          const meta = VOUCHER_STATUS_LABELS[v.status]
                          return (
                            <li key={v.id} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-gray-600" dir="ltr">
                                {v.code}
                              </span>
                              <StatusBadge label={meta.label} variant={meta.variant} />
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {ils(isCoupon ? item.coupon_price_ils : item.unit_price_ils)}
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {ils(item.total_price_ils)}
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {percent(item.platform_percent)}
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {percent(item.supplier_split_percent)}
                    <div className="text-xs text-gray-400">{ils(item.supplier_payout_ils)}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700" dir="ltr">
                    {percent(item.discount_percent)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{item.settlement_status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-800 ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  )
}
