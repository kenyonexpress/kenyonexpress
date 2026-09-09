/**
 * THE BIDI PASS SATORI DOES NOT HAVE.
 *
 * MEASURED 2026-09-09, by fetching the PNGs and looking at them. All three
 * Open Graph cards this site produces render every Hebrew word BACKWARDS:
 *
 *   /opengraph-image                    "קניון אקספרס"  drawn as  "סרפסקא ןוינק"
 *   /product/<slug>/opengraph-image     "חבילת גלידה"   drawn as  "הדילג תליבח"
 *   the card added with SECTIONS 79     the same
 *
 * `next/og` renders through Satori, which lays glyphs out in LOGICAL order,
 * left to right, and does not implement the Unicode Bidirectional Algorithm.
 * `direction: 'rtl'` is set on all three cards and does nothing to text: it is
 * a flexbox property there, not a text one. So a Hebrew string arrives in
 * logical order, is drawn left to right, and comes out mirrored.
 *
 * WHY NOTHING CAUGHT IT. `og-fonts.test.ts` exists precisely because this
 * surface fails silently -- its own comment says "the only person who ever sees
 * the result is the recipient of somebody else's share" -- and it checks that
 * the FONT is present, because a missing font renders empty boxes. A present
 * font renders every glyph correctly and in the wrong order. The route answers
 * 200, the PNG is valid, the build is green, and the card is unreadable.
 *
 * WHAT THIS DOES. Reorders a logical-order string into the VISUAL order a
 * renderer with no bidi should be handed, for a base direction of RTL. It is
 * not the full UBA: no explicit embedding codes, no per-line reordering, no
 * combining-mark reordering. It covers what these cards contain -- Hebrew
 * prose, Latin words, prices and percentages -- and every case it covers is
 * asserted in `bidi.test.ts`.
 */

/** Hebrew, Arabic, and the Hebrew presentation forms. */
const RTL_CHAR = /[֐-׿؀-ۿ܀-ݏݐ-ݿיִ-ﭏﭐ-﷿ﹰ-﻿]/

/** Latin, Greek, Cyrillic: anything that is a letter and is not RTL. */
const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/

/**
 * A number and the signs that belong to it, as ONE atom that stays left to
 * right.
 *
 * This is a deliberate DEVIATION from the UBA, and the reason is in
 * `money-format.ts`. Under the real algorithm `₪` is an European Terminator,
 * it only joins a number it is directly adjacent to, and `23 ₪` in an RTL
 * paragraph therefore displays as `₪ 23` -- the sign on the wrong side. That is
 * the exact bug `repairPriceOrder` was written for, and the fix there is to
 * wrap the price in an LRI isolate. Satori honours no isolate, so the same
 * intent is expressed here instead: a number, an optional leading sign and an
 * optional trailing `₪` or `%` are one left-to-right run even across a space.
 *
 * The consequence is that a price on a card reads the same way round as the
 * price on the page it came from, which is the only comparison anybody makes.
 */
const NUMBER_ATOM = /[+\-]?\s?\d[\d.,]*(?:[  ]?[₪%])?/

/** Reversed for display; the pairs that would otherwise point the wrong way. */
const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
}

type Dir = 'rtl' | 'ltr' | 'neutral'

type Run = { dir: Dir; text: string }

/**
 * Split into runs of one direction each, with number atoms held together.
 *
 * Neutrals (spaces, punctuation) get their own runs here and are resolved in
 * the next pass, because a neutral's direction depends on what is on BOTH
 * sides of it and that is not knowable one character at a time.
 */
function tokenize(text: string): Run[] {
  const runs: Run[] = []
  let index = 0

  const push = (dir: Dir, chunk: string) => {
    const last = runs[runs.length - 1]
    if (last && last.dir === dir) last.text += chunk
    else runs.push({ dir, text: chunk })
  }

  while (index < text.length) {
    const rest = text.slice(index)

    // The number atom first, so `+ 120 ₪` is never split into three runs and
    // then reassembled backwards.
    const atom = rest.match(NUMBER_ATOM)
    if (atom && atom.index === 0 && atom[0].length > 0) {
      push('ltr', atom[0])
      index += atom[0].length
      continue
    }

    const char = text[index] as string
    if (RTL_CHAR.test(char)) push('rtl', char)
    else if (LTR_CHAR.test(char)) push('ltr', char)
    else push('neutral', char)
    index += 1
  }

  return runs
}

/**
 * A neutral run takes the direction of its neighbours when they agree, and the
 * base direction (RTL) otherwise.
 *
 * That is the UBA's N1/N2 rules, and the reason the space in `חבילת גלידה`
 * stays inside the Hebrew run instead of splitting it into two runs that then
 * get reordered into `גלידה חבילת`.
 */
function resolveNeutrals(runs: Run[]): Run[] {
  const out = runs.map((run) => ({ ...run }))

  for (let i = 0; i < out.length; i += 1) {
    const run = out[i] as Run
    if (run.dir !== 'neutral') continue

    const before = out
      .slice(0, i)
      .reverse()
      .find((r) => r.dir !== 'neutral')?.dir
    const after = out.slice(i + 1).find((r) => r.dir !== 'neutral')?.dir

    run.dir = before && before === after ? before : 'rtl'
  }

  // Merge what is now adjacent and equal, so a resolved space rejoins its run.
  const merged: Run[] = []
  for (const run of out) {
    const last = merged[merged.length - 1]
    if (last && last.dir === run.dir) last.text += run.text
    else merged.push({ ...run })
  }
  return merged
}

function reverseChars(text: string): string {
  // `Array.from` and not `split('')`: it iterates code POINTS, so a character
  // outside the BMP is moved whole instead of having its surrogate pair
  // reversed into an unpaired one.
  return Array.from(text)
    .reverse()
    .map((char) => MIRROR[char] ?? char)
    .join('')
}

/**
 * A logical-order string, in the visual order a left-to-right renderer with no
 * bidi should be handed, for a base direction of RTL.
 *
 * Pure and synchronous, so what every card says can be asserted as a string
 * rather than looked at as a picture.
 */
export function visualOrder(text: string): string {
  if (!text) return text
  // Nothing RTL in it: a Latin title, a domain, a bare price. Handing those
  // through the run machinery would be a no-op, and returning early makes that
  // a guarantee rather than a property of the rules above.
  if (!RTL_CHAR.test(text)) return text

  const runs = resolveNeutrals(tokenize(text))

  return runs
    .reverse()
    .map((run) => (run.dir === 'rtl' ? reverseChars(run.text) : run.text))
    .join('')
}
