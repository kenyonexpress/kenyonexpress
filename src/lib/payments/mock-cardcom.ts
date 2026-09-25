import { agorot } from '@/lib/commerce/money'
import { MOCK_TRANSACTION_PREFIX } from '@/lib/payments/mock-transaction-id'
import type {
  ChargeWithTokenInput,
  ChargeWithTokenResult,
  CreateDocumentInput,
  CreateDocumentResult,
  CreateLowProfileInput,
  CreateLowProfileResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  VerifyLowProfileResult,
} from '@/lib/payments/types'

type StoredDeal = {
  input: CreateLowProfileInput
  status: 'pending' | 'succeeded' | 'failed'
  transactionId: string
}

/**
 * In-memory Cardcom stand-in for Vitest / local checkout without real credentials.
 * Deals succeed by default; call `failNext` to simulate declines.
 */
export class MockCardcomProvider implements PaymentProvider {
  readonly name = 'mock' as const
  private deals = new Map<string, StoredDeal>()
  private failNextCharge = false
  private challengeNextCharge = false
  private sequence = 0

  failNext(): void {
    this.failNextCharge = true
  }

  /** The next token charge answers "come back with a 3DS challenge" instead of a decline. */
  challengeNext(): void {
    this.challengeNextCharge = true
  }

  reset(): void {
    this.deals.clear()
    this.failNextCharge = false
    this.challengeNextCharge = false
    this.sequence = 0
    this.documents.length = 0
  }

  async createLowProfile(input: CreateLowProfileInput): Promise<CreateLowProfileResult> {
    this.sequence += 1
    const lowProfileId = `${MOCK_TRANSACTION_PREFIX}lp-${this.sequence}-${input.paymentId.slice(0, 8)}`
    const transactionId = `${MOCK_TRANSACTION_PREFIX}txn-${this.sequence}`
    this.deals.set(lowProfileId, {
      input,
      status: 'pending',
      transactionId,
    })
    /**
     * THE MOCK RETURNS WHERE THE REAL PROVIDER RETURNS, and it did not.
     *
     * It used to invent `${appUrl}/checkout/return?order_id=...&lp=...`. Both
     * halves of that were wrong, and together they made the mock checkout
     * unusable in a browser - which is every local checkout, every preview
     * deployment, and the whole Playwright money path.
     *
     * 1. THE FRAME WAS BLOCKED. The checkout mounts this URL in an iframe and
     *    the page's CSP carries `frame-src https://secure.cardcom.solutions`.
     *    A URL on our own origin is not that host, so Chrome refused it
     *    outright: "Framing 'http://localhost:3311/checkout/return?...'
     *    violates the following Content Security Policy directive". Measured
     *    2026-09-10 on the production build. `frame-policy.ts` now opens
     *    `frame-src 'self'` for the mock, and only for the mock.
     * 2. /checkout/return IS NOT FRAMABLE, ON PURPOSE. It keeps
     *    `frame-ancestors 'none'` and it requires a session, because the
     *    navigation into the iframe is cross-site and the Lax session cookie
     *    is withheld - a shopper who had just paid would watch a login form
     *    appear inside the payment box. The framable stub is
     *    /checkout/frame-return, and `successRedirectUrl` already points at it.
     *
     * So the mock hands back the redirect URL it was GIVEN. The mock flow now
     * traverses the identical route as a real charge - frame-return, top-window
     * breakout, then the authenticated confirmation - instead of a shortcut
     * that only ever worked in a test that never opened a browser.
     *
     * The `lp` parameter is not restored with it: `reconcileOrderReturn` reads
     * `payments.cardcom_low_profile_id` from the row, which is what the real
     * provider's return URL forces it to do anyway.
     */
    return {
      lowProfileId,
      redirectUrl: input.successRedirectUrl,
      raw: { mock: true, lowProfileId, amountAgorot: input.amountAgorot },
    }
  }

  async chargeWithToken(input: ChargeWithTokenInput): Promise<ChargeWithTokenResult> {
    this.sequence += 1
    if (this.challengeNextCharge) {
      this.challengeNextCharge = false
      return {
        success: false,
        transactionId: null,
        failureCode: 'THREEDS_CHALLENGE',
        failureMessage: 'ThreeDSecure challenge required',
        raw: { mock: true, threeDSecureChallenge: true },
      }
    }
    if (this.failNextCharge) {
      this.failNextCharge = false
      return {
        success: false,
        transactionId: null,
        failureCode: 'DECLINED',
        failureMessage: 'Mock decline',
        raw: { mock: true, declined: true },
      }
    }
    const transactionId = `${MOCK_TRANSACTION_PREFIX}tok-${this.sequence}`
    return {
      success: true,
      transactionId,
      failureCode: null,
      failureMessage: null,
      token: {
        token: input.cardcomToken,
        last4: '4242',
        brand: 'Visa',
        expiryMonth: 12,
        expiryYear: 2030,
      },
      raw: { mock: true, transactionId },
    }
  }

