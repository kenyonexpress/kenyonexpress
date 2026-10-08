import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The buyer guide section (STEP 65). Pinned: nothing without a guide; with
 * one, an H2 (the title, else the default with the category name), the
 * markdown-lite as H3 / paragraphs / a list, text never injected as markup,
 * and the source stamped on the section for the parity gate to read.
 */
const mock = vi.hoisted(() => ({ guide: null as unknown }))

vi.mock('@/lib/category-guides/read', () => ({
  getCategoryGuide: async () => mock.guide,
}))

const { default: CategoryBuyerGuide } = await import('./CategoryBuyerGuide')

const category = { id: 'c1', slug: 'spa', name_he: 'ספא' }

async function render() {
  return renderToStaticMarkup(await CategoryBuyerGuide({ category }))
}

beforeEach(() => {
  mock.guide = null
})

describe('CategoryBuyerGuide', () => {
  it('renders nothing without a guide or with an empty body', async () => {
    expect(await render()).toBe('')
    mock.guide = { title_he: null, body_md: '   ', source: 'row' }
    expect(await render()).toBe('')
  })

  it('renders the heading, sections, paragraphs and list from the markdown', async () => {
    mock.guide = {
      title_he: null,
      body_md: 'פתיח.\n\n## מה לבדוק\n\n- פריט א\n- פריט ב\n\nסיום.',
      source: 'authored',
    }
    const html = await render()
    expect(html).toContain('data-testid="category-buyer-guide"')
    expect(html).toContain('data-guide-source="authored"')
    expect(html).toContain('<h2 id="category-guide-title"')
    expect(html).toContain('מדריך קנייה: ספא')
    expect(html).toContain('<h3')
    expect(html).toContain('מה לבדוק')
    expect(html).toMatch(/<ul[^>]*><li>פריט א<\/li><li>פריט ב<\/li><\/ul>/)
    expect(html).toContain('<p')
    expect(html).toContain('סיום.')
    expect(html).toContain('dir="rtl"')
  })

  it('uses the row title and escapes markup in the body', async () => {
    mock.guide = {
      title_he: 'איך לבחור ספא',
      body_md: '<img src=x onerror=alert(1)> טקסט',
      source: 'row',
    }
    const html = await render()
    expect(html).toContain('איך לבחור ספא')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
