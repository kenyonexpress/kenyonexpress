'use client'

import { type SupplierLeadState, submitSupplierLead } from '@/server/actions/supplier-lead'
import { useActionState } from 'react'

const INITIAL: SupplierLeadState = { ok: false }

const FIELD =
  'w-full rounded-lg border border-heading/20 px-3 py-2.5 text-base text-heading placeholder:text-heading/40 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40'
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
export default function SupplierLeadForm() {
  const [state, action, pending] = useActionState(submitSupplierLead, INITIAL)

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
    <form action={action} className="space-y-4">
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
            className={`${FIELD} text-right`}
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
            className={`${FIELD} text-right`}
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
          className={`${FIELD} text-right`}
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
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="lead-company">אל תמלאו שדה זה</label>
        <input id="lead-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand px-6 py-3 text-base font-semibold text-heading transition-opacity disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'שולח...' : 'שליחת פרטים'}
      </button>

      <p className="text-xs text-heading/60">הפרטים משמשים ליצירת קשר בנוגע להצטרפות בלבד.</p>
    </form>
  )
}
