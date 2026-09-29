import { describe, expect, it, vi } from 'vitest'

/**
 * `terminalStatesOf` reads `STATUS_TRANSITIONS[column][s]` for every `s` it
 * already got from `Object.keys(STATUS_TRANSITIONS[column])`, so with the
 * real `status-transitions.json` that lookup can never miss: every key that
 * exists has an array value, even an empty one. The `?? []` after it is a
 * guard against a future edit landing a `null` (or otherwise non-array) rule
 * list in the JSON, not against anything the real data does today. That
 * makes it untestable through the real table, so this file swaps the table
 * for one that does carry a malformed entry and checks the guard actually
 * saves the read instead of throwing on `.length` of `null`.
 */
vi.mock('./status-transitions.json', () => ({
  default: {
    'orders.status': {
      pending: ['paid'],
      // Not an array. A real edit to the JSON should never do this; the
      // guard exists so that if one ever does, the read degrades to "no
      // rule" instead of crashing every caller of terminalStatesOf.
      paid: null,
    },
    'order_items.settlement_status': {},
    'payments.status': {},
    'vouchers.status': {},
  },
}))

describe('terminalStatesOf against a malformed rule list', () => {
  it('treats a non-array rule list as terminal instead of throwing', async () => {
    const { terminalStatesOf } = await import('./status-transitions')
    expect(terminalStatesOf('orders.status')).toEqual(['paid'])
  })
})
