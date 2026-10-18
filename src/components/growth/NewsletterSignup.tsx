'use client'

import { type NewsletterState, subscribeToNewsletter } from '@/server/actions/newsletter'
import { useActionState, useEffect, useId, useRef } from 'react'

const EMPTY: NewsletterState = { ok: false }

/**
 * Newsletter signup, RTL.
 *
 * The consent line sits above the button and is deliberately NOT a checkbox. A
 * pre-ticked box is not consent under 30A, and an unticked one on a
 * single-field footer form is a step people fail rather than read. Pressing a
 * button labelled "הרשמה" directly under a sentence saying what it does is an
 * explicit act, and the double opt-in mail is what actually subscribes.
 */
export default function NewsletterSignup({ source = 'footer' }: { source?: string }) {
  const [state, action, pending] = useActionState(subscribeToNewsletter, EMPTY)
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state.ok && state.message) {
      inputRef.current?.blur()
      buttonRef.current?.blur()
    }
  }, [state.ok, state.message])

  const describeIds = [
    `${id}-consent`,
    state.error && `${id}-error`,
    state.ok && state.message && `${id}-success`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <form action={action} dir="rtl" className="ke-newsletter">
      <input type="hidden" name="source" value={source} />

      <label htmlFor={id} className="ke-newsletter__label">
        הצטרפו לרשימת הדיוור
      </label>

      <div className="ke-newsletter__row">
        <input
          ref={inputRef}
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          dir="ltr"
          aria-describedby={describeIds}
          aria-invalid={state.error ? 'true' : 'false'}
          className={`ke-newsletter__input${state.error ? ' has-error' : ''}`}
          disabled={pending || !!(state.ok && state.message)}
        />
        <button
          ref={buttonRef}
          type="submit"
          disabled={pending || !!(state.ok && state.message)}
          className={`ke-newsletter__button${state.ok && state.message ? ' success' : ''}`}
          aria-busy={pending}
        >
          {pending ? 'שולח...' : state.ok && state.message ? '✓ הושלמה' : 'הרשמה'}
        </button>
      </div>

      <p id={`${id}-consent`} className="ke-newsletter__consent">
        בלחיצה על הרשמה אני מאשר קבלת דיוור פרסומי. אפשר להסיר את ההרשמה בכל מייל.
      </p>

      {state.error && (
        <p id={`${id}-error`} role="alert" className="ke-newsletter__error">
          {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <output id={`${id}-success`} className="ke-newsletter__success">
          {state.message}
        </output>
      )}
    </form>
  )
}
