import StatusBadge, { orderStatusBadge } from '@/components/admin/StatusBadge'
import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { buildOrderUpdateText, waChatLink } from '@/lib/whatsapp'
import { notFound } from 'next/navigation'
import OrderStatusClient from './OrderStatusClient'

export const metadata = { title: 'פרטי הזמנה' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params
  await requireAdminPage()
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select(
      '*, profiles(full_name, email, phone), order_items(*, products(name_he), suppliers(name))',
    )
    .eq('id', id)
    .single()

  if (!order) notFound()

  const badge = orderStatusBadge(order.status)
  const profile = Array.isArray(order.profiles) ? order.profiles[0] : order.profiles
  type OrderItemRow = {
    id: string
    quantity: number
    unit_price_ils: number
    total_price_ils: number
    products: { name_he: string }[] | { name_he: string } | null
    suppliers: { name: string }[] | { name: string } | null
  }
  const items = (Array.isArray(order.order_items) ? order.order_items : []) as OrderItemRow[]

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 font-mono">
          {order.invoice_number ?? order.id.slice(0, 8)}
        </h1>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>

      {/* Order details */}
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
          <InfoRow label="סכום ביניים" value={`₪${order.subtotal_ils.toLocaleString('he-IL')}`} />
          <InfoRow label="הנחה" value={`₪${order.discount_ils.toLocaleString('he-IL')}`} />
          <InfoRow
            label="קאשבק שמומש"
            value={`₪${order.cashback_applied_ils.toLocaleString('he-IL')}`}
          />
          <InfoRow label="סה״כ" value={`₪${order.total_ils.toLocaleString('he-IL')}`} bold />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">פריטים ({items.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="px-5 py-2.5 font-medium">מוצר</th>
              <th className="px-5 py-2.5 font-medium">ספק</th>
              <th className="px-5 py-2.5 font-medium">כמות</th>
              <th className="px-5 py-2.5 font-medium">מחיר יחידה</th>
              <th className="px-5 py-2.5 font-medium">סכום</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const product = Array.isArray(item.products) ? item.products[0] : item.products
              const supplier = Array.isArray(item.suppliers) ? item.suppliers[0] : item.suppliers
              return (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-gray-800">{product?.name_he ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{supplier?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-700">{item.quantity}</td>
                  <td className="px-5 py-3 text-gray-700">
                    ₪{item.unit_price_ils.toLocaleString('he-IL')}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    ₪{item.total_price_ils.toLocaleString('he-IL')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Status update */}
      <OrderStatusClient orderId={order.id} currentStatus={order.status} />
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
