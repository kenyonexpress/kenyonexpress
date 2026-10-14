import { sharedWishlistPath } from '@/lib/wishlist/share-token'
import type { WishlistShareState, WishlistViewItem } from '@/server/actions/wishlist'

/**
 * The wishlist page's words and small decisions (UX20), kept out of the
 * component so they can be pinned by a plain test: the count line, the
 * move-all label, what the live region says after a move or a removal, how
 * long ago a product was saved, and what the toolbar's share button is
 * allowed to do in each share state.
 */

export const WISHLIST_CARD_LEAVE_MS = 240
/** Fallback when no stylesheet animates the exit (tests, a failed CSS load). */
export const WISHLIST_CARD_LEAVE_FALLBACK_MS = 450
export const WISHLIST_CARD_LEAVE_ANIMATION = 'wishlist-card-leave'

export function savedCountLabel(count: number): string {
  if (count === 1) return 'מוצר אחד שמור'
  return `${count} מוצרים שמורים`
}

export function moveAllLabel(count: number): string {
  return `העברת הכל לסל (${count})`
}

export function movedAnnouncement(name: string): string {
  return `${name} עבר לסל`
}

export function movedManyAnnouncement(count: number): string {
  if (count === 1) return 'מוצר אחד עבר לסל'
  return `${count} מוצרים עברו לסל`
}

export function removedAnnouncement(name: string): string {
  return `${name} הוסר מהרשימה`
}

export function restoredAnnouncement(name: string): string {
  return `${name} חזר לרשימה`
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * "נשמר היום" / "נשמר אתמול" / "נשמר לפני N ימים" up to a month, then the
 * date. `now` is a parameter so the words are deterministic under test, and
 * the label is rendered only after the client read, never on the server, so
 * the browser's own clock is the right one to pass.
 */
export function savedAgoLabel(savedAt: string, now: Date = new Date()): string | null {
  const then = new Date(savedAt)
  if (Number.isNaN(then.getTime())) return null
  const days = Math.floor((now.getTime() - then.getTime()) / DAY_MS)
  if (days <= 0) return 'נשמר היום'
  if (days === 1) return 'נשמר אתמול'
  if (days < 31) return `נשמר לפני ${days} ימים`
  return `נשמר ב-${then.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })}`
}

/** The items the "move all" button may send: live and in stock. */
export function movableItems(items: readonly WishlistViewItem[]): WishlistViewItem[] {
  return items.filter((item) => item.available)
}

export type ShareToolbarPlan =
  /** 248 not applied: the button explains instead of pretending. */
  | { kind: 'unavailable'; message: string }
  /** No link yet (or switched off): one press mints / re-enables and then shares. */
  | { kind: 'enable' }
  /** A live link: one press shares or copies it. */
  | { kind: 'share'; url: string }

export const SHARE_UNAVAILABLE_MESSAGE = 'שיתוף הרשימה עוד לא פתוח. נסו שוב בקרוב.'

/**
 * What one press of the toolbar's "שיתוף" does. `origin` is the browser's
 * `window.location.origin`, read at click time like the card below it, so a
 * preview deployment never hands out a production link.
 */
export function shareToolbarPlan(share: WishlistShareState, origin: string): ShareToolbarPlan {
  if (!share.available) return { kind: 'unavailable', message: SHARE_UNAVAILABLE_MESSAGE }
  if (share.token && share.enabled) {
    return { kind: 'share', url: `${origin}${sharedWishlistPath(share.token)}` }
  }
  return { kind: 'enable' }
}

export const SHARE_TEXT = 'הנה המוצרים ששמרתי בקניון Express:'
export const LINK_COPIED = 'הקישור הועתק'

/** Put an item back where it was; append when its old neighbours are gone. */
export function restoreItem(
  items: readonly WishlistViewItem[],
  item: WishlistViewItem,
  index: number,
): WishlistViewItem[] {
  if (items.some((i) => i.productId === item.productId)) return [...items]
  const at = Math.min(Math.max(index, 0), items.length)
  return [...items.slice(0, at), item, ...items.slice(at)]
}
