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
/** The message the framed return page sends the checkout that owns the frame. */
export const FRAME_RETURN_MESSAGE = 'ke:payment-frame-return'

export default function FrameReturnBreakout({ target }: { target: string }) {
  useEffect(() => {
    const url = new URL(target, window.location.origin).toString()
    const top = window.top
    if (top && top !== window.self) {
      // THE PARENT MOVES ITSELF. The checkout's iframe is sandboxed without
      // allow-top-navigation (pci-scope.test.ts pins that), so
      // `top.location.replace` from here is refused, the catch below used to
      // navigate only this frame, and the paying customer was left on a
      // checkout with the confirmation rendered inside the payment box
      // (measured 2026-11-02, C142). The checkout listens for this message
      // and replaces its own tab. Same origin only, both ways.
      top.postMessage({ type: FRAME_RETURN_MESSAGE, url }, window.location.origin)
      return
    }
    window.location.replace(url)
  }, [target])

  return null
}
