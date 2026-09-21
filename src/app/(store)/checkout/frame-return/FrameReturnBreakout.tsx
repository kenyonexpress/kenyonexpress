'use client'

import { paymentReturnMessage } from '@/lib/checkout/frame-return-message'
import { useEffect } from 'react'

/**
 * Moves the shopper from the payment frame to the confirmation.
 *
 * Framed, this page cannot move the tab itself: the checkout's iframe sandbox
 * withholds `allow-top-navigation` on purpose (src/lib/checkout/
 * frame-return-message.ts has the measurement that found this out the hard
 * way). So it posts the target to the parent, same origin only, and the
 * checkout page navigates itself.
 *
 * Unframed, the tab IS the page: a shopper opening the URL directly, a provider
 * that returned to the top window, or the same page with the sandbox lifted.
 * Then `replace` on our own location is the whole job. `replace`, not
 * `assign`: the entry being replaced is /checkout, and a back button that
 * returns to a checkout for an order that has already been paid is an
 * invitation to pay twice.
 */
export default function FrameReturnBreakout({ target }: { target: string }) {
  useEffect(() => {
    const url = new URL(target, window.location.origin).toString()
    const framed = window.parent !== window
    if (framed) {
      window.parent.postMessage(paymentReturnMessage(target), window.location.origin)
      return
    }
    window.location.replace(url)
  }, [target])
  return null
}
