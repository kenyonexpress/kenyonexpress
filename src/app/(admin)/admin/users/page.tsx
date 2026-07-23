import UsersTable, { type UserRow } from '@/components/admin/UsersTable'
import { userListParamsSchema } from '@/lib/admin/page-params'
import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database'

export const metadata = { title: 'משתמשים' }

const ROLE_FILTERS: { value: UserRole | ''; label: string }[] = [
  { value: '', label: 'הכל' },
  { value: 'admin', label: 'מנהל' },
  { value: 'content_uploader', label: 'מעלה תוכן' },
  { value: 'vendor', label: 'ספק' },
]

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const { userId: callerId, role: callerRole } = await requireAdminSession()
  const raw = await searchParams
  const parsed = userListParamsSchema.safeParse({
    role: typeof raw.role === 'string' ? raw.role : undefined,
  })

  const roleFilter = parsed.success ? parsed.data.role : undefined

  const supabase = await createClient()
  let query = supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .order('created_at', { ascending: false })

  if (roleFilter) query = query.eq('role', roleFilter)

  const { data: profiles } = await query

  const users: UserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    full_name: p.full_name,
    role: p.role as UserRole,
    created_at: p.created_at,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-[#000000]">משתמשים</h1>
        <div className="flex flex-wrap gap-2">
          {ROLE_FILTERS.map((f) => (
            <a
              key={f.value || 'all'}
              href={f.value ? `/admin/users?role=${f.value}` : '/admin/users'}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                (roleFilter ?? '') === f.value
                  ? 'bg-[#fed700] text-[#000000]'
                  : 'border border-black/10 text-black/60 hover:bg-[#fed700]/30 hover:text-[#000000]'
              }`}
            >
              {f.label}
            </a>
          ))}
        </div>
      </div>

      <UsersTable users={users} callerRole={callerRole} callerId={callerId} />
    </div>
  )
}
