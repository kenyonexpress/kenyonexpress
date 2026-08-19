import { describe, expect, it } from 'vitest'
import {
  PAYOUT_STATE_LABELS,
  canApprove,
  canCancel,
  canMarkPaid,
  generatePayoutSchema,
  isHeld,
  markPaidSchema,
  payoutState,
  shekelsFromIls,
} from './payouts'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('payoutState', () => {
  it('reads a rolled-over run as its own state, not as a cancellation', () => {
    // This is the whole reason the helper exists. Migration 081 writes a run
    // under the supplier minimum as cancelled + rolled_over (C8), so trusting
    // the enum alone would tell the admin the money was abandoned when it is
    // in fact still owed and waiting for the next run.
    expect(payoutState({ status: 'cancelled', rolled_over: true })).toBe('rolled_over')
    expect(payoutState({ status: 'cancelled', rolled_over: false })).toBe('cancelled')
  })

  it('passes every other status through', () => {
    for (const status of ['draft', 'pending_approval', 'approved', 'paid'] as const) {
      expect(payoutState({ status })).toBe(status)
    }
  })

  it('falls back to draft on a status the enum does not carry', () => {
    expect(payoutState({ status: 'something_new' })).toBe('draft')
  })

  it('labels every state it can return', () => {
    for (const status of ['draft', 'pending_approval', 'approved', 'paid', 'cancelled'] as const) {
      expect(PAYOUT_STATE_LABELS[payoutState({ status })]).toBeTruthy()
    }
    expect(PAYOUT_STATE_LABELS.rolled_over).toBeTruthy()
  })
})

describe('payout transitions', () => {
  it('only approves a run that produced lines and is awaiting approval', () => {
    expect(canApprove({ status: 'pending_approval' })).toBe(true)
    expect(canApprove({ status: 'draft' })).toBe(false)
    expect(canApprove({ status: 'approved' })).toBe(false)
    expect(canApprove({ status: 'paid' })).toBe(false)
  })

  it('refuses to approve a rolled-over run', () => {
    // Its lines were deleted so the next run can pick the same order items up;
    // approving it would approve an empty statement.
    expect(canApprove({ status: 'cancelled', rolled_over: true })).toBe(false)
  })

  it('never pays a statement that was not approved first', () => {
    expect(canMarkPaid({ status: 'approved' })).toBe(true)
    expect(canMarkPaid({ status: 'pending_approval' })).toBe(false)
    expect(canMarkPaid({ status: 'draft' })).toBe(false)
    expect(canMarkPaid({ status: 'cancelled', rolled_over: true })).toBe(false)
  })

  it('cannot cancel what is already paid or already gone', () => {
    expect(canCancel({ status: 'approved' })).toBe(true)
    expect(canCancel({ status: 'paid' })).toBe(false)
    expect(canCancel({ status: 'cancelled', rolled_over: true })).toBe(false)
  })
})

describe('isHeld', () => {
  const now = new Date('2026-07-28T00:00:00Z')

  it('holds a statement whose lines have not cleared T+3 yet', () => {
    expect(isHeld({ available_at: '2026-07-30T00:00:00Z' }, now)).toBe(true)
  })

  it('releases one whose hold has passed', () => {
    expect(isHeld({ available_at: '2026-07-27T00:00:00Z' }, now)).toBe(false)
  })

  it('does not hold a statement with no availability recorded', () => {
    expect(isHeld({ available_at: null }, now)).toBe(false)
    expect(isHeld({}, now)).toBe(false)
  })
})

describe('generatePayoutSchema', () => {
  it('rejects a period that ends before it starts', () => {
    const result = generatePayoutSchema.safeParse({
      supplierId: UUID,
      periodStart: '2026-07-31',
      periodEnd: '2026-07-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a zero-length period, which the table CHECK also refuses', () => {
    const result = generatePayoutSchema.safeParse({
      supplierId: UUID,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-01',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed period', () => {
    const result = generatePayoutSchema.safeParse({
      supplierId: UUID,
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    })
    expect(result.success).toBe(true)
  })
})

describe('markPaidSchema', () => {
  it('refuses a payout marked paid with no reference to reconcile against', () => {
    expect(markPaidSchema.safeParse({ statementId: UUID, reference: '  ' }).success).toBe(false)
  })

  it('trims the reference it accepts', () => {
    const parsed = markPaidSchema.parse({ statementId: UUID, reference: '  TRF-9912  ' })
    expect(parsed.reference).toBe('TRF-9912')
  })
})

describe('shekelsFromIls', () => {
  it('formats the numeric(12,2) strings postgrest returns for money columns', () => {
    expect(shekelsFromIls('1234.5')).toBe('₪1,234.50')
    expect(shekelsFromIls(0)).toBe('₪0.00')
    expect(shekelsFromIls(null)).toBe('₪0.00')
  })
})
