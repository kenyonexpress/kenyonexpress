'use client'

import { t } from '@/lib/i18n/messages'
import { type NewsletterState, subscribeToNewsletter } from '@/server/actions/newsletter'
import { useActionState, useId } from 'react'

const EMPTY: NewsletterState = { ok: false }

/**
 * The footer's own copy of the newsletter pill - see the note beside it in
 * SiteFooter.tsx for why a second copy exists instead of reusing
 * `components/growth/NewsletterSignup`.
 *
 * This used to be a plain `<form method="post" action="/api/newsletter">`.
 * That route was never built, so every submission through this box - the one
 * visible on every desktop page - landed on Next's 404 and nothing was ever
 * written to `newsletter_subscribers`. `subscribeToNewsletter` already existed,
 * already worked (double opt-in, rate limit, suppression check), and was wired
 * into nothing. This wires it in.
 *
 * The status line renders only after a submit, so the first paint - what
 * scripts/compare.mjs measures - is unchanged: same pill, same input, same
 * button.
 */
export default function FooterNewsletterForm() {
  const [state, action, pending] = useActionState(subscribeToNewsletter, EMPTY)
  const statusId = useId()

  return (
    <div className="flex w-full flex-col gap-1.5 lg:w-newsletter-min">
      {/* live: one 470x41 pill, rounded at both ends, input on the
          inline-start (right) and the submit button on the left */}
      <form
        action={action}
        className="flex h-newsletter-field w-full items-stretch overflow-hidden rounded-full bg-white"
      >
        <input type="hidden" name="source" value="footer" />
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          // The address is Latin even on a Hebrew page, so the FIELD is LTR
          // while the form around it stays RTL - the same call
          // `NewsletterSignup` makes.
          dir="ltr"
          placeholder={t('footer.newsletterPlaceholder')}
          aria-label={t('footer.newsletterAriaLabel')}
          aria-describedby={state.message || state.error ? statusId : undefined}
          className="min-w-0 flex-1 border-0 bg-white px-5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-footer-bg px-7 text-sm font-normal text-white transition-colors hover:bg-black disabled:opacity-70"
        >
          {pending ? '...' : 'הירשם'}
        </button>
      </form>

      {/* The bar's background is the brand yellow (--color-brand-secondary),
          not white, so this reuses the dark red already used against a light
          background elsewhere (WaitlistButton) rather than the pale one meant
          for a dark background. */}
      {state.error && (
        <p id={statusId} role="alert" className="px-2 text-xs text-red-700">
          {state.error}
        </p>
      )}
      {!state.error && state.message && (
        <output id={statusId} className="px-2 text-xs text-heading/90">
          {state.message}
        </output>
      )}
    </div>
  )
}
