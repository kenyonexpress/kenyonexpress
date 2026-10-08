import { describe, expect, it } from 'vitest'
import { countGuideWords, guideExcerpt, parseGuideMarkdown } from './markdown'

/**
 * The three-shape markdown (STEP 65). Pinned: headings, bullets and blank-line
 * paragraphs become typed blocks; a paragraph's lines join; nothing else is
 * interpreted (HTML stays text); the word count ignores markers and counts
 * Hebrew, Latin and digits; the excerpt is the first paragraph cut on a word.
 */
describe('parseGuideMarkdown', () => {
  it('parses headings, paragraphs and lists in document order', () => {
    const blocks = parseGuideMarkdown(
      '## כותרת\n\nשורה ראשונה\nשורה שנייה\n\n- פריט א\n- פריט ב\n\nפסקה אחרונה',
    )
    expect(blocks).toEqual([
      { kind: 'heading', text: 'כותרת' },
      { kind: 'paragraph', text: 'שורה ראשונה שורה שנייה' },
      { kind: 'list', items: ['פריט א', 'פריט ב'] },
      { kind: 'paragraph', text: 'פסקה אחרונה' },
    ])
  })

  it('ends a paragraph at a bullet and a list at a plain line, and accepts * and CRLF', () => {
    const blocks = parseGuideMarkdown('פסקה\r\n* פריט\r\nעוד פסקה')
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'פסקה' },
      { kind: 'list', items: ['פריט'] },
      { kind: 'paragraph', text: 'עוד פסקה' },
    ])
  })

  it('keeps HTML as text and drops empty headings and bullets', () => {
    const blocks = parseGuideMarkdown('<script>x</script>\n\n## \n\n- \n\nטקסט')
    expect(blocks).toEqual([
      { kind: 'paragraph', text: '<script>x</script>' },
      { kind: 'paragraph', text: 'טקסט' },
    ])
  })

  it('returns nothing for blank input', () => {
    expect(parseGuideMarkdown('')).toEqual([])
    expect(parseGuideMarkdown('  \n\n  ')).toEqual([])
  })
})

describe('countGuideWords', () => {
  it('counts words across every block kind and ignores markers and punctuation', () => {
    expect(countGuideWords('## שתי מילים\n\nאחת, שתיים. three 4\n\n- פריט\n- עוד פריט')).toBe(9)
  })

  it('does not count bare punctuation or markers', () => {
    expect(countGuideWords('- -\n\n...  ,')).toBe(0)
  })
})

describe('guideExcerpt', () => {
  it('returns the first paragraph whole when it fits', () => {
    expect(guideExcerpt('## כותרת\n\nפסקה קצרה.\n\nעוד')).toBe('פסקה קצרה.')
  })

  it('cuts a long paragraph on a word boundary with an ellipsis', () => {
    const words = Array.from({ length: 60 }, (_, i) => `מילה${i}`).join(' ')
    const excerpt = guideExcerpt(words, 100)
    expect(excerpt).not.toBeNull()
    expect(excerpt?.length).toBeLessThanOrEqual(101)
    expect(excerpt?.endsWith('…')).toBe(true)
    expect(excerpt?.includes('מילה1 ')).toBe(true)
    // No half word: the text before the ellipsis is a whole token of the input.
    const last = excerpt?.slice(0, -1).split(' ').pop()
    expect(words.split(' ')).toContain(last)
  })

  it('is null without a paragraph', () => {
    expect(guideExcerpt('## רק כותרת\n\n- רק פריט')).toBeNull()
  })
})
