/**
 * Everything the four cards SAY, decided here and never inside the JSX that
 * draws them.
 *
 * The split is the one `lib/og/product-card.ts` already makes, for the reason
 * written out there: a mistake in these strings surfaces as a 1200x630 PNG on
 * the one surface nobody who ships it ever looks at. A pure function can be
 * asserted; a Satori render can only be squinted at.
 *
 * TWO SATORI CONSTRAINTS SHAPE EVERY STRING BELOW.
 *
 * There is no `text-overflow`, no line clamp and no ellipsis: text that does
 * not fit is drawn past the edge of the card and cropped by the PNG boundary
 * with nothing to show it was cut. So the clipping happens here, in characters,
 * at the length the template's type size actually holds.
 *
 * And there is no bidi algorithm worth relying on for punctuation. A neutral
 * character between two Hebrew runs is placed by glyph order rather than by
 * direction and lands on the wrong side of the word. Measured on the first
 * render of the home card, which is why that one carries no comma. Digits
 * inside a Hebrew run are fine (the shipped product card has quoted prices
 * since it was written); commas, dashes, colons and parentheses between two
 * Hebrew words are not, and none appear in the Hebrew this file builds.
 */

import { type OgCard, buildOgCard } from '@/lib/og/product-card'

export type { OgCard }
export { buildOgCard }

/**
 * Clips on a word boundary when one is near, hard otherwise.
 *
 * `lastSpace > 0` is load-bearing and is the one line that differs from the
 * copy in `lib/og/product-card.ts`. `lastIndexOf` answers -1 for a string with
 * no space in it, and `-1 > max - 12` is TRUE for any max below 11, so a
 * single long token got `slice(0, -1)`, one character short, silently. That
 * module's only limit is 60 so it never reached the case; this one has four
 * limits and no reason to inherit the trap.
 */
export function clip(value: string, max: number): string {
  const text = value.trim().replace(/\s+/g, ' ')
  if (text.length <= max) return text
  const hard = text.slice(0, max)
  const lastSpace = hard.lastIndexOf(' ')
  const cut = lastSpace > 0 && lastSpace > max - 12 ? hard.slice(0, lastSpace) : hard
  return `${cut.trimEnd()}…`
}

