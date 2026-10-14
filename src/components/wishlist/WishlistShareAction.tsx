'use client'

import {
  LINK_COPIED,
  SHARE_TEXT,
  type ShareToolbarPlan,
  shareToolbarPlan,
} from '@/lib/wishlist/page-view'
import {
  type WishlistShareResult,
  type WishlistShareState,
  setWishlistShare,
} from '@/server/actions/wishlist'
import { Share2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

/**
 * The toolbar's "שיתוף הרשימה" (UX20): one press shares the link.
 *
 * Measured before: the only way to share was a card at the foot of the page,
 * and in production not even that: the card renders nothing while 248 is
 * unapplied (`wishlist_shares` is a 404 to anon REST on 14.10), so the page
 * had no share control at all. Now the button is always on the toolbar and
 * says what it can do: with a live link it opens the phone's share sheet, or
 * copies the link where there is none; with no link yet it mints one (or
 * switches the old one back on) and then shares it, in the same press; and
 * while the feature is not open it says so in a toast instead of hiding.
 *
 * The management of the link (the field, WhatsApp, rotate, switch off) stays
 * on the card below; this is the fast path over the same state, lifted to the
 * page so the two never disagree.
 */
export default function WishlistShareAction({
  share,
  onShareChange,
  className = 'wishlist-toolbar__button',
  setShare = setWishlistShare,
}: {
  share: WishlistShareState
  onShareChange: (next: WishlistShareState) => void
  className?: string
  /** The server action; a test passes its own. */
  setShare?: (command: 'enable') => Promise<WishlistShareResult>
}) {
  const [busy, setBusy] = useState(false)
  const unavailable = !share.available

  async function deliver(url: string) {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'רשימת המשאלות שלי', text: SHARE_TEXT, url })
        return
      } catch {
        // A dismissed sheet is not an error; fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success(LINK_COPIED)
    } catch {
      toast.info('הקישור מופיע בכרטיס "שיתוף הרשימה" למטה.')
    }
  }

  async function run() {
    if (busy) return
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    let plan: ShareToolbarPlan = shareToolbarPlan(share, origin)
    if (plan.kind === 'unavailable') {
      toast.info(plan.message)
      return
    }
    setBusy(true)
    try {
      if (plan.kind === 'enable') {
        const result = await setShare('enable')
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        onShareChange(result.share)
        plan = shareToolbarPlan(result.share, origin)
        if (plan.kind !== 'share') {
          toast.error('הפעולה נכשלה. נסה שוב.')
          return
        }
      }
      await deliver(plan.url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void run()}
      disabled={busy}
      aria-disabled={unavailable ? 'true' : undefined}
      title={unavailable ? 'שיתוף הרשימה עוד לא פתוח' : 'שיתוף הרשימה בקישור'}
      data-share={unavailable ? 'unavailable' : share.token && share.enabled ? 'live' : 'off'}
    >
      <Share2 size={16} aria-hidden="true" />
      {busy ? 'מכין קישור...' : 'שיתוף הרשימה'}
    </button>
  )
}
