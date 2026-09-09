'use client'

import { type FlashDealState, scheduleFlashDeal } from '@/server/actions/admin/flash-deals'
import { useActionState } from 'react'

const INITIAL: FlashDealState = { ok: false }

/**
 * Scheduling one price change.
 *
 * `datetime-local` and not two fields. A time typed into a text box is a time
 * somebody typed wrong, and the browser's picker is already localised to the
 * operator's zone — which for an Israeli operator is the zone the deal will run
 * in.
 *
 * THE "BEFORE" PRICE IS OPTIONAL AND THE LABEL SAYS WHAT LEAVING IT DOES.
 * Blank means the existing struck-through price is untouched, which is what
 * somebody scheduling a plain change wants; filling it is what somebody ending
 * a flash deal wants, because restoring only the price would leave the pair
 * inconsistent until a human noticed.
 *
 * There is no client-side "must be in the future" check beyond the input's own
 * `min`. The action refuses a past time and says why, and a second copy of that
 * rule here would be a second answer the first time either changed.
 */
export default function FlashDealForm({
  products,
}: {
  products: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState(scheduleFlashDeal, INITIAL)

  return (
    <form action={formAction} className="rounded-xl border border-black/10 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          מוצר
          <select name="product_id" required className="mt-1 h-11 w-full rounded-lg border px-2">
            <option value="">בחרו מוצר</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          מועד
          <input
            type="datetime-local"
            name="effective_at"
            required
            dir="ltr"
            className="mt-1 h-11 w-full rounded-lg border px-2"
          />
        </label>

        <label className="text-sm">
          מחיר חדש (₪)
          <input
            type="number"
            name="price_ils"
            required
            min="0.01"
            step="0.01"
            dir="ltr"
            className="mt-1 h-11 w-full rounded-lg border px-2"
          />
        </label>

        <label className="text-sm">
          מחיר לפני הנחה (₪) — ריק משאיר כמו שהוא
          <input
            type="number"
            name="reference_ils"
            min="0.01"
            step="0.01"
            dir="ltr"
            className="mt-1 h-11 w-full rounded-lg border px-2"
          />
        </label>

        <label className="text-sm sm:col-span-2">
          הערה
          <input
            type="text"
            name="note"
            maxLength={200}
            className="mt-1 h-11 w-full rounded-lg border px-2"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-primary px-4 text-sm font-bold text-brand-dark disabled:opacity-60"
        >
          {pending ? 'שומר…' : 'תזמון'}
        </button>
        {state.message && <span className="text-sm text-emerald-700">{state.message}</span>}
        {state.error && (
          <span className="text-sm text-red-600" role="alert">
            {state.error}
          </span>
        )}
      </div>
    </form>
  )
}
