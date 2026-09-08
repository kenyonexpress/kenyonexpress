import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The scan screen's two refusals, which look alike and are not alike.
 *
 * A forged token is the customer's problem and is recorded against them. A
 * server with no signing secret is OURS: it must not be written into
 * voucher_redemptions as an invalid signature, because that log exists so a
 * disputed scan can be reconstructed, and our misconfiguration filed as the
 * customer's forgery makes it evidence of the wrong thing.
 *
 * Before this, neither happened - the verifier threw and the cashier got a
 * crash page. 28 events in seven days, all on /redeem/<junk>.
 *
 * The page is a server component, so the test reaches its body through the
 * Suspense child rather than rendering it. There is no RSC test harness here
 * and this needs none: the assertions are about which branch runs.
 */

const {
  classifyVoucherQrPayload,
  recordRefusedScan,
  capturePaymentError,
  checkRateLimit,
  getSupplierSession,
  getVoucherForRedemption,
} = vi.hoisted(() => ({
  classifyVoucherQrPayload: vi.fn(),
  recordRefusedScan: vi.fn(),
  capturePaymentError: vi.fn(),
  checkRateLimit: vi.fn(),
  getSupplierSession: vi.fn(),
  getVoucherForRedemption: vi.fn(),
}))

vi.mock('@/server/domain/vouchers/qr', () => ({ classifyVoucherQrPayload }))
vi.mock('@/server/domain/vouchers/scan-context', () => ({
  recordRefusedScan,
  readScanContext: () => ({ ip: null, userAgent: null }),
}))
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentError }))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/lib/supplier/rbac', () => ({
  getSupplierSession,
  getSupplierMemberships: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/server/queries/vouchers', () => ({ getVoucherForRedemption }))
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock('./RedeemConfirm', () => ({ default: () => null }))

import RedeemTokenPage from './page'

const TOKEN = 'KEV1.ZmFrZQ.bm90LWEtc2lnbmF0dXJl'

/**
 * Every string in the returned tree, so an assertion can name the copy.
 *
 * Walks ALL props and not just children: the refusals are `<Refusal title=...
 * detail=... />`, and the component is never invoked here, so the copy sits in
 * props. A children-only walk returns the empty string and every assertion
 * about the words on the screen passes vacuously.
 */
// biome-ignore lint/suspicious/noExplicitAny: walking an untyped element tree
function text(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node !== 'object') return ''
  return Object.values(node.props ?? {})
    .map(text)
    .join(' ')
}

async function renderBody(token = TOKEN): Promise<unknown> {
  const params = Promise.resolve({ token })
  // biome-ignore lint/suspicious/noExplicitAny: reaching the Suspense child
  const shell = RedeemTokenPage({ params }) as any
  return await shell.props.children.type({ params })
}

describe('/redeem/[token] when the token cannot be verified', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimit.mockResolvedValue(true)
    getSupplierSession.mockResolvedValue(null)
    getVoucherForRedemption.mockResolvedValue(null)
  })

  describe('a server with no signing secret', () => {
    beforeEach(() => {
      classifyVoucherQrPayload.mockReturnValue({
        status: 'unverifiable',
        error: new Error('VOUCHER_QR_SECRET is not set'),
      })
    })

    it('says so, instead of raising the crash page it used to', async () => {
      expect(text(await renderBody())).toContain('לא ניתן לאמת שוברים כרגע')
    })

    it('does not file our misconfiguration as the customer’s forgery', async () => {
      await renderBody()
      expect(recordRefusedScan).not.toHaveBeenCalled()
    })

    it('still reports it, because an operator has to fix it', async () => {
      await renderBody()
      expect(capturePaymentError).toHaveBeenCalledTimes(1)
      expect(capturePaymentError.mock.calls[0]?.[1]).toMatchObject({ stage: 'voucher_qr_verify' })
    })

    it('never reaches the database', async () => {
      await renderBody()
      expect(getSupplierSession).not.toHaveBeenCalled()
      expect(getVoucherForRedemption).not.toHaveBeenCalled()
    })
  })

  describe('a forged token, which is a different thing', () => {
    beforeEach(() => {
      classifyVoucherQrPayload.mockReturnValue({ status: 'forged' })
    })

    it('is still recorded against the scan, session or no session', async () => {
      const tree = await renderBody()
      expect(text(tree)).toContain('קוד השובר אינו תקין')
      expect(recordRefusedScan).toHaveBeenCalledTimes(1)
      expect(recordRefusedScan.mock.calls[0]?.[0]).toMatchObject({ outcome: 'invalid_signature' })
    })

    it('is not reported as a payment fault, because nothing on our side broke', async () => {
      await renderBody()
      expect(capturePaymentError).not.toHaveBeenCalled()
    })
  })
})
