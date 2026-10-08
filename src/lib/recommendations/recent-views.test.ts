import { describe, expect, it } from 'vitest'
import {
  RECENT_VIEWS_KEY,
  RECENT_VIEWS_MAX,
  readRecentViews,
  recordRecentView,
} from './recent-views'

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  }
}

describe('recent views', () => {
  it('reads nothing from an empty, missing or corrupt store', () => {
    expect(readRecentViews(null)).toEqual([])
    expect(readRecentViews(memoryStore())).toEqual([])
    expect(readRecentViews(memoryStore({ [RECENT_VIEWS_KEY]: '{not json' }))).toEqual([])
    expect(readRecentViews(memoryStore({ [RECENT_VIEWS_KEY]: '{"a":1}' }))).toEqual([])
    expect(readRecentViews(memoryStore({ [RECENT_VIEWS_KEY]: '["a", 2, null, "b"]' }))).toEqual([
      'a',
      'b',
    ])
  })

  it('moves a repeat to the front and caps the list', () => {
    const store = memoryStore()
    recordRecentView('a', store)
    recordRecentView('b', store)
    expect(recordRecentView('a', store)).toEqual(['a', 'b'])
    for (let i = 0; i < RECENT_VIEWS_MAX + 3; i++) recordRecentView(`p${i}`, store)
    const list = readRecentViews(store)
    expect(list).toHaveLength(RECENT_VIEWS_MAX)
    expect(list[0]).toBe(`p${RECENT_VIEWS_MAX + 2}`)
    expect(list).not.toContain('a')
  })

  it('is a no-op without a store or an id, and survives a throwing setItem', () => {
    expect(recordRecentView('a', null)).toEqual([])
    const store = memoryStore()
    expect(recordRecentView('', store)).toEqual([])
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(recordRecentView('a', throwing)).toEqual(['a'])
  })
})
