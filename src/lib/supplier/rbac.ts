import { safeNextPath } from '@/lib/auth/safe-next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Supplier-portal guard. Membership in an active supplier_members row is the
 * only authorization signal, matching the RLS in 027/051. There is no
 * tenant_id and no reliance on profiles.role.
 */

export interface SupplierSession {
  userId: string
  supplierId: string
  supplierName: string
  memberRole: string
}

/**
 * Returns the caller's first active supplier membership, or null. Uses the
 * user-scoped client so RLS applies; supplier_members exposes members to
 * members via is_supplier_member.
 */
export async function getSupplierSession(): Promise<SupplierSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('supplier_members')
    .select('supplier_id, member_role, suppliers(name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!membership?.supplier_id) return null

  const supplierName =
    (membership as { suppliers?: { name?: string } | { name?: string }[] | null }).suppliers &&
    !Array.isArray((membership as { suppliers?: unknown }).suppliers)
      ? ((membership as { suppliers?: { name?: string } }).suppliers?.name ?? '')
      : ((membership as { suppliers?: { name?: string }[] }).suppliers?.[0]?.name ?? '')

  return {
    userId: user.id,
    supplierId: membership.supplier_id,
    supplierName,
    memberRole: (membership as { member_role?: string }).member_role ?? 'staff',
  }
}

/**
 * Every active supplier the caller staffs, not only the first.
 *
 * getSupplierSession answers "which supplier's portal am I in", and takes the
 * earliest membership to do it. That is the wrong question when deciding
 * whether a voucher belongs to this scanner: a member of two suppliers would be
 * refused their second supplier's own vouchers. redeem_voucher() matches
 * against the full membership set (085), and any check the app performs before
 * calling it has to agree with the function that actually decides.
 */
export async function getSupplierMemberships(): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('supplier_members')
    .select('supplier_id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  return (data ?? []).map((row) => row.supplier_id).filter((id): id is string => Boolean(id))
}

/**
 * Server-component guard: redirects a non-member to /login.
 *
 * `next` is where to land after signing in. It runs through safeNextPath
 * because a scanned QR puts this value in a URL a stranger controls, and
 * `//evil.example` is a protocol-relative URL a browser follows off-site.
 * Anything it rejects lands on the scan screen rather than the site root, which
 * is where a supplier who just failed a supplier guard wants to be.
 */
export async function requireSupplierMember(next = '/supplier/scan'): Promise<SupplierSession> {
  const session = await getSupplierSession()
  if (!session) {
    const safe = safeNextPath(next)
    redirect(`/login?next=${encodeURIComponent(safe === '/' ? '/supplier/scan' : safe)}`)
  }
  return session
}
