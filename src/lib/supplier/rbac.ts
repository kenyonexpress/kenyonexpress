import { createClient } from '@/lib/supabase/server'
import { type SupplierMemberRole, hasMinRole, normalizeMemberRole } from '@/lib/supplier/roles'
import { redirect } from 'next/navigation'

/**
 * Supplier-portal guard. Membership in an active supplier_members row is the
 * only authorization signal (ARCHITECTURE-SUPPLIER-PORTAL.md §1). profiles.role
 * is a routing hint only.
 */

export interface SupplierSession {
  userId: string
  supplierId: string
  supplierName: string
  memberRole: SupplierMemberRole
}

type MembershipRow = {
  supplier_id: string
  member_role: string | null
  suppliers?: { name?: string } | { name?: string }[] | null
}

function supplierNameFrom(row: MembershipRow): string {
  const linked = row.suppliers
  if (!linked) return ''
  if (Array.isArray(linked)) return linked[0]?.name ?? ''
  return linked.name ?? ''
}

/**
 * Returns the caller's first active supplier membership, or null. Uses the
 * user-scoped client so RLS applies.
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

  const row = membership as MembershipRow | null
  if (!row?.supplier_id) return null

  return {
    userId: user.id,
    supplierId: row.supplier_id,
    supplierName: supplierNameFrom(row),
    memberRole: normalizeMemberRole(row.member_role),
  }
}

/** Server-component guard: redirects strangers to login, non-members to denial. */
export async function requireSupplierMember(nextPath = '/supplier'): Promise<SupplierSession> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  }

  const session = await getSupplierSession()
  if (!session) redirect('/supplier/access-denied')
  return session
}

/** Role gate on top of membership. */
export async function requireSupplierRole(
  minimum: SupplierMemberRole,
  nextPath = '/supplier',
): Promise<SupplierSession> {
  const session = await requireSupplierMember(nextPath)
  if (!hasMinRole(session.memberRole, minimum)) {
    redirect('/supplier?denied=role')
  }
  return session
}
