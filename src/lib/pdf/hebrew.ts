/**
 * Drawing Hebrew into a PDF, which needs two things a browser does for free.
 *
 * WHY THIS EXISTS
 *
 * `src/lib/coupons/qr-pdf.ts` already says half of it: "pdf-lib's standard
 * fonts are WinAnsi-encoded and cannot draw Hebrew". That file solved it by
 * having nothing Hebrew to draw. A supplier's monthly settlement statement
 * cannot take that route -- it is a document a supplier hands to their
 * bookkeeper, and it has to be in Hebrew.
 *
 * The second half is worse than encoding, because it fails quietly.
 * `drawText` paints glyphs left to right in the order the string holds them.
 * A browser reorders Hebrew for display; a PDF viewer does not, because the
 * PDF already IS the display. So Hebrew written logically comes out mirrored,
 * and the output looks like text, which is exactly why it survives review.
 *
 * WHAT `toVisual` DOES, AND WHAT IT DOES NOT
 *
 * It reverses runs of right-to-left text and leaves everything else alone,
 * which is the part of UAX#9 a settlement statement actually needs:
 *
 *   - Hebrew runs are reversed.
 *   - Digits are NOT. `₪1,234.56` reversed is `65.432,1₪`, and a money
 *     document that mangles its own numbers is worse than one in English.
 *   - Latin runs are NOT, so `HFD` and `RR123456789IL` survive intact.
 *   - Mirrored punctuation -- brackets, parentheses -- is swapped inside an
 *     RTL run, because `(סכום)` reversed without swapping renders `)םוכס(`.
 *
 * IT IS NOT A BIDI IMPLEMENTATION. It has no notion of embedding levels,
 * explicit direction marks, or paragraph direction resolution. It assumes the
 * paragraph is RTL, which is true of every string this codebase draws into a
 * PDF. Anything more general belongs in a library, and pulling one in for a
 * one-page statement would be the larger mistake.
 */

/** Hebrew block, plus the presentation forms nothing here should produce. */
const RTL = /[֐-׿‏יִ-ﭏ]/
/** Latin letters and digits: strong LTR for this module's purposes. */
const LTR = /[A-Za-z0-9]/
const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
}

type Direction = 'rtl' | 'ltr' | 'neutral'

function directionOf(char: string): Direction {
  if (RTL.test(char)) return 'rtl'
  if (LTR.test(char)) return 'ltr'
  return 'neutral'
}

/**
 * Reorder a logically-ordered RTL string into the visual order a PDF needs.
 *
 * The paragraph is assumed RTL. Runs are emitted right to left; an LTR run
 * keeps its own internal order, which is what leaves numbers and Latin reading
 * correctly while the Hebrew around them flows the other way.
 *
 * A neutral -- a space, a comma, a bracket -- has no direction of its own, and
 * which run it belongs to depends on what is on BOTH sides of it. That is why
 * the work happens in three passes rather than one walk: see the comments
 * inline, and the `שם (HFD)` case in the tests, which the one-pass version got
 * wrong in a way that looked like text.
 */
export function toVisual(text: string): string {
  if (!text) return ''
  // A string with no RTL character at all is left completely alone. A pure
  // Latin heading or a bare number must not be touched, and reversing twice is
  // not the same as not reversing when neutrals are involved.
  if (!RTL.test(text)) return text

  // 1. Classify. Neutrals stay neutral for now; which run they belong to is
  //    decided by what is on BOTH sides of them, so it cannot be answered
  //    while walking forwards one character at a time. That was the bug this
  //    replaces: attaching every neutral to the run before it put the `(` of
  //    `שם (HFD)` into the Hebrew run, where it mirrored to `)` and produced
  //    `HFD)) םש`.
  const chars = [...text]
  const dirs: Direction[] = chars.map(directionOf)

  // 2. Resolve neutrals. A neutral span between two runs of the SAME direction
  //    takes that direction -- which is what keeps the space between two Hebrew
  //    words, and the decimal point inside a number, attached to their
  //    neighbours. Between DIFFERENT directions, and at either end of the line,
  //    it takes the paragraph direction, which here is always RTL. That is
  //    UAX#9's rule and it is what puts the parentheses of `שם (HFD)` on the
  //    RTL level, so they mirror as a pair and end up around HFD.
  for (let i = 0; i < dirs.length; i++) {
    if (dirs[i] !== 'neutral') continue
    let j = i
    while (j < dirs.length && dirs[j] === 'neutral') j++
    // `noUncheckedIndexedAccess` is on. Both ends default to the paragraph
    // direction anyway -- a neutral at the start or end of a line takes it --
    // so the fallback is the rule rather than an appeasement of the type.
    const before: Direction = (i > 0 ? dirs[i - 1] : 'rtl') ?? 'rtl'
    const after: Direction = (j < dirs.length ? dirs[j] : 'rtl') ?? 'rtl'
    const resolved: Direction = before === after ? before : 'rtl'
    for (let k = i; k < j; k++) dirs[k] = resolved
    i = j - 1
  }

  // 3. Group into runs of one direction.
  const runs: { dir: Direction; text: string }[] = []
  for (let i = 0; i < chars.length; i++) {
    const last = runs[runs.length - 1]
    if (last && last.dir === dirs[i]) last.text += chars[i]
    else runs.push({ dir: dirs[i] as Direction, text: chars[i] as string })
  }

  // 4. Visual order for an RTL paragraph: runs right to left, LTR runs keeping
  //    their own internal order, RTL runs reversed with their brackets swapped.
  return runs
    .reverse()
    .map((run) =>
      run.dir === 'ltr'
        ? run.text
        : [...run.text]
            .reverse()
            .map((c) => MIRROR[c] ?? c)
            .join(''),
    )
    .join('')
}

/**
 * The width a string will occupy, measured on the LOGICAL text.
 *
 * Reordering does not change which glyphs are drawn, so measuring before or
 * after gives the same number -- but callers reach for this while laying out,
 * before they have called `toVisual`, and a helper that quietly required the
 * visual form would be a trap.
 */
export function textWidth(
  font: { widthOfTextAtSize(text: string, size: number): number },
  text: string,
  size: number,
): number {
  return font.widthOfTextAtSize(text, size)
}

/**
 * Where to start drawing so the text ENDS at `rightEdge`.
 *
 * pdf-lib positions from the left, and every line in an RTL document is
 * aligned to the right. Doing this arithmetic at each call site is how one
 * column ends up two points off from the others.
 */
export function rightAlignedX(
  font: { widthOfTextAtSize(text: string, size: number): number },
  text: string,
  size: number,
  rightEdge: number,
): number {
  return rightEdge - textWidth(font, text, size)
}
