import {
  __resetPaymentTokenColumnCache,
  paymentTokenWrite,
  paymentsHaveTokenColumn,
} from '@/lib/payments/payment-token-column'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const UNDEFINED_COLUMN = '42703'

beforeEach(() => {
  __resetPaymentTokenColumnCache()
})

describe('paymentsHaveTokenColumn', () => {
  it('reports present when the probe succeeds', async () => {
    await expect(paymentsHaveTokenColumn(async () => ({ error: null }))).resolves.toBe(true)
  })

  it('reports absent on 42703, which is what production answers today', async () => {
    // Measured 2026-09-09: public.payments has twenty columns and token_id is
    // not one of them, although 026_commerce.sql declares it.
    await expect(
      paymentsHaveTokenColumn(async () => ({ error: { code: UNDEFINED_COLUMN } })),
    ).resolves.toBe(false)
  })

  it('probes the right column', async () => {
    const probe = vi.fn(async () => ({ error: null }))
    await paymentsHaveTokenColumn(probe)
    expect(probe).toHaveBeenCalledWith('token_id')
  })

  it('probes ONCE per process and remembers', async () => {
    const probe = vi.fn(async () => ({ error: { code: UNDEFINED_COLUMN } }))
    await paymentsHaveTokenColumn(probe)
    await paymentsHaveTokenColumn(probe)
    await paymentsHaveTokenColumn(probe)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache an answer derived from an unrelated failure', async () => {
    // A transient outage must not pin the process to the degraded answer for
    // its whole lifetime.
    const probe = vi.fn(async () => ({ error: { code: '08006', message: 'connection failed' } }))
    await expect(paymentsHaveTokenColumn(probe)).resolves.toBe(true)
    await paymentsHaveTokenColumn(probe)
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('answers "present" when the probe throws, which is the safe direction', async () => {
    // On a database that HAS the column, omitting it silently loses the link
    // between a charge and the card it rode on.
    const probe = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(paymentsHaveTokenColumn(probe)).resolves.toBe(true)
  })
})

describe('paymentTokenWrite', () => {
  it('contributes the column when it exists', () => {
    expect(paymentTokenWrite(true, 'tok-1')).toEqual({ token_id: 'tok-1' })
  })

  it('contributes NOTHING when it does not, so the INSERT still succeeds', () => {
    // This is the whole fix: naming a column Postgres lacks raises 42703 and
    // takes down the entire statement, so no payment row is created and the
    // saved-card charge fails before Cardcom is called.
    expect(paymentTokenWrite(false, 'tok-1')).toEqual({})
    expect(Object.keys({ order_id: 'o', ...paymentTokenWrite(false, 'tok-1') })).toEqual([
      'order_id',
    ])
  })
})
