'use client'

import { type NewsletterState, subscribeToNewsletter } from '@/server/actions/newsletter'
import { useActionState, useId } from 'react'

const EMPTY: NewsletterState = { ok: false }

/**
 * The footer's newsletter pill, wired to the signup action.
 *
 * IT USED TO POST TO `/api/newsletter`, WHICH DOES NOT EXIST. The form was
 * measured off live (one 470x41 pill, input on the inline-start, dark button
 * on the left) and shipped as plain `<form method="post">` markup, so every
 * address typed into the footer of every page answered with a 404. The
 * double-opt-in action `NewsletterSignup` already binds is the one path that
 * actually subscribes; this binds the same action to the measured pill and
 * changes none of its geometry. The reply lines are added under the pill only
 * when there is one to show.
 */
export default function FooterNewsletterForm() {
  const [state, action, pending] = useActionState(subscribeToNewsletter, EMPTY)
  const id = useId()

  return (
    <div className="w-full lg:w-newsletter-min">
      <form
        action={action}
        className="flex h-newsletter-field w-full items-stretch overflow-hidden rounded-full bg-white"
      >
        <input type="hidden" name="source" value="footer" />
        <input
          id={id}
          type="email"
          name="email"
          required
          autoComplete="email"
          // The address is Latin even on a Hebrew page, so the FIELD is LTR
          // while the bar around it stays RTL - the same rule as
          // `NewsletterSignup`, for the same caret-and-@ reason.
          dir="ltr"
          placeholder="הזן כתובת Email"
          aria-label="כתובת אימייל לניוזלטר"
          aria-describedby={state.error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 border-0 bg-white px-5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-footer-bg px-7 text-sm font-normal text-white transition-colors hover:bg-black disabled:opacity-70"
        >
          {pending ? 'שולח...' : 'הירשם'}
        </button>
      </form>
      {state.error && (
        <p id={`${id}-error`} role="alert" className="m-0 mt-1 text-xs text-heading">
          {state.error}
        </p>
      )}
      {state.message && (
        <output className="mt-1 block text-xs text-heading">{state.message}</output>
      )}
    </div>
  )
}
