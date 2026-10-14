import { beforeEach, describe, expect, it } from 'vitest'
import {
  COMPARE_CHANGED_EVENT,
  COMPARE_MAX_ITEMS,
  COMPARE_STORAGE_KEY,
  parseCompareList,
  readCompareList,
  toggleCompare,
  writeCompareList,
} from './storage'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeEach(() => window.localStorage.clear())

describe('toggleCompare', () => {
  it('adds in the order picked and removes on a second press', () => {
    const one = toggleCompare([], id(1))
    expect(one).toEqual({ list: [id(1)], selected: true })
    const two = toggleCompare(one.list, id(2))
    expect(two.list).toEqual([id(1), id(2)])
    expect(toggleCompare(two.list, id(1))).toEqual({ list: [id(2)], selected: false })
  })

  it('refuses a fifth product and leaves the four alone', () => {
    const four = [id(1), id(2), id(3), id(4)]
    expect(four).toHaveLength(COMPARE_MAX_ITEMS)
    expect(toggleCompare(four, id(5))).toEqual({ list: four, selected: false, refusedFull: true })
  })

  it('still removes when the list is full', () => {
    const four = [id(1), id(2), id(3), id(4)]
    expect(toggleCompare(four, id(3)).list).toEqual([id(1), id(2), id(4)])
  })

  it('ignores anything that is not a product id', () => {
    expect(toggleCompare([id(1)], 'nope')).toEqual({ list: [id(1)], selected: false })
  })
})

describe('the stored list', () => {
  it('round-trips, announces the change, and clears the key when emptied', () => {
    const heard: string[][] = []
    const listener = (event: Event) => heard.push((event as CustomEvent<string[]>).detail)
    window.addEventListener(COMPARE_CHANGED_EVENT, listener)

    writeCompareList([id(1), id(2)])
    expect(readCompareList()).toEqual([id(1), id(2)])
    writeCompareList([])
    expect(window.localStorage.getItem(COMPARE_STORAGE_KEY)).toBeNull()
    expect(heard).toEqual([[id(1), id(2)], []])

    window.removeEventListener(COMPARE_CHANGED_EVENT, listener)
  })

  it('reads garbage, an older shape and a too-long list safely', () => {
    for (const raw of ['{', '[]', '"x"', '{"v":2,"productIds":[]}', '{"v":1,"productIds":"x"}']) {
      expect(parseCompareList(raw)).toEqual([])
    }
    const long = JSON.stringify({ v: 1, productIds: [1, 2, 3, 4, 5, 6].map(id).concat(['x']) })
    expect(parseCompareList(long)).toEqual([id(1), id(2), id(3), id(4)])
  })
})
