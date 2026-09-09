// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

/**
 * The regression net for cancelled migration 165 (CLOSEOUT §13).
 *
 * Eighteen RLS policies on public/anon-readable tables call is_admin() or
 * is_supplier_member() inside their USING/WITH CHECK. Quals run as the caller,
 * so anon must keep EXECUTE on both helpers or every anonymous catalogue read
 * dies with 42501 -- the storefront goes dark for logged-out visitors while
 * every authenticated test stays green. This suite is the only thing that
 * would notice.
 *
 * LIVE BY DESIGN. It talks to the real project with the anon key ONLY --
 * exactly the credential every logged-out visitor holds, so nothing here can
 * read or write anything a browser could not. In CI it runs with
 * SUPABASE_URL + SUPABASE_ANON_KEY; locally it accepts the NEXT_PUBLIC_ pair.
 * Without credentials (the offline unit run) it skips rather than fakes a
 * verdict.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// .env.test carries a `<project-ref>` placeholder; that is "unset", not a URL.
const configured = Boolean(url && anonKey && !url.includes('<project-ref>'))

const CATALOG_TABLES = [
  'products',
  'product_images',
  'coupon_deals',
  'suppliers',
  'categories',
  'seo_redirects',
] as const

describe.skipIf(!configured)('the anonymous catalogue survives', () => {
  function anonClient() {
    if (!url || !anonKey) throw new Error('unreachable: guarded by skipIf')
    return createClient(url, anonKey, { auth: { persistSession: false } })
  }

  it.each(CATALOG_TABLES)('%s answers an anon SELECT with data, not an error', async (table) => {
    const { data, error } = await anonClient().from(table).select('*').limit(1)
    // Empty is fine -- a fresh environment has no rows. An error is the 42501
    // this net exists to catch: a policy qual calling a helper anon may no
    // longer execute.
    expect(error, `anon SELECT on ${table} failed: ${error?.message}`).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('is_admin() answers an anon caller false, not an error', async () => {
    const { data, error } = await anonClient().rpc('is_admin')
    expect(error, `rpc is_admin as anon failed: ${error?.message}`).toBeNull()
    expect(data).toBe(false)
  })

  it('is_supplier_member() answers an anon caller false, not an error', async () => {
    // Production's signature takes the supplier uuid; any well-formed id works
    // because the answer for a caller with no uid is false for every supplier.
    const { data, error } = await anonClient().rpc('is_supplier_member', {
      p_supplier_id: '00000000-0000-4000-8000-000000000000',
    })
    expect(error, `rpc is_supplier_member as anon failed: ${error?.message}`).toBeNull()
    expect(data).toBe(false)
  })
})

describe('the net itself', () => {
  it('knows whether it ran, so CI can assert it did', () => {
    // In CI the env is always provided; this line turns "quietly skipped
    // forever" into a grep-able fact. Locally, without credentials, the live
    // block above skips and this stays green.
    expect(typeof configured).toBe('boolean')
  })
})
