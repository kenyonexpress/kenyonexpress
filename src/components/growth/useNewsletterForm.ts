'use client'

import { checkNewsletterEmail } from '@/lib/growth/newsletter-form'
import { type NewsletterState, subscribeToNewsletter } from '@/server/actions/newsletter'
import {
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
  useActionState,
  useId,
  useState,
} from 'react'

const EMPTY: NewsletterState = { ok: false }

/** What the form is showing right now; the markup carries it as `data-state`. */
export type NewsletterView = 'idle' | 'invalid' | 'pending' | 'failed' | 'success'

/**
 * The behaviour both newsletter forms share (UX12): the footer pill and the
 * handheld home card differ only in paint.
 *
 * THE BROWSER DOES NOT GET TO SPEAK FIRST. The forms set `noValidate`, so
 * `required` and `type="email"` stay as semantics and the native bubble,
 * which speaks the browser's language and not the page's, never opens. The
 * same check the server runs decides on submit, and a failing address is
 * stopped here: no request, the field marked `aria-invalid`, focused, and
 * the sentence read out by the alert the field is described by.
 *
 * FOUR THINGS, EACH WITH A REASON:
 *
 *  - A blur checks a NON-EMPTY value only. Tabbing through an empty field is
 *    not a mistake yet; pressing submit on one is, and says so.
 *  - Typing clears a client error the moment the value passes, so the red
 *    does not outlive the fix.
 *  - Typing also retires the server's last reply. `useActionState` keeps the
 *    reply until the next one lands, so before UX12 "כתובת מייל לא תקינה"
 *    stayed under a corrected address (measured 14.10). The reply is kept by
 *    identity: every action return is a fresh object, so the next one shows.
 *  - The address that was sent is remembered, because the server's answer is
 *    deliberately the same for every address and the visitor still deserves
 *    to see which inbox to open.
 */
export function useNewsletterForm() {
  const [state, action, pending] = useActionState(subscribeToNewsletter, EMPTY)
  const id = useId()
  const [clientError, setClientError] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const [retiredReply, setRetiredReply] = useState<NewsletterState | null>(null)

  const serverError = !state.ok && state.error && state !== retiredReply ? state.error : null
  const error = clientError ?? serverError
  const fieldError = clientError !== null || (serverError !== null && state.field === 'email')
  const success = state.ok && Boolean(state.message)

  let view: NewsletterView = 'idle'
  if (success) view = 'success'
  else if (pending) view = 'pending'
  else if (fieldError) view = 'invalid'
  else if (serverError) view = 'failed'

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const field = event.currentTarget.elements.namedItem('email')
    const input = field instanceof HTMLInputElement ? field : null
    const check = checkNewsletterEmail(input?.value)
    if (!check.ok) {
      event.preventDefault()
      setClientError(check.error)
      input?.focus()
      return
    }
    setClientError(null)
    setSubmittedEmail(check.email)
  }

  const onBlur = (event: FocusEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value
    if (value.trim() === '') return
    const check = checkNewsletterEmail(value)
    setClientError(check.ok ? null : check.error)
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (serverError) setRetiredReply(state)
    if (clientError !== null && checkNewsletterEmail(event.currentTarget.value).ok) {
      setClientError(null)
    }
  }

  return {
    state,
    action,
    pending,
    view,
    error,
    fieldError,
    success,
    submittedEmail,
    ids: { input: id, error: `${id}-error`, consent: `${id}-consent` },
    onSubmit,
    onBlur,
    onChange,
  }
}
