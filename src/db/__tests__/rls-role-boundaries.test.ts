// @vitest-environment node
import { type SupabaseClient, createClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * WHERE EACH ROLE'S REACH ENDS, ASSERTED AGAINST THE LIVE POLICIES.
 *
 * The queue asks for boundary tests for "customer, content-uploader,
 * coupon-partner, admin". Three of those exist. `coupon_partner` is not in
 * `user_role` and is named by zero of the 146 policies in production; supplier
 * access is membership in `supplier_members`, not a profile role at all. So
 * the fourth subject here is that membership. See docs/DECISION-LOG.md D-001
 * and D-002, and docs/ROLE-MATRIX.md for the measured table.
 *
 * LIVE BY DESIGN, like `anon-catalog.test.ts` beside it: a policy suite that
 * mocks the database proves the mock. This signs in as the seeded fixtures
 * with the ANON key and their passwords, exactly the credential each of those
 * users holds in a browser. Nothing here uses the service role, so nothing
 * here can read or write anything the corresponding human could not.
 *
 * NON-DESTRUCTIVE BY CONSTRUCTION. Supabase-js has no transaction to roll
 * back, so this asserts REFUSALS and visibility only. The one write it
 * attempts sets a column to the value it already holds, so the run cannot
 * change data whether the policy refuses it or not.
 *
 * THE BOUNDARY IS OWNERSHIP, NOT A DENY-ALL, AND THE FIRST DRAFT GOT THAT
 * WRONG. Read from production 2026-09-07: `payments` is owner-of-order OR
 * admin, `refunds` is owner-of-order OR admin/super_admin/support,
 * `wallet_accounts` is own-user OR admin, `wallet_entries` is admin OR an
 * account you are on a side of. A customer is SUPPOSED to see their own
 * payment. Asserting emptiness would have encoded a rule the product does not
 * have -- and it passed anyway, because no fixture existed and every test
 * returned early. That is why the skips below are `ctx.skip()` and not
 * `return`: an unseeded run must report as skipped, never as green.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const configured = Boolean(url && anonKey && !url.includes('<project-ref>'))

const FIXTURES = {
  customer: {
    email: process.env.E2E_CUSTOMER_EMAIL ?? 'e2e-customer@test.kenyonexpress.local',
    password: process.env.E2E_CUSTOMER_PASSWORD ?? 'E2eCustomer!pass1',
  },
  uploader: {
    email: process.env.E2E_UPLOADER_EMAIL ?? 'e2e-uploader@test.kenyonexpress.local',
    password: process.env.E2E_UPLOADER_PASSWORD ?? 'E2eUploader!pass1',
  },
  supplier: {
    email: process.env.E2E_SUPPLIER_EMAIL ?? 'e2e-supplier@test.kenyonexpress.local',
    password: process.env.E2E_SUPPLIER_PASSWORD ?? 'E2eSupplier!pass1',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'e2e-admin@test.kenyonexpress.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'E2eAdmin!pass1',
  },
} as const

type RoleName = keyof typeof FIXTURES

const COUPON_PRODUCT_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d903'

type Session = { client: SupabaseClient; userId: string }

const sessions = new Map<RoleName, Session | null>()

beforeAll(async () => {
  if (!configured || !url || !anonKey) return
  for (const role of Object.keys(FIXTURES) as RoleName[]) {
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data, error } = await client.auth.signInWithPassword(FIXTURES[role])
    // A missing fixture is "not seeded", not "the policy is wrong". It must
    // never read as a pass either; see the header.
    sessions.set(role, error || !data.user ? null : { client, userId: data.user.id })
  }
}, 30_000)

/** Returns the session or skips the test. Never returns null to a caller. */
function need(ctx: { skip: (note?: string) => void }, role: RoleName): Session {
  const session = sessions.get(role)
  if (!session) {
    ctx.skip(`fixture ${role} is not seeded; run pnpm seed:test`)
    throw new Error('unreachable: ctx.skip throws')
  }
  return session
}

/**
 * Every table in `public`, as of the 2026-09-07 sweep. Hard-coded rather than
 * discovered at runtime: PostgREST's root introspection answers 401 to anon
 * (correctly), and a list the test cannot read is a list the test cannot
 * silently shrink. A new table not named here fails the count assertion below.
 */
