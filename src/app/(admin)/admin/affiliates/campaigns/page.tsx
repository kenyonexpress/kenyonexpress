import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveAffiliateCampaign } from '@/server/actions/admin/affiliates'
import Link from 'next/link'

export const metadata = { title: 'קמפיינים לשותפים' }

const ERRORS: Record<string, string> = {
  forbidden: 'אין הרשאה לעריכת קמפיינים.',
  invalid: 'בדקו את הערכים: עמלה עד 50% עם עד שתי ספרות אחרי הנקודה.',
  save_failed: 'השמירה נכשלה. נסו שוב.',
}

type Campaign = {
  id: string
  name: string
  commission_bp: number
  active: boolean
  starts_at: string | null
  ends_at: string | null
}

const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function CampaignForm({ c }: { c?: Campaign }) {
  return (
    <form
      action={saveAffiliateCampaign}
      className="grid gap-3 rounded-xl border border-border bg-white p-4 sm:grid-cols-6"
    >
      {c && <input type="hidden" name="id" value={c.id} />}
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        שם
        <input
          name="name"
          defaultValue={c?.name ?? ''}
          required
          maxLength={80}
          className="rounded-md border border-border px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        עמלה (%)
        <input
          name="commission_percent"
          defaultValue={c ? (c.commission_bp / 100).toFixed(2) : ''}
          inputMode="decimal"
          required
          dir="ltr"
          className="rounded-md border border-border px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        מתאריך
        <input
          type="date"
          name="starts_at"
          defaultValue={dateValue(c?.starts_at ?? null)}
          className="rounded-md border border-border px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        עד תאריך
        <input
          type="date"
          name="ends_at"
          defaultValue={dateValue(c?.ends_at ?? null)}
          className="rounded-md border border-border px-2 py-1"
        />
      </label>
      <div className="flex items-end justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={c?.active ?? false} />
          פעיל
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-brand-primary-hover"
        >
          {c ? 'שמירה' : 'הוספה'}
        </button>
      </div>
    </form>
  )
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AffiliateCampaignsPage({ searchParams }: Props) {
  await requireSection('affiliates', 'read')
  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const { data, error } = await createAdminClient()
    .from('affiliate_campaigns' as never)
    .select('id, name, commission_bp, active, starts_at, ends_at')
    .order('created_at', { ascending: true })
  const campaigns = (data ?? []) as Campaign[]

  return (
    <div dir="rtl" className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">קמפיינים ועמלות לשותפים</h1>
        <Link href="/admin/affiliates" className="text-sm text-link hover:underline">
          חזרה לשותפים
        </Link>
      </div>
      <p className="text-sm text-muted">
        העמלה מחושבת על הסכום ששולם באתר, נשמרת להזמנה ברגע הקנייה, ומשולמת לארנק השותף אחרי 14 ימי
        הביטול. שינוי עמלה אינו משנה הזמנות שכבר נרשמו.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          טעינת הקמפיינים נכשלה.
        </p>
      )}
      {errorKey && ERRORS[errorKey] && (
        <p role="alert" className="text-sm text-red-700">
          {ERRORS[errorKey]}
        </p>
      )}
      {sp.saved === '1' && <output className="block text-sm text-green-800">נשמר.</output>}
      {campaigns.map((c) => (
        <CampaignForm key={c.id} c={c} />
      ))}
      <h2 className="pt-2 text-lg font-semibold">קמפיין חדש</h2>
      <CampaignForm />
    </div>
  )
}
