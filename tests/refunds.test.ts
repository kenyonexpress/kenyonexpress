import { agorot } from '@/lib/commerce/money'
import type { RefundResult, VerifyLowProfileResult } from '@/lib/payments/types'
import {
  REFUND_EVENTS,
  REFUND_EXECUTION_STATES,
  REFUND_WALLET_REASON,
  type RefundExecution,
  type RefundHandlerPorts,
  RefundTransitionError,
  type RefundWebhookInput,
  applyRefundEvent,
  canTransitionRefund,
  completeRefundExecution,
  creditRefundWallet,
  handleRefundWebhook,
  isRefundOperation,
  refundExecutionFromRow,
  refundExecutionToPatch,
  refundWalletIdempotencyKey,
  reverseRefundMethod,
  transitionRefund,
  webhookSecretsMatch,
} from '@/server/payments/refund'
import { WALLET_REASON_LABELS } from '@/server/queries/account'
import { describe, expect, it, vi } from 'vitest'

const NOW = new Date('2026-09-01T12:00:00.000Z')

function execution(overrides: Partial<RefundExecution> = {}): RefundExecution {
  return {
    id: 're-1',
    orderId: 'order-1',
    paymentId: 'pay-1',
    chargeTransactionId: 'charge-tx',
    refundTransactionId: null,
    walletEntryId: null,
    state: 'pending',
    amountAgorot: 10_000,
    cancelOnly: false,
    idempotencyKey: 'refund:order-1',
    lowProfileId: 'lp-1',
    walletCreditedAt: null,
    methodReversedAt: null,
    completedAt: null,
    ...overrides,
  }
}

function ports(overrides: Partial<RefundHandlerPorts> = {}): RefundHandlerPorts {
  return {
    now: NOW,
    transferWallet: vi.fn(async () => ({ walletEntryId: 'we-1' })),
    refundByTransactionId: vi.fn(async () => ({
      success: true,
      refundTransactionId: 'refund-tx',
      refundedAgorot: agorot(10_000),
      failureCode: null,
      failureMessage: null,
      raw: {},
    })),
    ...overrides,
  }
}

function verifyOk(overrides: Partial<VerifyLowProfileResult> = {}): VerifyLowProfileResult {
  return {
    success: true,
    amountAgorot: agorot(10_000),
    transactionId: 'refund-tx',
    lowProfileId: 'lp-1',
    raw: {},
    ...overrides,
  }
}

function webhook(overrides: Partial<RefundWebhookInput> = {}): RefundWebhookInput {
  return {
    providedSecret: 'current-secret',
    acceptedSecrets: ['current-secret', 'previous-secret'],
    operation: 'Refund',
    lowProfileId: 'lp-1',
    execution: execution({ state: 'wallet_credited', walletEntryId: 'we-1' }),
    verifyLowProfile: vi.fn(async () => verifyOk()),
    now: NOW,
    ...overrides,
  }
}

describe('refund execution states and events', () => {
  it('names the four money-path states in order', () => {
    expect(REFUND_EXECUTION_STATES).toEqual([
      'pending',
      'wallet_credited',
      'method_reversed',
      'completed',
    ])
  })

  it('names the three events that move those states', () => {
    expect(REFUND_EVENTS).toEqual(['CREDIT_WALLET', 'REVERSE_METHOD', 'COMPLETE'])
  })

  it('credits the wallet under the labelled order_refund reason', () => {
    expect(REFUND_WALLET_REASON).toBe('order_refund')
    expect(WALLET_REASON_LABELS[REFUND_WALLET_REASON]).toBe('החזר על ביטול')
    expect(refundWalletIdempotencyKey('order-1')).toBe('refund:order-1:wallet')
  })
})

describe('the legal refund transitions', () => {
  it('pending + CREDIT_WALLET -> wallet_credited', () => {
    expect(transitionRefund('pending', 'CREDIT_WALLET')).toBe('wallet_credited')
  })

  it('wallet_credited + REVERSE_METHOD -> method_reversed', () => {
    expect(transitionRefund('wallet_credited', 'REVERSE_METHOD')).toBe('method_reversed')
  })

  it('method_reversed + COMPLETE -> completed', () => {
    expect(transitionRefund('method_reversed', 'COMPLETE')).toBe('completed')
  })
})

