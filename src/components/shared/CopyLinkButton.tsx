'use client'

import { useState } from 'react'

type Props = {
  /** Defaults to the current page URL, read at click time. */
  url?: string
  label?: string
  copiedLabel?: string
  className?: string
}

/**
 * Copies the page link. The last of the three share actions: WhatsApp first,
 * the OS share sheet second, this for every browser that has neither.
 */
export default function CopyLinkButton({
  url,
  label = 'העתקת קישור',
  copiedLabel = 'הקישור הועתק',
  className,
}: Props) {
  const [copied, setCopied] = useState(false)

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(url || window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure origin, denied permission): say nothing
      // rather than claim a copy that did not happen.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:underline'
      }
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
