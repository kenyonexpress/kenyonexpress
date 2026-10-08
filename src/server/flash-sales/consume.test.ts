import { describe, expect, it, vi } from 'vitest'

/**
 * The finalize-side consume of flash holds (STEP 61). Pinned: it calls the
 * 266 function by order id, an absent function (266 not applied) is a quiet
 * `not_applied`, any other error is `failed` and logged, and a success
 * reports how many claims became sales. It never throws: the card is
 * already charged when this runs.
 */

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('@/lib/observability/log', () => ({ log }))

import { consumeFlashSaleClaimsForOrder } from './consume'

const ORDER = '55555555-5555-4555-8555-555555555555'

function admin(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as never, rpc }
}

describe('consumeFlashSaleClaimsForOrder', () => {
  it('consumes by order id and reports the count', async () => {
    const { client, rpc } = admin({ data: 2, error: null })
    const outcome = await consumeFlashSaleClaimsForOrder(client, { orderId: ORDER })
    expect(rpc).toHaveBeenCalledWith('consume_flash_sale_claims', { p_order: ORDER })
    expect(outcome).toEqual({ status: 'consumed', claims: 2 })
  })

  it('is a quiet no-op while 266 is not applied', async () => {
    const { client } = admin({ data: null, error: { code: '42883', message: 'no function' } })
    const outcome = await consumeFlashSaleClaimsForOrder(client, { orderId: ORDER })
    expect(outcome).toEqual({ status: 'not_applied' })
    expect(log.error).not.toHaveBeenCalled()
    expect(log.info).toHaveBeenCalledWith(
      'flash_sales.consume_not_applied',
      expect.objectContaining({ orderId: ORDER }),
    )
  })

  it('logs and reports any other failure without throwing', async () => {
    const { client } = admin({ data: null, error: { code: '08006', message: 'terminated' } })
    const outcome = await consumeFlashSaleClaimsForOrder(client, { orderId: ORDER })
    expect(outcome).toEqual({ status: 'failed' })
    expect(log.error).toHaveBeenCalledWith(
      'finalize.flash_consume_failed',
      expect.objectContaining({ orderId: ORDER, reason: 'terminated' }),
    )
  })
})
