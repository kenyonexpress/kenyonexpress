import { agorot } from '@/lib/commerce/money'
import { MockCardcomProvider } from '@/lib/payments/mock-cardcom'
import type { CreateLowProfileInput } from '@/lib/payments/types'
import { describe, expect, it } from 'vitest'

function input(overrides: Partial<CreateLowProfileInput> = {}): CreateLowProfileInput {
  return {
    paymentId: '6831c4f1-fc4e-4b0b-95dd-e212a11108ad',
    orderId: '35b5e2f7-4c69-47ac-a33f-b39c566e8257',
    orderNumber: '1001',
    amountAgorot: agorot(4000),
    saveToken: false,
    successRedirectUrl: 'https://preview.example/checkout/frame-return?order_id=1',
    failedRedirectUrl: 'https://preview.example/checkout/failed?order_id=1',
    webhookUrl: 'https://preview.example/api/payments/cardcom/webhook',
    description: 'test',
    ...overrides,
  }
}

/**
 * S27: a Vercel preview runs the checkout and the frame-return on different
 * function instances, each with its own provider. The second one must verify a
 * deal the first one created.
 */
describe('MockCardcomProvider across instances', () => {
  it('verifies a deal created by another instance, with the amount it was created for', async () => {
    const { lowProfileId } = await new MockCardcomProvider().createLowProfile(input())
    const result = await new MockCardcomProvider().verifyLowProfile(lowProfileId)
    expect(result.success).toBe(true)
    expect(result.amountAgorot).toBe(4000)
    expect(Number.isInteger(result.amountAgorot)).toBe(true)
    expect(result.transactionId).toMatch(/^mock-txn-/)
    expect(result.token).toBeUndefined()
  })

  it('carries the save-card choice across instances', async () => {
    const { lowProfileId } = await new MockCardcomProvider().createLowProfile(
      input({ saveToken: true }),
    )
    const result = await new MockCardcomProvider().verifyLowProfile(lowProfileId)
    expect(result.success).toBe(true)
    expect(result.token?.last4).toBe('4242')
  })

  it('still refuses an id it never minted', async () => {
    const result = await new MockCardcomProvider().verifyLowProfile('lp-from-somewhere-else')
    expect(result.success).toBe(false)
  })

  it('the same instance keeps its exact transaction id', async () => {
    const provider = new MockCardcomProvider()
    const { lowProfileId } = await provider.createLowProfile(input())
    const result = await provider.verifyLowProfile(lowProfileId)
    expect(result.transactionId).toBe('mock-txn-1')
  })
})
