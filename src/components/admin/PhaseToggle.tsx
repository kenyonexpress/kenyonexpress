'use client'

import { type PhaseActionState, setProductPhase } from '@/server/actions/admin/phases'
import { useActionState } from 'react'

/**
 * One product type's switch.
 *
 * THE CONFIRMATION IS THE COUNT, not a dialog. `activeCount` is how many active
 * products this switch would hide, and it is in the button's own label: an
 * operator turning `physical` off on this database is turning off 44 of 44
 * products, and a generic "are you sure?" would not have told them that.
 */

const INITIAL: PhaseActionState = null

export default function PhaseToggle({
  productType,
  enabled,
  activeCount,
}: {
  productType: string
  enabled: boolean
  activeCount: number
}) {
  const [state, action, pending] = useActionState(setProductPhase, INITIAL)
  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="productType" value={productType} />
      <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
      >
        {enabled
          ? activeCount > 0
            ? `הסרה ממכירה (יסתיר ${activeCount} מוצרים)`
            : 'הסרה ממכירה'
          : 'הפעלה למכירה'}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
      {success && <span className="text-xs text-green-700">{success}</span>}
    </form>
  )
}
