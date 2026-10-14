'use client'

import { NEWSLETTER_FORM_COPY } from '@/lib/growth/newsletter-form'
import { useNewsletterForm } from './useNewsletterForm'

/**
 * Newsletter signup, RTL: the handheld home card (and any other mount that
 * passes a `source`).
 *
 * The consent line sits above the button and is deliberately NOT a checkbox. A
 * pre-ticked box is not consent under 30A, and an unticked one on a
 * single-field footer form is a step people fail rather than read. Pressing a
 * button labelled "הרשמה" directly under a sentence saying what it does is an
 * explicit act, and the double opt-in mail is what actually subscribes.
 *
 * UX12 STATES, all read off `data-state` and the ARIA the hook hands over:
 *
 *   idle      the field, the consent line, the button
 *   invalid   the field red-bordered and `aria-invalid`, a Hebrew sentence
 *             under it with `role="alert"`, focus on the field, no request
 *   pending   the button disabled with a spinner, the form `aria-busy`
 *   failed    the server's sentence (rate limit, failed write) under the
 *             field, the field itself NOT marked, the button live for a retry
 *   success   the whole form replaced by one `role="status"` card: a check,
 *             the server's sentence, the address that was sent (LTR, as a
 *             `<bdi>`, so it reads the right way round inside Hebrew) and
 *             the spam-folder hint
 *
 * `noValidate` is the point: `required` and `type="email"` remain for
 * semantics, and the browser's own bubble, in the browser's language, never
 * opens. The check that runs instead is the server's.
 */
export default function NewsletterSignup({ source = 'footer' }: { source?: string }) {
  const f = useNewsletterForm()

  if (f.success) {
    return (
      <output
        aria-live="polite"
        dir="rtl"
        className="ke-newsletter ke-newsletter__done"
        data-state="success"
      >
        <span className="ke-newsletter__done-icon" aria-hidden="true">
          <CheckIcon />
        </span>
        <span className="ke-newsletter__done-body">
          <strong className="ke-newsletter__done-title">{NEWSLETTER_FORM_COPY.successTitle}</strong>
          <span className="ke-newsletter__done-text">{f.state.message}</span>
          {f.submittedEmail && (
            <span className="ke-newsletter__done-text">
              {NEWSLETTER_FORM_COPY.sentTo}{' '}
              <bdi dir="ltr" className="ke-newsletter__email">
                {f.submittedEmail}
              </bdi>
            </span>
          )}
          <span className="ke-newsletter__consent">{NEWSLETTER_FORM_COPY.successHint}</span>
        </span>
      </output>
    )
  }

  const describedBy = f.error ? `${f.ids.consent} ${f.ids.error}` : f.ids.consent

  return (
    <form
      action={f.action}
      onSubmit={f.onSubmit}
      noValidate
      dir="rtl"
      className="ke-newsletter"
      data-state={f.view}
      aria-busy={f.pending || undefined}
    >
      <input type="hidden" name="source" value={source} />

      <label htmlFor={f.ids.input} className="ke-newsletter__label">
        הצטרפו לרשימת הדיוור
      </label>

      <div className="ke-newsletter__row">
        <input
          id={f.ids.input}
          name="email"
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          // The address is Latin even on a Hebrew page, so the FIELD is LTR
          // while the form around it stays RTL. Without this the caret starts
          // on the wrong side and an @ typed mid-string appears to jump.
          dir="ltr"
          aria-describedby={describedBy}
          aria-invalid={f.fieldError ? true : undefined}
          readOnly={f.pending}
          onBlur={f.onBlur}
          onChange={f.onChange}
          className="ke-newsletter__input"
        />
        <button type="submit" disabled={f.pending} className="ke-newsletter__button">
          {f.pending ? (
            <>
              <span className="ke-newsletter__spinner" aria-hidden="true" />
              {NEWSLETTER_FORM_COPY.pending}
            </>
          ) : (
            'הרשמה'
          )}
        </button>
      </div>

      <p id={f.ids.consent} className="ke-newsletter__consent">
        בלחיצה על הרשמה אני מאשר קבלת דיוור פרסומי. אפשר להסיר את ההרשמה בכל מייל.
      </p>

      {f.error && (
        <p
          id={f.ids.error}
          role="alert"
          className="ke-newsletter__error"
          data-kind={f.fieldError ? 'field' : 'server'}
        >
          <span className="ke-newsletter__error-icon" aria-hidden="true">
            <AlertIcon />
          </span>
          {f.error}
        </p>
      )}
    </form>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </svg>
  )
}
