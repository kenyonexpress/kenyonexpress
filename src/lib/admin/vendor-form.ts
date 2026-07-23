import { z } from 'zod'

// Pure, testable validation + helpers for the vendor (supplier) form.
// Kept out of the 'use server' action file, which may only export async functions.

export const vendorStatusSchema = z.enum(['pending', 'active', 'suspended'])

export const vendorFormSchema = z.object({
  id: z.string().uuid().optional(),
  profile_id: z.string().uuid().optional(),
  business_name: z.string().min(2, 'שם עסק נדרש'),
  legal_name: z.string().nullable().optional(),
  business_id: z.string().min(2, 'ח.פ נדרש'),
  tax_id: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().email('אימייל לא תקין'),
  contact_phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bank_account_holder: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_branch: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  commission_rate: z.coerce.number().min(0).max(100).default(90),
  logo_url: z.string().nullable().optional(),
  status: vendorStatusSchema.default('pending'),
})

export type VendorFormInput = z.infer<typeof vendorFormSchema>

export type VendorParseResult = { ok: true; data: VendorFormInput } | { ok: false; error: string }

// Validates raw form input. Creation (no id) MUST link a profile, because the
// vendors.profile_id column is NOT NULL, and a missing profile silently broke the
// entire create flow before this guard existed.
export function parseVendorForm(raw: unknown): VendorParseResult {
  const parsed = vendorFormSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }
  }
  const data = parsed.data
  if (!data.id && !data.profile_id) {
    return { ok: false, error: 'יש לבחור משתמש לקישור הספק' }
  }
  return { ok: true, data }
}

export interface VendorProfileOption {
  id: string
  email: string
  full_name: string | null
}

// Profiles that may be linked to a NEW vendor: those not already linked to one.
export function eligibleVendorProfiles(
  profiles: VendorProfileOption[],
  linkedProfileIds: Iterable<string>,
): VendorProfileOption[] {
  const taken = new Set(linkedProfileIds)
  return profiles.filter((p) => !taken.has(p.id))
}
