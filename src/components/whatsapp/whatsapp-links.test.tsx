import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import OrderContactLink from './OrderContactLink'
import ProductQuestionLink from './ProductQuestionLink'

describe('whatsapp wa.me links', () => {
  it('product question links to wa.me with the product name', () => {
    const html = renderToStaticMarkup(<ProductQuestionLink productName="סדנת שוקולד" />)
    expect(html).toContain('https://wa.me/')
    expect(html).toContain(encodeURIComponent('סדנת שוקולד'))
  })
  it('order contact carries the short order id', () => {
    const html = renderToStaticMarkup(<OrderContactLink orderId="abcdef1234567890" />)
    expect(html).toContain('https://wa.me/')
    expect(html).toContain('ABCDEF12')
  })
})
