import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import { AFFILIATE_STATUS_LABELS, REFERRAL_STATUS_LABELS, labelFor } from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { createClient } from '@/lib/supabase/server'
import type { Affiliate, AffiliateStatus, Referral } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'
import AffiliateActionsClient from './AffiliateActionsClient'

export const metadata = { title: 'שותפים והפניות' }

const AFFILIATE_STATUSES = Object.keys(AFFILIATE_STATUS_LABELS) as AffiliateStatus[]

const paramsSchema = baseListParamsSchema.extend({
  tab: z.enum(['affiliates', 'referrals']).catch('affiliates'),
  status: z.enum(AFFILIATE_STATUSES as [AffiliateStatus, ...AffiliateStatus[]]).optional(),
})

const STATUS_COLORS: Record<AffiliateStatus, string> = {
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-200 text-gray-700',
}

type AffiliateRow = Affiliate & { userName: string }
type ReferralRow = Referral & { referrerName: string; referredName: string }

export default async function AdminAffiliatesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { role } = await requireSection('affiliates')
  const canEdit = canWriteSection(role, 'affiliates')

  const raw = await props.searchParams
  const params = paramsSchema.parse(raw)
  const { from, to } = listRange(params)
  const supabase = await createClient()

  const urlParams = {
    tab: params.tab,
    status: params.status,
    per: params.per,
    page: params.page,
  }

  let table: React.ReactNode = null
  let total = 0

  if (params.tab === 'affiliates') {
    let query = supabase
      .from('affiliates')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to)
    if (params.status) query = query.eq('status', params.status)

    const { data: affiliates, count } = await query
    total = count ?? 0

    const userIds = [...new Set((affiliates ?? []).map((a) => a.user_id))]
    const { data: users } = userIds.length
      ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [] }
    const userById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? u.email]))

    const rows: AffiliateRow[] = (affiliates ?? []).map((a) => ({
      ...a,
      userName: userById.get(a.user_id) ?? a.user_id.slice(0, 8),
    }))

    const columns: ServerColumn<AffiliateRow>[] = [
      {
        id: 'user',
        header: 'משתמש',
        cell: (a) => (
          <Link href={`/admin/users/${a.user_id}`} className="font-medium hover:underline">
            {a.userName}
          </Link>
        ),
      },
      {
        id: 'code',
        header: 'קוד שותף',
        className: 'font-mono text-xs',
        cell: (a) => a.affiliate_code,
      },
      {
        id: 'status',
        header: 'סטטוס',
        cell: (a) => (
          <span
            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status]}`}
          >
            {labelFor(AFFILIATE_STATUS_LABELS, a.status)}
          </span>
        ),
      },
      {
        id: 'channel',
        header: 'ערוץ',
        className: 'max-w-48 truncate text-xs text-black/60',
        cell: (a) => a.channel_description ?? '',
      },
      {
        id: 'stats',
        header: 'קליקים / המרות',
        className: 'text-xs',
        cell: (a) =>
          `${a.total_clicks.toLocaleString('he-IL')} / ${a.total_conversions.toLocaleString('he-IL')}`,
      },
      {
        id: 'earnings',
        header: 'רווחים',
        cell: (a) => shekelsFromIlsRounded(a.total_earnings_ils),
      },
      {
        id: 'created_at',
        header: 'הוגש',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (a) => new Date(a.created_at).toLocaleDateString('he-IL'),
      },
      ...(canEdit
        ? [
            {
              id: 'actions',
              header: 'פעולות',
              cell: (a: AffiliateRow) => (
                <AffiliateActionsClient affiliateId={a.id} status={a.status} />
              ),
            } satisfies ServerColumn<AffiliateRow>,
          ]
        : []),
    ]

    table = (
      <ServerDataTable
        rows={rows}
        columns={columns}
        rowKey={(a) => a.id}
        basePath="/admin/affiliates"
        params={urlParams}
        emptyMessage="אין שותפים"
      />
    )
  } else {
    const { data: referrals, count } = await supabase
      .from('referrals')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0

    const ids = [
      ...new Set((referrals ?? []).flatMap((r) => [r.referrer_user_id, r.referred_user_id])),
    ]
    const { data: users } = ids.length
      ? await supabase.from('profiles').select('id, full_name, email').in('id', ids)
      : { data: [] }
    const userById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? u.email]))

    const rows: ReferralRow[] = (referrals ?? []).map((r) => ({
      ...r,
      referrerName: userById.get(r.referrer_user_id) ?? r.referrer_user_id.slice(0, 8),
      referredName: userById.get(r.referred_user_id) ?? r.referred_user_id.slice(0, 8),
    }))

    const columns: ServerColumn<ReferralRow>[] = [
      { id: 'referrer', header: 'מפנה', cell: (r) => r.referrerName },
      { id: 'referred', header: 'הופנה', cell: (r) => r.referredName },
      { id: 'code', header: 'קוד', className: 'font-mono text-xs', cell: (r) => r.referral_code },
      {
        id: 'status',
        header: 'סטטוס',
        cell: (r) => labelFor(REFERRAL_STATUS_LABELS, r.status),
      },
      {
        id: 'bonus',
        header: 'בונוס ששולם',
        cell: (r) => shekelsFromIlsRounded(r.bonus_paid_amount_ils),
      },
      {
        id: 'created_at',
        header: 'תאריך',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (r) => new Date(r.created_at).toLocaleDateString('he-IL'),
      },
    ]

    table = (
      <ServerDataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        basePath="/admin/affiliates"
        params={urlParams}
        emptyMessage="אין הפניות"
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">שותפים והפניות</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/admin/affiliates?tab=affiliates"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            params.tab === 'affiliates'
              ? 'bg-brand text-brand-dark'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
          }`}
        >
          שותפים
        </Link>
        <Link
          href="/admin/affiliates?tab=referrals"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            params.tab === 'referrals'
              ? 'bg-brand text-brand-dark'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
          }`}
        >
          הפניות חבר-מביא-חבר
        </Link>

        {params.tab === 'affiliates' && (
          <span className="ms-2 flex flex-wrap gap-1.5">
            {[undefined, ...AFFILIATE_STATUSES].map((status) => (
              <Link
                key={status ?? 'all'}
                href={
                  status
                    ? `/admin/affiliates?tab=affiliates&status=${status}`
                    : '/admin/affiliates?tab=affiliates'
                }
                className={`rounded-lg px-2.5 py-1 text-xs transition-colors ${
                  params.status === status || (!params.status && !status)
                    ? 'bg-black/80 text-white'
                    : 'border border-gray-200 bg-white text-gray-500 hover:text-gray-800'
                }`}
              >
                {status ? AFFILIATE_STATUS_LABELS[status] : 'הכל'}
              </Link>
            ))}
          </span>
        )}
      </div>

      {table}

      <TablePagination
        basePath="/admin/affiliates"
        params={urlParams}
        page={params.page}
        perPage={params.per}
        total={total}
      />
    </div>
  )
}
