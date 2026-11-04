import type { createAdminClient } from '@/lib/supabase/admin'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { AFFILIATE_WALLET_REASON, payAffiliateConversion } from './pay'

/**
 * The affiliate payout to wallet hook: one conversion's commission, integer
 * agorot in the row, credited to the affiliate's wallet through
 * fn_wallet_transfer, shekels only at that RPC boundary.
 *
 * The fake answers each table/operation from `state` and records every write,
 * so the tests read as the ledger sees them: what was transferred, with which
 * idempotency key, and in which order relative to the status flip.
 */

type Row = Record<string, unknown>
interface State {
  conversion: Row | null
  affiliate: Row | null
  reserve: Row | null
  wallet: Row | null
  transferError: { message: string } | null
  flipReturns: Row[]
}

let state: State
let calls: { kind: string; table?: string; payload?: unknown; filters?: unknown[] }[]

function builder(table: string) {
  let op: 'select' | 'update' | 'insert' = 'select'
  let payload: unknown
  const filters: unknown[] = []
  const answer = (): { data: unknown; error: unknown } => {
    if (table === 'affiliate_conversions' && op === 'select')
      return { data: state.conversion, error: null }
    if (table === 'affiliate_conversions' && op === 'update')
      return { data: state.flipReturns, error: null }
    if (table === 'affiliates' && op === 'select') return { data: state.affiliate, error: null }
    if (table === 'affiliates' && op === 'update') return { data: null, error: null }
    if (table === 'wallet_accounts') {
      const byCode = filters.some((f) => (f as unknown[])[0] === 'code')
      return { data: byCode ? state.reserve : state.wallet, error: null }
    }
    return { data: null, error: null }
  }
  const b = {
    select: () => b,
    update: (p: unknown) => {
      op = 'update'
      payload = p
      calls.push({ kind: 'update', table, payload: p })
      return b
    },
    insert: (p: unknown) => {
      op = 'insert'
      payload = p
      return b
    },
    eq: (...f: unknown[]) => {
      filters.push(f)
      return b
    },
    in: (...f: unknown[]) => {
      filters.push(f)
      return b
    },
    is: () => b,
    maybeSingle: async () => answer(),
    // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is a thenable
    then: (resolve: (v: unknown) => unknown) => resolve(answer()),
  }
  void payload
  return b
}

const admin = {
  from: (table: string) => builder(table),
  rpc: async (name: string, args: unknown) => {
    calls.push({ kind: 'rpc', payload: { name, args } })
    return { data: null, error: state.transferError }
  },
} as unknown as ReturnType<typeof createAdminClient>

beforeEach(() => {
  calls = []
  state = {
    conversion: {
      id: 'conv-1',
      affiliate_id: 'aff-1',
      order_id: 'order-1',
      status: 'pending',
      commission_agorot: 1_234,
    },
    affiliate: {
      id: 'aff-1',
      user_id: 'user-1',
      total_conversions: 2,
      total_earnings_ils_agorot: 10_000,
    },
    reserve: { id: 'reserve-acct' },
    wallet: { id: 'wallet-acct' },
    transferError: null,
    flipReturns: [{ id: 'conv-1' }],
  }
})

describe('payAffiliateConversion: commission to the affiliate wallet', () => {
  it('transfers the commission from the reserve to the wallet, shekels only at the RPC', async () => {
    const out = await payAffiliateConversion(admin, 'conv-1', null)
    expect(out).toEqual({ ok: true, reason: 'paid' })
    const rpc = calls.find((c) => c.kind === 'rpc')?.payload as {
      name: string
      args: Record<string, unknown>
    }
    expect(rpc.name).toBe('fn_wallet_transfer')
    expect(rpc.args).toEqual({
      p_debit_account: 'reserve-acct',
      p_credit_account: 'wallet-acct',
      p_amount_ils: 12.34,
      p_reason: AFFILIATE_WALLET_REASON,
      p_idempotency: 'affiliate:conv-1',
      p_order_id: 'order-1',
    })
  })

  it('moves the money before it flips the status', async () => {
    await payAffiliateConversion(admin, 'conv-1', null)
    const order = calls.map((c) => (c.kind === 'rpc' ? 'rpc' : `${c.kind}:${c.table}`))
    expect(order.indexOf('rpc')).toBeLessThan(order.indexOf('update:affiliate_conversions'))
  })

  it('bumps the counters from an integer-agorot sum', async () => {
    await payAffiliateConversion(admin, 'conv-1', null)
    const counter = calls.find((c) => c.kind === 'update' && c.table === 'affiliates')
    expect(counter?.payload).toEqual({ total_conversions: 3, total_earnings_ils: 112.34 })
  })

  it('records the approver on a queued conversion', async () => {
    await payAffiliateConversion(admin, 'conv-1', 'admin-9')
    const flip = calls.find((c) => c.kind === 'update' && c.table === 'affiliate_conversions')
    expect(flip?.payload).toMatchObject({ status: 'paid', reviewed_by: 'admin-9' })
  })

  it('pays nothing twice: an already paid row transfers nothing', async () => {
    state.conversion = { ...(state.conversion as Row), status: 'paid' }
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: true,
      reason: 'already_paid',
    })
    expect(calls.some((c) => c.kind === 'rpc')).toBe(false)
  })

  it('a lost race on the flip is already_paid and leaves the counters alone', async () => {
    state.flipReturns = []
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: true,
      reason: 'already_paid',
    })
    expect(calls.some((c) => c.kind === 'update' && c.table === 'affiliates')).toBe(false)
  })

  it('refuses a rejected conversion', async () => {
    state.conversion = { ...(state.conversion as Row), status: 'rejected' }
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: false,
      reason: 'rejected',
    })
    expect(calls.some((c) => c.kind === 'rpc')).toBe(false)
  })

  it('a failed transfer leaves the row unpaid', async () => {
    state.transferError = { message: 'boom' }
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: false,
      reason: 'transfer_failed',
    })
    expect(calls.some((c) => c.kind === 'update')).toBe(false)
  })

  it('no reserve account means no payout', async () => {
    state.reserve = null
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: false,
      reason: 'no_reserve_account',
    })
  })

  it('a missing conversion (or a database without the table) is not_found, not a throw', async () => {
    state.conversion = null
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('a zero commission flips the row without a ledger entry', async () => {
    state.conversion = { ...(state.conversion as Row), commission_agorot: 0 }
    expect(await payAffiliateConversion(admin, 'conv-1', null)).toEqual({
      ok: true,
      reason: 'paid',
    })
    expect(calls.some((c) => c.kind === 'rpc')).toBe(false)
  })
})
