import { CONSENT_COOKIE, parseConsent } from '@/lib/analytics/consent'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * The access right as a download: everything the site holds about the signed-in
 * person, as one JSON file (/account/privacy links here).
 *
 * Every read goes through the request-scoped client, so RLS draws the line of
 * what leaves: the export can never contain a row its owner could not already
 * see in the UI, and adding a table here cannot widen anything. That is also
 * why there are no .eq('user_id', ...) filters doing security work; the ones
 * that matter are in the policies.
 *
 * payment_tokens deliberately selects the masked columns only. The Cardcom
 * token reference is our processor plumbing, not the user's personal data,
 * and a token string in a downloaded file on a shared computer is a charge
 * instrument lying on the floor.
 */

const SECTION_QUERIES = {
  profile: (db: Db) =>
    db
      .from('profiles')
      .select('email, full_name, phone, avatar_url, affiliate_code, total_purchases, created_at')
      .maybeSingle(),
  addresses: (db: Db) =>
    db
      .from('user_addresses')
      .select(
        'full_name, phone, street, street_number, apartment, entrance, floor, city, zip, notes_for_courier, is_default, created_at',
      ),
  orders: (db: Db) =>
    db
      .from('orders')
      .select(
        'id, status, subtotal_ils, discount_ils, cashback_applied_ils, total_ils, currency, invoice_number, referral_code_used, notes, created_at, paid_at, order_items(product_type, quantity, unit_price_ils, total_price_ils, item_status, supplier_name, created_at)',
      )
      .order('created_at', { ascending: false }),
  payment_methods: (db: Db) =>
    db
      .from('payment_tokens')
      .select('card_brand, last_4, expiry_month, expiry_year, is_default, created_at'),
  wallet_accounts: (db: Db) => db.from('wallet_accounts').select('balance_ils, code, created_at'),
  wallet_transactions: (db: Db) =>
    db
      .from('wallet_transactions')
      .select(
        'type, source, amount_ils, gross_amount_ils, cashback_percent, notes, related_order_id, created_at',
      )
      .order('created_at', { ascending: false }),
  vouchers: (db: Db) =>
    db
      .from('vouchers')
      .select(
        'code, status, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot, issued_at, expires_at, redeemed_at, created_at',
      ),
  referrals: (db: Db) =>
    db
      .from('referrals')
      .select('referral_code, status, bonus_paid_amount_ils, completed_at, created_at'),
} as const

type Db = Awaited<ReturnType<typeof createClient>>

async function handleGET(): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Each export reads a dozen tables; a loop hammering it is a cheap way to
  // load the database, and no person needs their data five times an hour.
  const allowed = await checkRateLimit(`data-export:${user.id}`, 5, 3600)
  if (!allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const names = Object.keys(SECTION_QUERIES) as Array<keyof typeof SECTION_QUERIES>
  const entries = await Promise.all(
    names.map(async (name) => ({ name, result: await SECTION_QUERIES[name](supabase) })),
  )

  const sections: Record<string, unknown> = {}
  const unavailable: string[] = []
  for (const { name, result } of entries) {
    if (result.error) {
      // One broken table must not turn the whole legal right into a 500; the
      // file says which section is missing instead of silently omitting it.
      unavailable.push(name)
      log.error('privacy.export_section_failed', { section: name, reason: result.error.message })
      sections[name] = null
    } else {
      sections[name] = result.data
    }
  }

  const consentRaw = (await cookies()).get(CONSENT_COOKIE)?.value ?? null

  const body = {
    format: 'kenyonexpress-data-export/1',
    generated_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email ?? null,
      phone: user.phone || null,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at ?? null,
    },
    analytics_consent: parseConsent(consentRaw),
    sections_unavailable: unavailable,
    ...sections,
  }

  return NextResponse.json(body, {
    headers: {
      'Content-Disposition': `attachment; filename="kenyonexpress-data-${new Date().toISOString().slice(0, 10)}.json"`,
      // A personal-data file must never land in a shared or CDN cache.
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withRequestLog('/api/account/export', handleGET)
