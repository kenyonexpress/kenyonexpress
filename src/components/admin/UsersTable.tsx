'use client'

import UserRoleClient from '@/app/(admin)/admin/users/UserRoleClient'
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable'
import { ROLE_LABELS } from '@/lib/admin/roles'
import type { UserRole } from '@/types/database'

export type UserRow = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  created_at: string
}

const ROLE_BADGE: Record<UserRole, string> = {
  customer: 'bg-black/5 text-black/60',
  vendor: 'bg-blue-100 text-blue-800',
  content_uploader: 'bg-purple-100 text-purple-800',
  support: 'bg-teal-100 text-teal-800',
  admin: 'bg-[#fed700] text-[#000000]',
  super_admin: 'bg-red-100 text-red-800',
}

interface Props {
  users: UserRow[]
  callerRole: UserRole
}

export default function UsersTable({ users, callerRole }: Props) {
  const columns: DataTableColumn<UserRow>[] = [
    {
      id: 'name',
      header: 'משתמש',
      sortable: true,
      accessor: (u) => u.full_name ?? u.email,
      cell: (u) => <span className="font-medium">{u.full_name ?? '—'}</span>,
    },
    {
      id: 'email',
      header: 'אימייל',
      sortable: true,
      accessor: (u) => u.email,
      cell: (u) => <span className="text-black/70">{u.email}</span>,
    },
    {
      id: 'role',
      header: 'תפקיד',
      sortable: true,
      accessor: (u) => u.role,
      cell: (u) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role] ?? 'bg-black/5 text-black/60'}`}
        >
          {ROLE_LABELS[u.role] ?? u.role}
        </span>
      ),
    },
    {
      id: 'created',
      header: 'הצטרפות',
      sortable: true,
      accessor: (u) => u.created_at,
      cell: (u) => (
        <span className="text-xs text-black/50">
          {new Date(u.created_at).toLocaleDateString('he-IL')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'שינוי תפקיד',
      className: 'w-48',
      cell: (u) => <UserRoleClient userId={u.id} currentRole={u.role} callerRole={callerRole} />,
    },
  ]

  return (
    <DataTable
      data={users}
      columns={columns}
      rowKey={(u) => u.id}
      searchKeys={[(u) => u.full_name ?? '', (u) => u.email, (u) => ROLE_LABELS[u.role] ?? '']}
      searchPlaceholder="חיפוש משתמשים..."
      emptyMessage="אין משתמשים"
    />
  )
}
