import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProductQuestionLink from './ProductQuestionLink'

describe('ProductQuestionLink', () => {
  it('is a click-to-chat wa.me link that names the product', () => {
    const html = renderToStaticMarkup(<ProductQuestionLink productName="תיק עור" productId="p1" />)
    expect(html).toContain('https://wa.me/')
    expect(html).toContain(encodeURIComponent('תיק עור'))
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('data-testid="product-question-link"')
  })
})
