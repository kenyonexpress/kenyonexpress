import { type Agorot, formatAgorot } from '@/lib/money'
import {
  APPROVAL_LABEL_HE,
  ISSUE_LABEL_HE,
  PRODUCT_STATUS_LABEL_HE,
  type SupplierProductRow,
  productEconomics,
  summarizeCatalogue,
} from '@/lib/supplier/products'
import { requireSupplierRole } from '@/lib/supplier/rbac'
import { getSupplierProducts } from '@/server/queries/supplier'

export const metadata = { title: 'המוצרים שלי' }

/**
 * The supplier's own catalogue, read-only.
 *
 * Gated at `manager`, not `scanner`. A scanner is a person at a till with the
 * shop's phone; commission rates and margins are not theirs to see, and the
 * role split exists precisely so that handing someone the scanner does not hand
 * them the business terms.
 *
 * Read-only on purpose too. Editing a product changes `platform_percent`, which
 * is the commission the checkout snapshots onto `order_items` at purchase time.
 * That is an admin action with an approval gate behind it, and putting an edit
 * button here would route around it.
 */

function Badge({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'muted' | 'warn' }) {
  const cls = {
    ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    muted: 'bg-gray-50 text-gray-600 ring-gray-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  }[tone]

  return (
    <span className={`rounded-lg px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{children}</span>
  )
}

// `Agorot`, not `number`: the brand is the whole point, and widening it here
// would let a shekel float reach the formatter unnoticed.
function Money({ value }: { value: Agorot | null }) {
  if (value === null) return <span className="text-gray-400">—</span>
  return (
    <span dir="ltr" className="tabular-nums">
      {formatAgorot(value)}
    </span>
  )
}

function ProductCard({ row }: { row: SupplierProductRow }) {
  const economics = productEconomics(row)

  return (
    <li className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-heading">{row.nameHe}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={row.status === 'active' ? 'ok' : 'muted'}>
              {PRODUCT_STATUS_LABEL_HE[row.status] ?? row.status}
            </Badge>
            <Badge tone={row.approvalStatus === 'approved' ? 'ok' : 'warn'}>
              {APPROVAL_LABEL_HE[row.approvalStatus] ?? row.approvalStatus}
            </Badge>
            <Badge tone="muted">{row.type === 'coupon' ? 'קופון' : 'מוצר פיזי'}</Badge>
          </div>
        </div>
      </div>

      {economics.issue ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {ISSUE_LABEL_HE[economics.issue]}. פנו לתמיכה להשלמת ההגדרה.
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2 border-gray-100 border-t pt-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">{row.type === 'coupon' ? 'שווי' : 'מחיר'}</dt>
            <dd className="font-semibold">
              <Money value={row.faceValueAgorot} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {row.type === 'coupon' ? 'נגבה באתר' : `עמלה ${row.platformPercent}%`}
            </dt>
            <dd className="font-semibold text-gray-600">
              <Money value={economics.platformCutAgorot} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">
              {economics.collectedAt === 'till' ? 'לגבייה בעסק' : 'שלכם'}
            </dt>
            <dd className="font-extrabold text-heading">
              <Money value={economics.supplierNetAgorot} />
            </dd>
          </div>
        </dl>
      )}
    </li>
  )
}

export default async function SupplierProductsPage() {
  const session = await requireSupplierRole('manager', '/supplier/products')
  const products = await getSupplierProducts(session.supplierId)
  const summary = summarizeCatalogue(products)

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-bold text-2xl text-heading">המוצרים שלי</h1>
        <p className="mt-1 text-gray-500 text-sm">
          כל מוצר והחלוקה שלו. בקופון הלקוח משלם באתר ואתם גובים את היתרה בעסק בזמן הסריקה; במוצר
          פיזי העמלה נגבית לפי האחוז שהוגדר לאותו מוצר.
        </p>
      </section>

      {summary.needsAttention > 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          {summary.needsAttention} מוצרים חסרי הגדרה ולא ניתן לחשב עבורם חלוקה.
        </p>
      ) : null}

      <section className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-gray-500 text-xs">סה״כ</p>
          <p className="font-extrabold text-heading text-xl">{summary.total}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-gray-500 text-xs">פעילים</p>
          <p className="font-extrabold text-heading text-xl">{summary.active}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-3">
          <p className="text-gray-500 text-xs">קופונים</p>
          <p className="font-extrabold text-heading text-xl">{summary.coupons}</p>
        </div>
      </section>

      {products.length === 0 ? (
        <p className="rounded-2xl border border-gray-200 border-dashed bg-white px-4 py-10 text-center text-gray-500 text-sm">
          עדיין אין מוצרים משויכים לעסק שלכם.
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((row) => (
            <ProductCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}
