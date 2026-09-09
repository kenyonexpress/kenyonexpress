import { describe, expect, it } from 'vitest'
import { rightAlignedX, toVisual } from './hebrew'

/** Reverse the visual form back; a correct round trip returns the logical one. */
const rev = (s: string) => [...s].reverse().join('')

describe('a string with nothing right-to-left in it', () => {
  it('is returned untouched', () => {
    // Reversing twice is not the same as not reversing once neutrals are
    // involved, so the early exit is load-bearing rather than an optimisation.
    expect(toVisual('RR123456789IL')).toBe('RR123456789IL')
    expect(toVisual('1,234.56')).toBe('1,234.56')
    expect(toVisual('')).toBe('')
  })
})

describe('Hebrew is reversed, because a PDF viewer will not do it', () => {
  it('reverses a plain Hebrew word', () => {
    expect(toVisual('שלום')).toBe(rev('שלום'))
  })

  it('reverses the word order of a Hebrew sentence', () => {
    // The whole point: a reader sees the first logical word on the RIGHT.
    const visual = toVisual('דוח התחשבנות חודשי')
    expect(visual.startsWith(rev('חודשי'))).toBe(true)
    expect(visual.endsWith(rev('דוח'))).toBe(true)
  })
})

describe('numbers and Latin survive intact, which is the whole difficulty', () => {
  it('does not reverse a number embedded in Hebrew', () => {
    // `₪1,234.56` reversed is `65.432,1₪`. A money document that mangles its
    // own numbers is worse than one written in English.
    const visual = toVisual('סה"כ 1,234.56')
    expect(visual).toContain('1,234.56')
    expect(visual).not.toContain('65.432,1')
  })

  it('does not reverse a tracking number or a carrier name', () => {
    const visual = toVisual('שליח HFD מספר RR123456789IL')
    expect(visual).toContain('HFD')
    expect(visual).toContain('RR123456789IL')
  })

  it('keeps a date readable', () => {
    expect(toVisual('תאריך 2026-09-09')).toContain('2026-09-09')
  })

  it('puts the Latin run to the LEFT of the Hebrew that logically precedes it', () => {
    // "מוביל HFD" reads, on the page, HFD then מוביל going right to left --
    // which in a left-to-right byte string means the Latin comes first.
    const visual = toVisual('מוביל HFD')
    expect(visual.indexOf('HFD')).toBeLessThan(visual.indexOf(rev('מוביל')[0] as string))
  })
})

describe('mirrored punctuation', () => {
  it('swaps brackets inside a Hebrew run', () => {
    // `(סכום)` reversed without swapping renders `)םוכס(`, which every Hebrew
    // reader sees as broken and no test that only checked the letters would.
    const visual = toVisual('(סכום)')
    expect(visual.startsWith('(')).toBe(true)
    expect(visual.endsWith(')')).toBe(true)
  })

  it('leaves brackets around a Latin run alone', () => {
    expect(toVisual('שם (HFD)')).toContain('(HFD)')
  })
})

describe('the arithmetic that keeps a column straight', () => {
  const font = { widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5 }

  it('starts a string so that it ENDS at the right edge', () => {
    // pdf-lib positions from the left and every line in an RTL document is
    // aligned right. Doing this at each call site is how one column ends up two
    // points off from the others.
    expect(rightAlignedX(font, 'abcd', 10, 500)).toBe(500 - 20)
  })

  it('measures the logical text, so a caller may ask before reordering', () => {
    expect(rightAlignedX(font, 'שלום', 10, 100)).toBe(
      rightAlignedX(font, toVisual('שלום'), 10, 100),
    )
  })
})
