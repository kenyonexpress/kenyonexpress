import type { Agorot } from '@/lib/money'

const AGOROT_PER_ILS = 100

/**
 * Renders an integer agorot amount as `₪1,234.56`.
 *
 * Built by integer division rather than by `agorotToIls`, so no money value is
 * ever a float even for the length of a format call: the whole shekels and the
 * agorot remainder are separated with `/` and `%` on the integer, and only the
 * already-whole shekel part is handed to Intl for thousands grouping. That
 * keeps the one rule this cart is built on ("integer agorot, end to end") true
 * of the display layer as well, and not merely of the arithmetic behind it.
 *
 * The glyph is written literally instead of using `Intl.NumberFormat`'s ILS
 * currency style, which emits directional marks around the sign. Inside an RTL
 * document those marks reorder a price sitting next to Hebrew text, and the
 * live site this page is measured against prints the bare glyph.
 */
export function shekels(value: Agorot): string {
  const negative = value < 0
  const absolute = Math.abs(value)
  const whole = Math.trunc(absolute / AGOROT_PER_ILS)
  const fraction = absolute % AGOROT_PER_ILS
  const grouped = whole.toLocaleString('he-IL', { useGrouping: true })
  return `${negative ? '-' : ''}₪${grouped}.${String(fraction).padStart(2, '0')}`
}

/**
 * The header badge's rounded form: whole shekels, no agorot.
 *
 * Rounds half-up on the integer rather than truncating, so a cart of ₪99.60
 * reads ₪100 and not ₪99.
 */
export function shekelsRounded(value: Agorot): string {
  if (value <= 0) return '₪0'
  const whole = Math.floor((value + AGOROT_PER_ILS / 2) / AGOROT_PER_ILS)
  return `₪${whole.toLocaleString('he-IL', { useGrouping: true })}`
}