describe('every illegal combination of state and event', () => {
  const legal: ReadonlyArray<readonly [RefundExecution['state'], (typeof REFUND_EVENTS)[number]]> =
    [
      ['pending', 'CREDIT_WALLET'],
      ['wallet_credited', 'REVERSE_METHOD'],
      ['method_reversed', 'COMPLETE'],
    ]

  for (const from of REFUND_EXECUTION_STATES) {
    for (const event of REFUND_EVENTS) {
      const allowed = legal.some(([state, ev]) => state === from && ev === event)
      it(`${from} + ${event} is ${allowed ? 'legal' : 'illegal'}`, () => {
        expect(canTransitionRefund(from, event)).toBe(allowed)
        if (allowed) {
          expect(() => transitionRefund(from, event)).not.toThrow()
          return
        }
        expect(() => transitionRefund(from, event)).toThrow(RefundTransitionError)
        try {
          transitionRefund(from, event)
        } catch (error) {
          expect(error).toBeInstanceOf(RefundTransitionError)
          const thrown = error as RefundTransitionError
          expect(thrown.code).toBe('ILLEGAL_TRANSITION')
          expect(thrown.from).toBe(from)
          expect(thrown.event).toBe(event)
          expect(thrown.message).toBe(`ILLEGAL_TRANSITION: ${event} from ${from}`)
          expect(thrown.name).toBe('RefundTransitionError')
        }
      })
    }
  }
})

