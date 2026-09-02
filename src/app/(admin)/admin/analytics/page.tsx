import StatsCard from '@/components/admin/StatsCard'
import BarSeries, { type BarPoint } from '@/components/admin/analytics/BarSeries'
import FunnelBars from '@/components/admin/analytics/FunnelBars'
import { requireAdminPage } from '@/lib/admin/rbac'
import {
  type Period,
  bucketSales,
  funnelWithRates,
  splitByProductType,
  takeRateByPlatformPercent,
  topProducts,
  topSuppliers,
  totalsOf,
} from '@/lib/analytics/aggregate'
import { loadFunnel, loadSalesLines } from '@/server/analytics/queries'
import { Coins, Receipt, ShoppingCart, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'אנליטיקה' }

// Never cached: an owner reading this page is deciding what to do today.

// A tuple, not an array: the first entry is the default and must be known to
// exist. Each period carries the window that makes it readable (30 daily bars,
// 13 weekly, 12 monthly).
const PERIODS = [
  { value: 'day', label: 'יומי', days: 30 },
  { value: 'week', label: 'שבועי', days: 90 },
  { value: 'month', label: 'חודשי', days: 365 },
] as const satisfies ReadonlyArray<{ value: Period; label: string; days: number }>

type PeriodOption = (typeof PERIODS)[number]

const TYPE_LABELS: Record<string, string> = {
  coupon: 'קופונים',
  physical: 'מוצרים פיזיים',
}

/**
 * Named `shekelsFromIls`, not `shekels`, and the name is the point.
 *
 * There were six functions called `shekels` in `src/` and they disagreed about
 * their unit: three took agorot and three, including this one, took shekels.
 * Same name, same output, opposite contracts. `@/lib/money-format` now owns the
 * agorot one for the whole app; every caller here reads an `...Ils` column, so
 * this stays as it is and merely stops sharing a name with its own opposite.
 */
function shekelsFromIls(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function shortShekels(value: number): string {
  return `₪${Math.round(value).toLocaleString('he-IL')}`
}

function integer(value: number): string {
  return value.toLocaleString('he-IL')
}

const dayLabelFormatter = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' })
const monthLabelFormatter = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })

/** Bucket keys are YYYY-MM-DD; parsed at UTC noon so the label cannot slip a day. */
function bucketLabel(key: string, period: Period): string {
  const [year, month, day] = key.split('-')
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12))
  if (period === 'month') return monthLabelFormatter.format(date)
  if (period === 'week') return `שבוע ${dayLabelFormatter.format(date)}`
  return dayLabelFormatter.format(date)
}

