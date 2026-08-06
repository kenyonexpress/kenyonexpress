import StatsCard from '@/components/admin/StatsCard'
import SalesChart, { type SalesPoint } from '@/components/admin/reports/SalesChart'
import { requireSection } from '@/lib/admin/rbac'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import {
  type PeriodTotals,
  type ReportRange,
  aggregate,
  fillDays,
  resolveReportRange,
  summarise,
  supplierObligations,
  todayInIsrael,
} from '@/server/domain/reports/settlement-report'
import { loadReportEvents } from '@/server/queries/reports'
import { Coins, Download, HandCoins, Receipt, RotateCcw, TrendingUp } from 'lucide-react'
import Link from 'next/link'

/**
 * The admin money reports, read from `settlement_events` and from nothing else.
 *
 * Why not from `payout_statements`, which the neighbouring /admin/payouts screen
 * reads: it does not exist in this database. Measured 2026-08-06 —
 * `information_schema` returns zero tables and zero functions matching
 * `%payout%`, because migration 081 was never applied here. Four reports built
 * on it would have been four more screens that look finished and show nothing.
 *
 * Everything numeric on this page is decided in
 * `server/domain/reports/settlement-report.ts` against fixtures, which matters
 * more than usual: the journal has zero rows in production today, so a report
 * verified against the database would have been verified against nothing.
 */

export const metadata = { title: 'דוחות כספיים' }

// Never cached: this is live money, and a cached report shows an admin
// yesterday's numbers with today's date on them.

const GRANULARITIES = [
  { value: 'day', label: 'יומי' },
  { value: 'month', label: 'חודשי' },
] as const

