import { describe, expect, it } from 'vitest'
import {
  TERMINAL_VOUCHER_STATES,
  VOUCHER_EVENTS,
  VOUCHER_STATES,
  type VoucherEvent,
  type VoucherGuardContext,
  type VoucherState,
  VoucherTransitionError,
  canTransition,
  isTerminalVoucherState,
  legalVoucherEvents,
  nextVoucherState,
  transition,
} from './state-machine'

const NOW = new Date('2026-07-24T10:00:00.000Z')
const FUTURE = new Date('2026-08-24T10:00:00.000Z')
const PAST = new Date('2026-07-01T10:00:00.000Z')

function ctx(overrides: Partial<VoucherGuardContext> = {}): VoucherGuardContext {
  return {
    supplierId: 'supplier-1',
    actingSupplierId: 'supplier-1',
    expiresAt: FUTURE,
    now: NOW,
    ...overrides,
  }
}

// The only legal transitions in the whole model. Anything not listed here must
// be rejected — the exhaustive matrix below pins that.
const LEGAL: Array<{ from: VoucherState; event: VoucherEvent; to: VoucherState }> = [
  { from: 'issued', event: 'REDEEM', to: 'redeemed' },
  { from: 'issued', event: 'EXPIRE', to: 'expired' },
  { from: 'issued', event: 'CANCEL', to: 'cancelled' },
  { from: 'issued', event: 'REFUND', to: 'refunded' },
]

function isLegal(from: VoucherState, event: VoucherEvent): boolean {
  return LEGAL.some((t) => t.from === from && t.event === event)
}

describe('voucher state machine — legal transitions', () => {
  for (const { from, event, to } of LEGAL) {
    it(`${from} --${event}--> ${to}`, () => {
      // EXPIRE needs a past expiry to satisfy its guard.
      const context = event === 'EXPIRE' ? ctx({ expiresAt: PAST }) : ctx()
      expect(transition(from, event, context)).toBe(to)
      expect(nextVoucherState(from, event)).toBe(to)
    })
  }
})

describe('voucher state machine — exhaustive matrix', () => {
  // Every (state, event) pair: legal ones transition, illegal ones throw
  // ILLEGAL_TRANSITION. This fails loudly the moment the enum grows.
  for (const from of VOUCHER_STATES) {
    for (const event of VOUCHER_EVENTS) {
      const legal = isLegal(from, event)
      it(`${from} + ${event} is ${legal ? 'legal' : 'illegal'}`, () => {
        const context = event === 'EXPIRE' ? ctx({ expiresAt: PAST }) : ctx()
        if (legal) {
          expect(() => transition(from, event, context)).not.toThrow()
        } else {
          expect(() => transition(from, event, context)).toThrow(VoucherTransitionError)
          try {
            transition(from, event, context)
          } catch (error) {
            expect((error as VoucherTransitionError).code).toBe('ILLEGAL_TRANSITION')
          }
        }
      })
    }
  }
})

describe('terminal states are dead ends', () => {
  for (const state of TERMINAL_VOUCHER_STATES) {
    it(`${state} has no legal outgoing event`, () => {
      expect(isTerminalVoucherState(state)).toBe(true)
      expect(legalVoucherEvents(state)).toEqual([])
      for (const event of VOUCHER_EVENTS) {
        expect(canTransition(state, event, ctx())).toBe(false)
      }
    })
  }

  it('only issued is non-terminal', () => {
    expect(isTerminalVoucherState('issued')).toBe(false)
    expect(legalVoucherEvents('issued').sort()).toEqual(
      ['CANCEL', 'EXPIRE', 'REFUND', 'REDEEM'].sort(),
    )
  })
})

describe('REDEEM guards', () => {
  it('rejects a supplier that does not own the voucher', () => {
    expect(() => transition('issued', 'REDEEM', ctx({ actingSupplierId: 'supplier-2' }))).toThrow(
      VoucherTransitionError,
    )
    try {
      transition('issued', 'REDEEM', ctx({ actingSupplierId: 'supplier-2' }))
    } catch (error) {
      expect((error as VoucherTransitionError).code).toBe('WRONG_SUPPLIER')
    }
  })

  it('rejects a null acting supplier', () => {
    expect(canTransition('issued', 'REDEEM', ctx({ actingSupplierId: null }))).toBe(false)
  })

  it('rejects redemption at or after expiry', () => {
    expect(canTransition('issued', 'REDEEM', ctx({ expiresAt: PAST }))).toBe(false)
    // exactly at expiry is already too late
    expect(canTransition('issued', 'REDEEM', ctx({ expiresAt: NOW }))).toBe(false)
  })

  it('accepts one second before expiry', () => {
    const oneSecondLeft = new Date(NOW.getTime() + 1000)
    expect(canTransition('issued', 'REDEEM', ctx({ expiresAt: oneSecondLeft }))).toBe(true)
  })

  it('reports PAST_EXPIRY when the supplier is right but time is up', () => {
    try {
      transition('issued', 'REDEEM', ctx({ expiresAt: PAST }))
    } catch (error) {
      expect((error as VoucherTransitionError).code).toBe('PAST_EXPIRY')
    }
  })
})

describe('EXPIRE guard', () => {
  it('refuses to expire a voucher still in date', () => {
    expect(canTransition('issued', 'EXPIRE', ctx({ expiresAt: FUTURE }))).toBe(false)
    try {
      transition('issued', 'EXPIRE', ctx({ expiresAt: FUTURE }))
    } catch (error) {
      expect((error as VoucherTransitionError).code).toBe('NOT_YET_EXPIRED')
    }
  })

  it('expires a voucher whose deadline has passed', () => {
    expect(transition('issued', 'EXPIRE', ctx({ expiresAt: PAST }))).toBe('expired')
  })
})

describe('edge cases from the brief', () => {
  it('cancel after redemption is illegal (value already consumed)', () => {
    expect(canTransition('redeemed', 'CANCEL', ctx())).toBe(false)
    expect(() => transition('redeemed', 'CANCEL', ctx())).toThrow(VoucherTransitionError)
  })

  it('refund after redemption is illegal (money already gone to the business flow)', () => {
    expect(canTransition('redeemed', 'REFUND', ctx())).toBe(false)
    expect(() => transition('redeemed', 'REFUND', ctx())).toThrow(VoucherTransitionError)
  })

  it('a redeemed voucher cannot be redeemed again', () => {
    expect(canTransition('redeemed', 'REDEEM', ctx())).toBe(false)
  })

  it('an expired voucher cannot later be redeemed', () => {
    expect(canTransition('expired', 'REDEEM', ctx())).toBe(false)
  })

  it('CANCEL and REFUND need no guard from issued', () => {
    expect(canTransition('issued', 'CANCEL')).toBe(true)
    expect(canTransition('issued', 'REFUND')).toBe(true)
  })

  it('guarded events refuse without a context', () => {
    expect(canTransition('issued', 'REDEEM')).toBe(false)
    expect(canTransition('issued', 'EXPIRE')).toBe(false)
    expect(() => transition('issued', 'REDEEM')).toThrow(VoucherTransitionError)
  })
})
