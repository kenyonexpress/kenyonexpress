import { agorot } from '@/lib/commerce/money'
import { MockCardcomProvider } from '@/lib/payments/mock-cardcom'
import type { CreateLowProfileInput } from '@/lib/payments/types'
import { describe, expect, it } from 'vitest'

/**
 * The web checkout hands the provider a success URL on the framable
 * /checkout/frame-return stub and shows the returned page in an iframe. The
 * real adapter returns Cardcom's hosted page, which later navigates the frame
 * to that URL; the mock has no hosted page, so the URL it returns IS where the
 * frame lands. It therefore has to be the caller's URL and not one of the
 * mock's own: a /checkout/return built here answers X-Frame-Options: DENY and
 * wants a session, and inside the iframe it rendered nothing while the money
 * specs waited 45 s for the top window to move (measured 2026-10-21).
 */
const INPUT: CreateLowProfileInput = {
  paymentId: '11111111-1111-4111-8111-111111111111',
  orderId: '22222222-2222-4222-8222-222222222222',
  orderNumber: 'KE-1',
  amountAgorot: agorot(4000),
  saveToken: false,
  successRedirectUrl:
    'https://ke.example/checkout/frame-return?order_id=22222222-2222-4222-8222-222222222222',
  failedRedirectUrl:
    'https://ke.example/checkout/frame-return?order_id=22222222-2222-4222-8222-222222222222&status=failed',
  webhookUrl: 'https://ke.example/api/payments/cardcom/webhook?s=secret',
  description: 'order 22222222',
}

describe('MockCardcomProvider.createLowProfile', () => {
  it("lands the payment frame on the caller's success URL, as the real provider would", async () => {
    const mock = new MockCardcomProvider()
    const result = await mock.createLowProfile(INPUT)
    expect(result.redirectUrl).toBe(INPUT.successRedirectUrl)
    expect(result.redirectUrl).not.toContain('/checkout/return?')
  })

  it('verifies the low profile it minted, for the amount it was asked', async () => {
    const mock = new MockCardcomProvider()
    const { lowProfileId } = await mock.createLowProfile(INPUT)
    const verified = await mock.verifyLowProfile(lowProfileId)
    expect(verified.success).toBe(true)
    expect(verified.lowProfileId).toBe(lowProfileId)
    expect(verified.amountAgorot).toBe(agorot(4000))
  })
})
