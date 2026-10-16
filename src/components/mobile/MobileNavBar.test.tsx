import { render, screen } from '@testing-library/react'
import { usePathname } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'
import MobileNavBar from './MobileNavBar'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

describe('MobileNavBar', () => {
  it('renders 5 navigation items', () => {
    vi.mocked(usePathname).mockReturnValue('/')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-home')).toBeInTheDocument()
    expect(screen.getByTestId('nav-categories')).toBeInTheDocument()
    expect(screen.getByTestId('nav-search')).toBeInTheDocument()
    expect(screen.getByTestId('nav-cart')).toBeInTheDocument()
    expect(screen.getByTestId('nav-account')).toBeInTheDocument()
  })

  it('marks home as active when pathname is /', () => {
    vi.mocked(usePathname).mockReturnValue('/')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-home')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-categories')).not.toHaveAttribute('aria-current')
  })

  it('marks categories as active when pathname starts with /category', () => {
    vi.mocked(usePathname).mockReturnValue('/category/electronics')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-categories')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-home')).not.toHaveAttribute('aria-current')
  })

  it('marks cart as active when pathname starts with /cart', () => {
    vi.mocked(usePathname).mockReturnValue('/cart')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-cart')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('nav-account')).not.toHaveAttribute('aria-current')
  })

  it('marks account as active when pathname starts with /account', () => {
    vi.mocked(usePathname).mockReturnValue('/account/settings')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-account')).toHaveAttribute('aria-current', 'page')
  })

  it('marks search as active when pathname is /search', () => {
    vi.mocked(usePathname).mockReturnValue('/search')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-search')).toHaveAttribute('aria-current', 'page')
  })

  it('has data-mobile-nav attribute for identification', () => {
    vi.mocked(usePathname).mockReturnValue('/')

    const { container } = render(<MobileNavBar />)

    expect(container.querySelector('[data-mobile-nav]')).toBeInTheDocument()
  })

  it('applies active styling with bg-brand when tab is active', () => {
    vi.mocked(usePathname).mockReturnValue('/cart')

    render(<MobileNavBar />)

    const activeTab = screen.getByTestId('nav-cart')
    expect(activeTab).toHaveClass('bg-brand')
    expect(activeTab).toHaveClass('text-gray-900')
  })

  it('applies inactive styling with hover effects when tab is not active', () => {
    vi.mocked(usePathname).mockReturnValue('/')

    render(<MobileNavBar />)

    const inactiveTab = screen.getByTestId('nav-categories')
    expect(inactiveTab).not.toHaveClass('bg-brand')
    expect(inactiveTab).toHaveClass('hover:bg-gray-50')
  })
})
