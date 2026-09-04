import type { Agorot } from '@/lib/money'

const AGOROT_PER_ILS = 100

/**
 * The one way this project renders money, and the reason it is only one.
 *
 * There were SIX functions called `shekels` in `src/`, and they did not agree
 * on what they took. Three read agorot (`lib/cart/format`, the redeem page, the
 * admin reports page) and three read shekels (admin analytics, `SalesChart`,
 * `lib/admin/payouts`). Same name, same output, opposite contracts -- so moving
 * a value between two of those screens, or copying one call, was a silent 100x
 * error waiting to be made, and the header of the cart's own formatter records
 * that this project has already paid for exactly that once: four components
 * each had a private formatter that assumed shekels, the builder underneath
 * returned agorot, and two wrongs agreed on screen for weeks.
 *
 * So: agorot in, always, at every call site. The three that genuinely hold
 * shekels now call theirs `shekelsFromIls`, which cannot be confused with this.
 *
 * INTEGER IN, INTEGER OUT. Built by integer division rather than by
 * `agorotToIls`, so no money value is ever a float even for the length of a
 * format call: the whole shekels and the agorot remainder are separated with
 * `/` and `%` on the integer, and only the already-whole shekel part is handed
 * to Intl for thousands grouping. That keeps "integer agorot, end to end" true
 * of the display layer as well, and not merely of the arithmetic behind it. Two
 * of the copies this replaced did `agorot / 100` and formatted the float.
 *
 * ============================================================================
 * THE SHEKEL SIGN GOES TO THE RIGHT OF THE DIGITS, AND GETTING THERE TOOK AN
 * ISOLATE. Measured in Chromium on 2026-09-04, each candidate rendered inside
 * the Hebrew sentence "עד ... בלבד" in a `dir="rtl"` document, comparing the x
 * of the glyph against the x of the first digit:
 *
 *   what was emitted        where the sign landed
 *   ----------------------  ----------------------------------------------
 *   ₪20.00                  LEFT of the digits   <- what this used to emit
 *   Intl he-IL/ILS          LEFT of the digits   <- and so does Intl's own
 *   20.00 ₪ (plain space)   LEFT of the digits   <- the trap
 *   20.00₪  (no space)      RIGHT of the digits
 *   LRI 20.00 ₪ PDI         RIGHT of the digits  <- what this emits now
 *
 * Row one is the reported defect. Row two is why "just use Intl.NumberFormat
 * with he-IL and ILS" does not fix it: Intl emits `RLM 99.00 NBSP RLM ₪`, and
 * in an RTL paragraph that lays the sign out to the left of the number exactly
 * like the old string did.
 *
 * Row three is the important one. Adding a space between the number and the
 * sign hands the bidi algorithm a neutral character to resolve, and it resolves
 * it against the RTL paragraph -- the sign migrates back across the digits and
 * the fix silently undoes itself. That is the migration the isolate prevents:
 * U+2066 LRI ... U+2069 PDI pins the whole price to one left-to-right run, so
 * the space is safe and no surrounding text can reorder it.
 *
 * The isolate characters are zero-width and invisible. They ARE part of
 * `textContent`, which is why `shekelsPlain` exists below.
 * ============================================================================
 */
/** U+2066 LEFT-TO-RIGHT ISOLATE. */
const LRI = '\u2066'
/** U+2069 POP DIRECTIONAL ISOLATE. */
const PDI = '\u2069'
/** U+00A0. Inside the isolate, so it cannot be resolved against the paragraph. */
const NBSP = '\u00a0'

/** The digits and the sign, with no isolate. Everything shared lives here. */
function shekelBody(value: Agorot, withFraction: boolean): string {
  const negative = value < 0
  const absolute = Math.abs(value)
  const whole = Math.trunc(absolute / AGOROT_PER_ILS)
  const fraction = absolute % AGOROT_PER_ILS
  const grouped = whole.toLocaleString('he-IL', { useGrouping: true })
  const digits = withFraction ? `${grouped}.${String(fraction).padStart(2, '0')}` : grouped
  return `${negative ? '-' : ''}${digits}${NBSP}₪`
}

/** Wrap a price so no surrounding text can reorder it. See the note above. */
function isolate(body: string): string {
  return `${LRI}${body}${PDI}`
}

export function shekels(value: Agorot): string {
  return isolate(shekelBody(value, true))
}

/**
 * The same price with the isolate characters stripped.
 *
 * For anywhere the string is not laid out by a bidi algorithm and the invisible
 * characters would be noise rather than help: a CSV cell, a log line, a test
 * assertion, an `aria-label` read aloud. Never for markup a browser renders --
 * that is what `shekels` is for, and the whole point of it.
 */
export function shekelsPlain(value: Agorot): string {
  return shekelBody(value, true)
}

