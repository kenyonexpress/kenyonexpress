import { describe, expect, it } from 'vitest'
import { visualOrder } from './bidi'

/**
 * The property every case below is really asserting: reading the OUTPUT right
 * to left gives back the input. That is what "correct" means for a string
 * handed to a renderer that draws left to right with no bidi, and asserting it
 * as a string is the only way this surface gets checked at all -- the
 * alternative is looking at a PNG that nobody looks at.
 */
const MIRROR: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[' }

function readRightToLeft(visual: string): string {
  return Array.from(visual)
    .reverse()
    .map((char) => MIRROR[char] ?? char)
    .join('')
}

/** Plain character reversal, for expectations written compositionally. */
function rev(text: string): string {
  return Array.from(text).reverse().join('')
}

describe('pure Hebrew', () => {
  it('is reversed, so it draws the right way round', () => {
    // The measured defect: the site card said "סרפסקא ןוינק".
    expect(visualOrder('קניון אקספרס')).toBe('סרפסקא ןוינק')
  })

  it('reads back as the original', () => {
    const input = 'חבילת גלידה'
    expect(readRightToLeft(visualOrder(input))).toBe(input)
  })

  it('keeps the words in order, not just the letters', () => {
    // A per-word reversal would give `תליבח הדילג`, which reads back as
    // `גלידה חבילת` - every letter right and the sentence backwards.
    expect(visualOrder('חבילת גלידה')).toBe('הדילג תליבח')
  })
})

describe('pure Latin', () => {
  it('is left alone', () => {
    expect(visualOrder('kenyonexpress.co.il')).toBe('kenyonexpress.co.il')
  })

  it('is left alone even with punctuation and digits', () => {
    expect(visualOrder('Heebo 400/700')).toBe('Heebo 400/700')
  })
})

describe('prices', () => {
  it('leaves a bare price untouched', () => {
    // `shekelsFromIlsCompactPlain` emits digits-then-sign, authored for a
    // left-to-right isolate. Satori draws left to right, so it is already the
    // right way round and must not be moved.
    expect(visualOrder('23 ₪')).toBe('23 ₪')
  })

  it('keeps a price the right way round inside a Hebrew sentence', () => {
    // The product card's `balance` field, verbatim.
    const visual = visualOrder('+ 120 ₪ בבית העסק')

    // The sign, the digits and the currency stay ONE left-to-right piece.
    // Under the real UBA the space detaches `₪` from the number and it lands on
    // the far side of it; that is exactly the bug `repairPriceOrder` exists for.
    expect(visual).toContain('+ 120 ₪')

    // The Hebrew is reversed and sits to the LEFT of the price, so reading the
    // line right to left gives the price first and then the words.
    expect(visual).toBe(`${rev(' בבית העסק')}+ 120 ₪`)
  })

  it('does not split a price into three runs and reassemble it backwards', () => {
    expect(visualOrder('המחיר הוא 99 ₪ בלבד')).toContain('99 ₪')
  })
})

describe('mixed Hebrew and Latin', () => {
  it('puts the Latin run on the left and keeps it readable', () => {
    const visual = visualOrder('בקרו באתר kenyonexpress')
    expect(visual).toContain('kenyonexpress')
    expect(visual.indexOf('kenyonexpress')).toBe(0)
  })

  it('reads back as the original once the Latin run is read forwards', () => {
    // `kenyonexpress` is one atom in the output; reversing the whole string
    // would reverse it too, so the check reverses the runs, not the characters.
    const visual = visualOrder('בקרו באתר kenyonexpress')
    expect(visual).toBe(`kenyonexpress ${visualOrder('בקרו באתר').trimEnd()}`.trim())
  })
})

describe('neutrals between two Hebrew runs', () => {
  it('stay between them rather than moving to an end', () => {
    const input = 'צימרים, מלונות ונופש'
    expect(readRightToLeft(visualOrder(input))).toBe(input)
  })

  it('handles the arrow the category card draws between trail names', () => {
    const input = 'צימרים ← צפון'
    expect(readRightToLeft(visualOrder(input))).toBe(input)
  })
})

describe('brackets are mirrored', () => {
  it('so a parenthesis points the right way after reordering', () => {
    const visual = visualOrder('דיל (מוגבל)')
    // Read right to left the opening bracket must still come first.
    expect(readRightToLeft(visual)).toBe('דיל (מוגבל)')
  })
})

describe('degenerate input', () => {
  it.each(['', ' ', '...', '2026'])('%p survives unchanged', (input) => {
    expect(visualOrder(input)).toBe(input)
  })

  it('does not break a surrogate pair', () => {
    // Reversing by UTF-16 code unit would split the pair into two lone
    // surrogates, which render as replacement characters.
    const visual = visualOrder('דיל 🎁')
    expect(visual).toContain('🎁')
    expect(visual).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })
})
