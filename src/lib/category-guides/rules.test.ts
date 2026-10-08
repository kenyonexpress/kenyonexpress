import { describe, expect, it } from 'vitest'
import { guideHeading, isMissingGuideSchema, resolveGuide } from './rules'

/**
 * The one choice a category page makes about its guide (STEP 65): the row
 * wins; an unpublished row hides everything, the authored text included; no
 * row falls back to the authored text; and the absent table reads as "no
 * row" by code or by message.
 */
const row = (overrides: Record<string, unknown> = {}) => ({
  category_id: 'c1',
  title_he: ' כותרת ',
  body_md: ' גוף ',
  is_published: true,
  ...overrides,
})
const authored = { title_he: null, body_md: 'מובנה' }

describe('resolveGuide', () => {
  it('prefers the row, trimmed, and marks the source', () => {
    expect(resolveGuide(row(), authored, 'c1')).toEqual({
      category_id: 'c1',
      title_he: 'כותרת',
      body_md: 'גוף',
      is_published: true,
      source: 'row',
    })
  })

  it('hides everything for an unpublished or blank row', () => {
    expect(resolveGuide(row({ is_published: false }), authored, 'c1')).toBeNull()
    expect(resolveGuide(row({ body_md: '   ' }), authored, 'c1')).toBeNull()
  })

  it('falls back to the authored text without a row, and to nothing without either', () => {
    expect(resolveGuide(null, authored, 'c9')).toMatchObject({
      category_id: 'c9',
      body_md: 'מובנה',
      source: 'authored',
    })
    expect(resolveGuide(null, null, 'c9')).toBeNull()
  })

  it('blanks an empty row title so the default heading applies', () => {
    expect(resolveGuide(row({ title_he: '  ' }), authored, 'c1')?.title_he).toBeNull()
  })
})

describe('guideHeading', () => {
  it('uses the title, else the default with the category name', () => {
    expect(guideHeading({ title_he: 'שלי' }, 'ספא')).toBe('שלי')
    expect(guideHeading({ title_he: null }, 'ספא')).toBe('מדריך קנייה: ספא')
  })
})

describe('isMissingGuideSchema', () => {
  it('recognises the table and column codes and the PostgREST message', () => {
    expect(isMissingGuideSchema({ code: '42P01' })).toBe(true)
    expect(isMissingGuideSchema({ code: 'PGRST205' })).toBe(true)
    expect(isMissingGuideSchema({ code: '42703' })).toBe(true)
    expect(
      isMissingGuideSchema({ message: "Could not find the table 'public.category_guides'" }),
    ).toBe(true)
    expect(isMissingGuideSchema({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingGuideSchema(null)).toBe(false)
  })
})
