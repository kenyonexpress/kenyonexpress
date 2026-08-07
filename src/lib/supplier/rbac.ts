import { safeNextPath } from '@/lib/auth/safe-next'
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
 * Server-component guard.
 *
 * Merged from two versions that each had a piece the other needed. From the
 * portal branch: a signed-in non-member lands on `/supplier/access-denied`
 * rather than back at a login form they have already satisfied, which is the
 * distinction between "who are you" and "you are not staff here". From this
 * branch: `next` goes through safeNextPath, because a scanned QR puts that
 * value in a URL a stranger controls and `//evil.example` is a
 * protocol-relative URL a browser follows off-site.
 */
export async function requireSupplierMember(next = '/supplier'): Promise<SupplierSession> {
  const safe = safeNextPath(next)
  const target = safe === '/' ? '/supplier' : safe

  const session = await getSupplierSession()
  if (!session) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // Signed out is a different answer from signed in without a membership.
    if (!user) redirect(`/login?next=${encodeURIComponent(target)}`)
    redirect('/supplier/access-denied')
  }
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
