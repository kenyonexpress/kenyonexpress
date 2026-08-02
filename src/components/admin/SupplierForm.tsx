'use client'

import ImageUploader from '@/components/admin/ImageUploader'
import {
  SUPPLIER_STATUSES,
  SUPPLIER_STATUS_LABELS,
  supplierReadiness,
} from '@/lib/admin/supplier-form'
import { type SupplierActionState, upsertSupplier } from '@/server/actions/admin/suppliers'
import type { Supplier } from '@/types/database'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useActionState, useState } from 'react'

interface Props {
  supplier?: Supplier
  /** Products pointing at this supplier, so the admin sees the blast radius. */
  productCount?: number
}

const INITIAL: SupplierActionState = null

/**
 * Editor for `public.suppliers`.
 *
 * The four fields a product needs before it may publish (name, phone, address,
 * logo) are grouped first and marked, because the whole reason this screen was
 * rewritten is that the identity it edits now shows on the storefront: the phone
 * opens WhatsApp and the address opens Waze on the product page.
 */
export default function SupplierForm({ supplier, productCount }: Props) {
  const [state, action, pending] = useActionState(upsertSupplier, INITIAL)
  const [logoUrl, setLogoUrl] = useState<string[]>(supplier?.logo_url ? [supplier.logo_url] : [])
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.contact_phone ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [status, setStatus] = useState<string>(supplier?.status ?? 'active')

  const error = state && 'error' in state ? state.error : null
  const success = state && 'success' in state ? state.success : null

  // Live, so the admin watches the blockers disappear as the fields fill in.
  const readiness = supplierReadiness({
    name,
    contact_phone: phone,
    address,
    logo_url: logoUrl[0] ?? '',
    status,
  })

  return (
    <form action={action} className="space-y-6 bg-white border border-gray-200 rounded-xl p-6">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <input type="hidden" name="logo_url" value={logoUrl[0] ?? ''} />

      {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>}
      {success && (
        <div className="bg-green-50 text-green-700 text-sm rounded-lg px-4 py-2">{success}</div>
      )}

      <div
        className={`flex items-start gap-2 text-sm rounded-lg px-4 py-3 ${
          readiness.ready ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'
        }`}
      >
        {readiness.ready ? (
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        )}
        <div>
          {readiness.ready ? (
            <span>הספק שלם. מוצרים המשויכים אליו יכולים להתפרסם.</span>
          ) : (
            <>
              <span className="font-medium">
                חסרים פרטים, ולכן מוצרים של הספק לא יוכלו לעבור לסטטוס פעיל:
              </span>{' '}
              <span>{readiness.missingLabels.join(', ')}</span>
              {status !== 'active' && <span> · הספק אינו פעיל</span>}
            </>
          )}
          {typeof productCount === 'number' && productCount > 0 && (
            <div className="mt-1 text-xs opacity-80">
              {productCount} מוצרים משויכים לספק הזה. שינוי כאן משפיע על הזמנות עתידיות בלבד.
            </div>
          )}
        </div>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">
          זהות מול הלקוח (נדרש לפרסום)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sup-name" className="block text-xs font-medium text-gray-700 mb-1">
              שם העסק *
            </label>
            <input
              id="sup-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="sup-phone" className="block text-xs font-medium text-gray-700 mb-1">
              טלפון *
            </label>
            <input
              id="sup-phone"
              name="contact_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              placeholder="050-1234567"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-gray-500">נפתח כוואטסאפ בעמוד המוצר</p>
          </div>
          <div className="col-span-2">
            <label htmlFor="sup-address" className="block text-xs font-medium text-gray-700 mb-1">
              כתובת *
            </label>
            <input
              id="sup-address"
              name="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="mt-1 text-xs text-gray-500">נפתח ב-Waze בעמוד המוצר</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">לוגו *</h3>
        <ImageUploader
          bucket="vendor-logos"
          folder="suppliers"
          value={logoUrl}
          onChange={(urls) => setLogoUrl(urls.slice(-1))}
          maxFiles={1}
        />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">פרטים נוספים</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="עיר" id="sup-city" name="city" defaultValue={supplier?.city} />
          <Field
            label="ח.פ / ע.מ"
            id="sup-business-id"
            name="business_id"
            defaultValue={supplier?.business_id}
            ltr
          />
          <Field
            label="איש קשר"
            id="sup-contact-name"
            name="contact_name"
            defaultValue={supplier?.contact_name}
          />
          <Field
            label="אימייל"
            id="sup-email"
            name="contact_email"
            type="email"
            defaultValue={supplier?.contact_email}
            ltr
          />
          <Field
            label="וואטסאפ (אם שונה מהטלפון)"
            id="sup-whatsapp"
            name="whatsapp"
            defaultValue={supplier?.whatsapp}
            ltr
          />
          <Field
            label="אתר"
            id="sup-website"
            name="website"
            defaultValue={supplier?.website}
            placeholder="https://"
            ltr
          />
          <div>
            <label htmlFor="sup-status" className="block text-xs font-medium text-gray-700 mb-1">
              סטטוס
            </label>
            <select
              id="sup-status"
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {SUPPLIER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUPPLIER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label htmlFor="sup-notes" className="block text-xs font-medium text-gray-700 mb-1">
            הערות פנימיות
          </label>
          <textarea
            id="sup-notes"
            name="notes"
            defaultValue={supplier?.notes ?? ''}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
          />
        </div>
      </section>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark font-semibold rounded-lg px-6 py-2.5 text-sm transition-colors"
        >
          {pending ? 'שומר...' : supplier ? 'עדכון ספק' : 'יצירת ספק'}
        </button>
        <a href="/admin/suppliers" className="text-sm text-gray-500 hover:underline">
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
  placeholder,
  ltr,
}: {
  label: string
  id: string
  name: string
  type?: string
  defaultValue?: string | null
  placeholder?: string
  ltr?: boolean
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
        placeholder={placeholder}
        dir={ltr ? 'ltr' : undefined}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />
    </div>
  )
}
