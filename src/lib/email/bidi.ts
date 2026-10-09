/**
 * Unicode-bidi helpers for the Hebrew transactional emails.
 *
 * The problem these solve: an order ref, a coupon code or a URL is an LTR run
 * inside an RTL sentence. Without explicit isolation the Unicode bidi
 * algorithm re-orders the neutral characters at its edges, so `KE-1234:` reads
 * as `:KE-1234`, a URL swallows the punctuation after it, and a code with a
 * hyphen renders its halves swapped. HTML bodies can say `dir="ltr"`, but the
 * plain-text body has no markup at all, and several mail clients strip `dir`
 * attributes while honouring inline styles. So:
 *
 * - Plain text gets real isolate characters, LRI (U+2066) … PDI (U+2069).
 *   They are invisible, are not valid URL characters (linkifiers stop before
 *   the PDI rather than including it), and every modern renderer implements
 *   UAX-9 isolates.
 * - HTML gets `dir="ltr"` AND `style="direction:ltr;unicode-bidi:isolate"`,
 *   because Outlook's Word engine ignores the attribute but keeps the style,
 *   and browsers that honour the attribute treat the style as a no-op.
 */

/** Left-to-right isolate. Opens an LTR run inside RTL text. */
export const LRI = '⁦'
/** Pop directional isolate. Closes what LRI opened. */
export const PDI = '⁩'

/**
 * Wrap an LTR token (ref, code, URL) for a plain-text body written in Hebrew.
 * Empty input comes back empty rather than as two invisible characters that
 * would defeat the `filter((line) => line !== '')` idiom the builders use.
 */
export function ltrText(value: string): string {
  if (value === '') return ''
  return `${LRI}${value}${PDI}`
}

/**
 * The inline style for an LTR run inside RTL HTML mail. Pair it with
 * `dir="ltr"` on the same element; the two are the same declaration for
 * clients that read attributes and clients that only read styles.
 */
export const LTR_ISOLATE_STYLE = 'direction:ltr;unicode-bidi:isolate'

/**
 * The inline style for the RTL containers themselves, same belt-and-braces
 * reasoning as above: `dir="rtl"` for clients that read markup, the style for
 * clients that only read CSS.
 */
export const RTL_ISOLATE_STYLE = 'direction:rtl;unicode-bidi:isolate'
