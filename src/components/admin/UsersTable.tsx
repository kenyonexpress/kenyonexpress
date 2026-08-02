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
  admin: 'bg-brand-primary text-black',
  super_admin: 'bg-red-100 text-red-800',
}

interface Props {
  users: UserRow[]
  callerRole: UserRole
  callerId: string
  canEdit?: boolean
}

export default function UsersTable({ users, callerRole, callerId, canEdit = true }: Props) {
  const columns: DataTableColumn<UserRow>[] = [
    {
      id: 'name',
      header: 'משתמש',
      sortable: true,
      accessor: (u) => u.full_name ?? u.email,
      cell: (u) => (
        <a href={`/admin/users/${u.id}`} className="font-medium hover:underline">
          {u.full_name ?? u.email}
        </a>
      ),
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
  ]

  // The page computes canWriteSection(callerRole, 'users') and passes it in;
  // until now the prop was accepted and ignored, so a read-only viewer still
  // got a role dropdown. The server action rejected the write, but offering a
  // control that always fails is its own bug. Drop the column instead.
  if (canEdit) {
    columns.push({
      id: 'actions',
      header: 'שינוי תפקיד',
      className: 'w-48',
      cell: (u) => (
        <UserRoleClient
          userId={u.id}
          currentRole={u.role}
          callerRole={callerRole}
          isSelf={u.id === callerId}
        />
      ),
    })
  }

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
