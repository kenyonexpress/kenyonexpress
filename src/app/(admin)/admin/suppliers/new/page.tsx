import VendorForm from '@/components/admin/VendorForm'
import { eligibleVendorProfiles } from '@/lib/admin/vendor-form'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'ספק חדש' }

export default async function NewVendorPage() {
  const supabase = await createClient()

  const [{ data: profiles }, { data: vendors }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name')
      .order('created_at', { ascending: false }),
    supabase.from('vendors').select('profile_id').is('deleted_at', null),
  ])

  const linkedProfileIds = (vendors ?? []).map((v) => v.profile_id)
  const available = eligibleVendorProfiles(profiles ?? [], linkedProfileIds)

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">ספק חדש</h1>
      <p className="text-sm text-gray-500">
        בחרו את המשתמש שישויך לספק. יש ליצור את המשתמש מראש (דרך הרשמה או מסך המשתמשים).
      </p>
      <VendorForm profiles={available} />
    </div>
  )
}