const ALL_PUBLIC_TABLES = [
  'abandoned_cart_nudges',
  'affiliates',
  'ai_usage',
  'analytics_events',
  'audit_log',
  'banners',
  'carts',
  'cashback_rules',
  'categories',
  'coupon_codes',
  'coupon_deals',
  'coupon_qr_batches',
  'coupon_qr_codes',
  'coupons',
  'discount_campaigns',
  'discount_redemptions',
  'email_suppressions',
  'escrow_holds',
  'homepage_sections',
  'invoices',
  'legacy_percent_archive_112',
  'media_assets',
  'newsletter_subscribers',
  'notification_outbox',
  'order_items',
  'orders',
  'payment_events',
  'payment_tokens',
  'payment_webhook_events',
  'payments',
  'payout_statement_lines',
  'payout_statements',
  'popular_searches',
  'product_images',
  'product_variants',
  'products',
  'profiles',
  'push_tokens',
  'rate_limits',
  'referral_program_settings',
  'referral_signals',
  'referrals',
  'refunds',
  'report_cohort_retention',
  'report_orders_daily',
  'report_revenue_daily',
  'report_top_products',
  'reviews',
  'search_events',
  'search_index_dlq',
  'search_index_outbox',
  'seo_redirects',
  'settlement_events',
  'split_executions',
  'stock_reservations',
  'subscription_charges',
  'subscriptions',
  'supplier_branches',
  'supplier_leads',
  'supplier_members',
  'supplier_staff',
  'suppliers',
  'user_addresses',
  'user_rate_limits',
  'user_recent_searches',
  'vendors',
  'voucher_redemptions',
  'vouchers',
  'wallet_accounts',
  'wallet_balances',
  'wallet_entries',
  'wallet_transactions',
  'wishlists',
] as const

/**
 * The only tables a logged-out visitor may get ROWS from. Five are the
 * catalogue. `cashback_rules` is the sixth and it is deliberate: its SELECT
 * policy is `is_admin() OR (is_active AND inside its date window)`, so what
 * anon sees is the live offer a customer is meant to read, and never a future
 * or retired one.
 */
const ANON_READABLE = [
  'cashback_rules',
  'categories',
  'coupon_deals',
  'product_images',
  'products',
  'suppliers',
] as const

describe.skipIf(!configured)('the anonymous surface, every table', () => {
  /**
   * THIS ONE NEEDS NO FIXTURES, which is why it is here rather than beside the
   * signed-in cases. anon is a credential every visitor already holds, so this
   * half of the boundary suite runs on every machine and in CI, while the
   * four-role half skips until `pnpm seed:test` has run.
   *
   * WHAT IT PROVED ON 2026-09-07. Five tables that hold real rows returned
   * ZERO of them: escrow_holds has 2, analytics_events 28, voucher_redemptions
   * 3, wallet_accounts 13, profiles 10. That is RLS filtering measured against
   * live data rather than inferred from a policy definition, and it is the
   * assertion that would catch a policy loosened by accident.
   */
  it('returns rows from the six intended tables and no others', async () => {
    if (!url || !anonKey) return
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const leaked: string[] = []

    for (const table of ALL_PUBLIC_TABLES) {
      const { data, error } = await client.from(table).select('*').limit(1)
      if (error) continue // refused outright, which is stricter than needed
      if ((data ?? []).length === 0) continue // allowed, and RLS filtered it to nothing
      if (!(ANON_READABLE as readonly string[]).includes(table)) leaked.push(table)
    }

    expect(
      leaked,
      `these tables handed rows to a logged-out visitor and are not on the catalogue allowlist:\n${leaked.join('\n')}`,
    ).toEqual([])
  }, 120_000)

  it('names every table, so a new one cannot slip past the sweep', () => {
    // The guard on the guard. The list is hard-coded because anon cannot
    // introspect; if a migration adds a table and nobody adds it here, the
    // sweep would skip it silently. This count is what makes that loud.
    expect(ALL_PUBLIC_TABLES).toHaveLength(73)
  })
})

