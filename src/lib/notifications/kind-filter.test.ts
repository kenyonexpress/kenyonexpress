import { describe, expect, it } from 'vitest'
import { CATEGORIES, KNOWN_KINDS, categoryOf, kindExclusion } from './categories'
import { applyCategoryFilter, applyKindExclusion } from './kind-filter'

/**
 * The predicate the server narrows `notifications` by, recorded as the
 * PostgREST calls it makes. Two things are pinned: the shape of the call
 * (an `in` list, or a `not in` list PostgREST can parse), and that the
 * category predicate agrees with `categoryOf` for every known kind, which
 * is what lets the center cut the selected tab in TypeScript while the
 * mark-all write cuts it in SQL.
 */

type Call = ['in', string, readonly string[]] | ['not', string, string, string]

function recorder() {
  const calls: Call[] = []
  const q = {
    in(column: string, values: readonly string[]) {
      calls.push(['in', column, values])
      return q
    },
    not(column: string, operator: string, value: string) {
      calls.push(['not', column, operator, value])
      return q
    },
  }
  return { q, calls }
}

describe('applyKindExclusion', () => {
  it('adds nothing when nothing is muted', () => {
    const { q, calls } = recorder()
    applyKindExclusion(q, kindExclusion([]))
    expect(calls).toEqual([])
  })

  it('hides the muted shelf with one not-in list', () => {
    const { q, calls } = recorder()
    applyKindExclusion(
      q,
      kindExclusion([{ kind: 'category:deals', channel: 'in_app', enabled: false }]),
    )
    expect(calls).toHaveLength(1)
    const [op, column, operator, value] = calls[0] as ['not', string, string, string]
    expect([op, column, operator]).toEqual(['not', 'kind', 'in'])
    expect(value).toMatch(/^\([a-z_,]+\)$/)
    expect(value).toContain('price_drop')
    expect(value).toContain('back_in_stock')
    expect(value).not.toContain('order_paid')
  })

  it('becomes an allow-list when the system shelf is muted', () => {
    const { q, calls } = recorder()
    applyKindExclusion(
      q,
      kindExclusion([{ kind: 'category:system', channel: 'in_app', enabled: false }]),
    )
    expect(calls).toHaveLength(1)
    const [op, column, values] = calls[0] as ['in', string, readonly string[]]
    expect([op, column]).toEqual(['in', 'kind'])
    expect(values).toEqual(KNOWN_KINDS)
  })
})

describe('applyCategoryFilter', () => {
  it.each(CATEGORIES)('agrees with categoryOf for every known kind on %s', (category) => {
    const { q, calls } = recorder()
    applyCategoryFilter(q, category)
    expect(calls).toHaveLength(1)
    const call = calls[0] as Call
    const matches = (kind: string) =>
      call[0] === 'in' ? call[2].includes(kind) : !call[3].slice(1, -1).split(',').includes(kind)
    for (const kind of KNOWN_KINDS) {
      expect(matches(kind), kind).toBe(categoryOf(kind) === category)
    }
    // A kind nobody shelved is on the system shelf and nowhere else.
    expect(matches('unknown_future_kind')).toBe(category === 'system')
  })
})
