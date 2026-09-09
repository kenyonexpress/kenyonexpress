import StatsCard from '@/components/admin/StatsCard'
import BillingForms from '@/components/admin/billing/BillingForms'
import { requireSection } from '@/lib/admin/rbac'
import { checkBudget, formatMicro, perOrder, projectMonth } from '@/lib/costs/model'
import { PROVIDERS, providerAvailability } from '@/lib/costs/providers'
import { loadMonthCosts } from '@/server/queries/costs'
import { AlertTriangle, Coins, Receipt, TrendingUp } from 'lucide-react'

/**
 * What the platform pays, this month, and what one more order costs.
 *
 * THE HONEST HEADLINE OF THIS PAGE IS THAT NOTHING HERE IS FETCHED. Measured
 * 2026-09-09: not one billing credential exists in the environment -- no Vercel
 * token, no Supabase management token, no Upstash MANAGEMENT key (the REST
 * token that IS set grants access to the database, not the account), no
 * Cloudflare token. So the provider table below states, per provider, the exact
 * variable that would replace the manual entry. A cost dashboard that showed
 * typed figures without saying they were typed would invite its reader to trust
 * them as measurements.
 *
 * THE ONE EXCEPTION IS TWILIO, and it is exact rather than fetched: migration
 * 216 records the real per-message price from the delivery receipts, so SMS
 * spend is summed from our own table.
 *
 * TWO NUMBERS ARE DELIBERATELY NOT SHOWN AS ONE. `projectMonth` extrapolates
 * only the variable part -- extrapolating a subscription on day 3 says the
 * month will cost ten times the bill -- and `perOrder` returns the marginal
 * cost beside the total, refusing to call the total meaningful below thirty
 * orders. Production had FOUR when this was written: a monthly platform bill
 * divided by four is a large, precise number that says nothing about what an
 * order costs.
 */

export const metadata = { title: 'עלויות ותקציב' }

// Live money. A cached cost page shows an admin last week's spend under this
// month's heading.
export const dynamic = 'force-dynamic'

