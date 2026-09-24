import { agorot } from '@/lib/commerce/money'
import type { CreateDocumentInput, CreateLowProfileInput } from '@/lib/payments/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MockCardcomProvider, getSharedMockCardcom } from './mock-cardcom'

/**
 * The mock is what every checkout test charges through, so its answers have
 * to be the SHAPE of Cardcom's: a decline that is not a decline, or a refund
 * that echoes the wrong amount, would let a money-path test pass against a
 * lie. Amounts are integer agorot throughout.
 */

const LOW_PROFILE: CreateLowProfileInput = {
  paymentId: 'pay_0123456789abcdef',
  orderId: 'ord_1',
  orderNumber: 'KE-1001',
  amountAgorot: agorot(12_900),
  saveToken: false,
  successRedirectUrl: 'https://shop.test/ok',
  failedRedirectUrl: 'https://shop.test/fail',
  webhookUrl: 'https://shop.test/hook',
  description: 'הזמנה KE-1001',
}

const DOCUMENT: CreateDocumentInput = {
  documentType: 'tax_invoice_receipt',
  customerName: 'ישראל ישראלי',
  customerEmail: 'a@b.test',
  customerPhone: '0501234567',
  lines: [
    {
      description: 'מוצר',
      quantity: 1,
      unitPriceAgorot: agorot(12_900),
      totalAgorot: agorot(12_900),
    },
  ],
  totalAgorot: agorot(12_900),
  vatPercent: 18,
  transactionId: 'mock-txn-1',
  reference: 'KE-1001',
  sendByEmail: false,
}

let provider: MockCardcomProvider

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://shop.test')
  provider = new MockCardcomProvider()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createLowProfile', () => {
  it('stores a pending deal and redirects to the return page with order and lp ids', async () => {
    const result = await provider.createLowProfile(LOW_PROFILE)

    expect(result.lowProfileId).toBe('mock-lp-1-pay_0123')
    expect(result.redirectUrl).toBe(
      'https://shop.test/checkout/return?order_id=ord_1&lp=mock-lp-1-pay_0123',
    )
    expect(result.raw).toEqual({
      mock: true,
      lowProfileId: 'mock-lp-1-pay_0123',
      amountAgorot: 12_900,
    })
    expect(provider.getDeal(result.lowProfileId)).toEqual({
      input: LOW_PROFILE,
      status: 'pending',
      transactionId: 'mock-txn-1',
    })
  })

  it('numbers deals sequentially so two orders never share an id', async () => {
    const first = await provider.createLowProfile(LOW_PROFILE)
    const second = await provider.createLowProfile({ ...LOW_PROFILE, orderId: 'ord_2' })
    expect(first.lowProfileId).not.toBe(second.lowProfileId)
    expect(second.lowProfileId).toBe('mock-lp-2-pay_0123')
  })
})

describe('verifyLowProfile', () => {
  it('reports an unknown low profile as not found', async () => {
    await expect(provider.verifyLowProfile('nope')).resolves.toEqual({
      success: false,
      amountAgorot: null,
      transactionId: null,
      lowProfileId: 'nope',
      raw: { mock: true, found: false },
    })
  })

  it('succeeds with the charged amount and no token when saveToken is off', async () => {
    const { lowProfileId } = await provider.createLowProfile(LOW_PROFILE)
    const result = await provider.verifyLowProfile(lowProfileId)

    expect(result).toEqual({
      success: true,
      amountAgorot: 12_900,
      transactionId: 'mock-txn-1',
      lowProfileId,
      token: undefined,
      raw: { mock: true, status: 'succeeded', amountAgorot: 12_900 },
    })
    expect(provider.getDeal(lowProfileId)?.status).toBe('succeeded')
  })

  it('returns a card token when the deal asked to save one', async () => {
    const { lowProfileId } = await provider.createLowProfile({ ...LOW_PROFILE, saveToken: true })
    const result = await provider.verifyLowProfile(lowProfileId)
    expect(result.token).toEqual({
      token: 'tok_mock-txn-1',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2030,
    })
  })

  it('fails the deal once after failNext, then recovers', async () => {
    const { lowProfileId } = await provider.createLowProfile(LOW_PROFILE)
    provider.failNext()

    const failed = await provider.verifyLowProfile(lowProfileId)
    expect(failed).toMatchObject({
      success: false,
      amountAgorot: 12_900,
      transactionId: 'mock-txn-1',
      raw: { status: 'failed' },
    })
    expect(provider.getDeal(lowProfileId)?.status).toBe('failed')

    // The flag is consumed by the failure; the next verification succeeds.
    await expect(provider.verifyLowProfile(lowProfileId)).resolves.toMatchObject({ success: true })
  })
})

