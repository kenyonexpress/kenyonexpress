'use client'

import { Turnstile } from '@marsidev/react-turnstile'

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
  if (!siteKey || flag === '0' || flag === 'false') return null

  return (
    <Turnstile
      siteKey={siteKey}
      options={{
        language: 'he',
        theme: 'light',
        size: 'normal',
      }}
    />
  )
}
