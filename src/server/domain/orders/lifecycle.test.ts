import {
  LifecycleTransitionError,
  canLifecycleTransition,
  isLifecycleTerminal,
  transitionLifecycle,
} from '@/server/domain/orders/lifecycle'
import { describe, expect, it } from 'vitest'

describe('order lifecycle', () => {
  it('allows pending -> paid -> fulfilled -> refunded', () => {
    expect(transitionLifecycle('pending', 'PAYMENT_SUCCEEDED')).toBe('paid')
    expect(transitionLifecycle('paid', 'FULFILL')).toBe('fulfilled')
    expect(transitionLifecycle('fulfilled', 'REFUND')).toBe('refunded')
  })

  it('allows pending cancel/expire and paid refund', () => {
    expect(transitionLifecycle('pending', 'CANCEL')).toBe('cancelled')
    expect(transitionLifecycle('pending', 'EXPIRE')).toBe('cancelled')
    expect(transitionLifecycle('paid', 'REFUND')).toBe('refunded')
  })

  it('rejects illegal transitions', () => {
    expect(canLifecycleTransition('refunded', 'FULFILL')).toBe(false)
    expect(() => transitionLifecycle('cancelled', 'PAYMENT_SUCCEEDED')).toThrow(
      LifecycleTransitionError,
    )
    expect(isLifecycleTerminal('refunded')).toBe(true)
    expect(isLifecycleTerminal('cancelled')).toBe(true)
  })
})
