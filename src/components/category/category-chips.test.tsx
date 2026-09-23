import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import CategoryChips from './CategoryChips'

const cats = [
  { slug: 'hot-deals', name_he: 'דילים חמים' },
  { slug: 'spa', name_he: 'ספא' },
]

describe('category chips', () => {
  it('links every chip to a real URL', () => {
    const html = renderToStaticMarkup(<CategoryChips categories={cats} />)
    expect(html).toContain('href="/products"')
    expect(html).toContain('href="/category/hot-deals"')
    expect(html).toContain('href="/category/spa"')
  })

  it('marks exactly the current category, and "all" when none is current', () => {
    const on = renderToStaticMarkup(<CategoryChips categories={cats} currentSlug="spa" />)
    expect(on.match(/aria-current="page"/g)).toHaveLength(1)
    expect(on).toMatch(/aria-current="page"[^>]*>ספא/)
    const all = renderToStaticMarkup(<CategoryChips categories={cats} />)
    expect(all).toMatch(
      /href="\/products"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/products"/,
    )
  })

  it('renders nothing when there are no categories', () => {
    expect(renderToStaticMarkup(<CategoryChips categories={[]} />)).toBe('')
  })
})
