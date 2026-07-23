import VendorForm from '@/components/admin/VendorForm'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת ספק' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditVendorPage({ params }: Props) {
  const { id } = await params
  await requireAdminPage()
  const supabase = await createClient()

  const { data: vendor } = await supabase.from('vendors').select('*').eq('id', id).single()
  if (!vendor) notFound()

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת ספק — {vendor.business_name}</h1>
      <VendorForm vendor={vendor} />
    </div>
  )
}