function shekels(agorotValue: number): string {
  // Display only. Every figure this page shows is summed as an agorot integer
  // first and converted once, here, at the edge.
  return `₪${agorotToIls(agorot(agorotValue)).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function shortShekels(agorotValue: number): string {
  return `₪${Math.round(agorotToIls(agorot(agorotValue))).toLocaleString('he-IL')}`
}

const dayLabel = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' })
const monthLabel = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' })

/** Parsed at UTC noon so the label cannot slip a day either way. */
function periodLabel(period: string, granularity: 'day' | 'month'): string {
  const [year, month, day] = period.split('-')
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day ?? '1'), 12))
  return granularity === 'month' ? monthLabel.format(date) : dayLabel.format(date)
}

function rangeQuery(range: ReportRange, overrides: Partial<ReportRange> = {}): string {
  const merged = { ...range, ...overrides }
  return new URLSearchParams({
    from: merged.from,
    to: merged.to,
    granularity: merged.granularity,
  }).toString()
}

function ExportLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.04]"
    >
      <Download size={14} aria-hidden="true" />
      {children}
    </Link>
  )
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; granularity?: string }>
}) {
  await requireSection('payments')

  const raw = await searchParams
  const range = resolveReportRange(raw, todayInIsrael())
  const result = await loadReportEvents(range.from, range.to)

  if (!result.available) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-heading">דוחות כספיים</h1>
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {result.reason}
        </p>
      </div>
    )
  }

  // Days are gap-filled, months are not: a line drawn straight from the 3rd to
  // the 6th reads as three days of declining sales rather than three days of
  // none. A missing month is a different claim and is not invented.
  const buckets: PeriodTotals[] =
    range.granularity === 'day'
      ? fillDays(aggregate(result.events, 'day'), range.from, range.to)
      : aggregate(result.events, 'month')

  const totals = summarise(buckets)
  const obligations = supplierObligations(result.events)
  const openTotal = obligations.reduce((sum, row) => sum + row.openAgorot, 0)

  const points: SalesPoint[] = buckets.map((bucket) => ({
    key: bucket.period,
    label: periodLabel(bucket.period, range.granularity),
    grossIls: agorotToIls(agorot(bucket.grossAgorot)),
    commissionIls: agorotToIls(agorot(bucket.commissionAgorot)),
  }))

  const query = rangeQuery(range)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-heading">דוחות כספיים</h1>

        <nav
          aria-label="רזולוציית דיווח"
          className="flex gap-1 rounded-lg border border-gray-200 p-1"
        >
          {GRANULARITIES.map((option) => (
            <Link
              key={option.value}
              href={`/admin/reports?${rangeQuery(range, { granularity: option.value })}`}
              aria-current={option.value === range.granularity ? 'page' : undefined}
              className={
                option.value === range.granularity
                  ? 'rounded-md bg-brand-primary px-3 py-1.5 text-sm font-bold text-heading'
                  : 'rounded-md px-3 py-1.5 text-sm text-black/60 transition-colors hover:bg-black/[0.04]'
              }
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* A plain GET form: the range is in the URL, so a report can be linked to
          and bookmarked, and the CSV link carries the same parameters. */}
      <form
        method="get"
        action="/admin/reports"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"
      >
        <input type="hidden" name="granularity" value={range.granularity} />
        <label className="flex flex-col gap-1 text-xs text-black/60">
          מתאריך
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-heading"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-black/60">
          עד תאריך
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-heading"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-bold text-heading transition-colors hover:bg-brand-primary-hover"
        >
          הצג
        </button>
        <p className="text-xs text-black/50">הימים נספרים לפי שעון ישראל. הטווח מוגבל לשנה אחת.</p>
      </form>

      {result.truncated && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          הטווח הזה חרג ממכסת השורות, והמספרים חלקיים. צריך לצמצם את הטווח או להעביר את האגרגציה
          ל-SQL.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatsCard
          label="נגבה באתר"
          value={shortShekels(totals.grossAgorot)}
          icon={TrendingUp}
          variant="admin"
        />
        <StatsCard
          label="עמלות פלטפורמה"
          value={shortShekels(totals.commissionAgorot)}
          icon={Coins}
          variant="admin"
        />
        <StatsCard
          label="חלק הספקים"
          value={shortShekels(totals.supplierDueAgorot)}
          icon={HandCoins}
          variant="admin"
        />
        <StatsCard
          label="הוחזר ללקוחות"
          value={shortShekels(totals.refundedAgorot)}
          icon={RotateCcw}
          variant="admin"
        />
        <StatsCard
          label="הזמנות"
          value={totals.orders.toLocaleString('he-IL')}
          icon={Receipt}
          variant="admin"
        />
        <StatsCard
          label="התחייבות פתוחה לספקים"
          value={shortShekels(openTotal)}
          icon={HandCoins}
          variant="admin"
        />
      </div>

      <p className="text-sm text-black/50">
        ההחזרים נספרים בנפרד ואינם מקוזזים מהמכירות: יום עם מכירה אחת והחזר אחד אינו יום ללא פעילות.
      </p>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-heading">מכירות לאורך זמן</h2>
            <p className="mt-1 text-xs text-black/50">
              מה שנגבה באתר, ועמלת הפלטפורמה בקו לצידו. הטבלה שמתחת נושאת את אותם המספרים.
            </p>
          </div>
          <ExportLink href={`/api/admin/reports/sales?${query}`}>ייצוא CSV</ExportLink>
        </div>

        <div className="mt-4">
          <SalesChart points={points} />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">מכירות, עמלות והחזרים לפי תקופה</caption>
            <thead>
              <tr className="border-b border-gray-200 text-xs text-black/50">
                <th scope="col" className="py-2 text-start font-medium">
                  {range.granularity === 'month' ? 'חודש' : 'תאריך'}
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  נגבה באתר
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  עמלת פלטפורמה
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  חלק הספקים
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  הוחזר
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  הנחות
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  הזמנות
                </th>
              </tr>
            </thead>
            <tbody>
              {buckets.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-black/50">
                    אין תנועות בטווח הזה.
                  </td>
                </tr>
              )}
              {buckets.map((bucket) => (
                <tr key={bucket.period} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 text-black/70">
                    {periodLabel(bucket.period, range.granularity)}
                  </td>
                  <td className="py-2 font-medium text-heading">{shekels(bucket.grossAgorot)}</td>
                  <td className="py-2 text-black/70">{shekels(bucket.commissionAgorot)}</td>
                  <td className="py-2 text-black/70">{shekels(bucket.supplierDueAgorot)}</td>
                  <td className="py-2 text-black/70">{shekels(bucket.refundedAgorot)}</td>
                  <td className="py-2 text-black/70">{shekels(bucket.discountAgorot)}</td>
                  <td className="py-2 text-black/70">{bucket.orders.toLocaleString('he-IL')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-heading">התחייבות פתוחה לספקים</h2>
            <p className="mt-1 text-xs text-black/50">
              מה שנצבר לספק בטווח הזה, פחות מה שקוזז בהחזרים ופחות מה שכבר שולם. סכום שלילי אומר
              שהספק חייב לפלטפורמה.
            </p>
          </div>
          <ExportLink href={`/api/admin/reports/suppliers?${query}`}>ייצוא CSV</ExportLink>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <caption className="sr-only">התחייבות פתוחה לכל ספק</caption>
            <thead>
              <tr className="border-b border-gray-200 text-xs text-black/50">
                <th scope="col" className="py-2 text-start font-medium">
                  ספק
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  נצבר
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  קוזז בהחזרים
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  כבר שולם
                </th>
                <th scope="col" className="py-2 text-start font-medium">
                  התחייבות פתוחה
                </th>
              </tr>
            </thead>
            <tbody>
              {obligations.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-black/50">
                    אין תנועות לספקים בטווח הזה.
                  </td>
                </tr>
              )}
              {obligations.map((row) => (
                <tr key={row.supplierId} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 text-black/70">
                    <Link
                      href={`/admin/suppliers/${row.supplierId}`}
                      className="hover:text-heading hover:underline"
                    >
                      {row.supplierName ?? 'ללא שם'}
                    </Link>
                  </td>
                  <td className="py-2 text-black/70">{shekels(row.earnedAgorot)}</td>
                  <td className="py-2 text-black/70">{shekels(row.debitedAgorot)}</td>
                  <td className="py-2 text-black/70">{shekels(row.settledAgorot)}</td>
                  <td
                    className={
                      row.openAgorot < 0
                        ? 'py-2 font-medium text-price'
                        : 'py-2 font-medium text-heading'
                    }
                  >
                    {shekels(row.openAgorot)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
