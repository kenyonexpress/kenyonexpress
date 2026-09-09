'use client'

import Script from 'next/script'

/**
 * The Cloudflare Turnstile challenge, as a form field.
 *
 * IMPLICIT RENDERING, ON PURPOSE. The `cf-turnstile` class plus the script is
 * all Turnstile needs: it finds the div, draws the challenge, and injects a
 * hidden `<input name="cf-turnstile-response">` INTO THE ENCLOSING FORM. That
 * matters here more than usual, because these forms submit through React server
 * actions - the token has to arrive as part of the same FormData the action
 * reads, and an explicit render with a JS callback would mean holding the token
 * in client state and hoping the two stay in step across a re-render.
 *
 * RENDERS NOTHING WHEN UNCONFIGURED, which is the whole contract of this layer:
 * `turnstileEnabled()` on the server and this early return are the same
 * decision made in two places, and they cannot disagree because both read the
 * same variable. No key, no widget, no field, and `verifyTurnstile` answers
 * "allowed, not enforced".
 *
 * THE SERVER STILL DECIDES. This component can be deleted from the DOM by
 * anybody with dev tools, which is why the action verifies the token rather
 * than trusting that the widget ran.
 */
export default function TurnstileWidget({ action }: { action?: string }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()
  if (!siteKey) return null

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        async
        defer
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        // Hebrew, because every other string on these forms is. Turnstile
        // renders its own RTL layout for `he`.
        data-language="he"
        // Tells Cloudflare which form was solved, so one site key can carry
        // per-form analytics instead of one undifferentiated number.
        data-action={action}
        data-theme="light"
      />
    </>
  )
}
