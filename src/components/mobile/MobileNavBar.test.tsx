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
    expect(screen.getByTestId('nav-wishlist')).toBeInTheDocument()
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

  it('marks wishlist as active when pathname starts with /account/wishlist', () => {
    vi.mocked(usePathname).mockReturnValue('/account/wishlist')

    render(<MobileNavBar />)

    expect(screen.getByTestId('nav-wishlist')).toHaveAttribute('aria-current', 'page')
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
})
