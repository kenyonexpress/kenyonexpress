'use client'

import TurnstileWidget from '@/components/shared/TurnstileWidget'
import { legalEntityLine } from '@/lib/legal-entity'
import { resetTurnstile } from '@/lib/security/turnstile-client'
import type { SupplierLeadState } from '@/server/actions/supplier-lead'
import { useEffect, useState } from 'react'

const INITIAL: SupplierLeadState = { ok: false }

const FIELD =
  'w-full rounded-lg border border-heading/20 px-3 py-2.5 text-base text-heading placeholder:text-heading/75 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40'
const LABEL = 'mb-1 block text-sm font-medium text-heading'

/**
 * The join-us form.
 *
 * `inputMode` and `autoComplete` on every field, because this form is filled on
 * a phone by somebody standing in their own shop. `type="tel"` with
 * `inputMode="tel"` is the difference between a numeric keypad and a full
 * qwerty for a ten-digit number.
 *
 * The honeypot is a real input positioned off-screen rather than
 * `display: none`: several bot frameworks skip hidden fields specifically
 * because the trick is old, and an off-screen field is still "visible" to them.
 * `tabIndex={-1}` and `autoComplete="off"` keep a human from ever reaching it.
 */
export default function SupplierLeadForm({
  agreementHash,
  agreementVersion,
  clauses,
}: {
  agreementHash: string
  agreementVersion: string
  clauses: readonly string[]
}) {
  const [state, setState] = useState<SupplierLeadState>(INITIAL)
  const [pending, setPending] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setPending(true)
    try {
      const formData = new FormData(e.currentTarget)
      const res = await fetch('/api/supplier/apply', { method: 'POST', body: formData })
      const data = await res.json()

      if (res.ok && data.ok) {
        if (data.redirectUrl) {
          window.location.assign(data.redirectUrl)
        } else {
          setState({ ok: true, message: data.message })
        }
      } else {
        setState({ ok: false, error: data.error || 'שגיאה לא צפויה' })
      }
    } catch (_err) {
      setState({ ok: false, error: 'שגיאת רשת' })
    } finally {
      setPending(false)
    }
  }

  // The ₪1 card verification happens on Cardcom's hosted page.
  useEffect(() => {
    if (state.ok && state.redirectUrl) window.location.assign(state.redirectUrl)
    if (state.error) resetTurnstile()
  }, [state])

  if (state.ok && state.message) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-semibold text-green-800">{state.message}</p>
        <p className="mt-2 text-sm text-green-700">
          בדרך כלל נחזור אליכם תוך יום עסקים. אם זה דחוף, אפשר גם בוואטסאפ.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-business" className={LABEL}>
            שם העסק *
          </label>
          <input
            id="lead-business"
            name="business_name"
            required
            maxLength={120}
            autoComplete="organization"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="lead-contact" className={LABEL}>
            איש קשר *
          </label>
          <input
            id="lead-contact"
            name="contact_name"
            required
            maxLength={80}
            autoComplete="name"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="lead-phone" className={LABEL}>
            טלפון נייד *
          </label>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            required
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder="050-1234567"
            className={`${FIELD} text-end`}
          />
        </div>
        <div>
          <label htmlFor="lead-email" className={LABEL}>
            מייל *
          </label>
          <input
            id="lead-email"
            name="email"
            type="email"
            required
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            className={`${FIELD} text-end`}
          />
        </div>
        <div>
          <label htmlFor="lead-city" className={LABEL}>
            עיר
          </label>
          <input
            id="lead-city"
            name="city"
            maxLength={60}
            autoComplete="address-level2"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="lead-category" className={LABEL}>
            תחום
          </label>
          <input
            id="lead-category"
            name="category"
            maxLength={60}
            placeholder="מסעדה, ספא, אטרקציה..."
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="lead-website" className={LABEL}>
          אתר או עמוד עסקי
        </label>
        <input
          id="lead-website"
          name="website"
          dir="ltr"
          inputMode="url"
          maxLength={200}
          placeholder="https://"
          className={`${FIELD} text-end`}
        />
      </div>

      <div>
        <label htmlFor="lead-message" className={LABEL}>
          מה תרצו למכור?
        </label>
        <textarea
          id="lead-message"
          name="message"
          rows={4}
          maxLength={2000}
          className={FIELD}
          placeholder="ספרו בקצרה על העסק ועל הדיל שאתם חושבים עליו"
        />
      </div>

      {/*
        Honeypot. Positioned off-screen rather than display:none - the hidden
        trick is old enough that several bot frameworks skip hidden fields on
        purpose, while an off-screen input still looks fillable to them.
      */}
      <div className="honeypot-offscreen" aria-hidden="true">
        <label htmlFor="lead-company">אל תמלאו שדה זה</label>
        <input id="lead-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset className="rounded-lg border border-heading/15 p-4">
        <legend className="px-1 text-sm font-semibold text-heading">
          הסכם הצטרפות, גרסה {agreementVersion}
        </legend>
        <ol className="list-decimal space-y-1 ps-5 text-sm text-heading/80">
          {clauses.map((clause) => (
            <li key={clause}>{clause}</li>
          ))}
        </ol>
        <input type="hidden" name="agreement_hash" value={agreementHash} />
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-heading">
          {/* h-7 is 24.5px at the 14px root; h-6 was 21px, under the 24px WCAG 2.5.8 floor. */}
          <input type="checkbox" name="agreement" required className="h-7 w-7 shrink-0" />
          <span>קראתי ואני מאשר את הסכם ההצטרפות</span>
        </label>
        {/* The counterparty, printed under the clauses and outside the hashed
            text: who the business is contracting with is not a term that a
            version bump should ever re-ask them to accept. */}
        <p className="mt-3 text-xs text-heading/75">הצד השני להסכם: {legalEntityLine()}.</p>
      </fieldset>

      <TurnstileWidget />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-6 py-3 text-base font-semibold text-heading transition-opacity disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'שולח...' : 'שליחת פרטים'}
      </button>

      <p className="text-xs text-heading/75">הפרטים משמשים ליצירת קשר בנוגע להצטרפות בלבד.</p>
    </form>
  )
}
