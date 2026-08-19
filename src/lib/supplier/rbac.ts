import { safeNextPath } from '@/lib/auth/safe-next'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { type SupplierMemberRole, hasMinRole, normalizeMemberRole } from '@/lib/supplier/roles'
import { redirect } from 'next/navigation'

/**
 * Supplier-portal guard. Membership in an active supplier_members row is the
 * only authorization signal (ARCHITECTURE-SUPPLIER-PORTAL.md §1). profiles.role
 * is a routing hint only.
 */

/**
 * A membership read, or a throw. Never a silent "you are not staff here".
 *
 * WHY THIS FILE NEEDED IT AFTER THE VOUCHER READS WERE ALREADY FIXED. The
 * 2026-08-20 cycle put `voucherReadOrFail` on `getVoucherForRedemption` so that
 * a failed voucher read could not be answered as "this paid voucher does not
 * exist", and wrote that promise into both callers as a comment: A READ THAT
 * FAILED IS NOT A VOUCHER THAT DOES NOT EXIST. The membership read below walks
 * straight around it, because the guard was placed on the second read of the
 * pair and the failure enters through the first:
 *
 *   getSupplierMemberships() read fails -> error discarded -> `data ?? []`
 *   getVoucherForRedemption(code, [])   -> `if (supplierIds.length === 0)
 *                                          return null` returns BEFORE the
 *                                          guarded query runs, so nothing
 *                                          throws and nothing is logged
 *   caller sees null                    -> recordRefusedScan('not_found')
 *
 * So the till is told "הקוד אינו משויך לבית העסק שלכם" about a voucher the
 * customer standing there has paid for, and a refusal row saying the code does
 * not exist is written into the log that exists so a disputed scan can be
 * reconstructed - from a lookup that never happened. That is the identical
 * outcome the voucher fix was written to prevent, reached one file earlier.
 *
 * An empty membership set and an unreadable one must therefore be different
 * values, not the same `[]`.
 *
 * PGRST116 is exempt: on `.maybeSingle()` it is the "no row" answer, and "this
 * user staffs nobody" is a real answer that the guards below already handle by
 * denying access.
 */
function membershipReadOrFail<T>(
  result: { data: T; error: { code?: string; message?: string } | null },
  event: string,
  context: Record<string, unknown> = {},
): T {
  if (!result.error) return result.data
  if (result.error.code === 'PGRST116') return result.data
  log.error(event, { ...context, error: result.error })
  throw new Error(`${event}: ${result.error.message ?? 'membership read failed'}`)
}

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
 *
 * Throws if the membership cannot be READ; see membershipReadOrFail. `null`
 * here means "signed in, staffs nobody", and every caller acts on it as a fact.
 */
export async function getSupplierSession(): Promise<SupplierSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const membership = membershipReadOrFail(
    await supabase
      .from('supplier_members')
      .select('supplier_id, member_role, suppliers(name)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    'supplier.session_read_failed',
    { userId: user.id },
  )

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
 *
 * Throws if the set cannot be READ. An empty array reaching
 * `getVoucherForRedemption` is answered `null` before its guarded query runs,
 * which is why "unreadable" may not arrive there wearing the same shape as
 * "staffs nobody".
 */
export async function getSupplierMemberships(): Promise<string[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const data = membershipReadOrFail(
    await supabase
      .from('supplier_members')
      .select('supplier_id')
      .eq('user_id', user.id)
      .eq('is_active', true),
    'supplier.memberships_read_failed',
    { userId: user.id },
  )

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
