import type { PreferenceRow } from '@/lib/notifications/preferences'

/**
 * The four shelves of the notifications center, and which kind sits on which.
 *
 * WHY CATEGORIES ARE A TYPESCRIPT MAPPING AND NOT A COLUMN. `notifications`
 * (198, applied) carries the outbox `kind` and nothing coarser, and its rows
 * are written by the `outbox_bell_fanout` trigger (231) and by
 * `fn_refresh_loyalty_tier` (261, pending). A `category` column would need
 * both writers changed, a migration nobody has approved, and a backfill of the
 * rows already there. A mapping over `kind` costs none of that, works on the
 * rows in production today, and can be re-shelved without touching data.
 *
 * `system` IS THE FALLBACK, DELIBERATELY. A kind added to the outbox after this
 * file lands on the system shelf until somebody shelves it, which is visible
 * (it shows up under the wrong tab) rather than silent (it vanishes). The
 * test pins every kind the bell can carry today to a named shelf, so the
 * fallback is only ever reached by a kind this file has never heard of.
 *
 * MUTES LIVE IN `notification_preferences`, UNDER A RESERVED KIND. The table
 * is keyed (user_id, kind, channel), `kind` is unconstrained text, and the
 * `in_app` channel already exists in its CHECK. A category mute is the row
 * `kind = 'category:<name>', channel = 'in_app', enabled = false`. No new
 * table, no new policy: the own-row RLS 198 wrote already scopes it. The
 * prefix cannot collide with an outbox kind because the outbox CHECK has
 * never admitted a colon.
 *
 * A MUTE HIDES, IT DOES NOT DELETE. The trigger keeps writing rows for a muted
 * category; the bell, the badge and the center stop showing them, and they
 * come back the moment the mute is lifted. It also governs ONLY the in-app
 * surface: the email that carries a coupon, the receipt and the refund notice
 * are required kinds (preferences.ts) on their own channels and are untouched
 * by anything here.
 */

export const CATEGORIES = ['orders', 'deals', 'account', 'system'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL_HE: Record<Category, string> = {
  orders: 'הזמנות',
  deals: 'מבצעים',
  account: 'חשבון',
  system: 'מערכת',
}

/** One sentence per shelf for the mute card. */
export const CATEGORY_HINT_HE: Record<Category, string> = {
  orders: 'תשלום, משלוח, מסירה, קופונים שהונפקו או מומשו, החזרים',
  deals: 'ירידת מחיר וחזרה למלאי של פריטים ששמרת',
  account: 'ברוכים הבאים, קאשבק לארנק, דרגת מועדון',
  system: 'הודעות שאינן שייכות לאף מדף אחר',
}

/**
 * Which kinds sit on which shelf. `system` has no list: it is where a kind
 * lands when it is on none of these.
 */
export const CATEGORY_KINDS: Record<Exclude<Category, 'system'>, readonly string[]> = {
  orders: [
    'order_paid',
    'order_shipped',
    'order_delivered',
    'refund_completed',
    'voucher_issued',
    'voucher_gifted',
    'voucher_redeemed',
    'voucher_expiring',
    'gift_card_issued',
  ],
  deals: ['price_drop', 'back_in_stock'],
  account: ['welcome', 'cashback_credited', 'loyalty_tier_upgraded'],
}

/** Every kind with a named shelf, in shelf order. */
export const KNOWN_KINDS: readonly string[] = [
  ...CATEGORY_KINDS.orders,
  ...CATEGORY_KINDS.deals,
  ...CATEGORY_KINDS.account,
]

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export function categoryOf(kind: string): Category {
  for (const category of ['orders', 'deals', 'account'] as const) {
    if (CATEGORY_KINDS[category].includes(kind)) return category
  }
  return 'system'
}

export const MUTE_KIND_PREFIX = 'category:'

/** The `notification_preferences.kind` that stores a category mute. */
export function muteKind(category: Category): string {
  return `${MUTE_KIND_PREFIX}${category}`
}

/** The categories the stored rows have muted. Absent rows are "not muted". */
export function mutedCategories(rows: readonly PreferenceRow[]): Category[] {
  const muted = new Set<Category>()
  for (const row of rows) {
    if (row.channel !== 'in_app' || row.enabled) continue
    if (!row.kind.startsWith(MUTE_KIND_PREFIX)) continue
    const name = row.kind.slice(MUTE_KIND_PREFIX.length)
    if (isCategory(name)) muted.add(name)
  }
  return CATEGORIES.filter((c) => muted.has(c))
}

/**
 * What the in-app surface must NOT show, as a shape both a PostgREST filter
 * and a client-side event handler can apply.
 *
 * Two sources fold into one answer: the category mutes, and the per-kind
 * `in_app` switches the settings matrix has offered since 198 (and which
 * nothing honoured until now; the trigger does not read the table). When the
 * fallback shelf is muted the list has to be an allow-list, because "every
 * kind not on a named shelf" cannot be spelled as an exclusion.
 */
export interface KindExclusion {
  /** Kinds hidden outright. Empty when `only` is set. */
  hide: string[]
  /** When set, ONLY these kinds are shown. Set iff `system` is muted. */
  only: string[] | null
}

export function kindExclusion(rows: readonly PreferenceRow[]): KindExclusion {
  const muted = new Set(mutedCategories(rows))
  const perKindOff = new Set(
    rows
      .filter((r) => r.channel === 'in_app' && !r.enabled && !r.kind.startsWith(MUTE_KIND_PREFIX))
      .map((r) => r.kind),
  )
  const hiddenByShelf = (kind: string) => muted.has(categoryOf(kind))

  if (muted.has('system')) {
    return {
      hide: [],
      only: KNOWN_KINDS.filter((kind) => !hiddenByShelf(kind) && !perKindOff.has(kind)),
    }
  }
  const hide = new Set<string>(perKindOff)
  for (const kind of KNOWN_KINDS) if (hiddenByShelf(kind)) hide.add(kind)
  return { hide: [...hide], only: null }
}

export function isKindVisible(kind: string, exclusion: KindExclusion): boolean {
  if (exclusion.only) return exclusion.only.includes(kind)
  return !exclusion.hide.includes(kind)
}

export const NO_EXCLUSION: KindExclusion = { hide: [], only: null }

export interface CategoryCount {
  total: number
  unread: number
}

/** Per-shelf totals over a list of rows, every shelf present even at zero. */
export function countByCategory(
  rows: readonly { kind: string; read_at: string | null }[],
): Record<Category, CategoryCount> {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, { total: 0, unread: 0 }])) as Record<
    Category,
    CategoryCount
  >
  for (const row of rows) {
    const bucket = counts[categoryOf(row.kind)]
    bucket.total += 1
    if (!row.read_at) bucket.unread += 1
  }
  return counts
}
