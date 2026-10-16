import { render, screen } from '@testing-library/react'
import Breadcrumbs, { type BreadcrumbItem } from './Breadcrumbs'

describe('Breadcrumbs', () => {
  it('renders breadcrumb items with links', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'קטגוריה', href: '/category/test' },
      { label: 'מוצר', href: undefined },
    ]

    render(<Breadcrumbs items={items} />)

    expect(screen.getByText('עמוד הבית')).toBeInTheDocument()
    expect(screen.getByText('קטגוריה')).toBeInTheDocument()
    expect(screen.getByText('מוצר')).toBeInTheDocument()

    const homeLink = screen.getByRole('link', { name: 'עמוד הבית' })
    expect(homeLink).toHaveAttribute('href', '/')

    const categoryLink = screen.getByRole('link', { name: 'קטגוריה' })
    expect(categoryLink).toHaveAttribute('href', '/category/test')
  })

  it('marks the last item as current page', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'מוצר', href: undefined },
    ]

    render(<Breadcrumbs items={items} />)

    const productItem = screen.getByText('מוצר').closest('li')
    expect(productItem).toHaveAttribute('aria-current', 'page')
  })

  it('renders separator between items on desktop', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'קטגוריה', href: '/category/test' },
    ]

    const { container } = render(<Breadcrumbs items={items} />)

    const separators = container.querySelectorAll('.breadcrumbs__sep')
    expect(separators.length).toBe(1) // Only one separator between two items
    expect(separators[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('hides middle items on mobile with ellipsis when showEllipsis is true', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'קטגוריה', href: '/category/test' },
      { label: 'תת-קטגוריה', href: '/category/test/sub' },
      { label: 'מוצר', href: undefined },
    ]

    const { container } = render(<Breadcrumbs items={items} showEllipsis={true} />)

    // Check that middle items have hidden-mobile class
    const middleItems = container.querySelectorAll('.breadcrumbs__item--hidden-mobile')
    expect(middleItems.length).toBe(2) // Category and subcategory

    // Check ellipsis is rendered
    const ellipsis = container.querySelector('.breadcrumbs__ellipsis')
    expect(ellipsis).toBeInTheDocument()
    expect(ellipsis).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not hide items when showEllipsis is false', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'קטגוריה', href: '/category/test' },
      { label: 'תת-קטגוריה', href: '/category/test/sub' },
      { label: 'מוצר', href: undefined },
    ]

    const { container } = render(<Breadcrumbs items={items} showEllipsis={false} />)

    // Check that no items have hidden-mobile class
    const hiddenItems = container.querySelectorAll('.breadcrumbs__item--hidden-mobile')
    expect(hiddenItems.length).toBe(0)

    // Check ellipsis is not rendered
    const ellipsis = container.querySelector('.breadcrumbs__ellipsis')
    expect(ellipsis).not.toBeInTheDocument()
  })

  it('does not truncate when there are only 2 items', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'מוצר', href: undefined },
    ]

    const { container } = render(<Breadcrumbs items={items} showEllipsis={true} />)

    // Check that no items have hidden-mobile class
    const hiddenItems = container.querySelectorAll('.breadcrumbs__item--hidden-mobile')
    expect(hiddenItems.length).toBe(0)

    // Check ellipsis is not rendered
    const ellipsis = container.querySelector('.breadcrumbs__ellipsis')
    expect(ellipsis).not.toBeInTheDocument()
  })

  it('applies custom className', () => {
    const items: BreadcrumbItem[] = [{ label: 'عرض المنزل', href: '/' }]

    const { container } = render(<Breadcrumbs items={items} className="custom-class" />)

    const nav = container.querySelector('nav')
    expect(nav).toHaveClass('custom-class')
  })

  it('sets dir="rtl" for Hebrew content', () => {
    const items: BreadcrumbItem[] = [{ label: 'עמוד הבית', href: '/' }]

    const { container } = render(<Breadcrumbs items={items} />)

    const nav = container.querySelector('nav')
    expect(nav).toHaveAttribute('dir', 'rtl')
  })

  it('renders aria-label for accessibility', () => {
    const items: BreadcrumbItem[] = [{ label: 'עמוד הבית', href: '/' }]

    const { container } = render(<Breadcrumbs items={items} />)

    const nav = container.querySelector('nav')
    expect(nav).toHaveAttribute('aria-label', 'נתיב ניווט')
  })

  it('does not render separator after last item', () => {
    const items: BreadcrumbItem[] = [
      { label: 'עמוד הבית', href: '/' },
      { label: 'קטגוריה', href: '/category/test' },
      { label: 'מוצר', href: undefined },
    ]

    const { container } = render(<Breadcrumbs items={items} />)

    const separators = container.querySelectorAll('.breadcrumbs__sep')
    expect(separators.length).toBe(2) // Between items, not after last
  })

  it('handles full breadcrumb path: Home > Category > Subcategory > Product', () => {
    const items: BreadcrumbItem[] = [
      { label: 'בית', href: '/' },
      { label: 'טלפונים', href: '/category/phones' },
      { label: 'טלפונים חכמים', href: '/category/phones/smartphones' },
      { label: 'iPhone 15 Pro', href: undefined },
    ]

    render(<Breadcrumbs items={items} />)

    expect(screen.getByRole('link', { name: 'בית' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'טלפונים' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'טלפונים חכמים' })).toBeInTheDocument()
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()

    const currentItem = screen.getByText('iPhone 15 Pro').closest('li')
    expect(currentItem).toHaveAttribute('aria-current', 'page')
  })

  it('renders list semantically correct', () => {
    const items: BreadcrumbItem[] = [
      { label: 'בית', href: '/' },
      { label: 'מוצר', href: undefined },
    ]

    const { container } = render(<Breadcrumbs items={items} />)

    const list = container.querySelector('.breadcrumbs__list')
    expect(list).toBeInTheDocument()

    const listItems = container.querySelectorAll('.breadcrumbs__item')
    expect(listItems.length).toBe(2)
  })

  it('only shows ellipsis once in truncated state', () => {
    const items: BreadcrumbItem[] = [
      { label: 'בית', href: '/' },
      { label: 'קטגוריה', href: '/category/test' },
      { label: 'תת-קטגוריה', href: '/category/test/sub' },
      { label: 'מוצר', href: undefined },
    ]

    const { container } = render(<Breadcrumbs items={items} showEllipsis={true} />)

    const ellipsis = container.querySelectorAll('.breadcrumbs__ellipsis')
    expect(ellipsis.length).toBe(1)
  })
})