/** `₪1,240`. Same shape the product card and the Merchant feed already quote. */
export function shekels(value: number): string {
  return `₪${value.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

/*
 * Clip lengths, one per template, measured against the type size each string is
 * drawn at rather than shared. A single constant would be wrong three times.
 */
const CATEGORY_NAME_MAX = 40
const CATEGORY_DESC_MAX = 105
const DEAL_TITLE_MAX = 58
const BUSINESS_MAX = 34

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export interface CategoryCard {
  name: string
  description: string
  /** `48 מוצרים`. Null when the category is empty: a card must not boast zero. */
  countLabel: string | null
}

export function buildCategoryCard(input: {
  nameHe: string
  description: string
  total: number
}): CategoryCard {
  return {
    name: clip(input.nameHe, CATEGORY_NAME_MAX),
    description: clip(input.description, CATEGORY_DESC_MAX),
    countLabel: countLabel(input.total),
  }
}

function countLabel(total: number): string | null {
  if (!Number.isFinite(total) || total <= 0) return null
  if (total === 1) return 'מוצר אחד'
  return `${total} מוצרים`
}

// ---------------------------------------------------------------------------
// Deal
// ---------------------------------------------------------------------------

export interface DealCard {
  title: string
  business: string | null
  /** What the customer pays on this site. Null when no price is set. */
  price: string | null
  /** The sticker price, struck through, only when there is a real saving. */
  wasPrice: string | null
  /** `+ ₪180 בבית העסק`, only when a balance remains. */
  balance: string | null
  /** `90%-`, only when the saving is real. Null suppresses the badge. */
  discountBadge: string | null
  countdown: Countdown
}

export interface DealCardInput {
  titleHe: string
  businessName: string | null
  /** `coupon_deals.original_price`: the sticker price at the business. */
  originalPrice: number | null
  /** `coupon_deals.platform_price`: the ABSOLUTE amount charged online. */
  platformPrice: number | null
  /** `coupon_deals.discount_percentage`, when the column supplies one. */
  discountPercentage: number | null
  /** `coupon_deals.valid_until`. */
  validUntil: string | Date | null
  now?: Date
}

/**
 * THE PERCENTAGES ARE DERIVED, NEVER ASSUMED.
 *
 * `/coupons/[id]` carries a long note about this and it applies verbatim here:
 * `platform_price` is an absolute amount an admin sets, and the page that used
 * to print "(10%)" beside it was quoting a pricing model abolished on
 * 2026-07-24. Today's seed rows all happen to be a tenth of their sticker, so a
 * hardcoded 90% would be arithmetically true and invisibly wrong, until the
 * first deal that is not. A deal with no platform price is shown without one,
 * exactly as the card and the page do, rather than advertised at a number
 * nobody set.
 */
export function buildDealCard(input: DealCardInput): DealCard {
  const title = clip(input.titleHe, DEAL_TITLE_MAX)
  const business = input.businessName?.trim() ? clip(input.businessName, BUSINESS_MAX) : null
  const countdown = buildCountdown(input.validUntil, input.now ?? new Date())

  const original = finite(input.originalPrice)
  const platform = finite(input.platformPrice)

  if (platform === null || platform <= 0) {
    return {
      title,
      business,
      price: null,
      wasPrice: null,
      balance: null,
      discountBadge: null,
      countdown,
    }
  }

  const saving = original !== null && original > platform
  const percent =
    finite(input.discountPercentage) ??
    (saving && original !== null ? Math.round((1 - platform / original) * 100) : null)
  const balance = original !== null ? Math.round((original - platform) * 100) / 100 : null

  return {
    title,
    business,
    price: shekels(platform),
    // A strike-through on an equal number claims a saving that does not exist,
    // the same rule the Merchant feed applies to `g:sale_price`.
    wasPrice: saving && original !== null ? shekels(original) : null,
    balance: balance !== null && balance > 0 ? `+ ${shekels(balance)} בבית העסק` : null,
    discountBadge: percent !== null && percent > 0 ? `${Math.round(percent)}%-` : null,
    countdown,
  }
}

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ---------------------------------------------------------------------------
// The timer
// ---------------------------------------------------------------------------

/**
 * A PNG cannot count down, so the card states the remaining time AS OF THE
 * MOMENT IT WAS RENDERED and the route keeps its CDN lifetime short enough that
 * the statement stays true. That is the whole of the "timer". The alternative
 * (an absolute date) is what the page already shows, and the reason to put a
 * deadline on a share card at all is the urgency a duration carries and a date
 * does not.
 */
export type Countdown =
  | { kind: 'none'; label: string }
  | { kind: 'ended'; label: string }
  | { kind: 'left'; label: string; parts: string[] }

/**
 * `מסתיים בעוד` and not `נשארו`, deliberately: the lead has to agree with
 * every tail it can take, and Hebrew makes the verb agree with the number.
 * "נשארו יום אחד" is wrong, "נשאר 3 ימים" is wrong, and a card is not the place
 * to conjugate. "מסתיים בעוד" is correct in front of all of them.
 */
const LEAD = 'מסתיים בעוד'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function buildCountdown(validUntil: string | Date | null | undefined, now: Date): Countdown {
  const end = toDate(validUntil)
  if (!end) return { kind: 'none', label: 'מבצע לזמן מוגבל' }

  const remaining = end.getTime() - now.getTime()
  if (remaining <= 0) return { kind: 'ended', label: 'המבצע הסתיים' }

  const days = Math.floor(remaining / DAY)
  const hours = Math.floor((remaining % DAY) / HOUR)
  const minutes = Math.floor((remaining % HOUR) / MINUTE)

  // Two units at most. A card read at a glance gains nothing from seconds, and
  // three units is a line that has to shrink to fit.
  const parts =
    days > 0
      ? [
          plural(days, 'יום אחד', 'יומיים', 'ימים'),
          ...(hours > 0 ? [plural(hours, 'שעה אחת', 'שעתיים', 'שעות')] : []),
        ]
      : hours > 0
        ? [
            plural(hours, 'שעה אחת', 'שעתיים', 'שעות'),
            ...(minutes > 0 ? [plural(minutes, 'דקה אחת', 'שתי דקות', 'דקות')] : []),
          ]
        : [plural(Math.max(minutes, 1), 'דקה אחת', 'שתי דקות', 'דקות')]

  return { kind: 'left', label: LEAD, parts }
}

/**
 * Hebrew counts one and two in the noun rather than beside it: two days is
 * `יומיים`, not `2 ימים`. Both singular and dual carry the number inside the
 * word, so neither takes a digit.
 */
function plural(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  return `${n} ${many}`
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
