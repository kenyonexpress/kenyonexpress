import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Counter PIN: 8 digits, read aloud or typed when the QR will not scan. It is
 * only a lookup key. Redemption still goes through redeem_voucher, which
 * re-derives the supplier from the caller's membership.
 */
const PARTNER_PIN_PATTERN = /^[0-9]{8}$/

export function isPartnerPin(input: string): boolean {
  return PARTNER_PIN_PATTERN.test(input.replace(/[\s-]/g, ''))
}

export function normalizePartnerPin(input: string): string {
  return input.replace(/[\s-]/g, '')
}

/**
 * Resolves a PIN to the voucher's short code among the caller's own suppliers.
 * Null for an unknown PIN, another supplier's PIN, or an ambiguous match (a
 * member of two suppliers who happen to share a PIN) -- all collapse to the
 * same not_found answer the code path gives. Throws on a failed read so a DB
 * outage is not reported as a missing voucher.
 */
export async function resolvePartnerPin(
  pin: string,
  supplierIds: string[],
): Promise<string | null> {
  if (supplierIds.length === 0) return null
  const { data, error } = await createAdminClient()
    .from('vouchers')
    .select('code')
    .eq('partner_pin', normalizePartnerPin(pin))
    .eq('status', 'issued')
    .in('supplier_id', supplierIds)
    .limit(2)
  if (error) throw new Error(`partner_pin_read_failed: ${error.message}`)
  return data?.length === 1 ? (data[0]?.code ?? null) : null
}
