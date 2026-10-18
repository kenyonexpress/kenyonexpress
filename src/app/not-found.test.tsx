import { render, screen } from '@testing-library/react'
import NotFound, { metadata } from './not-found'

vi.mock('@/lib/category-page', () => ({
  getAllCategories: vi.fn(async () => [
    { slug: 'electronics', name_he: 'אלקטרוניקה' },
    { slug: 'fashion', name_he: 'אופנה' },
    { slug: 'home', name_he: 'בית' },
    { slug: 'sports', name_he: 'ספורט' },
    { slug: 'books', name_he: 'ספרים' },
    { slug: 'toys', name_he: 'צעצועים' },
    { slug: 'food', name_he: 'מזון' },
    { slug: 'beauty', name_he: 'יופי' },
  ]),
}))

describe('NotFound Page', () => {
  it('renders 404 heading', async () => {
    const { container } = render(await NotFound())
    const heading = screen.getByRole('heading', { name: /הדף שחיפשתם לא נמצא/ })
    expect(heading).toBeInTheDocument()
  })

  it('displays 404 text', async () => {
    const { container } = render(await NotFound())
    const text = screen.getByText(/404/, { selector: '[aria-hidden="true"]' })
    expect(text).toBeInTheDocument()
  })

  it('includes search bar form', async () => {
    const { container } = render(await NotFound())
    const form = container.querySelector('form[action="/search"]')
    expect(form).toBeInTheDocument()
  })

  it('search input has correct attributes', async () => {
    const { container } = render(await NotFound())
    const input = container.querySelector('input[name="q"]') as HTMLInputElement
    expect(input).toBeInTheDocument()
    expect(input.type).toBe('text')
    expect(input.placeholder).toBe('חפשו מוצר...')
  })

  it('search button exists and submits form', async () => {
    render(await NotFound())
    const button = screen.getByRole('button', { name: /חיפוש/ }) as HTMLButtonElement
    expect(button).toBeInTheDocument()
    expect(button.type).toBe('submit')
  })

  it('displays action buttons', async () => {
    render(await NotFound())
    expect(screen.getByRole('link', { name: /לכל המוצרים/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /עיון בקטגוריות/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /לדף הבית/ })).toBeInTheDocument()
  })

  it('action buttons have correct href values', async () => {
    const { container } = render(await NotFound())
    const actionButtonLinks = Array.from(container.querySelectorAll('a')).filter(
      (a) => !a.href.includes('/category/'),
    )
    const hrefs = actionButtonLinks.map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/products')
    expect(hrefs).toContain('/')
  })

  it('displays popular categories section', async () => {
    render(await NotFound())
    const categoryHeading = screen.getByRole('heading', { name: /קטגוריות פופולריות/ })
    expect(categoryHeading).toBeInTheDocument()
  })

  it('displays all 8 popular categories', async () => {
    const { container } = render(await NotFound())
    const categoryLinks = container.querySelectorAll('a[href^="/category/"]')
    expect(categoryLinks.length).toBe(8)
    const categoryTexts = Array.from(categoryLinks).map((link) => link.textContent)
    expect(categoryTexts.some((text) => text?.includes('אלקטרוניקה'))).toBe(true)
    expect(categoryTexts.some((text) => text?.includes('אופנה'))).toBe(true)
    expect(categoryTexts.some((text) => text?.includes('בית'))).toBe(true)
    expect(categoryTexts.some((text) => text?.includes('ספורט'))).toBe(true)
  })

  it('category links have correct href format', async () => {
    const { container } = render(await NotFound())
    const categoryLinks = container.querySelectorAll('a[href^="/category/"]')
    expect(categoryLinks.length).toBe(8)
    expect(categoryLinks[0]).toHaveAttribute('href', '/category/electronics')
  })

  it('page has RTL direction', async () => {
    const { container } = render(await NotFound())
    const main = container.querySelector('main')
    expect(main).toHaveAttribute('dir', 'rtl')
  })

  it('has proper metadata for SEO', () => {
    expect(metadata.title).toBe('הדף לא נמצא')
    expect(metadata.robots.index).toBe(false)
    expect(metadata.robots.follow).toBe(true)
  })
})
