/**
 * Parsing and readiness rules for `public.suppliers`, the table that products
 * and order lines actually point at.
 *
 * Why this module exists at all: until now `/admin/suppliers` edited
 * `public.vendors`, a different table with six rows that nothing on the purchase
 * path references (docs/ADMIN-ARCHITECTURE.md section 2). Everything an admin
 * typed there was invisible to the storefront, to checkout and to the voucher.
 * The screen now edits `suppliers`, and this module holds the rules so the form,
 * the server action and the tests share one implementation.
 *
 * Two columns on the live table are deliberately NOT exposed here:
 * `commission_percent` (NOT NULL DEFAULT 0) and `default_split_percent`
 * (NOT NULL DEFAULT 70). They are leftovers from the fixed-commission model that
 * section 0.1 revoked. Every money knob is per product now, so surfacing a
 * supplier-level percent would give an admin two places to set the same thing
 * and no rule for which one wins. They are left at whatever the row already
 * carries, and nothing reads them (verified 2026-07-28: no reference outside the
 * generated types).
 */

/** The four details a supplier must carry before any of its products publish. */
export const REQUIRED_TO_PUBLISH = ['name', 'contact_phone', 'address', 'logo_url'] as const

export type RequiredSupplierField = (typeof REQUIRED_TO_PUBLISH)[number]

export const SUPPLIER_FIELD_LABELS: Record<RequiredSupplierField, string> = {
  name: 'שם העסק',
  contact_phone: 'טלפון',
  address: 'כתובת',
  logo_url: 'לוגו',
}

/** Live column is free text, not an enum. These are the values the UI offers. */
export const SUPPLIER_STATUSES = ['active', 'inactive'] as const
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number]

export const SUPPLIER_STATUS_LABELS: Record<SupplierStatus, string> = {
  active: 'פעיל',
  inactive: 'לא פעיל',
}

export interface SupplierFormFields {
  name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  whatsapp: string | null
  address: string | null
  city: string | null
  website: string | null
  business_id: string | null
  logo_url: string | null
  notes: string | null
  status: SupplierStatus
}

export type SupplierParseResult =
  | { ok: true; id?: string; data: SupplierFormFields }
  | { ok: false; error: string }

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Loose on purpose: Israeli numbers arrive as 0501234567, 050-123-4567,
 * +972 50 …, and landlines as (03) 555-1234. The point is to catch a typo, not
 * to impose a format on an admin copying a number off a business card.
 */
function isPhoneish(value: string): boolean {
  return /^[+(\d][\d\s()-]{6,19}$/.test(value)
}

function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isUrlish(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value)
}

/**
 * Validates a supplier form submission.
 *
 * Only `name` is required to save, because a half-filled supplier is a normal
 * state: all eleven live suppliers are missing an address and a logo, and an
 * admin has to be able to save the phone number today and the logo tomorrow.
 * The completeness requirement is a PUBLISH gate on the product, not a save gate
 * here (section 2.1). What is validated is shape: a phone that is not a phone or
 * a website that is not a URL is a typo, and storing it would put a dead Waze or
 * WhatsApp link on a live product page.
 */
export function parseSupplierForm(raw: Record<string, unknown>): SupplierParseResult {
  const id = text(raw.id) ?? undefined
  if (id !== undefined && !/^[0-9a-f-]{36}$/i.test(id)) {
    return { ok: false, error: 'מזהה ספק לא תקין' }
  }

  const name = text(raw.name)
  if (name === null) return { ok: false, error: 'שם העסק הוא שדה חובה' }
  if (name.length < 2) return { ok: false, error: 'שם העסק חייב להכיל לפחות 2 תווים' }

  const contact_phone = text(raw.contact_phone)
  if (contact_phone !== null && !isPhoneish(contact_phone)) {
    return { ok: false, error: 'מספר טלפון לא תקין' }
  }

  const whatsapp = text(raw.whatsapp)
  if (whatsapp !== null && !isPhoneish(whatsapp)) {
    return { ok: false, error: 'מספר וואטסאפ לא תקין' }
  }

  const contact_email = text(raw.contact_email)
  if (contact_email !== null && !isEmailish(contact_email)) {
    return { ok: false, error: 'כתובת אימייל לא תקינה' }
  }

  const website = text(raw.website)
  if (website !== null && !isUrlish(website)) {
    return { ok: false, error: 'כתובת אתר חייבת להתחיל ב-http או https' }
  }

  const logo_url = text(raw.logo_url)
  if (logo_url !== null && !isUrlish(logo_url)) {
    return { ok: false, error: 'כתובת הלוגו אינה תקינה' }
  }

  const statusRaw = text(raw.status) ?? 'active'
  if (!(SUPPLIER_STATUSES as readonly string[]).includes(statusRaw)) {
    return { ok: false, error: 'סטטוס ספק לא תקין' }
  }

  return {
    ok: true,
    ...(id ? { id } : {}),
    data: {
      name,
      contact_name: text(raw.contact_name),
      contact_email,
      contact_phone,
      whatsapp,
      address: text(raw.address),
      city: text(raw.city),
      website,
      business_id: text(raw.business_id),
      logo_url,
      notes: text(raw.notes),
      status: statusRaw as SupplierStatus,
    },
  }
}

export interface SupplierReadiness {
  ready: boolean
  /** Column keys still empty, in the order the form shows them. */
  missing: RequiredSupplierField[]
  /** Hebrew, ready to render. */
  missingLabels: string[]
}

/**
 * Whether this supplier can carry a published product.
 *
 * The admin sees this on the supplier row and on the product page, so the
 * reason a product refuses to publish is visible before the attempt rather than
 * only in the error that follows it.
 */
export function supplierReadiness(
  supplier: Partial<Record<RequiredSupplierField, string | null | undefined>> & {
    status?: string | null
  },
): SupplierReadiness {
  const missing = REQUIRED_TO_PUBLISH.filter((field) => {
    const value = supplier[field]
    return typeof value !== 'string' || value.trim().length === 0
  })
  return {
    ready: missing.length === 0 && supplier.status === 'active',
    missing,
    missingLabels: missing.map((field) => SUPPLIER_FIELD_LABELS[field]),
  }
}
