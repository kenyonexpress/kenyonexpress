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

/** Server-component guard: redirects a non-member to /login. */
export async function requireSupplierMember(): Promise<SupplierSession> {
  const session = await getSupplierSession()
  if (!session) redirect('/login?next=/supplier/scan')
  return session
}
