import type { WishlistViewItem } from '@/server/actions/wishlist'
import { describe, expect, it } from 'vitest'
import {
  SHARE_UNAVAILABLE_MESSAGE,
  WISHLIST_CARD_LEAVE_ANIMATION,
  WISHLIST_CARD_LEAVE_FALLBACK_MS,
  WISHLIST_CARD_LEAVE_MS,
  movableItems,
  moveAllLabel,
  movedAnnouncement,
  movedManyAnnouncement,
  removedAnnouncement,
  restoreItem,
  restoredAnnouncement,
  savedAgoLabel,
  savedCountLabel,
  shareToolbarPlan,
} from './page-view'

/**
 * UX20 (14.10.2026): the wishlist page's words and small decisions, pinned
 * outside the component.
 */

function item(id: string, extra: Partial<WishlistViewItem> = {}): WishlistViewItem {
  return {
    productId: id,
    savedAt: '2026-10-10T10:00:00.000Z',
    name: `מוצר ${id}`,
    slug: `p-${id}`,
    priceIls: 100,
    fullPriceIls: null,
    image: null,
    available: true,
    soldOut: false,
    ...extra,
  }
}

describe('the count and the move-all label', () => {
  it('reads one product in words and the rest as a number', () => {
    expect(savedCountLabel(1)).toBe('מוצר אחד שמור')
    expect(savedCountLabel(2)).toBe('2 מוצרים שמורים')
    expect(savedCountLabel(12)).toBe('12 מוצרים שמורים')
  })

  it('names the count the button will send', () => {
    expect(moveAllLabel(3)).toBe('העברת הכל לסל (3)')
  })

  it('sends only what the cart can take', () => {
    const items = [
      item('a'),
      item('b', { available: false, soldOut: true }),
      item('c', { available: false, soldOut: false, slug: null }),
      item('d'),
    ]
    expect(movableItems(items).map((i) => i.productId)).toEqual(['a', 'd'])
  })
})

describe('the live region sentences', () => {
  it('names the product that moved, left or came back', () => {
    expect(movedAnnouncement('מקרר')).toBe('מקרר עבר לסל')
    expect(removedAnnouncement('מקרר')).toBe('מקרר הוסר מהרשימה')
    expect(restoredAnnouncement('מקרר')).toBe('מקרר חזר לרשימה')
  })

  it('counts a bulk move', () => {
    expect(movedManyAnnouncement(1)).toBe('מוצר אחד עבר לסל')
    expect(movedManyAnnouncement(4)).toBe('4 מוצרים עברו לסל')
  })
})

describe('savedAgoLabel', () => {
  const now = new Date('2026-10-14T12:00:00.000Z')

  it('says today, yesterday, N days, then the date', () => {
    expect(savedAgoLabel('2026-10-14T08:00:00.000Z', now)).toBe('נשמר היום')
    expect(savedAgoLabel('2026-10-13T08:00:00.000Z', now)).toBe('נשמר אתמול')
    expect(savedAgoLabel('2026-10-10T08:00:00.000Z', now)).toBe('נשמר לפני 4 ימים')
    expect(savedAgoLabel('2026-08-01T08:00:00.000Z', now)).toMatch(/^נשמר ב-/)
  })

  it('a clock skew into the future still reads today', () => {
    expect(savedAgoLabel('2026-10-15T08:00:00.000Z', now)).toBe('נשמר היום')
  })

  it('an unparseable stamp renders nothing rather than "Invalid Date"', () => {
    expect(savedAgoLabel('not a date', now)).toBeNull()
  })
})

describe('shareToolbarPlan', () => {
  const origin = 'https://kenyonexpress.co.il'

  it('explains while 248 is not applied instead of pretending', () => {
    expect(shareToolbarPlan({ available: false }, origin)).toEqual({
      kind: 'unavailable',
      message: SHARE_UNAVAILABLE_MESSAGE,
    })
  })

  it('mints or re-enables when there is no live link', () => {
    expect(shareToolbarPlan({ available: true, token: null, enabled: false }, origin)).toEqual({
      kind: 'enable',
    })
    expect(
      shareToolbarPlan({ available: true, token: 'A'.repeat(32), enabled: false }, origin),
    ).toEqual({ kind: 'enable' })
  })

  it('shares the live link on the origin the shopper is on', () => {
    const token = 'B'.repeat(32)
    expect(shareToolbarPlan({ available: true, token, enabled: true }, origin)).toEqual({
      kind: 'share',
      url: `${origin}/wishlist/shared/${token}`,
    })
  })
})

describe('restoreItem', () => {
  it('puts the product back where it was', () => {
    const items = [item('a'), item('c')]
    expect(restoreItem(items, item('b'), 1).map((i) => i.productId)).toEqual(['a', 'b', 'c'])
  })

  it('appends when its old neighbours are gone, and never duplicates', () => {
    const items = [item('a')]
    expect(restoreItem(items, item('z'), 9).map((i) => i.productId)).toEqual(['a', 'z'])
    expect(restoreItem(items, item('a'), 0).map((i) => i.productId)).toEqual(['a'])
  })
})

describe('the exit timing', () => {
  it('the fallback outlasts the stylesheet exit, and the name matches the CSS', () => {
    expect(WISHLIST_CARD_LEAVE_FALLBACK_MS).toBeGreaterThan(WISHLIST_CARD_LEAVE_MS)
    expect(WISHLIST_CARD_LEAVE_ANIMATION).toBe('wishlist-card-leave')
  })
})
