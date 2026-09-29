import { describe, expect, it, vi } from 'vitest'

/**
 * `effectsFor` falls back to `?? []` when `ORDER_TRANSITION_EFFECTS` has no
 * entry for a machine-legal edge. `order-transitions.test.ts` proves the real
 * table has exactly one entry per legal `orderMachine` edge, so with real
 * data that fallback can never fire; it only protects against the day a new
 * edge lands in `orderMachine` before its effect plan is added to the table.
 * That makes it untestable through the real machine, so this file mocks
 * `orderMachine` with an edge `ORDER_TRANSITION_EFFECTS` does not know about
 * and checks the fallback returns an empty plan instead of `undefined`.
 */
vi.mock('@/lib/checkout/state-machine', () => ({
  orderMachine: {
    states: ['pending', 'paid', 'unplanned_state'],
    canTransition: (from: string, to: string) => from === 'paid' && to === 'unplanned_state',
  },
}))

describe('effectsFor against a machine edge with no plan', () => {
  it('falls back to an empty plan instead of undefined', async () => {
    const { effectsFor } = await import('./order-transitions')
    expect(effectsFor('paid' as never, 'unplanned_state' as never)).toEqual([])
  })
})
