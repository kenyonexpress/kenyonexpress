import {
  AGOROT_SCHEMA,
  ILS_SCHEMA,
  __resetPaymentMoneySchemaCache,
  paymentMoneySelect,
  paymentMoneyWrite,
  readAmountAgorot,
  resolvePaymentMoneySchema,
} from '@/lib/payments/payment-money-columns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The invariant: whichever schema the database has, the rest of the code deals
 * in integer agorot and a charge compares equal to itself.
 *
 * The failure this guards against is not hypothetical. Naming amount_agorot on
 * a pre-059 database raises 42703, the payment lookup returns null, and the
 * webhook answers 200 with "unknown_payment" for a customer who was charged.
 */

beforeEach(() => {
  __resetPaymentMoneySchemaCache()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('schemas', () => {
  it('reads agorot straight through', () => {
    expect(AGOROT_SCHEMA.toAgorot(21990)).toBe(21990)
    expect(AGOROT_SCHEMA.fromAgorot(21990)).toBe(21990)
  })

  it('converts shekels to agorot and back without drift', () => {
    expect(ILS_SCHEMA.toAgorot(219.9)).toBe(21990)
    expect(ILS_SCHEMA.fromAgorot(21990)).toBe(219.9)
    expect(ILS_SCHEMA.toAgorot(ILS_SCHEMA.fromAgorot(1))).toBe(1)
  })

  it('reads a numeric column that arrives as a string', () => {
    // Postgres numeric comes back as a string through PostgREST often enough
    // that assuming a number here would compare NaN against a real charge.
    expect(ILS_SCHEMA.toAgorot('219.90')).toBe(21990)
    expect(AGOROT_SCHEMA.toAgorot('21990')).toBe(21990)
  })

  it('returns null rather than zero for an absent or unreadable amount', () => {
    for (const schema of [AGOROT_SCHEMA, ILS_SCHEMA]) {
      expect(schema.toAgorot(null)).toBeNull()
      expect(schema.toAgorot(undefined)).toBeNull()
      expect(schema.toAgorot('nonsense')).toBeNull()
    }
  })

  it('rounds a fractional agora rather than storing it', () => {
    expect(ILS_SCHEMA.toAgorot(0.005)).toBe(1)
    expect(AGOROT_SCHEMA.fromAgorot(10.4)).toBe(10)
  })
})

describe('select and write builders', () => {
  it('names the columns of the resolved schema', () => {
    expect(paymentMoneySelect(AGOROT_SCHEMA)).toBe('amount_agorot, wallet_applied_agorot')
    expect(paymentMoneySelect(ILS_SCHEMA)).toBe('amount_ils, wallet_applied_ils')
  })

  it('writes agorot on a post-059 database', () => {
    expect(
      paymentMoneyWrite(AGOROT_SCHEMA, { amountAgorot: 21990, walletAppliedAgorot: 500 }),
    ).toEqual({ amount_agorot: 21990, wallet_applied_agorot: 500 })
  })

  it('writes shekels on a pre-059 database', () => {
    expect(
      paymentMoneyWrite(ILS_SCHEMA, { amountAgorot: 21990, walletAppliedAgorot: 500 }),
    ).toEqual({
      amount_ils: 219.9,
      wallet_applied_ils: 5,
    })
  })

  it('round-trips a charge through a write and a read', () => {
    for (const schema of [AGOROT_SCHEMA, ILS_SCHEMA]) {
      const row = paymentMoneyWrite(schema, { amountAgorot: 12345, walletAppliedAgorot: 0 })
      expect(readAmountAgorot(schema, row)).toBe(12345)
    }
  })

  it('reads null from a missing row instead of throwing', () => {
    expect(readAmountAgorot(AGOROT_SCHEMA, null)).toBeNull()
    expect(readAmountAgorot(ILS_SCHEMA, {})).toBeNull()
  })
})

describe('resolvePaymentMoneySchema', () => {
  it('picks agorot when the post-059 column exists', async () => {
    const probe = vi.fn().mockResolvedValue({ error: null })
    expect(await resolvePaymentMoneySchema(probe)).toBe(AGOROT_SCHEMA)
    expect(probe).toHaveBeenCalledWith('amount_agorot')
  })

  it('falls back to shekels on 42703, and says so once', async () => {
    const probe = vi.fn().mockResolvedValue({ error: { code: '42703', message: 'no column' } })
    expect(await resolvePaymentMoneySchema(probe)).toBe(ILS_SCHEMA)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('probes once per process and reuses the answer', async () => {
    const probe = vi.fn().mockResolvedValue({ error: { code: '42703', message: 'no column' } })
    await resolvePaymentMoneySchema(probe)
    await resolvePaymentMoneySchema(probe)
    await resolvePaymentMoneySchema(probe)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  // A database that is briefly unreachable must not pin the process to the
  // wrong schema for the rest of its life.
  it('does not cache an answer derived from an unrelated error', async () => {
    const failing = vi.fn().mockResolvedValue({ error: { code: '57P01', message: 'shutdown' } })
    expect(await resolvePaymentMoneySchema(failing)).toBe(AGOROT_SCHEMA)

    const good = vi.fn().mockResolvedValue({ error: { code: '42703', message: 'no column' } })
    expect(await resolvePaymentMoneySchema(good)).toBe(ILS_SCHEMA)
  })

  it('does not cache when the probe itself throws', async () => {
    const thrower = vi.fn().mockRejectedValue(new Error('network'))
    expect(await resolvePaymentMoneySchema(thrower)).toBe(AGOROT_SCHEMA)

    const good = vi.fn().mockResolvedValue({ error: null })
    expect(await resolvePaymentMoneySchema(good)).toBe(AGOROT_SCHEMA)
    expect(good).toHaveBeenCalled()
  })
})
