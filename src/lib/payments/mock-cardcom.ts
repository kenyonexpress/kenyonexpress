import { agorot } from '@/lib/commerce/money'
import { loadCardcomEnv } from '@/lib/payments/env'
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
  private sequence = 0

  failNext(): void {
    this.failNextCharge = true
  }

  reset(): void {
    this.deals.clear()
    this.failNextCharge = false
    this.sequence = 0
    this.documents.length = 0
  }

  async createLowProfile(input: CreateLowProfileInput): Promise<CreateLowProfileResult> {
    this.sequence += 1
    const lowProfileId = `mock-lp-${this.sequence}-${input.paymentId.slice(0, 8)}`
    const transactionId = `mock-txn-${this.sequence}`
    this.deals.set(lowProfileId, {
      input,
      status: 'pending',
      transactionId,
    })
    const env = loadCardcomEnv()
    const redirectUrl = `${env.appUrl}/checkout/return?order_id=${encodeURIComponent(input.orderId)}&lp=${encodeURIComponent(lowProfileId)}`
    return {
      lowProfileId,
      redirectUrl,
      raw: { mock: true, lowProfileId, amountAgorot: input.amountAgorot },
    }
  }

  async chargeWithToken(input: ChargeWithTokenInput): Promise<ChargeWithTokenResult> {
    this.sequence += 1
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
    const transactionId = `mock-tok-${this.sequence}`
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
      refundTransactionId: `mock-${input.cancelOnly ? 'cancel' : 'refund'}-${this.sequence}`,
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
    const documentNumber = `mock-doc-${this.sequence}`
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
