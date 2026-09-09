'use client'

import { type WaitlistState, joinWaitlist } from '@/server/actions/waitlist'
import { useActionState } from 'react'

/**
 * The only thing a sold-out page can still offer.
 *
 * WHY IT IS COLLAPSED UNTIL ASKED FOR. A sold-out page already has bad news on
 * it. An email field sitting open under that news reads as a second demand, and
 * the shopper who was going to leave leaves slightly more annoyed. One link
 * opens one field.
 *
 * WHY THE ANSWER IS ALWAYS THE SAME SENTENCE. The action returns one message
 * for "added", "already on the list" and "we could not write it", so this
 * renders whatever it is handed. Telling the two apart would let anyone use
 * this box to ask whether a given address is watching a given product.
 *
 * RTL: `dir="ltr"` on the input, and only on the input. An email address is
 * always Latin, so the field is LTR while the form around it stays RTL. This
 * started as `dir="auto"` on the reasoning that it would flip per value; the
 * repository's own gate (`latin-field-direction.test.ts`) refused it, and the
 * gate is right -- `auto` decides from the FIRST strong character, so an empty
 * field and a Hebrew placeholder both render the caret on the wrong side until
 * something is typed.
 */

const INITIAL: WaitlistState = { ok: false }

export default function WaitlistButton({
  productId,
  variantId,
}: {
  productId: string
  variantId?: string | null
}) {
  const [state, formAction, pending] = useActionState(joinWaitlist, INITIAL)

  if (state.ok && state.message) {
    return (
      // `<output>` rather than a `<p role="status">`. Both announce, and the
      // element carries the role natively -- which is what the a11y gate here
      // asks for, on the reasoning that a role attribute can drift away from
      // the element under it and a tag cannot.
      <output className="block rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        {state.message}
      </output>
    )
  }

  return (
    <details className="rounded-lg border border-black/10 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-heading">
        עדכנו אותי כשהמוצר חוזר למלאי
      </summary>

      <form action={formAction} className="mt-2 flex flex-wrap items-start gap-2">
        <input type="hidden" name="product_id" value={productId} />
        {variantId && <input type="hidden" name="variant_id" value={variantId} />}

        <label className="sr-only" htmlFor="waitlist-email">
          כתובת מייל
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          dir="ltr"
          autoComplete="email"
          placeholder="כתובת המייל שלכם"
          // 44px, the touch-target floor the rest of the storefront is held to.
          className="h-11 min-w-0 flex-1 rounded-lg border border-black/15 px-3 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-lg bg-brand-primary px-4 text-sm font-bold text-brand-dark disabled:opacity-60"
        >
          {pending ? 'שולח…' : 'עדכנו אותי'}
        </button>

        {state.error && (
          <p className="w-full text-sm text-red-600" role="alert">
            {state.error}
          </p>
        )}
      </form>
    </details>
  )
}
