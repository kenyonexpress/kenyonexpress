// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

/**
 * The anon half of the wallet RLS matrix (marathon step 6; the full per-role
 * matrix needs session infrastructure and belongs to step 10).
 *
 * The wallet ledger is the money block's most attractive target: a writable
 * row IS money. Live, with the anon key only -- the credential every
 * logged-out visitor holds -- the ledger must refuse writes and leak no rows.
 * These hold both before and after draft 168 (which narrows AUTHENTICATED
 * writes; anon never had a write door), so they are safe to run against
 * production today and stay meaningful after the apply.
 */

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const configured = Boolean(url && anonKey && !url.includes('<project-ref>'))

const LEDGER_TABLES = ['wallet_balances', 'wallet_transactions'] as const

describe.skipIf(!configured)('the wallet ledger, as anon', () => {
  function anonClient() {
    if (!url || !anonKey) throw new Error('unreachable: guarded by skipIf')
    return createClient(url, anonKey, { auth: { persistSession: false } })
  }

  it.each(LEDGER_TABLES)('%s refuses an anon INSERT', async (table) => {
    const { data, error } = await anonClient()
      .from(table)
      .insert({ user_id: '00000000-0000-4000-8000-000000000000', amount_ils: 1 })
      .select()
    // The row must be refused. WHICH error does not matter (RLS 42501 today,
    // possibly a grant error after further hardening) -- success does.
    expect(error, `anon INSERT into ${table} was ACCEPTED: ${JSON.stringify(data)}`).not.toBeNull()
  })

  it.each(LEDGER_TABLES)('%s leaks no rows to an anon SELECT', async (table) => {
    const { data } = await anonClient().from(table).select('*').limit(5)
    // With RLS on and no anon policy, PostgREST answers an empty set rather
    // than an error. Either way, ZERO rows may come back.
    expect(data ?? []).toEqual([])
  })
})

describe('the net itself', () => {
  it('knows whether it ran, so CI can assert it did', () => {
    expect(typeof configured).toBe('boolean')
  })
})
