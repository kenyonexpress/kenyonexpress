import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one hop between "this dead letter belongs to payment X" and the arguments
 * `finalizeOrder` actually takes.
 *
 * It is tested on its own because BOTH replay paths use it - the ten-minute
 * sweep and the button in `/admin/queues` - and a difference between them would
 * be two ways of closing an order that only disagree once, in production, about
 * money.
 */

const finalizeOrder = vi.fn()

vi.mock('@/server/payments/finalize', () => ({
  finalizeOrder: (...args: unknown[]) => finalizeOrder(...args),
}))

import { finalizeForReplay } from '@/server/payments/replay-finalize'

type Row = Record<string, unknown> | null

function admin(row: Row, error: { message: string } | null = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }))
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as never, from, select, eq }
}

const PAYMENT = {
  id: 'pay-1',
  order_id: 'order-1',
  cardcom_transaction_id: 'tx-9',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('finalizeForReplay', () => {
  it('closes the order the payment row points at, with its transaction id', async () => {
    finalizeOrder.mockResolvedValue({ ok: true, replay: false, orderId: 'order-1' })
    const { client, from } = admin(PAYMENT)

    await expect(finalizeForReplay(client)('pay-1')).resolves.toEqual({ ok: true })
    expect(from).toHaveBeenCalledWith('payments')
    expect(finalizeOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      paymentId: 'pay-1',
      transactionId: 'tx-9',
    })
  })

  it('passes a null transaction id through rather than inventing one', async () => {
    // A dead letter whose payment never recorded a transaction id is still
    // replayable: the money was verified against Cardcom before the row got
    // here. Substituting the payment id, or an empty string, would write a
    // transaction reference that matches nothing at the terminal and would then
    // fail the daily reconciliation as an amount with no deal.
    finalizeOrder.mockResolvedValue({ ok: true, replay: false, orderId: 'order-1' })
    const { client } = admin({ ...PAYMENT, cardcom_transaction_id: null })

    await finalizeForReplay(client)('pay-1')
    expect(finalizeOrder).toHaveBeenCalledWith(expect.objectContaining({ transactionId: null }))
  })

  it('reports a finalize refusal with its code, not as a bare failure', async () => {
    // `STATE_INVALID` and `NOT_FOUND` mean opposite things to whoever reads the
    // queue: one is an order that moved on, the other is a missing row. The
    // sweep logs this string and the admin screen shows it.
    finalizeOrder.mockResolvedValue({
      ok: false,
      error: 'order is cancelled',
      code: 'STATE_INVALID',
    })
    const { client } = admin(PAYMENT)

    await expect(finalizeForReplay(client)('pay-1')).resolves.toEqual({
      ok: false,
      error: 'STATE_INVALID: order is cancelled',
    })
  })

  it('never calls finalize when the payment row is missing', async () => {
    const { client } = admin(null)

    await expect(finalizeForReplay(client)('pay-1')).resolves.toEqual({
      ok: false,
      error: 'payment row not found',
    })
    expect(finalizeOrder).not.toHaveBeenCalled()
  })

  it('never calls finalize when the payment row could not be read', async () => {
    // An unreadable row is NOT an absent one, and the difference decides
    // whether an operator goes looking for a missing payment or for a database
    // that stopped answering. Finalizing on a failed SELECT would be closing an
    // order on no evidence at all.
    const { client } = admin(null, { message: 'connection reset' })

    await expect(finalizeForReplay(client)('pay-1')).resolves.toEqual({
      ok: false,
      error: 'payment read failed: connection reset',
    })
    expect(finalizeOrder).not.toHaveBeenCalled()
  })
})
