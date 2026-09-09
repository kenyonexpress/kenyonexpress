'use client'

import { t } from '@/lib/i18n/messages'
import {
  CONTACT_FIELDS,
  CONTACT_FIELD_LABEL_HE,
  type ContactField,
  MAX_NOTE_LENGTH,
  MAX_VALUE_LENGTH,
} from '@/lib/supplier/contact-fields'
import { requestContactChange } from '@/server/actions/supplier/contact-request'
import { useState, useTransition } from 'react'

/**
 * One field at a time, on purpose.
 *
 * A form that submits all seven contact columns at once produces one request
 * row per changed field anyway -- and an admin then has to approve or reject
 * them as a block, which is exactly the decision they should not be forced
 * into. A supplier who moved premises and also mistyped their email deserves to
 * have the address approved and the email queried. `225`'s unique index is per
 * `(supplier_id, field)` for the same reason.
 *
 * THE CURRENT VALUE IS SHOWN BESIDE THE INPUT rather than pre-filled into it.
 * Pre-filling makes "I did not touch this" and "I am asking for this exact
 * value" the same submission, and the action rejects a no-op change with an
 * error the supplier did not earn.
 */
export default function ContactRequestForm({
  current,
}: {
  current: Partial<Record<ContactField, string | null>>
}) {
  const [field, setField] = useState<ContactField>('contact_phone')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    const nextField = String(formData.get('field') ?? '')
    const nextValue = String(formData.get('value') ?? '')
    const nextNote = String(formData.get('note') ?? '')

    startTransition(async () => {
      const result = await requestContactChange(nextField, nextValue, nextNote)
      setState({ ok: result.ok, text: result.ok ? (result.message ?? '') : (result.error ?? '') })
      if (result.ok) {
        setValue('')
        setNote('')
      }
    })
  }

  const currentValue = current[field]?.trim() || null

  return (
    <form action={submit} className="space-y-3">
      <div>
        <label htmlFor="contact-field" className="block text-sm font-semibold text-heading">
          איזה פרט לעדכן
        </label>
        <select
          id="contact-field"
          name="field"
          value={field}
          onChange={(event) => {
            setField(event.target.value as ContactField)
            setState(null)
          }}
          className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm"
        >
          {CONTACT_FIELDS.map((option) => (
            <option key={option} value={option}>
              {CONTACT_FIELD_LABEL_HE[option]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-gray-500">
        כרגע מופיע:{' '}
        {currentValue ? (
          /* The stored value can be an email, a URL or a phone number, all of
             which are Latin and must not be reordered by the RTL run they sit
             in. Same reason the money figures elsewhere carry dir="ltr". */
          <span dir="ltr" className="font-medium text-gray-700">
            {currentValue}
          </span>
        ) : (
          <span className="font-medium text-gray-700">{t('supplier.valueUnset')}</span>
        )}
      </p>

      <div>
        <label htmlFor="contact-value" className="block text-sm font-semibold text-heading">
          הערך המבוקש
        </label>
        <input
          id="contact-value"
          name="value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={MAX_VALUE_LENGTH}
          required
          dir="auto"
          className="mt-1 min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm"
        />
      </div>

      <div>
        <label htmlFor="contact-note" className="block text-sm font-semibold text-heading">
          הערה לצוות (רשות)
        </label>
        <textarea
          id="contact-note"
          name="note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          rows={2}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {state ? (
        <output
          className={`block rounded-xl px-4 py-3 text-sm ${
            state.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900'
          }`}
        >
          {state.text}
        </output>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heading px-5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? 'שולח...' : 'שליחת בקשה'}
      </button>
    </form>
  )
}
