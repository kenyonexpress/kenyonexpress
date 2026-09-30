'use client'

import { WifiOff } from 'lucide-react'

/**
 * The one sentence every cart surface shows while the cart on screen came
 * from the device rather than the server (`fallbackActive` in the store).
 *
 * `role="status"`: it appears in response to a failed request, not to
 * anything the shopper did, so it is announced without stealing focus. The
 * copy names the two things a stale snapshot cannot vouch for, price and
 * stock, and does not say "offline": the request can fail with the network
 * up, and the sentence is true either way.
 */
export function CartOfflineNotice({ className }: { className: string }) {
  return (
    <output className={className} data-cart-offline="">
      <WifiOff size={16} aria-hidden="true" />
      <span>העגלה מוצגת מהמכשיר. המחירים והמלאי יתעדכנו כשהחיבור יחזור.</span>
    </output>
  )
}