  async verifyLowProfile(lowProfileId: string): Promise<VerifyLowProfileResult> {
    const deal = this.deals.get(lowProfileId)
    if (!deal) {
      return {
        success: false,
        amountAgorot: null,
        transactionId: null,
        lowProfileId,
        raw: { mock: true, found: false },
      }
    }

    if (this.failNextCharge) {
      this.failNextCharge = false
      deal.status = 'failed'
      return {
        success: false,
        amountAgorot: deal.input.amountAgorot,
        transactionId: deal.transactionId,
        lowProfileId,
        raw: { mock: true, status: 'failed' },
      }
    }

    deal.status = 'succeeded'
    return {
      success: true,
      amountAgorot: agorot(deal.input.amountAgorot),
      transactionId: deal.transactionId,
      lowProfileId,
      token: deal.input.saveToken
        ? {
            token: `tok_${deal.transactionId}`,
            last4: '4242',
            brand: 'Visa',
            expiryMonth: 12,
            expiryYear: 2030,
          }
        : undefined,
      raw: { mock: true, status: 'succeeded', amountAgorot: deal.input.amountAgorot },
    }
  }

  async refundByTransactionId(input: RefundInput): Promise<RefundResult> {
    this.sequence += 1
    if (this.failNextCharge) {
      this.failNextCharge = false
      return {
        success: false,
        refundTransactionId: null,
        refundedAgorot: null,
        failureCode: 'REFUND_DECLINED',
        failureMessage: 'Mock refund decline',
        raw: { mock: true, declined: true },
      }
    }
    const refunded = input.partialAmountAgorot ?? input.amountAgorot
    // `cancelOnly` is echoed into `raw` on purpose: it is the only way a test
    // can assert that the same-day path asked for a cancellation rather than a
    // credit, and getting that backwards costs a clearing commission per order
    // without changing a single visible number.
    return {
      success: true,
      refundTransactionId: `${MOCK_TRANSACTION_PREFIX}${input.cancelOnly ? 'cancel' : 'refund'}-${this.sequence}`,
      refundedAgorot: agorot(refunded),
      failureCode: null,
      failureMessage: null,
      raw: { mock: true, refundedAgorot: refunded, cancelOnly: input.cancelOnly === true },
    }
  }

  /**
   * Documents issued by this instance, newest last. Kept so a test can assert
   * WHAT was asked for, not merely that something was: a receipt whose lines do
   * not add up to the charge is the failure this feature exists to prevent.
   */
  readonly documents: CreateDocumentInput[] = []

  /**
   * The mock knows nothing about a terminal, so it reports an empty list rather
   * than inventing transactions. An invented one would make the reconciliation
   * report a discrepancy against a charge that never existed - an alert about
   * fiction is worse than no alert.
   */
  async listTransactions(): Promise<{ ok: true; transactions: [] }> {
    return { ok: true, transactions: [] }
  }

  async createDocument(input: CreateDocumentInput): Promise<CreateDocumentResult> {
    this.sequence += 1
    if (this.failNextCharge) {
      this.failNextCharge = false
      return {
        success: false,
        documentNumber: null,
        documentUrl: null,
        failureCode: 'DOCUMENT_REJECTED',
        failureMessage: 'Mock document decline',
        raw: { mock: true, declined: true },
      }
    }
    this.documents.push(input)
    const documentNumber = `${MOCK_TRANSACTION_PREFIX}doc-${this.sequence}`
    return {
      success: true,
      documentNumber,
      documentUrl: `https://mock.cardcom.invalid/documents/${documentNumber}.pdf`,
      failureCode: null,
      failureMessage: null,
      raw: { mock: true, documentNumber, totalAgorot: input.totalAgorot },
    }
  }

  /** Simulate a successful hosted payment so webhook tests can verify. */
  markSucceeded(lowProfileId: string): void {
    const deal = this.deals.get(lowProfileId)
    if (deal) deal.status = 'succeeded'
  }

  getDeal(lowProfileId: string): StoredDeal | undefined {
    return this.deals.get(lowProfileId)
  }
}

let sharedMock: MockCardcomProvider | null = null

export function getSharedMockCardcom(): MockCardcomProvider {
  if (!sharedMock) sharedMock = new MockCardcomProvider()
  return sharedMock
}
