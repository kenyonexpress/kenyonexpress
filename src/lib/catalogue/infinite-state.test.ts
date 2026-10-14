import { describe, expect, it } from 'vitest'
import {
  MAX_STORED_ITEMS,
  SNAPSHOT_TTL_MS,
  listingEndpoint,
  mergeItems,
  pageUrl,
  parseSnapshot,
  serializeSnapshot,
  snapshotKey,
} from './infinite-state'

const NOW = 1_800_000_000_000
const item = (id: string) => ({ id, slug: id, name_he: id })

describe('listingEndpoint', () => {
  it('names the scope and only the parameters that are set, in one order', () => {
    expect(listingEndpoint('shop', { sort: 'price', min: undefined, type: 'coupon' })).toBe(
      '/api/catalogue/listing?scope=shop&sort=price&type=coupon',
    )
    expect(listingEndpoint('shop', { type: 'coupon', sort: 'price' })).toBe(
      listingEndpoint('shop', { sort: 'price', type: 'coupon' }),
    )
  })

  it('carries the category slug and never a page', () => {
    expect(listingEndpoint('category', { page: '3', city: 'haifa' }, 'spa')).toBe(
      '/api/catalogue/listing?scope=category&slug=spa&city=haifa',
    )
  })
})

describe('pageUrl and snapshotKey', () => {
  it('appends the page to an endpoint that already has a query', () => {
    expect(pageUrl('/api/catalogue/listing?scope=shop', 2)).toBe(
      '/api/catalogue/listing?scope=shop&page=2',
    )
  })

  it('keeps two listings, and two starting pages, apart', () => {
    const a = listingEndpoint('shop', {})
    const b = listingEndpoint('shop', { sort: 'price' })
    expect(snapshotKey(a, 1)).not.toBe(snapshotKey(b, 1))
    expect(snapshotKey(a, 1)).not.toBe(snapshotKey(a, 2))
  })
})

describe('mergeItems', () => {
  it('appends new items and drops any id already on the page', () => {
    const merged = mergeItems(
      [item('a')],
      [item('b')],
      [item('a'), item('b'), item('c'), item('c')],
    )
    expect(merged.map((i) => i.id)).toEqual(['b', 'c'])
  })
})

describe('parseSnapshot', () => {
  const good = { items: [item('a'), item('b')], nextPage: 3, scrollY: 1200, savedAt: NOW - 1000 }

  it('round-trips a fresh snapshot', () => {
    expect(parseSnapshot(serializeSnapshot(good), NOW)).toEqual(good)
  })

  it('refuses a stale one and one from the future', () => {
    const stale = { ...good, savedAt: NOW - SNAPSHOT_TTL_MS - 1 }
    expect(parseSnapshot(serializeSnapshot(stale), NOW)).toBeNull()
    expect(parseSnapshot(serializeSnapshot({ ...good, savedAt: NOW + 1 }), NOW)).toBeNull()
  })

  it('refuses anything that is not the shape it wrote', () => {
    expect(parseSnapshot(null, NOW)).toBeNull()
    expect(parseSnapshot('{', NOW)).toBeNull()
    expect(parseSnapshot('[]', NOW)).toBeNull()
    expect(parseSnapshot(JSON.stringify({ ...good, nextPage: 1 }), NOW)).toBeNull()
    expect(parseSnapshot(JSON.stringify({ ...good, scrollY: -5 }), NOW)).toBeNull()
    expect(parseSnapshot(JSON.stringify({ ...good, items: [{ id: 7 }] }), NOW)).toBeNull()
    expect(parseSnapshot(JSON.stringify({ ...good, items: 'x' }), NOW)).toBeNull()
  })

  it('never stores more than the cap', () => {
    const many = Array.from({ length: MAX_STORED_ITEMS + 30 }, (_, i) => item(`p${i}`))
    const parsed = parseSnapshot(serializeSnapshot({ ...good, items: many }), NOW)
    expect(parsed?.items).toHaveLength(MAX_STORED_ITEMS)
  })
})
