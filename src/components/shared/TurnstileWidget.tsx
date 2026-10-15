import Script from 'next/script'

/**
 * The Turnstile challenge. Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is set, so an unconfigured deployment shows the same forms as before. The
 * widget writes `cf-turnstile-response` into the enclosing form on its own.
 */
export default function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (!siteKey) return null
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
      <div className="cf-turnstile" data-sitekey={siteKey} data-language="he" />
    </>
  )
}
