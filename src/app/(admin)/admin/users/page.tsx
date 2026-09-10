import FilterBar from '@/components/admin/FilterBar'
import TablePagination from '@/components/admin/TablePagination'
import UsersTable, { type UserRow } from '@/components/admin/UsersTable'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { canWriteSection } from '@/lib/admin/permissions'
import { ROLE_LABELS, ROLE_ORDER, requireSection } from '@/lib/admin/rbac'
import type { AppRole } from '@/lib/admin/roles'
import { createClient } from '@/lib/supabase/server'
import { searchCustomers } from '@/server/queries/admin-customer'
import type { UserRole } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'משתמשים' }

const paramsSchema = baseListParamsSchema.extend({
  role: z.enum(ROLE_ORDER as [AppRole, ...AppRole[]]).optional(),
})

export default async function AdminUsersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId: callerId, role: callerRole } = await requireSection('users')
  const canEdit = canWriteSection(callerRole, 'users')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)

  const supabase = await createClient()

  /*
    TWO PATHS THROUGH THIS PAGE, AND THE SPLIT IS THE FEATURE.

    With no `q`, it is the roster: paginated, role-filtered, ordered by signup.
    That is what an admin browsing users wants and it stays exactly as it was.

    With a `q`, it is a SUPPORT LOOKUP, and a support lookup is not a filtered
    roster. The term is whatever the person on the phone read out -- an email, a
    number, the eight characters the confirmation mail printed -- and resolving
    it means asking `orders` and `user_addresses`, not narrowing a select on
    `profiles`. `searchCustomers` does that reading; see
    `lib/admin/customer-search.ts` for why the term has to be classified first.

    The role tabs are still honoured on the lookup path, but as a POST-FILTER
    over the resolved hits rather than as part of the query. Pushing the role
    into a search that may have started from an order id would mean the answer
    to "whose order is this" depended on which tab happened to be open.
  */
  const lookup = params.q ? await searchCustomers(params.q) : null

  let users: UserRow[]
  let count: number | null

  if (lookup) {
    const filtered = params.role
      ? lookup.hits.filter((hit) => hit.role === params.role)
      : lookup.hits
    users = filtered.map((hit) => ({
      id: hit.userId,
      email: hit.email ?? '',
      full_name: hit.fullName,
      role: (hit.role ?? 'customer') as AppRole,
      created_at: hit.createdAt ?? new Date(0).toISOString(),
    }))
    // The lookup is capped at 25 by the query layer and is not paginated: a
    // support search that needs a second page is a search that did not find
    // the customer, and paging through it is the wrong next move.
    count = users.length
  } else {
    let query = supabase
      .from('profiles')
      .select('id, email, full_name, role, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    // The cast covers 'read_only' until 181 regenerates the types; a filter on
    // it before apply-day simply matches zero rows.
    if (params.role) query = query.eq('role', params.role as UserRole)

    const result = await query
    count = result.count
    users = (result.data ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role as AppRole,
      created_at: p.created_at,
    }))
  }

  const urlParams = { q: params.q, role: params.role, per: params.per, page: params.page }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-ink">משתמשים</h1>
        <div className="flex flex-wrap gap-2">
          {[undefined, ...ROLE_ORDER].map((role) => (
            <Link
              key={role ?? 'all'}
              href={role ? `/admin/users?role=${role}` : '/admin/users'}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                params.role === role || (!params.role && !role)
                  ? 'bg-brand-primary text-ink'
                  : 'border border-black/10 text-black/60 hover:bg-brand-primary/30 hover:text-ink'
              }`}
            >
              {role ? ROLE_LABELS[role] : 'הכל'}
            </Link>
          ))}
        </div>
      </div>

      <FilterBar
        basePath="/admin/users"
        searchPlaceholder="שם, אימייל, טלפון או מספר הזמנה..."
        defaultQuery={params.q}
        preserve={{ role: params.role, per: params.per }}
      />

      {lookup && (
        /* Why these rows came back. A search for an order reference that
           resolves to one person is otherwise indistinguishable from a name
           search that happened to match them, and the operator needs to know
           which question was actually answered. */
        <p className="text-xs text-black/50">
          {lookup.hits.length === 0
            ? `לא נמצא לקוח עבור "${lookup.term.raw}"`
            : `${users.length} תוצאות עבור "${lookup.term.raw}" (${lookup.hits[0]?.matchedOnHe})`}
          {lookup.widened && ' · הורחב לחיפוש לפי שם'}
        </p>
      )}

      <UsersTable users={users} callerRole={callerRole} callerId={callerId} canEdit={canEdit} />

      {!lookup && (
        <TablePagination
          basePath="/admin/users"
          params={urlParams}
          page={params.page}
          perPage={params.per}
          total={count ?? 0}
        />
      )}
    </div>
  )
}
