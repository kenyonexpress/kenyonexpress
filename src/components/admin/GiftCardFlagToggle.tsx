'use client'

import {
  type GiftCardFlagState,
  setProductGiftCard,
} from '@/server/actions/admin/product-gift-card'
import { useActionState } from 'react'

/**
 * The gift-card switch on the product edit page.
 *
 * Separate from the product form above it on purpose: this is not a field of
 * the product, it is a decision about how the product's money is handled, and
 * it is saved by its own action with its own check
 * (`server/actions/admin/product-gift-card.ts`). The refusal, when the product
 * is not set up to be a gift card, is printed here in full: it says what to
 * change.
 */
export default function GiftCardFlagToggle({
  productId,
  enabled,
}: {
  productId: string
  enabled: boolean
}) {
  const [state, action, pending] = useActionState<GiftCardFlagState, FormData>(
    setProductGiftCard,
    null,
  )
  const current = state?.ok && state.enabled !== undefined ? state.enabled : enabled

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4" dir="rtl">
      <h2 className="text-sm font-bold text-gray-900">גיפט קארד</h2>
      <p className="mt-1 text-sm text-gray-600">
        {current
          ? 'המוצר נמכר כגיפט קארד: אחרי התשלום נשלח לקונה קוד, והקוד נטען לארנק במלוא ערכו.'
          : 'המוצר נמכר כמוצר רגיל. סימון כגיפט קארד אפשרי רק למוצר בלי ספק, באחוז פלטפורמה 100, שנמכר בערכו המלא.'}
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="product_id" value={productId} />
        <input type="hidden" name="enable" value={current ? 'false' : 'true'} />
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-900 disabled:opacity-60"
        >
          {pending ? 'שומר...' : current ? 'ביטול הסימון כגיפט קארד' : 'סימון כגיפט קארד'}
        </button>
        <output aria-live="polite" className="text-sm">
          {state && !state.ok && <span className="text-red-700">{state.error}</span>}
          {state?.ok && <span className="text-green-700">נשמר.</span>}
        </output>
      </form>
    </section>
  )
}
