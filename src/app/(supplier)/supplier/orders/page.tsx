import { formatDate } from '@/lib/account/format'
import { type Agorot, formatAgorot } from '@/lib/money'
import {
  FULFILLMENT_LABEL_HE,
  FULFILLMENT_TONE,
  ITEM_STATUS_LABEL_HE,
  type SupplierOrder,
  groupSupplierOrders,
  summarizeSupplierOrders,
} from '@/lib/supplier/orders'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { getSupplierOrders } from '@/server/queries/supplier'

export const metadata = { title: 'הזמנות' }

/**
 * The order queue, read-only.
 *
 * Gated at `manager` for the same reason the catalogue is: the rows carry the
 * commission percent and the residual owed, and the `scanner` role exists so
 * that handing the till phone to a shift worker does not hand them the business
 * terms.
 *
 * There is no "mark shipped" button, and its absence is the design.
 * ARCHITECTURE-SUPPLIER-PORTAL.md section 5.2 routes every fulfillment
 * transition through a Server Action that writes `audit_log`, and section 3.2
 * gives suppliers SELECT on `orders` and nothing else. A button here would need
 * a write path that does not exist yet; shipping one that quietly used the
 * service role would be the audit hole those two sections are written to close.
 */

const TONE_CLASS = {
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  muted: 'bg-gray-50 text-gray-600 ring-gray-200',
} as const

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: keyof typeof TONE_CLASS
}) {
  return (
    <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ring-1 ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  )
}

function Money({ value }: { value: Agorot }) {
  return (
    <span dir="ltr" className="tabular-nums">
      {formatAgorot(value)}
    </span>
  )
}

function OrderCard({ order }: { order: SupplierOrder }) {
  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-heading">
            הזמנה{' '}
            <span dir="ltr" className="font-mono tracking-wider">
              {order.orderRef}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatDate(order.paidAt)} · {order.itemCount} פריטים
          </p>
        </div>
        <Badge tone={FULFILLMENT_TONE[order.fulfillment]}>
          {FULFILLMENT_LABEL_HE[order.fulfillment]}
        </Badge>
      </div>

      <ul className="mt-3 space-y-2 border-gray-100 border-t pt-3">
        {order.lines.map((line) => (
          <li key={line.orderItemId} className="flex items-start justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-800">{line.productName}</p>
              <p className="mt-0.5 text-xs text-gray-500">
                {line.productType === 'coupon' ? 'קופון' : 'מוצר פיזי'}
                {' · '}
                {ITEM_STATUS_LABEL_HE[line.itemStatus] ?? line.itemStatus}
                {' · '}
                כמות {line.quantity}
              </p>
            </div>
            <div className="shrink-0 text-end text-xs">
              <p className="text-gray-500">
                עמלה {line.platformPercent != null ? `${line.platformPercent}%` : 'לא הוגדר'}
              </p>
              {line.productType === 'coupon' ? (
                <p className="mt-0.5 font-bold text-heading">
                  לגבייה בעסק <Money value={line.tillBalanceAgorot} />
                </p>
              ) : (
                <p className="mt-0.5 font-bold text-heading">
                  מגיע לכם <Money value={line.supplierDueAgorot} />
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-3 gap-2 border-gray-100 border-t pt-3 text-center text-sm">
        <div>
          <dt className="text-xs text-gray-500">שווי</dt>
          <dd className="font-semibold">
            <Money value={order.faceValueAgorot} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">עמלת פלטפורמה</dt>
          <dd className="font-semibold text-gray-600">
            <Money value={order.platformFeeAgorot} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">מגיע לכם</dt>
          <dd className="font-extrabold text-heading">
            <Money value={order.supplierDueAgorot} />
          </dd>
        </div>
      </dl>
    </li>
  )
}

export default async function SupplierOrdersPage() {
  const session = await requireSupplierRole('manager', '/supplier/orders')
  const { lines, meta } = await getSupplierOrders(session.supplierId)
  const orders = groupSupplierOrders(lines, meta)
  const summary = summarizeSupplierOrders(orders)

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-bold text-2xl text-heading">הזמנות</h1>
        <p className="mt-1 text-gray-500 text-sm">
          הזמנות ששולמו ומכילות מוצרים שלכם. במוצר פיזי מוצג הסכום שמגיע לכם מהפלטפורמה אחרי העמלה
          שנקבעה לאותו מוצר; בקופון מוצגת היתרה שהלקוח משלם לכם בקופה בזמן הסריקה.
        </p>
      </section>

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-gray-500 text-xs">ממתינות לטיפול</p>
          <p className="font-extrabold text-heading text-xl">{summary.awaiting}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-gray-500 text-xs">מגיע לכם</p>
          <p className="font-extrabold text-heading text-lg">
            <Money value={summary.supplierDueAgorot} />
          </p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-gray-500 text-xs">לגבייה בקופה</p>
          <p className="font-extrabold text-heading text-lg">
            <Money value={summary.tillBalanceAgorot} />
          </p>
        </div>
      </section>

      {orders.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 border-dashed bg-white px-4 py-10 text-center text-gray-500 text-sm">
          אין עדיין הזמנות ששולמו עם מוצרים שלכם.
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.orderId} order={order} />
          ))}
        </ul>
      )}

      <p className="text-gray-400 text-xs leading-relaxed">
        התצוגה לקריאה בלבד. עדכון סטטוס משלוח נרשם ביומן הביקורת ומתבצע דרך התמיכה, לא מהמסך הזה.
      </p>
    </div>
  )
}
