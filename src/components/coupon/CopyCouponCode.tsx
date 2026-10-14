'use client'

import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** How long the button reads "הקוד הועתק" before it offers to copy again. */
export const COPIED_CONFIRMATION_MS = 2000

export type CopyState = 'idle' | 'copied' | 'failed'

const LABEL: Record<CopyState, string> = {
  idle: 'העתקת קוד',
  copied: 'הקוד הועתק',
  failed: 'העתיקו ידנית',
}

/**
 * The coupon code and the button that copies it, as one control (UX10).
 *
 * The code is ALWAYS visible, in a `<code>` of its own, and that is the
 * fallback: a clipboard the browser refuses (an insecure context, a denied
 * permission, Safari outside a user gesture) leaves the shopper with the
 * code on screen, selected, and a label that says to copy it by hand. The
 * share button on the product page swallows the same refusal silently, which
 * is right for a URL the address bar already shows and wrong for a code the
 * shopper has nowhere else.
 *
 * `dir="ltr"` on the code only: it is Latin letters and digits, and under the
 * card's RTL base direction a code like "SPA90" would otherwise render with
 * its digits and letters reordered. `home-rtl.spec.ts` allow-lists
 * `[data-coupon-code]` for exactly this.
 *
 * The confirmation reverts after `COPIED_CONFIRMATION_MS`, the timer is
 * cleared on unmount, and the label is a polite live region so a screen
 * reader hears the outcome without the button losing focus.
 */
export default function CopyCouponCode({ code, className }: { code: string; className?: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const codeRef = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const selectCode = () => {
    const el = codeRef.current
    const selection = window.getSelection?.()
    if (!el || !selection) return
    const range = document.createRange()
    range.selectNodeContents(el)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const handleClick = async () => {
    let ok = false
    try {
      await navigator.clipboard.writeText(code)
      ok = true
    } catch {
      ok = false
    }
    if (!ok) selectCode()
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), COPIED_CONFIRMATION_MS)
  }

  const Icon = state === 'copied' ? Check : Copy

  return (
    <button
      type="button"
      onClick={handleClick}
      data-copy-code
      data-state={state}
      className={className ? `coupon-ticket__copy ${className}` : 'coupon-ticket__copy'}
    >
      <code ref={codeRef} data-coupon-code dir="ltr" className="coupon-ticket__code">
        {code}
      </code>
      <span className="coupon-ticket__copy-label" aria-live="polite">
        <Icon size={14} aria-hidden="true" />
        {LABEL[state]}
      </span>
    </button>
  )
}
