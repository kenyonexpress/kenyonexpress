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
import {
  behaviouralFunnel,
  bucketSignups,
  cashbackOutstanding,
  couponRedemption,
  growthTotals,
  orderDropoff,
  pctOf,
} from '@/lib/analytics/dashboard-kpis'
import { agorot } from '@/lib/commerce/money'
import {
  shekelsFromIls as sharedShekelsFromIls,
  shekelsFromIlsRounded as sharedShekelsFromIlsRounded,
  shekels,
  shekelsRounded,
} from '@/lib/money-format'
import {
  type Loaded,
  loadCashbackWallets,
  loadCouponCodes,
  loadFunnelEvents,
  loadOrderStats,
  loadSignups,
} from '@/server/analytics/dashboard'
import { loadFunnel, loadSalesLines } from '@/server/analytics/queries'
import { Coins, Receipt, ShoppingCart, Ticket, TrendingUp, UserPlus, Wallet } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

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
  return sharedShekelsFromIls(value)
}

function shortShekels(value: number): string {
  return sharedShekelsFromIlsRounded(value)
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

/** A rate the aggregation could not compute is a dash, never 0%. */
function percent(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('he-IL')}%`
}

/**
 * A panel whose read failed says so, with the database's words. Zeros here
 * would read as a quiet day, and the difference between "nobody bought" and
 * "the database did not answer" is the whole point of the page.
 */
function ReadFailed({ what, reason }: { what: string; reason: string }) {
  return (
    <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      קריאת {what} נכשלה: <span dir="ltr">{reason}</span>
    </p>
  )
}

function TruncatedNote() {
  return (
    <p className="mt-2 text-xs text-amber-900">
      הטווח חרג ממכסת השורות של הלוח, והמספרים בפאנל הזה חלקיים.
    </p>
  )
}

/** The panel body when its read succeeded, or the failure notice. */
function whenLoaded<T>(
  loaded: Loaded<T>,
  what: string,
  render: (value: T, truncated: boolean) => ReactNode,
): ReactNode {
  if (!loaded.ok) return <ReadFailed what={what} reason={loaded.reason} />
  return render(loaded.value, loaded.truncated)
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  await requireAdminPage()

  const { period: rawPeriod } = await searchParams
  const period = resolvePeriod(rawPeriod)

  const now = new Date()

  const [{ lines, truncated }, funnelView, couponCodes, wallets, signups, orderStats] =
    await Promise.all([
      loadSalesLines(period.days),
      loadFunnel(period.days),
      loadCouponCodes(period.days),
      loadCashbackWallets(),
      loadSignups(period.days),
      loadOrderStats(period.days),
    ])

  // The daily view is the cheap path. Where it was never created, the same six
  // counts come from the raw events table; only when both are missing does the
  // panel say the funnel is unavailable.
  const funnel = funnelView.available
    ? { available: true as const, row: funnelView.row, source: 'view' as const, truncated: false }
    : await loadFunnelEvents(period.days).then((events) =>
        events.ok
          ? {
              available: true as const,
              row: behaviouralFunnel(events.value.events, events.value.purchases),
              source: 'events' as const,
              truncated: events.truncated,
            }
          : { available: false as const, reason: events.reason },
      )

  const coupons = couponCodes.ok ? couponRedemption(couponCodes.value, now) : null
  const cashback = wallets.ok ? cashbackOutstanding(wallets.value) : null
  const growthBuckets = signups.ok
    ? bucketSignups(signups.value.createdAts, period.value, signups.value.priorCount)
    : []
  const growth = signups.ok ? growthTotals(growthBuckets, signups.value.priorCount) : null
  const dropoff = orderStats.ok ? orderDropoff(orderStats.value, now) : null

  const growthPoints: BarPoint[] = growthBuckets.map((bucket) => ({
    key: bucket.key,
    label: bucketLabel(bucket.key, period.value),
    value: bucket.newUsers,
    secondary: bucket.cumulativeUsers,
  }))

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="שיעור מימוש קופונים"
          value={coupons ? percent(coupons.redemptionRatePct) : '—'}
          icon={Ticket}
          variant="admin"
        />
        <StatsCard
          label="קאשבק פתוח"
          value={cashback ? shekelsRounded(agorot(cashback.outstandingAgorot)) : '—'}
          icon={Wallet}
          variant="admin"
        />
        <StatsCard
          label="לקוחות חדשים"
          value={growth ? integer(growth.newUsers) : '—'}
          icon={UserPlus}
          variant="admin"
        />
        <StatsCard
          label="הזמנות שנוצרו ולא שולמו"
          value={dropoff ? integer(dropoff.unpaid) : '—'}
          icon={ShoppingCart}
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
        <h2 className="text-sm font-bold text-heading">משפך המרה ונטישה</h2>
        {funnel.available ? (
          <>
            <p className="mt-1 text-xs text-black/50">
              {funnel.source === 'view'
                ? 'התנהגות מתוך האגרגציה היומית; רכישות נספרות מטבלת ההזמנות, לא מאירועים.'
                : 'התנהגות מתוך אירועי הגלישה הגולמיים, סשנים ייחודיים בכל שלב; רכישות נספרות מטבלת ההזמנות, לא מאירועים.'}
            </p>
            {funnel.truncated && <TruncatedNote />}
            <div className="mt-4">
              <FunnelBars steps={funnelWithRates(funnel.row)} />
            </div>
          </>
        ) : (
          <ReadFailed what="המשפך" reason={funnel.reason} />
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-heading">נטישת הזמנות</h2>
        <p className="mt-1 text-xs text-black/50">
          מה קרה לכל הזמנה שנוצרה בטווח: שולמה, סופקה, או נפלה בדרך ולמה. "שולמו" נספר לפי חותמת
          התשלום, כך שהזמנה שהוחזרה אחר כך נשארת בשלב ששילמה בו.
        </p>
        <div className="mt-4">
          {whenLoaded(orderStats, 'ההזמנות', (_orders, isTruncated) =>
            dropoff ? (
              <>
                {isTruncated && <TruncatedNote />}
                <FunnelBars steps={dropoff.steps} />
                <table className="mt-5 w-full text-start text-sm">
                  <caption className="mb-2 text-start text-xs font-medium text-black/50">
                    לאן נעלמו
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-black/50">
                      <th scope="col" className="py-2 text-start font-medium">
                        סיבה
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        הזמנות
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        מכל שנוצרו
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dropoff.losses.map((loss) => (
                      <tr key={loss.key} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 text-black/70">{loss.label}</td>
                        <td className="py-2 font-medium text-heading">{integer(loss.value)}</td>
                        <td className="py-2 text-black/70">{percent(loss.ofCreatedPct)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-100 last:border-0">
                      <td className="py-2 text-black/70">עדיין פתוחות לתשלום</td>
                      <td className="py-2 font-medium text-heading">
                        {integer(dropoff.stillOpen)}
                      </td>
                      <td className="py-2 text-black/70">
                        {percent(pctOf(dropoff.stillOpen, dropoff.steps[0]?.value ?? 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null,
          )}
        </div>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">מימוש קופונים</h2>
          <p className="mt-1 text-xs text-black/50">
            קודים שהונפקו בטווח הנבחר. שיעור המימוש נמדד מתוך הקודים שגורלם נחרץ, נסרקו או פקעו; קוד
            שעדיין פתוח לא נספר נגד. קוד שסטטוסו "הונפק" ותוקפו עבר נחשב פקע.
          </p>
          <div className="mt-4">
            {whenLoaded(couponCodes, 'הקופונים', (_codes, isTruncated) =>
              coupons ? (
                <>
                  {isTruncated && <TruncatedNote />}
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-black/50">שיעור מימוש</dt>
                      <dd className="text-lg font-bold text-heading">
                        {percent(coupons.redemptionRatePct)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">פקיעה ללא מימוש</dt>
                      <dd className="text-lg font-bold text-heading">
                        {percent(coupons.breakagePct)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">נסרקו מכל שהונפקו</dt>
                      <dd className="text-lg font-bold text-heading">
                        {percent(coupons.usedOfIssuedPct)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">חציון ימים עד סריקה</dt>
                      <dd className="text-lg font-bold text-heading">
                        {coupons.medianDaysToRedeem === null
                          ? '—'
                          : coupons.medianDaysToRedeem.toLocaleString('he-IL')}
                      </dd>
                    </div>
                  </dl>
                  <table className="mt-5 w-full text-start text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-xs text-black/50">
                        <th scope="col" className="py-2 text-start font-medium">
                          מצב
                        </th>
                        <th scope="col" className="py-2 text-start font-medium">
                          קודים
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ['הונפקו בסך הכל', coupons.total],
                          ['פתוחים', coupons.open],
                          ['נסרקו', coupons.used],
                          ['פקעו', coupons.expired],
                          ['הוחזרו', coupons.refunded],
                        ] as const
                      ).map(([label, value]) => (
                        <tr key={label} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 text-black/70">{label}</td>
                          <td className="py-2 font-medium text-heading">{integer(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null,
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">קאשבק פתוח</h2>
          <p className="mt-1 text-xs text-black/50">
            מצב הארנקים כרגע, לא לפי טווח: כל שקל שלקוח יכול עוד להוריד מהקנייה הבאה הוא התחייבות של
            הפלטפורמה. יתרות שליליות אינן נסכמות, הן תקלה ביומן שצריך לרדוף.
          </p>
          <div className="mt-4">
            {whenLoaded(wallets, 'הארנקים', (_wallets, isTruncated) =>
              cashback ? (
                <>
                  {isTruncated && <TruncatedNote />}
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-black/50">סך יתרות פתוחות</dt>
                      <dd className="text-lg font-bold text-heading">
                        {shekels(agorot(cashback.outstandingAgorot))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">ארנקים עם יתרה</dt>
                      <dd className="text-lg font-bold text-heading">
                        {integer(cashback.walletsWithBalance)}
                        <span className="text-xs font-normal text-black/40">
                          {' '}
                          מתוך {integer(cashback.wallets)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">יתרה ממוצעת</dt>
                      <dd className="text-lg font-bold text-heading">
                        {shekels(agorot(cashback.averageBalanceAgorot))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">נצבר מאז ומעולם</dt>
                      <dd className="text-lg font-bold text-heading">
                        {shekels(agorot(cashback.lifetimeEarnedAgorot))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">נוצל מאז ומעולם</dt>
                      <dd className="text-lg font-bold text-heading">
                        {shekels(agorot(cashback.lifetimeRedeemedAgorot))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-black/50">שיעור ניצול</dt>
                      <dd className="text-lg font-bold text-heading">
                        {percent(cashback.redeemedSharePct)}
                      </dd>
                    </div>
                  </dl>
                  {cashback.negativeWallets > 0 && (
                    <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                      {integer(cashback.negativeWallets)} ארנקים ביתרה שלילית. זה לא אמור לקרות;
                      ליומן הקאשבק.{' '}
                      <Link href="/admin/cashback" className="underline">
                        ליומן
                      </Link>
                    </p>
                  )}
                </>
              ) : null,
            )}
          </div>
        </section>
      </div>

      <section className="space-y-3">
        {whenLoaded(signups, 'הלקוחות', (_signups, isTruncated) => (
          <>
            {isTruncated && <TruncatedNote />}
            {growth && (
              <p className="text-sm text-black/60">
                {integer(growth.newUsers)} לקוחות חדשים בטווח, {integer(growth.totalUsers)} בסך הכל
                {growth.growthPct !== null && (
                  <>, צמיחה של {percent(growth.growthPct)} על הבסיס שהיה לפני הטווח</>
                )}
                .
              </p>
            )}
            <BarSeries
              title="צמיחת לקוחות"
              caption="הרשמות חדשות בכל תקופה; הסך המצטבר בטבלה."
              points={growthPoints}
              valueLabel="הרשמות"
              secondaryLabel="סך לקוחות"
              formatValue={integer}
              formatSecondary={integer}
            />
          </>
        ))}
      </section>
    </div>
  )
}
