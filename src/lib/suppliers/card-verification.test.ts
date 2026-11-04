import { MockCardcomProvider } from '@/lib/payments/mock-cardcom'
import type { PaymentProvider } from '@/lib/payments/types'
import { describe, expect, it } from 'vitest'
import { CARD_CHECK_AGOROT, cardCheckAvailable, runCardCheck } from './card-verification'

const input = {
  applicationId: '11111111-2222-3333-4444-555555555555',
  attemptId: '99999999-8888-7777-6666-555555555555',
  successRedirectUrl: 'http://localhost/supplier/apply',
  failedRedirectUrl: 'http://localhost/supplier/apply',
  webhookUrl: 'http://localhost/supplier/apply',
}

describe('runCardCheck, the 1 ILS verify-and-void hook', () => {
  it('is exactly 100 agorot', () => {
    expect(CARD_CHECK_AGOROT).toBe(100)
  })

  it('charges 100 agorot on the sandbox provider, voids it same-day, and reports verified', async () => {
    const provider = new MockCardcomProvider()
    const outcome = await runCardCheck(provider, input)
    expect(outcome.status).toBe('verified')
    if (outcome.status !== 'verified') return
    expect(outcome.transactionId).toBeTruthy()
    expect(outcome.voidTransactionId).toContain('cancel')
    expect(outcome.last4).toBe('4242')
  })

  it('reports a decline as failed and never voids', async () => {
    const provider = new MockCardcomProvider()
    provider.failNext()
    const outcome = await runCardCheck(provider, input)
    expect(outcome).toMatchObject({ status: 'failed', failureCode: 'DECLINED' })
  })

  it('reports a failed void as VOID_FAILED with the transaction id, never as verified', async () => {
    const provider = new MockCardcomProvider()
    const original = provider.refundByTransactionId.bind(provider)
    provider.refundByTransactionId = async (r) => {
      provider.failNext()
      return original(r)
    }
    const outcome = await runCardCheck(provider, input)
    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') return
    expect(outcome.failureCode).toBe('VOID_FAILED')
    expect(outcome.transactionId).toBeTruthy()
  })

  it('refuses to void a deal whose re-fetched amount is not 100 agorot', async () => {
    const provider = new MockCardcomProvider()
    const verify = provider.verifyLowProfile.bind(provider)
    provider.verifyLowProfile = async (id) => ({
      ...(await verify(id)),
      amountAgorot: 10_000 as never,
    })
    let refunded = false
    provider.refundByTransactionId = async () => {
      refunded = true
      throw new Error('must not be called')
    }
    const outcome = await runCardCheck(provider, input)
    expect(outcome).toMatchObject({ status: 'failed', failureCode: 'AMOUNT_MISMATCH' })
    expect(refunded).toBe(false)
  })

  it('answers unavailable for the real provider without calling it', async () => {
    let called = false
    const real = {
      name: 'cardcom',
      createLowProfile: async () => {
        called = true
        throw new Error('no')
      },
    } as unknown as PaymentProvider
    expect(await runCardCheck(real, input)).toEqual({
      status: 'unavailable',
      reason: 'sandbox_only',
    })
    expect(called).toBe(false)
  })
})

describe('cardCheckAvailable', () => {
  it('is offered on the sandbox', () => {
    expect(cardCheckAvailable({ useMock: true, refusedReason: null })).toBe(true)
  })
  it('is refused on the sandbox a production deployment falls back to', () => {
    expect(cardCheckAvailable({ useMock: true, refusedReason: 'no Cardcom credentials' })).toBe(
      false,
    )
  })
  it('is refused on the real provider until the hosted-page path exists', () => {
    expect(cardCheckAvailable({ useMock: false, refusedReason: null })).toBe(false)
  })
})
