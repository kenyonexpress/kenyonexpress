import { formatDate, formatIls } from '@/lib/account/format'
import { agorot } from '@/lib/commerce/money'
import { createClient } from '@/lib/supabase/server'
import { urlQrDataUrl } from '@/lib/vouchers/qr-image'
import { createAffiliateLink, joinAffiliateProgram } from '@/server/actions/affiliate'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

export const metadata = { title: 'תוכנית השותפים שלי', robots: { index: false } }

const ERRORS: Record<string, string> = {
  rate: 'יותר מדי ניסיונות. נסו שוב בעוד שעה.',
  join: 'ההרשמה נכשלה. נסו שוב.',
  link: 'יצירת הקישור נכשלה. בדקו את הנתיב ונסו שוב.',
  not_approved: 'אפשר ליצור קישורים רק אחרי שהחשבון אושר.',
  campaign: 'הקמפיין הזה אינו פעיל.',
}

const STATUS_HE: Record<string, string> = {
  pending_review: 'ממתין לאישור',
  approved: 'מאושר',
  rejected: 'נדחה',
  suspended: 'מושעה',
}

const ATTRIBUTION_HE: Record<string, string> = {
  pending: 'ממתין (14 ימי ביטול)',
  paid: 'שולם לארנק',
  reversed: 'בוטל',
}

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The affiliate's own page: status, links per campaign, counted clicks and
 * the orders they brought. Everything is read on the user's session, so the
 * migration-283 RLS policies decide what is visible.
 */
/**
 * The session read sits inside Suspense: this route lives in the (store)
 * group, whose shell is prerendered, and cacheComponents refuses a cookie
 * read outside a boundary.
 */
export default function AccountAffiliatePage(props: Props) {
  return (
    <Suspense fallback={<main dir="rtl" className="mx-auto max-w-3xl px-4 py-8" />}>
      <AffiliateContent {...props} />
    </Suspense>
  )
}

async function AffiliateContent({ searchParams }: Props) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/account/affiliate')
  const sp = await searchParams
  const errorKey = typeof sp.error === 'string' ? sp.error : null
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )

  const { data: affiliate, error: affiliateError } = await supabase
    .from('affiliates')
    .select('id, status, created_at')
    .eq('user_id', user.id)
    .maybeSingle()
  // Not an affiliate and "could not tell" are different pages: the first offers
  // the join form, the second must not.
  if (affiliateError) throw new Error(`affiliates read failed: ${affiliateError.message}`)

  if (!affiliate) {
    return (
      <main dir="rtl" className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-bold text-heading">תוכנית השותפים</h1>
        <p>
          ממליצים על דילים מהאתר ומקבלים עמלה לארנק על כל הזמנה ששולמה דרך הקישור שלכם, אחרי שעברו
          14 ימי הביטול. העמלה נקבעת לפי הקמפיין.
        </p>
        {errorKey && ERRORS[errorKey] && (
          <p role="alert" className="text-sm text-red-700">
            {ERRORS[errorKey]}
          </p>
        )}
        <form action={joinAffiliateProgram} className="space-y-3">
          <label className="block">
            <span className="text-sm">איפה תפרסמו? (לא חובה)</span>
            <textarea
              name="channel_description"
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-md border border-border p-2"
            />
          </label>
          <button type="submit" className="account-btn">
            הצטרפות לתוכנית
          </button>
        </form>
      </main>
    )
  }

  const [{ data: campaigns }, { data: links }, { data: attributions }, { data: clicks }] =
    await Promise.all([
      supabase
        .from('affiliate_campaigns' as never)
        .select('id, name, commission_bp')
        .eq('active', true)
        .order('created_at', { ascending: true }),
      supabase
        .from('affiliate_links' as never)
        .select('id, code, target_path, campaign_id, created_at')
        .eq('affiliate_id', affiliate.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('affiliate_attributions' as never)
        .select('id, status, commission_agorot, created_at')
        .eq('affiliate_id', affiliate.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('affiliate_clicks' as never)
        .select('link_id')
        .limit(5000),
    ])

  const campaignRows = (campaigns ?? []) as { id: string; name: string; commission_bp: number }[]
  const linkRows = (links ?? []) as {
    id: string
    code: string
    target_path: string
    campaign_id: string
  }[]
  const attributionRows = (attributions ?? []) as {
    id: string
    status: string
    commission_agorot: number | null
    created_at: string
  }[]
  const clickCount = new Map<string, number>()
  for (const c of (clicks ?? []) as { link_id: string }[]) {
    clickCount.set(c.link_id, (clickCount.get(c.link_id) ?? 0) + 1)
  }
  const linkUrl = (l: { code: string; target_path: string }) =>
    `${site}${l.target_path}${l.target_path.includes('?') ? '&' : '?'}ref=${l.code}`
  const qrs = await Promise.all(linkRows.map((l) => urlQrDataUrl(linkUrl(l))))
  const pending = attributionRows
    .filter((a) => a.status === 'pending')
    .reduce((sum, a) => sum + Number(a.commission_agorot ?? 0), 0)
  const earned = attributionRows
    .filter((a) => a.status === 'paid')
    .reduce((sum, a) => sum + Number(a.commission_agorot ?? 0), 0)

  return (
    <main dir="rtl" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-heading">תוכנית השותפים שלי</h1>
      <p>
        סטטוס: <strong>{STATUS_HE[affiliate.status] ?? affiliate.status}</strong> · שולם לארנק עד
        היום: <strong>{formatIls(agorot(earned))}</strong>
        {' · '}ממתין לשחרור: <strong>{formatIls(agorot(pending))}</strong>
      </p>
      {errorKey && ERRORS[errorKey] && (
        <p role="alert" className="text-sm text-red-700">
          {ERRORS[errorKey]}
        </p>
      )}

      {affiliate.status === 'approved' && (
        <section className="space-y-3 rounded-xl border border-border p-4">
          <h2 className="text-lg font-semibold">קישור חדש</h2>
          {campaignRows.length === 0 ? (
            <p className="text-sm text-muted">אין כרגע קמפיין פעיל.</p>
          ) : (
            <form action={createAffiliateLink} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                קמפיין
                <select name="campaign_id" className="rounded-md border border-border px-2 py-1">
                  {campaignRows.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({(c.commission_bp / 100).toFixed(2)}%)
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                דף יעד באתר
                <input
                  name="target_path"
                  defaultValue="/"
                  dir="ltr"
                  maxLength={200}
                  className="rounded-md border border-border px-2 py-1"
                />
              </label>
              <button type="submit" className="account-btn">
                יצירת קישור
              </button>
            </form>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">הקישורים שלי</h2>
        {linkRows.length === 0 ? (
          <p className="text-sm text-muted">עוד אין קישורים.</p>
        ) : (
          <ul className="space-y-2">
            {linkRows.map((l, i) => (
              <li
                key={l.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
              >
                {qrs[i] && <img src={qrs[i] ?? ''} alt="קוד QR לקישור" width={96} height={96} />}
                <div>
                  <code dir="ltr" className="break-all">
                    {linkUrl(l)}
                  </code>
                  <span className="ms-2 text-muted">{clickCount.get(l.id) ?? 0} כניסות</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">הזמנות שהבאתם</h2>
        {attributionRows.length === 0 ? (
          <p className="text-sm text-muted">עוד אין הזמנות.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {attributionRows.map((a) => (
              <li key={a.id}>
                {formatDate(a.created_at)} · {ATTRIBUTION_HE[a.status] ?? a.status}
                {a.commission_agorot != null &&
                  ` · ${formatIls(agorot(Number(a.commission_agorot)))}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
