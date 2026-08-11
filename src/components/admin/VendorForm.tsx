'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import type { VendorProfileOption } from '@/lib/admin/vendor-form'
import { type VendorActionState, upsertVendor } from '@/server/actions/admin/vendors'
import type { Vendor } from '@/types/database'
import { useActionState, useState } from 'react'

interface Props {
  vendor?: Vendor
  // Profiles available to link to a new vendor (creation only).
  profiles?: VendorProfileOption[]
}

const INITIAL: VendorActionState = null

export default function VendorForm({ vendor, profiles = [] }: Props) {
  const [state, action, pending] = useActionState(upsertVendor, INITIAL)
  const [logoUrl, setLogoUrl] = useState<string[]>(vendor?.logo_url ? [vendor.logo_url] : [])

  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  return (
    <form action={action} className="space-y-6 bg-white border border-gray-200 rounded-xl p-6">
      {vendor && <input type="hidden" name="id" value={vendor.id} />}
      {vendor && <input type="hidden" name="profile_id" value={vendor.profile_id ?? ''} />}
      <input type="hidden" name="logo_url" value={logoUrl[0] ?? ''} />

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-2">{success}</div>
      )}

      {!vendor && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">משתמש מקושר</h3>
          <div>
            <label htmlFor="profile_id" className="block text-xs font-medium text-gray-700 mb-1">
              משתמש מקושר *
            </label>
            <select
              id="profile_id"
              name="profile_id"
              required
              defaultValue=""
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="" disabled>
                {profiles.length ? 'בחרו משתמש...' : 'אין משתמשים זמינים לקישור'}
              </option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ? `${p.full_name} (${p.email})` : p.email}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              חשבון המשתמש שישויך לספק. יש ליצור את המשתמש מראש.
            </p>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">פרטי עסק</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="שם עסק *"
            id="business_name"
            name="business_name"
            defaultValue={vendor?.business_name}
            required
          />
          <Field
            label="שם משפטי"
            id="legal_name"
            name="legal_name"
            defaultValue={vendor?.legal_name ?? ''}
          />
          <Field
            label="ח.פ / ע.מ *"
            id="business_id"
            name="business_id"
            defaultValue={vendor?.business_id}
            required
          />
          <Field label="מספר מע״מ" id="tax_id" name="tax_id" defaultValue={vendor?.tax_id ?? ''} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">איש קשר</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="שם איש קשר"
            id="contact_name"
            name="contact_name"
            defaultValue={vendor?.contact_name ?? ''}
          />
          <Field
            label="אימייל *"
            id="contact_email"
            name="contact_email"
            type="email"
            defaultValue={vendor?.contact_email}
            required
          />
          <Field
            label="טלפון"
            id="contact_phone"
            name="contact_phone"
            defaultValue={vendor?.contact_phone ?? ''}
          />
          <Field label="כתובת" id="address" name="address" defaultValue={vendor?.address ?? ''} />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">פרטי בנק</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="שם בעל חשבון"
            id="bank_account_holder"
            name="bank_account_holder"
            defaultValue={vendor?.bank_account_holder ?? ''}
          />
          <Field
            label="שם בנק"
            id="bank_name"
            name="bank_name"
            defaultValue={vendor?.bank_name ?? ''}
          />
          <Field
            label="סניף"
            id="bank_branch"
            name="bank_branch"
            defaultValue={vendor?.bank_branch ?? ''}
          />
          <Field
            label="מספר חשבון"
            id="bank_account"
            name="bank_account"
            defaultValue={vendor?.bank_account ?? ''}
          />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">הגדרות</h3>
        <div className="grid grid-cols-2 gap-4">
          {/*
            No commission field. A supplier holds identity and payout details
            only; the percentage belongs to each product, and the same supplier
            may have ten products at ten different rates.
          */}
          <div className="col-span-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-600">
              עמלת הפלטפורמה נקבעת לכל מוצר בנפרד, במסך עריכת המוצר. לספק אחד יכולים להיות מוצרים
              באחוזים שונים, ולכן אין כאן שדה עמלה.
            </p>
          </div>
          <div>
            <label htmlFor="vendor-status" className="block text-xs font-medium text-gray-700 mb-1">
              סטטוס
            </label>
            <select
              id="vendor-status"
              name="status"
              defaultValue={vendor?.status ?? 'pending'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="pending">ממתין לאישור</option>
              <option value="active">פעיל</option>
              <option value="suspended">מושעה</option>
            </select>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">לוגו</h3>
        <ImageUploader
          bucket="vendor-logos"
          folder="vendors"
          value={logoUrl}
          onChange={(urls) => setLogoUrl(urls.slice(-1))}
          maxFiles={1}
          altKind="supplier"
          // Uncontrolled name field, so this is the saved name: an existing
          // vendor gets a suggestion, a brand new one gets an empty field.
          altSubject={vendor?.business_name ?? null}
        />
      </section>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
        >
          {pending ? 'שומר...' : vendor ? 'עדכון ספק' : 'יצירת ספק'}
        </button>
        <a href="/admin/vendors" className="text-sm text-gray-500 hover:underline">
          ביטול
        </a>
      </div>
    </form>
  )
}

function Field({
  label,
  id,
  name,
  type = 'text',
  defaultValue,
  required,
}: {
  label: string
  id: string
  name: string
  type?: string
  defaultValue?: string | null
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required}
        dir={type === 'email' ? 'ltr' : undefined}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </div>
  )
}
