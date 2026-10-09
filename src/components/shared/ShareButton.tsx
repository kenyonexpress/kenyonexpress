'use client'

import { Check, Link2, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'

type Props = {
  /** Page title for the share sheet. */
  title: string
  /** One line of body text; the URL is appended by the sheet itself. */
  text: string
  className?: string
}

/**
 * The phone's own share sheet, or the clipboard where there is none.
 *
 * WhatsApp and Facebook have their own buttons beside this one because they
 * are where Israeli shoppers actually forward deals; this covers everything
 * else (SMS, Telegram, mail, AirDrop) without a button per channel. On a
 * desktop browser without `navigator.share` it copies the URL and says so,
 * which is what the shopper was about to do by hand.
 *
 * The URL is read at click time, like the Facebook button: a page opened with
 * campaign parameters shares the page the shopper is on. Rendered only after
 * mount so the server HTML never claims a capability it cannot know.
 */
export default function ShareButton({ title, text, className }: Props) {
  const [canShare, setCanShare] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  const handleClick = async () => {
    const url = window.location.href
    if (canShare) {
      try {
        await navigator.share({ title, text, url })
      } catch {
        // Dismissed sheet or an unsupported payload: nothing to report.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard denied (insecure context, permissions). The address bar
      // still has the URL; a failed copy is not worth an error message.
    }
  }

  const label = canShare ? 'שיתוף' : copied ? 'הקישור הועתק' : 'העתקת קישור'
  const Icon = copied ? Check : canShare ? Share2 : Link2

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      aria-live="polite"
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-heading transition-colors hover:text-price'
      }
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </button>
  )
}
