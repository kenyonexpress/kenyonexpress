import FilterBar from '@/components/admin/FilterBar'
import TablePagination from '@/components/admin/TablePagination'
import UsersTable, { type UserRow } from '@/components/admin/UsersTable'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { canWriteSection } from '@/lib/admin/permissions'
import { ROLE_LABELS, ROLE_ORDER, requireSection } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'

export const metadata = { title: 'משתמשים' }

const paramsSchema = baseListParamsSchema.extend({
  role: z.enum(ROLE_ORDER as [UserRole, ...UserRole[]]).optional(),
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
  let query = supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.role) query = query.eq('role', params.role)
  if (params.q) query = query.or(`full_name.ilike.%${params.q}%,email.ilike.%${params.q}%`)

  const { data: profiles, count } = await query

  const users: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role as UserRole,
    created_at: p.created_at,
  }))

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
        searchPlaceholder="חיפוש לפי שם או אימייל..."
        defaultQuery={params.q}
        preserve={{ role: params.role, per: params.per }}
      />

      <UsersTable users={users} callerRole={callerRole} callerId={callerId} canEdit={canEdit} />

      <TablePagination
        basePath="/admin/users"
        params={urlParams}
        page={params.page}
        perPage={params.per}
        total={count ?? 0}
      />
    </div>
  )
}
