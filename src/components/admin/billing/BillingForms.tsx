'use client'

import { type CostLine, formatMicro } from '@/lib/costs/model'
import { PROVIDERS } from '@/lib/costs/providers'
import { saveInfraBudget, saveInfraCost } from '@/server/actions/admin/costs'
import { useActionState } from 'react'

/**
 * The manual entry, which is the working path rather than a fallback.
 *
 * A client component only because it needs `useActionState` for the two
 * results; everything it decides is decided on the server.
 *
 * THE AMOUNT FIELD IS `inputMode="decimal"` AND `dir="ltr"`, both deliberate.
 * The page is RTL and a number typed into an RTL field with a decimal point
 * renders with the point in a position that reads as a different number, which
 * is the same bidi hazard the coupon codes and tracking numbers are isolated
 * for -- except here the operator is typing money into a ledger.
 */

const INITIAL = {} as { error?: string; success?: string }

export default function BillingForms({
  month,
  currency,
  lines,
}: {
  month: string
  currency: string
  lines: readonly CostLine[]
}) {
  const [costState, costAction, costPending] = useActionState(saveInfraCost, INITIAL)
  const [budgetState, budgetAction, budgetPending] = useActionState(saveInfraBudget, INITIAL)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-bold text-heading text-lg">הזנת עלות</h2>
        <p className="mt-1 text-muted text-sm">
          סכום מחשבונית או מלוח המחוונים של הספק. הזנה חוזרת לאותו ספק, חודש וסוג <b>מעדכנת</b> ולא
          מוסיפה שורה שנייה.
        </p>

        <form action={costAction} className="mt-4 space-y-3">
          <input type="hidden" name="month" value={month} />

          <label className="block">
            <span className="text-heading text-sm">ספק</span>
            <select name="provider" className="mt-1 w-full rounded-lg border border-border p-2">
              {PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-heading text-sm">סוג</span>
            <select name="kind" className="mt-1 w-full rounded-lg border border-border p-2">
              {/*
                The choice that decides whether the month-end projection is
                sane. A subscription filed as `variable` is extrapolated on day
                3 to ten times the bill.
              */}
              <option value="fixed">קבוע (מנוי חודשי)</option>
              <option value="variable">משתנה (לפי שימוש)</option>
            </select>
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="text-heading text-sm">סכום</span>
              <input
                name="amount"
                dir="ltr"
                inputMode="decimal"
                placeholder="20.00"
                required
                className="mt-1 w-full rounded-lg border border-border p-2 text-start"
              />
            </label>
            <label className="block">
              <span className="text-heading text-sm">מטבע</span>
              <input
                name="currency"
                dir="ltr"
                defaultValue={currency}
                maxLength={3}
                className="mt-1 w-full rounded-lg border border-border p-2 text-start uppercase"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-heading text-sm">הערה</span>
            <input
              name="note"
              className="mt-1 w-full rounded-lg border border-border p-2"
              placeholder="מאיפה נלקח המספר"
            />
          </label>

          <button
            type="submit"
            disabled={costPending}
            className="min-h-touch-min rounded-xl bg-brand-primary px-5 font-bold text-heading text-sm disabled:opacity-60"
          >
            {costPending ? 'שומר…' : 'שמירה'}
          </button>

          {costState.error && <p className="text-red-700 text-sm">{costState.error}</p>}
          {costState.success && <p className="text-green-700 text-sm">{costState.success}</p>}
        </form>

        {lines.length > 0 && (
          <ul className="mt-5 space-y-1 text-sm">
            {lines.map((line) => (
              <li
                key={`${line.provider}-${line.kind}`}
                className="flex items-center justify-between border-border/60 border-b py-1 last:border-0"
              >
                <span className="text-heading">
                  {PROVIDERS.find((p) => p.id === line.provider)?.label ?? line.provider}{' '}
                  <span className="text-muted text-xs">
                    ({line.kind === 'fixed' ? 'קבוע' : 'משתנה'},{' '}
                    {line.source === 'manual' ? 'הוזן ידנית' : 'נמשך'})
                  </span>
                </span>
                <span dir="ltr" className="text-heading">
                  {formatMicro(line.amountMicro, line.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="font-bold text-heading text-lg">תקציב החודש</h2>
        <p className="mt-1 text-muted text-sm">
          התראה נשלחת כשה<b>תחזית</b> חוצה את הסכום, לא כשהחיוב בפועל חוצה אותו. תקציב 0 פירושו שלא
          נקבע תקציב, ואז אין התראה כלל.
        </p>

        <form action={budgetAction} className="mt-4 space-y-3">
          <input type="hidden" name="month" value={month} />
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 block">
              <span className="text-heading text-sm">סכום</span>
              <input
                name="amount"
                dir="ltr"
                inputMode="decimal"
                placeholder="150.00"
                required
                className="mt-1 w-full rounded-lg border border-border p-2 text-start"
              />
            </label>
            <label className="block">
              <span className="text-heading text-sm">מטבע</span>
              <input
                name="currency"
                dir="ltr"
                defaultValue={currency}
                maxLength={3}
                className="mt-1 w-full rounded-lg border border-border p-2 text-start uppercase"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={budgetPending}
            className="min-h-touch-min rounded-xl bg-brand-primary px-5 font-bold text-heading text-sm disabled:opacity-60"
          >
            {budgetPending ? 'שומר…' : 'שמירת תקציב'}
          </button>

          {budgetState.error && <p className="text-red-700 text-sm">{budgetState.error}</p>}
          {budgetState.success && <p className="text-green-700 text-sm">{budgetState.success}</p>}
        </form>
      </section>
    </div>
  )
}
