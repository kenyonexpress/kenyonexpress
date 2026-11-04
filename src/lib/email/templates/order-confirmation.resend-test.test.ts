import { describe, expect, it, vi } from 'vitest'

/**
 * S12: the purchase confirmation through the real Resend API, in test mode.
 *
 * Opt-in. It runs only when `RESEND_TEST_API_KEY` is set, so CI and a laptop
 * with no key skip it. The recipient is `delivered@resend.dev`, Resend's
 * test address: the API accepts and processes the mail exactly as for a real
 * recipient, and nobody receives it.
 *
 * Only the suppression lookup is mocked, because it reads the database. The
 * builder, `sendEmail`, the headers and the request body are the production
 * code path.
 */

vi.mock('@/lib/email/suppression', () => ({
  isSuppressed: async () => false,
  countEmailEvent: async () => undefined,
}))

import { buildOrderConfirmationEmail, sendBuiltEmail } from '@/lib/email/templates'

const key = process.env.RESEND_TEST_API_KEY

describe.skipIf(!key)('purchase confirmation, Resend test mode', () => {
  it('is accepted by Resend for delivered@resend.dev and gets a message id', async () => {
    vi.stubEnv('RESEND_API_KEY', key as string)
    const orderId = '79f488aa-549a-40dd-af80-eb66d886668f'
    const mail = buildOrderConfirmationEmail({
      orderId,
      orderRef: '79F488AA',
      customerName: 'בדיקה',
      totalAgorot: 81_700,
      itemCount: 2,
      siteUrl: 'https://kenyonexpress.co.il',
    })

    const result = await sendBuiltEmail(mail, {
      to: 'delivered@resend.dev',
      idempotencyKey: `s12-test-${Date.now()}`,
    })

    // Printed so the proof document can quote the id Resend returned.
    console.log('resend-test-result', JSON.stringify(result))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
    vi.unstubAllEnvs()
  }, 20_000)
})
