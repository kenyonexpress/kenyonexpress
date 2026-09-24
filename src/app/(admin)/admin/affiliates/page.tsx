import ServerDataTable, { type ServerColumn } from '@/components/admin/ServerDataTable'
import TablePagination from '@/components/admin/TablePagination'
import { formatIls } from '@/lib/account/format'
import { AFFILIATE_STATUS_LABELS, REFERRAL_STATUS_LABELS, labelFor } from '@/lib/admin/labels'
import { baseListParamsSchema, listRange } from '@/lib/admin/list-params'
import { canWriteSection } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { commissionPercent } from '@/lib/affiliates/format'
import { formatDateShort, formatNumber } from '@/lib/i18n/format'
import { type Agorot, agorot, agorotToIls } from '@/lib/money'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import type { Affiliate, AffiliateStatus, Referral } from '@/types/database'
import Link from 'next/link'
import { z } from 'zod'
import AffiliateActionsClient from './AffiliateActionsClient'
import CampaignForm, { type CampaignFormValues } from './CampaignForm'
import ConversionActionsClient from './ConversionActionsClient'

export const metadata = { title: 'שותפים והפניות' }

const AFFILIATE_STATUSES = Object.keys(AFFILIATE_STATUS_LABELS) as AffiliateStatus[]

const TABS = ['affiliates', 'referrals', 'campaigns', 'conversions'] as const
type Tab = (typeof TABS)[number]

const TAB_LABELS: Record<Tab, string> = {
  affiliates: 'שותפים',
  referrals: 'הפניות חבר-מביא-חבר',
  campaigns: 'קמפיינים ועמלות',
  conversions: 'מכירות שותפים',
}

const paramsSchema = baseListParamsSchema.extend({
  tab: z.enum(TABS).catch('affiliates'),
  status: z.enum(AFFILIATE_STATUSES as [AffiliateStatus, ...AffiliateStatus[]]).optional(),
  edit: z.string().uuid().optional().catch(undefined),
})

const STATUS_COLORS: Record<AffiliateStatus, string> = {
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-200 text-gray-700',
}

const CONVERSION_LABELS: Record<string, string> = {
  pending: 'ממתין לזיכוי',
  flagged: 'סומן לבדיקה',
  paid: 'זוכה',
  rejected: 'נדחה',
}

const CONVERSION_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  flagged: 'bg-orange-100 text-orange-800',
  paid: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const FLAG_LABELS: Record<string, string> = {
  same_device: 'אותו מכשיר',
  same_ip: 'אותה כתובת IP',
  same_card: 'אותו כרטיס',
  velocity: 'מעל המכסה היומית',
  manual_approval: 'אישור ידני בקמפיין',
  self_purchase: 'רכישה עצמית',
  referral_bonus_paid: 'שולם בונוס חבר-מביא-חבר',
}

/** Postgres: undefined_table. A database without 244 has neither new table. */
const UNDEFINED_TABLE = '42P01'
const NOT_APPLIED_NOTICE =
  'הטבלאות של תוכנית השותפים עדיין לא קיימות בבסיס הנתונים. יש להחיל את migrations/pending/244_affiliate_campaigns.sql.'

type AffiliateRow = Affiliate & { userName: string }
type ReferralRow = Referral & { referrerName: string; referredName: string }

interface CampaignDb {
  id: string
  name: string
  commission_bp: number
  min_order_agorot: number
  max_commission_agorot: number | null
  budget_agorot: number | null
  max_conversions_per_day: number
  require_manual_approval: boolean
  starts_at: string
  ends_at: string | null
  is_active: boolean
  category_id: string | null
  product_id: string | null
  created_at: string
}

interface ConversionDb {
  id: string
  affiliate_id: string
  campaign_id: string
  order_id: string
  buyer_user_id: string
  order_agorot: number
  commission_agorot: number
  status: string
  flagged_reasons: string[] | null
  rejection_reason: string | null
  created_at: string
  paid_at: string | null
}

type ConversionRow = ConversionDb & {
  affiliateName: string
  buyerName: string
  campaignName: string
}

function columnAgorot(value: number | null | undefined): Agorot {
  return agorot(Math.round(Number(value ?? 0)))
}

/** Agorot → shekel text for a form default, empty when null. */
function ilsText(value: number | null): string {
  if (value === null) return ''
  return String(agorotToIls(columnAgorot(value)))
}

