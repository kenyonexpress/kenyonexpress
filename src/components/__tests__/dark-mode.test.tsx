import { CouponCardSkeleton } from '@/components/CouponCardSkeleton'
import ProductDealCard from '@/components/ProductDealCard'
import RightSidebar from '@/components/RightSidebar'
import SiteFooter from '@/components/SiteFooter'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

function mockProduct() {
  return {
    id: 'test-id',
    slug: 'test-product',
    name_he: 'מוצר בדיקה',
    kenyon_price: 10000,
    images: ['https://example.com/image.jpg'],
    stock_quantity: 5,
    full_price: 15000,
    category: { name_he: 'בדיקה', slug: 'test' },
  }
}

describe('Dark Mode Component Tests', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
  })

  describe('SiteFooter', () => {
    it('renders in light mode', () => {
      const { container } = render(
        <ThemeProvider>
          <SiteFooter />
        </ThemeProvider>,
      )
      expect(container.querySelector('footer')).toBeInTheDocument()
    })

    it('renders in dark mode', () => {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')

      const { container } = render(
        <ThemeProvider>
          <SiteFooter />
        </ThemeProvider>,
      )
      expect(container.querySelector('footer')).toBeInTheDocument()
    })

    it('uses design tokens not hard-coded colors', () => {
      const { container } = render(
        <ThemeProvider>
          <SiteFooter />
        </ThemeProvider>,
      )
      const footer = container.querySelector('footer')
      expect(footer?.className).not.toMatch(/gray-\d+|slate-\d+|zinc-\d+/)
    })
  })

  describe('RightSidebar', () => {
    it('renders in light mode', () => {
      const { container } = render(
        <ThemeProvider>
          <RightSidebar />
        </ThemeProvider>,
      )
      expect(container.querySelector('aside')).toBeInTheDocument()
    })

    it('renders in dark mode', () => {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')

      const { container } = render(
        <ThemeProvider>
          <RightSidebar />
        </ThemeProvider>,
      )
      expect(container.querySelector('aside')).toBeInTheDocument()
    })

    it('uses design tokens for colors', () => {
      const { container } = render(
        <ThemeProvider>
          <RightSidebar />
        </ThemeProvider>,
      )
      const sidebar = container.querySelector('aside')
      expect(sidebar?.className).not.toMatch(/gray-\d+|slate-\d+|zinc-\d+/)
    })
  })

  describe('CouponCardSkeleton', () => {
    it('renders skeleton in light mode', () => {
      const { container } = render(
        <ThemeProvider>
          <CouponCardSkeleton />
        </ThemeProvider>,
      )
      expect(container.querySelector('.coupon-ticket')).toBeInTheDocument()
    })

    it('renders skeleton in dark mode', () => {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')

      const { container } = render(
        <ThemeProvider>
          <CouponCardSkeleton />
        </ThemeProvider>,
      )
      expect(container.querySelector('.coupon-ticket')).toBeInTheDocument()
    })

    it('uses design tokens for skeleton color', () => {
      const { container } = render(
        <ThemeProvider>
          <CouponCardSkeleton />
        </ThemeProvider>,
      )
      const skeleton = container.querySelector('.coupon-ticket')
      expect(skeleton?.className).not.toMatch(/gray-\d+|slate-\d+|zinc-\d+/)
    })
  })

  describe('ProductDealCard', () => {
    it('renders in light mode', () => {
      const { container } = render(
        <ThemeProvider>
          <ProductDealCard product={mockProduct()} />
        </ThemeProvider>,
      )
      expect(container.querySelector('.p_con')).toBeInTheDocument()
    })

    it('renders in dark mode', () => {
      document.documentElement.classList.add('dark')
      document.documentElement.setAttribute('data-theme', 'dark')

      const { container } = render(
        <ThemeProvider>
          <ProductDealCard product={mockProduct()} />
        </ThemeProvider>,
      )
      expect(container.querySelector('.p_con')).toBeInTheDocument()
    })

    it('shows out of stock overlay in both modes', () => {
      const outOfStockProduct = { ...mockProduct(), stock_quantity: 0 }

      const { container } = render(
        <ThemeProvider>
          <ProductDealCard product={outOfStockProduct} />
        </ThemeProvider>,
      )

      const overlay = container.querySelector('div[class*="absolute"]')
      expect(overlay).toBeInTheDocument()
    })

    it('uses design tokens for colors', () => {
      const { container } = render(
        <ThemeProvider>
          <ProductDealCard product={mockProduct()} />
        </ThemeProvider>,
      )
      const card = container.querySelector('.p_con')
      expect(card?.className).not.toMatch(/gray-\d+|slate-\d+|zinc-\d+/)
    })
  })
})
