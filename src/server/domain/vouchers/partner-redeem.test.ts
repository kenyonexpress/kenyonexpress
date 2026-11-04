import { parsePartnerInput } from '@/lib/vouchers/partner-input'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { redeemForPartner, resolvePartnerPin } from './partner-redeem'
import { signVoucherQrPayload } from './qr'

/**
 * S15 partner redeem, at the domain level, against an in-memory model of the
 * two production functions it calls. The model is the contract the live
 * `redeem_voucher` honours (read from pg_get_functiondef on 04.11.2026, see
 * docs/S15-redeem.md): one burn per voucher guarded on status = 'issued', the
 * caller's business derived from its own membership, an idempotency key that
 * replays the first answer, and one `vouchers_redemption_events` row per call.
 * The same behaviour was then proved against production in a rolled-back
 * transaction; the output is in the doc.
 */

type Voucher = {
  code: string
  partner_pin: string
  supplier_id: string
  status: 'issued' | 'redeemed' | 'cancelled' | 'refunded' | 'expired'
  created_at: string
  remaining_amount_due_agorot: number
  redeemed_at: string | null
}

const CONTEXT = { ip: '203.0.113.9', userAgent: 'till/1.0' }

function makeWorld(opts: { memberOf: string[]; vouchers: Voucher[] }) {
  const vouchers = opts.vouchers
  const events: Record<string, unknown>[] = []
  const replays = new Map<string, { code: string; result: Record<string, unknown> }>()
  const rpcCalls: Record<string, unknown>[] = []

  function redeemLocked(args: Record<string, unknown>) {
    rpcCalls.push(args)
    const code = args.p_code as string
    const key = args.p_idempotency_key as string
    let result: Record<string, unknown>
    const prior = replays.get(key)
    if (prior) {
      result =
        prior.code === code
          ? { ...prior.result, replayed: true }
          : { outcome: 'invalid_request', replayed: true }
    } else {
      const v = vouchers.find((row) => row.code === code)
      if (!v || !opts.memberOf.includes(v.supplier_id)) result = { outcome: 'not_found' }
      else if (v.status === 'issued') {
        v.status = 'redeemed'
        v.redeemed_at = '2026-11-04T10:00:00Z'
        result = {
          outcome: 'success',
          code: v.code,
          remaining_amount_due_agorot: v.remaining_amount_due_agorot,
          redeemed_at: v.redeemed_at,
        }
      } else if (v.status === 'redeemed') {
        result = { outcome: 'already_redeemed', redeemed_at: v.redeemed_at }
      } else result = { outcome: v.status }
      replays.set(key, { code, result })
    }
    events.push({
      code,
      input_kind: args.p_input_kind,
      outcome: result.outcome,
      replayed: result.replayed === true,
    })
    return Promise.resolve({ data: result, error: null })
  }

  const scoped = {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      if (name !== 'redeem_voucher_locked') throw new Error(`unexpected rpc ${name}`)
      return redeemLocked(args)
    }),
    from: (table: string) => {
      if (table !== 'supplier_members') throw new Error(`scoped read of ${table}`)
      const chain = {
        select: () => chain,
        eq: () => chain,
        // biome-ignore lint/suspicious/noThenProperty: a thenable query builder
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: opts.memberOf.map((id) => ({ supplier_id: id })), error: null }),
      }
      return chain
    },
  }

  const admin = {
    rpc: vi.fn(() => {
      throw new Error('the burn must never go through the service role')
    }),
    from: (table: string) => {
      if (table === 'vouchers_redemption_events') {
        return {
          insert: (row: Record<string, unknown>) => {
            events.push(row)
            return Promise.resolve({ error: null })
          },
        }
      }
      if (table !== 'vouchers') throw new Error(`admin read of ${table}`)
      let pin = ''
      let ids: string[] = []
      const chain = {
        select: () => chain,
        eq: (_col: string, value: string) => {
          pin = value
          return chain
        },
        in: (_col: string, value: string[]) => {
          ids = value
          return chain
        },
        order: () => chain,
        limit: () =>
          Promise.resolve({
            data: vouchers
              .filter((v) => v.partner_pin === pin && ids.includes(v.supplier_id))
              .sort((a, b) => b.created_at.localeCompare(a.created_at)),
            error: null,
          }),
      }
      return chain
    },
  }

  const redeem = (raw: string, idempotencyKey: string) =>
    redeemForPartner({
      scoped: scoped as unknown as SupabaseClient,
      admin: admin as unknown as SupabaseClient,
      userId: 'partner-1',
      input: parsePartnerInput(raw),
      scanMethod: 'manual',
      idempotencyKey,
      context: CONTEXT,
    })

  return { scoped, admin, events, rpcCalls, vouchers, redeem }
}

function voucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    code: 'ABCDEFGHJK',
    partner_pin: '12345678',
    supplier_id: 'sup-1',
    status: 'issued',
    created_at: '2026-11-01T00:00:00Z',
    remaining_amount_due_agorot: 5000,
    redeemed_at: null,
    ...overrides,
  }
}

describe('S15 partner redeem', () => {
  beforeEach(() => vi.stubEnv('VOUCHER_QR_SECRET', 'test-qr-secret-value'))
  afterEach(() => vi.unstubAllEnvs())

  it('redeems by 8-digit pin, through the user client, logged as input_kind pin', async () => {
    const w = makeWorld({ memberOf: ['sup-1'], vouchers: [voucher()] })
    const result = await w.redeem('1234 5678', 'key-aaaa-1')
    expect(result.outcome).toBe('success')
    expect(result.code).toBe('ABCDEFGHJK')
    expect(w.vouchers[0]?.status).toBe('redeemed')
    expect(w.scoped.rpc).toHaveBeenCalledWith(
      'redeem_voucher_locked',
      expect.objectContaining({
        p_code: 'ABCDEFGHJK',
        p_input_kind: 'pin',
        p_idempotency_key: 'key-aaaa-1',
        p_ip: '203.0.113.9',
      }),
    )
    expect(w.admin.rpc).not.toHaveBeenCalled()
    expect(w.events).toEqual([
      { code: 'ABCDEFGHJK', input_kind: 'pin', outcome: 'success', replayed: false },
    ])
  })

  it('refuses a double redeem: a second attempt with a new key is already_redeemed', async () => {
    const w = makeWorld({ memberOf: ['sup-1'], vouchers: [voucher()] })
    expect((await w.redeem('12345678', 'key-first-1')).outcome).toBe('success')
    const second = await w.redeem('12345678', 'key-second-2')
    expect(second.outcome).toBe('already_redeemed')
    expect(second.replayed).toBe(false)
    expect(second.raw.redeemed_at).toBe('2026-11-04T10:00:00Z')
    // The same coupon scanned as QR after the pin was typed is refused too.
    const token = signVoucherQrPayload({ c: 'ABCDEFGHJK', s: 'sup-1', u: 'u', e: 2e9, k: 'k1' })
    expect((await w.redeem(token, 'key-third-3')).outcome).toBe('already_redeemed')
    expect(w.events.map((e) => e.outcome)).toEqual([
      'success',
      'already_redeemed',
      'already_redeemed',
    ])
  })

  it('replays the first answer for the same idempotency key instead of refusing', async () => {
    const w = makeWorld({ memberOf: ['sup-1'], vouchers: [voucher()] })
    await w.redeem('12345678', 'key-retry-1')
    const retry = await w.redeem('12345678', 'key-retry-1')
    expect(retry.outcome).toBe('success')
    expect(retry.replayed).toBe(true)
    expect(w.events.at(-1)).toMatchObject({ outcome: 'success', replayed: true })
  })

  it('never resolves another business’s pin, and never calls the RPC for it', async () => {
    const w = makeWorld({ memberOf: ['sup-1'], vouchers: [voucher({ supplier_id: 'sup-2' })] })
    const result = await w.redeem('12345678', 'key-other-1')
    expect(result.outcome).toBe('not_found')
    expect(w.scoped.rpc).not.toHaveBeenCalled()
    expect(w.vouchers[0]?.status).toBe('issued')
    expect(w.events).toEqual([
      expect.objectContaining({ code: '12345678', input_kind: 'pin', outcome: 'not_found' }),
    ])
  })

  it('a caller with no membership resolves nothing', async () => {
    const w = makeWorld({ memberOf: [], vouchers: [voucher()] })
    expect((await w.redeem('12345678', 'key-none-1')).outcome).toBe('not_found')
    expect(w.scoped.rpc).not.toHaveBeenCalled()
  })

  it('prefers the issued row when a redeemed voucher shares the pin', async () => {
    const w = makeWorld({
      memberOf: ['sup-1'],
      vouchers: [
        voucher({ code: 'OLDREDEEM1', status: 'redeemed', created_at: '2026-11-03T00:00:00Z' }),
        voucher({ code: 'NEWISSUED1', created_at: '2026-10-01T00:00:00Z' }),
      ],
    })
    const result = await w.redeem('12345678', 'key-share-1')
    expect(result.outcome).toBe('success')
    expect(w.rpcCalls[0]?.p_code).toBe('NEWISSUED1')
  })

  it('a QR with a bad signature is refused before the RPC and logged', async () => {
    const w = makeWorld({ memberOf: ['sup-1'], vouchers: [voucher()] })
    const result = await w.redeem('KEV1.forged.signature', 'key-forge-1')
    expect(result.outcome).toBe('not_found')
    expect(w.scoped.rpc).not.toHaveBeenCalled()
    expect(w.events[0]).toMatchObject({ input_kind: 'qr', code: 'invalid_signature' })
  })

  it('a signed QR redeems with input_kind qr', async () => {
    const w = makeWorld({ memberOf: ['sup-1'], vouchers: [voucher()] })
    const token = signVoucherQrPayload({ c: 'ABCDEFGHJK', s: 'sup-1', u: 'u', e: 2e9, k: 'k1' })
    expect((await w.redeem(token, 'key-qr-0001')).outcome).toBe('success')
    expect(w.rpcCalls[0]).toMatchObject({ p_code: 'ABCDEFGHJK', p_input_kind: 'qr' })
  })

  it('a failed membership read throws instead of answering not_found', async () => {
    const scoped = {
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          // biome-ignore lint/suspicious/noThenProperty: a thenable query builder
          then: (resolve: (value: unknown) => void) =>
            resolve({ data: null, error: { message: 'timeout' } }),
        }
        return chain
      },
    }
    await expect(
      resolvePartnerPin(
        scoped as unknown as SupabaseClient,
        {} as SupabaseClient,
        'partner-1',
        '12345678',
      ),
    ).rejects.toThrow('partner.pin_memberships_failed')
  })
})

describe('S15 partner redeem, garbage input', () => {
  it('is refused without the RPC and logged under a kind the table CHECK accepts', async () => {
    const events: Record<string, unknown>[] = []
    const admin = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          events.push(row)
          return Promise.resolve({ error: null })
        },
      }),
    }
    const scoped = { rpc: vi.fn() }
    const result = await redeemForPartner({
      scoped: scoped as unknown as SupabaseClient,
      admin: admin as unknown as SupabaseClient,
      userId: 'partner-1',
      input: parsePartnerInput('hello'),
      scanMethod: 'manual',
      idempotencyKey: 'key-garbage-1',
      context: CONTEXT,
    })
    expect(result.outcome).toBe('invalid_request')
    expect(scoped.rpc).not.toHaveBeenCalled()
    expect(['qr', 'code', 'pin']).toContain(events[0]?.input_kind)
  })
})
