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
export function CartOfflineNotice({
  className,
  queuedLines = 0,
}: {
  className: string
  /**
   * Lines with a write the server has not received yet (`queuedLines` in the
   * store). When non-zero the sentence names THAT instead: the shopper did
   * something, and what they need to know is that it is kept, not that the
   * prices are old.
   */
  queuedLines?: number
}) {
  return (
    <output className={className} data-cart-offline="" data-cart-queued={queuedLines || undefined}>
      <WifiOff size={16} aria-hidden="true" />
      <span>
        {queuedLines > 0
          ? 'שינויים בעגלה נשמרו במכשיר ויסונכרנו כשהחיבור יחזור. עד אז אי אפשר להמשיך לתשלום.'
          : 'העגלה מוצגת מהמכשיר. המחירים והמלאי יתעדכנו כשהחיבור יחזור.'}
      </span>
    </output>
  )
}
