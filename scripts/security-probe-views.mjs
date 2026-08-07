#!/usr/bin/env node
/**
 * Proves, against the live REST endpoint and with nothing but the publishable
 * key, that the reporting views are not readable by an anonymous caller.
 *
 * Why a network probe and not a Vitest case: the hole this guards was never
 * visible in the schema files. It came from a view defaulting to
 * `security_invoker = off` plus a blanket grant, and the only honest way to
 * show it is closed is to ask the same endpoint an attacker would ask.
 *
 * On 2026-08-03, before migration 103, six of these seven answered 200.
 * `v_referral_review_queue` selects referrer_email and referred_email;
 * `v_wallet_balance_drift` selects user_id with balances. They returned an
 * empty array only because production had no referrals and no wallets yet.
 *
 * Re-run this after applying 103, and again after any migration that drops and
 * recreates one of these views -- a recreated view does not inherit
 * `security_invoker`, so the hole can reopen without a single line of app code
 * changing. PENDING-money-integer-fix.sql rebuilds v_wallet_balance_drift and
 * is exactly that case.
 *
 *   node scripts/security-probe-views.mjs
 *
 * Reads SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL and the publishable (anon) key
 * from the environment. Exits non-zero if any view answers 200.
 */

const VIEWS = [
  'v_abandoned_cart_recovery',
  'v_cart_reaper_backlog',
  'v_discount_campaign_performance',
  'v_newsletter_stats',
  'v_referral_review_queue',
  'v_referral_stats',
  'v_wallet_balance_drift',
]

const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(
  /\/+$/,
  '',
)

const key =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''

if (!url || !key) {
  console.error(
    'security-probe-views: need a project URL and a publishable key in the environment.\n' +
      '  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL\n' +
      '  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )
  process.exit(2)
}

const exposed = []

for (const view of VIEWS) {
  const endpoint = `${url}/rest/v1/${view}?select=*&limit=1`
  let status
  let body = ''
  try {
    const res = await fetch(endpoint, { headers: { apikey: key } })
    status = res.status
    body = (await res.text()).slice(0, 200)
  } catch (err) {
    console.error(`  ?    ${view} — request failed: ${err.message}`)
    continue
  }

  // 200 means an anonymous caller read it. Anything else (401/403/404) means
  // the grant is gone or RLS is being evaluated as the caller, which is the
  // outcome we want.
  if (status === 200) {
    exposed.push({ view, body })
    console.error(`  LEAK ${view} — HTTP 200 ${body}`)
  } else {
    console.log(`  ok   ${view} — HTTP ${status}`)
  }
}

if (exposed.length > 0) {
  console.error(
    `\nsecurity-probe-views: ${exposed.length}/${VIEWS.length} views are readable by anon.`,
  )
  console.error('Apply supabase/migrations/103_lock_definer_views_and_rpcs.sql, or re-apply the')
  console.error('`security_invoker = on` and REVOKE for any view a later migration recreated.')
  process.exit(1)
}

console.log(`\nsecurity-probe-views: all ${VIEWS.length} views closed to anon.`)
