import { t } from '@/lib/i18n/messages'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ProductQuestionLink from './ProductQuestionLink'

/**
 * Server render only: `useEffect` does not run, so the href is exactly what the
 * page handed in and the hydration-safe first paint is what is asserted.
 */
describe('the product question link', () => {
  it('dials the supplier when the page resolved one, and says so under the link', () => {
    const html = renderToStaticMarkup(
      <ProductQuestionLink
        productName="עיסוי שוודי"
        productId="p1"
        ask={{ href: 'https://wa.me/972521111111?text=hi', via: 'supplier' }}
      />,
    )
    expect(html).toContain('href="https://wa.me/972521111111?text=hi"')
    expect(html).toContain('data-via="supplier"')
    expect(html).toContain(t('contact.askBusiness'))
    expect(html).toContain(t('contact.viaSupplier'))
    expect(html).not.toContain(t('contact.viaStore'))
  })

  it('falls back to customer service with the fallback explained', () => {
    const html = renderToStaticMarkup(
      <ProductQuestionLink
        productName="עיסוי שוודי"
        ask={{ href: 'https://wa.me/972524635550?text=q', via: 'customer_service' }}
      />,
    )
    expect(html).toContain('href="https://wa.me/972524635550?text=q"')
    expect(html).toContain('data-via="customer_service"')
    expect(html).toContain(t('contact.productQuestion'))
    expect(html).toContain(t('contact.viaStore'))
  })

  it('without a resolved target still reaches the store number with the product named', () => {
    const html = renderToStaticMarkup(<ProductQuestionLink productName="תיק עור" />)
    expect(html).toMatch(/href="https:\/\/wa\.me\/972\d+\?text=/)
    expect(decodeURIComponent(html)).toContain('תיק עור')
    expect(html).toContain('data-via="customer_service"')
  })

  it('opens a chat the customer sends, never a phone call', () => {
    const html = renderToStaticMarkup(<ProductQuestionLink productName="x" />)
    expect(html).not.toContain('tel:')
    expect(html).toContain('target="_blank"')
  })
})