function israelToday(): Date {
  // The billing month is the operator's month, not UTC's. On the 1st of a month
  // at 01:00 Israel time, UTC is still the previous month, and every figure
  // would land on the month that just closed.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const [year, month, day] = parts.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

export default async function BillingPage() {
  await requireSection('payments')

  const today = israelToday()
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const monthKey = monthStart.toISOString().slice(0, 10)
  const daysInMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
  ).getUTCDate()

  const costs = await loadMonthCosts(monthStart)
  const availability = providerAvailability()

  // The measured SMS spend joins the ledger as a variable Twilio line rather
  // than being displayed beside it: it is real spend and belongs in the total.
  const lines = [
    ...costs.lines,
    ...(costs.smsMicro > 0
      ? [
          {
            provider: 'twilio',
            amountMicro: costs.smsMicro,
            currency: costs.currency,
            kind: 'variable' as const,
            source: 'api' as const,
          },
        ]
      : []),
  ]

  const projection = projectMonth(lines, {
    dayOfMonth: today.getUTCDate(),
    daysInMonth,
    currency: costs.currency,
  })
  const budget = checkBudget(projection.projectedMicro, costs.budgetMicro)
  const economics = perOrder(projection, costs.orders)

  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl text-heading">עלויות ותקציב</h1>
        <p className="mt-1 text-muted text-sm">
          חודש {monthKey.slice(0, 7)} · יום {today.getUTCDate()} מתוך {daysInMonth}
        </p>
      </div>

      {costs.missing.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <strong>מיגרציה 219 עדיין לא הוחלה.</strong> הטבלאות {costs.missing.join(', ')} אינן
          קיימות, ולכן אין מה להציג ואי אפשר לשמור. זה המצב הצפוי היום, לא תקלה.
        </div>
      )}

      {budget.breached && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div>
            <strong>התחזית חורגת מהתקציב.</strong> צפי{' '}
            {formatMicro(budget.projectedMicro, costs.currency)} מול תקציב{' '}
            {formatMicro(budget.budgetMicro, costs.currency)} ({budget.percentOfBudget}%). החריגה
            מחושבת על <b>התחזית</b> ולא על מה שכבר נגבה, כי התראה שמגיעה אחרי שהכסף יצא היא קבלה.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="נגבה עד כה"
          value={formatMicro(projection.spentMicro, costs.currency)}
          icon={Receipt}
        />
        <StatsCard
          label="צפי לסוף החודש"
          value={formatMicro(projection.projectedMicro, costs.currency)}
          icon={TrendingUp}
        />
        <StatsCard
          label="קבוע / משתנה"
          value={`${formatMicro(projection.fixedMicro, costs.currency)} / ${formatMicro(projection.variableMicro, costs.currency)}`}
          icon={Coins}
        />
        <StatsCard
          label="עלות שולית להזמנה"
          value={
            economics.orders > 0
              ? formatMicro(economics.marginalPerOrderMicro, costs.currency)
              : '—'
          }
          icon={Coins}
        />
      </div>

      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-bold text-heading text-lg">עלות להזמנה</h2>
        <p className="mt-2 text-muted text-sm leading-relaxed">
          {economics.orders} הזמנות שולמו החודש.{' '}
          <b>עלות שולית: {formatMicro(economics.marginalPerOrderMicro, costs.currency)}</b> — זה מה
          שעולה הזמנה אחת נוספת, והמספר הזה תקף בכל נפח.
        </p>
        {economics.isMeaningful ? (
          <p className="mt-2 text-muted text-sm">
            עלות כוללת להזמנה: {formatMicro(economics.totalPerOrderMicro, costs.currency)}.
          </p>
        ) : (
          <p className="mt-2 rounded-lg bg-gray-50 p-3 text-gray-700 text-sm leading-relaxed">
            <b>עלות כוללת להזמנה אינה מוצגת ככותרת בנפח הזה.</b> ב-{economics.orders} הזמנות היא
            מנוי חלקי במספר קטן: הזמנה אחת נוספת מזיזה אותה בעשרות אחוזים. היא תוצג מ-30 הזמנות
            בחודש ומעלה. (החישוב עצמו:{' '}
            {economics.orders > 0 ? formatMicro(economics.totalPerOrderMicro, costs.currency) : '—'}
            .)
          </p>
        )}
        {projection.mixedCurrency && (
          <p className="mt-2 text-amber-800 text-sm">
            שורות במטבע אחר הושמטו מהסכום. אין כאן שער חליפין, והמצאת אחד הייתה נותנת סכום שנראה
            מוסמך ושגוי בגובה תנועת השער.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-bold text-heading text-lg">מאיפה מגיעים המספרים</h2>
        <p className="mt-1 text-muted text-sm">
          אף ספק תשתית אינו נמשך אוטומטית היום. לכל שורה כתוב איזה משתנה סביבה היה מחליף את ההזנה
          הידנית.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-muted text-xs">
                <th className="p-2 text-start">ספק</th>
                <th className="p-2 text-start">סוג</th>
                <th className="p-2 text-start">מצב</th>
              </tr>
            </thead>
            <tbody>
              {availability.map((entry) => {
                const spec = PROVIDERS.find((p) => p.id === entry.id)
                return (
                  <tr key={entry.id} className="border-border/60 border-b last:border-0">
                    <td className="p-2 font-medium text-heading">{entry.label}</td>
                    <td className="p-2 text-muted">
                      {spec?.defaultKind === 'fixed' ? 'קבוע' : 'משתנה'}
                    </td>
                    <td className="p-2 text-muted" dir="ltr">
                      {entry.reason}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {costs.smsMessages > 0 && (
          <p className="mt-3 text-muted text-sm">
            SMS: {costs.smsMessages} הודעות בעלות מדודה של{' '}
            {formatMicro(costs.smsMicro, costs.currency)} החודש, מתוך קבלות המסירה עצמן.
          </p>
        )}
      </section>

      <BillingForms month={monthKey} currency={costs.currency} lines={costs.lines} />
    </div>
  )
}
