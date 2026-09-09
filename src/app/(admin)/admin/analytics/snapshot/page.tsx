import StatsCard from '@/components/admin/StatsCard'
import BarSeries, { type BarPoint } from '@/components/admin/analytics/BarSeries'
import CohortGrid from '@/components/admin/analytics/CohortGrid'
import RefreshReportsButton from '@/components/admin/analytics/RefreshReportsButton'
import { requireAdminPage } from '@/lib/admin/rbac'
import { buildCohortGrid } from '@/lib/analytics/cohorts'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { shekels, shekelsFromIls, shekelsFromIlsRounded } from '@/lib/money-format'
import { todayInIsrael } from '@/server/domain/reports/settlement-report'
import {
  type AdminReportResult,
  type ReportWindowDays,
  getCohortRetention,
  getOrdersDaily,
  getRevenueDaily,
  getTopProducts,
} from '@/server/queries/admin-reports'
import { Coins, Receipt, ShoppingCart, Users } from 'lucide-react'
import Link from 'next/link'

/**
 * The nightly snapshot dashboard: what migration 170 was built to feed.
 *
 * 170 shipped the tables, the pg_cron rebuild, the admin-only RPCs, four typed
 * readers in `server/queries/admin-reports.ts` and a manual refresh action -
 * all of it applied to production on 2026-09-04, all of it unit-tested, and
 * NOT ONE LINE OF IT ON A SCREEN. Measured 2026-09-10: zero files imported
 * `admin-reports`, zero imported `actions/admin/reports`. The tables have been
 * rebuilt every night at 01:30 UTC since and nobody has ever seen a row. This
 * page is the consumer.
 *
 * HOW IT DIFFERS FROM /admin/analytics, which an operator will otherwise read
 * as a second opinion on the same question and be alarmed when the two
 * disagree. They are measuring different things on purpose:
 *
 *   REFUNDS AND CANCELLATIONS. `loadSalesLines` (the live page) filters on
 *   `paid_at is not null` and `deleted_at is null` and NOTHING ELSE - an order
 *   that was paid and later refunded still counts in its GMV. 170 restricts
 *   revenue to status in (paid, partially_fulfilled, fulfilled,
 *   platform_settled). So the live page is "what was ever charged" and this
 *   one is "what is still ours".
 *
 *   TRUNCATION. The live page aggregates in TypeScript over at most 20,000
 *   order_items rows and says so when it hits the cap. These tables are
 *   aggregated in SQL over everything and have no cap.
 *
 *   STALENESS. Live is now. This is the 01:30 rebuild, up to a day old, and
 *   every panel prints the timestamp it came from.
 *
 * DEFAULT WINDOW IS 90 AND NOT 30. Not to make the numbers look better: the
 * live page already owns the 30-day view, cohorts are monthly and unreadable
 * at four weeks, and the reason this screen exists is the long shape.
 */

export const metadata = { title: 'דוחות לילה' }

const WINDOWS = [
  { value: 90, label: '90 יום' },
  { value: 30, label: '30 יום' },
  { value: 7, label: '7 ימים' },
] as const satisfies ReadonlyArray<{ value: ReportWindowDays; label: string }>

function resolveWindow(raw: string | undefined): ReportWindowDays {
  const parsed = Number(raw)
  const match = WINDOWS.find((w) => w.value === parsed)
  return match ? match.value : 90
}

/** `to` is today in Israel; `from` is `days - 1` days before it, inclusive. */
function windowRange(days: number, today: string): { from: string; to: string } {
  const [year, month, day] = today.split('-')
  const start = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - (days - 1)))
  return { from: start.toISOString().slice(0, 10), to: today }
}

const dayLabel = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' })
const stampLabel = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  dateStyle: 'short',
  timeStyle: 'short',
})

function formatDay(day: string): string {
  const [year, month, date] = day.split('-')
  return dayLabel.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(date), 12)))
}

/**
 * The rebuild these rows came from, in Israel time.
 *
 * Printed on every panel rather than once at the top, because the four tables
 * are rebuilt in one transaction today but nothing forces that to stay true,
 * and a single header timestamp would quietly start lying the day it stops.
 */
