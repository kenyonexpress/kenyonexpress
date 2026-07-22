import { describe, expect, it } from 'vitest'
import {
  IllegalTransitionError,
  couponMachine,
  orderMachine,
  paymentMachine,
  settlementBatchMachine,
} from './state-machine'

describe('orderMachine', () => {
  it('allows the finalize and fulfilment path', () => {
    expect(orderMachine.assertTransition('pending', 'paid')).toBe('paid')
    expect(orderMachine.assertTransition('paid', 'partially_fulfilled')).toBe('partially_fulfilled')
    expect(orderMachine.assertTransition('partially_fulfilled', 'fulfilled')).toBe('fulfilled')
    expect(orderMachine.assertTransition('fulfilled', 'refunded')).toBe('refunded')
  })

  it('throws on cancelled -> paid (a resurrected order)', () => {
    expect(() => orderMachine.assertTransition('cancelled', 'paid')).toThrow(IllegalTransitionError)
  })

  it('throws on any transition out of refunded (terminal)', () => {
    expect(() => orderMachine.assertTransition('refunded', 'paid')).toThrow(IllegalTransitionError)
    expect(orderMachine.isTerminal('refunded')).toBe(true)
    expect(orderMachine.isTerminal('cancelled')).toBe(true)
    expect(orderMachine.isTerminal('paid')).toBe(false)
  })

  it('carries machine/from/to on the error', () => {
    try {
      orderMachine.assertTransition('cancelled', 'paid')
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError)
      const e = err as IllegalTransitionError
      expect(e.machine).toBe('order')
      expect(e.from).toBe('cancelled')
      expect(e.to).toBe('paid')
    }
  })
})

describe('paymentMachine', () => {
  it('allows initiated -> redirected -> succeeded -> refunded', () => {
    expect(paymentMachine.canTransition('initiated', 'redirected')).toBe(true)
    expect(paymentMachine.canTransition('redirected', 'succeeded')).toBe(true)
    expect(paymentMachine.canTransition('succeeded', 'refunded')).toBe(true)
  })

  it('rejects skipping straight from initiated to succeeded', () => {
    expect(() => paymentMachine.assertTransition('initiated', 'succeeded')).toThrow(
      IllegalTransitionError,
    )
  })

  it('failed is terminal', () => {
    expect(paymentMachine.isTerminal('failed')).toBe(true)
    expect(() => paymentMachine.assertTransition('failed', 'succeeded')).toThrow()
  })
})

describe('couponMachine', () => {
  it('issued may go to used/expired/refunded', () => {
    expect(couponMachine.assertTransition('issued', 'used')).toBe('used')
    expect(couponMachine.assertTransition('issued', 'expired')).toBe('expired')
    expect(couponMachine.assertTransition('issued', 'refunded')).toBe('refunded')
  })

  it('forbids a second redeem of a used coupon', () => {
    expect(() => couponMachine.assertTransition('used', 'used')).toThrow(IllegalTransitionError)
    expect(() => couponMachine.assertTransition('used', 'issued')).toThrow(IllegalTransitionError)
    expect(couponMachine.isTerminal('used')).toBe(true)
  })

  it('forbids redeeming an expired or refunded coupon', () => {
    expect(() => couponMachine.assertTransition('expired', 'used')).toThrow()
    expect(() => couponMachine.assertTransition('refunded', 'used')).toThrow()
  })
})

describe('settlementBatchMachine', () => {
  it('walks draft -> pending_approval -> approved -> paid', () => {
    expect(settlementBatchMachine.assertTransition('draft', 'pending_approval')).toBe(
      'pending_approval',
    )
    expect(settlementBatchMachine.assertTransition('pending_approval', 'approved')).toBe('approved')
    expect(settlementBatchMachine.assertTransition('approved', 'paid')).toBe('paid')
  })

  it('paid is immutable', () => {
    expect(settlementBatchMachine.isTerminal('paid')).toBe(true)
    expect(() => settlementBatchMachine.assertTransition('paid', 'approved')).toThrow()
  })
})