describe('chargeWithToken', () => {
  const CHARGE = {
    paymentId: 'pay_2',
    orderId: 'ord_2',
    amountAgorot: agorot(5_000),
    cardcomToken: 'tok_saved',
    description: 'חיוב חוזר',
  }

  it('charges and echoes the token with a synthetic card', async () => {
    await expect(provider.chargeWithToken(CHARGE)).resolves.toEqual({
      success: true,
      transactionId: 'mock-tok-1',
      failureCode: null,
      failureMessage: null,
      token: {
        token: 'tok_saved',
        last4: '4242',
        brand: 'Visa',
        expiryMonth: 12,
        expiryYear: 2030,
      },
      raw: { mock: true, transactionId: 'mock-tok-1' },
    })
  })

  it('declines once after failNext', async () => {
    provider.failNext()
    await expect(provider.chargeWithToken(CHARGE)).resolves.toEqual({
      success: false,
      transactionId: null,
      failureCode: 'DECLINED',
      failureMessage: 'Mock decline',
      raw: { mock: true, declined: true },
    })
    await expect(provider.chargeWithToken(CHARGE)).resolves.toMatchObject({ success: true })
  })

  it('asks for a 3DS challenge once after challengeNext, and that outranks a decline', async () => {
    provider.challengeNext()
    provider.failNext()
    await expect(provider.chargeWithToken(CHARGE)).resolves.toMatchObject({
      success: false,
      failureCode: 'THREEDS_CHALLENGE',
      raw: { threeDSecureChallenge: true },
    })
    // The decline flag is still armed for the following charge.
    await expect(provider.chargeWithToken(CHARGE)).resolves.toMatchObject({
      failureCode: 'DECLINED',
    })
  })
})

describe('refundByTransactionId', () => {
  const REFUND = {
    transactionId: 'mock-txn-1',
    amountAgorot: agorot(12_900),
    description: 'ביטול',
  }

  it('refunds the full amount as a credit by default', async () => {
    await expect(provider.refundByTransactionId(REFUND)).resolves.toEqual({
      success: true,
      refundTransactionId: 'mock-refund-1',
      refundedAgorot: 12_900,
      failureCode: null,
      failureMessage: null,
      raw: { mock: true, refundedAgorot: 12_900, cancelOnly: false },
    })
  })

  it('refunds the partial amount when one is given', async () => {
    const result = await provider.refundByTransactionId({
      ...REFUND,
      partialAmountAgorot: agorot(2_500),
    })
    expect(result.refundedAgorot).toBe(2_500)
    expect(result.raw.refundedAgorot).toBe(2_500)
  })

  it('names a same-day cancellation as such, so a test can tell it from a credit', async () => {
    const result = await provider.refundByTransactionId({ ...REFUND, cancelOnly: true })
    expect(result.refundTransactionId).toBe('mock-cancel-1')
    expect(result.raw.cancelOnly).toBe(true)
  })

  it('declines once after failNext', async () => {
    provider.failNext()
    await expect(provider.refundByTransactionId(REFUND)).resolves.toEqual({
      success: false,
      refundTransactionId: null,
      refundedAgorot: null,
      failureCode: 'REFUND_DECLINED',
      failureMessage: 'Mock refund decline',
      raw: { mock: true, declined: true },
    })
  })
})

describe('createDocument', () => {
  it('records what was asked for and returns a numbered document', async () => {
    const result = await provider.createDocument(DOCUMENT)
    expect(result).toEqual({
      success: true,
      documentNumber: 'mock-doc-1',
      documentUrl: 'https://mock.cardcom.invalid/documents/mock-doc-1.pdf',
      failureCode: null,
      failureMessage: null,
      raw: { mock: true, documentNumber: 'mock-doc-1', totalAgorot: 12_900 },
    })
    expect(provider.documents).toEqual([DOCUMENT])
  })

  it('rejects once after failNext and records nothing', async () => {
    provider.failNext()
    await expect(provider.createDocument(DOCUMENT)).resolves.toMatchObject({
      success: false,
      documentNumber: null,
      documentUrl: null,
      failureCode: 'DOCUMENT_REJECTED',
    })
    expect(provider.documents).toEqual([])
  })
})

describe('listTransactions', () => {
  it('reports an empty terminal rather than inventing transactions', async () => {
    await expect(provider.listTransactions()).resolves.toEqual({ ok: true, transactions: [] })
  })
})

describe('markSucceeded and reset', () => {
  it('flips a stored deal to succeeded and ignores unknown ids', async () => {
    const { lowProfileId } = await provider.createLowProfile(LOW_PROFILE)
    provider.markSucceeded('missing')
    provider.markSucceeded(lowProfileId)
    expect(provider.getDeal(lowProfileId)?.status).toBe('succeeded')
  })

  it('reset clears deals, documents, flags and the sequence', async () => {
    const { lowProfileId } = await provider.createLowProfile(LOW_PROFILE)
    await provider.createDocument(DOCUMENT)
    provider.failNext()
    provider.challengeNext()

    provider.reset()

    expect(provider.getDeal(lowProfileId)).toBeUndefined()
    expect(provider.documents).toEqual([])
    const next = await provider.createLowProfile(LOW_PROFILE)
    expect(next.lowProfileId).toBe('mock-lp-1-pay_0123')
    await expect(
      provider.chargeWithToken({
        paymentId: 'p',
        orderId: 'o',
        amountAgorot: agorot(100),
        cardcomToken: 't',
        description: 'd',
      }),
    ).resolves.toMatchObject({ success: true })
  })
})

describe('getSharedMockCardcom', () => {
  it('returns one process-wide instance named mock', () => {
    const shared = getSharedMockCardcom()
    expect(shared).toBeInstanceOf(MockCardcomProvider)
    expect(shared.name).toBe('mock')
    expect(getSharedMockCardcom()).toBe(shared)
  })
})