describe.skipIf(!configured)('RLS role boundaries, against the live policies', () => {
  describe('the money tables are scoped to the owner', () => {
    it('a wallet account row is only ever the reader own', async (ctx) => {
      // The cleanest of the four to assert: `wallet_accounts_owner_read` is
      // `user_id = auth.uid() OR is_admin()`, so the column IS the boundary.
      const { client, userId } = need(ctx, 'customer')
      const { data, error } = await client.from('wallet_accounts').select('user_id').limit(50)
      expect(error).toBeNull()
      for (const row of data ?? []) expect(row.user_id).toBe(userId)
    })

    it('a wallet entry only ever touches an account the reader owns', async (ctx) => {
      const { client, userId } = need(ctx, 'customer')
      const { data: accounts } = await client
        .from('wallet_accounts')
        .select('id')
        .eq('user_id', userId)
      const owned = new Set((accounts ?? []).map((a) => a.id))
      const { data: entries, error } = await client
        .from('wallet_entries')
        .select('debit_account, credit_account')
        .limit(50)
      expect(error).toBeNull()
      for (const entry of entries ?? []) {
        expect(
          owned.has(entry.debit_account) || owned.has(entry.credit_account),
          'an entry surfaced that touches no account this user owns',
        ).toBe(true)
      }
    })

    // Written out rather than `it.each`, because `it.each` appends the test
    // context after the case arguments and the first draft took it in the
    // wrong position: both cases then failed for a reason that had nothing to
    // do with a policy.
    it('content_uploader owns no order, so it sees no payments at all', async (ctx) => {
      // The uploader has policies of its own on the catalogue and none on the
      // money path. Because the table is owner-of-order scoped and it owns no
      // order, the correct result is zero rows rather than a 42501.
      const { client } = need(ctx, 'uploader')
      const { data, error } = await client.from('payments').select('id').limit(1)
      if (!error) expect(data ?? []).toEqual([])
    })

    it('content_uploader owns no order, so it sees no refunds at all', async (ctx) => {
      const { client } = need(ctx, 'uploader')
      const { data, error } = await client.from('refunds').select('id').limit(1)
      if (!error) expect(data ?? []).toEqual([])
    })

    it('the supplier sees no refunds, because a refund belongs to the buyer', async (ctx) => {
      const { client } = need(ctx, 'supplier')
      const { data, error } = await client.from('refunds').select('id').limit(1)
      if (!error) expect(data ?? []).toEqual([])
    })
  })

  describe('content_uploader', () => {
    it('cannot publish, because the database refuses it and not the UI', async (ctx) => {
      const { client } = need(ctx, 'uploader')

      // Sets `status` to the value the seeded coupon product ALREADY holds, so
      // this cannot change data. `enforce_product_approval` is SECURITY
      // DEFINER and raises 42501 on any non-admin write whose incoming status
      // is 'active'. That trigger, not a policy, enforces "never publish", and
      // because it fires on any such write it is also what keeps an uploader
      // away from a live product's percentages.
      const { error } = await client
        .from('products')
        .update({ status: 'active' })
        .eq('id', COUPON_PRODUCT_ID)

      expect(error, 'a content_uploader must not be able to publish').not.toBeNull()
      expect(error?.code).toBe('42501')
    })
  })

  describe('the supplier boundary is membership, not the vendor label', () => {
    it('carries role=vendor and is granted nothing by it', async (ctx) => {
      const { client, userId } = need(ctx, 'supplier')
      const { data: profile } = await client
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      // Zero of the 146 production policies read `vendor`. If this label ever
      // starts granting something on its own, the second source of truth that
      // D-001 warns about has opened.
      if (profile) expect(profile.role).toBe('vendor')
    })

    it('cannot enumerate outstanding vouchers', async (ctx) => {
      // 073's vouchers_supplier_read_redeemed exposes a voucher only AFTER
      // this supplier redeemed it. An unredeemed voucher is not the
      // supplier's to see, which is what stops a till listing live coupons.
      const { client } = need(ctx, 'supplier')
      const { data, error } = await client
        .from('vouchers')
        .select('id')
        .eq('status', 'issued')
        .limit(1)
      if (!error) expect(data ?? []).toEqual([])
    })
  })

  describe('customer', () => {
    it('cannot write to the catalogue', async (ctx) => {
      const { client } = need(ctx, 'customer')
      const { error } = await client
        .from('products')
        .update({ status: 'active' })
        .eq('id', COUPON_PRODUCT_ID)
      expect(error, 'a customer must not be able to write a product').not.toBeNull()
    })

    it('reads only its own orders and its own vouchers', async (ctx) => {
      const { client, userId } = need(ctx, 'customer')
      const { data: orders } = await client.from('orders').select('user_id').limit(50)
      for (const row of orders ?? []) expect(row.user_id).toBe(userId)

      const { data: vouchers } = await client.from('vouchers').select('user_id').limit(50)
      for (const row of vouchers ?? []) expect(row.user_id).toBe(userId)
    })
  })

  describe('admin', () => {
    it('reads refunds, which is the counter-assertion', async (ctx) => {
      // Without this, a suite in which every role is denied everything would
      // pass while the product was broken for admins too.
      const { client } = need(ctx, 'admin')
      const { error } = await client.from('refunds').select('id').limit(1)
      expect(error).toBeNull()
    })
  })
})
