'use client'

import { type NewsletterState, subscribeToNewsletter } from '@/server/actions/newsletter'
import { useActionState, useId } from 'react'

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

  return (
    <form action={action} dir="rtl" className="ke-newsletter">
      <input type="hidden" name="source" value={source} />

      <label htmlFor={id} className="ke-newsletter__label">
        הצטרפו לרשימת הדיוור
      </label>

      <div className="ke-newsletter__row">
        <input
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          // The address is Latin even on a Hebrew page, so the FIELD is LTR
          // while the form around it stays RTL. Without this the caret starts
          // on the wrong side and an @ typed mid-string appears to jump.
          dir="ltr"
          aria-describedby={`${id}-consent${state.error ? ` ${id}-error` : ''}`}
          className="ke-newsletter__input"
        />
        <button type="submit" disabled={pending} className="ke-newsletter__button">
          {pending ? 'שולח...' : 'הרשמה'}
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
      {state.message && <output className="ke-newsletter__success">{state.message}</output>}
    </form>
  )
}
