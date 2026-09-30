import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoryFilterSidebar from './CategoryFilterSidebar'

const push = vi.fn()
let search = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/category/spa',
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/category/CategoryAutocomplete', () => ({ default: () => null }))

const CATEGORIES = [
  { slug: 'spa', name_he: 'ספא' },
  { slug: 'pets', name_he: 'חיות מחמד' },
]

beforeEach(() => {
  push.mockReset()
  search = ''
})

/**
 * The two facets STEP 06 added, at the URL: which param each button writes,
 * that a change drops `page`, and that the brand widget is absent when the
 * archive has no brands (production today) rather than an empty heading.
 */
describe('CategoryFilterSidebar facets', () => {
  it('renders no brand widget when the archive has no brands', () => {
    render(<CategoryFilterSidebar categories={CATEGORIES} currentSlug="spa" />)
    expect(screen.queryByRole('heading', { name: 'מותג' })).toBeNull()
    expect(document.querySelector('[data-facet="brand"]')).toBeNull()
    // The discount facet is always there: it is a rule about prices, not data.
    expect(screen.getByRole('heading', { name: 'הנחה' })).toBeInTheDocument()
  })

  it('lists the brands with "all" first and writes ?brand= without page', () => {
    search = 'sort=price_asc&page=3'
    render(
      <CategoryFilterSidebar
        categories={CATEGORIES}
        currentSlug="spa"
        brands={['Apple', 'סמסונג']}
      />,
    )
    const widget = document.querySelector('[data-facet="brand"]') as HTMLElement
    const labels = [...widget.querySelectorAll('button')].map((b) => b.textContent)
    expect(labels).toEqual(['הכל', 'Apple', 'סמסונג'])
    expect(widget.querySelector('button[aria-pressed="true"]')?.textContent).toBe('הכל')

    fireEvent.click(screen.getByRole('button', { name: 'סמסונג' }))
    expect(push).toHaveBeenCalledWith(
      '/category/spa?sort=price_asc&brand=%D7%A1%D7%9E%D7%A1%D7%95%D7%A0%D7%92',
      {
        scroll: false,
      },
    )
  })

  it('keeps a selected brand the list no longer carries, so it can be cleared', () => {
    search = 'brand=Retired'
    render(
      <CategoryFilterSidebar
        categories={CATEGORIES}
        currentSlug="spa"
        brands={['Apple']}
        brand="Retired"
      />,
    )
    const widget = document.querySelector('[data-facet="brand"]') as HTMLElement
    const retired = within(widget).getByRole('button', { name: 'Retired' })
    expect(retired).toHaveAttribute('aria-pressed', 'true')

    // Scoped: the type widget has its own "all" button.
    fireEvent.click(within(widget).getByRole('button', { name: 'הכל' }))
    expect(push).toHaveBeenCalledWith('/category/spa', { scroll: false })
  })

  it('offers the four discount steps and writes ?discount=<n>', () => {
    render(<CategoryFilterSidebar categories={CATEGORIES} currentSlug="spa" minDiscount={20} />)
    const widget = document.querySelector('[data-facet="discount"]') as HTMLElement
    const buttons = [...widget.querySelectorAll('button')]
    expect(buttons).toHaveLength(5)
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
    ])
    // The digits are isolated (U+2066..U+2069) so "30%" reads left-to-right
    // inside the Hebrew label.
    expect(buttons[3]?.textContent).toBe('לפחות ⁦30%⁩ הנחה')

    fireEvent.click(buttons[4] as HTMLButtonElement)
    expect(push).toHaveBeenCalledWith('/category/spa?discount=50', { scroll: false })

    fireEvent.click(buttons[0] as HTMLButtonElement)
    expect(push).toHaveBeenLastCalledWith('/category/spa', { scroll: false })
  })

  it('a discount change keeps the other filters and drops the page', () => {
    search = 'type=coupon&min=10&page=2&discount=10'
    render(
      <CategoryFilterSidebar
        categories={CATEGORIES}
        currentSlug="spa"
        productType="coupon"
        priceMin={10}
        minDiscount={10}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'לפחות ⁦30%⁩ הנחה' }))
    expect(push).toHaveBeenCalledWith('/category/spa?type=coupon&min=10&discount=30', {
      scroll: false,
    })
  })
})
