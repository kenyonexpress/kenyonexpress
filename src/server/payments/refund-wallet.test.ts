import type { RefundState } from '@/server/payments/refund-record'
import {
  BRIEF_STATE_ALIASES,
  WALLET_REFUND_TRANSITIONS,
  isLegalWalletRefundTransition,
  planWalletCredit,
  terminalWalletRefundStates,
  walletRefundGround,
} from '@/server/payments/refund-wallet'
import { describe, expect, it } from 'vitest'

const ALL_STATES: RefundState[] = [
  'requested',
  'approved',
  'rejected',
  'executing',
  'completed',
  'failed',
]

describe('the machine is expressed in the vocabulary the database has', () => {
  // The brief asked for pending/authorized/wallet_credited/completed. Three of
  // those four are not members of `refund_state`, so storing them would be a
  // 22P02 on the enum. The aliases keep the brief's language resolvable in code
  // while the machine speaks the deployed names.
  it('maps every name in the brief onto a real enum member', () => {
    expect(Object.values(BRIEF_STATE_ALIASES).every((s) => ALL_STATES.includes(s))).toBe(true)
    expect(BRIEF_STATE_ALIASES.pending).toBe('requested')
    expect(BRIEF_STATE_ALIASES.authorized).toBe('approved')
    expect(BRIEF_STATE_ALIASES.wallet_credited).toBe('executing')
    expect(BRIEF_STATE_ALIASES.completed).toBe('completed')
  })

  it('covers every state the enum carries, so none is unreachable by omission', () => {
    expect(Object.keys(WALLET_REFUND_TRANSITIONS).sort()).toEqual([...ALL_STATES].sort())
  })
})

describe('every transition, legal and illegal', () => {
  const legal: Array<[RefundState, RefundState]> = [
    ['requested', 'approved'],
    ['requested', 'rejected'],
    ['approved', 'executing'],
    ['approved', 'rejected'],
    ['executing', 'completed'],
    ['executing', 'failed'],
  ]

  for (const [from, to] of legal) {
    it(`allows ${from} -> ${to}`, () => {
      expect(isLegalWalletRefundTransition(from, to)).toBe(true)
    })
  }

  // Everything not declared above is refused. Written as the complement rather
  // than as a hand-listed set, so a rule added to the table without a test
  // cannot slip through.
  const legalKeys = new Set(legal.map(([f, t]) => `${f}->${t}`))
  for (const from of ALL_STATES) {
    for (const to of ALL_STATES) {
      if (from === to || legalKeys.has(`${from}->${to}`)) continue
      it(`refuses ${from} -> ${to}`, () => {
        expect(isLegalWalletRefundTransition(from, to)).toBe(false)
      })
    }
  }

  it('always allows a state to itself, so an unrelated column update is not blocked', () => {
    for (const s of ALL_STATES) expect(isLegalWalletRefundTransition(s, s)).toBe(true)
  })
})

describe('terminal states', () => {
  // A rejected or failed refund is reopened by filing a new one. Moving this row
  // would erase the first attempt, which is part of the record.
  it('are the three nothing leaves', () => {
    expect([...terminalWalletRefundStates()].sort()).toEqual(['completed', 'failed', 'rejected'])
  })
})

const base = {
  orderId: 'ord-1',
  userId: 'user-1',
  refundAmountAgorot: 9_500,
  cancellationFeeAgorot: 0,
  fromState: 'approved' as RefundState,
}

describe('planning a wallet credit', () => {
  it('converts once, through the money module, because the RPC speaks shekels', () => {
    const plan = planWalletCredit(base)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.amountAgorot).toBe(9_500)
    expect(plan.amountIls).toBe(95)
    expect(plan.nextState).toBe('executing')
  })

  // Derived from the order, not from a clock or a random. fn_wallet_transfer
  // refuses a repeated key, so a replayed refund cannot credit twice.
  it('produces the same idempotency key for the same order', () => {
    const a = planWalletCredit(base)
    const b = planWalletCredit({ ...base, refundAmountAgorot: 100 })
    expect(a.ok && b.ok && a.idempotencyKey === b.idempotencyKey).toBe(true)
    expect(a.ok && a.idempotencyKey).toBe('refund:ord-1:wallet')
  })

  // A guest has no wallet. Crediting one would invent an account for someone who
  // never had one, and the money would be unreachable.
  it('refuses a guest order', () => {
    const plan = planWalletCredit({ ...base, userId: null })
    expect(plan).toEqual({ ok: false, reason: 'guest_order_has_no_wallet' })
  })

  // The fee is a deduction from money returned to a payment instrument. A
  // goodwill credit that quietly withheld 5% is a worse product than refusing,
  // and migration 148 says the same thing as a CHECK.
  it('refuses a fee rather than silently zeroing it', () => {
    const plan = planWalletCredit({ ...base, cancellationFeeAgorot: 500 })
    expect(plan).toEqual({ ok: false, reason: 'fee_on_wallet_refund' })
  })

  it('refuses a non-positive or fractional amount', () => {
    for (const amount of [0, -1, 17.5]) {
      expect(planWalletCredit({ ...base, refundAmountAgorot: amount })).toEqual({
        ok: false,
        reason: 'amount_not_positive',
      })
    }
  })

  it('refuses a credit from a state that may not reach executing', () => {
    for (const from of ['requested', 'completed', 'rejected', 'failed'] as RefundState[]) {
      expect(planWalletCredit({ ...base, fromState: from })).toEqual({
        ok: false,
        reason: 'illegal_transition',
      })
    }
  })
})

describe('the ground a wallet refund is filed under', () => {
  // A wallet credit is the instrument for value already consumed, where pulling
  // the card money back would return value the customer received.
  it('is goodwill by default, not the distance-sale ground', () => {
    expect(walletRefundGround({})).toBe('goodwill')
    expect(walletRefundGround({ isDefectClaim: false })).toBe('goodwill')
  })

  it('is defect when the fault is ours', () => {
    expect(walletRefundGround({ isDefectClaim: true })).toBe('defect')
  })
})
