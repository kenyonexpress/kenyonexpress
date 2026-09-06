'use client'

import { type SupplierProfileState, updateSupplierProfile } from '@/server/actions/supplier/profile'
import { useActionState } from 'react'

type Values = {
  contact_name: string
  contact_email: string
  contact_phone: string
  whatsapp: string
  address: string
  city: string
  website: string
  logo_url: string
}

const FIELDS: { name: keyof Values; label: string; hint?: string; type?: string }[] = [
  { name: 'contact_name', label: 'איש קשר' },
  { name: 'contact_phone', label: 'טלפון', hint: 'מופיע ללקוחות בעמוד המוצר' },
  { name: 'whatsapp', label: 'וואטסאפ', hint: 'ריק = הכפתור לא מוצג' },
  { name: 'contact_email', label: 'אימייל', type: 'email' },
  { name: 'address', label: 'כתובת' },
  { name: 'city', label: 'עיר' },
  { name: 'website', label: 'אתר', hint: 'כולל https://' },
  { name: 'logo_url', label: 'קישור ללוגו', hint: 'כולל https://' },
]

const INITIAL: SupplierProfileState = null

/**
 * The four fields marked here are the publish gate: without a name, a phone, an
 * address and a logo, this supplier's products cannot go live
 * (`REQUIRED_TO_PUBLISH`). The name is the admin's to set, so three of the four
 * are on this form, and the notice at the top says which are still missing
 * rather than leaving the supplier to discover it from a product that refuses
 * to publish.
 */
export default function ProfileForm({
  values,
  missingLabels,
}: {
  values: Values
  missingLabels: string[]
}) {
  const [state, action, pending] = useActionState(updateSupplierProfile, INITIAL)

  return (
    <form action={action} className="space-y-4">
      {missingLabels.length > 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          חסרים פרטים כדי לפרסם מוצרים: {missingLabels.join(', ')}.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.name}>
            <label
              htmlFor={`supplier-${field.name}`}
              className="block text-xs font-medium text-gray-700"
            >
              {field.label}
            </label>
            <input
              id={`supplier-${field.name}`}
              name={field.name}
              type={field.type ?? 'text'}
              defaultValue={values[field.name]}
              dir={field.name === 'website' || field.name === 'logo_url' ? 'ltr' : undefined}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-start focus:outline-none focus:ring-2 focus:ring-brand"
            />
            {field.hint ? <p className="mt-1 text-xs text-gray-400">{field.hint}</p> : null}
          </div>
        ))}
      </div>

      {state && 'error' in state ? <p className="text-sm text-red-600">{state.error}</p> : null}
      {state && 'success' in state ? (
        <p className="text-sm text-green-600">{state.success}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover disabled:opacity-60"
      >
        {pending ? 'שומר...' : 'שמירת פרטים'}
      </button>
    </form>
  )
}
