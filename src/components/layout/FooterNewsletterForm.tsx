'use client'

import { useNewsletterForm } from '@/components/growth/useNewsletterForm'
import { NEWSLETTER_FORM_COPY } from '@/lib/growth/newsletter-form'

/**
 * The footer's newsletter pill, wired to the signup action.
 *
 * IT USED TO POST TO `/api/newsletter`, WHICH DOES NOT EXIST. The form was
 * measured off live (one 470x41 pill, input on the inline-start, dark button
 * on the left) and shipped as plain `<form method="post">` markup, so every
 * address typed into the footer of every page answered with a 404. The
 * double-opt-in action `NewsletterSignup` binds is the one path that actually
 * subscribes; this binds the same action to the measured pill and changes
 * none of its geometry.
 *
 * UX12: the pill shares `useNewsletterForm` with the home card, so the same
 * Hebrew check runs before any request, the field turns `aria-invalid` with
 * a red inset ring, the sentence sits under the pill with `role="alert"`, and
 * a success swaps the pill for one `role="status"` line of the same height so
 * the bar does not jump. THE BAR IS BRAND YELLOW, so the sentence is heading
 * ink with an icon and never red or white: red on #fed700 is 3.3:1 and white
 * is 1.41:1 (src/lib/a11y/brand-contrast.test.ts).
 */
export default function FooterNewsletterForm() {
  const f = useNewsletterForm()

  return (
    <div className="w-full lg:w-newsletter-min" data-newsletter-state={f.view}>
      {f.success ? (
        <output
          aria-live="polite"
          className="flex min-h-newsletter-field w-full items-center gap-2 text-sm font-medium text-heading"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span>
            {f.state.message}
            {f.submittedEmail && (
              <>
                {' '}
                <bdi dir="ltr" className="font-semibold">
                  {f.submittedEmail}
                </bdi>
              </>
            )}
          </span>
        </output>
      ) : (
        <form
          action={f.action}
          onSubmit={f.onSubmit}
          noValidate
          aria-busy={f.pending || undefined}
          className="flex h-newsletter-field w-full items-stretch overflow-hidden rounded-full bg-white"
        >
          <input type="hidden" name="source" value="footer" />
          <input
            id={f.ids.input}
            type="email"
            name="email"
            required
            inputMode="email"
            autoComplete="email"
            // The address is Latin even on a Hebrew page, so the FIELD is LTR
            // while the bar around it stays RTL - the same rule as
            // `NewsletterSignup`, for the same caret-and-@ reason.
            dir="ltr"
            placeholder="הזן כתובת Email"
            aria-label="כתובת אימייל לניוזלטר"
            aria-describedby={f.error ? f.ids.error : undefined}
            aria-invalid={f.fieldError ? true : undefined}
            readOnly={f.pending}
            onBlur={f.onBlur}
            onChange={f.onChange}
            className="min-w-0 flex-1 border-0 bg-white px-5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black/40 aria-invalid:ring-2 aria-invalid:ring-inset aria-invalid:ring-error"
          />
          <button
            type="submit"
            disabled={f.pending}
            className="shrink-0 bg-footer-bg px-7 text-sm font-normal text-white transition-colors hover:bg-black disabled:opacity-70"
          >
            {f.pending ? NEWSLETTER_FORM_COPY.pending : 'הירשם'}
          </button>
        </form>
      )}
      {f.error && (
        <p
          id={f.ids.error}
          role="alert"
          data-kind={f.fieldError ? 'field' : 'server'}
          className="m-0 mt-1 flex items-start gap-1 text-xs font-medium leading-5 text-heading"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4.5" />
            <path d="M12 16h.01" />
          </svg>
          {f.error}
        </p>
      )}
    </div>
  )
}
