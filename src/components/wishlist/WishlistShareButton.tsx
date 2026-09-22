'use client'

import { mintMyWishlistShareLink } from '@/server/actions/wishlist-share'
import { useState, useTransition } from 'react'

export default function WishlistShareButton() {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onShare() {
    setMessage(null)
    startTransition(async () => {
      const result = await mintMyWishlistShareLink()
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      try {
        await navigator.clipboard.writeText(result.url)
        setMessage('הקישור הועתק. מי שמקבל אותו רואה את הרשימה כפי שהיא עכשיו.')
      } catch {
        setMessage(result.url)
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onShare}
        disabled={pending}
        className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-heading hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? 'יוצר קישור…' : 'שיתוף הרשימה'}
      </button>
      {message ? (
        <output className="block text-sm text-muted" aria-live="polite">
          {message}
        </output>
      ) : null}
    </div>
  )
}
