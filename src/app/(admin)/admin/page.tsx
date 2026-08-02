import { adminLandingPath } from '@/lib/admin/nav'
import { requireStaffSession } from '@/lib/admin/rbac'
import { redirect } from 'next/navigation'

export default async function AdminDashboardRedirect() {
  const { role } = await requireStaffSession()
  redirect(adminLandingPath(role))
}
