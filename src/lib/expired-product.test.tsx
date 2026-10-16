import ExpiredProduct from '@/components/product/ExpiredProduct'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Mock ProductCard since it requires client context
vi.mock('@/components/ProductCard', () => ({
  default: ({ product }: { product: { slug: string; name_he: string } }) => (
    <div className="product-card">{product.name_he}</div>
  ),
}))

describe('ExpiredProduct component', () => {
  it('renders the expired product hero with ribbon', () => {
    const product = {
      id: 'test-1',
      slug: 'expired-deal',
      name_he: 'מבצע ישן',
      kenyon_price: 100,
      full_price: 200,
      images: ['test.jpg'],
      category: { name_he: 'קטגוריה', slug: 'category' },
    }

    const html = renderToStaticMarkup(<ExpiredProduct product={product} similarProducts={[]} />)

    expect(html).toContain('מבצע ישן')
    expect(html).toContain('המבצע הסתיים')
    expect(html).toContain('₪100')
    expect(html).toContain('₪200')
  })

  it('renders similar products grid', () => {
    const product = {
      id: 'test-1',
      slug: 'expired-deal',
      name_he: 'מבצע ישן',
      kenyon_price: 100,
      full_price: 200,
      images: ['test.jpg'],
      category: { name_he: 'קטגוריה', slug: 'category' },
    }

    const similarProducts = [
      {
        id: 'sim-1',
        slug: 'similar-1',
        name_he: 'מוצר דומה 1',
        kenyon_price: 150,
        full_price: 250,
        images: [],
        stock_quantity: 10,
        category: { name_he: 'קטגוריה', slug: 'category' },
      },
      {
        id: 'sim-2',
        slug: 'similar-2',
        name_he: 'מוצר דומה 2',
        kenyon_price: 120,
        full_price: 220,
        images: [],
        stock_quantity: 5,
        category: { name_he: 'קטגוריה', slug: 'category' },
      },
    ]

    const html = renderToStaticMarkup(
      <ExpiredProduct product={product} similarProducts={similarProducts} />,
    )

    expect(html).toContain('המבצע הזה כבר לא זמין')
    expect(html).toContain('3 מבצעים דומים')
    expect(html).toContain('מוצר דומה 1')
    expect(html).toContain('מוצר דומה 2')
  })

  it('renders category link when there are similar products', () => {
    const product = {
      id: 'test-1',
      slug: 'expired-deal',
      name_he: 'מבצע ישן',
      kenyon_price: 100,
      full_price: 200,
      images: ['test.jpg'],
      category: { name_he: 'קטגוריה', slug: 'category' },
    }

    const similarProducts = [
      {
        id: 'sim-1',
        slug: 'similar-1',
        name_he: 'מוצר דומה',
        kenyon_price: 150,
        full_price: 250,
        images: [],
        stock_quantity: 10,
        category: { name_he: 'קטגוריה', slug: 'category' },
      },
    ]

    const html = renderToStaticMarkup(
      <ExpiredProduct product={product} similarProducts={similarProducts} />,
    )

    expect(html).toMatch(/href.*\/category\/category/)
    expect(html).toContain('לכל המבצעים בקטגוריה')
  })

  it('handles products without category', () => {
    const product = {
      id: 'test-1',
      slug: 'expired-deal',
      name_he: 'מבצע ישן',
      kenyon_price: 100,
      full_price: null,
      images: [],
      category: null,
    }

    const html = renderToStaticMarkup(<ExpiredProduct product={product} similarProducts={[]} />)

    expect(html).toContain('מבצע ישן')
    expect(html).toContain('המבצע הסתיים')
  })
})
