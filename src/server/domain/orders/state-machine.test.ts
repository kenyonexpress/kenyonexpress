import { describe, expect, it } from 'vitest'
import {
  SETTLEMENT_EVENTS,
  SETTLEMENT_STATES,
  type SettlementEvent,
  type SettlementState,
  SettlementTransitionError,
  canTransition,
  deriveOrderStatus,
  isSettled,
  isTerminal,
  transition,
} from './state-machine'

type Expected = Partial<Record<SettlementEvent, SettlementState>>

const PHYSICAL_TABLE: Record<SettlementState, Expected> = {
  pending: { PAYMENT_CONFIRMED: 'paid', CANCEL: 'cancelled' },
  paid: { EXECUTE_SPLIT: 'split_executed', REFUND: 'refunded' },
  split_executed: { REFUND: 'refunded' },
  platform_settled: { REFUND: 'refunded' },
  escrow_held: { REFUND: 'refunded' },
  redeemed: {},
  escrow_released: {},
  refunded: {},
  cancelled: {},
}

const COUPON_TABLE: Record<SettlementState, Expected> = {
  pending: { PAYMENT_CONFIRMED: 'paid', CANCEL: 'cancelled' },
  paid: { SETTLE_PLATFORM: 'platform_settled', HOLD_ESCROW: 'escrow_held', REFUND: 'refunded' },
  platform_settled: { REFUND: 'refunded' },
  escrow_held: { RELEASE_ESCROW: 'escrow_released', REFUND: 'refunded' },
  redeemed: {},
  split_executed: { REFUND: 'refunded' },
  escrow_released: {},
  refunded: {},
  cancelled: {},
}

describe('settlement state machine (final rules + flag-gated escrow leg)', () => {
  it('matches the full physical transition matrix', () => {
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        const expected = PHYSICAL_TABLE[from][event]
        expect(canTransition(from, event, 'physical'), `physical ${from} + ${event}`).toBe(
          expected !== undefined,
        )
        if (expected !== undefined) {
          expect(transition(from, event, 'physical')).toBe(expected)
        }
      }
    }
  })

  it('matches the full coupon transition matrix', () => {
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        const expected = COUPON_TABLE[from][event]
        expect(canTransition(from, event, 'coupon'), `coupon ${from} + ${event}`).toBe(
          expected !== undefined,
        )
        if (expected !== undefined) {
          expect(transition(from, event, 'coupon')).toBe(expected)
        }
      }
    }
  })

  it('walks the physical happy path', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED', 'physical')
    state = transition(state, 'EXECUTE_SPLIT', 'physical')
    expect(state).toBe('split_executed')
    expect(isTerminal(state)).toBe(false) // refund window still open
    expect(isSettled(state)).toBe(true)
  })

  it('walks the coupon happy path: money settles to the platform at paid-time', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED', 'coupon')
    state = transition(state, 'SETTLE_PLATFORM', 'coupon')
    expect(state).toBe('platform_settled')
    expect(isTerminal(state)).toBe(false) // refund window still open
    expect(isSettled(state)).toBe(true)
  })

  it('throws WRONG_PRODUCT_TYPE when a physical line tries the coupon leg', () => {
    expect(() => transition('paid', 'SETTLE_PLATFORM', 'physical')).toThrowError(
      SettlementTransitionError,
    )
    try {
      transition('paid', 'SETTLE_PLATFORM', 'physical')
    } catch (error) {
      expect((error as SettlementTransitionError).code).toBe('WRONG_PRODUCT_TYPE')
    }
  })

  it('throws ILLEGAL_TRANSITION for consumed-value refunds (legacy states included)', () => {
    for (const from of ['redeemed', 'escrow_released'] as const) {
      try {
        transition(from, 'REFUND', 'coupon')
        expect.unreachable(`refund from ${from} must throw`)
      } catch (error) {
        expect((error as SettlementTransitionError).code).toBe('ILLEGAL_TRANSITION')
      }
    }
  })

  it('still allows refunding a legacy escrow_held row', () => {
    expect(transition('escrow_held', 'REFUND', 'coupon')).toBe('refunded')
  })

  it('walks the escrow leg for coupons and denies it for physical lines', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED', 'coupon')
    state = transition(state, 'HOLD_ESCROW', 'coupon')
    expect(state).toBe('escrow_held')
    expect(isSettled(state)).toBe(false)
    state = transition(state, 'RELEASE_ESCROW', 'coupon')
    expect(state).toBe('escrow_released')
    expect(isSettled(state)).toBe(true)
    expect(canTransition('paid', 'HOLD_ESCROW', 'physical')).toBe(false)
    expect(canTransition('escrow_held', 'RELEASE_ESCROW', 'physical')).toBe(false)
  })

  it('keeps refunded and cancelled terminal', () => {
    for (const from of ['refunded', 'cancelled'] as const) {
      expect(isTerminal(from)).toBe(true)
      for (const event of SETTLEMENT_EVENTS) {
        expect(canTransition(from, event, 'coupon')).toBe(false)
        expect(canTransition(from, event, 'physical')).toBe(false)
      }
    }
  })
})

describe('deriveOrderStatus', () => {
  it('is pending for empty or any-pending orders', () => {
    expect(deriveOrderStatus([])).toBe('pending')
    expect(deriveOrderStatus(['pending', 'platform_settled'])).toBe('pending')
  })

  it('shows the least-advanced active line', () => {
    expect(deriveOrderStatus(['paid', 'split_executed'])).toBe('paid')
    expect(deriveOrderStatus(['escrow_held', 'split_executed'])).toBe('escrow_held')
    expect(deriveOrderStatus(['redeemed', 'split_executed'])).toBe('redeemed')
  })

  it('resolves fully-settled orders', () => {
    expect(deriveOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled')
    expect(deriveOrderStatus(['refunded', 'cancelled'])).toBe('refunded')
    expect(deriveOrderStatus(['split_executed', 'refunded'])).toBe('split_executed')
    expect(deriveOrderStatus(['platform_settled', 'split_executed'])).toBe('platform_settled')
    expect(deriveOrderStatus(['escrow_released', 'platform_settled'])).toBe('escrow_released')
  })
})
