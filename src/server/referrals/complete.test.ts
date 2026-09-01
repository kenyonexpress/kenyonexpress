import { __resetMoneyGenerationCache } from '@/lib/commerce/order-money-columns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Completion, tested against BOTH money-column generations.
 *
 * This is the assertion that earns its place. Production is the pre-059
 * lineage: `orders` carries `total_ils` as numeric shekels and has no
 * `total_agorot` at all. A caller that names the agorot column outright gets
 * 42703, which fails the whole select, and the bonus is then simply never paid,
 * with no row anywhere to show that it should have been. So the units are
 * checked on both sides of the rename and the pre-059 case is checked for the
 * value, not just for "it did not throw": 89.90 shekels has to arrive as 8990
 * agorot and not as 8989 or 8990.0000001.
 *
 * UPDATED 2026-09-01. The pre-059 read no longer multiplies in JavaScript. The
 * `_agorot` twins are GENERATED ALWAYS AS `round(<col> * 100)::bigint` STORED
 * in production, so `orderMoneySelect('ils')` names `total_ils_agorot` and the
 * multiply happens once, in Postgres, against the numeric source. The mock row
 * therefore carries what PostgREST actually returns for a bigint: a string.
 */

const rpc = vi.fn()
const selectResult = vi.fn()
const probeResult = vi.fn()

const logWarn = vi.fn()
const logInfo = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    warn: (...args: unknown[]) => logWarn(...args),
    info: (...args: unknown[]) => logInfo(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { completeReferralForOrder } from './complete'

const ORDER = '22222222-2222-4222-8222-222222222222'
const USER = '11111111-1111-4111-8111-111111111111'

/** Postgres: undefined_column, the answer a pre-059 database gives. */
const UNDEFINED_COLUMN = '42703'

/**
 * The narrow slice of a Supabase client this path uses: one probe
 * (`select(col).limit(0)`) and one read (`select(cols).eq().maybeSingle()`).
 */
function client() {
  return {
    from: () => ({
      select: (columns: string) => ({
        limit: () => Promise.resolve(probeResult(columns)),
        eq: () => ({ maybeSingle: () => Promise.resolve(selectResult(columns)) }),
      }),
    }),
    rpc,
  }
}

function preO59() {
  probeResult.mockReturnValue({ error: { code: UNDEFINED_COLUMN, message: 'no total_agorot' } })
}

function post059() {
  probeResult.mockReturnValue({ error: null })
}

beforeEach(() => {
  __resetMoneyGenerationCache()
  rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null })
  selectResult.mockReset()
  probeResult.mockReset()
  logWarn.mockReset()
  logInfo.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('completeReferralForOrder', () => {
  it('reads shekels and sends agorot on the pre-059 lineage, which production is', async () => {
    preO59()
    selectResult.mockReturnValue({
      data: { subtotal_ils_agorot: '10000', total_ils_agorot: '8990', cashback_applied_ils: 0 },
      error: null,
    })

    await completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls[0]?.[0]).toBe('fn_complete_referral')
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(args.p_order_agorot).toBe(8990)
    expect(Number.isInteger(args.p_order_agorot)).toBe(true)
  })

  it('sends the agorot column through unscaled once 059 has been cut', async () => {
    post059()
    selectResult.mockReturnValue({
      data: { subtotal_agorot: 10000, total_agorot: 8990, customer_pays_now_agorot: 8990 },
      error: null,
    })

    await completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER })

    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_order_agorot).toBe(8990)
  })

  it('never names a column the probe did not confirm', async () => {
    preO59()
    selectResult.mockReturnValue({ data: { subtotal_ils: 1, total_ils: 1 }, error: null })

    await completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER })

    const requested = selectResult.mock.calls[0]?.[0] as string
    expect(requested).toContain('total_ils')
    expect(requested).not.toContain('total_agorot')
  })

  it('hashes the card token and never forwards it', async () => {
    preO59()
    selectResult.mockReturnValue({ data: { total_ils: 200 }, error: null })

    await completeReferralForOrder(client() as never, {
      orderId: ORDER,
      userId: USER,
      cardToken: 'cardcom-token-abc',
    })

    const hash = (rpc.mock.calls[0]?.[1] as Record<string, string>).p_card_hash
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain('cardcom-token-abc')
  })

  it('sends a null card hash when the payment carried no token', async () => {
    preO59()
    selectResult.mockReturnValue({ data: { total_ils: 200 }, error: null })
    await completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER })
    expect((rpc.mock.calls[0]?.[1] as Record<string, unknown>).p_card_hash).toBeNull()
  })

  it('does not call the RPC at all when the order read fails', async () => {
    preO59()
    selectResult.mockReturnValue({ data: null, error: { message: 'connection reset' } })

    await completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER })

    // Guessing a total here would be guessing whether a bonus is owed.
    expect(rpc).not.toHaveBeenCalled()
    expect(logWarn).toHaveBeenCalled()
  })

  it('swallows an RPC failure, because the card is already charged', async () => {
    preO59()
    selectResult.mockReturnValue({ data: { total_ils: 200 }, error: null })
    rpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected' } })

    await expect(
      completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER }),
    ).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalled()
  })

  it('swallows a thrown client, for the same reason', async () => {
    preO59()
    selectResult.mockImplementation(() => {
      throw new Error('service key missing')
    })

    await expect(
      completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER }),
    ).resolves.toBeUndefined()
    expect(logWarn).toHaveBeenCalled()
  })

  it('logs the ordinary "no referral" answer at info, not as a warning', async () => {
    // Almost every order on the site takes this branch. A warning here is a
    // warning nobody reads by the end of the first day.
    preO59()
    selectResult.mockReturnValue({ data: { total_ils: 200 }, error: null })
    rpc.mockResolvedValue({ data: { ok: false, reason: 'no_referral' }, error: null })

    await completeReferralForOrder(client() as never, { orderId: ORDER, userId: USER })

    expect(logWarn).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalled()
  })
})
