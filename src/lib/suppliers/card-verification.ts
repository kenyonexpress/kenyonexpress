import { type Agorot, agorot } from '@/lib/money'
import type { CardcomEnv } from '@/lib/payments/env'
import type { PaymentProvider } from '@/lib/payments/types'

/**
 * The 1 ILS card check for a supplier applicant: charge 100 agorot, then void it.
 *
 * WHAT IT PROVES. That the applicant holds a live card the terminal will
 * authorise, which is the cheapest signal that the person behind an application
 * is reachable through the payment system at all. It proves nothing about the
 * bank account the payouts go to; that is the uploaded bank confirmation.
 *
 * SANDBOX ONLY, AND THAT IS NOT A STUB. Against the real terminal the card is
 * typed into Cardcom's hosted page, so the charge completes in the browser and
 * comes back through the frame-return, not inside one server call. No Cardcom
 * credential exists in any environment this repo reaches (docs/S13-cancel.md),
 * so that path cannot be exercised, and a code path nobody can run is not
 * shipped as if it worked. Against any provider but the mock this answers
 * `unavailable` before touching it.
 *
 * VERIFIED MEANS CHARGED AND VOIDED. A charge whose void failed is a `failed`
 * with `VOID_FAILED`, carrying the transaction id so an operator can void it by
 * hand. Reporting it as verified would leave a shekel on somebody's card with
 * nobody looking. The void is `cancelOnly`: same day, before transmission, so
 * the clearing house never sees it and no clearing commission is paid on it.
 */

export const CARD_CHECK_AGOROT: Agorot = agorot(100)

/**
 * Whether the check may be offered at all: the sandbox provider, and NOT the
 * sandbox that a production deployment falls back to. There `refusedReason` is
 * set because the mock approves everything, and a card "verified" by a provider
 * that never saw a card is a false record, so the production storefront shows
 * no button and the action refuses.
 */
export function cardCheckAvailable(env: Pick<CardcomEnv, 'useMock' | 'refusedReason'>): boolean {
  return env.useMock && env.refusedReason === null
}

export type CardCheckInput = {
  applicationId: string
  /** Correlation id for the provider; a fresh uuid per attempt. */
  attemptId: string
  successRedirectUrl: string
  failedRedirectUrl: string
  webhookUrl: string
}

export type CardCheckOutcome =
  | {
      status: 'verified'
      lowProfileId: string
      transactionId: string
      voidTransactionId: string
      last4: string | null
    }
  | {
      status: 'failed'
      failureCode: 'CREATE_FAILED' | 'DECLINED' | 'AMOUNT_MISMATCH' | 'VOID_FAILED'
      lowProfileId: string | null
      transactionId: string | null
    }
  | { status: 'unavailable'; reason: 'sandbox_only' }

export async function runCardCheck(
  provider: PaymentProvider,
  input: CardCheckInput,
): Promise<CardCheckOutcome> {
  if (provider.name !== 'mock') return { status: 'unavailable', reason: 'sandbox_only' }

  let lowProfileId: string
  try {
    const created = await provider.createLowProfile({
      paymentId: input.attemptId,
      orderId: input.applicationId,
      orderNumber: `SUP-${input.applicationId.slice(0, 8)}`,
      amountAgorot: CARD_CHECK_AGOROT,
      currency: 'ILS',
      saveToken: true,
      successRedirectUrl: input.successRedirectUrl,
      failedRedirectUrl: input.failedRedirectUrl,
      webhookUrl: input.webhookUrl,
      description: 'אימות כרטיס ספק, ₪1 שמבוטל מיד',
    })
    lowProfileId = created.lowProfileId
  } catch {
    return {
      status: 'failed',
      failureCode: 'CREATE_FAILED',
      lowProfileId: null,
      transactionId: null,
    }
  }

  const verified = await provider.verifyLowProfile(lowProfileId)
  if (!verified.success || !verified.transactionId) {
    return {
      status: 'failed',
      failureCode: 'DECLINED',
      lowProfileId,
      transactionId: verified.transactionId,
    }
  }
  // The re-fetched amount is the only trusted one. Anything but exactly 100
  // agorot means this was not the deal we opened, and it is not voided blind.
  if (verified.amountAgorot !== CARD_CHECK_AGOROT) {
    return {
      status: 'failed',
      failureCode: 'AMOUNT_MISMATCH',
      lowProfileId,
      transactionId: verified.transactionId,
    }
  }

  const voided = await provider.refundByTransactionId({
    transactionId: verified.transactionId,
    amountAgorot: CARD_CHECK_AGOROT,
    cancelOnly: true,
    description: 'ביטול אימות כרטיס ספק',
  })
  if (!voided.success || !voided.refundTransactionId) {
    return {
      status: 'failed',
      failureCode: 'VOID_FAILED',
      lowProfileId,
      transactionId: verified.transactionId,
    }
  }

  return {
    status: 'verified',
    lowProfileId,
    transactionId: verified.transactionId,
    voidTransactionId: voided.refundTransactionId,
    last4: verified.token?.last4 ?? null,
  }
}