export function shekelsRounded(value: Agorot): string {
  if (value <= 0) return isolate(`0${NBSP}₪`)
  const whole = Math.floor((value + AGOROT_PER_ILS / 2) / AGOROT_PER_ILS)
  return isolate(`${whole.toLocaleString('he-IL', { useGrouping: true })}${NBSP}₪`)
}

/**
 * Shekels in, for the `..._ils` columns that were never migrated to agorot.
 *
 * DELIBERATELY NOT CALLED `shekels`. That name belongs to the agorot formatter
 * above, and two functions with one name and opposite units is the 100x error
 * this repo has already paid for once -- six of them, three reading agorot and
 * three reading shekels, all called `shekels`.
 *
 * Four private copies of this existed (`lib/admin/payouts`,
 * `lib/commerce/coupon-offer`, `lib/og/product-card`, `lib/share/message`) plus
 * roughly twenty inline `₪${n.toLocaleString('he-IL')}` template literals across
 * the admin console and two customer pages. Every one of them wrote the sign
 * first, so every one of them rendered it on the wrong side of the number. They
 * all call this now, and the bidi fix reaches all of them at once.
 *
 * It takes a float because those columns hold one. That is a real defect and a
 * separate one -- the money path is integer agorot and this is the display edge
 * of the tables that predate the rule -- so this is the ONE function here
 * allowed a float, and it is allowed it only to print.
 */
export function shekelsFromIls(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  const safe = Number.isFinite(n) ? n : 0
  const digits = safe.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return isolate(`${digits}${NBSP}₪`)
}

/** `shekelsFromIls` with no agorot: whole shekels, for dense admin tables. */
export function shekelsFromIlsRounded(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  const safe = Number.isFinite(n) ? Math.round(n) : 0
  return isolate(`${safe.toLocaleString('he-IL', { useGrouping: true })}${NBSP}₪`)
}

/**
 * `shekelsFromIls` with the isolate characters stripped.
 *
 * For the outputs that are NOT laid out by a bidi algorithm and where two
 * invisible codepoints are noise or worse: an RSS description, an OG image
 * rendered to a canvas, a PassKit field, a CSV cell, a log line. The digits
 * still come before the sign -- that part is the convention, not the isolate.
 */
export function shekelsFromIlsPlain(value: number | string | null | undefined): string {
  return shekelsFromIls(value).replaceAll(LRI, '').replaceAll(PDI, '')
}

/** Whole shekels, no agorot, no isolate. `399 ₪`, not `399.00 ₪`. */
export function shekelsFromIlsPlainRounded(value: number | string | null | undefined): string {
  return shekelsFromIlsRounded(value).replaceAll(LRI, '').replaceAll(PDI, '')
}

/**
 * `399 ₪`, not `399.00 ₪`. Agorot appear only when the price has them.
 *
 * The share message and the OG card both quote a price inside a sentence rather
 * than in a column, and a trailing `.00` reads as clutter there. Both modules
 * carried this rule privately (`minimumFractionDigits: 0`) and the first sweep
 * onto the shared formatter silently promoted them to two decimals -- caught by
 * their own tests, which is what those tests are for.
 */
export function shekelsFromIlsCompact(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  const safe = Number.isFinite(n) ? n : 0
  const digits = safe.toLocaleString('he-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return isolate(`${digits}${NBSP}₪`)
}

/** `shekelsFromIlsCompact` with no isolate, for an RSS body or an OG canvas. */
export function shekelsFromIlsCompactPlain(value: number | string | null | undefined): string {
  return shekelsFromIlsCompact(value).replaceAll(LRI, '').replaceAll(PDI, '')
}

/**
 * REPAIR A LEGACY SIGN-FIRST PRICE INSIDE A STRING THAT CAME FROM THE DATABASE.
 *
 * Category names are live's own content and arrive from the `categories` table,
 * so the codebase does not own their text. One of them is `עד ₪99`, which puts
 * the sign to the LEFT of the digits for the same bidi reason every hardcoded
 * price did -- and it renders on /products, on /category/* and in every facet
 * sidebar, where `e2e/price-bidi.spec.ts` measured it at x=1259 against a digit
 * at x=1270.
 *
 * Correcting the row is a production data change, which this project does not
 * make without approval; `migrations/pending/171_category_name_shekel_order.sql`
 * is the draft, and it is not applied. Until it is, this repairs the string at
 * the render edge, which is also the safer place: a category name typed into
 * the admin form tomorrow gets the same treatment without anybody remembering
 * this rule.
 *
 * It rewrites ONLY the exact shape `₪<digits>`. A label with no price in it
 * comes back untouched, and so does one already written the right way round.
 */
export function repairPriceOrder(text: string): string {
  return text.replace(/₪\s?(\d[\d,]*(?:\.\d+)?)/g, (_, digits) => isolate(`${digits}${NBSP}₪`))
}