function resolvePeriod(raw: string | undefined): PeriodOption {
  return PERIODS.find((p) => p.value === raw) ?? PERIODS[0]
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  await requireAdminPage()

  const { period: rawPeriod } = await searchParams
  const period = resolvePeriod(rawPeriod)

  const [{ lines, truncated }, funnel] = await Promise.all([
    loadSalesLines(period.days),
    loadFunnel(period.days),
  ])

  const buckets = bucketSales(lines, period.value)
  const totals = totalsOf(buckets)
  const products = topProducts(lines, 10)
  const suppliers = topSuppliers(lines, 10)
  const typeSplit = splitByProductType(lines)
  const takeRates = takeRateByPlatformPercent(lines)

  const points: BarPoint[] = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucketLabel(bucket.key, period.value),
    value: bucket.gmvIls,
    secondary: bucket.platformRevenueIls,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-heading">אנליטיקה</h1>

        <nav aria-label="טווח דיווח" className="flex gap-1 rounded-lg border border-gray-200 p-1">
          {PERIODS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/analytics?period=${option.value}`}
              aria-current={option.value === period.value ? 'page' : undefined}
              className={
                option.value === period.value
                  ? 'rounded-md bg-brand-primary px-3 py-1.5 text-sm font-bold text-heading'
                  : 'rounded-md px-3 py-1.5 text-sm text-black/60 transition-colors hover:bg-black/[0.04]'
              }
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      <p className="text-sm text-black/50">
        {period.days} הימים האחרונים. כל הסכומים מצילום המצב בזמן הרכישה, לפי ימי עסקים בישראל.
      </p>

      {truncated && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          הטווח הזה חרג ממכסת השורות, והמספרים חלקיים. צריך להעביר את האגרגציה ל-SQL.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="מחזור"
          value={shortShekels(totals.gmvIls)}
          icon={TrendingUp}
          variant="admin"
        />
        <StatsCard
          label="הכנסות פלטפורמה"
          value={shortShekels(totals.platformRevenueIls)}
          icon={Coins}
          variant="admin"
        />
        <StatsCard
          label="הזמנות"
          value={integer(totals.orders)}
          icon={ShoppingCart}
          variant="admin"
        />
        <StatsCard
          label="ממוצע להזמנה"
          value={shortShekels(totals.aovIls)}
          icon={Receipt}
          variant="admin"
        />
      </div>

      <BarSeries
        title="מכירות לאורך זמן"
        caption="מחזור לפי שווי פנים. הכנסות הפלטפורמה בטור לצידו."
        points={points}
        valueLabel="מחזור"
        secondaryLabel="הכנסות פלטפורמה"
        formatValue={shekelsFromIls}
        formatSecondary={shekelsFromIls}
      />

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-heading">משפך המרה</h2>
        {funnel.available ? (
          <>
            <p className="mt-1 text-xs text-black/50">
              התנהגות מתוך האגרגציה היומית; רכישות נספרות מטבלת ההזמנות, לא מאירועים.
            </p>
            <div className="mt-4">
              <FunnelBars steps={funnelWithRates(funnel.row)} />
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-black/50">
            המשפך יופיע אחרי החלת מיגרציות האנליטיקה (033, 034, 053). שאר הנתונים בדף אינם תלויים
            בהן.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">קופונים מול מוצרים פיזיים</h2>
          <p className="mt-1 text-xs text-black/50">
            מחזור קופון נמדד בשווי פנים, ולכן גדול ממה שנגבה באתר. הפער הוא מה שנגבה בעסק.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-black/50">
                  <th scope="col" className="py-2 text-start font-medium">
                    סוג
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    מחזור
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    נגבה באתר
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    נתח
                  </th>
                </tr>
              </thead>
              <tbody>
                {typeSplit.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-black/50">
                      אין מכירות בטווח הזה.
                    </td>
                  </tr>
                )}
                {typeSplit.map((row) => (
                  <tr key={row.productType} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-black/70">
                      {TYPE_LABELS[row.productType] ?? row.productType}
                    </td>
                    <td className="py-2 font-medium text-heading">{shekelsFromIls(row.gmvIls)}</td>
                    <td className="py-2 text-black/70">{shekelsFromIls(row.chargedOnSiteIls)}</td>
                    <td className="py-2 text-black/70">{row.gmvSharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">עשרת הספקים המובילים</h2>
          <p className="mt-1 text-xs text-black/50">
            לפי GMV בטווח הנבחר; אותן שורות מכירה של שאר העמוד.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-black/50">
                  <th scope="col" className="py-2 text-start font-medium">
                    ספק
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    פריטים
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    GMV
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    עמלה
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    לספק
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-black/50">
                      אין מכירות בטווח הזה.
                    </td>
                  </tr>
                )}
                {suppliers.map((row) => (
                  <tr
                    key={row.supplierId ?? row.supplierName}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2 text-black/70">{row.supplierName}</td>
                    <td className="py-2 text-black/70">{integer(row.items)}</td>
                    <td className="py-2 font-medium text-heading">{shekelsFromIls(row.gmvIls)}</td>
                    <td className="py-2 text-black/70">{shekelsFromIls(row.platformRevenueIls)}</td>
                    <td className="py-2 text-black/70">{shekelsFromIls(row.supplierDueIls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">הכנסות לפי אחוז פלטפורמה</h2>
          <p className="mt-1 text-xs text-black/50">
            לפי האחוז שצולם בזמן הרכישה. שינוי אחוז היום אינו מזיז שורה בטבלה הזו.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-black/50">
                  <th scope="col" className="py-2 text-start font-medium">
                    אחוז
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    פריטים
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    הכנסות
                  </th>
                  <th scope="col" className="py-2 text-start font-medium">
                    אפקטיבי
                  </th>
                </tr>
              </thead>
              <tbody>
                {takeRates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-black/50">
                      אין מכירות בטווח הזה.
                    </td>
                  </tr>
                )}
                {takeRates.map((row) => (
                  <tr
                    key={row.platformPercent ?? 'none'}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2 text-black/70">
                      {row.platformPercent === null ? 'לא הוגדר' : `${row.platformPercent}%`}
                    </td>
                    <td className="py-2 text-black/70">{integer(row.items)}</td>
                    <td className="py-2 font-medium text-heading">
                      {shekelsFromIls(row.platformRevenueIls)}
                    </td>
                    <td className="py-2 text-black/70">
                      {row.effectiveTakeRatePct === null ? '—' : `${row.effectiveTakeRatePct}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-heading">מוצרים מובילים</h2>
        <p className="mt-1 text-xs text-black/50">לפי מחזור בטווח הנבחר.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-black/50">
                <th scope="col" className="py-2 text-start font-medium">
                  מוצר
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  סוג
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  יחידות
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  מחזור
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  הכנסות פלטפורמה
                </th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-black/50">
                    אין מכירות בטווח הזה.
                  </td>
                </tr>
              )}
              {products.map((row) => (
                <tr
                  key={row.productId ?? row.productName}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="py-2 text-black/70">
                    {row.productId ? (
                      <Link
                        href={`/admin/products/${row.productId}/edit`}
                        className="hover:text-heading hover:underline"
                      >
                        {row.productName}
                      </Link>
                    ) : (
                      row.productName
                    )}
                  </td>
                  <td className="py-2 text-black/70">
                    {TYPE_LABELS[row.productType] ?? row.productType}
                  </td>
                  <td className="py-2 text-black/70">{integer(row.units)}</td>
                  <td className="py-2 font-medium text-heading">{shekelsFromIls(row.gmvIls)}</td>
                  <td className="py-2 text-black/70">{shekelsFromIls(row.platformRevenueIls)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
