import { isEmailish, isPhoneish, isUrlish } from '@/lib/admin/supplier-form'

/**
 * What a supplier owner may change about their own business, and nothing else.
 *
 * THE LIST IS THE SECURITY BOUNDARY, not the form markup. `suppliers` has one
 * UPDATE policy in production and it reads `is_admin() OR
 * has_role('content_uploader')`, so a supplier owner cannot write this table
 * through RLS at all. The action that uses this parser therefore writes with
 * the service role, which bypasses RLS entirely -- exactly the pattern the
 * redeem route uses to stamp `staff_id`. When the writer is the service role,
 * the whitelist IS the policy, and a field that reaches the update because the
 * form happened to post it is a privilege escalation with extra steps.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why:
 *
 *   name           the storefront's name for the business, and the string on
 *                  every product card. An admin owns it.
 *   status         'active' is what makes products publishable. A supplier
 *                  cannot publish itself.
 *   business_id    the company number. It is identity, verified once at
 *                  onboarding, and a field a supplier can retype is not one.
 *   notes          internal, written BY admins ABOUT the supplier.
 *   min_payout_ils, payout_hold_business_days
 *                  settlement terms, which are the agreement, not a preference.
 *   commission_percent, default_split_percent
 *                  the retired fixed-commission knobs. Every money knob is per
 *                  product (docs section 0.1).
 *
 * PAYMENT DETAILS ARE NOT HERE BECAUSE THERE IS NOWHERE TO PUT THEM. Read off
 * production on 2026-09-07: `suppliers` carries no bank account, no IBAN, no
 * beneficiary name -- the only payout-shaped columns are `min_payout_ils` and
 * `payout_hold_business_days`, and the payout subsystem those terms describe
 * (152) is not applied and no `supplier_payouts` table exists. A "payment
 * details" form today would collect bank PII into a column that does not exist,
 * for a transfer nothing can make. The physical residual settles in the same
 * run as the charge and a coupon owes the supplier nothing, so no bank detail
 * is needed to be paid correctly today.
 *
 * ADDRESS AND CITY ARE EDITABLE, and they carry one consequence worth naming:
 * `suppliers.latitude`/`longitude` are filled by hand and nothing in the app
 * writes them, so moving the address here leaves the coordinates behind.
 * `distanceToSupplier` falls back to the city centroid when the pair is absent
 * or stale, which degrades a distance badge rather than breaking a page.
 */

export const SUPPLIER_EDITABLE_FIELDS = [
  'contact_name',
  'contact_email',
  'contact_phone',
  'whatsapp',
  'address',
  'city',
  'website',
  'logo_url',
] as const

export type SupplierEditableField = (typeof SUPPLIER_EDITABLE_FIELDS)[number]

export type SupplierProfileFields = Record<SupplierEditableField, string | null>

export type SupplierProfileParseResult =
  | { ok: true; data: SupplierProfileFields }
  | { ok: false; field: SupplierEditableField; error: string }

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Same shape rules as the admin form, imported rather than restated: a phone
 * that passes on one screen and fails on the other is a bug report nobody can
 * reproduce.
 *
 * Every field is optional. A supplier saving only their WhatsApp number is a
 * normal Tuesday, and refusing the save because the logo is still empty would
 * mean the fields that ARE filled never land.
 */
export function parseSupplierProfileForm(raw: Record<string, unknown>): SupplierProfileParseResult {
  const contact_phone = text(raw.contact_phone)
  if (contact_phone !== null && !isPhoneish(contact_phone)) {
    return { ok: false, field: 'contact_phone', error: 'מספר טלפון לא תקין' }
  }

  const whatsapp = text(raw.whatsapp)
  if (whatsapp !== null && !isPhoneish(whatsapp)) {
    return { ok: false, field: 'whatsapp', error: 'מספר וואטסאפ לא תקין' }
  }

  const contact_email = text(raw.contact_email)
  if (contact_email !== null && !isEmailish(contact_email)) {
    return { ok: false, field: 'contact_email', error: 'כתובת אימייל לא תקינה' }
  }

  const website = text(raw.website)
  if (website !== null && !isUrlish(website)) {
    return { ok: false, field: 'website', error: 'כתובת אתר חייבת להתחיל ב-http או https' }
  }

  const logo_url = text(raw.logo_url)
  if (logo_url !== null && !isUrlish(logo_url)) {
    return { ok: false, field: 'logo_url', error: 'כתובת הלוגו אינה תקינה' }
  }

  return {
    ok: true,
    data: {
      contact_name: text(raw.contact_name),
      contact_email,
      contact_phone,
      whatsapp,
      address: text(raw.address),
      city: text(raw.city),
      website,
      logo_url,
    },
  }
}
