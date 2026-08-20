'use client'

import { joinWaitlist } from '@/app/(store)/product/waitlist'
import { Bell, Check } from 'lucide-react'
import { useActionState } from 'react'

/**
 * The address box under a sold-out product.
 *
 * WHAT THE SHOPPER IS AGREEING TO is written next to the field and matches
 * exactly what the table can deliver: one message, about this product, when it
 * comes back. `product_waitlist.notified_at` is what spends that consent, and
 * there is no second use for the row afterwards. It is not a newsletter
 * signup, and the copy never implies it is -- the newsletter has its own list
 * and its own double opt-in.
 *
 * The reply is the same sentence whether the address was new, already on the
 * list, or suppressed. See `waitlist.ts`: anything more specific answers "is
 * this person a customer here" for anyone who can type into the box.
 */
export default function WaitlistForm({
  productId,
  className = '',
}: {
  productId: string
  className?: string
}) {
  const [state, formAction, pending] = useActionState(joinWaitlist, { ok: false })

  if (state.ok && state.message) {
    return (
      <output
        // `<output>` carries role="status" implicitly, so the replacement is
        // announced: the field it replaced is where the focus was.
        className={`inline-flex items-center gap-2 rounded-lg bg-surface-hover px-3 py-2 text-sm font-medium text-heading ${className}`}
      >
        <Check size={16} aria-hidden="true" className="text-whatsapp" />
        {state.message}
      </output>
    )
  }

  return (
    <form action={formAction} className={`w-full max-w-sm ${className}`}>
      <input type="hidden" name="productId" value={productId} />

      <label
        htmlFor="waitlist-email"
        className="flex items-center gap-2 text-sm font-bold text-heading"
      >
        <Bell size={16} aria-hidden="true" />
        להודיע לי כשחוזר למלאי
      </label>

      <div className="mt-2 flex gap-2">
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="כתובת המייל שלך"
          // Latin-only content in an RTL page: the address itself reads
          // left-to-right, the label above it does not.
          dir="ltr"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border px-3 text-start text-base text-heading placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fed700]"
          aria-describedby="waitlist-consent"
        />
        <button
          type="submit"
          disabled={pending}
          // 44px, the site-wide minimum touch target.
          className="h-11 shrink-0 rounded-lg bg-[#fed700] px-4 text-sm font-bold text-brand-dark disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted"
        >
          {pending ? 'שולח...' : 'עדכנו אותי'}
        </button>
      </div>

      <p id="waitlist-consent" className="mt-2 text-xs text-muted">
        נשלח הודעה אחת בלבד, על המוצר הזה, כשהוא יחזור למלאי. אין בכך הרשמה לדיוור.
      </p>

      {state.error && (
        <p role="alert" className="mt-2 text-sm font-medium text-[#e4002b]">
          {state.error}
        </p>
      )}
    </form>
  )
}