function campaignFormValues(row: CampaignDb | null): CampaignFormValues {
  if (!row) {
    return {
      id: null,
      name: '',
      commission_percent: '',
      min_order_ils: '',
      max_commission_ils: '',
      budget_ils: '',
      max_conversions_per_day: 20,
      require_manual_approval: false,
      starts_at: null,
      ends_at: null,
      is_active: true,
      category_id: null,
      product_id: null,
    }
  }
  return {
    id: row.id,
    name: row.name,
    commission_percent: commissionPercent(row.commission_bp).replace('%', ''),
    min_order_ils: ilsText(row.min_order_agorot),
    max_commission_ils: ilsText(row.max_commission_agorot),
    budget_ils: ilsText(row.budget_agorot),
    max_conversions_per_day: row.max_conversions_per_day,
    require_manual_approval: row.require_manual_approval,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    is_active: row.is_active,
    category_id: row.category_id,
    product_id: row.product_id,
  }
}

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
  let above: React.ReactNode = null
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
        cell: (a) => `${formatNumber(a.total_clicks)} / ${formatNumber(a.total_conversions)}`,
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
        cell: (a) => formatDateShort(a.created_at),
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
  } else if (params.tab === 'referrals') {
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
        cell: (r) => formatDateShort(r.created_at),
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
  } else if (params.tab === 'campaigns') {
    const { data, error, count } = await supabase
      .from('affiliate_campaigns' as never)
      .select(
        'id, name, commission_bp, min_order_agorot, max_commission_agorot, budget_agorot, max_conversions_per_day, require_manual_approval, starts_at, ends_at, is_active, category_id, product_id, created_at',
        { count: 'exact' },
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0
    const missing = error?.code === UNDEFINED_TABLE
    const rows = (missing || error ? [] : (data ?? [])) as unknown as CampaignDb[]

    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true })
      .limit(500)
    if (categoriesError) {
      // The picker degrades to "every product"; the campaign can still be saved.
      log.warn('affiliate_campaigns.categories_read_failed', { reason: categoriesError.message })
    }
    const categoryById = new Map((categories ?? []).map((c) => [c.id, c.name]))

    const editing = params.edit ? (rows.find((r) => r.id === params.edit) ?? null) : null

    above = (
      <div className="space-y-3">
        {missing && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {NOT_APPLIED_NOTICE}
          </p>
        )}
        {error && !missing && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            קריאת הקמפיינים נכשלה: {error.message}
          </p>
        )}
        <details open={!!editing || rows.length === 0} className="rounded-lg">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">
            {editing ? `עריכת הקמפיין: ${editing.name}` : 'קמפיין חדש'}
          </summary>
          <div className="mt-2">
            <CampaignForm
              key={editing?.id ?? 'new'}
              values={campaignFormValues(editing)}
              readOnly={!canEdit || missing}
              categories={(categories ?? []).map((c) => ({ id: c.id, name: c.name }))}
            />
          </div>
        </details>
      </div>
    )

    const columns: ServerColumn<CampaignDb>[] = [
      {
        id: 'name',
        header: 'קמפיין',
        cell: (c) => (
          <Link
            href={`/admin/affiliates?tab=campaigns&edit=${c.id}`}
            className="font-medium hover:underline"
          >
            {c.name}
          </Link>
        ),
      },
      { id: 'commission', header: 'עמלה', cell: (c) => commissionPercent(c.commission_bp) },
      {
        id: 'scope',
        header: 'היקף',
        className: 'text-xs',
        cell: (c) =>
          c.product_id
            ? `מוצר ${c.product_id.slice(0, 8)}`
            : c.category_id
              ? (categoryById.get(c.category_id) ?? 'קטגוריה')
              : 'כל האתר',
      },
      {
        id: 'limits',
        header: 'מינימום / תקרה / תקציב',
        className: 'text-xs',
        cell: (c) =>
          [
            formatIls(columnAgorot(c.min_order_agorot)),
            c.max_commission_agorot === null
              ? 'ללא'
              : formatIls(columnAgorot(c.max_commission_agorot)),
            c.budget_agorot === null ? 'ללא' : formatIls(columnAgorot(c.budget_agorot)),
          ].join(' / '),
      },
      {
        id: 'window',
        header: 'חלון',
        className: 'whitespace-nowrap text-xs text-black/60',
        cell: (c) =>
          `${formatDateShort(c.starts_at)}${c.ends_at ? ` - ${formatDateShort(c.ends_at)}` : ''}`,
      },
      {
        id: 'active',
        header: 'מצב',
        cell: (c) => (
          <span
            className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}
          >
            {c.is_active ? 'פעיל' : 'כבוי'}
            {c.require_manual_approval ? ' · אישור ידני' : ''}
          </span>
        ),
      },
    ]

    table = (
      <ServerDataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        basePath="/admin/affiliates"
        params={urlParams}
        emptyMessage={missing ? 'אין טבלת קמפיינים' : 'אין קמפיינים. צרו את הראשון למעלה.'}
      />
    )
  } else {
    const { data, error, count } = await supabase
      .from('affiliate_conversions' as never)
      .select(
        'id, affiliate_id, campaign_id, order_id, buyer_user_id, order_agorot, commission_agorot, status, flagged_reasons, rejection_reason, created_at, paid_at',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to)
    total = count ?? 0
    const missing = error?.code === UNDEFINED_TABLE
    const conversions = (missing || error ? [] : (data ?? [])) as unknown as ConversionDb[]

    const affiliateIds = [...new Set(conversions.map((c) => c.affiliate_id))]
    const campaignIds = [...new Set(conversions.map((c) => c.campaign_id))]
    const [{ data: affiliates }, { data: campaigns }] = await Promise.all([
      affiliateIds.length
        ? supabase.from('affiliates').select('id, user_id').in('id', affiliateIds)
        : Promise.resolve({ data: [] as Array<{ id: string; user_id: string }> }),
      campaignIds.length
        ? supabase
            .from('affiliate_campaigns' as never)
            .select('id, name')
            .in('id', campaignIds)
        : Promise.resolve({ data: [] as unknown }),
    ])
    const affiliateUser = new Map((affiliates ?? []).map((a) => [a.id, a.user_id]))
    const campaignName = new Map(
      ((campaigns ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]),
    )
    const userIds = [
      ...new Set([...conversions.map((c) => c.buyer_user_id), ...affiliateUser.values()]),
    ]
    const { data: users } = userIds.length
      ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
      : { data: [] }
    const userById = new Map((users ?? []).map((u) => [u.id, u.full_name ?? u.email]))

    const rows: ConversionRow[] = conversions.map((c) => {
      const affiliateUserId = affiliateUser.get(c.affiliate_id)
      return {
        ...c,
        affiliateName:
          (affiliateUserId ? userById.get(affiliateUserId) : null) ?? c.affiliate_id.slice(0, 8),
        buyerName: userById.get(c.buyer_user_id) ?? c.buyer_user_id.slice(0, 8),
        campaignName: campaignName.get(c.campaign_id) ?? c.campaign_id.slice(0, 8),
      }
    })

    above = missing ? (
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {NOT_APPLIED_NOTICE}
      </p>
    ) : null

    const columns: ServerColumn<ConversionRow>[] = [
      { id: 'affiliate', header: 'שותף', cell: (c) => c.affiliateName },
      { id: 'buyer', header: 'קונה', cell: (c) => c.buyerName },
      { id: 'campaign', header: 'קמפיין', className: 'text-xs', cell: (c) => c.campaignName },
      {
        id: 'order',
        header: 'הזמנה',
        className: 'font-mono text-xs',
        cell: (c) => (
          <Link href={`/admin/orders/${c.order_id}`} className="hover:underline">
            {c.order_id.slice(0, 8).toUpperCase()}
          </Link>
        ),
      },
      { id: 'base', header: 'שולם באתר', cell: (c) => formatIls(columnAgorot(c.order_agorot)) },
      {
        id: 'commission',
        header: 'עמלה',
        cell: (c) => formatIls(columnAgorot(c.commission_agorot)),
      },
      {
        id: 'status',
        header: 'סטטוס',
        cell: (c) => (
          <span className="flex flex-col gap-0.5">
            <span
              className={`inline-flex w-fit rounded px-2 py-0.5 text-xs font-medium ${CONVERSION_COLORS[c.status] ?? ''}`}
            >
              {CONVERSION_LABELS[c.status] ?? c.status}
            </span>
            {(c.flagged_reasons ?? []).length > 0 && (
              <span className="text-xs text-black/60">
                {(c.flagged_reasons ?? []).map((r) => FLAG_LABELS[r] ?? r).join(', ')}
              </span>
            )}
            {c.rejection_reason && !(c.flagged_reasons ?? []).includes(c.rejection_reason) && (
              <span className="text-xs text-black/60">{c.rejection_reason}</span>
            )}
          </span>
        ),
      },
      {
        id: 'created_at',
        header: 'תאריך',
        sortKey: 'created_at',
        className: 'whitespace-nowrap text-xs text-black/50',
        cell: (c) => formatDateShort(c.created_at),
      },
      ...(canEdit
        ? [
            {
              id: 'actions',
              header: 'פעולות',
              cell: (c: ConversionRow) => (
                <ConversionActionsClient conversionId={c.id} status={c.status} />
              ),
            } satisfies ServerColumn<ConversionRow>,
          ]
        : []),
    ]

    table = (
      <ServerDataTable
        rows={rows}
        columns={columns}
        rowKey={(c) => c.id}
        basePath="/admin/affiliates"
        params={urlParams}
        emptyMessage={missing ? 'אין טבלת מכירות' : 'עדיין אין מכירות דרך שותפים'}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">שותפים והפניות</h1>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab}
            href={`/admin/affiliates?tab=${tab}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              params.tab === tab
                ? 'bg-brand text-brand-dark'
                : 'border border-gray-200 bg-white text-gray-600 hover:border-brand hover:text-brand'
            }`}
          >
            {TAB_LABELS[tab]}
          </Link>
        ))}

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

      {above}

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
