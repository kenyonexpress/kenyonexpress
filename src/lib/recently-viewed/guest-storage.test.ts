import { beforeEach, describe, expect, it } from 'vitest'
import {
  RECENTLY_VIEWED_MAX_ITEMS,
  RECENTLY_VIEWED_STORAGE_KEY,
  readRecentlyViewed,
  recordRecentlyViewed,
} from './guest-storage'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeEach(() => {
  window.localStorage.clear()
})

describe('recently viewed, in the browser', () => {
  it('is empty before anything was viewed', () => {
    expect(readRecentlyViewed()).toEqual([])
  })

  it('puts the newest view first and never lists a product twice', () => {
    recordRecentlyViewed(id(1))
    recordRecentlyViewed(id(2))
    recordRecentlyViewed(id(1))
    expect(readRecentlyViewed()).toEqual([id(1), id(2)])
  })

  it('keeps only the most recent views', () => {
    for (let n = 1; n <= RECENTLY_VIEWED_MAX_ITEMS + 5; n++) recordRecentlyViewed(id(n))
    const list = readRecentlyViewed()
    expect(list).toHaveLength(RECENTLY_VIEWED_MAX_ITEMS)
    expect(list[0]).toBe(id(RECENTLY_VIEWED_MAX_ITEMS + 5))
    expect(list).not.toContain(id(1))
  })

  it('refuses anything that is not a product id', () => {
    recordRecentlyViewed('not-an-id')
    recordRecentlyViewed('<script>')
    expect(readRecentlyViewed()).toEqual([])
    expect(window.localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY)).toBeNull()
  })

  it('reads garbage and an older shape as an empty list', () => {
    for (const raw of ['{', '[]', '"x"', '{"v":2,"productIds":[]}', '{"v":1,"productIds":"x"}']) {
      window.localStorage.setItem(RECENTLY_VIEWED_STORAGE_KEY, raw)
      expect(readRecentlyViewed()).toEqual([])
    }
  })

  it('drops stored entries that are not ids and keeps the rest in order', () => {
    window.localStorage.setItem(
      RECENTLY_VIEWED_STORAGE_KEY,
      JSON.stringify({ v: 1, productIds: [id(3), 7, 'x', id(3).toUpperCase(), id(4)] }),
    )
    expect(readRecentlyViewed()).toEqual([id(3), id(4)])
  })
})