function stamp(refreshedAt: string | null | undefined): string | null {
  if (!refreshedAt) return null
  const parsed = new Date(refreshedAt)
  return Number.isNaN(parsed.getTime()) ? null : stampLabel.format(parsed)
}

function Stale({ refreshedAt }: { refreshedAt: string | null | undefined }) {
  const at = stamp(refreshedAt)
  if (!at) return null
  return <p className="mt-1 text-xs text-black/40">נבנה לאחרונה: {at}</p>
}

/** One shared shape for "the reports are not installed" and "the read failed". */
function Unavailable({ reason }: { reason: string }) {
  return (
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {reason}
    </p>
  )
}

function rowsOf<T>(result: AdminReportResult<T>): T[] {
  return result.available ? result.rows : []
}

export default async function ReportSnapshotPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  await requireAdminPage()

  const { window: rawWindow } = await searchParams
  const windowDays = resolveWindow(rawWindow)
  const { from, to } = windowRange(windowDays, todayInIsrael())

  const [revenue, orders, top, cohort] = await Promise.all([
    getRevenueDaily(from, to),
    getOrdersDaily(from, to),
    getTopProducts(windowDays),
    getCohortRetention(),
  ])

  const revenueRows = rowsOf(revenue)
  const orderRows = rowsOf(orders)
  const topRows = rowsOf(top)

  const grossAgorot = revenueRows.reduce((sum, row) => sum + row.grossAgorot, 0)
  const netAgorot = revenueRows.reduce((sum, row) => sum + row.netAgorot, 0)
  const ordersCount = revenueRows.reduce((sum, row) => sum + row.ordersCount, 0)

  const grid = buildCohortGrid(rowsOf(cohort))
  const returning = grid.rows.reduce((sum, row) => {
    const first = row.cells[1]
    return sum + (first?.kind === 'value' ? first.activeUsers : 0)
  }, 0)

  const points: BarPoint[] = revenueRows.map((row) => ({
    key: row.day,
    label: formatDay(row.day),
    value: agorotToIls(agorot(row.netAgorot)),
    secondary: row.ordersCount,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-heading">דוחות לילה</h1>
          <p className="mt-1 text-sm text-black/50">
            צילום מצב שנבנה מחדש כל לילה ב-01:30 ‏UTC. אין בו תקרת שורות, והוא מחריג הזמנות שבוטלו
            והוחזרו.{' '}
            <Link href="/admin/analytics" className="underline hover:text-heading">
              האנליטיקה החיה
            </Link>{' '}
            מודדת אחרת בכוונה: היא סופרת כל הזמנה שאי פעם שולמה, גם אם הוחזרה אחר כך.
          </p>
        </div>

        <nav aria-label="חלון דיווח" className="flex gap-1 rounded-lg border border-gray-200 p-1">
          {WINDOWS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/analytics/snapshot?window=${option.value}`}
              aria-current={option.value === windowDays ? 'page' : undefined}
              className={
                option.value === windowDays
                  ? 'rounded-md bg-brand-primary px-3 py-1.5 text-sm font-bold text-heading'
                  : 'rounded-md px-3 py-1.5 text-sm text-black/60 transition-colors hover:bg-black/[0.04]'
              }
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      <RefreshReportsButton />

      {!revenue.available && <Unavailable reason={revenue.reason} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="נגבה (ברוטו)"
          value={shekelsFromIlsRounded(agorotToIls(agorot(grossAgorot)))}
          icon={Coins}
          variant="admin"
        />
        <StatsCard
          label="נטו לאחר הנחות וקאשבק"
          value={shekelsFromIlsRounded(agorotToIls(agorot(netAgorot)))}
          icon={Receipt}
          variant="admin"
        />
        <StatsCard
          label="הזמנות משולמות"
          value={ordersCount.toLocaleString('he-IL')}
          icon={ShoppingCart}
          variant="admin"
        />
        <StatsCard
          label="לקוחות שחזרו בחודש שאחרי"
          value={returning.toLocaleString('he-IL')}
          icon={Users}
          variant="admin"
        />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-bold text-heading">לקוחות חוזרים לפי חודש הצטרפות</h2>
        <p className="mt-1 text-xs text-black/50">
          כל שורה היא הלקוחות שרכשו לראשונה באותו חודש. התא אומר איזה חלק מהם רכש שוב כעבור ‏X
          חודשים. מקף פירושו שהחודש עוד לא הגיע, בניגוד ל-0% שפירושו שאיש לא חזר.
        </p>
        {cohort.available ? (
          <div className="mt-4">
            <CohortGrid grid={grid} />
            <Stale refreshedAt={grid.refreshedAt} />
          </div>
        ) : (
          <div className="mt-3">
            <Unavailable reason={cohort.reason} />
          </div>
        )}
      </section>

      <BarSeries
        title="הכנסות נטו ליום"
        caption={`${windowDays} הימים האחרונים, לפי ימי ישראל של מועד התשלום. מספר ההזמנות בטור לצידו.`}
        points={points}
        valueLabel="נטו"
        secondaryLabel="הזמנות"
        formatValue={shekelsFromIls}
        formatSecondary={(value) => value.toLocaleString('he-IL')}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">תנועת הזמנות</h2>
          <p className="mt-1 text-xs text-black/50">
            לפי יום היצירה ולא יום התשלום, וכולל את מה שדוח ההכנסות מחריג: זה הדוח שבו הזמנה שבוטלה
            נראית.
          </p>
          {orders.available ? (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <caption className="sr-only">הזמנות לפי יום ולפי סטטוס</caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-black/50">
                      <th scope="col" className="py-2 text-start font-medium">
                        תאריך
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        סה"כ
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        ממתינות
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        שולמו
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        בוטלו
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        הוחזרו
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-3 text-black/50">
                          אין הזמנות בטווח הזה.
                        </td>
                      </tr>
                    )}
                    {orderRows.map((row) => (
                      <tr key={row.day} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 text-black/70">{formatDay(row.day)}</td>
                        <td className="py-2 font-medium text-heading">
                          {row.totalOrders.toLocaleString('he-IL')}
                        </td>
                        <td className="py-2 text-black/70">
                          {row.pendingCount.toLocaleString('he-IL')}
                        </td>
                        <td className="py-2 text-black/70">
                          {row.paidCount.toLocaleString('he-IL')}
                        </td>
                        <td className="py-2 text-black/70">
                          {row.cancelledCount.toLocaleString('he-IL')}
                        </td>
                        <td className="py-2 text-black/70">
                          {row.refundedCount.toLocaleString('he-IL')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Stale refreshedAt={orderRows[0]?.refreshedAt} />
            </>
          ) : (
            <div className="mt-3">
              <Unavailable reason={orders.reason} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-bold text-heading">מוצרים מובילים</h2>
          <p className="mt-1 text-xs text-black/50">
            לפי הכנסה מהשורה, בחלון של {windowDays} הימים האחרונים. שורה שבוטלה או הוחזרה בתוך הזמנה
            משולמת אינה נספרת.
          </p>
          {top.available ? (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <caption className="sr-only">מוצרים מובילים לפי הכנסה בחלון הנבחר</caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-xs text-black/50">
                      <th scope="col" className="py-2 text-start font-medium">
                        #
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        מוצר
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        יחידות
                      </th>
                      <th scope="col" className="py-2 text-start font-medium">
                        הכנסה
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-3 text-black/50">
                          אין מכירות בחלון הזה. הצילום שומר שורות רק לחלון שהיו בו מכירות, ולכן חלון
                          ריק כאן אינו תקלה.
                        </td>
                      </tr>
                    )}
                    {topRows.map((row) => (
                      <tr key={row.rank} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 text-black/50">{row.rank}</td>
                        <td className="py-2 text-black/70">
                          <Link
                            href={`/admin/products/${row.productId}`}
                            className="hover:text-heading hover:underline"
                          >
                            {row.productNameHe ?? 'ללא שם'}
                          </Link>
                        </td>
                        <td className="py-2 text-black/70">
                          {row.unitsSold.toLocaleString('he-IL')}
                        </td>
                        <td className="py-2 font-medium text-heading">
                          {shekels(agorot(row.revenueAgorot))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Stale refreshedAt={topRows[0]?.refreshedAt} />
            </>
          ) : (
            <div className="mt-3">
              <Unavailable reason={top.reason} />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
