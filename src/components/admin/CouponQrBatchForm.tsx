'use client'

import { type CouponQrActionState, generateCouponQrBatch } from '@/server/actions/admin/coupon-qr'
import { useActionState } from 'react'

const EMPTY: CouponQrActionState = { ok: false }

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm'

/**
 * Generates one printed QR batch for the campaign whose page it sits on.
 *
 * Deliberately small: value, limits and windows all live on the campaign, so
 * the only two questions a print run has are "for what" and "how many". The
 * download link appears in the batch list the action revalidates, not here:
 * the PDF is a GET to a route, and rendering it into the form would mean
 * holding the batch id in client state that the list already shows.
 */
export default function CouponQrBatchForm({ campaignId }: { campaignId: string }) {
  const [state, action, pending] = useActionState(generateCouponQrBatch, EMPTY)
  const err = state.fieldErrors ?? {}

  return (
    <form action={action} dir="rtl" className="space-y-4">
      <input type="hidden" name="campaign_id" value={campaignId} />

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.ok && (
        <output className="block rounded-lg bg-green-50 p-3 text-sm text-green-800">
          הקבוצה נוצרה. קובץ ה-PDF זמין להורדה ברשימה למטה.
        </output>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="qr-batch-label" className="block text-sm font-medium">
            תיאור הקבוצה
          </label>
          <input
            id="qr-batch-label"
            name="label"
            className={INPUT}
            placeholder="למשל: פליירים לשוק, ספטמבר"
            maxLength={80}
            required
            aria-describedby={err.label?.length ? 'qr-batch-label-error' : undefined}
          />
          {err.label?.map((e) => (
            <span
              key={e}
              id="qr-batch-label-error"
              role="alert"
              className="block text-xs text-red-700"
            >
              {e}
            </span>
          ))}
        </div>

        <div className="space-y-1">
          <label htmlFor="qr-batch-quantity" className="block text-sm font-medium">
            כמות קודים
          </label>
          <input
            id="qr-batch-quantity"
            name="quantity"
            type="number"
            min={1}
            max={1000}
            defaultValue={12}
            className={INPUT}
            required
            aria-describedby={
              err.quantity?.length ? 'qr-batch-quantity-error' : 'qr-batch-quantity-hint'
            }
          />
          <span id="qr-batch-quantity-hint" className="block text-xs text-gray-500">
            עד 1000. כל קוד הוא חד-פעמי, 12 קודים לעמוד A4.
          </span>
          {err.quantity?.map((e) => (
            <span
              key={e}
              id="qr-batch-quantity-error"
              role="alert"
              className="block text-xs text-red-700"
            >
              {e}
            </span>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'יוצר קודים...' : 'יצירת קבוצת QR'}
      </button>
    </form>
  )
}
