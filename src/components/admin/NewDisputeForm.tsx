'use client'

import { type FraudActionState, openDispute } from '@/server/actions/admin/fraud'
import { useActionState, useId, useState } from 'react'

const EMPTY: FraudActionState = null

/**
 * Entering a dispute that arrived by email or phone.
 *
 * `respond_by` HAS NO DEFAULT AND IS REQUIRED, which is the one design decision
 * in this form. Every acquirer states a different window and guessing one would
 * produce a deadline that looks authoritative and is invented - the single most
 * expensive kind of wrong value on this page, because the operator would trust
 * it and answer late.
 */
export default function NewDisputeForm() {
  const [state, action, pending] = useActionState(openDispute, EMPTY)
  const [open, setOpen] = useState(false)
  const baseId = useId()

  if (!open) {
    return (
      <p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold"
        >
          רישום תיק חדש
        </button>
      </p>
    )
  }

  const field = 'min-h-11 w-full rounded-lg border px-3 py-2 text-sm'

  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${baseId}-order`} className="mb-1 block text-sm font-medium">
          מזהה הזמנה
        </label>
        <input id={`${baseId}-order`} name="order_id" required className={field} />
      </div>

      <div>
        <label htmlFor={`${baseId}-ref`} className="mb-1 block text-sm font-medium">
          מספר תיק אצל הסולק
        </label>
        <input
          id={`${baseId}-ref`}
          name="provider_ref"
          required
          maxLength={120}
          className={field}
        />
      </div>

      <div>
        <label htmlFor={`${baseId}-kind`} className="mb-1 block text-sm font-medium">
          סוג
        </label>
        <select id={`${baseId}-kind`} name="kind" className={field} defaultValue="chargeback">
          <option value="chargeback">הכחשת עסקה</option>
          <option value="retrieval">בקשת מסמכים</option>
          <option value="pre_arbitration">טרום בוררות</option>
          <option value="inquiry">בירור</option>
        </select>
      </div>

      <div>
        <label htmlFor={`${baseId}-amount`} className="mb-1 block text-sm font-medium">
          סכום במחלוקת (₪)
        </label>
        <input
          id={`${baseId}-amount`}
          name="amount_ils"
          type="number"
          min="0"
          step="0.01"
          required
          className={field}
        />
      </div>

      <div>
        <label htmlFor={`${baseId}-by`} className="mb-1 block text-sm font-medium">
          יש להשיב עד
        </label>
        <input id={`${baseId}-by`} name="respond_by" type="date" required className={field} />
      </div>

      <div>
        <label htmlFor={`${baseId}-reason`} className="mb-1 block text-sm font-medium">
          קוד סיבה מהסולק (רשות)
        </label>
        <input id={`${baseId}-reason`} name="reason_code" maxLength={60} className={field} />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={`${baseId}-notes`} className="mb-1 block text-sm font-medium">
          הערות
        </label>
        <textarea id={`${baseId}-notes`} name="notes" rows={3} maxLength={4000} className={field} />
      </div>

      {state && 'error' in state && (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <output className="text-sm text-green-700 sm:col-span-2">{state.success}</output>
      )}

      <p className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? 'שומר...' : 'פתיחת תיק'}
        </button>{' '}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-lg border px-4 py-2 text-sm"
        >
          ביטול
        </button>
      </p>
    </form>
  )
}
