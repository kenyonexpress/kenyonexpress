import { isAdminRole, isStaffRole } from '@/lib/admin/roles'
import { safeNextPath } from '@/lib/auth/safe-next'
import { identityScopedClient } from '@/lib/supabase/bearer'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

/**
 * One gate for the four audiences the product actually has.
 *
 * Before this file there were three unrelated answers to "may this caller do
 * this". `src/lib/admin/rbac.ts` redirects, which is right for a page and wrong
 * for a route handler -- a 307 to /login in answer to `fetch()` reaches the app
 * as a login page parsed as JSON. `src/lib/supplier/rbac.ts` redirects too, and
 * asks a different question again (membership, not profile role). API routes
 * each rolled their own, and one of them rolled none at all. This file does not
 * replace those two: it is the shared decision they both express, plus the
 * non-redirecting form the routes needed and did not have.
 *
 * THE FOUR NAMES ARE NOT THE `user_role` ENUM, on purpose:
 *
 *   admin             admin | super_admin.
 *   content_uploader  the catalog-writer tier: content_uploader and up.
 *                     Named for the LEAST role that satisfies it, so
 *                     `requireRole('content_uploader')` admits an admin. The
 *                     alternative -- a gate that an admin fails -- is the
 *                     mistake this naming exists to prevent.
 *   supplier          an active `supplier_members` row. NOT `profiles.role ===
 *                     'vendor'`. ARCHITECTURE-SUPPLIER-PORTAL.md section 1 makes
 *                     membership the only authorization signal and the profile
 *                     role a routing hint, and the two disagree in production:
 *                     a vendor whose membership was deactivated keeps the
 *                     profile role. Reading the role here would re-open the
 *                     portal to them.
 *   customer          any authenticated user. It is a real gate, not a
 *                     no-op: it separates "signed in" from "signed out", which
 *                     is the whole check on /account.
 *
 * `support` deliberately satisfies none of these. It reads through the section
 * matrix in `@/lib/admin/permissions`, which is finer than a role gate; a
 * support user hitting `requireRole('admin')` should be refused.
 */
export type AppRole = 'admin' | 'content_uploader' | 'supplier' | 'customer'

export type Actor = {
  userId: string
  /** null when the gate did not need it -- absence is not "no role". */
  profileRole: UserRole | null
  /** Active memberships. Empty for every non-supplier gate; never null. */
  supplierIds: string[]
}

/**
 * The decision, with no IO in it. Every branch above is testable from here
 * without a database, which is why the loaders below hold nothing but queries.
 */
export function actorSatisfies(actor: Actor, required: AppRole): boolean {
  switch (required) {
    case 'customer':
      return actor.userId.length > 0
    case 'admin':
      return isAdminRole(actor.profileRole)
    case 'content_uploader':
      return isStaffRole(actor.profileRole)
    case 'supplier':
      return actor.supplierIds.length > 0
  }
}

/** Which queries a gate needs. Asking for less is the point of splitting it. */
function needs(required: AppRole): { role: boolean; memberships: boolean } {
  return {
    role: required === 'admin' || required === 'content_uploader',
    memberships: required === 'supplier',
  }
}

type Denial = { ok: false; status: 401 | 403; reason: 'unauthenticated' | 'forbidden' }
type Grant = { ok: true; actor: Actor }
export type RoleCheck = Grant | Denial

/**
 * Cookie-session check, for server components and server actions.
 *
 * `request` is absent here by design: a server component has no Request to
 * take a bearer header from, and accepting one would invite passing an
 * attacker-controlled object into an authorization decision.
 */
export async function checkRole(required: AppRole): Promise<RoleCheck> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, reason: 'unauthenticated' }
  return decide(supabase, user.id, required)
}

/**
 * Same decision for a route handler, and it accepts the app's bearer token as
 * well as the site's cookie -- `identityScopedClient` prefers the cookie, so a
 * cross-site navigation cannot be reinterpreted through a supplied header.
 *
 * Returns a value rather than redirecting. A route that redirects on denial
 * hands `fetch()` an HTML login page with a 200 somewhere down the chain, and
 * hands a `<a href>` download a file named after the login route.
 */
export async function checkRoleForRequest(required: AppRole, request: Request): Promise<RoleCheck> {
  const scoped = await identityScopedClient(request)
  if (!scoped) return { ok: false, status: 401, reason: 'unauthenticated' }
  return decide(scoped.client, scoped.identity.user.id, required)
}

/**
 * Both callers hand this a user-scoped client -- the cookie one from
 * `@/lib/supabase/server` or the bearer one from `@/lib/supabase/bearer`.
 * Neither carries the `Database` generic, so the row shapes are asserted at
 * each read rather than inferred.
 */
async function decide(
  client: SupabaseClient,
  userId: string,
  required: AppRole,
): Promise<RoleCheck> {
  const want = needs(required)

  let profileRole: UserRole | null = null
  if (want.role) {
    const { data } = await client.from('profiles').select('role').eq('id', userId).single()
    profileRole = (data as { role?: UserRole } | null)?.role ?? null
  }

  let supplierIds: string[] = []
  if (want.memberships) {
    const { data } = await client
      .from('supplier_members')
      .select('supplier_id')
      .eq('user_id', userId)
      .eq('is_active', true)
    supplierIds = ((data as { supplier_id?: string }[] | null) ?? [])
      .map((row) => row.supplier_id)
      .filter((id): id is string => Boolean(id))
  }

  const actor: Actor = { userId, profileRole, supplierIds }
  if (!actorSatisfies(actor, required)) {
    return { ok: false, status: 403, reason: 'forbidden' }
  }
  return { ok: true, actor }
}

/**
 * Page/server-action form: redirects instead of returning a denial.
 *
 * Signed out goes to /login carrying where they were headed; signed in but
 * refused does not, because sending someone back to a login form they have
 * already satisfied tells them the wrong thing about why they were stopped.
 */
export async function requireRole(required: AppRole, next = '/'): Promise<Actor> {
  const result = await checkRole(required)
  if (result.ok) return result.actor
  if (result.reason === 'unauthenticated') {
    const target = safeNextPath(next)
    redirect(`/login?next=${encodeURIComponent(target)}`)
  }
  redirect(required === 'supplier' ? '/supplier/access-denied' : '/')
}

/**
 * Route-handler form: the denial as a JSON Response, or null when allowed.
 *
 * The body is the same two words for 401 and 403 apart from the status, so a
 * prober learns whether they are signed in and nothing about who else exists.
 */
export async function denyRole(
  required: AppRole,
  request: Request,
): Promise<{ actor: Actor } | Response> {
  const result = await checkRoleForRequest(required, request)
  if (result.ok) return { actor: result.actor }
  return Response.json({ ok: false, error: result.reason }, { status: result.status })
}
