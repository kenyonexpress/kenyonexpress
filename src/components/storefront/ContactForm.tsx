'use client'

import { type ContactState, submitContactForm } from '@/server/actions/contact'
import { useActionState, useId } from 'react'

const EMPTY: ContactState = { ok: false }

const fieldClass =
  'w-full min-h-11 rounded-lg border border-border bg-white px-3 py-2 text-sm text-heading focus:outline-none focus:ring-2 focus:ring-brand-primary/40'

/**
 * RTL contact form. Posts to a server action; never talks to Resend from the
 * browser (CSP connect-src is self + Supabase only).
 */
export default function ContactForm() {
  const [state, action, pending] = useActionState(submitContactForm, EMPTY)
  const baseId = useId()

  return (
    <form
      action={action}
      className="relative mx-auto flex w-full max-w-lg flex-col gap-4"
      noValidate
    >
      {/* Honeypot: hidden from sighted users and most AT; bots still fill it. */}
      <div aria-hidden="true" className="honeypot-offscreen">
        <label htmlFor={`${baseId}-company`}>חברה</label>
        <input
          id={`${baseId}-company`}
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor={`${baseId}-name`} className="mb-1.5 block text-sm font-medium text-heading">
          שם
        </label>
        <input
          id={`${baseId}-name`}
          name="name"
          type="text"
          required
          autoComplete="name"
          maxLength={80}
          className={fieldClass}
        />
      </div>

      <div>
        <label
          htmlFor={`${baseId}-email`}
          className="mb-1.5 block text-sm font-medium text-heading"
        >
          מייל
        </label>
        <input
          id={`${baseId}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          dir="ltr"
          className={`${fieldClass} text-start`}
        />
      </div>

      <div>
        <label
          htmlFor={`${baseId}-message`}
          className="mb-1.5 block text-sm font-medium text-heading"
        >
          הודעה
        </label>
        <textarea
          id={`${baseId}-message`}
          name="message"
          required
          rows={6}
          maxLength={2000}
          className={`${fieldClass} min-h-32 resize-y`}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-brand-secondary px-4 py-2 text-sm font-bold text-heading transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'שולח...' : 'שליחה'}
      </button>

      {state.error && (
        <p role="alert" className="text-sm text-brand-primary">
          {state.error}
        </p>
      )}
      {state.message && (
        <output className="text-sm font-medium text-heading">{state.message}</output>
      )}
    </form>
  )
}