describe('creditRefundWallet', () => {
  it('moves pending to wallet_credited and records the ledger id', async () => {
    const transferWallet = vi.fn(async () => ({ walletEntryId: 'we-9' }))
    const next = await creditRefundWallet(execution(), ports({ transferWallet }))
    expect(next.state).toBe('wallet_credited')
    expect(next.walletEntryId).toBe('we-9')
    expect(next.walletCreditedAt).toBe(NOW.toISOString())
    expect(transferWallet).toHaveBeenCalledWith({
      orderId: 'order-1',
      amountAgorot: 10_000,
      idempotencyKey: 'refund:order-1:wallet',
      reason: 'order_refund',
    })
  })

  it('does not call the ledger when the transition is illegal', async () => {
    const transferWallet = vi.fn(async () => ({ walletEntryId: 'we-1' }))
    await expect(
      creditRefundWallet(execution({ state: 'wallet_credited' }), ports({ transferWallet })),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' })
    expect(transferWallet).not.toHaveBeenCalled()
  })

  it('wraps a ledger Error as WALLET_TRANSFER_FAILED', async () => {
    const transferWallet = vi.fn(async () => {
      throw new Error('insufficient wallet balance')
    })
    await expect(creditRefundWallet(execution(), ports({ transferWallet }))).rejects.toMatchObject({
      code: 'WALLET_TRANSFER_FAILED',
      event: 'CREDIT_WALLET',
      from: 'pending',
      message: 'WALLET_TRANSFER_FAILED: CREDIT_WALLET from pending: insufficient wallet balance',
    })
  })

  it('wraps a non-Error ledger rejection as WALLET_TRANSFER_FAILED', async () => {
    const transferWallet = vi.fn(async () => {
      throw 'down'
    })
    await expect(creditRefundWallet(execution(), ports({ transferWallet }))).rejects.toMatchObject({
      code: 'WALLET_TRANSFER_FAILED',
      message: 'WALLET_TRANSFER_FAILED: CREDIT_WALLET from pending: wallet transfer failed',
    })
  })
})

describe('reverseRefundMethod', () => {
  const credited = execution({
    state: 'wallet_credited',
    walletEntryId: 'we-1',
    walletCreditedAt: '2026-09-01T11:00:00.000Z',
    cancelOnly: true,
  })

  it('moves wallet_credited to method_reversed after the provider succeeds', async () => {
    const refundByTransactionId = vi.fn(async () => ({
      success: true,
      refundTransactionId: 'refund-tx',
      refundedAgorot: agorot(10_000),
      failureCode: null,
      failureMessage: null,
      raw: {},
    }))
    const next = await reverseRefundMethod(credited, ports({ refundByTransactionId }))
    expect(next.state).toBe('method_reversed')
    expect(next.refundTransactionId).toBe('refund-tx')
    expect(next.methodReversedAt).toBe(NOW.toISOString())
    expect(next.walletCreditedAt).toBe('2026-09-01T11:00:00.000Z')
    expect(refundByTransactionId).toHaveBeenCalledWith({
      transactionId: 'charge-tx',
      amountAgorot: agorot(10_000),
      cancelOnly: true,
      description: 'refund:order-1',
    })
  })

  it('does not call Cardcom when the wallet is not yet credited', async () => {
    const refundByTransactionId = vi.fn()
    await expect(
      reverseRefundMethod(execution({ state: 'pending' }), ports({ refundByTransactionId })),
    ).rejects.toMatchObject({ code: 'ILLEGAL_TRANSITION' })
    expect(refundByTransactionId).not.toHaveBeenCalled()
  })

  it('keeps the execution in wallet_credited when the provider returns failure', async () => {
    const refundByTransactionId = vi.fn(
      async (): Promise<RefundResult> => ({
        success: false,
        refundTransactionId: null,
        refundedAgorot: null,
        failureCode: '700',
        failureMessage: 'too late to credit',
        raw: {},
      }),
    )
    await expect(
      reverseRefundMethod(credited, ports({ refundByTransactionId })),
    ).rejects.toMatchObject({
      code: 'PROVIDER_REVERSE_FAILED',
      message: 'PROVIDER_REVERSE_FAILED: REVERSE_METHOD from wallet_credited: too late to credit',
    })
  })

  it('uses a fallback message when the provider returns failure with no text', async () => {
    const refundByTransactionId = vi.fn(
      async (): Promise<RefundResult> => ({
        success: false,
        refundTransactionId: null,
        refundedAgorot: null,
        failureCode: '1',
        failureMessage: null,
        raw: {},
      }),
    )
    await expect(
      reverseRefundMethod(credited, ports({ refundByTransactionId })),
    ).rejects.toMatchObject({
      message:
        'PROVIDER_REVERSE_FAILED: REVERSE_METHOD from wallet_credited: provider reverse failed',
    })
  })

  it('wraps a thrown Error from the provider', async () => {
    const refundByTransactionId = vi.fn(async () => {
      throw new Error('timeout')
    })
    await expect(
      reverseRefundMethod(credited, ports({ refundByTransactionId })),
    ).rejects.toMatchObject({
      code: 'PROVIDER_REVERSE_FAILED',
      message: 'PROVIDER_REVERSE_FAILED: REVERSE_METHOD from wallet_credited: timeout',
    })
  })

  it('wraps a non-Error throw from the provider', async () => {
    const refundByTransactionId = vi.fn(async () => {
      throw 500
    })
    await expect(
      reverseRefundMethod(credited, ports({ refundByTransactionId })),
    ).rejects.toMatchObject({
      message:
        'PROVIDER_REVERSE_FAILED: REVERSE_METHOD from wallet_credited: provider reverse failed',
    })
  })
})

describe('completeRefundExecution', () => {
  it('closes method_reversed', () => {
    const next = completeRefundExecution(
      execution({
        state: 'method_reversed',
        walletEntryId: 'we-1',
        refundTransactionId: 'refund-tx',
        walletCreditedAt: '2026-09-01T11:00:00.000Z',
        methodReversedAt: '2026-09-01T11:30:00.000Z',
      }),
      { now: NOW },
    )
    expect(next.state).toBe('completed')
    expect(next.completedAt).toBe(NOW.toISOString())
    expect(next.methodReversedAt).toBe('2026-09-01T11:30:00.000Z')
  })

  it('refuses to close before the method is reversed', () => {
    expect(() =>
      completeRefundExecution(execution({ state: 'wallet_credited' }), { now: NOW }),
    ).toThrow(RefundTransitionError)
  })
})

describe('applyRefundEvent walks the machine in order', () => {
  it('pending -> wallet_credited -> method_reversed -> completed', async () => {
    const handlerPorts = ports()
    const credited = await applyRefundEvent(execution(), 'CREDIT_WALLET', handlerPorts)
    expect(credited.state).toBe('wallet_credited')
    const reversed = await applyRefundEvent(credited, 'REVERSE_METHOD', handlerPorts)
    expect(reversed.state).toBe('method_reversed')
    const done = await applyRefundEvent(reversed, 'COMPLETE', handlerPorts)
    expect(done.state).toBe('completed')
  })
})

describe('isRefundOperation', () => {
  it('accepts the three Cardcom refund operations, in any case', () => {
    expect(isRefundOperation('refund')).toBe(true)
    expect(isRefundOperation('Refund')).toBe(true)
    expect(isRefundOperation(' credit ')).toBe(true)
    expect(isRefundOperation('CancelOnly')).toBe(true)
    expect(isRefundOperation('CANCELONLY')).toBe(true)
  })

  it('rejects charges, empty values, and non-strings', () => {
    expect(isRefundOperation('ChargeOnly')).toBe(false)
    expect(isRefundOperation('ChargeAndCreateToken')).toBe(false)
    expect(isRefundOperation('')).toBe(false)
    expect(isRefundOperation('   ')).toBe(false)
    expect(isRefundOperation(null)).toBe(false)
    expect(isRefundOperation(undefined)).toBe(false)
  })
})

describe('webhookSecretsMatch does not short-circuit', () => {
  it('accepts the current secret', () => {
    expect(webhookSecretsMatch('current', ['current', 'previous'])).toBe(true)
  })

  it('accepts the secret being retired', () => {
    expect(webhookSecretsMatch('previous', ['current', 'previous'])).toBe(true)
  })

  it('rejects a secret that is neither, after comparing both', () => {
    expect(webhookSecretsMatch('neither', ['current', 'previous'])).toBe(false)
  })

  it('rejects an empty provided value against an empty accepted list', () => {
    expect(webhookSecretsMatch('', [])).toBe(false)
  })
})

describe('handleRefundWebhook authenticity', () => {
  it('refuses a secret that matches none of the accepted values and never calls GetLpResult', async () => {
    const verifyLowProfile = vi.fn()
    const result = await handleRefundWebhook(webhook({ providedSecret: 'wrong', verifyLowProfile }))
    expect(result).toEqual({
      ok: false,
      code: 'SECRET_INVALID',
      execution: expect.objectContaining({ state: 'wallet_credited' }),
    })
    expect(verifyLowProfile).not.toHaveBeenCalled()
  })

  it('refuses a charge Operation and never calls GetLpResult', async () => {
    const verifyLowProfile = vi.fn()
    const result = await handleRefundWebhook(webhook({ operation: 'ChargeOnly', verifyLowProfile }))
    expect(result).toMatchObject({ ok: false, code: 'NOT_REFUND_OPERATION' })
    expect(verifyLowProfile).not.toHaveBeenCalled()
  })

  it('refuses when GetLpResult says the deal did not succeed', async () => {
    const result = await handleRefundWebhook(
      webhook({
        verifyLowProfile: async () => verifyOk({ success: false, amountAgorot: agorot(10_000) }),
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'VERIFY_FAILED' })
  })

  it('refuses when GetLpResult returns no amount', async () => {
    const result = await handleRefundWebhook(
      webhook({
        verifyLowProfile: async () => verifyOk({ success: true, amountAgorot: null }),
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'VERIFY_FAILED' })
  })

  it('refuses when GetLpResult throws', async () => {
    const result = await handleRefundWebhook(
      webhook({
        verifyLowProfile: async () => {
          throw new Error('timeout')
        },
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'VERIFY_FAILED' })
  })

  it('refuses when GetLpResult amount does not match the execution, ignoring any body amount', async () => {
    const result = await handleRefundWebhook(
      webhook({
        verifyLowProfile: async () => verifyOk({ amountAgorot: agorot(99_900) }),
      }),
    )
    expect(result).toMatchObject({ ok: false, code: 'AMOUNT_MISMATCH' })
  })
})

describe('handleRefundWebhook state', () => {
  it('refuses to reverse while the wallet is not yet credited', async () => {
    const result = await handleRefundWebhook(
      webhook({ execution: execution({ state: 'pending' }) }),
    )
    expect(result).toMatchObject({ ok: false, code: 'WALLET_NOT_CREDITED' })
    if (!result.ok) expect(result.execution.state).toBe('pending')
  })

  it('replays from method_reversed without changing the row', async () => {
    const existing = execution({
      state: 'method_reversed',
      walletEntryId: 'we-1',
      refundTransactionId: 'already',
      methodReversedAt: '2026-09-01T11:30:00.000Z',
    })
    const result = await handleRefundWebhook(webhook({ execution: existing }))
    expect(result).toEqual({ ok: true, replay: true, execution: existing })
  })

  it('replays from completed without changing the row', async () => {
    const existing = execution({
      state: 'completed',
      walletEntryId: 'we-1',
      refundTransactionId: 'already',
      completedAt: '2026-09-01T11:45:00.000Z',
    })
    const result = await handleRefundWebhook(webhook({ execution: existing }))
    expect(result).toEqual({ ok: true, replay: true, execution: existing })
  })

  it('records reverse then complete when the wallet is already credited', async () => {
    const result = await handleRefundWebhook(webhook())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.replay).toBe(false)
    expect(result.execution.state).toBe('completed')
    expect(result.execution.refundTransactionId).toBe('refund-tx')
    expect(result.execution.methodReversedAt).toBe(NOW.toISOString())
    expect(result.execution.completedAt).toBe(NOW.toISOString())
  })

  it('keeps the stored refund transaction id when GetLpResult omits one', async () => {
    const result = await handleRefundWebhook(
      webhook({
        execution: execution({
          state: 'wallet_credited',
          walletEntryId: 'we-1',
          refundTransactionId: 'kept-tx',
        }),
        verifyLowProfile: async () => verifyOk({ transactionId: null }),
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.execution.refundTransactionId).toBe('kept-tx')
  })
})

describe('refund_executions row mapping', () => {
  it('round-trips the money-path columns', () => {
    const row = {
      id: 're-1',
      order_id: 'order-1',
      payment_id: 'pay-1',
      charge_transaction_id: 'charge-tx',
      refund_transaction_id: 'refund-tx',
      wallet_entry_id: 'we-1',
      state: 'completed' as const,
      amount_agorot: 10_000,
      cancel_only: false,
      idempotency_key: 'refund:order-1',
      low_profile_id: 'lp-1',
      wallet_credited_at: '2026-09-01T11:00:00.000Z',
      method_reversed_at: '2026-09-01T11:30:00.000Z',
      completed_at: '2026-09-01T12:00:00.000Z',
    }
    const mapped = refundExecutionFromRow(row)
    expect(mapped).toEqual({
      id: 're-1',
      orderId: 'order-1',
      paymentId: 'pay-1',
      chargeTransactionId: 'charge-tx',
      refundTransactionId: 'refund-tx',
      walletEntryId: 'we-1',
      state: 'completed',
      amountAgorot: 10_000,
      cancelOnly: false,
      idempotencyKey: 'refund:order-1',
      lowProfileId: 'lp-1',
      walletCreditedAt: '2026-09-01T11:00:00.000Z',
      methodReversedAt: '2026-09-01T11:30:00.000Z',
      completedAt: '2026-09-01T12:00:00.000Z',
    })
    expect(refundExecutionToPatch(mapped)).toEqual({
      state: 'completed',
      refund_transaction_id: 'refund-tx',
      wallet_entry_id: 'we-1',
      wallet_credited_at: '2026-09-01T11:00:00.000Z',
      method_reversed_at: '2026-09-01T11:30:00.000Z',
      completed_at: '2026-09-01T12:00:00.000Z',
    })
  })
})
