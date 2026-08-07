'use client'

import { useEffect } from 'react'

/**
 * Moves the top window to the confirmation and lets the payment iframe die
 * with the checkout that owned it.
 *
 * `replace`, not `assign`: the entry being replaced is /checkout, and a back
 * button that returns to a checkout for an order that has already been paid is
 * an invitation to pay twice.
 *
 * When this page is somehow not framed — a shopper opening the URL directly,
 * or a provider that returned to the top window — the same call is still
 * correct: window.top is window.self, and the tab navigates to the
 * confirmation, which is where they were going.
 */
export default function FrameReturnBreakout({ target }: { target: string }) {
  useEffect(() => {
    const url = new URL(target, window.location.origin).toString()
    try {
      // Cross-origin parents throw on access. frame-ancestors only permits our
      // own origin, so this cannot happen — but reading window.top must not be
      // what strands a paying customer if that ever stops being true.
      const top = window.top ?? window.self
      top.location.replace(url)
    } catch {
      window.location.replace(url)
    }
  }, [target])

  return null
}
