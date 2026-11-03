'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

// The widget paints nothing until the effect below has run, so the package is
// fetched after hydration instead of riding on the checkout, login and contact
// first loads (C183). Markup is unchanged: there was never any on the server.
const Turnstile = dynamic(() => import('@marsidev/react-turnstile').then((m) => m.Turnstile), {
  ssr: false,
})

/**
 * Below this viewport width the 300px `normal` widget is wider than the auth
 * card's content box (320 - 2x16 page gutter - 2x24 card padding = 240px) and
 * the page scrolls sideways; `compact` is 150px wide. Measured 336px wide at
 * 320 on /signup, /forgot-password, /reset-password (C142).
 */
const COMPACT_BELOW = '(max-width: 379px)'

/**
 * Cloudflare Turnstile widget. Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is set or while the turnstile_enabled flag is off, so an unconfigured deployment shows the same forms as before. The widget
 * writes the token as a hidden `cf-turnstile-response` input inside its own
 * container, so it lands in the form it sits in, and can be verified
 * server-side via verifyTurnstile(). (It used to also append the token to
 * `document.querySelector('form')`, the first form in the document, which on
 * the home page is not the form the widget belongs to.)
 */
export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const flag = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED?.trim().toLowerCase()
  // Chosen after mount: the widget is script-injected client-side anyway, so
  // waiting one effect for the width costs nothing and keeps hydration exact.
  const [size, setSize] = useState<'normal' | 'compact' | null>(null)
  useEffect(() => {
    setSize(window.matchMedia?.(COMPACT_BELOW).matches ? 'compact' : 'normal')
  }, [])
  if (!siteKey || flag === '0' || flag === 'false') return null
  if (!size) return null

  return (
    <Turnstile
      siteKey={siteKey}
      options={{
        language: 'he',
        theme: 'light',
        size,
      }}
    />
  )
}
