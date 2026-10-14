import {
  WISHLIST_MAX_ITEMS,
  emptyGuestWishlist,
  guestHas,
  guestToggle,
  normalizeProductIds,
  parseGuestWishlist,
} from '@/lib/wishlist/guest-storage'
import { describe, expect, it } from 'vitest'

/**
 * The guest wishlist is the one part of this feature with no server between the
 * customer and the data, so the parsing has to survive anything the origin can
 * put in `localStorage`: an older shape, a truncated write, another script's
 * value under the same key.
 *
 * The pure half is tested here. The DOM half (`readGuestWishlist`,
 * `writeGuestWishlist`) is three lines of try/catch around those functions.
 */

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'

describe('parseGuestWishlist', () => {
  it('reads back what the module writes', () => {
    const raw = JSON.stringify({ v: 1, productIds: [A, B], updatedAt: '2026-09-09T00:00:00.000Z' })
    expect(parseGuestWishlist(raw).productIds).toEqual([A, B])
  })

  for (const [name, raw] of [
    ['null', null],
    ['empty string', ''],
    ['not json', '{not json'],
    ['json that is not an object', '"a string"'],
    ['json null', 'null'],
    ['a bare array', '[]'],
    ['a future version', JSON.stringify({ v: 2, productIds: [A] })],
    ['productIds that is not an array', JSON.stringify({ v: 1, productIds: A })],
  ] as const) {
    it(`degrades to empty on ${name} rather than throwing`, () => {
      expect(parseGuestWishlist(raw)).toEqual(emptyGuestWishlist())
    })
  }

  it('drops entries that are not uuids instead of forwarding them to the server', () => {
    // The merge action would refuse these anyway. Dropping them here is what
    // keeps a poisoned key from spending the caller's merge rate limit.
    const raw = JSON.stringify({
      v: 1,
      productIds: [A, 'not-a-uuid', 42, null, { id: B }, B],
    })
    expect(parseGuestWishlist(raw).productIds).toEqual([A, B])
  })

  it('caps a list that is over the ceiling', () => {
    const many = Array.from(
      { length: WISHLIST_MAX_ITEMS + 25 },
      (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    )
    expect(parseGuestWishlist(JSON.stringify({ v: 1, productIds: many })).productIds).toHaveLength(
      WISHLIST_MAX_ITEMS,
    )
  })
})

describe('normalizeProductIds', () => {
  it('deduplicates case-insensitively and keeps the first occurrence', () => {
    expect(normalizeProductIds([A, A.toUpperCase(), B])).toEqual([A, B])
  })
})

describe('guestToggle', () => {
  it('adds to the FRONT, because the page renders newest first', () => {
    const first = guestToggle(emptyGuestWishlist(), A)
    const second = guestToggle(first.list, B)
    expect(second.list.productIds).toEqual([B, A])
    expect(second.saved).toBe(true)
  })

  it('removes a saved id and reports the new state', () => {
    const added = guestToggle(emptyGuestWishlist(), A)
    const removed = guestToggle(added.list, A)
    expect(removed.saved).toBe(false)
    expect(removed.list.productIds).toEqual([])
  })

  it('is case-insensitive, so the heart and the storage agree', () => {
    const added = guestToggle(emptyGuestWishlist(), A.toUpperCase())
    expect(guestHas(added.list, A)).toBe(true)
    expect(guestToggle(added.list, A.toUpperCase()).saved).toBe(false)
  })

  /**
   * THE CAP REFUSES, IT DOES NOT EVICT. A wishlist is a list the customer
   * curated; dropping their oldest save to make room loses data they chose to
   * keep and they never see it happen. This asserts the list is UNCHANGED, not
   * merely that its length held, because an evicting implementation also keeps
   * the length.
   */
  it('refuses the add at the cap and changes nothing', () => {
    const full = {
      v: 1 as const,
      productIds: Array.from(
        { length: WISHLIST_MAX_ITEMS },
        (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      ),
      updatedAt: '2026-09-09T00:00:00.000Z',
    }
    const result = guestToggle(full, C)
    expect(result.refusedFull).toBe(true)
    expect(result.saved).toBe(false)
    expect(result.list.productIds).toEqual(full.productIds)
  })

  it('still removes when the list is full, so the cap is not a trap', () => {
    const ids = Array.from(
      { length: WISHLIST_MAX_ITEMS - 1 },
      (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    )
    const full = { v: 1 as const, productIds: [A, ...ids], updatedAt: '2026-09-09T00:00:00.000Z' }
    expect(full.productIds).toHaveLength(WISHLIST_MAX_ITEMS)
    const result = guestToggle(full, A)
    expect(result.refusedFull).toBeUndefined()
    expect(result.list.productIds).toHaveLength(WISHLIST_MAX_ITEMS - 1)
  })

  it('ignores an id that is not a uuid rather than storing it', () => {
    const result = guestToggle(emptyGuestWishlist(), 'nope')
    expect(result.list.productIds).toEqual([])
    expect(result.saved).toBe(false)
  })
})
