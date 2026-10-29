'use client'

import { useEffect, useState } from 'react'

type Props = {
  title: string
  text?: string
  /** Defaults to the current page URL. */
  url?: string
  label?: string
  className?: string
}

/**
 * Opens the OS share sheet via the Web Share API. Renders nothing where the API
 * is missing (most desktop browsers), so there is never a dead button; the
 * WhatsApp button beside it stays as the fallback. Support is probed in an
 * effect so server and first client render match.
 */
export default function NativeShareButton({ title, text, url, label = 'שיתוף', className }: Props) {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])
  if (!supported) return null

  const onClick = async () => {
    try {
      await navigator.share({ title, text, url: url || window.location.href })
    } catch {
      // AbortError when the shopper closes the sheet: not an error.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        'inline-flex items-center gap-2 text-sm font-semibold text-gray-700 hover:underline'
      }
    >
      {label}
    </button>
  )
}
