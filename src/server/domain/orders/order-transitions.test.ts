import { type OrderStatus, orderMachine } from '@/lib/checkout/state-machine'
import { describe, expect, it } from 'vitest'
import {
  ORDER_TRANSITION_EFFECTS,
  type OrderTransitionKey,
  adminOverridableTargets,
  canAdminOverride,
  effectsFor,
  transitionKey,
} from './order-transitions'
import guardTable from './status-transitions.json'

const STATES = orderMachine.states

function legalEdges(): OrderTransitionKey[] {
  const edges: OrderTransitionKey[] = []
  for (const from of STATES) {
    for (const to of STATES) {
      if (orderMachine.canTransition(from, to)) edges.push(transitionKey(from, to))
    }
  }
  return edges
}

describe('order transition effect plan', () => {
  it('has exactly one entry per legal machine edge', () => {
    // Drift in either direction is a bug: a machine edge without a plan is a
    // transition whose side effects each writer improvises, and a plan for an
    // edge the machine forbids is dead configuration that will mislead the
    // next reader.
    expect(Object.keys(ORDER_TRANSITION_EFFECTS).sort()).toEqual(legalEdges().sort())
  })

  it('gives every edge a non-empty plan', () => {
    for (const [key, effects] of Object.entries(ORDER_TRANSITION_EFFECTS)) {
      expect(effects.length, `${key} has an empty effect plan`).toBeGreaterThan(0)
    }
  })

  it('returns null for moves the machine forbids', () => {
    expect(effectsFor('cancelled', 'paid')).toBeNull()
    expect(effectsFor('refunded', 'pending')).toBeNull()
    expect(effectsFor('fulfilled', 'paid')).toBeNull()
  })

  it('never contradicts the DB guard: every machine edge is guard-legal', () => {
    // The guard (migrations/pending/137, mirrored in status-transitions.json)
    // is a superset that also carries legacy platform_settled rows. If a
    // machine edge is missing there, the first write down that edge raises
    // 23514 in production.
    const guard = guardTable['orders.status'] as Record<string, readonly string[]>
    for (const from of STATES) {
      for (const to of STATES) {
        if (!orderMachine.canTransition(from, to)) continue
        expect(guard[from] ?? [], `guard forbids machine edge ${from} -> ${to}`).toContain(to)
      }
    }
  })
})

describe('admin override policy', () => {
  it('never lets an admin write a money state', () => {
    for (const from of STATES) {
      expect(canAdminOverride(from, 'paid'), `${from} -> paid`).toBe(false)
      expect(canAdminOverride(from, 'refunded'), `${from} -> refunded`).toBe(false)
    }
  })

  it('never lets an admin make a machine-illegal move', () => {
    for (const from of STATES) {
      for (const to of STATES) {
        if (!orderMachine.canTransition(from, to)) {
          expect(canAdminOverride(from, to), `${from} -> ${to}`).toBe(false)
        }
      }
    }
  })

  it('offers exactly the fulfilment lane and pending cancellation', () => {
    const expected: Record<OrderStatus, readonly OrderStatus[]> = {
      pending: ['cancelled'],
      paid: ['partially_fulfilled', 'fulfilled'],
      partially_fulfilled: ['fulfilled'],
      fulfilled: [],
      cancelled: [],
      refunded: [],
    }
    for (const from of STATES) {
      expect(adminOverridableTargets(from), `targets from ${from}`).toEqual(expected[from])
    }
  })

  it('terminal states offer nothing', () => {
    for (const from of STATES.filter((s) => orderMachine.isTerminal(s))) {
      expect(adminOverridableTargets(from)).toEqual([])
    }
  })
})
