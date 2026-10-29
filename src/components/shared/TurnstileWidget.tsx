'use client'

import { Turnstile } from '@marsidev/react-turnstile'

/**
 * Cloudflare Turnstile widget. Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is set or while the turnstile_enabled flag is off, so an unconfigured deployment shows the same forms as before. The widget
 * writes the token to the form as `cf-turnstile-response` and can be verified
 * server-side via verifyTurnstile().
 */
export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const flag = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED?.trim().toLowerCase()
  if (!siteKey || flag === '0' || flag === 'false') return null

  return (
    <Turnstile
      siteKey={siteKey}
      onSuccess={(token) => {
        const form = document.querySelector('form')
        if (form) {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = 'cf-turnstile-response'
          input.value = token
          form.appendChild(input)
        }
      }}
      onError={() => {
        const form = document.querySelector('form')
        if (form) {
          const input = form.querySelector('input[name="cf-turnstile-response"]')
          if (input) input.remove()
        }
      }}
      options={{
        language: 'he',
        theme: 'light',
        size: 'normal',
      }}
    />
  )
}
