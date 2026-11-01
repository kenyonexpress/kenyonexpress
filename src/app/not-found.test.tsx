import { render, screen } from '@testing-library/react'
import NotFound, { metadata } from './not-found'

describe('NotFound Page', () => {
  it('renders 404 heading', () => {
    render(<NotFound />)
    const heading = screen.getByRole('heading', { name: /הדף שחיפשתם לא נמצא/ })
    expect(heading).toBeInTheDocument()
  })

  it('displays 404 text', () => {
    render(<NotFound />)
    const text = screen.getByText(/404/, { selector: '[aria-hidden="true"]' })
    expect(text).toBeInTheDocument()
  })

  it('displays action buttons', () => {
    render(<NotFound />)
    expect(screen.getByRole('link', { name: /לכל המוצרים/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /עיון בקטגוריות/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /לדף הבית/ })).toBeInTheDocument()
  })

  it('action buttons have correct href values', () => {
    const { container } = render(<NotFound />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/products')
    expect(hrefs).toContain('/')
  })

  it('page has RTL direction', () => {
    const { container } = render(<NotFound />)
    const main = container.querySelector('main')
    expect(main).toHaveAttribute('dir', 'rtl')
  })

  it('has proper metadata for SEO', () => {
    expect(metadata.title).toBe('404 - הדף לא נמצא')
    expect(metadata.robots.index).toBe(false)
    expect(metadata.robots.follow).toBe(true)
  })
})
