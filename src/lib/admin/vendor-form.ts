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
  // NO commission_rate. A supplier carries identity and payout details only;
  // percentages live exclusively on the product row, per AGENTS.md.
  //
  // This field existed until 2026-08-11 with `.default(90)`. The column is now
  // written by nothing: the same supplier is meant to have ten products at ten
  // different percentages, so a single rate on the supplier could only ever be
  // a global default in disguise. Measured before removal, all six vendors
  // shared one value (10.00) while their products already carried three
  // distinct rates of their own (30/25/15) -- the supplier-level number was
  // both unused by settlement and wrong.
  //
  // `vendors.commission_rate` was dropped from the live database on 2026-08-12
  // by migrations/pending/112_drop_legacy_percent_columns.sql. Verified against
  // information_schema after the fact, not assumed: the column returns no row,
  // and public.legacy_percent_archive_112 holds 6 vendor rows, all 10.00.
  //
  // This comment previously said the drop HAD happened while 112 was still
  // unapplied, and was corrected back to the present tense before it ran. Worth
  // keeping the scar visible: a comment in the past tense about an unapplied
  // migration is how the archival step gets skipped, because the next reader
  // believes the values are already saved somewhere. Check the schema, then
  // change the tense.
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
