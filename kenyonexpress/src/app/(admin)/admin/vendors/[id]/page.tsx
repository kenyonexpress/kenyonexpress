import StatusBadge, { vendorStatusBadge } from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import VendorDetailClient from './VendorDetailClient'

export const metadata = { title: 'פרטי ספק' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function VendorDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: vendor } = await supabase
    .from('vendors')
    .select('*, profiles(full_name, email, phone)')
    .eq('id', id)
    .single()

  if (!vendor) notFound()

  const profile = Array.isArray(vendor.profiles) ? vendor.profiles[0] : vendor.profiles

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900">{vendor.business_name}</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
        <h2 className="font-semibold text-gray-800">פרטי עסק</h2>
        <InfoRow label="ח.פ / עוסק מורשה" value={vendor.business_id} mono />
        <InfoRow label="אימייל איש קשר" value={vendor.contact_email} />
        <InfoRow label="טלפון" value={vendor.contact_phone ?? '—'} />
        <InfoRow label="כתובת" value={vendor.address ?? '—'} />
        <InfoRow label="שם בעלים" value={profile?.full_name ?? '—'} />
        <InfoRow label="אימייל בעלים" value={profile?.email ?? '—'} />
        <InfoRow label="סטטוס" value={<StatusBadge {...vendorStatusBadge(vendor.status)} />} />
        <InfoRow label="עמלת פלטפורמה" value={`${vendor.commission_rate}%`} />
      </div>

      <VendorDetailClient
        vendorId={vendor.id}
        currentStatus={vendor.status}
        currentCommission={vendor.commission_rate}
      />
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
